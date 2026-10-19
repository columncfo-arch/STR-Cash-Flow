import { describe, expect, it } from 'vitest';
import { balanceAfterMonths, monthlyPrincipalAndInterest, splitPiti } from '@/lib/mortgage';
import type { LoanStructure, Settings } from '@/types';

const settings = (over: Partial<Settings> = {}) => ({ monthlyPITI: 3750, ...over }) as Settings;

const loan = settings({
  loanBalance: 320_000, mortgageRate: 6.75, loanTermYears: 27, loanStructure: 'fixed',
});

describe('splitting a mortgage payment into what it costs and what it buys', () => {
  const pAndI = monthlyPrincipalAndInterest(loan)!;
  const split = splitPiti(loan);

  it('computes a sane monthly principal and interest', () => {
    expect(pAndI).toBeGreaterThan(2000);
    expect(pAndI).toBeLessThan(2400);
  });

  // The guarantee the whole split rests on: the dashboard subtracts interest
  // and escrow as costs and treats principal as equity, so three parts that do
  // not add back to the payment would quietly invent or lose money
  it('always sums back to the payment', () =>
    expect(split.interest + split.principal + split.taxesInsurance).toBeCloseTo(3750, 6));

  it('takes interest as balance × monthly rate', () =>
    expect(split.interest).toBeCloseTo(320_000 * 0.0675 / 12, 2));

  it('takes principal as the rest of the loan payment', () =>
    expect(split.principal).toBeCloseTo(pAndI - split.interest, 2));

  it('says the split was derived', () => expect(split.derived).toBe(true));

  describe('with tax and insurance stated', () => {
    const stated = splitPiti({ ...loan, monthlyPropertyTax: 450, monthlyInsurance: 180 });

    // The residual goes to escrow, never to principal: overstating equity built
    // is the one error here that flatters the owner
    it('treats a stated figure as a floor, not a ceiling', () =>
      expect(stated.taxesInsurance).toBeGreaterThanOrEqual(630));
    it('still sums back to the payment', () =>
      expect(stated.interest + stated.principal + stated.taxesInsurance).toBeCloseTo(3750, 6));
    it('never inflates principal by stating it', () =>
      expect(stated.principal).toBeLessThanOrEqual(splitPiti(loan).principal + 0.01));
    it('never claims more principal than the loan implies', () =>
      expect(stated.principal).toBeLessThanOrEqual(pAndI + 0.01));
  });

  describe('when tax and insurance squeeze the loan share', () => {
    const squeezed = splitPiti({ ...loan, monthlyPropertyTax: 1500, monthlyInsurance: 500 });

    it('caps what is left for the loan', () =>
      expect(squeezed.interest + squeezed.principal).toBeLessThanOrEqual(3750 - 2000 + 0.001));
    it('still sums back to the payment', () =>
      expect(squeezed.interest + squeezed.principal + squeezed.taxesInsurance).toBeCloseTo(3750, 6));
    it('never claims more principal than the loan implies', () =>
      expect(squeezed.principal).toBeLessThanOrEqual(pAndI + 0.01));
  });
});

describe('when there is not enough to split on', () => {
  it('invents nothing without loan data', () => {
    const bare = splitPiti(settings());
    expect(bare.interest).toBe(0);
    expect(bare.principal).toBe(0);
    expect(bare.derived).toBe(false);
  });

  it('calls the whole payment tax and insurance without loan data', () =>
    expect(splitPiti(settings()).taxesInsurance).toBeCloseTo(3750, 2));

  it('does not split at a 0% rate, having no interest to separate', () =>
    expect(splitPiti(settings({
      loanBalance: 120_000, mortgageRate: 0, loanTermYears: 20,
    })).derived).toBe(false));

  it('returns nothing at all when there is no payment', () => {
    const none = splitPiti(settings({ monthlyPITI: 0 }));
    expect([none.interest, none.principal, none.taxesInsurance]).toEqual([0, 0, 0]);
  });
});

describe('an interest-only loan', () => {
  const io = splitPiti(settings({
    loanBalance: 320_000, mortgageRate: 6.75, loanTermYears: 27, loanStructure: 'interest_only',
  }));

  it('builds no equity', () => expect(io.principal).toBeCloseTo(0, 2));
  it('still sums back to the payment', () =>
    expect(io.interest + io.principal + io.taxesInsurance).toBeCloseTo(3750, 6));
});

describe('a payment too small for the loan behind it', () => {
  // A stale PITI against a current balance: interest alone would swallow it
  const stale = splitPiti(settings({
    monthlyPITI: 900, loanBalance: 320_000, mortgageRate: 6.75, loanTermYears: 27,
  }));

  it('caps interest at the payment', () => expect(stale.interest).toBeLessThanOrEqual(900));
  it('never reports negative principal', () => expect(stale.principal).toBeGreaterThanOrEqual(0));
  it('still sums back to the payment', () =>
    expect(stale.interest + stale.principal + stale.taxesInsurance).toBeCloseTo(900, 6));
});

/**
 * `balanceAfterMonths` replaced an amortisation worked inline on the forecast
 * page. These cases hold it to that page's own arithmetic across the parameter
 * space, so the extraction cannot have moved a single projected balance.
 */
describe('amortisation matches the forecast maths it replaced', () => {
  function previousForecastBalance(
    loanBalance: number, mortgageRate: number, loanTermYears: number,
    loanStructure: LoanStructure, yearsFromNow: number,
  ): number {
    const monthlyRate = mortgageRate / 100 / 12;
    const totalPayments = loanTermYears * 12;
    const hasEquityData = loanBalance > 0;
    let monthlyPayment = 0;
    if (hasEquityData && loanStructure !== 'interest_only' && totalPayments > 0) {
      if (monthlyRate > 0) {
        const factor = Math.pow(1 + monthlyRate, totalPayments);
        monthlyPayment = loanBalance * monthlyRate * factor / (factor - 1);
      } else monthlyPayment = loanBalance / totalPayments;
    }
    if (!hasEquityData) return 0;
    if (loanStructure === 'interest_only') return loanBalance;
    const months = yearsFromNow * 12;
    let balance: number;
    if (monthlyRate > 0 && monthlyPayment > 0) {
      const factor = Math.pow(1 + monthlyRate, months);
      balance = loanBalance * factor - monthlyPayment * (factor - 1) / monthlyRate;
    } else if (monthlyPayment > 0) balance = loanBalance - monthlyPayment * months;
    else balance = loanBalance;
    return Math.max(0, balance);
  }

  const cases = [320_000, 95_000, 750_000].flatMap(balance =>
    [0, 3.25, 6.75].flatMap(rate =>
      [10, 27, 30].flatMap(term =>
        (['fixed', 'arm', 'interest_only'] as LoanStructure[]).flatMap(structure =>
          [0, 1, 5, 10, 30].map(years => ({ balance, rate, term, structure, years })),
        ))));

  it(`matches across all ${cases.length} combinations of balance, rate, term, structure and horizon`, () => {
    for (const c of cases) {
      const want = previousForecastBalance(c.balance, c.rate, c.term, c.structure, c.years);
      const got = balanceAfterMonths(
        {
          loanBalance: c.balance, mortgageRate: c.rate,
          loanTermYears: c.term, loanStructure: c.structure,
        } as Settings,
        c.years * 12,
      );
      expect(got, `${JSON.stringify(c)}`).toBeCloseTo(want, 2);
    }
  });
});
