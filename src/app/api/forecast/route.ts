import { NextResponse } from 'next/server';
import { allScopes, loadBookings, loadExpenses, loadSettings, type Scope } from '@/lib/storage';
import { requireScope, unauthorized } from '@/lib/auth';
import { ForecastYear, Expense } from '@/types';
import { basisFor, mergeBasis, mergeRows } from '@/lib/forecastAggregate';
import { occursInMonth, occurrencesIn } from '@/lib/recurrence';
import { getYear } from 'date-fns';

// Returns all matching expense records for a single month (YYYY-MM prefix)
function expensesForMonth(expenses: Expense[], prefix: string): Expense[] {
  return expenses.filter(e => occursInMonth(e, prefix));
}

// Returns one copy of each expense per month of the year it lands in, so a
// recurring cost counts once per occurrence rather than once for the year
function expensesForYear(expenses: Expense[], year: number): Expense[] {
  const yearPrefixes = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  return expenses.flatMap(e => occurrencesIn(e, yearPrefixes).map(() => e));
}

function sumExpenseDetail(detail: Record<string, number>): number {
  return Object.values(detail).reduce((s, v) => s + (v ?? 0), 0);
}

interface MonthActuals {
  grossRevenue: number;
  platformFees: number;
  operatingExpenses: number;
  /** Only a whole year carries this; a single month is never asked for it. */
  totalNights?: number;
}

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

/** One property's forecast: its rows, and what its returns are measured on. */
async function forecastFor(scope: Scope, horizon: number) {
    const [allBookings, allExpenses, settings] = await Promise.all([
      loadBookings(scope),
      loadExpenses(scope),
      loadSettings(scope),
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

    // How far out to project. Five years is the default because that is the
    // span an owner can hold assumptions for with a straight face; ten is
    // offered because a mortgage paydown curve says little over five.
    const futureYears = Array.from({ length: horizon }, (_, i) => currentYear + i + 1);
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
        // $0 bookings are cancellations; counting their nights would drag the
        // rate per night down, as it does everywhere else
        totalNights: yrBookings.filter(b => b.income > 0).reduce((s, b) => s + b.nights, 0),
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
          const projGross = Math.round(prior.grossRevenue * growthFactor);
          fcastGross += projGross;
          // If a forward-looking fee rate override is set, apply it to projected gross
          fcastPlatformFees += settings.platformFeeRate != null
            ? Math.round(projGross * settings.platformFeeRate)
            : Math.round(prior.platformFees * growthFactor);
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
        // If a forward-looking fee rate override is set, apply it to projected gross
        platformFees = settings.platformFeeRate != null
          ? Math.round(grossRevenue * settings.platformFeeRate)
          : Math.round(basePlatformFees * growthFactor);
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
        totalNights: actualsByYear.get(yr)?.totalNights,
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

  return { rows, settings, basis: basisFor(settings, horizon) };
}

/**
 * The forecast for the property in view, or for every unit added together.
 *
 * The portfolio is built from the same per-unit function rather than from a
 * second set of arithmetic, so a figure here and the same figure on one
 * property's page cannot drift apart.
 */
export async function GET(req: Request) {
  try {
    const { userId, account, scope } = await requireScope(req);
    const { searchParams } = new URL(req.url);
    // Five years is what an owner can hold assumptions for with a straight
    // face; ten is offered because a paydown curve says little over five.
    const horizon = Math.min(10, Math.max(1, parseInt(searchParams.get('horizon') ?? '5') || 5));
    const wantsPortfolio = searchParams.get('property') === 'all';
    const currentYear = new Date().getFullYear();

    const properties = allScopes(userId, account);
    if (!wantsPortfolio || properties.length < 2) {
      const one = await forecastFor(scope, horizon);
      return NextResponse.json({ ...one, horizon, properties: properties.map(p => p.property) });
    }

    const built = await Promise.all(properties.map(p => forecastFor(p.scope, horizon)));
    return NextResponse.json({
      rows: mergeRows(built.map(b => b.rows), currentYear),
      // The currency and the property name come from the unit in view; nothing
      // else on a portfolio reads from one unit's settings
      settings: built[0].settings,
      basis: mergeBasis(built.map(b => b.basis), horizon),
      horizon,
      properties: properties.map(p => p.property),
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized();
    return NextResponse.json({ error: 'Failed to build forecast' }, { status: 500 });
  }
}
