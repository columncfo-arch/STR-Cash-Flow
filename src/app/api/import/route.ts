import { NextResponse } from 'next/server';
import { loadBookings, saveBookings } from '@/lib/storage';
import { Booking, Platform } from '@/types';

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === '\t' && !inQuote) {
        fields.push(cur.trim()); cur = '';
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  // Auto-detect delimiter: tabs vs commas
  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const useTab = tabCount > commaCount;

  function splitAuto(line: string): string[] {
    if (useTab) return line.split('\t').map(s => s.trim().replace(/^"|"$/g, ''));
    return splitLine(line);
  }

  const headers = splitAuto(lines[0]).map(h =>
    h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  );

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = splitAuto(line);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]));
  });
}

function parseMoney(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : Math.abs(n);
}

function col(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== '') return row[c];
  }
  return '';
}

function normalizeDate(s: string): string {
  if (!s) return '';
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

interface ParsedRow {
  confirmationCode: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
}

function parseAirbnb(rows: Record<string, string>[]): ParsedRow[] {
  return rows
    .filter(r => col(r, 'type').toLowerCase().includes('reservation'))
    .map(r => {
      const gross = parseMoney(col(r, 'gross_earnings', 'amount'));
      const fee = parseMoney(col(r, 'service_fee', 'host_fee'));
      const net = parseMoney(col(r, 'paid_out'));
      const nights = parseInt(col(r, 'nights')) || 0;
      return {
        confirmationCode: col(r, 'confirmation_code'),
        checkIn: normalizeDate(col(r, 'start_date')),
        checkOut: normalizeDate(col(r, 'end_date')),
        nights,
        guestName: col(r, 'guest'),
        grossAmount: gross,
        platformFee: fee,
        netAmount: net || (gross - fee),
      };
    })
    .filter(r => r.grossAmount > 0 && r.checkIn);
}

function parseVRBO(rows: Record<string, string>[]): ParsedRow[] {
  return rows.map(r => {
    const gross = parseMoney(col(r, 'gross_earnings', 'gross_amount', 'rental_amount', 'booking_amount', 'total_amount'));
    const fee = parseMoney(col(r, 'service_fee', 'vrbo_fee', 'traveler_fee', 'commission', 'host_fee'));
    const net = parseMoney(col(r, 'net_amount', 'owner_payout', 'you_receive', 'owner_payment', 'paid_out'));
    const nights = parseInt(col(r, 'nights')) || 0;
    return {
      confirmationCode: col(r, 'confirmation_code', 'confirmation__', 'reservation_id', 'booking_id'),
      checkIn: normalizeDate(col(r, 'check_in', 'check_in_date', 'arrival', 'start_date')),
      checkOut: normalizeDate(col(r, 'check_out', 'check_out_date', 'departure', 'end_date')),
      nights,
      guestName: col(r, 'guest_name', 'guest', 'traveler_name', 'renter_name'),
      grossAmount: gross || (net + fee),
      platformFee: fee || Math.max(gross - net, 0),
      netAmount: net || (gross - fee),
    };
  }).filter(r => r.grossAmount > 0 && r.checkIn);
}

function parseBookingCom(rows: Record<string, string>[]): ParsedRow[] {
  return rows.map(r => {
    const gross = parseMoney(col(r, 'gross_amount', 'room_revenue', 'total_price', 'amount', 'revenue'));
    const fee = parseMoney(col(r, 'commission', 'commission_amount', 'booking_com_fee', 'platform_fee'));
    const net = parseMoney(col(r, 'net_amount', 'net_revenue', 'payout', 'you_receive', 'paid_out'));
    const nights = parseInt(col(r, 'nights', 'room_nights')) || 0;
    return {
      confirmationCode: col(r, 'reservation_number', 'reservation_id', 'booking_number', 'confirmation_number', 'confirmation_code'),
      checkIn: normalizeDate(col(r, 'check_in', 'check_in_date', 'arrival_date', 'arrival')),
      checkOut: normalizeDate(col(r, 'check_out', 'check_out_date', 'departure_date', 'departure')),
      nights,
      guestName: col(r, 'guest_name', 'booker_name', 'guest'),
      grossAmount: gross || (net + fee),
      platformFee: fee || Math.max(gross - net, 0),
      netAmount: net || (gross - fee),
    };
  }).filter(r => r.grossAmount > 0 && r.checkIn);
}

// ─── Match or create ──────────────────────────────────────────────────────────

export interface MatchResult {
  bookingId: string;
  confirmationCode: string;
  guestName: string;
  checkIn: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  matchedBy: 'confirmation_code' | 'check_in_date';
}

export interface NewBookingResult {
  tempId: string;
  confirmationCode: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  platform: Platform;
}

function processRows(
  parsed: ParsedRow[],
  bookings: Booking[],
  platform: Platform,
): { matched: MatchResult[]; toCreate: NewBookingResult[] } {
  const matched: MatchResult[] = [];
  const toCreate: NewBookingResult[] = [];

  for (const row of parsed) {
    const code = row.confirmationCode?.trim().toUpperCase();

    // Try confirmation code match
    let booking: Booking | undefined;
    if (code) {
      booking = bookings.find(b =>
        b.platform === platform &&
        (b.confirmationCode?.toUpperCase() === code ||
         b.uid?.toUpperCase().includes(code))
      );
    }

    // Fall back: same platform + same check-in date
    if (!booking && row.checkIn) {
      const candidates = bookings.filter(b => b.platform === platform && b.checkIn === row.checkIn);
      if (candidates.length === 1) booking = candidates[0];
    }

    if (booking) {
      matched.push({
        bookingId: booking.id,
        confirmationCode: row.confirmationCode,
        guestName: booking.guestName ?? row.guestName,
        checkIn: booking.checkIn,
        grossAmount: row.grossAmount,
        platformFee: row.platformFee,
        netAmount: row.netAmount,
        matchedBy: code && (booking.confirmationCode || booking.uid?.includes(row.confirmationCode))
          ? 'confirmation_code' : 'check_in_date',
      });
    } else if (row.checkIn) {
      // Not in system yet — create it from CSV data
      const nights = row.nights ||
        (row.checkOut
          ? Math.max(Math.round((new Date(row.checkOut).getTime() - new Date(row.checkIn).getTime()) / 86400000), 1)
          : 1);
      toCreate.push({
        tempId: `csv-${platform}-${code || row.checkIn}-${Date.now()}`,
        confirmationCode: row.confirmationCode,
        checkIn: row.checkIn,
        checkOut: row.checkOut || '',
        nights,
        guestName: row.guestName,
        grossAmount: row.grossAmount,
        platformFee: row.platformFee,
        netAmount: row.netAmount,
        platform,
      });
    }
  }

  return { matched, toCreate };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      action: 'preview' | 'apply';
      platform: Platform;
      csvText?: string;
      matched?: MatchResult[];
      toCreate?: NewBookingResult[];
    };

    const bookings = await loadBookings();

    if (body.action === 'preview') {
      const { platform, csvText } = body;
      if (!csvText) return NextResponse.json({ error: 'csvText required' }, { status: 400 });

      const rows = parseCSV(csvText);
      let parsed: ParsedRow[];
      if (platform === 'airbnb') parsed = parseAirbnb(rows);
      else if (platform === 'vrbo') parsed = parseVRBO(rows);
      else if (platform === 'booking') parsed = parseBookingCom(rows);
      else parsed = parseAirbnb(rows);

      const { matched, toCreate } = processRows(parsed, bookings, platform);
      return NextResponse.json({ matched, toCreate, totalRows: rows.length });
    }

    if (body.action === 'apply') {
      const { matched = [], toCreate = [] } = body;
      const now = new Date().toISOString();
      let updated = 0;
      let created = 0;

      // Update existing bookings
      for (const m of matched) {
        const idx = bookings.findIndex(b => b.id === m.bookingId);
        if (idx < 0) continue;
        bookings[idx] = {
          ...bookings[idx],
          income: m.grossAmount,
          platformFee: m.platformFee,
          confirmationCode: bookings[idx].confirmationCode || m.confirmationCode || undefined,
          updatedAt: now,
        };
        updated++;
      }

      // Create new bookings from CSV
      for (const n of toCreate) {
        const id = `csv-${n.platform}-${n.confirmationCode || n.checkIn}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        bookings.push({
          id,
          sourceId: `csv-${n.platform}`,
          platform: n.platform,
          uid: n.confirmationCode || id,
          summary: n.guestName ? `${n.platform} - ${n.guestName}` : n.platform,
          checkIn: n.checkIn,
          checkOut: n.checkOut,
          nights: n.nights,
          guestName: n.guestName || undefined,
          confirmationCode: n.confirmationCode || undefined,
          income: n.grossAmount,
          platformFee: n.platformFee,
          isManual: false,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }

      await saveBookings(bookings);
      return NextResponse.json({ updated, created });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Import failed' }, { status: 500 });
  }
}
