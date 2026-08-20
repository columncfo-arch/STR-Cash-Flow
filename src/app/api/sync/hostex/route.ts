import { NextResponse } from 'next/server';
import { requireAuth, unauthorized, AuthError } from '@/lib/auth';
import { loadSettings, loadBookings, replaceAllBookings } from '@/lib/storage';
import { Booking, Platform } from '@/types';

export const dynamic = 'force-dynamic';

const HOSTEX_BASE = process.env.HOSTEX_API_BASE ?? 'https://api.hostex.io/v3';

// Hostex signals success with error_code 200 (message "Done."); 0 is accepted
// too since plenty of endpoints in this family use it.
const OK_CODES = new Set([0, 200]);

interface HostexMoney {
  currency?: string;
  amount?: number;
}

// Line items on a reservation. ACCOMMODATION + the guest-paid fees sum to
// total_rate; HOST_SERVICE_FEE is the channel's cut and is deducted from it.
interface HostexRateDetail {
  type?: string;
  description?: string;
  currency?: string;
  amount?: number;
}

interface HostexReservation {
  reservation_code?: string;
  stay_code?: string;
  status?: string;              // accepted / cancelled / denied …
  stay_status?: string;         // stay_completed / checkin_pending …
  cancelled_at?: string | null;
  check_in_date?: string;
  check_out_date?: string;
  channel_type?: string;        // airbnb / vrbo / booking …
  custom_channel?: { id?: number; name?: string };
  property_id?: number;
  listing_id?: string;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  guests?: { name?: string; email?: string; phone?: string; is_booker?: boolean }[];
  number_of_guests?: number;
  number_of_adults?: number;
  number_of_children?: number;
  booked_at?: string;
  created_at?: string;
  remarks?: string;
  rates?: {
    total_rate?: HostexMoney;      // gross the guest paid
    total_commission?: HostexMoney; // channel commission / host service fee
    tax?: HostexMoney | null;
    details?: HostexRateDetail[];
  };
  payment?: {
    currency?: string;
    total_amount?: number;    // net payout = total_rate − total_commission
    received_amount?: number;
  };
}

function mapPlatform(channel: string): Platform {
  const c = channel.toLowerCase();
  if (c.includes('airbnb')) return 'airbnb';
  if (c.includes('booking')) return 'booking';
  if (c.includes('vrbo') || c.includes('homeaway')) return 'vrbo';
  if (c.includes('direct') || c.includes('manual')) return 'direct';
  return 'other';
}

function detailAmount(details: HostexRateDetail[] | undefined, type: string): number | undefined {
  const hit = details?.find(d => d.type === type);
  return hit?.amount || undefined;
}

// Copy every field `drop` has and `keep` is missing onto `keep`, so discarding a
// duplicate never throws away detail the survivor lacks. `id` and `createdAt`
// are the survivor's identity and are never overwritten.
function absorb(keep: Booking, drop: Booking): void {
  const preserved = new Set(['id', 'createdAt']);
  for (const [k, v] of Object.entries(drop) as [keyof Booking, unknown][]) {
    if (preserved.has(k) || v === undefined || v === null || v === '') continue;
    const cur = keep[k];
    // Treat 0 as missing for money/count fields so a real figure wins over a zero.
    if (cur === undefined || cur === null || cur === '' || (cur === 0 && typeof v === 'number' && v !== 0)) {
      (keep as unknown as Record<string, unknown>)[k] = v;
    }
  }
}

interface HostexEnvelope {
  error_code?: number;
  error_msg?: string;
  data?: { reservations?: HostexReservation[]; total?: number };
}

async function fetchPage(token: string, page: number, pageSize: number): Promise<{ reservations: HostexReservation[]; total: number }> {
  const res = await fetch(
    `${HOSTEX_BASE}/reservations?page=${page}&page_size=${pageSize}`,
    { headers: { 'Hostex-Access-Token': token } },
  );
  const text = await res.text();

  let json: HostexEnvelope;
  try {
    json = JSON.parse(text) as HostexEnvelope;
  } catch {
    throw new Error(`Hostex returned non-JSON (HTTP ${res.status}) from ${HOSTEX_BASE}: ${text.slice(0, 300)}`);
  }

  if (json.error_code !== undefined && !OK_CODES.has(json.error_code)) {
    throw new Error(`${json.error_msg ?? 'Hostex API error'} (code ${json.error_code})`);
  }
  if (!res.ok) throw new Error(json.error_msg ?? `Hostex API error ${res.status}`);

  // Surface a field-name mismatch instead of silently syncing nothing.
  if (!Array.isArray(json.data?.reservations)) {
    throw new Error(
      `Hostex response has no 'reservations' array. data keys: ${Object.keys(json.data ?? {}).join(', ') || '(none)'}`,
    );
  }

  return { reservations: json.data.reservations, total: json.data.total ?? json.data.reservations.length };
}

async function fetchAll(token: string): Promise<HostexReservation[]> {
  const pageSize = 100;
  const first = await fetchPage(token, 1, pageSize);
  const all = [...first.reservations];
  const pages = Math.ceil(first.total / pageSize);
  for (let p = 2; p <= pages; p++) {
    const { reservations } = await fetchPage(token, p, pageSize);
    all.push(...reservations);
  }
  return all;
}

// GET /api/sync/hostex — returns the raw first reservation verbatim, writing
// nothing. Use it to confirm which fields Hostex actually sends before trusting
// the mapping below.
export async function GET() {
  try {
    const userId = await requireAuth();
    const settings = await loadSettings(userId);
    const token = settings.hostexAccessToken?.trim();
    if (!token) return NextResponse.json({ error: 'No Hostex access token saved.' }, { status: 400 });

    const res = await fetch(`${HOSTEX_BASE}/reservations?page=1&page_size=1`, {
      headers: { 'Hostex-Access-Token': token },
    });
    const text = await res.text();
    try {
      return NextResponse.json({ base: HOSTEX_BASE, status: res.status, body: JSON.parse(text) });
    } catch {
      return NextResponse.json({ base: HOSTEX_BASE, status: res.status, body: text.slice(0, 2000) });
    }
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const userId = await requireAuth();
    const settings = await loadSettings(userId);

    const token = settings.hostexAccessToken?.trim();
    if (!token) {
      return NextResponse.json(
        { error: 'No Hostex access token saved. Add it in Settings → Integrations.' },
        { status: 400 }
      );
    }

    const raw = await fetchAll(token);

    const active = raw.filter(r => {
      if (r.cancelled_at) return false;
      const s = (r.status ?? '').toLowerCase();
      return s !== 'cancelled' && s !== 'canceled' && s !== 'denied' && s !== 'inquiry';
    });

    const existing = await loadBookings(userId);
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;

    for (const r of active) {
      const confirmationCode = r.reservation_code ?? r.stay_code ?? '';
      const checkIn = r.check_in_date ?? '';
      const checkOut = r.check_out_date ?? '';
      if (!checkIn) continue;

      // Hostex doesn't send a night count — derive it from the stay dates.
      const nights = checkOut
        ? Math.max(Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000), 1)
        : 1;

      const booker = r.guests?.find(g => g.is_booker) ?? r.guests?.[0];
      const guestName = r.guest_name || booker?.name || undefined;

      const platform = mapPlatform(r.channel_type ?? r.custom_channel?.name ?? '');

      // total_rate is the gross the guest paid (accommodation + cleaning + pet
      // + extra-guest fees). total_commission is the channel's cut, already
      // excluded from payment.total_amount, which is the net payout.
      const income = r.rates?.total_rate?.amount ?? 0;
      const platformFee = r.rates?.total_commission?.amount || undefined;
      const paidOut = r.payment?.total_amount ?? undefined;

      const existingIdx = confirmationCode
        ? existing.findIndex(b => b.confirmationCode === confirmationCode || b.uid === confirmationCode)
        : -1;

      const sharedFields = {
        checkIn,
        checkOut,
        nights,
        guestName,
        email: r.guest_email || booker?.email || undefined,
        phone: r.guest_phone || booker?.phone || undefined,
        income,
        platformFee,
        paidOut,
        cleaningFee: detailAmount(r.rates?.details, 'CLEANING_FEE'),
        petFee: detailAmount(r.rates?.details, 'PET_FEE'),
        taxRemitted: r.rates?.tax?.amount || undefined,
        currency: r.rates?.total_rate?.currency || r.payment?.currency || undefined,
        status: r.status || undefined,
        propertyId: r.property_id !== undefined ? String(r.property_id) : undefined,
        unitId: r.listing_id || undefined,
        bookingDate: r.booked_at?.slice(0, 10) ?? r.created_at?.slice(0, 10) ?? undefined,
        adults: r.number_of_adults || undefined,
        children: r.number_of_children || undefined,
        people: r.number_of_guests || undefined,
        notes: r.remarks || undefined,
        updatedAt: now,
      };

      if (existingIdx >= 0) {
        existing[existingIdx] = { ...existing[existingIdx], ...sharedFields };
        updated++;
      } else {
        const id = `hostex-${confirmationCode || checkIn}-${Math.random().toString(36).slice(2, 7)}`;
        existing.push({
          id,
          sourceId: 'hostex',
          platform,
          uid: confirmationCode || id,
          summary: guestName ? `${platform} - ${guestName}` : platform,
          confirmationCode: confirmationCode || undefined,
          isManual: false,
          createdAt: now,
          ...sharedFields,
        } as Booking);
        created++;
      }
    }

    // Deduplicate same platform + checkIn. The winner absorbs any field the
    // loser had and it lacks, so collapsing a pair never loses data — a CSV
    // row's cleaning/tax detail survives into the Hostex record that replaces it.
    let deduped = 0;
    const seen = new Map<string, number>(); // key → index in existing
    const toRemove = new Set<number>();
    for (let i = 0; i < existing.length; i++) {
      const b = existing[i];
      const key = `${b.platform}|${b.checkIn}`;
      const prevIdx = seen.get(key);
      if (prevIdx === undefined) {
        seen.set(key, i);
        continue;
      }
      const prev = existing[prevIdx];
      // Distinct confirmation codes, or distinct check-outs, mean these are
      // genuinely different bookings that happen to share a start date.
      if (b.confirmationCode && prev.confirmationCode && b.confirmationCode !== prev.confirmationCode) continue;
      if (b.checkOut && prev.checkOut && b.checkOut !== prev.checkOut) continue;

      // Prefer Hostex-sourced; otherwise prefer whichever has a confirmation code
      const keepNew = b.sourceId === 'hostex' || (!prev.confirmationCode && !!b.confirmationCode);
      const [keep, drop] = keepNew ? [b, prev] : [prev, b];
      absorb(keep, drop);
      toRemove.add(keepNew ? prevIdx : i);
      if (keepNew) seen.set(key, i);
      deduped++;
    }
    const dedupedBookings = existing.filter((_, i) => !toRemove.has(i));

    await replaceAllBookings(userId, dedupedBookings);
    return NextResponse.json({ created, updated, total: active.length, deduped, base: HOSTEX_BASE });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Hostex sync error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
