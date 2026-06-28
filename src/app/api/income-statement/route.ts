import { NextResponse } from 'next/server';
import { loadBookings } from '@/lib/storage';
import { AnnualStatement, Booking, MonthlyStatement, Platform } from '@/types';
import { getYear, getMonth, getDaysInMonth } from 'date-fns';

const PLATFORMS: Platform[] = ['airbnb', 'booking', 'vrbo', 'direct', 'other'];

function emptyPlatformBreakdown() {
  return Object.fromEntries(
    PLATFORMS.map(p => [p, { income: 0, nights: 0, bookings: 0 }])
  ) as Record<Platform, { income: number; nights: number; bookings: number }>;
}

function buildMonthly(year: number, month: number, bookings: Booking[]): MonthlyStatement {
  const monthBookings = bookings.filter(b => {
    const d = new Date(b.checkIn);
    return getYear(d) === year && getMonth(d) === month - 1;
  });

  const byPlatform = emptyPlatformBreakdown();
  let totalIncome = 0;
  let totalNights = 0;

  for (const b of monthBookings) {
    totalIncome += b.income;
    totalNights += b.nights;
    byPlatform[b.platform].income += b.income;
    byPlatform[b.platform].nights += b.nights;
    byPlatform[b.platform].bookings += 1;
  }

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  return {
    year,
    month,
    bookings: monthBookings,
    totalIncome,
    totalNights,
    occupancyRate: Math.min((totalNights / daysInMonth) * 100, 100),
    byPlatform,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));

    const allBookings = await loadBookings();

    const months: MonthlyStatement[] = [];
    for (let m = 1; m <= 12; m++) months.push(buildMonthly(year, m, allBookings));

    const byPlatform = emptyPlatformBreakdown();
    let totalIncome = 0;
    let totalNights = 0;

    for (const ms of months) {
      totalIncome += ms.totalIncome;
      totalNights += ms.totalNights;
      for (const p of PLATFORMS) {
        byPlatform[p].income += ms.byPlatform[p].income;
        byPlatform[p].nights += ms.byPlatform[p].nights;
        byPlatform[p].bookings += ms.byPlatform[p].bookings;
      }
    }

    const statement: AnnualStatement = {
      year,
      months,
      totalIncome,
      totalNights,
      avgOccupancyRate: months.reduce((s, m) => s + m.occupancyRate, 0) / 12,
      byPlatform,
    };

    const years = [...new Set(allBookings.map(b => getYear(new Date(b.checkIn))))].sort();
    return NextResponse.json({ statement, years });
  } catch {
    return NextResponse.json({ error: 'Failed to build income statement' }, { status: 500 });
  }
}
