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

function sumExpenseDetail(detail: Record<string, number>): number {
  return Object.values(detail).reduce((s, v) => s + (v ?? 0), 0);
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

    // Historical years from booking data
    const historicalYears = [...new Set(allBookings.map(b => getYear(new Date(b.checkIn))))].sort();

    // Manually-added years (prior year entries with no booking data)
    const manualYears = Object.entries(settings.forecastOverrides ?? {})
      .filter(([, v]) => v?.isManualYear)
      .map(([yr]) => parseInt(yr))
      .filter(yr => !isNaN(yr));

    const futureYears = [1, 2, 3, 4, 5].map(n => currentYear + n);
    const allYears = [...new Set([...historicalYears, ...manualYears, currentYear, ...futureYears])].sort();

    // Actuals from booking + expense data
    const actualsByYear = new Map<number, { grossRevenue: number; operatingExpenses: number }>();
    for (const yr of [...historicalYears, currentYear]) {
      const yrBookings = allBookings.filter(b => b.checkIn.startsWith(String(yr)));
      const gross = yrBookings.reduce((s, b) => s + b.income, 0);
      const platformFees = yrBookings.reduce((s, b) => s + (b.platformFee ?? 0), 0);
      const fastPayFees = yrBookings.reduce((s, b) => s + (b.fastPayFee ?? 0), 0);
      const taxRemitted = yrBookings.reduce((s, b) => s + (b.taxRemitted ?? 0) + (b.taxWithheld ?? 0), 0);
      const lodgingTax = yrBookings.reduce((s, b) => s + (b.lodgingTaxOwnerRemits ?? 0), 0);
      const cleaningAuto = (settings.cleaningFeePerBooking ?? 0) * yrBookings.length;
      const yrExpenses = expandExpensesForYear(allExpenses, yr);
      const manualExpenses = yrExpenses.filter(e => e.category !== 'refund').reduce((s, e) => s + e.amount, 0);
      const deductions = platformFees + fastPayFees + taxRemitted + lodgingTax;
      actualsByYear.set(yr, { grossRevenue: gross, operatingExpenses: manualExpenses + cleaningAuto + deductions });
    }

    // Last full historical year before current = base for forecasting
    const lastFullYear = historicalYears.filter(y => y < currentYear).slice(-1)[0] ?? currentYear;

    const rows: ForecastYear[] = [];
    let prevGross: number | null = null;
    let prevOpEx: number | null = null;

    for (const yr of allYears) {
      const override = settings.forecastOverrides?.[String(yr)] ?? {};
      const isPast = yr < currentYear;
      const isCurrent = yr === currentYear;
      const isFuture = yr > currentYear;
      const isManualEntry = Boolean(override.isManualYear) && !actualsByYear.has(yr);

      const growthPct = settings.forecastGrowthByYear?.[String(yr)] ?? settings.forecastGrowthPct ?? 0;
      const growthFactor = 1 + growthPct / 100;

      let grossRevenue: number;
      let operatingExpenses: number;
      let type: ForecastYear['type'];
      let isManualRevenue = false;
      let isManualExpenses = false;

      if (isManualEntry) {
        // Fully manual prior year — no booking data
        grossRevenue = override.revenue ?? 0;
        if (override.expenseDetail && Object.keys(override.expenseDetail).length > 0) {
          operatingExpenses = sumExpenseDetail(override.expenseDetail);
          isManualExpenses = true;
        } else {
          operatingExpenses = override.expenses ?? 0;
          isManualExpenses = override.expenses !== undefined;
        }
        isManualRevenue = override.revenue !== undefined;
        type = 'actual';
      } else if (isPast || isCurrent) {
        const actuals = actualsByYear.get(yr) ?? { grossRevenue: 0, operatingExpenses: 0 };
        grossRevenue = override.revenue ?? actuals.grossRevenue;
        operatingExpenses = override.expenses ?? actuals.operatingExpenses;
        isManualRevenue = override.revenue !== undefined;
        isManualExpenses = override.expenses !== undefined;
        type = isPast ? 'actual' : 'partial';
      } else {
        const baseGross = prevGross ?? actualsByYear.get(lastFullYear)?.grossRevenue ?? 0;
        const baseOpEx = prevOpEx ?? actualsByYear.get(lastFullYear)?.operatingExpenses ?? 0;
        grossRevenue = override.revenue ?? Math.round(baseGross * growthFactor);
        operatingExpenses = override.expenses ?? Math.round(baseOpEx * growthFactor);
        isManualRevenue = override.revenue !== undefined;
        isManualExpenses = override.expenses !== undefined;
        type = 'forecast';
      }

      // PITI: always full 12 months for long-term view; override available
      const isManualPiti = override.piti !== undefined;
      const piti = override.piti ?? settings.monthlyPITI * 12;
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
        isManualPiti,
        isManualEntry,
      });

      prevGross = grossRevenue;
      prevOpEx = operatingExpenses;
    }

    return NextResponse.json({ rows, settings });
  } catch {
    return NextResponse.json({ error: 'Failed to build forecast' }, { status: 500 });
  }
}
