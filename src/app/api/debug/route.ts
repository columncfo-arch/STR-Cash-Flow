import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/storage';
import ical from 'node-ical';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/calendar,*/*',
};

function isBlockedDate(summary: string): boolean {
  const s = summary.toLowerCase().trim();
  return (
    s.includes('not available') ||
    s === 'blocked' ||
    s.includes('owner block') ||
    s === 'unavailable' ||
    s === 'busy' ||
    s === 'closed'
  );
}

export async function GET() {
  const settings = await loadSettings();
  const out: Record<string, unknown> = {
    env: {
      REDIS_URL: process.env.REDIS_URL ? 'SET' : 'NOT SET',
      VERCEL: process.env.VERCEL ?? 'NOT SET',
    },
    sourceCount: settings.sources.filter(s => s.enabled).length,
    feeds: {} as Record<string, unknown>,
  };

  for (const source of settings.sources.filter(s => s.enabled)) {
    try {
      const res = await fetch(source.url, { headers: FETCH_HEADERS, redirect: 'follow' });
      if (!res.ok) {
        (out.feeds as Record<string, unknown>)[source.name] = { error: `HTTP ${res.status}` };
        continue;
      }
      const text = await res.text();
      const data = ical.parseICS(text);
      const events = Object.values(data).filter(e => e?.type === 'VEVENT');

      const kept: unknown[] = [];
      const filtered: unknown[] = [];

      for (const e of events) {
        const summary = (e.summary as string) ?? '';
        const entry = {
          summary,
          start: e.start,
          end: e.end,
        };
        if (isBlockedDate(summary)) {
          filtered.push(entry);
        } else {
          kept.push(entry);
        }
      }

      (out.feeds as Record<string, unknown>)[source.name] = {
        total: events.length,
        kept: kept.length,
        filteredOut: filtered.length,
        bookings: kept,
        blocked: filtered,
      };
    } catch (err) {
      (out.feeds as Record<string, unknown>)[source.name] = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json(out, { status: 200 });
}
