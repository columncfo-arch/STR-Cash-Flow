import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/storage';
import ical from 'node-ical';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/calendar,*/*',
};

export async function GET() {
  const settings = await loadSettings();
  const results: Record<string, unknown> = {
    env: {
      REDIS_URL: process.env.REDIS_URL ? 'SET' : 'NOT SET',
      VERCEL: process.env.VERCEL ?? 'NOT SET',
    },
    sources: settings.sources.map(s => ({ name: s.name, enabled: s.enabled, url: s.url.slice(0, 60) + '…' })),
    feeds: {} as Record<string, unknown>,
  };

  for (const source of settings.sources.filter(s => s.enabled)) {
    try {
      const res = await fetch(source.url, { headers: FETCH_HEADERS, redirect: 'follow' });
      if (!res.ok) {
        (results.feeds as Record<string, unknown>)[source.name] = { error: `HTTP ${res.status}` };
        continue;
      }
      const text = await res.text();
      const data = ical.parseICS(text);
      const events = Object.values(data).filter(e => e?.type === 'VEVENT');
      (results.feeds as Record<string, unknown>)[source.name] = {
        totalEvents: events.length,
        sample: events.slice(0, 3).map(e => ({
          summary: e.summary,
          start: e.start,
          end: e.end,
          uid: (e.uid as string)?.slice(0, 40),
        })),
      };
    } catch (err) {
      (results.feeds as Record<string, unknown>)[source.name] = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json(results, { status: 200 });
}
