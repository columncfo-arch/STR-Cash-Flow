import { NextResponse } from 'next/server';
import { loadBookings, loadExpenses, loadSettings } from '@/lib/storage';
import { AnnualStatement, Booking, Expense, ExpenseCategory, MonthlyStatement, Platform, PnLSummary } from '@/types';
import { getYear, getDaysInMonth } from 'date-fns';

const PLATFORMS: Platform[] = ['airbnb', 'booking', 'vrbo', 'direct', 'other'];
const EXPENSE_CATS: ExpenseCategory[] = ['cleaning', 'electric', 'water', 'internet', 'yard_care', 'supplies', 'refund', 'maintenance', 'other'];

function emptyPlatformBreakdown() {
  return Object.fromEntries(
    PLATFORMS.map(p => [p, { income: 0, nights: 0, bookings: 0 }])
  ) as Record<Platform, { income: number; nights: number; bookings: number }>;
}

function emptyExpensesByCategory(): Record<ExpenseCategory, number> {
  return Object.fromEntries(EXPENSE_CATS.map(c => [c, 0])) as Record<ExpenseCategory, number>;
}

// Expands recurring expenses into one occurrence per applicable month (YYYY-MM prefix)
// so their amount is counted once per month rather than once total.
function expandExpenses(expenses: Expense[], monthPrefixes: string[]): Expense[] {
  const result: Expense[] = [];
  for (const e of expenses) {
    if (!e.recurring) {
      if (monthPrefixes.some(p => e.date.startsWith(p))) result.push(e);
      continue;
    }
    const startPrefix = e.date.slice(0, 7);
    const endPrefix = e.recurrenceEnd ? e.recurrenceEnd.slice(0, 7) : null;
    for (const p of monthPrefixes) {
      if (p >= startPrefix && (!endPrefix || p <= endPrefix)) result.push(e);
    }
  }
  return result;
}

function buildPnL(
  bookings: Booking[],
  expenses: Expense[],
  monthlyPITI: number,
  months: number,
  cleaningCostPerBooking: number = 0,
): PnLSummary {
  const grossRevenue = bookings.reduce((s, b) => s + b.income, 0);
  const platformFees = bookings.reduce((s, b) => s + (b.platformFee ?? 0), 0);
  const fastPayFees = bookings.reduce((s, b) => s + (b.fastPayFee ?? 0), 0);
  const taxRemitted = bookings.reduce((s, b) => s + (b.taxRemitted ?? 0) + (b.taxWithheld ?? 0), 0);
  const ownerTaxes = bookings.reduce((s, b) => s + (b.lodgingTaxOwnerRemits ?? 0), 0);

  const expensesByCategory = emptyExpensesByCategory();
  for (const e of expenses) {
    expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + e.amount;
  }
  // Auto-expense: cleaning cost per booking (set in Settings, separate from guest-facing fee)
  if (cleaningCostPerBooking > 0) {
    expensesByCategory.cleaning += cleaningCostPerBooking * bookings.length;
  }

  const refunds = expensesByCategory.refund;
  const netRevenue = grossRevenue - platformFees - fastPayFees - taxRemitted - refunds;

  const totalOperatingExpenses =
    expensesByCategory.cleaning +
    expensesByCategory.electric +
    expensesByCategory.water +
    expensesByCategory.internet +
    expensesByCategory.yard_care +
    expensesByCategory.supplies +
    expensesByCategory.maintenance +
    expensesByCategory.other +
    ownerTaxes;

  const operatingIncome = netRevenue - totalOperatingExpenses;
  const piti = monthlyPITI * months;
  const netIncome = operatingIncome - piti;

  return {
    grossRevenue,
    platformFees,
    fastPayFees,
    taxRemitted,
    refunds,
    netRevenue,
    expensesByCategory,
    ownerTaxes,
    totalOperatingExpenses,
    operatingIncome,
    piti,
    netIncome,
  };
}

function buildMonthly(
  year: number,
  month: number,
  bookings: Booking[],
  expenses: Expense[],
  monthlyPITI: number,
  cleaningCostPerBooking: number = 0,
): MonthlyStatement {
  // Use string prefix to avoid timezone shifts from Date parsing
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthBookings = bookings.filter(b => b.checkIn.startsWith(prefix));
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const monthExpenses = expandExpenses(expenses, [prefix]);

  const byPlatform = emptyPlatformBreakdown();
  let totalNights = 0;

  for (const b of monthBookings) {
    totalNights += b.nights;
    byPlatform[b.platform].income += b.income;
    byPlatform[b.platform].nights += b.nights;
    byPlatform[b.platform].bookings += 1;
  }

  const pnl = buildPnL(monthBookings, monthExpenses, monthlyPITI, 1, cleaningCostPerBooking);

  return {
    year,
    month,
    bookings: monthBookings,
    totalNights,
    occupancyRate: Math.min((totalNights / daysInMonth) * 100, 100),
    byPlatform,
    ...pnl,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));

    const [allBookings, allExpenses, settings] = await Promise.all([
      loadBookings(),
      loadExpenses(),
      loadSettings(),
    ]);

    const cleaningCostPerBooking = settings.cleaningFeePerBooking ?? 0;
    const months: MonthlyStatement[] = [];
    for (let m = 1; m <= 12; m++) {
      months.push(buildMonthly(year, m, allBookings, allExpenses, settings.monthlyPITI, cleaningCostPerBooking));
    }

    const yearBookings = allBookings.filter(b => b.checkIn.startsWith(String(year)));
    const yearMonthPrefixes = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    const yearExpenses = expandExpenses(allExpenses, yearMonthPrefixes);

    const byPlatform = emptyPlatformBreakdown();
    let totalNights = 0;

    for (const ms of months) {
      totalNights += ms.totalNights;
      for (const p of PLATFORMS) {
        byPlatform[p].income += ms.byPlatform[p].income;
        byPlatform[p].nights += ms.byPlatform[p].nights;
        byPlatform[p].bookings += ms.byPlatform[p].bookings;
      }
    }

    const now = new Date();
    const pitiMonths = year < now.getFullYear() ? 12 : Math.min(now.getMonth() + 1, 12);
    const annualPnL = buildPnL(yearBookings, yearExpenses, settings.monthlyPITI, pitiMonths, cleaningCostPerBooking);

    const statement: AnnualStatement = {
      year,
      months,
      totalNights,
      avgOccupancyRate: months.slice(0, pitiMonths).reduce((s, m) => s + m.occupancyRate, 0) / pitiMonths,
      byPlatform,
      ...annualPnL,
    };

    const years = [...new Set(allBookings.map(b => getYear(new Date(b.checkIn))))].sort();
    return NextResponse.json({ statement, years });
  } catch {
    return NextResponse.json({ error: 'Failed to build income statement' }, { status: 500 });
  }
}
