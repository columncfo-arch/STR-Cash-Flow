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
