import ical from 'node-ical';
import { Booking, ICalSource, Platform } from '@/types';
import { differenceInDays, parseISO, format } from 'date-fns';

function extractGuestName(summary: string, description: string): string | undefined {
  // Airbnb: "Reserved - First Last" or "CLOSED - First Last"
  const airbnbMatch = summary.match(/(?:Reserved|CLOSED)\s*[-–]\s*(.+)/i);
  if (airbnbMatch) return airbnbMatch[1].trim();

  // VRBO: description often has guest name
  const vrboMatch = description?.match(/Guest Name:\s*(.+)/i);
  if (vrboMatch) return vrboMatch[1].trim();

  // Booking.com: "CLOSED - Guest"
  const bookingMatch = description?.match(/(?:Name|Guest):\s*(.+)/i);
  if (bookingMatch) return bookingMatch[1].trim();

  return undefined;
}

function extractConfirmationCode(uid: string, summary: string, description: string): string | undefined {
  // Airbnb UIDs contain the confirmation code: HMABC123@airbnb.com
  const airbnbUid = uid.match(/^([A-Z0-9]+)@airbnb\.com/i);
  if (airbnbUid) return airbnbUid[1];

  // VRBO confirmation in description
  const vrboCode = description?.match(/(?:Confirmation|Reservation)\s*(?:Code|#|Number):\s*([A-Z0-9]+)/i);
  if (vrboCode) return vrboCode[1];

  return undefined;
}

function detectPlatform(source: ICalSource, uid: string): Platform {
  if (source.platform !== 'other') return source.platform;
  if (uid.includes('airbnb')) return 'airbnb';
  if (uid.includes('booking')) return 'booking';
  if (uid.includes('vrbo') || uid.includes('homeaway')) return 'vrbo';
  return 'other';
}

function isBlockedDate(summary: string): boolean {
  const s = summary.toLowerCase();
  return s.includes('airbnb (not available)') ||
    s.includes('not available') ||
    s.includes('blocked') ||
    s.includes('unavailable') ||
    s === 'busy';
}

export async function parseICalSource(
  source: ICalSource,
  defaultNightlyRate: number
): Promise<Booking[]> {
  const data = await ical.fromURL(source.url);
  const bookings: Booking[] = [];
  const now = new Date().toISOString();

  for (const [uid, event] of Object.entries(data)) {
    if (!event || event.type !== 'VEVENT') continue;

    const summary = (event.summary as string) || '';
    const description = (event.description as string) || '';

    // Skip owner blocks / unavailable markers that aren't real bookings
    if (isBlockedDate(summary) && !summary.toLowerCase().includes('reserved')) continue;

    const start = event.start as Date;
    const end = event.end as Date;
    if (!start || !end) continue;

    const checkIn = format(start, 'yyyy-MM-dd');
    const checkOut = format(end, 'yyyy-MM-dd');
    const nights = Math.max(differenceInDays(end, start), 1);
    const platform = detectPlatform(source, uid);

    const booking: Booking = {
      id: `${source.id}-${uid}`,
      sourceId: source.id,
      platform,
      uid,
      summary,
      checkIn,
      checkOut,
      nights,
      guestName: extractGuestName(summary, description),
      confirmationCode: extractConfirmationCode(uid, summary, description),
      income: defaultNightlyRate > 0 ? nights * defaultNightlyRate : 0,
      isManual: false,
      createdAt: now,
      updatedAt: now,
    };

    bookings.push(booking);
  }

  return bookings;
}
