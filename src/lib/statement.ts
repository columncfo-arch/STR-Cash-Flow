// Building a year's income statement for one property.
//
// Lifted out of the income-statement route so the portfolio view can build the
// same statement for every unit without a second, drifting implementation.

import {
  loadBookings, loadExpenses, loadLeaseCharges, loadLeases, loadSettings, type Scope,
} from '@/lib/storage';
import {
  AnnualStatement, Booking, Expense, ExpenseCategory, Lease, LeaseCharge,
  MonthlyStatement, Platform, PnLSummary,
} from '@/types';
import { leaseTotalsForMonth } from '@/lib/lease';
import type { PitiSplit } from '@/lib/mortgage';
import { occurrencesIn } from '@/lib/recurrence';
import { splitPiti } from '@/lib/mortgage';
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

// Expands expenses into one copy per month they land in (YYYY-MM prefix), so a
// recurring cost is counted once per occurrence rather than once in total.
function expandExpenses(expenses: Expense[], monthPrefixes: string[]): Expense[] {
  return expenses.flatMap(e => occurrencesIn(e, monthPrefixes).map(() => e));
}

function buildPnL(
  bookings: Booking[],
  expenses: Expense[],
  monthlyPITI: number,
  months: number,
  cleaningCostPerBooking: number = 0,
  pitiSplit: PitiSplit = { interest: 0, principal: 0, taxesInsurance: monthlyPITI, derived: false },
  leaseRevenue: number = 0,
): PnLSummary {
  // Rent joins gross revenue and carries no platform fee and no
  // platform-remitted tax — nobody takes a cut of rent — so it flows through to
  // net revenue untouched. A property with no leases adds zero and every figure
  // below is exactly what it was.
  const grossRevenue = bookings.reduce((s, b) => s + b.income, 0) + leaseRevenue;
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
  // The costs of carrying the property, separated from the principal repayment,
  // which is equity rather than an expense
  const mortgageInterest = pitiSplit.interest * months;
  const mortgagePrincipal = pitiSplit.principal * months;
  const mortgageTaxesInsurance = pitiSplit.taxesInsurance * months;
  const netProfit = operatingIncome - mortgageInterest - mortgageTaxesInsurance;
  // Unchanged: what leaves the bank once the whole payment is made
  const netIncome = operatingIncome - piti;

  return {
    grossRevenue,
    leaseRevenue,
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
    mortgageInterest,
    mortgagePrincipal,
    mortgageTaxesInsurance,
    netProfit,
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
  pitiSplit?: PitiSplit,
  leases: Lease[] = [],
  leaseCharges: LeaseCharge[] = [],
): MonthlyStatement {
  // Use string prefix to avoid timezone shifts from Date parsing
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthBookings = bookings.filter(b => b.checkIn.startsWith(prefix));
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const monthExpenses = expandExpenses(expenses, [prefix]);

  const byPlatform = emptyPlatformBreakdown();
  let totalNights = 0;

  for (const b of monthBookings) {
    // Skip $0-income bookings (cancellations) from nights/booking stats so they
    // don't drag down ADR, occupancy, and avg-stay calculations.
    if (b.income > 0) {
      totalNights += b.nights;
      byPlatform[b.platform].nights += b.nights;
      byPlatform[b.platform].bookings += 1;
    }
    byPlatform[b.platform].income += b.income;
  }

  const { revenue: leaseRevenue, leasedDays } = leaseTotalsForMonth(leases, leaseCharges, prefix);
  const pnl = buildPnL(monthBookings, monthExpenses, monthlyPITI, 1, cleaningCostPerBooking, pitiSplit, leaseRevenue);

  return {
    year,
    month,
    bookings: monthBookings,
    totalNights,
    leasedDays,
    // Nights sold plus days under lease. A leased unit reads near 100%, and a
    // turnover month reads the part of it that was covered.
    occupancyRate: Math.min(((totalNights + leasedDays) / daysInMonth) * 100, 100),
    byPlatform,
    ...pnl,
  };
}


export async function buildAnnualStatement(scope: Scope, year: number): Promise<{ statement: AnnualStatement; years: number[] }> {

  const [allBookings, allExpenses, allLeases, allLeaseCharges, settings] = await Promise.all([
    loadBookings(scope),
    loadExpenses(scope),
    loadLeases(scope),
    loadLeaseCharges(scope),
    loadSettings(scope),
  ]);

  const cleaningCostPerBooking = settings.cleaningFeePerBooking ?? 0;
  const pitiSplit = splitPiti(settings);
  const months: MonthlyStatement[] = [];
  for (let m = 1; m <= 12; m++) {
    months.push(buildMonthly(
      year, m, allBookings, allExpenses, settings.monthlyPITI, cleaningCostPerBooking, pitiSplit,
      allLeases, allLeaseCharges,
    ));
  }

  const yearBookings = allBookings.filter(b => b.checkIn.startsWith(String(year)));
  const yearMonthPrefixes = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const yearExpenses = expandExpenses(allExpenses, yearMonthPrefixes);

  const byPlatform = emptyPlatformBreakdown();
  let totalNights = 0;
  let leasedDays = 0;
  // Summed from the months rather than recomputed, so the year can never
  // disagree with the twelve figures it is made of
  let leaseRevenue = 0;

  for (const ms of months) {
    totalNights += ms.totalNights;
    leasedDays += ms.leasedDays;
    leaseRevenue += ms.leaseRevenue;
    for (const p of PLATFORMS) {
      byPlatform[p].income += ms.byPlatform[p].income;
      byPlatform[p].nights += ms.byPlatform[p].nights;
      byPlatform[p].bookings += ms.byPlatform[p].bookings;
    }
  }

  const now = new Date();
  const pitiMonths = year < now.getFullYear() ? 12 : Math.min(now.getMonth() + 1, 12);
  const annualPnL = buildPnL(
    yearBookings, yearExpenses, settings.monthlyPITI, pitiMonths, cleaningCostPerBooking, pitiSplit,
    leaseRevenue,
  );

  const statement: AnnualStatement = {
    year,
    months,
    totalNights,
    leasedDays,
    avgOccupancyRate: months.slice(0, pitiMonths).reduce((s, m) => s + m.occupancyRate, 0) / pitiMonths,
    byPlatform,
    ...annualPnL,
  };

  const years = [...new Set(allBookings.map(b => getYear(new Date(b.checkIn))))].sort();
  return { statement, years };
}
