import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/storage';
import ical from 'node-ical';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/calendar,*/*',
};

function debugExtractIncome(event: Record<string, unknown>): { found: boolean; amount: number; source: string } {
  const xPriceKeys = [
    'x-total-price', 'x-price', 'x-amount', 'x-booking-total',
    'x-vrbo-total', 'x-airbnb-total', 'x-payout', 'x-revenue',
    'x-host-payout', 'x-earnings',
  ];
  for (const key of xPriceKeys) {
    const val = event[key] ?? event[key.toUpperCase()];
    if (val) {
      const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
      if (n > 0) return { found: true, amount: n, source: `X-property: ${key}` };
    }
  }

  for (const [k, v] of Object.entries(event)) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const text = String(v ?? '');
    if (!text) continue;
    const dollarPatterns = [
      /(?:total|payout|earnings?|price|amount|revenue)[^\d]*\$?([\d,]+(?:\.\d{1,2})?)/gi,
      /\$\s*([\d,]+(?:\.\d{1,2})?)/g,
      /(?:USD|EUR|GBP|CAD|AUD)\s*([\d,]+(?:\.\d{1,2})?)/gi,
    ];
    for (const re of dollarPatterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const n = parseFloat(m[1].replace(/,/g, ''));
        if (n >= 10) return { found: true, amount: n, source: `field: ${k}, match: "${m[0]}"` };
      }
    }
  }

  const description = String(event.description ?? '');
  if (description) {
    const lines = description.split(/[\r\n\\n]+/);
    for (const line of lines) {
      const m = line.match(/(?:total|payout|earning|price|amount)[^\d]*\$?([\d,]+(?:\.\d{1,2})?)/i);
      if (m) {
        const n = parseFloat(m[1].replace(/,/g, ''));
        if (n >= 10) return { found: true, amount: n, source: `description line: "${line.trim()}"` };
      }
    }
  }

  return { found: false, amount: 0, source: 'none' };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('raw') === '1'; // ?raw=1 dumps the full ICS text

  const settings = await loadSettings();
  const out: Record<string, unknown> = { feeds: {} };

  for (const source of settings.sources.filter(s => s.enabled)) {
    try {
      const res = await fetch(source.url, { headers: FETCH_HEADERS, redirect: 'follow' });
      if (!res.ok) {
        (out.feeds as Record<string, unknown>)[source.name] = { error: `HTTP ${res.status}` };
        continue;
      }
      const text = await res.text();

      if (raw) {
        (out.feeds as Record<string, unknown>)[source.name] = { rawICS: text };
        continue;
      }

      const data = ical.parseICS(text);
      const events = Object.values(data).filter(e => e?.type === 'VEVENT');

      (out.feeds as Record<string, unknown>)[source.name] = {
        totalEvents: events.length,
        events: events.map(e => {
          const fields: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(e)) {
            if (k === 'type') continue;
            fields[k] = v instanceof Date ? v.toISOString() : v;
          }
          const incomeDebug = debugExtractIncome(fields as Record<string, unknown>);
          return { ...fields, _incomeExtracted: incomeDebug };
        }),
      };
    } catch (err) {
      (out.feeds as Record<string, unknown>)[source.name] = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json(out);
}
