import { NextResponse } from 'next/server';
import { updateBooking, deleteBooking } from '@/lib/storage';
import { requireAuth, unauthorized } from '@/lib/auth';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const updated = await updateBooking(userId, id, { ...body, updatedAt: new Date().toISOString(), isManual: true });

    if (!updated) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return unauthorized();
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const found = await deleteBooking(userId, id);

    if (!found) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorized();
  }
}
