import { NextResponse } from 'next/server';
import { loadBookings, addBooking, deleteBookings } from '@/lib/storage';
import { Booking } from '@/types';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    let bookings = await loadBookings();

    if (year && year !== 'all') bookings = bookings.filter(b => b.checkIn.startsWith(year));
    if (month && year) {
      const prefix = `${year}-${month.padStart(2, '0')}`;
      bookings = bookings.filter(b => b.checkIn.startsWith(prefix));
    }

    bookings.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    return NextResponse.json(bookings);
  } catch {
    return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform');
    const all = searchParams.get('all');

    const deleted = (all === 'true')
      ? await deleteBookings(() => true)
      : platform
        ? await deleteBookings(b => b.platform === platform)
        : 0;

    return NextResponse.json({ deleted });
  } catch {
    return NextResponse.json({ error: 'Failed to delete bookings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body: Booking = await req.json();
    body.createdAt = new Date().toISOString();
    body.updatedAt = new Date().toISOString();
    body.isManual = true;

    await addBooking(body);

    return NextResponse.json(body, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}
