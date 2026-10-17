import { NextResponse } from 'next/server';
import { addLead, loadLeads, resolveScope } from '@/lib/storage';
import { requireScope, unauthorized, AuthError } from '@/lib/auth';
import { DirectLead } from '@/types';

export async function POST(req: Request) {
  try {
    // The booking form is public — the host embeds ?u=<userId> in their form URL
    // so we know which host's lead bucket to write to, and ?p= which of their
    // units the enquiry is about.
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('u') ?? process.env.DEFAULT_HOST_USER_ID ?? null;
    if (!userId) return NextResponse.json({ error: 'Missing host identifier' }, { status: 400 });
    const { scope } = await resolveScope(userId, searchParams.get('p'));

    const { firstName, lastName, email, phone, preferredDates, tcpaConsent } = await req.json() as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      preferredDates?: string;
      tcpaConsent?: boolean;
    };

    if (!firstName || !email) {
      return NextResponse.json({ error: 'First name and email are required' }, { status: 400 });
    }

    const lead: DirectLead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName: firstName.trim(),
      lastName: (lastName ?? '').trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || undefined,
      preferredDates: preferredDates?.trim() || undefined,
      tcpaConsent: tcpaConsent ?? false,
      source: 'direct_booking',
      propertyId: scope.propertyId,
      createdAt: new Date().toISOString(),
    };

    await addLead(userId, lead);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    // Leads are stored per account, because a welcome link carries only a user
    // id. The roster shows the unit in view, plus anything captured before
    // properties existed — those cannot be attributed, and hiding them from
    // every unit would lose them.
    const { userId, scope } = await requireScope(req);
    const leads = await loadLeads(userId);
    const mine = leads.filter(l => !l.propertyId || l.propertyId === scope.propertyId);
    const sorted = [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json(sorted);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Direct booking GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
