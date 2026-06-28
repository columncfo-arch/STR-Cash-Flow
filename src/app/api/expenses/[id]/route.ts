import { NextResponse } from 'next/server';
import { loadExpenses, saveExpenses } from '@/lib/storage';
import { Expense } from '@/types';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const patch: Partial<Expense> = await req.json();
    const expenses = await loadExpenses();
    const idx = expenses.findIndex(e => e.id === id);
    if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    expenses[idx] = { ...expenses[idx], ...patch, id, updatedAt: new Date().toISOString() };
    await saveExpenses(expenses);
    return NextResponse.json(expenses[idx]);
  } catch {
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const expenses = await loadExpenses();
    const filtered = expenses.filter(e => e.id !== id);
    if (filtered.length === expenses.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await saveExpenses(filtered);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}
