import { NextResponse } from 'next/server';
import { updateBooking, deleteBooking } from '@/lib/storage';
import { requireScope, unauthorized, AuthError } from '@/lib/auth';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { scope } = await requireScope(req);
    const { id } = await params;
    const body = await req.json();
    const updated = await updateBooking(scope, id, { ...body, updatedAt: new Date().toISOString(), isManual: true });

    if (!updated) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Booking PUT error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { scope } = await requireScope();
    const { id } = await params;
    const found = await deleteBooking(scope, id);

    if (!found) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Booking DELETE error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
