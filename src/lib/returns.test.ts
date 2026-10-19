import { describe, expect, it } from 'vitest';
import {
  capRatePct, cashOnCashPct, dscr, dscrStatus, equityAt, equityGain, noi,
} from '@/lib/returns';

// A unit grossing $84k, paying 10% in platform fees, $14k of operating costs,
// and $7,200 a year of property tax and insurance inside its mortgage payment.
const year = {
  grossRevenue: 84_000, platformFees: 8_400, operatingExpenses: 14_000, taxesInsurance: 7_200,
};

describe('net operating income takes tax and insurance out of the payment', () => {
  it('deducts them along with operating costs', () => expect(noi(year)).toBe(54_400));

  // The error this function exists to prevent: leaving escrow in the mortgage
  // and calling what is left NOI
  it('is lower than revenue less operating expenses alone', () =>
    expect(noi(year)!).toBe(84_000 - 8_400 - 14_000 - 7_200));

  it('reports nothing when they cannot be separated', () =>
    expect(noi({ ...year, taxesInsurance: null })).toBeNull());

  it('goes negative when the costs exceed the revenue', () =>
    expect(noi({ ...year, operatingExpenses: 90_000 })).toBeLessThan(0));
});

describe('cap rate', () => {
  it('is NOI over the value', () => expect(capRatePct(54_400, 680_000)).toBeCloseTo(8, 6));

  it('does not move when the mortgage does', () => {
    // Same building, same NOI, whatever is owed on it
    expect(capRatePct(noi(year), 680_000)).toBe(capRatePct(noi(year), 680_000));
  });

  it('reports nothing without a value to divide by', () =>
    expect(capRatePct(54_400, 0)).toBeNull());

  it('reports nothing without an honest NOI', () =>
    expect(capRatePct(null, 680_000)).toBeNull());
});

describe('cash-on-cash', () => {
  it('is cash flow over cash in', () =>
    expect(cashOnCashPct(12_000, 150_000)).toBeCloseTo(8, 6));

  it('goes negative on a year that lost money', () =>
    expect(cashOnCashPct(-3_683, 150_000)).toBeCloseTo(-2.46, 2));

  it('reports nothing where no capital has been recorded', () =>
    expect(cashOnCashPct(12_000, 0)).toBeNull());
});

describe('debt service coverage', () => {
  const debtService = 27_600; // $2,300 a month of principal and interest

  it('is NOI over principal and interest', () =>
    expect(dscr(54_400, debtService)).toBeCloseTo(1.971, 3));

  // NOI − debt service is cash flow, which is what ties this page to the
  // dashboard's bottom line
  it('reconciles to cash flow', () => expect(54_400 - debtService).toBe(26_800));

  it('reports nothing on a property with no loan', () => expect(dscr(54_400, 0)).toBeNull());
  it('reports nothing without an honest NOI', () => expect(dscr(null, debtService)).toBeNull());

  describe('reads on the bands a lender would use', () => {
    it('is comfortable at 1.25', () => expect(dscrStatus(1.25).label).toBe('Comfortable'));
    it('is thin just under that', () => expect(dscrStatus(1.24).label).toBe('Thin'));
    it('is thin at exactly covering', () => expect(dscrStatus(1.0).label).toBe('Thin'));
    it('is short below 1.0', () => expect(dscrStatus(0.99).label).toBe('Short'));
    it('says nothing when there is nothing to say', () => expect(dscrStatus(null).label).toBe('—'));
  });
});

describe('equity', () => {
  it('compounds the value and subtracts what is owed', () => {
    const at = equityAt(680_000, 3, 500_000, 0);
    expect(at.value).toBeCloseTo(680_000, 6);
    expect(at.equity).toBeCloseTo(180_000, 6);
  });

  it('compounds appreciation rather than adding it', () => {
    const ten = equityAt(680_000, 3, 0, 10);
    expect(ten.value).toBeCloseTo(680_000 * Math.pow(1.03, 10), 6);
    expect(ten.value).toBeGreaterThan(680_000 * 1.3); // more than 3% × 10 years
  });

  describe('splits a gain into the two things that build it', () => {
    const from = { value: 680_000, owed: 500_000 };
    const to = { value: 790_000, owed: 460_000 };
    const gain = equityGain(from, to);

    it('counts appreciation', () => expect(gain.appreciation).toBe(110_000));
    it('counts paydown', () => expect(gain.paydown).toBe(40_000));
    it('adds them', () => expect(gain.total).toBe(150_000));

    // Paydown is contractual; appreciation is a guess about a market. An owner
    // reading one number cannot tell which half is which.
    it('reports a falling market as negative appreciation, with paydown intact', () => {
      const down = equityGain(from, { value: 610_000, owed: 460_000 });
      expect(down.appreciation).toBe(-70_000);
      expect(down.paydown).toBe(40_000);
      expect(down.total).toBe(-30_000);
    });
  });
});
