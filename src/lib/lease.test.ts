import { describe, expect, it } from 'vitest';
import {
  daysInMonth, depositsHeld, effectiveEnd, endedEarly, isActiveOn,
  leaseDaysInMonth, leaseMonth, leaseTotalsForMonth,
} from '@/lib/lease';
import type { Lease, LeaseCharge } from '@/types';

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'L1', tenantName: 'A. Tenant', monthlyRent: 2400,
  startDate: '2026-03-20', endDate: null, createdAt: '', updatedAt: '', ...over,
});

const charge = (over: Partial<LeaseCharge> = {}): LeaseCharge => ({
  id: 'c1', leaseId: 'L1', label: 'Parking', amount: 75, date: '2026-03-01',
  recurring: true, recurrenceFrequency: 'monthly', proratesWithLease: true,
  createdAt: '', updatedAt: '', ...over,
});

describe('days in a month, built from parts so no timezone can shift them', () => {
  it('counts a 31-day month', () => expect(daysInMonth('2026-03')).toBe(31));
  it('counts a 30-day month', () => expect(daysInMonth('2026-04')).toBe(30));
  it('counts February', () => expect(daysInMonth('2026-02')).toBe(28));
  it('counts a leap February', () => expect(daysInMonth('2028-02')).toBe(29));
});

describe('proration at both ends', () => {
  const L = lease();

  it('covers a whole month in full', () => expect(leaseDaysInMonth(L, '2026-04')).toBe(30));
  it('counts the move-in month from the start date', () => expect(leaseDaysInMonth(L, '2026-03')).toBe(12));
  it('covers nothing before the tenancy begins', () => expect(leaseDaysInMonth(L, '2026-02')).toBe(0));

  it('covers all of a month it starts on the 1st of', () =>
    expect(leaseDaysInMonth(lease({ startDate: '2026-03-01' }), '2026-03')).toBe(31));
  it('covers one day of a month it starts on the last of', () =>
    expect(leaseDaysInMonth(lease({ startDate: '2026-03-31' }), '2026-03')).toBe(1));

  const ends = lease({ startDate: '2025-01-01', endDate: '2026-04-10' });
  it('counts the move-out month up to the end date', () => expect(leaseDaysInMonth(ends, '2026-04')).toBe(10));
  it('covers nothing after the tenancy ends', () => expect(leaseDaysInMonth(ends, '2026-05')).toBe(0));
});

// $2,400/month from 20 March with $75 parking, in a 31-day March. Worked out in
// docs/ltr-design.md before any of this was built.
describe('the worked example from the design', () => {
  const march = leaseMonth(lease(), [charge()], '2026-03');

  it('covers 12 days', () => expect(march.leaseDays).toBe(12));
  it('earns $929.03 of rent', () => expect(march.rent).toBeCloseTo(929.03, 2));
  it('earns $29.03 of parking', () => expect(march.charges).toBeCloseTo(29.03, 2));
  it('recognises $958.06 for the month', () => expect(march.revenue).toBeCloseTo(958.06, 2));
});

// The same lease runs to 31 December; the tenant leaves on 15 August and pays a
// $2,400 termination fee.
describe('the worked example of an early termination', () => {
  const cut = lease({ startDate: '2025-01-01', endDate: '2026-12-31', terminatedOn: '2026-08-15' });
  const fee = charge({
    id: 'c2', label: 'Early termination fee', amount: 2400,
    date: '2026-08-15', recurring: false, proratesWithLease: false,
  });
  const august = leaseMonth(cut, [charge(), fee], '2026-08');

  it('covers 15 days of August', () => expect(august.leaseDays).toBe(15));
  it('earns $1,161.29 of rent', () => expect(august.rent).toBeCloseTo(1161.29, 2));
  it('prorates the parking and lands the fee whole', () =>
    expect(august.charges).toBeCloseTo(36.29 + 2400, 2));
  it('recognises $3,597.58 in August', () => expect(august.revenue).toBeCloseTo(3597.58, 2));

  it('recognises nothing after the move-out', () =>
    expect(leaseMonth(cut, [charge(), fee], '2026-09').revenue).toBe(0));
  it('reads the unit as vacant after the move-out', () =>
    expect(leaseMonth(cut, [charge(), fee], '2026-09').leaseDays).toBe(0));
  it('does not repeat the one-off fee in September', () =>
    expect(leaseMonth(cut, [fee], '2026-09').charges).toBe(0));

  it('ends on the earlier of the two dates', () => expect(effectiveEnd(cut)).toBe('2026-08-15'));
  it('keeps the date it was written to run to', () => expect(cut.endDate).toBe('2026-12-31'));
  it('reports that it ended early', () => expect(endedEarly(cut)).toBe(true));
  it('does not report a tenancy that ran its course as early', () =>
    expect(endedEarly(lease({ endDate: '2026-12-31', terminatedOn: '2026-12-31' }))).toBe(false));
});

describe('charges', () => {
  const whole = lease({ startDate: '2025-01-01' });

  it('lands a non-prorating standing charge whole', () =>
    expect(leaseMonth(lease(), [charge({ proratesWithLease: false })], '2026-03').charges).toBe(75));

  it('bills an annual charge once a year, not every month', () =>
    expect(leaseMonth(whole, [charge({
      date: '2026-03-01', recurrenceFrequency: 'annual', amount: 600,
    })], '2026-04').charges).toBe(0));

  it('bills an annual charge in its own month', () =>
    expect(leaseMonth(whole, [charge({
      date: '2026-03-01', recurrenceFrequency: 'annual', amount: 600, proratesWithLease: false,
    })], '2026-03').charges).toBe(600));

  it("does not count another tenancy's charges", () =>
    expect(leaseMonth(lease(), [charge({ leaseId: 'OTHER' })], '2026-04').charges).toBe(0));

  it('expresses a concession as a negative charge', () =>
    expect(leaseMonth(whole, [charge({
      amount: -500, recurring: false, date: '2026-04-05',
    })], '2026-04').revenue).toBe(2400 - 500));
});

describe('several tenancies over a turnover', () => {
  const out = lease({ id: 'A', startDate: '2025-06-01', endDate: '2026-04-14', monthlyRent: 3000 });
  const inn = lease({ id: 'B', startDate: '2026-04-14', endDate: '2027-04-13', monthlyRent: 3200 });
  const turnover = leaseTotalsForMonth([out, inn], [], '2026-04');

  it('cannot report more days than the month has', () => expect(turnover.leasedDays).toBe(30));
  it('recognises both tenancies', () =>
    expect(turnover.revenue).toBeCloseTo(3000 * 14 / 30 + 3200 * 17 / 30, 2));

  it('leaves the rest of the month uncovered after a vacancy', () =>
    expect(leaseTotalsForMonth(
      [lease({ id: 'A', startDate: '2025-06-01', endDate: '2026-04-10' })], [], '2026-04',
    ).leasedDays).toBe(10));
});

describe('deposits never reach a revenue line', () => {
  const held = lease({ depositHeld: 3000, startDate: '2026-01-01' });

  it('is not rent', () => expect(leaseMonth(held, [], '2026-02').revenue).toBe(2400));
  it('is not a charge', () => expect(leaseMonth(held, [], '2026-02').charges).toBe(0));
  it('is reported as held', () => expect(depositsHeld([held], '2026-02-01')).toBe(3000));

  it('stops being held once the tenancy has ended', () =>
    expect(depositsHeld(
      [lease({ depositHeld: 3000, startDate: '2026-01-01', endDate: '2026-01-31' })], '2026-02-01',
    )).toBe(0));

  it('is not held before the tenancy starts', () =>
    expect(depositsHeld([lease({ depositHeld: 3000, startDate: '2026-06-01' })], '2026-02-01')).toBe(0));

  // Withholding is what turns the tenant's money into the owner's, and it does
  // that by becoming an ordinary charge dated the move-out
  it('reaches revenue only once withheld as a charge', () =>
    expect(leaseMonth(held, [charge({
      id: 'w', label: 'Deposit withheld', amount: 600,
      date: '2026-02-10', recurring: false, proratesWithLease: false,
    })], '2026-02').revenue).toBe(3000));
});

describe('whether a tenancy is live on a date', () => {
  const ends = lease({ startDate: '2025-01-01', endDate: '2026-04-10' });

  it('is live inside its term', () => expect(isActiveOn(ends, '2026-04-01')).toBe(true));
  it('is not live before it starts', () => expect(isActiveOn(lease(), '2026-03-19')).toBe(false));
  it('is live on its first day', () => expect(isActiveOn(lease(), '2026-03-20')).toBe(true));
  it('is live on its last day', () => expect(isActiveOn(ends, '2026-04-10')).toBe(true));
  it('is not live the day after it ends', () => expect(isActiveOn(ends, '2026-04-11')).toBe(false));
  it('stays live when it is month-to-month', () => expect(isActiveOn(lease(), '2099-01-01')).toBe(true));
});

describe('a year of rent adds up to twelve months of it', () => {
  it('loses nothing to rounding across the year', () => {
    const full = lease({ startDate: '2026-01-01', endDate: '2026-12-31', monthlyRent: 2400 });
    const year = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
      .reduce((sum, month) => sum + leaseMonth(full, [], month).revenue, 0);
    expect(year).toBeCloseTo(2400 * 12, 2);
  });
});

// Lease revenue reaches the profit and loss only through leaseTotalsForMonth,
// and leased days reach occupancy only through it. Zero here is zero everywhere,
// which is what keeps a short-term unit's figures from moving by a cent.
describe('a unit with no tenancies does not move', () => {
  it('earns nothing', () => expect(leaseTotalsForMonth([], [], '2026-04').revenue).toBe(0));
  it('occupies nothing', () => expect(leaseTotalsForMonth([], [], '2026-04').leasedDays).toBe(0));
  it('earns nothing from charges with no tenancy behind them', () =>
    expect(leaseTotalsForMonth([], [charge()], '2026-04').revenue).toBe(0));
  it('holds no deposits', () => expect(depositsHeld([], '2026-04-01')).toBe(0));
});
