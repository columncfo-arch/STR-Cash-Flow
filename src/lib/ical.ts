import ical from 'node-ical';
import { Booking, ICalSource, Platform } from '@/types';
import { differenceInDays, format } from 'date-fns';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/calendar,*/*',
};

async function fetchICS(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
  }
  return res.text();
}

function extractGuestName(summary: string, description: string): string | undefined {
  // Airbnb: "Reserved - First Last"
  const airbnbMatch = summary.match(/(?:Reserved|CLOSED)\s*[-–]\s*(.+)/i);
  if (airbnbMatch) return airbnbMatch[1].trim();

  // VRBO description fields
  const vrboMatch = description?.match(/(?:Guest Name|Name):\s*(.+)/i);
  if (vrboMatch) return vrboMatch[1].trim();

  return undefined;
}

function extractConfirmationCode(uid: string, description: string): string | undefined {
  // Airbnb UIDs: HMABC123@airbnb.com
  const airbnbUid = uid.match(/^([A-Z0-9]+)@airbnb\.com/i);
  if (airbnbUid) return airbnbUid[1];

  // VRBO/Booking.com confirmation in description
  const codeMatch = description?.match(/(?:Confirmation|Reservation)\s*(?:Code|#|Number):\s*([A-Z0-9-]+)/i);
  if (codeMatch) return codeMatch[1];

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
  // Skip owner-blocked dates that aren't actual guest reservations
  return (
    s === 'airbnb (not available)' ||
    s === 'not available' ||
    s === 'blocked' ||
    s === 'unavailable' ||
    s === 'busy' ||
    s === 'owner block' ||
    s === 'closed'
  );
}

export async function parseICalSource(
  source: ICalSource,
  defaultNightlyRate: number
): Promise<Booking[]> {
  const icsText = await fetchICS(source.url);
  const data = ical.parseICS(icsText);
  const bookings: Booking[] = [];
  const now = new Date().toISOString();

  for (const [uid, event] of Object.entries(data)) {
    if (!event || event.type !== 'VEVENT') continue;

    const summary = (event.summary as string) || '';
    const description = (event.description as string) || '';

    if (isBlockedDate(summary.trim())) continue;

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
      confirmationCode: extractConfirmationCode(uid, description),
      income: defaultNightlyRate > 0 ? nights * defaultNightlyRate : 0,
      isManual: false,
      createdAt: now,
      updatedAt: now,
    };

    bookings.push(booking);
  }

  return bookings;
}
