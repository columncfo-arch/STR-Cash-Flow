import { NextResponse } from 'next/server';
import { loadBookings, loadExpenses, loadSettings } from '@/lib/storage';
import { ForecastYear, Expense } from '@/types';
import { getYear } from 'date-fns';

function expandExpensesForYear(expenses: Expense[], year: number): Expense[] {
  const result: Expense[] = [];
  const yearPrefixes = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  for (const e of expenses) {
    if (!e.recurring) {
      if (e.date.startsWith(String(year))) result.push(e);
      continue;
    }
    const startPrefix = e.date.slice(0, 7);
    const endPrefix = e.recurrenceEnd ? e.recurrenceEnd.slice(0, 7) : null;
    for (const p of yearPrefixes) {
      if (p >= startPrefix && (!endPrefix || p <= endPrefix)) result.push(e);
    }
  }
  return result;
}

export async function GET() {
  try {
    const [allBookings, allExpenses, settings] = await Promise.all([
      loadBookings(),
      loadExpenses(),
      loadSettings(),
    ]);

    const now = new Date();
    const currentYear = getYear(now);
    const currentMonthIdx = now.getMonth(); // 0-indexed

    // Find all historical years from booking data
    const historicalYears = [...new Set(allBookings.map(b => getYear(new Date(b.checkIn))))].sort();

    // Build set of years to show: historical + current + next 5
    // Minimum total of 5 years shown; if fewer historical, fill forward
    const futureYears = [currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 4, currentYear + 5];
    const allYears = [...new Set([...historicalYears, currentYear, ...futureYears])].sort();

    // Compute actuals per historical/current year
    const actualsByYear = new Map<number, { grossRevenue: number; operatingExpenses: number }>();
    for (const yr of [...historicalYears, currentYear]) {
      const yrBookings = allBookings.filter(b => b.checkIn.startsWith(String(yr)));
      const gross = yrBookings.reduce((s, b) => s + b.income, 0);
      const platformFees = yrBookings.reduce((s, b) => s + (b.platformFee ?? 0), 0);
      const fastPayFees = yrBookings.reduce((s, b) => s + (b.fastPayFee ?? 0), 0);
      const taxRemitted = yrBookings.reduce((s, b) => s + (b.taxRemitted ?? 0) + (b.taxWithheld ?? 0), 0);
      const refunds = yrBookings.reduce((s, b) => s + (b.lodgingTaxOwnerRemits ?? 0), 0);
      const cleaningAuto = (settings.cleaningFeePerBooking ?? 0) * yrBookings.length;

      const yrExpenses = expandExpensesForYear(allExpenses, yr);
      const manualExpenses = yrExpenses
        .filter(e => e.category !== 'refund')
        .reduce((s, e) => s + e.amount, 0);

      const deductions = platformFees + fastPayFees + taxRemitted + refunds;
      const totalOpEx = manualExpenses + cleaningAuto + deductions;

      actualsByYear.set(yr, { grossRevenue: gross, operatingExpenses: totalOpEx });
    }

    // Find the best base year for forecasting: last full historical year before current
    const lastFullYear = historicalYears.filter(y => y < currentYear).slice(-1)[0] ?? currentYear;

    const rows: ForecastYear[] = [];
    let prevGross: number | null = null;
    let prevOpEx: number | null = null;

    for (const yr of allYears) {
      const overrides = settings.forecastOverrides?.[String(yr)] ?? {};
      const isPast = yr < currentYear;
      const isCurrent = yr === currentYear;
      const isFuture = yr > currentYear;

      const growthPct = settings.forecastGrowthByYear?.[String(yr)] ?? settings.forecastGrowthPct ?? 0;
      const growthFactor = 1 + growthPct / 100;

      let grossRevenue: number;
      let operatingExpenses: number;
      let type: ForecastYear['type'];
      let isManualRevenue = false;
      let isManualExpenses = false;

      if (isPast || isCurrent) {
        const actuals = actualsByYear.get(yr) ?? { grossRevenue: 0, operatingExpenses: 0 };
        grossRevenue = overrides.revenue ?? actuals.grossRevenue;
        operatingExpenses = overrides.expenses ?? actuals.operatingExpenses;
        isManualRevenue = overrides.revenue !== undefined;
        isManualExpenses = overrides.expenses !== undefined;
        type = isPast ? 'actual' : (currentMonthIdx < 11 ? 'partial' : 'actual');
      } else {
        // Forecast: apply growth to last known year's figures
        const baseGross = prevGross ?? actualsByYear.get(lastFullYear)?.grossRevenue ?? 0;
        const baseOpEx = prevOpEx ?? actualsByYear.get(lastFullYear)?.operatingExpenses ?? 0;
        const projectedGross = Math.round(baseGross * growthFactor);
        const projectedOpEx = Math.round(baseOpEx * growthFactor);
        grossRevenue = overrides.revenue ?? projectedGross;
        operatingExpenses = overrides.expenses ?? projectedOpEx;
        isManualRevenue = overrides.revenue !== undefined;
        isManualExpenses = overrides.expenses !== undefined;
        type = 'forecast';
      }

      const pitiMonths = (isPast || (isCurrent && currentMonthIdx >= 11)) ? 12 : isCurrent ? currentMonthIdx + 1 : 12;
      const piti = settings.monthlyPITI * pitiMonths;
      const netIncome = grossRevenue - operatingExpenses - piti;

      rows.push({
        year: yr,
        type,
        grossRevenue,
        operatingExpenses,
        piti,
        netIncome,
        growthPct: isFuture ? growthPct : null,
        isManualRevenue,
        isManualExpenses,
      });

      prevGross = grossRevenue;
      prevOpEx = operatingExpenses;
    }

    return NextResponse.json({ rows, settings });
  } catch {
    return NextResponse.json({ error: 'Failed to build forecast' }, { status: 500 });
  }
}
