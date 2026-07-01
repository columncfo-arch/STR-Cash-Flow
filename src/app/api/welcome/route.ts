import { NextResponse } from 'next/server';
import { loadBookings, loadSettings, updateBooking } from '@/lib/storage';

// Public endpoint — no auth. Guests call this from the /welcome page.
// Matches their check-in date to a booking, saves contact info, returns wifi details.

export async function POST(req: Request) {
  try {
    const { name, email, phone, checkIn } = await req.json() as {
      name?: string; email?: string; phone?: string; checkIn?: string;
    };

    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

    const [settings, bookings] = await Promise.all([loadSettings(), loadBookings()]);

    // Try to match by check-in date (exact or ±1 day) so slight timezone shifts don't block
    let matched = false;
    if (checkIn) {
      const targetMs = new Date(checkIn + 'T12:00:00').getTime();
      const candidate = bookings.find(b => {
        const diff = Math.abs(new Date(b.checkIn + 'T12:00:00').getTime() - targetMs);
        return diff <= 86400000; // within 24 hours
      });
      if (candidate) {
        await updateBooking(candidate.id, {
          email: email || undefined,
          phone: phone || candidate.phone || undefined,
          guestName: name || candidate.guestName || undefined,
          updatedAt: new Date().toISOString(),
        });
        matched = true;
      }
    }

    // Even if no booking match, return wifi info — guest is physically there
    return NextResponse.json({
      matched,
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
