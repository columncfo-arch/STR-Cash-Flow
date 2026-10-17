import { NextResponse } from 'next/server';
import {
  loadLeases, loadLeaseCharges, addLeaseCharge, updateLeaseCharge, deleteLeaseCharge,
} from '@/lib/storage';
import { requireScope, unauthorized, AuthError } from '@/lib/auth';
import { LeaseCharge } from '@/types';

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Anything billed alongside the rent.
 *
 * A charge has to point at a tenancy that exists, or it would bill against
 * nothing: recognition walks the leases and asks which charges belong to each,
 * so an orphan is money the owner entered and the app silently never counts.
 */
async function validate(
  body: Partial<LeaseCharge>, scope: Parameters<typeof loadLeases>[0],
): Promise<string | null> {
  if (!body.label?.trim()) return 'Give the charge a name';
  if (typeof body.amount !== 'number' || !isFinite(body.amount)) return 'An amount has to be a number';
  if (!isDate(body.date)) return 'Give the charge a date';
  if (body.recurrenceEnd != null && !isDate(body.recurrenceEnd)) return 'That end date is not a date';
  if (body.recurrenceEnd && body.recurrenceEnd < body.date) return 'It ends before it starts';
  if (!body.leaseId) return 'Which tenancy is this billed to?';
  const leases = await loadLeases(scope);
  if (!leases.some(l => l.id === body.leaseId)) return 'No such tenancy';
  return null;
}

export async function GET(req: Request) {
  try {
    const { scope } = await requireScope(req);
    return NextResponse.json(await loadLeaseCharges(scope));
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Lease charges GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { scope } = await requireScope(req);
    const body = await req.json() as Partial<LeaseCharge>;
    const problem = await validate(body, scope);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const now = new Date().toISOString();
    const charge: LeaseCharge = {
      id: `lch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      leaseId: body.leaseId!,
      label: body.label!.trim(),
      amount: body.amount!,
      date: body.date!,
      recurring: Boolean(body.recurring),
      recurrenceFrequency: body.recurring ? (body.recurrenceFrequency ?? 'monthly') : undefined,
      recurrenceEnd: body.recurring ? (body.recurrenceEnd ?? null) : null,
      // A standing charge belongs to the tenancy and shrinks with it; a one-off
      // is an event on a date and lands whole
      proratesWithLease: body.proratesWithLease ?? Boolean(body.recurring),
      createdAt: now,
      updatedAt: now,
    };
    await addLeaseCharge(scope, charge);
    return NextResponse.json(charge, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Lease charges POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { scope } = await requireScope(req);
    const body = await req.json() as Partial<LeaseCharge> & { id?: string };
    if (!body.id) return NextResponse.json({ error: 'Which charge?' }, { status: 400 });

    const existing = (await loadLeaseCharges(scope)).find(c => c.id === body.id);
    if (!existing) return NextResponse.json({ error: 'No such charge' }, { status: 404 });
    const problem = await validate({ ...existing, ...body }, scope);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    return NextResponse.json(await updateLeaseCharge(scope, body.id, body));
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Lease charges PUT error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { scope } = await requireScope(req);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Which charge?' }, { status: 400 });
    const removed = await deleteLeaseCharge(scope, id);
    if (!removed) return NextResponse.json({ error: 'No such charge' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Lease charges DELETE error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
