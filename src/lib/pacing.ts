// Shared status bands for the dashboard and forecast status tiles.
//
// Kept in one place so a threshold change cannot leave two pages disagreeing
// about what counts as behind.

export type PacingStatus = { label: string; color: string };

/** Within this many percent of the goal counts as meeting it. */
const BAND_PCT = 5;

/**
 * Within 5% of the goal — at, above, or short by up to 5% — is on track; a
 * wider shortfall is behind. `met` short-circuits the bands when the goal has
 * already been reached.
 *
 * The variance is banded as displayed rather than raw, so a caption reading
 * 5.0% never sits beside "Behind" because the real figure was 5.04%.
 */
export function pacingStatus(
  variancePct: number | null | undefined,
  met?: { reached: boolean; label: string },
): PacingStatus {
  if (met?.reached) return { label: met.label, color: 'text-emerald-600' };
  if (variancePct == null) return { label: '—', color: 'text-slate-900' };
  const shown = parseFloat(variancePct.toFixed(1));
  if (shown >= -BAND_PCT) return { label: 'On Track', color: 'text-emerald-600' };
  return { label: 'Behind', color: 'text-red-600' };
}

/**
 * How far a figure has got towards its plan, as a percentage where 100% is
 * exactly on plan.
 *
 * Measured against the size of the plan rather than against the plan itself,
 * which is what makes it hold when the plan is a loss. A month planned to lose
 * $1,084 that came in at $84 has beaten its plan comfortably and reads over
 * 200%; dividing one by the other would have called that −8%, and the rule it
 * replaces — a share only where the plan was above zero — drew no ring at all
 * for the one case where the news was best.
 *
 * For a plan above zero this is exactly actual ÷ plan, so nothing that already
 * read sensibly moves by a point.
 */
export function planShare(actual: number, plan: number | null | undefined): number | null {
  if (plan == null || plan === 0) return null;
  return (1 + (actual - plan) / Math.abs(plan)) * 100;
}

/**
 * The same band, read against where the period should be by now rather than
 * against its final goal — so earning 60% of a month's target says something
 * different on the 17th than on the 28th.
 *
 * Clearing the bar is worth distinguishing from merely holding it, so this one
 * has three labels where pacingStatus has two.
 */
export function paceStatus(variancePct: number | null | undefined): PacingStatus {
  if (variancePct == null) return { label: '—', color: 'text-slate-900' };
  const shown = parseFloat(variancePct.toFixed(1));
  if (shown >= BAND_PCT) return { label: 'Ahead', color: 'text-emerald-600' };
  if (shown >= -BAND_PCT) return { label: 'On Pace', color: 'text-emerald-600' };
  return { label: 'Behind', color: 'text-red-600' };
}
