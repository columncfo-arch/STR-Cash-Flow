import { describe, expect, it } from 'vitest';
import { basisFor, mergeBasis, mergeRows } from '@/lib/forecastAggregate';
import type { ForecastYear, Settings } from '@/types';

const settings = (over: Partial<Settings> = {}) => ({
  monthlyPITI: 2800, propertyValue: 680_000, loanBalance: 500_000,
  mortgageRate: 6.5, loanTermYears: 30, loanStructure: 'fixed',
  monthlyPropertyTax: 450, monthlyInsurance: 180,
  totalCapitalDeployed: 150_000, benchmarkReturnPct: 8, propertyAppreciationPct: 3,
  ...over,
}) as Settings;

const row = (year: number, over: Partial<ForecastYear> = {}): ForecastYear => ({
  year, type: 'forecast', grossRevenue: 84_000, platformFees: 8_400,
  operatingExpenses: 14_000, piti: 33_600, netIncome: 28_000, growthPct: 5,
  isManualRevenue: false, isManualExpenses: false, isManualPiti: false,
  isManualEntry: false, blended: false, ...over,
});

describe('what one unit brings to the figures', () => {
  const basis = basisFor(settings(), 5);

  it('takes escrow from the stated tax and insurance', () =>
    expect(basis.annualEscrow).toBe((450 + 180) * 12));

  it('takes debt service as principal and interest, not the whole payment', () => {
    expect(basis.annualDebtService).toBeLessThan(2800 * 12);
    expect(basis.annualDebtService).toBe(2800 * 12 - basis.annualEscrow!);
  });

  it('amortises one entry per year of the horizon, plus today', () =>
    expect(basis.balanceAfter).toHaveLength(6));

  it('starts at what is owed now', () =>
    expect(basis.balanceAfter[0]).toBeCloseTo(500_000, 2));

  it('owes less each year', () => {
    for (let n = 1; n < 6; n++) {
      expect(basis.balanceAfter[n]).toBeLessThan(basis.balanceAfter[n - 1]);
    }
  });

  // Without loan detail or a stated escrow there is nothing to separate, and a
  // guess would flatter every ratio built on it
  it('reports no escrow where there is nothing to separate it from', () =>
    expect(basisFor(settings({
      loanBalance: 0, mortgageRate: 0, monthlyPropertyTax: 0, monthlyInsurance: 0,
    }), 5).annualEscrow).toBeNull());
});

describe('adding units together', () => {
  const a = basisFor(settings(), 5);
  const b = basisFor(settings({
    propertyValue: 220_000, loanBalance: 120_000, monthlyPITI: 1_100,
    monthlyPropertyTax: 180, monthlyInsurance: 70, totalCapitalDeployed: 60_000,
    propertyAppreciationPct: 6,
  }), 5);
  const both = mergeBasis([a, b], 5);

  it('sums what the units are worth', () => expect(both.propertyValue).toBe(900_000));
  it('sums what is owed on them', () => expect(both.loanBalance).toBe(620_000));
  it('sums the capital put in', () => expect(both.capitalDeployed).toBe(210_000));
  it('sums the escrow', () => expect(both.annualEscrow).toBe(a.annualEscrow! + b.annualEscrow!));
  it('sums the debt service', () =>
    expect(both.annualDebtService).toBeCloseTo(a.annualDebtService + b.annualDebtService, 6));

  it('sums the amortisation year by year', () =>
    expect(both.balanceAfter[3]).toBeCloseTo(a.balanceAfter[3] + b.balanceAfter[3], 6));

  // 3% on $680k and 6% on $220k is not 4.5%: the bigger building's assumption
  // decides more of the portfolio's value
  it('weights appreciation by what each unit is worth', () => {
    expect(both.appreciationPct).toBeCloseTo((3 * 680_000 + 6 * 220_000) / 900_000, 6);
    expect(both.appreciationPct).toBeLessThan(4.5);
  });

  /**
   * One unit without loan detail takes the portfolio's NOI with it. Summing
   * only the units that can separate their escrow would understate the cost of
   * running the portfolio and overstate every ratio built on it — in the
   * flattering direction, which is the one worth refusing.
   */
  it('reports no escrow at all when any one unit cannot separate its own', () => {
    const missing = basisFor(settings({
      loanBalance: 0, mortgageRate: 0, monthlyPropertyTax: 0, monthlyInsurance: 0,
    }), 5);
    expect(mergeBasis([a, missing], 5).annualEscrow).toBeNull();
  });

  it('takes a benchmark rather than averaging one, it being a preference', () =>
    expect(mergeBasis([a, basisFor(settings({ benchmarkReturnPct: 12 }), 5)], 5).benchmarkPct)
      .toBe(a.benchmarkPct));
});

describe('adding units’ years together', () => {
  const merged = mergeRows([
    [row(2025, { type: 'actual' }), row(2026, { type: 'partial', blended: true, ytdGross: 70_000 }), row(2027)],
    [row(2025, { type: 'actual', grossRevenue: 30_000, netIncome: 9_000 }),
      row(2026, { type: 'partial', blended: true, grossRevenue: 30_000, netIncome: 9_000, ytdGross: 25_000 }),
      row(2027, { grossRevenue: 30_000, netIncome: 9_000 })],
  ], 2026);

  it('returns one row per year, in order', () =>
    expect(merged.map(r => r.year)).toEqual([2025, 2026, 2027]));

  it('sums the money', () => {
    expect(merged[0].grossRevenue).toBe(114_000);
    expect(merged[0].netIncome).toBe(37_000);
  });

  it('sums the mortgage across units', () => expect(merged[0].piti).toBe(67_200));

  it('sums the year-to-date split the blended year carries', () =>
    expect(merged[1].ytdGross).toBe(95_000));

  // Whether a year is settled is a fact about the calendar, not about a unit
  it('reads each year’s standing off the calendar', () => {
    expect(merged[0].type).toBe('actual');
    expect(merged[1].type).toBe('partial');
    expect(merged[1].blended).toBe(true);
    expect(merged[2].type).toBe('forecast');
  });

  // There is no single property for a pencil on a portfolio row to write to
  it('drops the per-unit editing flags', () => {
    expect(merged[0].isManualEntry).toBe(false);
    expect(merged[0].isManualRevenue).toBe(false);
  });

  it('keeps a year only one unit has', () => {
    const uneven = mergeRows([[row(2024, { type: 'actual' })], [row(2025, { type: 'actual' })]], 2026);
    expect(uneven.map(r => r.year)).toEqual([2024, 2025]);
    expect(uneven[0].grossRevenue).toBe(84_000);
  });

  it('leaves nights absent where no unit reported any', () =>
    expect(merged[2].totalNights).toBeUndefined());

  it('sums nights where units reported them', () => {
    const nights = mergeRows([
      [row(2025, { type: 'actual', totalNights: 262 })],
      [row(2025, { type: 'actual', totalNights: 180 })],
    ], 2026);
    expect(nights[0].totalNights).toBe(442);
  });
});
