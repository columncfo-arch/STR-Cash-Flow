// Shared date-range filtering for the bookings and expenses lists.
//
// Records store plain YYYY-MM-DD with no time component. Parsing those through
// `new Date()` reads them as UTC midnight, which shifts a day backwards in
// western timezones — so bounds are built from local date parts and compared
// as strings throughout.

const pad = (n: number) => String(n).padStart(2, '0');

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export type RangePreset = 'month' | 'ytd' | 'last12' | 'all' | 'custom';

export interface DateRange {
  from: string; // '' = unbounded
  to: string;   // '' = unbounded
}

export const RANGE_PRESETS: { id: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { id: 'month', label: 'This Month' },
  { id: 'ytd', label: 'YTD' },
  { id: 'last12', label: 'Last 12 Months' },
  { id: 'all', label: 'All' },
];

export function presetRange(preset: Exclude<RangePreset, 'custom'>, now = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'month':
      // day 0 of next month = last day of this one
      return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) };
    case 'ytd':
      return { from: isoDate(new Date(y, 0, 1)), to: isoDate(now) };
    case 'last12':
      return { from: isoDate(new Date(y - 1, m, now.getDate())), to: isoDate(now) };
    case 'all':
      return { from: '', to: '' };
  }
}

/** A single dated record falls inside the range. */
export function inRange(date: string | undefined, range: DateRange): boolean {
  if (!date) return false;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

/**
 * A recurring record overlaps the range.
 *
 * A monthly expense starting in January with no end date still applies in
 * September, so testing its start date alone would wrongly hide it. This is
 * interval overlap instead: it began on or before the range ends, and had not
 * already finished when the range began.
 */
export function recurrenceOverlapsRange(
  start: string | undefined,
  end: string | null | undefined,
  range: DateRange,
): boolean {
  if (!start) return false;
  if (range.to && start > range.to) return false;
  if (range.from && end && end < range.from) return false;
  return true;
}
