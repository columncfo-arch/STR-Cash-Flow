// When a recurring expense lands.
//
// Recurrence used to mean "every month, forever", which charged an annual
// insurance premium or a quarterly tax bill twelve times a year. An expense now
// carries how often it repeats, and every place that totals a month — the income
// statement, the forecast, the expenses grid — asks this one question rather than
// re-deriving the answer.

import { Expense, RecurrenceFrequency } from '@/types';
import { DateRange, inRange, recurrenceOverlapsRange } from '@/lib/dateRange';

export const RECURRENCE_FREQUENCIES: {
  id: RecurrenceFrequency;
  /** For the picker, phrased as the cadence. */
  label: string;
  /** For the badge on a saved expense. */
  short: string;
  everyMonths: number;
}[] = [
  { id: 'monthly', label: 'Every month', short: 'Monthly', everyMonths: 1 },
  { id: 'quarterly', label: 'Every 3 months', short: 'Quarterly', everyMonths: 3 },
  { id: 'annual', label: 'Once a year', short: 'Annual', everyMonths: 12 },
];

export const DEFAULT_FREQUENCY: RecurrenceFrequency = 'monthly';

/**
 * How many months apart a recurring expense's occurrences are.
 *
 * Records saved before frequencies existed carry none, and every one of them was
 * monthly, so an absent frequency reads as monthly and their totals do not move.
 */
export function everyMonths(frequency?: RecurrenceFrequency): number {
  return RECURRENCE_FREQUENCIES.find(f => f.id === frequency)?.everyMonths ?? 1;
}

export function frequencyLabel(e: Pick<Expense, 'recurrenceFrequency'>): string {
  const match = RECURRENCE_FREQUENCIES.find(f => f.id === e.recurrenceFrequency);
  return (match ?? RECURRENCE_FREQUENCIES[0]).short;
}

/** Whole months from one YYYY-MM to another; negative if `to` is earlier. */
function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/**
 * Does this expense land in the given month (YYYY-MM)?
 *
 * A one-off lands in the month it is dated. A recurring one lands on its start
 * month and every `everyMonths` after, up to `recurrenceEnd` if it has one — so
 * a premium first paid in March is charged in March, not in April.
 */
export function occursInMonth(e: Expense, month: string): boolean {
  if (!e.recurring) return e.date.startsWith(month);

  const start = e.date.slice(0, 7);
  if (month < start) return false;
  const end = e.recurrenceEnd ? e.recurrenceEnd.slice(0, 7) : null;
  if (end && month > end) return false;

  return monthsBetween(start, month) % everyMonths(e.recurrenceFrequency) === 0;
}

/** The subset of `months` (YYYY-MM) this expense lands in. */
export function occurrencesIn(e: Expense, months: string[]): string[] {
  return months.filter(month => occursInMonth(e, month));
}

/** Every month (YYYY-MM) a bounded range touches, ends included. */
function monthsOfRange(range: DateRange): string[] {
  const months: string[] = [];
  const [startYear, startMonth] = range.from.slice(0, 7).split('-').map(Number);
  const last = range.to.slice(0, 7);
  for (let y = startYear, m = startMonth; ; m++) {
    if (m > 12) { m = 1; y++; }
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > last) break;
    months.push(key);
  }
  return months;
}

/**
 * Does this expense actually charge inside the range?
 *
 * An open-ended range cannot be enumerated, so it falls back to asking whether
 * the series is live at all — a recurrence with no end always charges eventually.
 */
export function occursInRange(e: Expense, range: DateRange): boolean {
  if (!e.recurring) return inRange(e.date, range);
  if (!range.from || !range.to) return recurrenceOverlapsRange(e.date, e.recurrenceEnd, range);
  return monthsOfRange(range).some(month => occursInMonth(e, month));
}
