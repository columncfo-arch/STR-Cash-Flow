import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/storage';

// Simple in-memory cache: avoids hammering Airbnb/VRBO iCal endpoints
let _cached: { blocked: BlockedRange[]; expiry: number } | null = null;
const TTL = 4 * 60 * 60 * 1000; // 4 hours

export interface BlockedRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (exclusive — the checkout date)
}

function toDateStr(value: string): string {
  const digits = value.replace(/[TZ]/g, '').slice(0, 8);
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function parseICal(text: string): BlockedRange[] {
  const blocked: BlockedRange[] = [];
  const blocks = text.split('BEGIN:VEVENT');
  for (const block of blocks.slice(1)) {
    const s = block.match(/DTSTART(?:;[^:\r\n]+)?:(\d+)/);
    const e = block.match(/DTEND(?:;[^:\r\n]+)?:(\d+)/);
    if (s && e) blocked.push({ start: toDateStr(s[1]), end: toDateStr(e[1]) });
  }
  return blocked;
}

async function fetchICal(url: string): Promise<BlockedRange[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  return parseICal(await res.text());
}

export async function GET() {
  try {
    if (_cached && Date.now() < _cached.expiry) {
      return NextResponse.json({ blocked: _cached.blocked });
    }

    const settings = await loadSettings();
    const urls = [settings.airbnbIcalUrl, settings.vrboIcalUrl].filter(Boolean) as string[];

    const results = await Promise.allSettled(urls.map(fetchICal));
    const blocked = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    _cached = { blocked, expiry: Date.now() + TTL };
    return NextResponse.json({ blocked });
  } catch {
    return NextResponse.json({ blocked: [] });
  }
}

// POST to bust the cache when a direct booking is confirmed
export async function POST() {
  _cached = null;
  return NextResponse.json({ ok: true });
}
