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
/** A stay whose channel is known, so a clash can be told apart from a ghost. */
export interface ChannelStay extends DatedStay {
  platform: string;
}

export interface ClashReport<T> {
  /**
   * Stays clashing only with others on their own channel. One channel cannot
   * sell the same night twice, so this is almost always a reservation that was
   * cancelled after it synced and never removed — a number to delete.
   */
  sameChannel: T[];
  /**
   * Stays clashing with one on a different channel. Two channels that do not
   * share a calendar can and will sell the same night, so both guests really
   * hold it. Deleting either row would hide the problem rather than fix it.
   */
  crossChannel: T[];
}

/**
 * Clashing stays, split by whether the clash is real.
 *
 * The distinction is the whole point. An owner running one channel manager has
 * only the first kind, and can treat every clash as bad data. An owner whose
 * channels are driven by two systems that do not share a calendar has both, and
 * the two call for opposite responses: one is deleted, the other is a double
 * booking with two guests in it, where the figures are the least of the problem.
 *
 * Judged pair by pair rather than over a whole run. A long stay can chain two
 * others together that never touch each other, and asking merely whether a run
 * contains two channels would call that a double booking when no two stays in
 * it actually collide. A stay clashing both ways is reported as cross-channel,
 * that being the one worth looking at first.
 */
export function classifyClashes<T extends ChannelStay>(stays: readonly T[]): ClashReport<T> {
  const crossChannel = new Set<T>();
  const sameChannel = new Set<T>();

  for (const cluster of overlapClusters(stays)) {
    // Clusters are a handful of stays at most, so comparing every pair is
    // cheaper than any index that would avoid it.
    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const [a, b] = [cluster[i], cluster[j]];
        if (!overlaps(a, b)) continue;
        const target = a.platform === b.platform ? sameChannel : crossChannel;
        target.add(a);
        target.add(b);
      }
    }
  }

  for (const stay of crossChannel) sameChannel.delete(stay);
  return { sameChannel: [...sameChannel], crossChannel: [...crossChannel] };
}

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
