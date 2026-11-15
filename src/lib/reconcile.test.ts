import { describe, expect, it } from 'vitest';
import { mergePayouts, readPayouts, reconcile, type BookedStay, type PayoutRecord } from '@/lib/reconcile';
import { parseCSV } from '@/lib/csv';

const booked = (over: Partial<BookedStay> = {}): BookedStay => ({
  id: 'b1', platform: 'airbnb', confirmationCode: 'HM001',
  checkIn: '2026-11-09', checkOut: '2026-11-13', guestName: 'Elias', income: 552.59, ...over,
});

const paid = (over: Partial<PayoutRecord> = {}): PayoutRecord => ({
  confirmationCode: 'HM001', checkIn: '2026-11-09',
  guestName: 'Elias', grossEarnings: 552.59, payoutDate: '2026-11-10', ...over,
});

describe('books and schedule that agree', () => {
  const r = reconcile([booked()], [paid()], 'airbnb');

  it('counts the stay as matched', () => expect(r.matched).toBe(1));
  it('finds nothing unpaid', () => expect(r.unpaid).toEqual([]));
  it('finds nothing missing', () => expect(r.missing).toEqual([]));
  it('finds no disagreement about money', () => expect(r.mismatched).toEqual([]));
  it('reports the dates it judged', () =>
    expect(r.span).toEqual({ from: '2026-11-09', to: '2026-11-09' }));
});

/**
 * The case this was built for. Two stays sat in the books that Airbnb had no
 * payout for, in either the paid history or the forward schedule, and they were
 * the two creating every date overlap on the month.
 */
describe('a stay nobody is going to pay for', () => {
  const books = [
    booked({ id: 'elias', confirmationCode: 'HM001', checkIn: '2026-11-09', income: 552.59 }),
    booked({ id: 'ira', confirmationCode: 'HM002', checkIn: '2026-11-12', guestName: 'Ira', income: 410 }),
    booked({ id: 'paula', confirmationCode: 'HM003', checkIn: '2026-11-13', guestName: 'Paula', income: 397.57 }),
    booked({ id: 'beth', confirmationCode: 'HM004', checkIn: '2026-11-25', guestName: 'Beth', income: 380 }),
  ];
  const schedule = [
    paid({ confirmationCode: 'HM001', checkIn: '2026-11-09', grossEarnings: 552.59 }),
    paid({ confirmationCode: 'HM003', checkIn: '2026-11-13', grossEarnings: 397.57 }),
    paid({ confirmationCode: 'HM009', checkIn: '2026-11-22', guestName: 'Catherine', grossEarnings: 1996.73 }),
    // A channel schedules every confirmed stay, however far out, so a real
    // export reaches past the month in question — which is what lets the month
    // in question be judged at all.
    paid({ confirmationCode: 'HM100', checkIn: '2027-10-21', guestName: 'Far', grossEarnings: 761.94 }),
  ];
  const r = reconcile(books, schedule, 'airbnb');

  it('names the stays with no payout behind them', () =>
    expect(r.unpaid.map(b => b.id)).toEqual(['ira', 'beth']));

  it('adds up the income that will never arrive', () =>
    expect(r.unpaidIncome).toBeCloseTo(790, 2));

  it('still reports the stay the channel pays for but the books lack', () =>
    expect(r.missing.map(p => p.guestName)).toEqual(['Catherine', 'Far']));

  it('counts the revenue the books never recorded', () =>
    expect(r.missingIncome).toBeCloseTo(2758.67, 2));

  it('leaves the genuine stays alone', () => expect(r.matched).toBe(2));

  /**
   * Where the guard bites, stated plainly so it is not mistaken for a bug: a
   * stay later than every payout on the export is out of the export's reach,
   * and the same ghost goes unreported against a schedule that stops short of
   * it. Exporting the upcoming payouts as well as the paid ones is what keeps
   * the near future inside the span.
   */
  it('cannot see a ghost past the end of a truncated schedule', () => {
    const short = reconcile(books, schedule.filter(p => p.checkIn < '2026-11-23'), 'airbnb');
    expect(short.unpaid.map(b => b.id)).toEqual(['ira']);
  });
});

describe('what it refuses to call unpaid', () => {
  // An Airbnb export is silent about VRBO, and reading that silence as a
  // verdict would condemn every booking on every other channel
  it('ignores a stay from another channel', () => {
    const r = reconcile(
      [booked({ id: 'vrbo', platform: 'vrbo', confirmationCode: 'V-1', checkIn: '2026-11-12' })],
      [paid()],
      'airbnb',
    );
    expect(r.unpaid).toEqual([]);
    expect(r.matched).toBe(0);
  });

  /**
   * Exporting only the paid history must not condemn every future stay. The
   * span ends at the last check-in the export carried, so anything past it is
   * out of scope rather than unpaid.
   */
  it('ignores a stay later than the export reached', () => {
    const r = reconcile(
      [booked({ id: 'future', confirmationCode: 'HM999', checkIn: '2027-06-01' }), booked()],
      [paid()],
      'airbnb',
    );
    expect(r.unpaid).toEqual([]);
  });

  it('ignores a stay earlier than the export reached', () => {
    const r = reconcile(
      [booked({ id: 'old', confirmationCode: 'HM000', checkIn: '2024-03-02' }), booked()],
      [paid()],
      'airbnb',
    );
    expect(r.unpaid).toEqual([]);
  });

  it('judges nothing at all against an empty export', () => {
    const r = reconcile([booked()], [], 'airbnb');
    expect(r.unpaid).toEqual([]);
    expect(r.span).toBeNull();
  });

  it('takes the ends of the span as covered', () => {
    const r = reconcile(
      [booked({ id: 'edge', confirmationCode: 'HM500', checkIn: '2026-11-09' })],
      [paid({ confirmationCode: 'OTHER', checkIn: '2026-11-09', grossEarnings: 1 })],
      'airbnb',
    );
    // Matched on check-in rather than flagged, the dates being the same night
    expect(r.unpaid).toEqual([]);
    expect(r.matched).toBe(1);
  });
});

/**
 * A channel manager stores its own reservation code as often as the channel's,
 * so codes disagree across the two sides routinely. Falling back to check-in is
 * sound because the thing being reconciled is one unit, and a unit cannot hold
 * two stays starting the same night.
 */
describe('matching when the two sides use different codes', () => {
  const r = reconcile(
    [booked({ confirmationCode: 'HOSTEX-77' })],
    [paid({ confirmationCode: 'HMABCD' })],
    'airbnb',
  );

  it('falls back to the check-in date', () => expect(r.matched).toBe(1));
  it('reports neither side as orphaned', () => {
    expect(r.unpaid).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('prefers the code when one does match', () => {
    const matchedByCode = reconcile(
      [booked({ confirmationCode: 'HM001', checkIn: '2026-11-09', income: 100 })],
      [
        paid({ confirmationCode: 'HM001', checkIn: '2026-12-01', grossEarnings: 100 }),
        paid({ confirmationCode: 'OTHER', checkIn: '2026-11-09', grossEarnings: 999 }),
      ],
      'airbnb',
    );
    // The code wins, so there is no disagreement about money
    expect(matchedByCode.mismatched).toEqual([]);
    expect(matchedByCode.missing.map(p => p.confirmationCode)).toEqual(['OTHER']);
  });

  it('leaves a booking with no code to the date', () => {
    const noCode = reconcile(
      [booked({ confirmationCode: undefined })],
      [paid({ confirmationCode: 'HMABCD' })],
      'airbnb',
    );
    expect(noCode.matched).toBe(1);
  });
});

describe('books and schedule that disagree about money', () => {
  it('reports a stay booked for more than the channel is paying', () => {
    const r = reconcile([booked({ income: 600 })], [paid({ grossEarnings: 552.59 })], 'airbnb');
    expect(r.mismatched).toHaveLength(1);
    expect(r.mismatched[0].difference).toBeCloseTo(47.41, 2);
  });

  it('reports a stay booked for less, as a negative difference', () => {
    const r = reconcile([booked({ income: 500 })], [paid({ grossEarnings: 552.59 })], 'airbnb');
    expect(r.mismatched[0].difference).toBeCloseTo(-52.59, 2);
  });

  // Two exports rounding differently is not a finding worth a line of the report
  it('lets a rounding difference pass', () =>
    expect(reconcile([booked({ income: 552.59 })], [paid({ grossEarnings: 552.595 })], 'airbnb')
      .mismatched).toEqual([]));

  it('still counts a disagreeing stay as matched, not as unpaid', () => {
    const r = reconcile([booked({ income: 600 })], [paid()], 'airbnb');
    expect(r.matched).toBe(1);
    expect(r.unpaid).toEqual([]);
  });
});

describe('a payout with no booking behind it', () => {
  it('is reported wherever its dates fall', () => {
    const r = reconcile([], [paid({ checkIn: '2021-01-01' })], 'airbnb');
    expect(r.missing).toHaveLength(1);
  });

  it('is not claimed twice by two bookings on the same night', () => {
    const r = reconcile(
      [
        booked({ id: 'a', confirmationCode: undefined, checkIn: '2026-11-09' }),
        booked({ id: 'b', confirmationCode: undefined, checkIn: '2026-11-09' }),
      ],
      [paid()],
      'airbnb',
    );
    expect(r.missing).toEqual([]);
    expect(r.matched).toBe(2);
  });
});

// ─── Reading a real export ───────────────────────────────────────────────────

/**
 * The whole path, from the file a channel hands you to the verdict, against a
 * reproduction of the month that prompted this: nine stays in the books, seven
 * of them real, and two with no payout behind them in either the settled or the
 * scheduled export.
 */
describe('a channel export, end to end', () => {
  const header = 'Date,Arriving by date,Type,Confirmation code,Booking date,Start date,'
    + 'End date,Nights,Guest,Listing,Details,Reference code,Currency,Amount,Paid out,'
    + 'Host fee,Cleaning fee,Gross earnings,Earnings year';

  const row = (
    date: string, type: string, code: string, start: string, end: string,
    nights: number, guest: string, gross: string,
  ) => `${date},,${type},${code},2026-08-01,${start},${end},${nights},${guest},`
    + `"Cozy Loft",,,USD,${gross},${gross},0.00,125.00,${gross},2026`;

  // What Airbnb settled, newest last
  const settled = [
    header,
    row('2026-11-09', 'Reservation', 'HMALISSA', '2026-11-06', '2026-11-07', 1, 'Alissa', '346.62'),
    row('2026-11-09', 'Reservation', 'HMBROOKE', '2026-11-07', '2026-11-08', 1, 'Brookes', '336.31'),
    row('2026-11-10', 'Reservation', 'HMELIAS', '2026-11-09', '2026-11-13', 4, 'Elias', '552.59'),
    // A payout batch, which belongs to no single stay and must be ignored
    '2026-11-10,,Payout,,,,,,,,"Payout to account ****1234",,USD,-1235.52,,,,,2026',
  ].join('\n');

  // What Airbnb has scheduled, including one far-future stay
  const scheduled = [
    header,
    row('2026-11-14', 'Reservation', 'HMPAULA', '2026-11-13', '2026-11-14', 1, 'Paula', '397.57'),
    row('2026-11-15', 'Reservation', 'HMMELISSA', '2026-11-14', '2026-11-16', 2, 'Melissa', '432.13'),
    row('2026-11-20', 'Reservation', 'HMMICHELLE', '2026-11-19', '2026-11-20', 1, 'Michelle', '296.76'),
    row('2026-11-23', 'Reservation', 'HMCATH', '2026-11-22', '2026-11-28', 6, 'Catherine', '1996.73'),
    row('2027-10-22', 'Reservation', 'HMFAR', '2027-10-21', '2027-10-24', 3, 'Dana', '761.94'),
  ].join('\n');

  const payouts = mergePayouts([
    readPayouts(parseCSV(settled)),
    readPayouts(parseCSV(scheduled)),
  ]);

  const stay = (code: string, guest: string, ci: string, co: string, income: number) =>
    ({ id: guest.toLowerCase(), platform: 'airbnb', confirmationCode: code,
      checkIn: ci, checkOut: co, guestName: guest, income });

  const books = [
    stay('HMALISSA', 'Alissa', '2026-11-06', '2026-11-07', 346.62),
    stay('HMBROOKE', 'Brookes', '2026-11-07', '2026-11-08', 336.31),
    stay('HMELIAS', 'Elias', '2026-11-09', '2026-11-13', 552.59),
    stay('HMIRA', 'Ira', '2026-11-12', '2026-11-15', 410.00),        // cancelled, never pruned
    stay('HMPAULA', 'Paula', '2026-11-13', '2026-11-14', 397.57),
    stay('HMMELISSA', 'Melissa', '2026-11-14', '2026-11-16', 432.13),
    stay('HMMICHELLE', 'Michelle', '2026-11-19', '2026-11-20', 296.76),
    stay('HMCATH', 'Catherine', '2026-11-22', '2026-11-28', 1996.73),
    stay('HMBETH', 'Beth', '2026-11-25', '2026-11-28', 380.00),      // cancelled, never pruned
  ];

  it('reads only the reservations, never the payout batches', () =>
    expect(payouts).toHaveLength(8));

  it('counts a stay listed in both exports once', () => {
    const twice = mergePayouts([
      readPayouts(parseCSV(settled)), readPayouts(parseCSV(settled)),
    ]);
    expect(twice).toHaveLength(3);
  });

  it('covers the dates the two files reach between them', () =>
    expect(reconcile(books, payouts, 'airbnb').span)
      .toEqual({ from: '2026-11-06', to: '2027-10-21' }));

  it('names the two ghosts and nothing else', () =>
    expect(reconcile(books, payouts, 'airbnb').unpaid.map(b => b.guestName))
      .toEqual(['Ira', 'Beth']));

  it('values the revenue that will never arrive', () =>
    expect(reconcile(books, payouts, 'airbnb').unpaidIncome).toBeCloseTo(790, 2));

  it('matches every genuine stay', () =>
    expect(reconcile(books, payouts, 'airbnb').matched).toBe(7));

  it('reports the scheduled stay the books have not recorded', () =>
    expect(reconcile(books, payouts, 'airbnb').missing.map(p => p.guestName)).toEqual(['Dana']));

  it('finds no disagreement about money on the genuine stays', () =>
    expect(reconcile(books, payouts, 'airbnb').mismatched).toEqual([]));

  /**
   * The point of the exercise: with the two ghosts gone the month turns over
   * cleanly, each guest arriving the day the last one left.
   */
  it('leaves a calendar that turns over without a clash', () => {
    const { unpaid } = reconcile(books, payouts, 'airbnb');
    const ghosts = new Set(unpaid.map(b => b.id));
    const real = books.filter(b => !ghosts.has(b.id));
    for (let i = 1; i < real.length; i++) {
      expect(real[i].checkIn >= real[i - 1].checkOut).toBe(true);
    }
  });
});
