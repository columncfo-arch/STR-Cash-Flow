import { NextResponse } from 'next/server';
import { addLead, loadBookings, loadSettings, resolveScope, updateBooking } from '@/lib/storage';
import { DirectLead } from '@/types';

// Public endpoint — no auth. Guests call this from the /welcome page.
// The host embeds ?u=<userId> in their welcome page URL so we know whose data to load.

function resolveUserId(req: Request): string | null {
  const { searchParams } = new URL(req.url);
  return searchParams.get('u') ?? process.env.DEFAULT_HOST_USER_ID ?? null;
}

/**
 * Which unit the code was printed for. Codes made before properties existed
 * carry no p, and fall back to the active property as they always did.
 */
function resolvePropertyId(req: Request): string | null {
  return new URL(req.url).searchParams.get('p');
}

export async function POST(req: Request) {
  try {
    const userId = resolveUserId(req);
    if (!userId) return NextResponse.json({ error: 'Missing host identifier' }, { status: 400 });

    const { firstName, lastName, email, phone, tcpaConsent } = await req.json() as {
      firstName?: string; lastName?: string; email?: string; phone?: string; tcpaConsent?: boolean;
    };

    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

    // Leads belong to the account — the welcome link carries only a user id —
    // while the stay being matched belongs to a property.
    const { scope } = await resolveScope(userId, resolvePropertyId(req));
    const [settings, bookings] = await Promise.all([loadSettings(scope), loadBookings(scope)]);

    const guestName = [firstName, lastName].filter(Boolean).join(' ') || undefined;
    const today = new Date().toISOString().slice(0, 10);

    // Find a booking where today falls within the stay window
    const activeSell = bookings.find(b => b.checkIn <= today && b.checkOut > today);

    if (activeSell) {
      const notes = tcpaConsent
        ? (activeSell.notes ? activeSell.notes + ' | TCPA consent: yes' : 'TCPA consent: yes')
        : activeSell.notes;
      await updateBooking(scope, activeSell.id, {
        email: email || undefined,
        phone: phone || activeSell.phone || undefined,
        guestName: guestName || activeSell.guestName || undefined,
        notes,
        updatedAt: new Date().toISOString(),
      });
    }

    const lead: DirectLead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName: firstName?.trim() || '',
      lastName: (lastName ?? '').trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || undefined,
      tcpaConsent: tcpaConsent ?? false,
      source: 'welcome',
      createdAt: new Date().toISOString(),
    };
    await addLead(userId, lead);

    return NextResponse.json({
      matched: !!activeSell,
      propertyName: settings.propertyName,
      wifiNetwork: settings.wifiNetwork ?? null,
      wifiPassword: settings.wifiPassword ?? null,
      welcomeMessage: settings.welcomeMessage ?? null,
      localGuideUrl: settings.localGuideUrl ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

// GET /api/welcome — returns public property info (no sensitive financial data)
export async function GET(req: Request) {
  try {
    const userId = resolveUserId(req);
    if (!userId) return NextResponse.json({ error: 'Missing host identifier' }, { status: 400 });

    const { account, scope } = await resolveScope(userId, resolvePropertyId(req));
    const settings = await loadSettings(scope);
    const property = account.properties.find(p => p.id === scope.propertyId);
    return NextResponse.json({
      propertyName: property?.name ?? settings.propertyName,
      welcomeMessage: settings.welcomeMessage ?? null,
      hasWifi: !!(settings.wifiNetwork || settings.wifiPassword),
      hasLocalGuide: !!settings.localGuideUrl,
      directNightlyRate: settings.directNightlyRate ?? null,
      directMinNights: settings.directMinNights ?? 2,
      directDescription: settings.directDescription ?? null,
      guestCleaningFee: settings.guestCleaningFeePerBooking ?? 0,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load property info' }, { status: 500 });
  }
}
