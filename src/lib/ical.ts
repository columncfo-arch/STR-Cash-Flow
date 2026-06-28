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
  const s = summary.toLowerCase().trim();
  return (
    s.includes('not available') ||   // "Airbnb (Not available)", "CLOSED - Not available"
    s === 'blocked' ||
    s.includes('owner block') ||
    s === 'unavailable' ||
    s === 'busy' ||
    s === 'closed'
  );
}

// Attempt to pull a dollar total out of text and/or X-* iCal properties.
// Returns 0 if nothing found — caller decides whether to fall back.
function extractIncome(description: string, event: Record<string, unknown>): number {
  // 1) Scan all X-* custom properties first (VRBO, some Booking.com variants)
  const xPriceKeys = [
    'x-total-price', 'x-price', 'x-amount', 'x-booking-total',
    'x-vrbo-total', 'x-airbnb-total', 'x-payout', 'x-revenue',
    'x-host-payout', 'x-earnings',
  ];
  for (const key of xPriceKeys) {
    const val = event[key] ?? event[key.toUpperCase()];
    if (val) {
      const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
      if (n > 0) return n;
    }
  }

  // 2) Scan every property value for dollar / currency patterns
  for (const [k, v] of Object.entries(event)) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const text = String(v ?? '');
    if (!text) continue;

    // Patterns: "$1,234.56", "USD 1234.56", "Total: 1234.56", "Payout: 1234"
    const dollarPatterns = [
      /(?:total|payout|earnings?|price|amount|revenue)[^\d]*\$?([\d,]+(?:\.\d{1,2})?)/gi,
      /\$\s*([\d,]+(?:\.\d{1,2})?)/g,
      /(?:USD|EUR|GBP|CAD|AUD)\s*([\d,]+(?:\.\d{1,2})?)/gi,
    ];
    for (const re of dollarPatterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const n = parseFloat(m[1].replace(/,/g, ''));
        if (n >= 10) return n; // ignore tiny numbers like $1 (probably not a booking total)
      }
    }
  }

  // 3) Specifically scan DESCRIPTION for price lines (common in VRBO)
  if (description) {
    const lines = description.split(/[\r\n\\n]+/);
    for (const line of lines) {
      const m = line.match(/(?:total|payout|earning|price|amount)[^\d]*\$?([\d,]+(?:\.\d{1,2})?)/i);
      if (m) {
        const n = parseFloat(m[1].replace(/,/g, ''));
        if (n >= 10) return n;
      }
    }
  }

  return 0;
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

    const extractedIncome = extractIncome(description, event as Record<string, unknown>);
    // Use extracted price if found; otherwise fall back to default nightly rate estimate
    const income = extractedIncome > 0
      ? extractedIncome
      : (defaultNightlyRate > 0 ? nights * defaultNightlyRate : 0);

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
      income,
      isManual: false,
      createdAt: now,
      updatedAt: now,
    };

    bookings.push(booking);
  }

  return bookings;
}
