// Deciding when a stored stay has been cancelled.
//
// The Hostex sync can only ever add and amend: it walks the reservations the
// API reports as live and upserts each one. A stay that was live when it was
// last synced and has since been cancelled simply stops appearing in that set,
// so nothing in the upsert matches it — and left alone it keeps its original
// dates and income for good. That counts revenue that was refunded, and
// overlaps whoever rebooked the nights, which is how a booking list ends up
// showing four guests in one unit over the same week.
//
// This is the only path in the app that deletes a booking nobody asked to
// delete, so it is deliberately narrow: it removes a record only when the API
// has positively accounted for that record's dates and not mentioned it. Where
// the evidence is thin the record stays, because a stale booking is a visible
// error an owner can report, while a deleted one is gone.

/** What this module needs to know about a stay already in the books. */
export interface StoredStay {
  /** Which integration wrote it. Only the sync's own records are considered. */
  sourceId?: string;
  /** The channel's reservation code. Without one there is nothing to match. */
  confirmationCode?: string;
  /** `YYYY-MM-DD`. Compared as a string, so no timezone can shift it. */
  checkIn: string;
}

/** The range of dates a fetch demonstrably reached. */
export interface CoveredSpan {
  from: string;
  to: string;
}

/**
 * The span of check-in dates a fetch accounted for.
 *
 * Built from the *unfiltered* result, cancelled reservations included: a
 * cancelled reservation is still evidence that the API reported on its dates,
 * which is exactly the evidence needed to trust its silence elsewhere in the
 * span.
 *
 * Null where there is nothing to go on — an empty account, or a first sync
 * against a token with no reservations. Null means nothing is ever pruned,
 * which is the right answer when the fetch proves nothing.
 */
export function coveredSpan(checkIns: readonly (string | undefined)[]): CoveredSpan | null {
  let from = '';
  let to = '';
  for (const d of checkIns) {
    if (!d) continue;
    if (!from || d < from) from = d;
    if (!to || d > to) to = d;
  }
  return from ? { from, to } : null;
}

/**
 * Whether a stored stay has been cancelled since it was synced.
 *
 * Four things have to hold, and each one is there to stop a real booking being
 * deleted:
 *
 *  - the sync wrote the record, so it is the sync's to remove. A CSV import or
 *    a hand-entered stay is never touched.
 *  - the record carries a confirmation code, without which it cannot be matched
 *    against the live set either way.
 *  - the code is absent from the live set. That set is taken across the whole
 *    account before reservations are routed to properties, so a unit this app
 *    does not yet recognise still counts as live.
 *  - the check-in falls inside the span the fetch covered. Outside it the API
 *    has said nothing about those dates — an account whose history the API
 *    truncates keeps its older books rather than losing them.
 */
export function isCancelled(
  stay: StoredStay,
  activeCodes: ReadonlySet<string>,
  span: CoveredSpan | null,
): boolean {
  if (stay.sourceId !== 'hostex') return false;
  if (!stay.confirmationCode) return false;
  if (activeCodes.has(stay.confirmationCode)) return false;
  if (!span || !stay.checkIn) return false;
  return stay.checkIn >= span.from && stay.checkIn <= span.to;
}

/**
 * The stays worth keeping, and how many were dropped as cancelled.
 *
 * Order is preserved, so whatever the caller does next sees the books in the
 * same sequence minus the cancellations.
 */
export function pruneCancelled<T extends StoredStay>(
  stays: readonly T[],
  activeCodes: ReadonlySet<string>,
  span: CoveredSpan | null,
): { kept: T[]; cancelled: number } {
  const kept = stays.filter(s => !isCancelled(s, activeCodes, span));
  return { kept, cancelled: stays.length - kept.length };
}
