import { NextResponse } from 'next/server';
import { loadExpenses, saveExpenses } from '@/lib/storage';
import { Expense } from '@/types';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    let expenses = await loadExpenses();

    if (year && year !== 'all') {
      expenses = expenses.filter(e => e.date.startsWith(year));
    }
    if (year && month) {
      const prefix = `${year}-${month.padStart(2, '0')}`;
      expenses = expenses.filter(e => e.date.startsWith(prefix));
    }

    expenses.sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json(expenses);
  } catch {
    return NextResponse.json({ error: 'Failed to load expenses' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body: Expense = await req.json();
    const now = new Date().toISOString();
    const expense: Expense = {
      ...body,
      id: body.id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };

    const expenses = await loadExpenses();
    expenses.push(expense);
    await saveExpenses(expenses);

    return NextResponse.json(expense, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}
