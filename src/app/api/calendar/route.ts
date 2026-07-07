import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/storage';

// Simple in-memory cache per userId
const _cache = new Map<string, { blocked: BlockedRange[]; expiry: number }>();
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

function resolveUserId(req: Request): string | null {
  const { searchParams } = new URL(req.url);
  return searchParams.get('u') ?? process.env.DEFAULT_HOST_USER_ID ?? null;
}

export async function GET(req: Request) {
  try {
    const userId = resolveUserId(req);
    if (!userId) return NextResponse.json({ blocked: [] });

    const cached = _cache.get(userId);
    if (cached && Date.now() < cached.expiry) {
      return NextResponse.json({ blocked: cached.blocked });
    }

    const settings = await loadSettings(userId);
    const urls = [settings.airbnbIcalUrl, settings.vrboIcalUrl].filter(Boolean) as string[];

    const results = await Promise.allSettled(urls.map(fetchICal));
    const blocked = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    _cache.set(userId, { blocked, expiry: Date.now() + TTL });
    return NextResponse.json({ blocked });
  } catch {
    return NextResponse.json({ blocked: [] });
  }
}

// POST to bust the cache when a direct booking is confirmed
export async function POST(req: Request) {
  const userId = resolveUserId(req);
  if (userId) _cache.delete(userId);
  return NextResponse.json({ ok: true });
}
