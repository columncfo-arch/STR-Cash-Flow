import { NextResponse } from 'next/server';
import { loadBookings, loadExpenses, addBooking, addExpense } from '@/lib/storage';
import { Booking, Expense } from '@/types';

// 2025 monthly actuals from property spreadsheet (Jan=0 through Oct=9)
const MONTHS_DATA = [
  { m: 1,  airbnb: 5874, booking:  575, airbnbFee: 157, bookingFee:  86, taxRemitted: 629, adjustments:   0, nights: 29, reservations: 10 },
  { m: 2,  airbnb: 6493, booking:  308, airbnbFee: 174, bookingFee:  46, taxRemitted: 696, adjustments:   0, nights: 23, reservations: 12 },
  { m: 3,  airbnb: 3793, booking: 1374, airbnbFee: 372, bookingFee: 206, taxRemitted: 362, adjustments:   0, nights: 15, reservations:  9 },
  { m: 4,  airbnb: 4167, booking: 2172, airbnbFee:  99, bookingFee: 326, taxRemitted: 396, adjustments: 937, nights: 22, reservations: 13 },
  { m: 5,  airbnb: 2825, booking: 2348, airbnbFee:  76, bookingFee: 277, taxRemitted: 303, adjustments:  50, nights: 19, reservations:  8 },
  { m: 6,  airbnb: 3634, booking: 3192, airbnbFee:  97, bookingFee: 479, taxRemitted: 389, adjustments:   0, nights: 30, reservations: 12 },
  { m: 7,  airbnb: 6391, booking: 1752, airbnbFee: 176, bookingFee: 263, taxRemitted: 704, adjustments:   0, nights: 30, reservations: 10 },
  { m: 8,  airbnb: 3411, booking:  762, airbnbFee:  89, bookingFee: 114, taxRemitted: 356, adjustments:   0, nights: 17, reservations:  9 },
  { m: 9,  airbnb: 4207, booking: 1127, airbnbFee: 110, bookingFee: 169, taxRemitted: 439, adjustments:   0, nights: 19, reservations: 10 },
  { m: 10, airbnb: 3724, booking:    0, airbnbFee:  97, bookingFee:   0, taxRemitted: 389, adjustments:   0, nights: 23, reservations:  8 },
];

// Monthly operating expenses from spreadsheet (per month Jan-Oct)
const EXPENSES_DATA: { m: number; amenities: number; fpl: number; water: number; internet: number; pest: number; lawn: number; financing: number; wheelhouse: number; mnr: number }[] = [
  { m: 1,  amenities: 50, fpl: 175, water: 152, internet: 39, pest: 48, lawn:  55, financing: 82, wheelhouse:  0, mnr:  32 },
  { m: 2,  amenities: 50, fpl: 174, water: 152, internet: 39, pest: 48, lawn:  55, financing: 82, wheelhouse:  0, mnr:  34 },
  { m: 3,  amenities: 50, fpl: 102, water: 152, internet: 39, pest: 48, lawn: 255, financing: 82, wheelhouse:  0, mnr:  26 },
  { m: 4,  amenities: 50, fpl: 210, water: 152, internet: 39, pest: 48, lawn:  55, financing: 82, wheelhouse:  0, mnr:  32 },
  { m: 5,  amenities: 50, fpl: 161, water: 152, internet: 39, pest: 48, lawn:  55, financing: 82, wheelhouse:  0, mnr:  26 },
  { m: 6,  amenities: 50, fpl: 287, water: 152, internet: 39, pest: 48, lawn: 155, financing: 82, wheelhouse:  0, mnr:  34 },
  { m: 7,  amenities: 50, fpl: 219, water: 152, internet: 39, pest: 48, lawn: 255, financing: 82, wheelhouse: 20, mnr:  41 },
  { m: 8,  amenities: 50, fpl: 323, water: 152, internet: 39, pest: 48, lawn: 255, financing: 50, wheelhouse: 20, mnr:   0 },
  { m: 9,  amenities: 50, fpl: 260, water: 152, internet: 39, pest: 48, lawn: 150, financing: 50, wheelhouse: 20, mnr: 350 },
  { m: 10, amenities: 50, fpl: 198, water: 152, internet: 39, pest: 48, lawn: 150, financing: 50, wheelhouse: 20, mnr:   0 },
];

function pad(n: number) { return String(n).padStart(2, '0'); }
function dateStr(year: number, month: number, day = 15) { return `2025-${pad(month)}-${pad(day)}`; }
function newId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export async function POST() {
  try {
    const existingBookings = await loadBookings();
    const existingExpenses = await loadExpenses();

    const has2025Bookings = existingBookings.some(b => b.checkIn.startsWith('2025'));
    const has2025Expenses = existingExpenses.some(e => e.date.startsWith('2025'));

    if (has2025Bookings || has2025Expenses) {
      return NextResponse.json({ error: '2025 data already exists. Delete it first if you want to re-seed.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    let bookingsAdded = 0;
    let expensesAdded = 0;

    for (const row of MONTHS_DATA) {
      const checkIn = dateStr(2025, row.m, 1);
      const checkOut = dateStr(2025, row.m, 28);

      // Pro-rate tax between platforms by revenue share
      const totalGross = row.airbnb + row.booking;
      const airbnbTax = totalGross > 0 ? Math.round(row.taxRemitted * (row.airbnb / totalGross)) : 0;
      const bookingTax = row.taxRemitted - airbnbTax;

      if (row.airbnb > 0) {
        const b: Booking = {
          id: `seed25-airbnb-${row.m}`,
          sourceId: 'seed-2025',
          platform: 'airbnb',
          uid: `seed25-airbnb-${row.m}`,
          summary: `Airbnb — ${row.reservations} bookings (2025 baseline)`,
          checkIn,
          checkOut,
          nights: Math.round(row.nights * (row.airbnb / (totalGross || 1))),
          income: row.airbnb,
          platformFee: row.airbnbFee,
          taxRemitted: airbnbTax,
          createdAt: now,
          updatedAt: now,
        };
        await addBooking(b);
        bookingsAdded++;
      }

      if (row.booking > 0) {
        const b: Booking = {
          id: `seed25-booking-${row.m}`,
          sourceId: 'seed-2025',
          platform: 'booking',
          uid: `seed25-booking-${row.m}`,
          summary: `Booking.com — (2025 baseline)`,
          checkIn,
          checkOut,
          nights: Math.round(row.nights * (row.booking / (totalGross || 1))),
          income: row.booking,
          platformFee: row.bookingFee,
          taxRemitted: bookingTax,
          createdAt: now,
          updatedAt: now,
        };
        await addBooking(b);
        bookingsAdded++;
      }

      // Adjustments/refunds as expense records
      if (row.adjustments > 0) {
        const e: Expense = {
          id: newId(`seed25-refund-${row.m}`),
          date: dateStr(2025, row.m),
          category: 'refund',
          description: 'Platform adjustment / refund (2025 baseline)',
          amount: row.adjustments,
          createdAt: now,
          updatedAt: now,
        };
        await addExpense(e);
        expensesAdded++;
      }
    }

    // Cleaning: $100 per reservation per month (matches cleaningFeePerBooking=100, but seed as explicit records
    // so P&L is accurate regardless of settings value)
    for (const row of EXPENSES_DATA) {
      const month = MONTHS_DATA.find(m => m.m === row.m)!;
      const cleaningAmt = 100 * month.reservations;

      const toAdd: { cat: Expense['category']; desc: string; amt: number }[] = [
        { cat: 'cleaning',    desc: 'Cleaning (2025 baseline)',                   amt: cleaningAmt   },
        { cat: 'supplies',    desc: 'Amenities / supplies (2025 baseline)',        amt: row.amenities },
        { cat: 'electric',    desc: 'FPL electric (2025 baseline)',                amt: row.fpl       },
        { cat: 'water',       desc: 'Water, sewer & trash (2025 baseline)',        amt: row.water     },
        { cat: 'internet',    desc: 'Internet (2025 baseline)',                    amt: row.internet  },
        { cat: 'yard_care',   desc: 'Pest & lawn (2025 baseline)',                 amt: row.pest + row.lawn },
        { cat: 'other',       desc: 'Financing excl PITI (2025 baseline)',         amt: row.financing },
        ...(row.wheelhouse > 0 ? [{ cat: 'other' as const, desc: 'Wheelhouse (2025 baseline)', amt: row.wheelhouse }] : []),
        ...(row.mnr > 0        ? [{ cat: 'maintenance' as const, desc: 'M&R (2025 baseline)',  amt: row.mnr        }] : []),
      ];

      for (const item of toAdd) {
        const e: Expense = {
          id: newId(`seed25-${item.cat}-${row.m}`),
          date: dateStr(2025, row.m),
          category: item.cat,
          description: item.desc,
          amount: item.amt,
          createdAt: now,
          updatedAt: now,
        };
        await addExpense(e);
        expensesAdded++;
      }
    }

    return NextResponse.json({
      ok: true,
      bookingsAdded,
      expensesAdded,
      note: 'PITI is not seeded — set monthlyPITI in Settings (2025 rate was ~$3,676/mo Apr–Oct, ~$4,027–4,059 Jan–Mar).',
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Seed failed' }, { status: 500 });
  }
}
