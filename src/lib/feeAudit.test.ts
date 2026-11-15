import { describe, expect, it } from 'vitest';
import { auditFees, type FeeRow } from '@/lib/feeAudit';

/** A stay on Airbnb's host-only pricing: $1,000 gross, 15% cut, $850 landing. */
const row = (over: Partial<FeeRow> = {}): FeeRow => ({
  platform: 'airbnb', income: 1000, platformFee: 150, paidOut: 850, ...over,
});

describe('a channel whose fees are recorded correctly', () => {
  const [a] = auditFees([row(), row(), row()]);

  it('reads the recorded rate off the books', () => expect(a.recordedRatePct).toBeCloseTo(15, 6));

  // The independent reading: what the bank actually received
  it('derives the same rate from the payouts', () => expect(a.impliedRatePct).toBeCloseTo(15, 6));

  it('finds no gap between the two', () => expect(a.shortfall).toBeCloseTo(0, 6));
  it('finds no booking missing its fee', () => expect(a.missingFee).toBe(0));
  it('totals the gross', () => expect(a.gross).toBe(3000));
  it('totals the recorded fees', () => expect(a.feesRecorded).toBe(450));
});

/**
 * The failure this exists to catch. A booking imported without its fee does not
 * read as a missing cost — it reads as a better month, by the whole cut.
 */
describe('fees that never arrived', () => {
  const [a] = auditFees([
    row(),
    row({ platformFee: undefined }),
    row({ platformFee: undefined }),
  ]);

  it('counts the bookings with no fee on them', () => expect(a.missingFee).toBe(2));

  it('says how much revenue is being reported with no cut taken', () =>
    expect(a.grossMissingFee).toBe(2000));

  it('drags the recorded rate below the real one', () => {
    expect(a.recordedRatePct).toBeCloseTo(5, 6);
    expect(a.impliedRatePct).toBeCloseTo(15, 6);
  });

  // The headline: fees are being under-recorded by this much money
  it('puts a number on the shortfall', () => expect(a.shortfall).toBeCloseTo(300, 6));
});

describe('separating the cut from everything else withheld', () => {
  // Occupancy tax the channel collects and remits sits between gross and payout
  // too, and would read as commission if it were not netted off
  it('does not count platform-remitted tax as commission', () => {
    const [a] = auditFees([row({ income: 1100, paidOut: 850, taxRemitted: 100 })]);
    expect(a.feesImplied).toBeCloseTo(150, 6);
  });

  it('does not count withheld tax as commission', () => {
    const [a] = auditFees([row({ income: 1000, paidOut: 800, taxWithheld: 50 })]);
    expect(a.feesImplied).toBeCloseTo(150, 6);
  });

  it('does not count a fast-pay charge as commission', () => {
    const [a] = auditFees([row({ paidOut: 835, fastPayFee: 15 })]);
    expect(a.feesImplied).toBeCloseTo(150, 6);
  });
});

describe('what it declines to conclude', () => {
  // A rate over every booking against one over the few with payouts would
  // differ for reasons that have nothing to do with fees
  it('compares the two rates over the same bookings', () => {
    const [a] = auditFees([
      row(),
      row({ paidOut: undefined, income: 9000, platformFee: 0 }),
    ]);
    expect(a.withPayout).toBe(1);
    expect(a.grossWithPayout).toBe(1000);
    expect(a.impliedRatePct).toBeCloseTo(15, 6);
    // The shortfall is read over the booking that can be checked, not the other
    expect(a.shortfall).toBeCloseTo(0, 6);
  });

  it('derives no rate where no payout is known', () => {
    const [a] = auditFees([row({ paidOut: undefined })]);
    expect(a.impliedRatePct).toBeNull();
    expect(a.withPayout).toBe(0);
  });

  it('derives no rate from a channel with no revenue', () => {
    const [a] = auditFees([row({ income: 0, platformFee: 0, paidOut: 0 })]);
    expect(a.recordedRatePct).toBeNull();
    expect(a.impliedRatePct).toBeNull();
  });

  // A direct booking takes no commission, and a 0% rate there is the right answer
  it('reports a zero rate rather than a fault on a direct booking', () => {
    const [a] = auditFees([
      { platform: 'direct', income: 1000, platformFee: 0, paidOut: 1000 },
    ]);
    expect(a.recordedRatePct).toBe(0);
    expect(a.impliedRatePct).toBe(0);
    expect(a.shortfall).toBe(0);
  });
});

describe('several channels', () => {
  const audit = auditFees([
    row({ income: 1000 }), row({ income: 1000 }),
    { platform: 'vrbo', income: 500, platformFee: 25, paidOut: 475 },
    { platform: 'direct', income: 300, platformFee: 0, paidOut: 300 },
  ]);

  it('reports each one separately', () => expect(audit).toHaveLength(3));

  it('puts the biggest earner first', () =>
    expect(audit.map(a => a.platform)).toEqual(['airbnb', 'vrbo', 'direct']));

  it('keeps each channel’s rate to itself', () => {
    expect(audit[0].recordedRatePct).toBeCloseTo(15, 6);
    expect(audit[1].recordedRatePct).toBeCloseTo(5, 6);
    expect(audit[2].recordedRatePct).toBe(0);
  });

  it('reports nothing at all for no bookings', () => expect(auditFees([])).toEqual([]));
});
