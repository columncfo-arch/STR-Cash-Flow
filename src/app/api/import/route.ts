import { NextResponse } from 'next/server';
import { loadBookings, replaceAllBookings } from '@/lib/storage';
import { Booking, Platform } from '@/types';
import * as XLSX from 'xlsx';

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
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // M/D/YYYY or MM/DD/YYYY
  const slash4 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash4) return `${slash4[3]}-${slash4[1].padStart(2, '0')}-${slash4[2].padStart(2, '0')}`;
  // M/D/YY — VRBO exports 2-digit year, e.g. "5/16/25"
  const slash2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (slash2) {
    const yr = parseInt(slash2[3]);
    const fullYear = yr <= 49 ? 2000 + yr : 1900 + yr;
    return `${fullYear}-${slash2[1].padStart(2, '0')}-${slash2[2].padStart(2, '0')}`;
  }
  // YYYY-MM-DDThh:mm:ss… — ISO with time component
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
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
    .filter(r => !!r.checkIn);
}

function parseVRBO(rows: Record<string, string>[]): ParsedRow[] {
  return rows
    .filter(r => {
      const s = col(r, 'booking_status', 'status', 'reservation_status', 'stay_status').toLowerCase();
      // Only exclude explicitly cancelled rows; empty/unknown status is included
      return s === '' || !s.includes('cancel');
    })
    .map(r => {
      const gross = parseMoney(col(r,
        'gross_booking_amount', 'gross_booking_value', 'gross_amount',
        'total_amount', 'booking_amount', 'owner_payout', 'total',
        'gross_revenue', 'rental_amount', 'guest_total'
      ));
      const deductions = parseMoney(col(r,
        'deductions', 'vrbo_fee', 'service_fee', 'platform_fee',
        'host_service_fee', 'fees', 'commission_amount', 'commission'
      ));
      const payout = parseMoney(col(r,
        'payout', 'owner_payout', 'net_payout', 'net_amount',
        'amount_paid', 'payment_amount', 'total_payout'
      ));
      const nights = parseInt(col(r,
        'nights', 'duration', 'length_of_stay', 'stay_duration', 'number_of_nights'
      )) || 0;
      const firstName = col(r, 'traveler_first_name', 'guest_first_name', 'first_name');
      const lastName = col(r, 'traveler_last_name', 'guest_last_name', 'last_name');
      const fullName = col(r, 'traveler_name', 'guest_name', 'guest');
      const checkIn = normalizeDate(col(r,
        'check_in', 'check_in_date', 'checkin', 'checkin_date',
        'arrival_date', 'arrival', 'start_date'
      ));
      const checkOut = normalizeDate(col(r,
        'check_out', 'check_out_date', 'checkout', 'checkout_date',
        'departure_date', 'departure', 'end_date'
      ));
      return {
        confirmationCode: col(r,
          'reservation_id', 'confirmation_code', 'booking_id',
          'reference_number', 'ref_number', 'id'
        ),
        checkIn,
        checkOut,
        nights,
        guestName: fullName || [firstName, lastName].filter(Boolean).join(' ') || '',
        grossAmount: gross,
        platformFee: deductions,
        netAmount: payout || (gross - deductions),
        paidOut: payout || undefined,
        payoutDate: normalizeDate(col(r, 'payout_date', 'payment_date', 'paid_date')),
        currency: col(r, 'payout_currency', 'currency') || undefined,
        address: col(r, 'address', 'property_address') || undefined,
        propertyId: col(r, 'property_id', 'listing_id') || undefined,
        unitId: col(r, 'unit_id') || undefined,
        status: col(r, 'booking_status', 'status', 'reservation_status') || undefined,
        lodgingTaxOwnerRemits: parseMoney(col(r, 'lodging_tax_owner_remits', 'lodging_tax', 'tax_owner_remits')) || undefined,
        taxWithheld: parseMoney(col(r, 'tax_withheld', 'taxes_withheld', 'withheld_tax')) || undefined,
      };
    })
    .filter(r => !!r.checkIn);
}

function parseBookingCom(rows: Record<string, string>[]): ParsedRow[] {
  return rows
    .filter(r => {
      const s = col(r, 'status', 'reservation_status', 'booking_status').toLowerCase();
      return s === '' || !s.includes('cancel');
    })
    .map(r => {
      const gross = parseMoney(col(r,
        'price', 'total_price', 'room_revenue', 'gross_revenue',
        'total_revenue', 'total_amount', 'amount', 'revenue',
        'gross_booking_value', 'booking_value', 'nightly_rate_total',
        'accommodation_price', 'total'
      ));
      const fee = parseMoney(col(r,
        'commission_amount', 'commission', 'booking_com_commission',
        'platform_fee', 'service_fee'
      ));
      const commissionPct = parseFloat(col(r, 'commission_', 'commission_percent', 'commission_rate')) || undefined;
      const nights = parseInt(col(r,
        'duration_nights', 'nights', 'number_of_nights', 'stay_duration', 'length_of_stay'
      )) || 0;
      const confirmationCode = col(r,
        'book_number', 'booking_number', 'reservation_number', 'reservation_id',
        'confirmation_code', 'booking_id', 'reference_number', 'id'
      );
      const checkIn = normalizeDate(col(r,
        'check_in', 'check_in_date', 'arrival_date', 'arrival', 'start_date', 'checkin'
      ));
      const checkOut = normalizeDate(col(r,
        'check_out', 'check_out_date', 'departure_date', 'departure', 'end_date', 'checkout'
      ));
      return {
        confirmationCode,
        checkIn,
        checkOut,
        nights,
        guestName: col(r,
          'guest_name_s', 'guest_name', 'guest', 'booker_name',
          'booked_by', 'traveler_name', 'customer_name', 'name'
        ),
        grossAmount: gross,
        platformFee: fee,
        netAmount: gross - fee,
        bookingDate: normalizeDate(col(r, 'booked_on', 'booking_date', 'created_date', 'date')),
        status: col(r, 'status', 'reservation_status', 'booking_status'),
        commissionPct,
        paymentStatus: col(r, 'payment_status') || undefined,
        paymentMethod: col(r, 'payment_method_payment_provider', 'payment_method') || undefined,
        bookerName: col(r, 'booked_by', 'booker_name') || undefined,
        bookerCountry: col(r, 'booker_country', 'guest_country', 'country') || undefined,
        travelPurpose: col(r, 'travel_purpose') || undefined,
        device: col(r, 'device') || undefined,
        unitType: col(r, 'unit_type', 'room_type', 'property_type') || undefined,
        cancellationDate: normalizeDate(col(r, 'cancellation_date')) || undefined,
        address: col(r, 'address') || undefined,
        phone: col(r, 'phone_number', 'phone', 'contact_number') || undefined,
        adults: parseInt(col(r, 'adults', 'adult_count', 'num_adults')) || undefined,
        children: parseInt(col(r, 'children', 'child_count', 'num_children')) || undefined,
        childrenAges: col(r, 'children_s_age_s', 'children_ages', 'child_ages') || undefined,
        rooms: parseInt(col(r, 'rooms', 'room_count', 'num_rooms')) || undefined,
        people: parseInt(col(r, 'people', 'guests', 'num_guests', 'total_guests')) || undefined,
        referenceCode: confirmationCode || undefined,
        details: col(r, 'remarks', 'notes', 'special_requests') || undefined,
        // Taxes Booking.com does NOT withhold — owner must remit directly
        lodgingTaxOwnerRemits: parseMoney(col(r,
          'tax', 'taxes', 'vat', 'local_tax', 'city_tax', 'occupancy_tax',
          'tourist_tax', 'lodging_tax', 'tax_amount', 'sales_tax'
        )) || undefined,
      };
    })
    .filter(r => !!r.checkIn);
}

// ─── Route ────────────────────────────────────────────────────────────────────

// Normalise a raw header cell value into a safe column key.
function toKey(h: string, idx: number, seen: Map<string, number>): string {
  let key = h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!key) key = `col${idx}`;
  const n = seen.get(key) ?? 0;
  seen.set(key, n + 1);
  return n === 0 ? key : `${key}_${n}`;
}

// DOM-free HTML <table> parser — handles Booking.com's HTML-as-.xls export.
function parseHTMLTable(html: string): Record<string, string>[] | null {
  if (!/<table/i.test(html)) return null;

  const allRows: string[][] = [];
  const rowRe = /<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/gi;
  const cellRe = /<t[dh](?:\s[^>]*)?>[\s\S]*?<\/t[dh]>/gi;
  const tagRe  = /<[^>]+>/g;

  let rowM: RegExpExecArray | null;
  while ((rowM = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    cellRe.lastIndex = 0;
    let cellM: RegExpExecArray | null;
    while ((cellM = cellRe.exec(rowM[0])) !== null) {
      const txt = cellM[0]
        .replace(tagRe, '')
        .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&nbsp;/gi, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .trim();
      cells.push(txt);
    }
    if (cells.length > 0) allRows.push(cells);
  }

  if (allRows.length < 2) return null;

  let headerIdx = 0;
  let bestHScore = -1;
  for (let i = 0; i < Math.min(allRows.length, 15); i++) {
    const s = headerScore(allRows[i]);
    if (s > bestHScore) { bestHScore = s; headerIdx = i; }
  }

  const seen = new Map<string, number>();
  const headers = allRows[headerIdx].map((h, i) => toKey(h, i, seen));

  return allRows.slice(headerIdx + 1)
    .filter(row => row.some(c => c !== ''))
    .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));
}

// Score a candidate header row — higher = more likely to be real column labels.
// Font names ("Arial", "Tahoma") score low; multi-word or punctuated labels score high.
function headerScore(row: unknown[]): number {
  const cells = row.map(c => String(c ?? '').trim()).filter(c => c !== '');
  if (cells.length < 3) return -1;
  const quality = cells.filter(c =>
    c.includes(' ') || c.includes('_') || c.includes('-') || c.length > 8 || /[()#%/]/.test(c)
  ).length;
  return quality * 3 + cells.length;
}

// Extract normalized rows from an xlsx workbook.
function wbToRows(wb: XLSX.WorkBook): Record<string, string>[] {
  if (!wb.SheetNames.length) return [];
  let bestSheet = wb.Sheets[wb.SheetNames[0]];
  let bestRows = 0;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const ref = ws['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const rowCount = range.e.r - range.s.r + 1;
    if (rowCount > bestRows) { bestRows = rowCount; bestSheet = ws; }
  }
  const raw = XLSX.utils.sheet_to_json<unknown[]>(bestSheet, { header: 1, raw: false, defval: '' });
  if (raw.length === 0) return [];
  // Pick the header row by quality score — not just the first row with ≥4 cells.
  // This handles files where CSS font names or title rows appear above the real headers.
  let headerRowIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(raw.length, 15); i++) {
    const s = headerScore(raw[i]);
    if (s > bestScore) { bestScore = s; headerRowIdx = i; }
  }
  const seen = new Map<string, number>();
  const headers = raw[headerRowIdx].map((h, i) => toKey(String(h ?? ''), i, seen));
  return raw.slice(headerRowIdx + 1)
    .filter(row => row.some(c => String(c ?? '').trim() !== ''))
    .map(row => Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? '').trim()])));
}

// Count the max columns in the first few rows — used to detect garbage parses.
function maxCols(rows: Record<string, string>[]): number {
  return rows.slice(0, 5).reduce((m, r) => Math.max(m, Object.keys(r).length), 0);
}

// Excel/XLS file → normalized row objects.  Returns [rows, detectedFormat].
// Booking.com exports a plain TSV named .xls. XLSX.read(buffer) silently "parses"
// it as BIFF and returns garbage. Detect the true format from content first.
async function parseExcelToRows(file: File): Promise<[Record<string, string>[], string]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const magic = buf.subarray(0, 8);
  const hexMagic = Array.from(magic).map(b => b.toString(16).padStart(2, '0')).join(' ');

  // Detect text encoding from BOM
  let encoding = 'utf-8';
  if (magic[0] === 0xFF && magic[1] === 0xFE) encoding = 'utf-16le';
  else if (magic[0] === 0xFE && magic[1] === 0xFF) encoding = 'utf-16be';

  const text = new TextDecoder(encoding, { fatal: false }).decode(buf);
  const firstLine = text.slice(0, 4000).split('\n')[0] ?? '';

  // TSV fast-path: many tabs + no binary control chars = plain text TSV
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const hasBinaryChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(firstLine.slice(0, 500));
  if (tabCount >= 5 && !hasBinaryChars) {
    const rows = parseCSV(text);
    if (maxCols(rows) >= 3) return [rows, `tsv(${hexMagic})`];
  }

  // HTML/XML detection: skip binary XLSX parser for text files
  const isHtmlOrXml = /^\s*(<\?xml|<!doctype|<html)/i.test(text.slice(0, 512)) ||
                      /[\s\S]{0,500}<table[\s>]/i.test(text.slice(0, 512));

  if (!isHtmlOrXml) {
    // 1. Try xlsx binary parser (handles real BIFF2-8 and OOXML)
    try {
      const wb = XLSX.read(buf, { type: 'buffer' });
      const rows = wbToRows(wb);
      if (rows.length > 0 && maxCols(rows) >= 3) {
        const label = magic[0] === 0xD0 && magic[1] === 0xCF ? 'ole2' :
                      magic[0] === 0x50 && magic[1] === 0x4B ? 'ooxml' : 'binary';
        return [rows, `${label}(${hexMagic})`];
      }
    } catch { /* fall through */ }
  }

  // 2. xlsx string parser — handles SpreadsheetML / Office HTML with XML namespaces
  try {
    const wb2 = XLSX.read(text, { type: 'string' });
    const rows2 = wbToRows(wb2);
    if (rows2.length > 0 && maxCols(rows2) >= 3) return [rows2, `xlml(${hexMagic})`];
  } catch { /* fall through */ }

  // 3. Regex HTML table parser — extracts <td>/<th> text directly, ignoring CSS
  try {
    const rows3 = parseHTMLTable(text);
    if (rows3 && rows3.length > 0 && maxCols(rows3) >= 3) return [rows3, `html(${hexMagic})`];
  } catch { /* fall through */ }

  // 4. Last resort: plain CSV/TSV
  return [parseCSV(text), `csv(${hexMagic})`];
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') ?? '';

    // ── Preview: accepts multipart/form-data with the raw file ──
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const platform = formData.get('platform') as Platform;
      const file = formData.get('file') as File | null;
      if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });

      const isExcel = /\.(xlsx|xls|xlsm)$/i.test(file.name);
      let rawRows: Record<string, string>[];
      let debugFormat = 'csv';
      if (isExcel) {
        [rawRows, debugFormat] = await parseExcelToRows(file);
      } else {
        rawRows = parseCSV(await file.text());
      }

      let rows: ParsedRow[];
      if (platform === 'airbnb') rows = parseAirbnb(rawRows);
      else if (platform === 'vrbo') rows = parseVRBO(rawRows);
      else if (platform === 'booking') rows = parseBookingCom(rawRows);
      else rows = parseAirbnb(rawRows);

      const debugHeaders = rawRows[0] ? Object.keys(rawRows[0]) : [];
      const rawSample = rawRows.slice(0, 3);

      return NextResponse.json({ rows, totalRows: rawRows.length, debugHeaders, rawSample, debugFormat });
    }

    // ── Apply (and legacy preview): JSON body ──
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

      await replaceAllBookings(existing);
      return NextResponse.json({ created, updated });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Import failed' }, { status: 500 });
  }
}
