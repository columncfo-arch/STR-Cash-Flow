import { NextResponse } from 'next/server';
import { loadBookings, loadSettings, updateBooking } from '@/lib/storage';

// Public endpoint — no auth. Guests call this from the /welcome page.
// Matches their visit to a booking that is currently active (today is within check-in..check-out).

export async function POST(req: Request) {
  try {
    const { firstName, lastName, email, phone, tcpaConsent } = await req.json() as {
      firstName?: string; lastName?: string; email?: string; phone?: string; tcpaConsent?: boolean;
    };

    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

    const [settings, bookings] = await Promise.all([loadSettings(), loadBookings()]);

    const guestName = [firstName, lastName].filter(Boolean).join(' ') || undefined;
    const today = new Date().toISOString().slice(0, 10);

    // Find a booking where today falls within the stay window
    const activeSell = bookings.find(b => b.checkIn <= today && b.checkOut > today);

    if (activeSell) {
      const notes = tcpaConsent
        ? (activeSell.notes ? activeSell.notes + ' | TCPA consent: yes' : 'TCPA consent: yes')
        : activeSell.notes;
      await updateBooking(activeSell.id, {
        email: email || undefined,
        phone: phone || activeSell.phone || undefined,
        guestName: guestName || activeSell.guestName || undefined,
        notes,
        updatedAt: new Date().toISOString(),
      });
    }

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
export async function GET() {
  try {
    const settings = await loadSettings();
    return NextResponse.json({
      propertyName: settings.propertyName,
      welcomeMessage: settings.welcomeMessage ?? null,
      hasWifi: !!(settings.wifiNetwork || settings.wifiPassword),
      hasLocalGuide: !!settings.localGuideUrl,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load property info' }, { status: 500 });
  }
}
