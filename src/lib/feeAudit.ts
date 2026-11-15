// Whether the channel's cut is actually being taken out.
//
// Net revenue is gross less the platform fee, so a fee that fails to arrive
// does not show up as a missing cost — it shows up as a better month. On
// Airbnb's host-only pricing the cut is around 15%, which means a booking
// imported without its fee overstates that booking's contribution by about a
// sixth, quietly, in the direction nobody questions.
//
// The check is possible because the books already hold the payout. Gross less
// what actually landed in the bank is the cut, whatever the books claim it was,
// so the two can be compared without asking the channel anything.

/** What this needs of a booking to audit its fee. */
export interface FeeRow {
  platform: string;
  /** Gross: what the guest paid. */
  income: number;
  /** The channel's cut as recorded. */
  platformFee?: number;
  /** What actually landed, net of the cut and anything else withheld. */
  paidOut?: number;
  /** Tax the channel collected and remitted, which also sits between the two. */
  taxRemitted?: number;
  taxWithheld?: number;
  fastPayFee?: number;
}

export interface PlatformFees {
  platform: string;
  bookings: number;
  gross: number;
  /** The cut as the books record it. */
  feesRecorded: number;
  /** That cut as a share of gross — the figure to compare to the channel's rate. */
  recordedRatePct: number | null;
  /** Bookings earning money with no fee recorded at all. */
  missingFee: number;
  /** Gross on those bookings: revenue currently reported with no cut taken. */
  grossMissingFee: number;
  /** Bookings whose payout is known, so the cut can be derived independently. */
  withPayout: number;
  /** The cut those payouts imply: gross less payout, less tax that also sits between. */
  feesImplied: number;
  impliedRatePct: number | null;
  /** Gross of the bookings behind the implied figures, so the two rates compare like with like. */
  grossWithPayout: number;
  /** Implied less recorded, over those same bookings. Positive means fees are being under-recorded. */
  shortfall: number;
}

/**
 * What each channel's fees look like, recorded against derived.
 *
 * Two independent readings of the same cut. `recordedRatePct` is what the books
 * say; `impliedRatePct` is what the bank statement says, and they are computed
 * over the same subset of bookings so the comparison means something — a rate
 * taken over all bookings against one taken over the few with payouts would
 * differ for reasons that have nothing to do with fees.
 *
 * The implied figure nets off platform-remitted tax and any fast-pay charge,
 * since those also sit between gross and payout and would otherwise read as
 * commission. Anything else a channel withholds — a damage claim, a promotional
 * credit — lands in the implied figure too, so a small gap between the two is
 * ordinary and a large one is worth opening a booking over.
 */
export function auditFees(rows: readonly FeeRow[]): PlatformFees[] {
  const byPlatform = new Map<string, FeeRow[]>();
  for (const r of rows) {
    const list = byPlatform.get(r.platform);
    if (list) list.push(r);
    else byPlatform.set(r.platform, [r]);
  }

  return [...byPlatform.entries()]
    .map(([platform, list]) => {
      const gross = list.reduce((t, r) => t + r.income, 0);
      const feesRecorded = list.reduce((t, r) => t + (r.platformFee ?? 0), 0);

      const earning = list.filter(r => r.income > 0);
      const noFee = earning.filter(r => !r.platformFee);

      // Only bookings whose payout is known can have their cut derived, and the
      // recorded rate must be read over those same bookings to be comparable.
      const paid = list.filter(r => r.paidOut != null && r.income > 0);
      const grossWithPayout = paid.reduce((t, r) => t + r.income, 0);
      const feesImplied = paid.reduce((t, r) =>
        t + (r.income - (r.paidOut ?? 0) - (r.taxRemitted ?? 0) - (r.taxWithheld ?? 0) - (r.fastPayFee ?? 0)), 0);
      const recordedOnPaid = paid.reduce((t, r) => t + (r.platformFee ?? 0), 0);

      return {
        platform,
        bookings: list.length,
        gross,
        feesRecorded,
        recordedRatePct: gross > 0 ? (feesRecorded / gross) * 100 : null,
        missingFee: noFee.length,
        grossMissingFee: noFee.reduce((t, r) => t + r.income, 0),
        withPayout: paid.length,
        feesImplied,
        impliedRatePct: grossWithPayout > 0 ? (feesImplied / grossWithPayout) * 100 : null,
        grossWithPayout,
        shortfall: feesImplied - recordedOnPaid,
      };
    })
    .sort((a, b) => b.gross - a.gross);
}
