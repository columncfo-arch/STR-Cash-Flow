import { NextResponse } from 'next/server';
import { addLead, loadLeads } from '@/lib/storage';
import { DirectLead } from '@/types';

export async function POST(req: Request) {
  try {
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
      createdAt: new Date().toISOString(),
    };

    await addLead(lead);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const leads = await loadLeads();
    const sorted = [...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json(sorted);
  } catch {
    return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
  }
}
