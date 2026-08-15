import { NextResponse } from 'next/server';
import { loadExpenses, addExpense } from '@/lib/storage';
import { requireAuth, unauthorized, AuthError } from '@/lib/auth';
import { Expense } from '@/types';

export async function GET(req: Request) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    let expenses = await loadExpenses(userId);

    if (year && year !== 'all') expenses = expenses.filter(e => e.date.startsWith(year));
    if (year && month) {
      const prefix = `${year}-${month.padStart(2, '0')}`;
      expenses = expenses.filter(e => e.date.startsWith(prefix));
    }

    expenses.sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json(expenses);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Expenses GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireAuth();
    const body: Expense = await req.json();
    const now = new Date().toISOString();
    const expense: Expense = {
      ...body,
      id: body.id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };

    await addExpense(userId, expense);
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Expenses POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
