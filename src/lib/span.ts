// The stretch of dates a source of truth actually accounted for.
//
// Both places that compare the books against an outside source — the Hostex
// sync and the payout reconciliation — have to answer the same question before
// they act on a silence: did the source look at these dates at all? A feed that
// returns a year of reservations says nothing about the year before it, and
// reading that silence as "cancelled" or "unpaid" would condemn every older
// booking in the account.
//
// Dates are `YYYY-MM-DD` strings compared as strings, so no timezone can pull
// one over a boundary.

/** The first and last dates a source accounted for. */
export interface CoveredSpan {
  from: string;
  to: string;
}

/**
 * The span a set of dates covers, or null if there is nothing to go on.
 *
 * Null is the important case: it means the source proved nothing, and every
 * caller treats that as "judge no booking at all" rather than "judge them all".
 */
export function coveredSpan(dates: readonly (string | undefined)[]): CoveredSpan | null {
  let from = '';
  let to = '';
  for (const d of dates) {
    if (!d) continue;
    if (!from || d < from) from = d;
    if (!to || d > to) to = d;
  }
  return from ? { from, to } : null;
}

/**
 * Whether a date falls where the source was looking, ends included.
 *
 * False for a null span, so a source that returned nothing never licenses a
 * conclusion about anything.
 */
export function withinSpan(date: string, span: CoveredSpan | null): boolean {
  if (!span || !date) return false;
  return date >= span.from && date <= span.to;
}
