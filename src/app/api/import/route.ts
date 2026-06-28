import { NextResponse } from 'next/server';
import { loadBookings, saveBookings } from '@/lib/storage';
import { Booking, Platform } from '@/types';

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  // Strip BOM if present
  const cleaned = text.replace(/^﻿/, '').trim();
  const lines = cleaned.split(/\r?\n/);
  if (lines.length < 2) return [];

  const firstLine = lines[0];
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delim = tabs >= semis && tabs >= commas ? '\t' : semis > commas ? ';' : ',';

  function splitLine(line: string): string[] {
    if (delim === '\t') return line.split('\t').map(s => s.trim().replace(/^"|"$/g, ''));
    const fields: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === delim && !inQuote) {
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
  // Strip currency symbols, letters, whitespace — keep digits, period, comma, minus
  let v = s.replace(/[^0-9.,-]/g, '').trim();
  if (!v) return 0;
  // European format: period as thousands sep, comma as decimal (e.g. 1.234,56)
  if (/\d\.\d{3},\d{1,2}$/.test(v)) {
    v = v.replace(/\./g, '').replace(',', '.');
  } else {
    // US/standard: remove thousand commas
    v = v.replace(/,/g, '');
  }
  const n = parseFloat(v);
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
  // Airbnb fields
  paidOut?: number;
  fastPayFee?: number;
  cleaningFee?: number;
  petFee?: number;
  taxRemitted?: number;
  amount?: number;
  payoutDate?: string;
  arrivingByDate?: string;
  earningsYear?: number;
  // Shared metadata
  bookingDate?: string;
  listing?: string;
  details?: string;
  referenceCode?: string;
  currency?: string;
  status?: string;
  // Booking.com fields
  commissionPct?: number;
  paymentStatus?: string;
  paymentMethod?: string;
  bookerName?: string;
  bookerCountry?: string;
  travelPurpose?: string;
  device?: string;
  unitType?: string;
  cancellationDate?: string;
  address?: string;
  phone?: string;
  adults?: number;
  children?: number;
  childrenAges?: string;
  rooms?: number;
  people?: number;
  // VRBO fields
  propertyId?: string;
  unitId?: string;
  lodgingTaxOwnerRemits?: number;
  taxWithheld?: number;
}

function parseAirbnb(rows: Record<string, string>[]): ParsedRow[] {
  return rows
    .filter(r => col(r, 'type').toLowerCase().includes('reservation'))
    .map(r => {
      const gross = parseMoney(col(r, 'gross_earnings'));
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
        paidOut: net,
        fastPayFee: parseMoney(col(r, 'fast_pay_fee')),
        cleaningFee: parseMoney(col(r, 'cleaning_fee')),
        petFee: parseMoney(col(r, 'pet_fee')),
        taxRemitted: parseMoney(col(r, 'airbnb_remitted_tax')),
        amount: parseMoney(col(r, 'amount')),
        payoutDate: normalizeDate(col(r, 'date')),
        bookingDate: normalizeDate(col(r, 'booking_date')),
        arrivingByDate: normalizeDate(col(r, 'arriving_by_date')),
        listing: col(r, 'listing'),
        details: col(r, 'details'),
        referenceCode: col(r, 'reference_code'),
        currency: col(r, 'currency'),
        earningsYear: parseInt(col(r, 'earnings_year')) || undefined,
      };
    })
    .filter(r => r.grossAmount > 0 && r.checkIn);
}

function parseVRBO(rows: Record<string, string>[]): ParsedRow[] {
  // VRBO financial report columns (normalized):
  // property_id, unit_id, address, reservation_id,
  // traveler_first_name, traveler_last_name, booking_status,
  // check_in, check_out, nights, payout_date,
  // gross_booking_amount, deductions, payout,
  // lodging_tax_owner_remits, tax_withheld, payout_currency
  return rows
    .filter(r => !col(r, 'booking_status').toLowerCase().includes('cancel'))
    .map(r => {
      const gross = parseMoney(col(r, 'gross_booking_amount'));
      const deductions = parseMoney(col(r, 'deductions'));
      const payout = parseMoney(col(r, 'payout'));
      const nights = parseInt(col(r, 'nights')) || 0;
      const firstName = col(r, 'traveler_first_name');
      const lastName = col(r, 'traveler_last_name');
      return {
        confirmationCode: col(r, 'reservation_id'),
        checkIn: normalizeDate(col(r, 'check_in')),
        checkOut: normalizeDate(col(r, 'check_out')),
        nights,
        guestName: [firstName, lastName].filter(Boolean).join(' ') || '',
        grossAmount: gross,
        platformFee: deductions,
        netAmount: payout || (gross - deductions),
        paidOut: payout,
        payoutDate: normalizeDate(col(r, 'payout_date')),
        currency: col(r, 'payout_currency') || undefined,
        address: col(r, 'address') || undefined,
        propertyId: col(r, 'property_id') || undefined,
        unitId: col(r, 'unit_id') || undefined,
        status: col(r, 'booking_status') || undefined,
        lodgingTaxOwnerRemits: parseMoney(col(r, 'lodging_tax_owner_remits')) || undefined,
        taxWithheld: parseMoney(col(r, 'tax_withheld')) || undefined,
      };
    })
    .filter(r => r.grossAmount > 0 && r.checkIn);
}

function parseBookingCom(rows: Record<string, string>[]): ParsedRow[] {
  // Booking.com columns (normalized):
  // book_number, booked_by, guest_name_s, check_in, check_out, booked_on,
  // status, rooms, people, adults, children, children_s_age_s, price,
  // commission, commission_amount, payment_status, payment_method_payment_provider,
  // remarks, booker_country, travel_purpose, device, unit_type,
  // duration_nights, cancellation_date, address, phone_number
  return rows
    .filter(r => !col(r, 'status').toLowerCase().includes('cancel'))
    .map(r => {
      const gross = parseMoney(col(r, 'price'));
      const fee = parseMoney(col(r, 'commission_amount'));
      const commissionPct = parseFloat(col(r, 'commission')) || undefined;
      const nights = parseInt(col(r, 'duration_nights', 'nights')) || 0;
      return {
        confirmationCode: col(r, 'book_number'),
        checkIn: normalizeDate(col(r, 'check_in')),
        checkOut: normalizeDate(col(r, 'check_out')),
        nights,
        guestName: col(r, 'guest_name_s', 'guest_name'),
        grossAmount: gross,
        platformFee: fee,
        netAmount: gross - fee,
        bookingDate: normalizeDate(col(r, 'booked_on')),
        status: col(r, 'status'),
        commissionPct,
        paymentStatus: col(r, 'payment_status') || undefined,
        paymentMethod: col(r, 'payment_method_payment_provider') || undefined,
        bookerName: col(r, 'booked_by') || undefined,
        bookerCountry: col(r, 'booker_country') || undefined,
        travelPurpose: col(r, 'travel_purpose') || undefined,
        device: col(r, 'device') || undefined,
        unitType: col(r, 'unit_type') || undefined,
        cancellationDate: normalizeDate(col(r, 'cancellation_date')) || undefined,
        address: col(r, 'address') || undefined,
        phone: col(r, 'phone_number') || undefined,
        adults: parseInt(col(r, 'adults')) || undefined,
        children: parseInt(col(r, 'children')) || undefined,
        childrenAges: col(r, 'children_s_age_s') || undefined,
        rooms: parseInt(col(r, 'rooms')) || undefined,
        people: parseInt(col(r, 'people')) || undefined,
        referenceCode: col(r, 'book_number') || undefined,
        details: col(r, 'remarks') || undefined,
      };
    })
    .filter(r => r.grossAmount > 0 && r.checkIn);
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

      const debugHeaders = rawRows[0] ? Object.keys(rawRows[0]) : [];
      const debugFirstRow = rawRows[0] ?? {};
      return NextResponse.json({ rows, totalRows: rawRows.length, debugHeaders, debugFirstRow });
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

        const sharedFields = {
          checkIn: row.checkIn,
          checkOut: row.checkOut || '',
          nights,
          guestName: row.guestName || undefined,
          income: row.grossAmount,
          platformFee: row.platformFee || undefined,
          paidOut: row.paidOut || undefined,
          fastPayFee: row.fastPayFee || undefined,
          cleaningFee: row.cleaningFee || undefined,
          petFee: row.petFee || undefined,
          taxRemitted: row.taxRemitted || undefined,
          amount: row.amount || undefined,
          payoutDate: row.payoutDate || undefined,
          bookingDate: row.bookingDate || undefined,
          arrivingByDate: row.arrivingByDate || undefined,
          listing: row.listing || undefined,
          details: row.details || undefined,
          referenceCode: row.referenceCode || undefined,
          currency: row.currency || undefined,
          earningsYear: row.earningsYear || undefined,
          status: row.status || undefined,
          commissionPct: row.commissionPct || undefined,
          paymentStatus: row.paymentStatus || undefined,
          paymentMethod: row.paymentMethod || undefined,
          bookerName: row.bookerName || undefined,
          bookerCountry: row.bookerCountry || undefined,
          travelPurpose: row.travelPurpose || undefined,
          device: row.device || undefined,
          unitType: row.unitType || undefined,
          cancellationDate: row.cancellationDate || undefined,
          address: row.address || undefined,
          phone: row.phone || undefined,
          adults: row.adults || undefined,
          children: row.children || undefined,
          childrenAges: row.childrenAges || undefined,
          rooms: row.rooms || undefined,
          people: row.people || undefined,
          propertyId: row.propertyId || undefined,
          unitId: row.unitId || undefined,
          lodgingTaxOwnerRemits: row.lodgingTaxOwnerRemits || undefined,
          taxWithheld: row.taxWithheld || undefined,
          updatedAt: now,
        };

        if (existingIdx >= 0) {
          existing[existingIdx] = { ...existing[existingIdx], ...sharedFields };
          updated++;
        } else {
          const id = `csv-${platform}-${row.confirmationCode || row.checkIn}-${Math.random().toString(36).slice(2, 7)}`;
          existing.push({
            id,
            sourceId: `csv-${platform}`,
            platform,
            uid: row.confirmationCode || id,
            summary: row.guestName ? `${platform} - ${row.guestName}` : platform,
            confirmationCode: row.confirmationCode || undefined,
            isManual: false,
            createdAt: now,
            ...sharedFields,
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
