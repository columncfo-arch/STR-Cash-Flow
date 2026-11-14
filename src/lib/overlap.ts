// Stays that claim the same nights.
//
// One unit has one calendar, so two stays over the same night is not a booking
// pattern — it is a data error, and the only question is which kind. Finding
// them is worth doing on its own: an overlap inflates the month's revenue and
// its occupancy at the same time, and neither figure looks wrong enough on its
// own to notice.
//
// Dates are compared as `YYYY-MM-DD` strings throughout. Parsing them would
// invite a timezone to pull a check-in over midnight and invent an overlap that
// is not there.

/** What this module needs of a stay: when it starts and when it ends. */
export interface DatedStay {
  /** `YYYY-MM-DD`, the night the guest arrives. */
  checkIn: string;
  /** `YYYY-MM-DD`, the morning they leave. Not a night they occupy. */
  checkOut: string;
}

/**
 * Whether two stays claim a night in common.
 *
 * Check-out day is not a night stayed, so one guest leaving on the 12th and the
 * next arriving on the 12th is an ordinary turnover rather than a clash. Half-
 * open intervals give that for free, and getting it wrong would flag most of a
 * well-booked month.
 */
export function overlaps(a: DatedStay, b: DatedStay): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

/**
 * Runs of stays that overlap each other, each returned in date order.
 *
 * Grouped rather than paired because the interesting case is a pile-up: a week
 * holding four stays says something different from four isolated clashes, and
 * pairs would report it as six findings. Stays with no clash are left out
 * entirely, so an empty result means the calendar is sound.
 *
 * A stay missing either date, or ending before it starts, is skipped — it
 * cannot be placed on a calendar, and treating a blank check-out as midnight
 * would pair it with everything.
 */
export function overlapClusters<T extends DatedStay>(stays: readonly T[]): T[][] {
  const sorted = stays
    .filter(s => s.checkIn && s.checkOut && s.checkOut > s.checkIn)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.checkOut.localeCompare(b.checkOut));

  const clusters: T[][] = [];
  let run: T[] = [];
  // The furthest any stay in the current run reaches, which is what the next
  // stay has to clear to be clean — not merely the previous stay's check-out,
  // since a long stay can straddle several short ones.
  let reach = '';

  for (const stay of sorted) {
    if (run.length > 0 && stay.checkIn < reach) {
      run.push(stay);
      if (stay.checkOut > reach) reach = stay.checkOut;
      continue;
    }
    if (run.length > 1) clusters.push(run);
    run = [stay];
    reach = stay.checkOut;
  }
  if (run.length > 1) clusters.push(run);

  return clusters;
}
