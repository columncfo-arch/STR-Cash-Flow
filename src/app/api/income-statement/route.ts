import { NextResponse } from 'next/server';
import { loadBookings, loadExpenses, loadSettings } from '@/lib/storage';
import { AnnualStatement, Booking, Expense, ExpenseCategory, MonthlyStatement, Platform, PnLSummary } from '@/types';
import { getYear, getMonth, getDaysInMonth } from 'date-fns';

const PLATFORMS: Platform[] = ['airbnb', 'booking', 'vrbo', 'direct', 'other'];
const EXPENSE_CATS: ExpenseCategory[] = ['utilities', 'cleaning', 'supplies', 'maintenance', 'refund', 'other'];

function emptyPlatformBreakdown() {
  return Object.fromEntries(
    PLATFORMS.map(p => [p, { income: 0, nights: 0, bookings: 0 }])
  ) as Record<Platform, { income: number; nights: number; bookings: number }>;
}

function emptyExpensesByCategory(): Record<ExpenseCategory, number> {
  return Object.fromEntries(EXPENSE_CATS.map(c => [c, 0])) as Record<ExpenseCategory, number>;
}

function buildPnL(
  bookings: Booking[],
  expenses: Expense[],
  monthlyPITI: number,
  months: number,
): PnLSummary {
  const grossRevenue = bookings.reduce((s, b) => s + b.income, 0);
  const platformFees = bookings.reduce((s, b) => s + (b.platformFee ?? 0), 0);
  const fastPayFees = bookings.reduce((s, b) => s + (b.fastPayFee ?? 0), 0);
  const taxRemitted = bookings.reduce((s, b) => s + (b.taxRemitted ?? 0), 0);

  const expensesByCategory = emptyExpensesByCategory();
  for (const e of expenses) {
    expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + e.amount;
  }

  const refunds = expensesByCategory.refund;
  const netRevenue = grossRevenue - platformFees - fastPayFees - taxRemitted - refunds;

  const totalOperatingExpenses =
    expensesByCategory.utilities +
    expensesByCategory.cleaning +
    expensesByCategory.supplies +
    expensesByCategory.maintenance +
    expensesByCategory.other;

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
): MonthlyStatement {
  const monthBookings = bookings.filter(b => {
    const d = new Date(b.checkIn);
    return getYear(d) === year && getMonth(d) === month - 1;
  });

  // date prefix for this month
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthExpenses = expenses.filter(e => e.date.startsWith(prefix));

  const byPlatform = emptyPlatformBreakdown();
  let totalNights = 0;

  for (const b of monthBookings) {
    totalNights += b.nights;
    byPlatform[b.platform].income += b.income;
    byPlatform[b.platform].nights += b.nights;
    byPlatform[b.platform].bookings += 1;
  }

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const pnl = buildPnL(monthBookings, monthExpenses, monthlyPITI, 1);

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

    const months: MonthlyStatement[] = [];
    for (let m = 1; m <= 12; m++) {
      months.push(buildMonthly(year, m, allBookings, allExpenses, settings.monthlyPITI));
    }

    const yearBookings = allBookings.filter(b => b.checkIn.startsWith(String(year)));
    const yearExpenses = allExpenses.filter(e => e.date.startsWith(String(year)));

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

    const annualPnL = buildPnL(yearBookings, yearExpenses, settings.monthlyPITI, 12);

    const statement: AnnualStatement = {
      year,
      months,
      totalNights,
      avgOccupancyRate: months.reduce((s, m) => s + m.occupancyRate, 0) / 12,
      byPlatform,
      ...annualPnL,
    };

    const years = [...new Set(allBookings.map(b => getYear(new Date(b.checkIn))))].sort();
    return NextResponse.json({ statement, years });
  } catch {
    return NextResponse.json({ error: 'Failed to build income statement' }, { status: 500 });
  }
}
