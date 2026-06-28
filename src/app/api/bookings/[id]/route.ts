import { NextResponse } from 'next/server';
import { loadBookings, saveBookings } from '@/lib/storage';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const bookings = await loadBookings();
    const idx = bookings.findIndex(b => b.id === id);

    if (idx < 0) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

    bookings[idx] = { ...bookings[idx], ...body, id, updatedAt: new Date().toISOString(), isManual: true };
    await saveBookings(bookings);
    return NextResponse.json(bookings[idx]);
  } catch {
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bookings = await loadBookings();
    const filtered = bookings.filter(b => b.id !== id);

    if (filtered.length === bookings.length) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    await saveBookings(filtered);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete booking' }, { status: 500 });
  }
}
