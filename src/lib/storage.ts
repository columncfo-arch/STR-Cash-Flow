import { Booking, Settings } from '@/types';
import path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const REDIS_SETTINGS_KEY = 'str:settings';
const REDIS_BOOKINGS_KEY = 'str:bookings';

const DEFAULT_SETTINGS: Settings = {
  sources: [],
  defaultNightlyRate: 0,
  currency: 'USD',
  propertyName: 'My STR Property',
};

// ─── Redis backend (Vercel production) ────────────────────────────────────────

// Module-level singleton — reused across requests in the same serverless instance
let _redis: import('redis').RedisClientType | null = null;

async function getRedis() {
  if (_redis?.isReady) return _redis;
  const { createClient } = await import('redis');
  _redis = createClient({ url: process.env.REDIS_URL }) as import('redis').RedisClientType;
  _redis.on('error', (err) => console.error('Redis error:', err));
  await _redis.connect();
  return _redis;
}

async function redisGet<T>(key: string, fallback: T): Promise<T> {
  const client = await getRedis();
  const raw = await client.get(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
}

async function redisSet(key: string, value: unknown): Promise<void> {
  const client = await getRedis();
  await client.set(key, JSON.stringify(value));
}

// ─── File backend (local dev / Vercel without Redis) ──────────────────────────

// On Vercel, process.cwd() is read-only — use /tmp so writes don't fail.
// Settings are still read from the repo's data/ dir as a seed.
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? '/tmp/str-data' : path.join(process.cwd(), 'data');
const SEED_SETTINGS = path.join(process.cwd(), 'data', 'settings.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');

async function ensureDir() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
}

async function fileLoad<T>(file: string, fallback: T, seedFile?: string): Promise<T> {
  await ensureDir();
  try {
    return JSON.parse(await readFile(file, 'utf-8')) as T;
  } catch {
    // On Vercel first run, seed from the repo's committed settings file
    if (seedFile) {
      try { return JSON.parse(await readFile(seedFile, 'utf-8')) as T; } catch { /* ignore */ }
    }
    return fallback;
  }
}

async function fileSave(file: string, value: unknown): Promise<void> {
  await ensureDir();
  await writeFile(file, JSON.stringify(value, null, 2));
}

// ─── Public API ───────────────────────────────────────────────────────────────

const useRedis = Boolean(process.env.REDIS_URL);

export async function loadSettings(): Promise<Settings> {
  return useRedis
    ? redisGet(REDIS_SETTINGS_KEY, DEFAULT_SETTINGS)
    : fileLoad(SETTINGS_FILE, DEFAULT_SETTINGS, SEED_SETTINGS);
}

export async function saveSettings(settings: Settings): Promise<void> {
  useRedis
    ? await redisSet(REDIS_SETTINGS_KEY, settings)
    : await fileSave(SETTINGS_FILE, settings);
}

export async function loadBookings(): Promise<Booking[]> {
  return useRedis
    ? redisGet<Booking[]>(REDIS_BOOKINGS_KEY, [])
    : fileLoad<Booking[]>(BOOKINGS_FILE, []);
}

export async function saveBookings(bookings: Booking[]): Promise<void> {
  useRedis
    ? await redisSet(REDIS_BOOKINGS_KEY, bookings)
    : await fileSave(BOOKINGS_FILE, bookings);
}

export async function upsertBooking(booking: Booking): Promise<void> {
  const bookings = await loadBookings();
  const idx = bookings.findIndex(b => b.uid === booking.uid && b.sourceId === booking.sourceId);
  if (idx >= 0) {
    const existing = bookings[idx];
    bookings[idx] = {
      ...booking,
      income: existing.isManual ? existing.income : booking.income,
      isManual: existing.isManual,
      notes: existing.notes ?? booking.notes,
    };
  } else {
    bookings.push(booking);
  }
  await saveBookings(bookings);
}
