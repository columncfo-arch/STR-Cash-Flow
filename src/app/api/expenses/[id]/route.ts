import { NextResponse } from 'next/server';
import { updateExpense, deleteExpense } from '@/lib/storage';
import { requireAuth, unauthorized, AuthError } from '@/lib/auth';
import { Expense } from '@/types';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const patch: Partial<Expense> = await req.json();
    const updated = await updateExpense(userId, id, patch);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Expense PUT error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const found = await deleteExpense(userId, id);
    if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Expense DELETE error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
