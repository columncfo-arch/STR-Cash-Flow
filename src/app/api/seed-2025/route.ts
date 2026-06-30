import { NextResponse } from 'next/server';
import { loadBookings, loadExpenses, replaceAllBookings } from '@/lib/storage';
import { Booking, Expense } from '@/types';
import path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// 2025 monthly actuals from property spreadsheet (Jan–Oct)
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

const EXPENSES_DATA = [
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
function d(month: number, day = 15) { return `2025-${pad(month)}-${pad(day)}`; }
function uid() { return Math.random().toString(36).slice(2, 9); }

function buildSeedData(now: string): { bookings: Booking[]; expenses: Expense[] } {
  const bookings: Booking[] = [];
  const expenses: Expense[] = [];

  for (const row of MONTHS_DATA) {
    const totalGross = row.airbnb + row.booking;
    const airbnbTax = totalGross > 0 ? Math.round(row.taxRemitted * row.airbnb / totalGross) : 0;
    const bookingTax = row.taxRemitted - airbnbTax;

    if (row.airbnb > 0) {
      bookings.push({
        id: `seed25-ab-${row.m}`,
        sourceId: 'seed-2025', platform: 'airbnb',
        uid: `seed25-ab-${row.m}`,
        summary: `Airbnb — ${row.reservations} stays (2025 baseline)`,
        checkIn: d(row.m, 1), checkOut: d(row.m, 28),
        nights: Math.round(row.nights * row.airbnb / (totalGross || 1)),
        income: row.airbnb, platformFee: row.airbnbFee, taxRemitted: airbnbTax,
        createdAt: now, updatedAt: now,
      });
    }
    if (row.booking > 0) {
      bookings.push({
        id: `seed25-bk-${row.m}`,
        sourceId: 'seed-2025', platform: 'booking',
        uid: `seed25-bk-${row.m}`,
        summary: `Booking.com (2025 baseline)`,
        checkIn: d(row.m, 1), checkOut: d(row.m, 28),
        nights: Math.round(row.nights * row.booking / (totalGross || 1)),
        income: row.booking, platformFee: row.bookingFee, taxRemitted: bookingTax,
        createdAt: now, updatedAt: now,
      });
    }
    if (row.adjustments > 0) {
      expenses.push({
        id: `seed25-adj-${row.m}-${uid()}`, date: d(row.m),
        category: 'refund', description: 'Platform adjustment / refund (2025 baseline)',
        amount: row.adjustments, createdAt: now, updatedAt: now,
      });
    }
  }

  for (const row of EXPENSES_DATA) {
    const month = MONTHS_DATA.find(m => m.m === row.m)!;
    const items: { slug: string; cat: Expense['category']; desc: string; amt: number }[] = [
      { slug: 'cln', cat: 'cleaning',     desc: 'Cleaning (2025 baseline)',             amt: 100 * month.reservations },
      { slug: 'sup', cat: 'supplies',     desc: 'Amenities / supplies (2025 baseline)', amt: row.amenities },
      { slug: 'elc', cat: 'electric',     desc: 'FPL electric (2025 baseline)',          amt: row.fpl       },
      { slug: 'wtr', cat: 'water',        desc: 'Water, sewer & trash (2025 baseline)',  amt: row.water     },
      { slug: 'net', cat: 'internet',     desc: 'Internet (2025 baseline)',              amt: row.internet  },
      { slug: 'yrd', cat: 'yard_care',    desc: 'Pest & lawn (2025 baseline)',           amt: row.pest + row.lawn },
      { slug: 'fin', cat: 'other',        desc: 'Financing excl PITI (2025 baseline)',   amt: row.financing },
      ...(row.wheelhouse > 0 ? [{ slug: 'whl', cat: 'other' as const,        desc: 'Wheelhouse (2025 baseline)', amt: row.wheelhouse }] : []),
      ...(row.mnr > 0        ? [{ slug: 'mnr', cat: 'maintenance' as const,  desc: 'M&R (2025 baseline)',        amt: row.mnr }]        : []),
    ];
    for (const item of items) {
      expenses.push({
        id: `seed25-${item.slug}-${row.m}`,
        date: d(row.m), category: item.cat,
        description: item.desc, amount: item.amt,
        createdAt: now, updatedAt: now,
      });
    }
  }

  return { bookings, expenses };
}

export async function POST(req: Request) {
  try {
    const force = new URL(req.url).searchParams.get('force') === 'true';

    if (!force) {
      const [existing, existingExp] = await Promise.all([loadBookings(), loadExpenses()]);
      const has2025 = existing.some(b => b.checkIn.startsWith('2025'))
        || existingExp.some(e => e.date.startsWith('2025'));
      if (has2025) {
        return NextResponse.json({
          error: '2025 data already exists.',
          hint: 'Append ?force=true to the request to overwrite it.',
        }, { status: 409 });
      }
    }

    const now = new Date().toISOString();
    const { bookings: newBookings, expenses: newExpenses } = buildSeedData(now);

    const useRedis = Boolean(process.env.REDIS_URL);

    if (useRedis) {
      // Single pipeline for all Redis operations — one round-trip
      const { createClient } = await import('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      client.on('error', e => console.error('Redis seed error:', e));
      await client.connect();

      const existing = await Promise.all([
        client.hGetAll('str:bookings'),
        client.hGetAll('str:expenses'),
      ]);
      const pipeline = client.multi();
      // Keep non-2025 records; replace/add 2025 ones
      const existingBookings = Object.values(existing[0]).map(v => JSON.parse(v) as Booking);
      const existingExpenses = Object.values(existing[1]).map(v => JSON.parse(v) as Expense);
      const keptBookings = force ? existingBookings.filter(b => !b.checkIn.startsWith('2025')) : existingBookings;
      const keptExpenses = force ? existingExpenses.filter(e => !e.date.startsWith('2025')) : existingExpenses;

      for (const b of [...keptBookings, ...newBookings]) {
        pipeline.hSet('str:bookings', b.id, JSON.stringify(b));
      }
      for (const e of [...keptExpenses, ...newExpenses]) {
        pipeline.hSet('str:expenses', e.id, JSON.stringify(e));
      }
      await pipeline.exec();
      await client.quit();
    } else {
      // File backend: read existing, merge, write once
      const IS_VERCEL = Boolean(process.env.VERCEL);
      const DATA_DIR = IS_VERCEL ? '/tmp/str-data' : path.join(process.cwd(), 'data');
      if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });

      const readJson = async <T>(file: string, fb: T): Promise<T> => {
        try { return JSON.parse(await readFile(file, 'utf-8')) as T; } catch { return fb; }
      };

      const bFile = path.join(DATA_DIR, 'bookings.json');
      const eFile = path.join(DATA_DIR, 'expenses.json');
      const [existB, existE] = await Promise.all([
        readJson<Booking[]>(bFile, []),
        readJson<Expense[]>(eFile, []),
      ]);
      const keptB = force ? existB.filter(b => !b.checkIn.startsWith('2025')) : existB;
      const keptE = force ? existE.filter(e => !e.date.startsWith('2025')) : existE;
      await Promise.all([
        writeFile(bFile, JSON.stringify([...keptB, ...newBookings], null, 2)),
        writeFile(eFile, JSON.stringify([...keptE, ...newExpenses], null, 2)),
      ]);
    }

    return NextResponse.json({
      ok: true,
      bookingsAdded: newBookings.length,
      expensesAdded: newExpenses.length,
      note: 'PITI not seeded — set monthlyPITI in Settings ($3,676/mo for Apr–Oct 2025; $4,027–4,059 for Jan–Mar 2025).',
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Seed failed' }, { status: 500 });
  }
}
