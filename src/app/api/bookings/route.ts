import { NextResponse } from 'next/server';
import { loadBookings, saveBookings } from '@/lib/storage';
import { Booking } from '@/types';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    let bookings = loadBookings();

    if (year) {
      bookings = bookings.filter(b => b.checkIn.startsWith(year));
    }
    if (month && year) {
      const prefix = `${year}-${month.padStart(2, '0')}`;
      bookings = bookings.filter(b => b.checkIn.startsWith(prefix));
    }

    bookings.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    return NextResponse.json(bookings);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body: Booking = await req.json();
    body.createdAt = new Date().toISOString();
    body.updatedAt = new Date().toISOString();
    body.isManual = true;

    const bookings = loadBookings();
    bookings.push(body);
    saveBookings(bookings);

    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}
