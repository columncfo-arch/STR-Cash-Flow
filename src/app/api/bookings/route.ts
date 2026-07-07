import { NextResponse } from 'next/server';
import { loadBookings, addBooking, deleteBookings } from '@/lib/storage';
import { requireAuth, unauthorized } from '@/lib/auth';
import { Booking } from '@/types';

export async function GET(req: Request) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    let bookings = await loadBookings(userId);

    if (year && year !== 'all') bookings = bookings.filter(b => b.checkIn.startsWith(year));
    if (month && year) {
      const prefix = `${year}-${month.padStart(2, '0')}`;
      bookings = bookings.filter(b => b.checkIn.startsWith(prefix));
    }

    bookings.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    return NextResponse.json(bookings);
  } catch {
    return unauthorized();
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform');
    const all = searchParams.get('all');

    const deleted = (all === 'true')
      ? await deleteBookings(userId, () => true)
      : platform
        ? await deleteBookings(userId, b => b.platform === platform)
        : 0;

    return NextResponse.json({ deleted });
  } catch {
    return unauthorized();
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireAuth();
    const body: Booking = await req.json();
    body.createdAt = new Date().toISOString();
    body.updatedAt = new Date().toISOString();
    body.isManual = true;

    await addBooking(userId, body);
    return NextResponse.json(body, { status: 201 });
  } catch {
    return unauthorized();
  }
}
