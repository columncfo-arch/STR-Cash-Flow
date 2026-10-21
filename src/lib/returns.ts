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
 * What every cost takes, as a share of what guests paid.
 *
 * Everything it takes to run the place — platform fees, operating costs,
 * property tax and insurance — but not the mortgage, which is a financing
 * decision rather than a cost of operating. So it is the complement of the NOI
 * margin: what this does not take is what the property earns.
 *
 * Published short-let benchmarks usually quote this without platform fees,
 * because they assume an owner who is not paying them. Fees are in here, which
 * makes it read higher than those and makes it true.
 */
export function operatingExpenseRatioPct(year: YearCosts): number | null {
  if (year.taxesInsurance == null || year.grossRevenue <= 0) return null;
  const costs = year.platformFees + year.operatingExpenses + year.taxesInsurance;
  return (costs / year.grossRevenue) * 100;
}

/** What a night actually brings in, once the platform has taken its cut. */
export function netAdr(revenueNetOfFees: number, nights: number): number | null {
  if (nights <= 0) return null;
  return revenueNetOfFees / nights;
}

/**
 * The occupancy at which the property covers everything, mortgage included.
 *
 * The one figure on this page an operator can act on directly: it converts a
 * pile of annual costs into a number of nights, which is the thing they
 * actually sell. Above it the year is in profit, below it the year is funded
 * from somewhere else.
 *
 * Measured against the whole payment rather than the interest on it, because
 * the question is what the property has to sell to stop needing money — and
 * the bank wants the principal too.
 *
 * It takes the current cost structure as given. Cleaning rises with bookings,
 * so a property far below its break-even will find the true figure a little
 * higher than this once the extra turnovers are paid for.
 */
export function breakEvenOccupancyPct(annualCosts: number, ratePerNight: number | null): number | null {
  if (ratePerNight == null || ratePerNight <= 0 || annualCosts <= 0) return null;
  return (annualCosts / ratePerNight / 365) * 100;
}

// ─── Reading a ratio ─────────────────────────────────────────────────────────
//
// A percentage on its own is a quiz. An owner looking at 7.9% has no way to
// know whether that is a good year or a bad one, and the figure does the work
// of informing them only once it sits against the range it could have been in.
//
// These bands are deliberately coarse. Four is enough to answer "should I be
// pleased", and a finer scale would imply a precision that market convention
// does not have.

export type Tone = 'weak' | 'fair' | 'good' | 'strong';

/** A band of a scale, running up to `upTo` from wherever the last one ended. */
export interface Band {
  upTo: number;
  label: string;
  tone: Tone;
}

/** The range a ratio is read against, and what each part of it means. */
export interface Scale {
  /** The ends of the drawn range. Values outside it sit at the edge. */
  min: number;
  max: number;
  /** Ascending by value. The last band is open-ended. */
  bands: Band[];
}

/**
 * Where a figure sits on its scale, and what that is called.
 *
 * `pct` is its position along the drawn range, clamped — a property at a 19%
 * cap rate sits at the right-hand end rather than off the chart.
 */
export function readScale(value: number | null, scale: Scale): { band: Band; pct: number } | null {
  if (value == null || !isFinite(value)) return null;
  const band = scale.bands.find(b => value < b.upTo) ?? scale.bands[scale.bands.length - 1];
  const pct = Math.min(100, Math.max(0, ((value - scale.min) / (scale.max - scale.min)) * 100));
  return { band, pct };
}

/**
 * The scales themselves.
 *
 * Coverage is the only one of these the outside world agrees on, because
 * lenders write it into covenants. The rest are conventions, and cap rate is
 * the loosest of them — it is set by the local market more than by the
 * building, so 5% is respectable in one city and poor in another. Treated here
 * as a general guide and said so where it is shown.
 *
 * Where a low number is the good one — costs, and the occupancy needed to
 * break even — the bands simply run the other way. The scale is always drawn
 * left to right in ascending value, so the colour tells the reader which
 * direction is which without a legend.
 */
export const SCALES = {
  capRate: {
    min: 0, max: 12,
    bands: [
      { upTo: 4, label: 'Weak', tone: 'weak' },
      { upTo: 6, label: 'Fair', tone: 'fair' },
      { upTo: 8, label: 'Good', tone: 'good' },
      { upTo: Infinity, label: 'Strong', tone: 'strong' },
    ],
  },
  cashOnCash: {
    min: 0, max: 20,
    bands: [
      { upTo: 5, label: 'Weak', tone: 'weak' },
      { upTo: 8, label: 'Fair', tone: 'fair' },
      { upTo: 12, label: 'Good', tone: 'good' },
      { upTo: Infinity, label: 'Strong', tone: 'strong' },
    ],
  },
  coverage: {
    min: 0.5, max: 2,
    bands: [
      { upTo: 1, label: 'Short', tone: 'weak' },
      { upTo: 1.25, label: 'Thin', tone: 'fair' },
      { upTo: 1.5, label: 'Comfortable', tone: 'good' },
      { upTo: Infinity, label: 'Strong', tone: 'strong' },
    ],
  },
  operatingCost: {
    min: 20, max: 60,
    bands: [
      { upTo: 30, label: 'Lean', tone: 'strong' },
      { upTo: 40, label: 'Typical', tone: 'good' },
      { upTo: 50, label: 'Heavy', tone: 'fair' },
      { upTo: Infinity, label: 'Eroding', tone: 'weak' },
    ],
  },
  breakEven: {
    min: 20, max: 100,
    bands: [
      { upTo: 50, label: 'Wide margin', tone: 'strong' },
      { upTo: 65, label: 'Workable', tone: 'good' },
      { upTo: 80, label: 'Tight', tone: 'fair' },
      { upTo: Infinity, label: 'Fragile', tone: 'weak' },
    ],
  },
} satisfies Record<string, Scale>;

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
