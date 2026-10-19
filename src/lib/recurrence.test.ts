import { describe, expect, it } from 'vitest';
import { everyMonths, frequencyLabel, occurrencesIn, occursInMonth, occursInRange } from '@/lib/recurrence';
import type { Expense, LeaseCharge, RecurrenceFrequency } from '@/types';

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1', date: '2026-03-14', category: 'other', description: 'Insurance',
  amount: 1200, createdAt: '', updatedAt: '', ...over,
});

const repeating = (frequency: RecurrenceFrequency, over: Partial<Expense> = {}) =>
  expense({ recurring: true, recurrenceFrequency: frequency, ...over });

describe('a one-off lands in the month it is dated', () => {
  it('lands in its own month', () => expect(occursInMonth(expense(), '2026-03')).toBe(true));
  it('lands nowhere else', () => expect(occursInMonth(expense(), '2026-04')).toBe(false));
});

describe('a repeat lands on its start month and every period after', () => {
  const monthly = repeating('monthly');
  const quarterly = repeating('quarterly');
  const annual = repeating('annual');

  it('charges a monthly cost every month', () => {
    expect(occursInMonth(monthly, '2026-03')).toBe(true);
    expect(occursInMonth(monthly, '2026-04')).toBe(true);
    expect(occursInMonth(monthly, '2027-01')).toBe(true);
  });

  // The bug this exists for: an annual premium charged twelve times a year
  it('charges an annual cost once a year', () => {
    expect(occursInMonth(annual, '2026-03')).toBe(true);
    expect(occursInMonth(annual, '2026-04')).toBe(false);
    expect(occursInMonth(annual, '2027-03')).toBe(true);
    expect(occursInMonth(annual, '2027-04')).toBe(false);
  });

  it('charges a quarterly cost every third month', () => {
    expect(occurrencesIn(quarterly, [
      '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
    ])).toEqual(['2026-03', '2026-06', '2026-09']);
  });

  it('charges from its start month, not from January', () =>
    expect(occursInMonth(annual, '2026-01')).toBe(false));

  it('charges nothing before it starts', () =>
    expect(occursInMonth(monthly, '2026-02')).toBe(false));

  it('stops at its end date', () => {
    const ending = repeating('monthly', { recurrenceEnd: '2026-05-31' });
    expect(occursInMonth(ending, '2026-05')).toBe(true);
    expect(occursInMonth(ending, '2026-06')).toBe(false);
  });
});

// Records saved before frequencies existed carry none, and every one of them
// was monthly — so their totals must not move
describe('a repeat with no frequency stored is monthly', () => {
  it('spaces it a month apart', () => expect(everyMonths(undefined)).toBe(1));
  it('charges it every month', () => {
    const legacy = expense({ recurring: true });
    expect(occursInMonth(legacy, '2026-03')).toBe(true);
    expect(occursInMonth(legacy, '2026-04')).toBe(true);
  });
  it('labels it monthly', () => expect(frequencyLabel({ recurrenceFrequency: undefined })).toBe('Monthly'));
});

describe('spacing by frequency', () => {
  it('spaces quarterly three months apart', () => expect(everyMonths('quarterly')).toBe(3));
  it('spaces annual twelve months apart', () => expect(everyMonths('annual')).toBe(12));
});

describe('whether it charges inside a range', () => {
  it('finds a one-off inside the range', () =>
    expect(occursInRange(expense(), { from: '2026-03-01', to: '2026-03-31' })).toBe(true));

  it('finds nothing where the one-off falls outside', () =>
    expect(occursInRange(expense(), { from: '2026-04-01', to: '2026-04-30' })).toBe(false));

  // A monthly cost starting in January still applies in September, so testing
  // its start date alone would wrongly hide it
  it('finds a live repeat in a later range', () =>
    expect(occursInRange(repeating('monthly', { date: '2026-01-10' }), {
      from: '2026-09-01', to: '2026-09-30',
    })).toBe(true));

  it('does not find an annual repeat in a month it skips', () =>
    expect(occursInRange(repeating('annual'), { from: '2026-04-01', to: '2026-04-30' })).toBe(false));

  it('falls back to overlap when the range is open-ended', () =>
    expect(occursInRange(repeating('monthly'), { from: '', to: '' })).toBe(true));
});

/**
 * The revenue side asks the same question of a lease charge, and must get the
 * same answer — the expense side proved this rule and it should not grow a
 * second one.
 */
describe('a lease charge recurs by exactly the same rule', () => {
  const parking: LeaseCharge = {
    id: 'c1', leaseId: 'L1', label: 'Parking', amount: 75, date: '2026-03-20',
    recurring: true, recurrenceFrequency: 'monthly', createdAt: '', updatedAt: '',
  };

  it('bills every month from its first', () => {
    expect(occursInMonth(parking, '2026-03')).toBe(true);
    expect(occursInMonth(parking, '2026-04')).toBe(true);
    expect(occursInMonth(parking, '2026-02')).toBe(false);
  });

  it('bills a one-off fee only on its own month', () => {
    const lateFee: LeaseCharge = { ...parking, id: 'c2', label: 'Late fee', recurring: false };
    expect(occursInMonth(lateFee, '2026-03')).toBe(true);
    expect(occursInMonth(lateFee, '2026-04')).toBe(false);
  });
});
