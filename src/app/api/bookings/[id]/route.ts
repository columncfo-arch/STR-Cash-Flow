import { NextResponse } from 'next/server';
import { updateBooking, deleteBooking } from '@/lib/storage';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await updateBooking(id, { ...body, updatedAt: new Date().toISOString(), isManual: true });

    if (!updated) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const found = await deleteBooking(id);

    if (!found) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete booking' }, { status: 500 });
  }
}
