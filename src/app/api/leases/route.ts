import { NextResponse } from 'next/server';
import {
  loadLeases, addLease, updateLease, deleteLease, loadLeaseCharges,
} from '@/lib/storage';
import { requireScope, unauthorized, AuthError } from '@/lib/auth';
import { Lease } from '@/types';

/** A date the rest of the app can compare as a string without parsing it. */
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * What a tenancy has to say before it can be saved.
 *
 * The dates are the whole of the arithmetic — rent prorates against them and
 * occupancy counts them — so a lease that ends before it starts would quietly
 * report nothing rather than fail, which is the worst of both.
 */
function validate(body: Partial<Lease>): string | null {
  if (!body.tenantName?.trim()) return 'Give the tenancy a tenant name';
  if (typeof body.monthlyRent !== 'number' || !isFinite(body.monthlyRent) || body.monthlyRent < 0) {
    return 'Monthly rent has to be a number';
  }
  if (!isDate(body.startDate)) return 'Give the tenancy a start date';
  if (body.endDate != null && !isDate(body.endDate)) return 'That end date is not a date';
  if (body.endDate && body.endDate < body.startDate) return 'The lease ends before it starts';
  if (body.terminatedOn != null) {
    if (!isDate(body.terminatedOn)) return 'That move-out date is not a date';
    if (body.terminatedOn < body.startDate) return 'The tenant cannot move out before moving in';
  }
  if (body.renewalNoticeDate != null && !isDate(body.renewalNoticeDate)) {
    return 'That notice date is not a date';
  }
  if (body.depositHeld != null && (typeof body.depositHeld !== 'number' || body.depositHeld < 0)) {
    return 'A deposit has to be a number';
  }
  return null;
}

/** The unit's tenancies and everything billed against them. */
export async function GET(req: Request) {
  try {
    const { account, scope } = await requireScope(req);
    const [leases, charges] = await Promise.all([loadLeases(scope), loadLeaseCharges(scope)]);
    leases.sort((a, b) => b.startDate.localeCompare(a.startDate));
    const property = account.properties.find(p => p.id === scope.propertyId);
    return NextResponse.json({
      leases,
      charges,
      propertyName: property?.name ?? '',
      model: property?.model ?? 'str',
      currency: account.currency,
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Leases GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { scope } = await requireScope(req);
    const body = await req.json() as Partial<Lease>;
    const problem = validate(body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const now = new Date().toISOString();
    const lease: Lease = {
      id: `lse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      tenantName: body.tenantName!.trim(),
      monthlyRent: body.monthlyRent!,
      startDate: body.startDate!,
      endDate: body.endDate ?? null,
      terminatedOn: body.terminatedOn ?? null,
      renewalNoticeDate: body.renewalNoticeDate ?? null,
      depositHeld: body.depositHeld ?? 0,
      notes: body.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    await addLease(scope, lease);
    return NextResponse.json(lease, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Leases POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { scope } = await requireScope(req);
    const body = await req.json() as Partial<Lease> & { id?: string };
    if (!body.id) return NextResponse.json({ error: 'Which tenancy?' }, { status: 400 });

    // Validate the lease as it will be, not as it was sent: a move-out date on
    // its own has to be checked against the start date already stored
    const existing = (await loadLeases(scope)).find(l => l.id === body.id);
    if (!existing) return NextResponse.json({ error: 'No such tenancy' }, { status: 404 });
    const problem = validate({ ...existing, ...body });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const updated = await updateLease(scope, body.id, body);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Leases PUT error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { scope } = await requireScope(req);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Which tenancy?' }, { status: 400 });
    const removed = await deleteLease(scope, id);
    if (!removed) return NextResponse.json({ error: 'No such tenancy' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Leases DELETE error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
