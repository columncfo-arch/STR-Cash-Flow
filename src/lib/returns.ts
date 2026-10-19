// What a property returns on the money in it.
//
// Cash flow answers "did it pay its way this year". These answer the questions
// underneath that: what the asset yields regardless of how it was financed
// (cap rate), what the cash put in is earning (cash-on-cash), and whether the
// income covers the debt by enough for a lender to refinance it (DSCR).
//
// The one thing to get right here is that this app keeps property tax and
// insurance *inside* the mortgage payment, where the rest of the world keeps
// them in operating expenses. Net operating income is before debt service but
// after tax and insurance — so taking revenue less operating expenses and
// calling it NOI would overstate it by the whole escrow, and overstate cap rate
// with it. Every figure below is built from `noi`, which takes them out.

/** What one year of the forecast is worth knowing about, before financing. */
export interface YearCosts {
  grossRevenue: number;
  platformFees: number;
  operatingExpenses: number;
  /**
   * Property tax and insurance for the year, separated out of the mortgage
   * payment. Null where there is not enough loan or escrow detail to separate
   * them, in which case there is no honest NOI to report.
   */
  taxesInsurance: number | null;
}

/**
 * Net operating income: what the property earns before anything is paid to a
 * lender, and so what it earns to whoever owns it outright.
 *
 * Null where tax and insurance cannot be separated from the payment. A figure
 * that silently left them in would read 20–30% high on a typical unit and make
 * every cap rate built on it wrong in the flattering direction.
 */
export function noi(year: YearCosts): number | null {
  if (year.taxesInsurance == null) return null;
  return year.grossRevenue - year.platformFees - year.operatingExpenses - year.taxesInsurance;
}

/**
 * Cap rate: NOI over what the property is worth.
 *
 * Deliberately ignores the mortgage — two owners of the same building with
 * different loans have the same cap rate, which is what makes it the number to
 * compare against other buildings. It is not a measure of how the deal is
 * doing for you; cash-on-cash is.
 *
 * A short-let caveat worth knowing: market cap rates are quoted on stabilised
 * NOI net of management. Running it yourself and taking no fee makes this read
 * a few points higher than a comparable building's quoted rate.
 */
export function capRatePct(annualNoi: number | null, propertyValue: number): number | null {
  if (annualNoi == null || propertyValue <= 0) return null;
  return (annualNoi / propertyValue) * 100;
}

/**
 * Cash-on-cash: the year's cash flow over the cash actually put in.
 *
 * The one that answers "what is my money earning", because it is the only one
 * of these that knows about the mortgage. A heavily financed property can show
 * a modest cap rate and a strong cash-on-cash, or the reverse.
 */
export function cashOnCashPct(annualCashFlow: number, cashInvested: number): number | null {
  if (cashInvested <= 0) return null;
  return (annualCashFlow / cashInvested) * 100;
}

/**
 * Debt service coverage: NOI over the principal and interest due.
 *
 * The number a lender asks for, and the reason it is here rather than only the
 * three the owner asked for — it decides whether the property can be
 * refinanced, and it moves before cash flow does. Below 1.0 the property does
 * not cover its own loan; most lenders want 1.20 or better on a short let.
 */
export function dscr(annualNoi: number | null, annualDebtService: number): number | null {
  if (annualNoi == null || annualDebtService <= 0) return null;
  return annualNoi / annualDebtService;
}

/** How a coverage ratio reads, on the bands a lender would use. */
export function dscrStatus(ratio: number | null): { label: string; color: string } {
  if (ratio == null) return { label: '—', color: 'text-slate-900' };
  if (ratio >= 1.25) return { label: 'Comfortable', color: 'text-emerald-600' };
  if (ratio >= 1.0) return { label: 'Thin', color: 'text-amber-600' };
  return { label: 'Short', color: 'text-red-600' };
}

/**
 * What the property is worth, and what is still owed on it, n years out.
 *
 * Appreciation compounds on the value; the balance comes from the amortisation
 * schedule rather than a straight line, because early payments are nearly all
 * interest and a straight line would promise equity that has not been built.
 */
export function equityAt(
  propertyValue: number, appreciationPct: number, loanBalance: number, yearsFromNow: number,
): { value: number; owed: number; equity: number } {
  const value = propertyValue * Math.pow(1 + appreciationPct / 100, yearsFromNow);
  return { value, owed: loanBalance, equity: value - loanBalance };
}

/**
 * Equity gained over a span, split into the two things that build it.
 *
 * Worth separating because they are not the same promise: paydown is
 * contractual and happens whatever the market does, while appreciation is a
 * forecast about a market nobody controls. An owner reading one number cannot
 * tell how much of it is the bank's schedule and how much is a guess.
 */
export function equityGain(
  from: { value: number; owed: number }, to: { value: number; owed: number },
): { appreciation: number; paydown: number; total: number } {
  const appreciation = to.value - from.value;
  const paydown = from.owed - to.owed;
  return { appreciation, paydown, total: appreciation + paydown };
}
