import { NextResponse } from 'next/server';
import { loadBookings, saveBookings } from '@/lib/storage';
import { Booking, Platform } from '@/types';

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const firstLine = lines[0];
  const useTab = (firstLine.match(/\t/g) ?? []).length > (firstLine.match(/,/g) ?? []).length;

  function splitLine(line: string): string[] {
    if (useTab) return line.split('\t').map(s => s.trim().replace(/^"|"$/g, ''));
    const fields: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = splitLine(lines[0]).map(h =>
    h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  );

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = splitLine(line);
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
    const gross = parseMoney(col(r, 'gross_earnings', 'gross_amount', 'rental_amount', 'total_amount'));
    const fee = parseMoney(col(r, 'service_fee', 'vrbo_fee', 'commission', 'host_fee'));
    const net = parseMoney(col(r, 'net_amount', 'owner_payout', 'paid_out'));
    const nights = parseInt(col(r, 'nights')) || 0;
    return {
      confirmationCode: col(r, 'confirmation_code', 'confirmation__', 'reservation_id'),
      checkIn: normalizeDate(col(r, 'check_in', 'start_date', 'arrival')),
      checkOut: normalizeDate(col(r, 'check_out', 'end_date', 'departure')),
      nights,
      guestName: col(r, 'guest_name', 'guest', 'traveler_name'),
      grossAmount: gross || (net + fee),
      platformFee: fee || Math.max(gross - net, 0),
      netAmount: net || (gross - fee),
    };
  }).filter(r => r.grossAmount > 0 && r.checkIn);
}

function parseBookingCom(rows: Record<string, string>[]): ParsedRow[] {
  return rows.map(r => {
    const gross = parseMoney(col(r, 'gross_amount', 'room_revenue', 'total_price', 'amount'));
    const fee = parseMoney(col(r, 'commission', 'commission_amount', 'platform_fee'));
    const net = parseMoney(col(r, 'net_amount', 'net_revenue', 'payout', 'paid_out'));
    const nights = parseInt(col(r, 'nights', 'room_nights')) || 0;
    return {
      confirmationCode: col(r, 'reservation_number', 'reservation_id', 'booking_number', 'confirmation_code'),
      checkIn: normalizeDate(col(r, 'check_in', 'check_in_date', 'arrival_date')),
      checkOut: normalizeDate(col(r, 'check_out', 'check_out_date', 'departure_date')),
      nights,
      guestName: col(r, 'guest_name', 'booker_name', 'guest'),
      grossAmount: gross || (net + fee),
      platformFee: fee || Math.max(gross - net, 0),
      netAmount: net || (gross - fee),
    };
  }).filter(r => r.grossAmount > 0 && r.checkIn);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      action: 'preview' | 'apply';
      platform: Platform;
      csvText?: string;
      rows?: ParsedRow[];
    };

    if (body.action === 'preview') {
      const { platform, csvText } = body;
      if (!csvText) return NextResponse.json({ error: 'csvText required' }, { status: 400 });

      const rawRows = parseCSV(csvText);
      let rows: ParsedRow[];
      if (platform === 'airbnb') rows = parseAirbnb(rawRows);
      else if (platform === 'vrbo') rows = parseVRBO(rawRows);
      else if (platform === 'booking') rows = parseBookingCom(rawRows);
      else rows = parseAirbnb(rawRows);

      return NextResponse.json({ rows, totalRows: rawRows.length });
    }

    if (body.action === 'apply') {
      const { platform, rows = [] } = body;
      if (!rows.length) return NextResponse.json({ error: 'No rows to import' }, { status: 400 });

      const existing = await loadBookings();
      const now = new Date().toISOString();
      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const nights = row.nights ||
          (row.checkOut
            ? Math.max(Math.round((new Date(row.checkOut).getTime() - new Date(row.checkIn).getTime()) / 86400000), 1)
            : 1);

        // Replace any existing booking with same confirmation code on same platform
        const existingIdx = row.confirmationCode
          ? existing.findIndex(b =>
              b.platform === platform &&
              (b.confirmationCode === row.confirmationCode || b.uid === row.confirmationCode)
            )
          : -1;

        if (existingIdx >= 0) {
          existing[existingIdx] = {
            ...existing[existingIdx],
            checkIn: row.checkIn,
            checkOut: row.checkOut || existing[existingIdx].checkOut,
            nights,
            guestName: row.guestName || existing[existingIdx].guestName,
            income: row.grossAmount,
            platformFee: row.platformFee,
            updatedAt: now,
          };
          updated++;
        } else {
          const id = `csv-${platform}-${row.confirmationCode || row.checkIn}-${Math.random().toString(36).slice(2, 7)}`;
          existing.push({
            id,
            sourceId: `csv-${platform}`,
            platform,
            uid: row.confirmationCode || id,
            summary: row.guestName ? `${platform} - ${row.guestName}` : platform,
            checkIn: row.checkIn,
            checkOut: row.checkOut || '',
            nights,
            guestName: row.guestName || undefined,
            confirmationCode: row.confirmationCode || undefined,
            income: row.grossAmount,
            platformFee: row.platformFee,
            isManual: false,
            createdAt: now,
            updatedAt: now,
          } as Booking);
          created++;
        }
      }

      await saveBookings(existing);
      return NextResponse.json({ created, updated });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Import failed' }, { status: 500 });
  }
}
