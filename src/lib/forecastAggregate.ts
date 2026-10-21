// Adding several properties' forecasts together.
//
// The portfolio is built from the same per-unit figures the single-property
// page reads, so a number here and the same number on one property's page
// cannot drift apart. What cannot simply be added — a split of a mortgage
// payment, an amortisation schedule, a growth assumption — is worked out per
// unit first and only then summed.

import { balanceAfterMonths, splitPiti } from '@/lib/mortgage';
import type { ForecastYear, Settings } from '@/types';

/** What the returns on a forecast are measured against. */
export interface ForecastBasis {
  propertyValue: number;
  loanBalance: number;
  capitalDeployed: number;
  benchmarkPct: number;
  /** Value-weighted across units: a 2% assumption on a $900k house should not
   *  be averaged flat against 6% on a $200k flat. */
  appreciationPct: number;
  /**
   * Property tax and insurance for a year, separated out of the mortgage
   * payment. Null where any unit cannot separate its own — summing only the
   * units that can would understate costs and flatter every ratio built on it.
   */
  annualEscrow: number | null;
  annualDebtService: number;
  /** What is still owed n years out, summed. The index is years from now. */
  balanceAfter: number[];
}

/** What one unit brings to the figures the forecast page reports. */
export function basisFor(settings: Settings, horizon: number): ForecastBasis {
  const piti = splitPiti(settings);
  const stated = (settings.monthlyPropertyTax ?? 0) + (settings.monthlyInsurance ?? 0);
  return {
    propertyValue: settings.propertyValue ?? 0,
    loanBalance: settings.loanBalance ?? 0,
    capitalDeployed: settings.totalCapitalDeployed ?? 0,
    benchmarkPct: settings.benchmarkReturnPct ?? 8,
    appreciationPct: settings.propertyAppreciationPct ?? 0,
    annualEscrow: piti.derived ? piti.taxesInsurance * 12 : stated > 0 ? stated * 12 : null,
    annualDebtService: (piti.interest + piti.principal) * 12,
    balanceAfter: Array.from({ length: horizon + 1 }, (_, n) => balanceAfterMonths(settings, n * 12)),
  };
}

export function mergeBasis(parts: ForecastBasis[], horizon: number): ForecastBasis {
  const sum = (pick: (p: ForecastBasis) => number) => parts.reduce((s, p) => s + pick(p), 0);
  const value = sum(p => p.propertyValue);
  return {
    propertyValue: value,
    loanBalance: sum(p => p.loanBalance),
    capitalDeployed: sum(p => p.capitalDeployed),
    // A benchmark is a preference rather than a fact about a building, so it
    // is taken rather than combined
    benchmarkPct: parts[0]?.benchmarkPct ?? 8,
    appreciationPct: value > 0
      ? sum(p => p.appreciationPct * p.propertyValue) / value
      : (parts[0]?.appreciationPct ?? 0),
    annualEscrow: parts.some(p => p.annualEscrow == null) ? null : sum(p => p.annualEscrow ?? 0),
    annualDebtService: sum(p => p.annualDebtService),
    balanceAfter: Array.from({ length: horizon + 1 }, (_, n) =>
      parts.reduce((s, p) => s + (p.balanceAfter[n] ?? 0), 0)),
  };
}

/**
 * Several units' years, added together.
 *
 * Whether a year is settled is a fact about the calendar rather than about any
 * one unit, so the portfolio reads it off the year. The per-unit editing flags
 * do not survive: there is no single property for a pencil on a row to write to.
 */
export function mergeRows(perProperty: ForecastYear[][], currentYear: number): ForecastYear[] {
  const add = (a: number | undefined, b: number | undefined) =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
  const byYear = new Map<number, ForecastYear>();
  for (const rows of perProperty) {
    for (const r of rows) {
      const got = byYear.get(r.year);
      byYear.set(r.year, got ? {
        ...got,
        grossRevenue: got.grossRevenue + r.grossRevenue,
        platformFees: got.platformFees + r.platformFees,
        operatingExpenses: got.operatingExpenses + r.operatingExpenses,
        piti: got.piti + r.piti,
        netIncome: got.netIncome + r.netIncome,
        totalNights: add(got.totalNights, r.totalNights),
        ytdGross: add(got.ytdGross, r.ytdGross),
        ytdPlatformFees: add(got.ytdPlatformFees, r.ytdPlatformFees),
        ytdOpEx: add(got.ytdOpEx, r.ytdOpEx),
        forecastGross: add(got.forecastGross, r.forecastGross),
        forecastPlatformFees: add(got.forecastPlatformFees, r.forecastPlatformFees),
        forecastOpEx: add(got.forecastOpEx, r.forecastOpEx),
      } : {
        ...r,
        type: r.year < currentYear ? 'actual' : r.year === currentYear ? 'partial' : 'forecast',
        blended: r.year === currentYear,
        isManualRevenue: false,
        isManualExpenses: false,
        isManualPiti: false,
        isManualEntry: false,
      });
    }
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}
