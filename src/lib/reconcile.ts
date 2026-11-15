// Checking the books against the money the channel actually moved.
//
// A channel manager's feed and the app's books are the same story told twice,
// and when they drift there is nothing inside either one to say so. A stay
// cancelled after it synced keeps its income and its nights for good; a stay
// the sync never saw is simply absent, and absent revenue looks exactly like a
// quiet month. Neither shows up as an error, which is why both can run for a
// year unnoticed.
//
// A payout schedule is the independent witness. The channel pays once per
// reservation, on a date it commits to in advance, so its schedule is a list of
// the stays it believes are real — produced by the party that owes the money,
// which is the one party with no incentive to invent a booking. Lining the two
// up turns a silent drift into three plain questions: what is in the books that
// nobody will pay for, what is being paid for that is not in the books, and
// what do the two disagree about.

import { coveredSpan, withinSpan, type CoveredSpan } from '@/lib/span';
import { col, normalizeDate, parseMoney } from '@/lib/csv';

/** A reservation as the channel's payout export describes it. */
export interface PayoutRecord {
  /** The channel's own code for the reservation. */
  confirmationCode: string;
  /** `YYYY-MM-DD` check-in. The payout is scheduled from this. */
  checkIn: string;
  guestName?: string;
  /** What the guest paid, before the channel's cut. */
  grossEarnings: number;
  /** When the channel paid, or has scheduled to pay. */
  payoutDate?: string;
}

/** A stay as the app holds it. */
export interface BookedStay {
  id: string;
  platform: string;
  confirmationCode?: string;
  checkIn: string;
  checkOut: string;
  guestName?: string;
  income: number;
}

/** A stay and its payout disagreeing about money. */
export interface AmountMismatch<T extends BookedStay = BookedStay> {
  booking: T;
  payout: PayoutRecord;
  /** Booked income less the channel's gross. Positive means the books are high. */
  difference: number;
}

export interface Reconciliation<T extends BookedStay = BookedStay> {
  /** The dates the export accounted for. Nothing outside it is judged. */
  span: CoveredSpan | null;
  /** Stays that line up with a payout, in the books and on the schedule. */
  matched: number;
  /** In the books, but the channel will pay for no such stay. */
  unpaid: T[];
  /** On the schedule, but missing from the books. */
  missing: PayoutRecord[];
  /** In both, for different money. */
  mismatched: AmountMismatch<T>[];
  /** Booked income the channel does not expect to pay. */
  unpaidIncome: number;
  /** Revenue the channel is paying that the books never recorded. */
  missingIncome: number;
}

/**
 * The reservations in a channel's payout export.
 *
 * An export interleaves reservations with payout batches, adjustments and
 * resolutions, and only a reservation row carries a stay. A payout batch is
 * several stays' money added together, so it can be reconciled against nothing
 * in particular and is dropped.
 *
 * Gross earnings is taken rather than the amount paid out, because the books
 * hold what the guest paid. Reading the net would show the channel's commission
 * as a disagreement on every row in the file.
 */
export function readPayouts(rows: readonly Record<string, string>[]): PayoutRecord[] {
  return rows
    .filter(r => col(r, 'type').toLowerCase().includes('reservation'))
    .map(r => ({
      confirmationCode: col(r, 'confirmation_code', 'reference_code'),
      checkIn: normalizeDate(col(r, 'start_date', 'check_in', 'check_in_date', 'arrival_date')),
      guestName: col(r, 'guest', 'guest_name') || undefined,
      grossEarnings: parseMoney(col(r, 'gross_earnings', 'amount', 'paid_out')),
      payoutDate: normalizeDate(col(r, 'date', 'payout_date')) || undefined,
    }))
    .filter(p => !!p.checkIn);
}

/**
 * Several exports merged into one schedule.
 *
 * A channel splits its export between settled and scheduled payouts, and either
 * one alone covers only half the calendar — which matters, because a stay
 * outside the covered span is never judged. A stay listed in both files is one
 * stay, deduplicated by code, or by check-in where no code is given, that being
 * unique on a single unit's calendar.
 */
export function mergePayouts(perFile: readonly (readonly PayoutRecord[])[]): PayoutRecord[] {
  const seen = new Map<string, PayoutRecord>();
  for (const file of perFile) {
    for (const p of file) seen.set(p.confirmationCode || `date:${p.checkIn}`, p);
  }
  return [...seen.values()];
}

/** Cents, so a rounding difference between two exports is not a finding. */
const TOLERANCE = 0.01;

/**
 * Match the books against a payout schedule.
 *
 * Matching is by confirmation code first. Where that fails it falls back to the
 * check-in date, which is a sound key here precisely because the thing being
 * reconciled is one unit: a unit has one calendar, so two stays cannot start on
 * the same night. The fallback earns its place because a code can legitimately
 * differ between the two sides — a channel manager often stores its own code
 * rather than the channel's — and without it every booking on the account would
 * read as unpaid.
 *
 * Three guards keep this from crying wolf:
 *
 *  - only stays on `platform` are considered. An Airbnb export says nothing
 *    about a VRBO stay, and judging one by the other would condemn every
 *    booking on every other channel.
 *  - only check-ins inside the span the export covered are judged. Export only
 *    the paid history and the future is out of scope rather than unpaid; export
 *    nothing and nothing at all is judged.
 *  - a payout the export carries for a date outside the books' own reach is
 *    still reported, since money arriving for an unknown stay is worth knowing
 *    about whatever the dates say.
 */
export function reconcile<T extends BookedStay>(
  bookings: readonly T[],
  payouts: readonly PayoutRecord[],
  platform: string,
): Reconciliation<T> {
  const span = coveredSpan(payouts.map(p => p.checkIn));

  const byCode = new Map<string, PayoutRecord>();
  const byCheckIn = new Map<string, PayoutRecord>();
  for (const p of payouts) {
    if (p.confirmationCode) byCode.set(p.confirmationCode, p);
    if (p.checkIn) byCheckIn.set(p.checkIn, p);
  }

  const onPlatform = bookings.filter(b => b.platform === platform);

  const unpaid: T[] = [];
  const mismatched: AmountMismatch<T>[] = [];
  const claimed = new Set<PayoutRecord>();
  let matched = 0;

  for (const booking of onPlatform) {
    const payout =
      (booking.confirmationCode ? byCode.get(booking.confirmationCode) : undefined)
      ?? byCheckIn.get(booking.checkIn);

    if (!payout) {
      // Outside the export's reach the channel has said nothing, which is not
      // the same as saying there is no such stay.
      if (withinSpan(booking.checkIn, span)) unpaid.push(booking);
      continue;
    }

    claimed.add(payout);
    matched++;
    const difference = booking.income - payout.grossEarnings;
    if (Math.abs(difference) > TOLERANCE) mismatched.push({ booking, payout, difference });
  }

  const missing = payouts.filter(p => !claimed.has(p));

  return {
    span,
    matched,
    unpaid,
    missing,
    mismatched,
    unpaidIncome: unpaid.reduce((t, b) => t + b.income, 0),
    missingIncome: missing.reduce((t, p) => t + p.grossEarnings, 0),
  };
}
