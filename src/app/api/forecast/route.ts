import { NextResponse } from 'next/server';
import { loadBookings, loadExpenses, loadSettings } from '@/lib/storage';
import { requireAuth, unauthorized } from '@/lib/auth';
import { ForecastYear, Expense } from '@/types';
import { getYear } from 'date-fns';

// Returns all matching expense records for a single month (YYYY-MM prefix)
function expensesForMonth(expenses: Expense[], prefix: string): Expense[] {
  const result: Expense[] = [];
  for (const e of expenses) {
    if (!e.recurring) {
      if (e.date.startsWith(prefix)) result.push(e);
      continue;
    }
    const startPrefix = e.date.slice(0, 7);
    const endPrefix = e.recurrenceEnd ? e.recurrenceEnd.slice(0, 7) : null;
    if (prefix >= startPrefix && (!endPrefix || prefix <= endPrefix)) result.push(e);
  }
  return result;
}

// Returns all matching expense records for a full year
function expensesForYear(expenses: Expense[], year: number): Expense[] {
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

interface MonthActuals { grossRevenue: number; platformFees: number; operatingExpenses: number }

function computeMonthActuals(
  allBookings: ReturnType<typeof Array.prototype.filter>[0][],
  allExpenses: Expense[],
  year: number,
  monthIdx: number, // 0-indexed
  cleaningFeePerBooking: number,
): MonthActuals {
  const prefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mBookings = (allBookings as any[]).filter((b: any) => b.checkIn.startsWith(prefix));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gross = mBookings.reduce((s: number, b: any) => s + b.income, 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcFees = mBookings.reduce((s: number, b: any) => s + (b.platformFee ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fastPayFees = mBookings.reduce((s: number, b: any) => s + (b.fastPayFee ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxRemitted = mBookings.reduce((s: number, b: any) => s + ((b.taxRemitted ?? 0) + (b.taxWithheld ?? 0)), 0);
  // owner-remitted lodging tax (VRBO) goes in operating expenses, matching Dashboard treatment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerTaxes = mBookings.reduce((s: number, b: any) => s + (b.lodgingTaxOwnerRemits ?? 0), 0);
  const cleaningAuto = cleaningFeePerBooking * mBookings.length;
  const mExpenses = expensesForMonth(allExpenses, prefix);
  const manualExp = mExpenses.filter(e => e.category !== 'refund').reduce((s, e) => s + e.amount, 0);
  return {
    grossRevenue: gross,
    platformFees: svcFees + fastPayFees + taxRemitted,
    operatingExpenses: manualExp + cleaningAuto + ownerTaxes,
  };
}

export async function GET() {
  try {
    const userId = await requireAuth();
    const [allBookings, allExpenses, settings] = await Promise.all([
      loadBookings(userId),
      loadExpenses(userId),
      loadSettings(userId),
    ]);

    const now = new Date();
    const currentYear = getYear(now);
    const currentMonthIdx = now.getMonth(); // 0-indexed (Jan=0)

    // Years present in booking data
    const historicalYears = [...new Set(allBookings.map(b => getYear(new Date(b.checkIn))))].sort();

    // Manually-added years from overrides
    const manualYears = Object.entries(settings.forecastOverrides ?? {})
      .filter(([, v]) => v?.isManualYear)
      .map(([yr]) => parseInt(yr))
      .filter(yr => !isNaN(yr));

    const futureYears = [1, 2, 3, 4, 5].map(n => currentYear + n);
    const allYears = [...new Set([...historicalYears, ...manualYears, currentYear, ...futureYears])].sort();

    // Annual actuals (booking data) per year — ytd for current year
    const actualsByYear = new Map<number, MonthActuals>();
    for (const yr of [...historicalYears, currentYear]) {
      const yrBookings = allBookings.filter(b => b.checkIn.startsWith(String(yr)));
      const gross = yrBookings.reduce((s, b) => s + b.income, 0);
      const svcFees = yrBookings.reduce((s, b) => s + (b.platformFee ?? 0), 0);
      const fastPayFees = yrBookings.reduce((s, b) => s + (b.fastPayFee ?? 0), 0);
      const taxRemitted = yrBookings.reduce((s, b) => s + (b.taxRemitted ?? 0) + (b.taxWithheld ?? 0), 0);
      // owner-remitted lodging tax (VRBO) goes in operating expenses, matching Dashboard treatment
      const ownerTaxes = yrBookings.reduce((s, b) => s + (b.lodgingTaxOwnerRemits ?? 0), 0);
      const cleaningAuto = (settings.cleaningFeePerBooking ?? 0) * yrBookings.length;
      const yrExpenses = expensesForYear(allExpenses, yr);
      const manualExpenses = yrExpenses.filter(e => e.category !== 'refund').reduce((s, e) => s + e.amount, 0);
      actualsByYear.set(yr, {
        grossRevenue: gross,
        platformFees: svcFees + fastPayFees + taxRemitted,
        operatingExpenses: manualExpenses + cleaningAuto + ownerTaxes,
      });
    }

    // Last full historical year before current = fallback base for forecasting
    const lastFullYear = historicalYears.filter(y => y < currentYear).slice(-1)[0] ?? null;

    const rows: ForecastYear[] = [];
    let prevGross: number | null = null;
    let prevPlatformFees: number | null = null;
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
      let platformFees: number;
      let operatingExpenses: number;
      let type: ForecastYear['type'];
      let isManualRevenue = false;
      let isManualExpenses = false;
      let blended = false;
      let ytdGross: number | undefined;
      let ytdPlatformFees: number | undefined;
      let ytdOpEx: number | undefined;
      let fcastGross: number | undefined;
      let fcastPlatformFees: number | undefined;
      let fcastOpEx: number | undefined;

      if (isManualEntry) {
        // Manual years: expenses override is the combined total (platformFees=0, opEx=override)
        grossRevenue = override.revenue ?? 0;
        platformFees = 0;
        if (override.expenseDetail && Object.keys(override.expenseDetail).length > 0) {
          operatingExpenses = sumExpenseDetail(override.expenseDetail);
          isManualExpenses = true;
        } else {
          operatingExpenses = override.expenses ?? 0;
          isManualExpenses = override.expenses !== undefined;
        }
        isManualRevenue = override.revenue !== undefined;
        type = 'actual';

      } else if (isPast) {
        const actuals = actualsByYear.get(yr) ?? { grossRevenue: 0, platformFees: 0, operatingExpenses: 0 };
        grossRevenue = override.revenue ?? actuals.grossRevenue;
        platformFees = actuals.platformFees;
        operatingExpenses = override.expenses ?? actuals.operatingExpenses;
        isManualRevenue = override.revenue !== undefined;
        isManualExpenses = override.expenses !== undefined;
        type = 'actual';

      } else if (isCurrent) {
        // Blend YTD actuals with per-month forecasts for remaining months
        const ytdActuals = actualsByYear.get(currentYear) ?? { grossRevenue: 0, platformFees: 0, operatingExpenses: 0 };
        ytdGross = ytdActuals.grossRevenue;
        ytdPlatformFees = ytdActuals.platformFees;
        ytdOpEx = ytdActuals.operatingExpenses;

        fcastGross = 0;
        fcastPlatformFees = 0;
        fcastOpEx = 0;

        // For each remaining month, use prior year's monthly figure × growth
        const priorYearForForecast = lastFullYear ?? (currentYear - 1);
        for (let m = currentMonthIdx + 1; m <= 11; m++) {
          const prior = computeMonthActuals(allBookings, allExpenses, priorYearForForecast, m, settings.cleaningFeePerBooking ?? 0);
          fcastGross += Math.round(prior.grossRevenue * growthFactor);
          fcastPlatformFees += Math.round(prior.platformFees * growthFactor);
          fcastOpEx += Math.round(prior.operatingExpenses * growthFactor);
        }

        grossRevenue = override.revenue ?? (ytdGross + fcastGross);
        platformFees = ytdPlatformFees + fcastPlatformFees;
        operatingExpenses = override.expenses ?? (ytdOpEx + fcastOpEx);
        isManualRevenue = override.revenue !== undefined;
        isManualExpenses = override.expenses !== undefined;
        type = 'partial';
        blended = true;

      } else {
        // Future year: apply growth to previous year's projected total
        const baseGross = prevGross ?? actualsByYear.get(lastFullYear ?? currentYear - 1)?.grossRevenue ?? 0;
        const basePlatformFees = prevPlatformFees ?? actualsByYear.get(lastFullYear ?? currentYear - 1)?.platformFees ?? 0;
        const baseOpEx = prevOpEx ?? actualsByYear.get(lastFullYear ?? currentYear - 1)?.operatingExpenses ?? 0;
        grossRevenue = override.revenue ?? Math.round(baseGross * growthFactor);
        platformFees = Math.round(basePlatformFees * growthFactor);
        operatingExpenses = override.expenses ?? Math.round(baseOpEx * growthFactor);
        isManualRevenue = override.revenue !== undefined;
        isManualExpenses = override.expenses !== undefined;
        type = 'forecast';
      }

      const isManualPiti = override.piti !== undefined;
      const piti = override.piti ?? settings.monthlyPITI * 12;
      const netIncome = grossRevenue - platformFees - operatingExpenses - piti;

      rows.push({
        year: yr,
        type,
        grossRevenue,
        platformFees,
        operatingExpenses,
        piti,
        netIncome,
        growthPct: (isFuture || (isCurrent && blended)) ? growthPct : null,
        isManualRevenue,
        isManualExpenses,
        isManualPiti,
        isManualEntry,
        blended,
        ytdGross,
        ytdPlatformFees,
        ytdOpEx,
        forecastGross: fcastGross,
        forecastPlatformFees: fcastPlatformFees,
        forecastOpEx: fcastOpEx,
      });

      prevGross = grossRevenue;
      prevPlatformFees = platformFees;
      prevOpEx = operatingExpenses;
    }

    return NextResponse.json({ rows, settings });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized();
    return NextResponse.json({ error: 'Failed to build forecast' }, { status: 500 });
  }
}
