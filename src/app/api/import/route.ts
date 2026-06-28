import { NextResponse } from 'next/server';
import { loadBookings, saveBookings } from '@/lib/storage';
import { Booking, Platform } from '@/types';

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Handle quoted fields
  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_'));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = splitLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

function parseMoney(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : Math.abs(n);
}

function findCol(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
  }
  return '';
}

interface ParsedRow {
  confirmationCode: string;
  checkIn: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  guestName: string;
  raw: Record<string, string>;
}

function parseAirbnb(rows: Record<string, string>[]): ParsedRow[] {
  return rows
    .filter(r => {
      const type = findCol(r, 'type').toLowerCase();
      return type.includes('reservation') || type.includes('payout');
    })
    .map(r => {
      const gross = parseMoney(findCol(r, 'amount', 'gross_earnings', 'gross_amount'));
      const fee = parseMoney(findCol(r, 'host_fee', 'service_fee', 'airbnb_fee', 'host_service_fee'));
      const net = parseMoney(findCol(r, 'paid_out', 'net_amount', 'you_earn'));
      return {
        confirmationCode: findCol(r, 'confirmation_code', 'confirmation', 'reservation_code'),
        checkIn: findCol(r, 'start_date', 'check_in', 'check_in_date', 'arrival_date'),
        grossAmount: gross || (net + fee),
        platformFee: fee || (gross - net > 0 ? gross - net : 0),
        netAmount: net || (gross - fee),
        guestName: findCol(r, 'guest', 'guest_name'),
        raw: r,
      };
    })
    .filter(r => r.grossAmount > 0 || r.netAmount > 0);
}

function parseVRBO(rows: Record<string, string>[]): ParsedRow[] {
  return rows.map(r => {
    const gross = parseMoney(findCol(r, 'gross_amount', 'rental_amount', 'booking_amount', 'total_amount', 'gross_earnings'));
    const fee = parseMoney(findCol(r, 'vrbo_fee', 'service_fee', 'traveler_fee', 'commission', 'host_fee'));
    const net = parseMoney(findCol(r, 'net_amount', 'owner_payout', 'you_receive', 'owner_payment'));
    return {
      confirmationCode: findCol(r, 'confirmation__', 'confirmation_code', 'reservation_id', 'booking_id'),
      checkIn: findCol(r, 'check_in', 'check_in_date', 'arrival', 'arrival_date'),
      grossAmount: gross || (net + fee),
      platformFee: fee || (gross - net > 0 ? gross - net : 0),
      netAmount: net || (gross - fee),
      guestName: findCol(r, 'guest_name', 'guest', 'traveler_name', 'renter_name'),
      raw: r,
    };
  }).filter(r => r.grossAmount > 0 || r.netAmount > 0);
}

function parseBookingCom(rows: Record<string, string>[]): ParsedRow[] {
  return rows.map(r => {
    const gross = parseMoney(findCol(r, 'gross_amount', 'room_revenue', 'total_price', 'amount', 'revenue'));
    const fee = parseMoney(findCol(r, 'commission', 'booking_com_fee', 'commission_amount', 'platform_fee'));
    const net = parseMoney(findCol(r, 'net_amount', 'net_revenue', 'payout', 'you_receive'));
    return {
      confirmationCode: findCol(r, 'reservation_number', 'reservation_id', 'booking_number', 'confirmation_number'),
      checkIn: findCol(r, 'check_in', 'check_in_date', 'arrival_date', 'arrival'),
      grossAmount: gross || (net + fee),
      platformFee: fee || (gross - net > 0 ? gross - net : 0),
      netAmount: net || (gross - fee),
      guestName: findCol(r, 'guest_name', 'booker_name', 'guest'),
      raw: r,
    };
  }).filter(r => r.grossAmount > 0 || r.netAmount > 0);
}

// Normalize date strings like "Jan 1, 2024", "01/01/2024", "2024-01-01"
function normalizeDate(s: string): string {
  if (!s) return '';
  s = s.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or DD/MM/YYYY (assume MM/DD/YYYY for US context)
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  // "Jan 1, 2024" or "January 1, 2024"
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

// ─── Matching logic ───────────────────────────────────────────────────────────

interface MatchResult {
  bookingId: string;
  confirmationCode: string;
  guestName: string;
  checkIn: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  matchedBy: 'confirmation_code' | 'check_in_date';
}

interface UnmatchedRow {
  confirmationCode: string;
  checkIn: string;
  grossAmount: number;
  reason: string;
}

function matchRows(parsed: ParsedRow[], bookings: Booking[], platform: Platform): { matched: MatchResult[]; unmatched: UnmatchedRow[] } {
  const matched: MatchResult[] = [];
  const unmatched: UnmatchedRow[] = [];

  for (const row of parsed) {
    const code = row.confirmationCode?.trim().toUpperCase();
    const checkIn = normalizeDate(row.checkIn);

    // Try confirmation code match first
    let booking: Booking | undefined;
    if (code) {
      booking = bookings.find(b =>
        b.platform === platform &&
        b.confirmationCode?.toUpperCase() === code
      );
    }

    // Fall back to check-in date match
    if (!booking && checkIn) {
      const samePlatformSameDate = bookings.filter(b => b.platform === platform && b.checkIn === checkIn);
      if (samePlatformSameDate.length === 1) booking = samePlatformSameDate[0];
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
        matchedBy: code && booking.confirmationCode ? 'confirmation_code' : 'check_in_date',
      });
    } else {
      unmatched.push({
        confirmationCode: row.confirmationCode,
        checkIn: checkIn || row.checkIn,
        grossAmount: row.grossAmount,
        reason: !booking
          ? (code ? `No booking found with code ${code}` : 'No confirmation code and no unique date match')
          : 'Unknown',
      });
    }
  }

  return { matched, unmatched };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      action: 'preview' | 'apply';
      platform: Platform;
      csvText?: string;
      matches?: MatchResult[];
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
      else parsed = parseAirbnb(rows); // generic fallback

      const { matched, unmatched } = matchRows(parsed, bookings, platform);
      return NextResponse.json({ matched, unmatched, totalRows: rows.length });
    }

    if (body.action === 'apply') {
      const { matches } = body;
      if (!matches?.length) return NextResponse.json({ error: 'matches required' }, { status: 400 });

      let updated = 0;
      for (const match of matches) {
        const idx = bookings.findIndex(b => b.id === match.bookingId);
        if (idx < 0) continue;
        bookings[idx] = {
          ...bookings[idx],
          income: match.grossAmount,
          platformFee: match.platformFee,
          updatedAt: new Date().toISOString(),
        };
        updated++;
      }
      await saveBookings(bookings);
      return NextResponse.json({ updated });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Import failed' }, { status: 500 });
  }
}
