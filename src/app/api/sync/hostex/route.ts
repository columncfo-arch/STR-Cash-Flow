import { NextResponse } from 'next/server';
import { requireAuth, unauthorized, AuthError } from '@/lib/auth';
import { loadSettings, loadBookings, replaceAllBookings } from '@/lib/storage';
import { Booking, Platform } from '@/types';

export const dynamic = 'force-dynamic';

// Hostex REST API base — https://open.hostex.io/v3
const HOSTEX_BASE = 'https://open.hostex.io/v3';

interface HostexGuest {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

interface HostexReservation {
  code?: string;
  stay_code?: string;
  status?: string;
  check_in_date?: string;
  check_out_date?: string;
  nights?: number;
  guest?: HostexGuest;
  accommodation_fare?: number;
  total_price?: number;
  host_service_fee?: number;
  host_payout?: number;
  channel?: string;
  source?: string;
  property?: { id?: string | number; title?: string };
  created_at?: string;
  booking_date?: string;
}

function mapPlatform(channel: string): Platform {
  const c = channel.toLowerCase();
  if (c.includes('airbnb')) return 'airbnb';
  if (c.includes('booking')) return 'booking';
  if (c.includes('vrbo') || c.includes('homeaway')) return 'vrbo';
  if (c.includes('direct') || c.includes('manual')) return 'direct';
  return 'other';
}

async function fetchPage(token: string, page: number, pageSize: number): Promise<{ reservations: HostexReservation[]; total: number }> {
  const res = await fetch(
    `${HOSTEX_BASE}/reservations?page=${page}&page_size=${pageSize}`,
    { headers: { 'Hostex-Access-Token': token } }
  );
  const text = await res.text();
  let json: { error_code?: number; error_msg?: string; data?: { reservations?: HostexReservation[]; total?: number } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Hostex returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok || (json.error_code && json.error_code !== 0)) {
    throw new Error(json.error_msg ?? `Hostex API error ${res.status}`);
  }
  return {
    reservations: json.data?.reservations ?? [],
    total: json.data?.total ?? 0,
  };
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
      const s = (r.status ?? '').toLowerCase();
      return s !== 'cancelled' && s !== 'canceled' && s !== 'denied' && s !== 'inquiry';
    });

    const existing = await loadBookings(userId);
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;

    for (const r of active) {
      const confirmationCode = r.code ?? r.stay_code ?? '';
      const checkIn = r.check_in_date ?? '';
      const checkOut = r.check_out_date ?? '';
      if (!checkIn) continue;

      const nights = r.nights ??
        (checkOut
          ? Math.max(Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000), 1)
          : 1);

      const guestName = r.guest
        ? [r.guest.first_name, r.guest.last_name].filter(Boolean).join(' ') || undefined
        : undefined;

      const platform = mapPlatform(r.channel ?? r.source ?? '');
      const income = r.total_price ?? r.accommodation_fare ?? 0;

      const existingIdx = confirmationCode
        ? existing.findIndex(b => b.confirmationCode === confirmationCode || b.uid === confirmationCode)
        : -1;

      const sharedFields = {
        checkIn,
        checkOut,
        nights,
        guestName: guestName || undefined,
        email: r.guest?.email || undefined,
        phone: r.guest?.phone || undefined,
        income,
        platformFee: r.host_service_fee || undefined,
        paidOut: r.host_payout || undefined,
        status: r.status || undefined,
        listing: r.property?.title || undefined,
        bookingDate: r.booking_date ?? r.created_at?.slice(0, 10) ?? undefined,
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

    // Deduplicate: same platform + checkIn → keep the Hostex-sourced one (or the one with a confirmation code)
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
      // If confirmation codes differ they may genuinely be different bookings — skip
      if (b.confirmationCode && prev.confirmationCode && b.confirmationCode !== prev.confirmationCode) continue;
      // Prefer Hostex-sourced; otherwise prefer whichever has a confirmation code
      const keepNew = b.sourceId === 'hostex' || (!prev.confirmationCode && b.confirmationCode);
      if (keepNew) {
        toRemove.add(prevIdx);
        seen.set(key, i);
      } else {
        toRemove.add(i);
      }
      deduped++;
    }
    const dedupedBookings = existing.filter((_, i) => !toRemove.has(i));

    await replaceAllBookings(userId, dedupedBookings);
    return NextResponse.json({ created, updated, total: active.length, deduped });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Hostex sync error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
