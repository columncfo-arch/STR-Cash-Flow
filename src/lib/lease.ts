// What a lease earns in a month, and for how many days it held the unit.
//
// Rent is recognised across the months it covers rather than the month the
// money arrived, which is the same rule a booking follows — counting on the
// stay rather than on the payout. A tenant paying twelve months up front would
// otherwise show one enormous January and eleven failures, and every pacing
// figure on the dashboard would be wrong in both directions.
//
// Settled in docs/ltr-design.md before any of it was built.

import { Lease, LeaseCharge } from '@/types';
import { occursInMonth } from '@/lib/recurrence';

/** Days in a YYYY-MM, built from parts so no timezone can shift it. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * The last day the lease holds the unit: the earlier of the date it was written
 * to run to and the date the tenant actually left. Null means it is still
 * running — a month-to-month tenancy that nobody has ended.
 */
export function effectiveEnd(lease: Lease): string | null {
  const ends = [lease.endDate, lease.terminatedOn].filter((d): d is string => Boolean(d));
  if (!ends.length) return null;
  return ends.reduce((a, b) => (a < b ? a : b));
}

/**
 * Days of `month` (YYYY-MM) the lease covers, both ends included.
 *
 * A lease running from the 20th covers eleven days of a 30-day month; one whose
 * tenant left on the 15th covers fifteen. The day of the move-out counts: the
 * unit was occupied that day.
 */
export function leaseDaysInMonth(lease: Lease, month: string): number {
  const total = daysInMonth(month);
  const first = `${month}-01`;
  const last = `${month}-${String(total).padStart(2, '0')}`;
  const end = effectiveEnd(lease);

  const from = lease.startDate > first ? lease.startDate : first;
  const to = end && end < last ? end : last;
  // Either bound outside the month leaves from > to, which is no coverage
  if (from > to) return 0;
  return Number(to.slice(8, 10)) - Number(from.slice(8, 10)) + 1;
}

/** What one lease and its charges earn in a month, and the days behind it. */
export interface LeaseMonth {
  /** Rent for the days covered, at the monthly rate. */
  rent: number;
  /** Everything billed alongside it, prorated where it is a standing charge. */
  charges: number;
  /** rent + charges. */
  revenue: number;
  leaseDays: number;
}

/**
 * One lease's month.
 *
 *   leaseDays = days of M covered by [startDate, effectiveEnd]
 *   rent      = monthlyRent × leaseDays / daysInMonth
 *   charges   = Σ amount for each charge occurring in M,
 *               × leaseDays / daysInMonth where it prorates
 *
 * A standing charge — parking, a flat utility fee — prorates with the tenancy
 * that incurred it. A one-off does not: a late fee or an early termination fee
 * is an event on a date and lands whole.
 */
export function leaseMonth(lease: Lease, charges: LeaseCharge[], month: string): LeaseMonth {
  const total = daysInMonth(month);
  const leaseDays = leaseDaysInMonth(lease, month);
  const share = leaseDays / total;
  const rent = lease.monthlyRent * share;

  const earned = charges.reduce((sum, c) => {
    if (c.leaseId !== lease.id) return sum;
    if (!occursInMonth(c, month)) return sum;
    // A standing charge belongs to the tenancy, so it stops when the tenancy
    // does. A one-off belongs to its own date and stands on its own.
    if (c.recurring && leaseDays === 0) return sum;
    return sum + (c.proratesWithLease ? c.amount * share : c.amount);
  }, 0);

  return { rent, charges: earned, revenue: rent + earned, leaseDays };
}

/**
 * Every lease on the unit, totalled for a month.
 *
 * Days are capped at the month's length: a turnover where one tenancy ends on
 * the 14th and the next starts on the 14th must not report 32 days of a 31-day
 * month, and occupancy built on it must not exceed 100%.
 */
export function leaseTotalsForMonth(
  leases: Lease[], charges: LeaseCharge[], month: string,
): { revenue: number; leasedDays: number } {
  const totals = leases.reduce(
    (acc, lease) => {
      const m = leaseMonth(lease, charges, month);
      return { revenue: acc.revenue + m.revenue, leasedDays: acc.leasedDays + m.leaseDays };
    },
    { revenue: 0, leasedDays: 0 },
  );
  return { ...totals, leasedDays: Math.min(totals.leasedDays, daysInMonth(month)) };
}

/**
 * Deposits the owner is holding on behalf of tenants.
 *
 * Never revenue, and in no line of the profit and loss. It is reported on its
 * own because the danger is the bank balance: it overstates what is actually
 * the owner's by exactly this much.
 *
 * A deposit is held while the tenancy is live. Once the lease has ended it has
 * been returned or withheld — and a withheld amount becomes an ordinary charge
 * dated the move-out, at which point it stops being the tenant's money and
 * starts being revenue.
 */
export function depositsHeld(leases: Lease[], on: string): number {
  return leases.reduce((sum, l) => {
    if (!l.depositHeld || l.startDate > on) return sum;
    const end = effectiveEnd(l);
    return end && end < on ? sum : sum + l.depositHeld;
  }, 0);
}

/** Is the lease live on this date? */
export function isActiveOn(lease: Lease, on: string): boolean {
  if (lease.startDate > on) return false;
  const end = effectiveEnd(lease);
  return !end || end >= on;
}

/** A lease that ended before the date it was written to run to. */
export function endedEarly(lease: Lease): boolean {
  return Boolean(lease.terminatedOn && lease.endDate && lease.terminatedOn < lease.endDate);
}
