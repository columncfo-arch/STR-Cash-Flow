import { Booking, Settings } from '@/types';
import path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const KV_SETTINGS_KEY = 'str:settings';
const KV_BOOKINGS_KEY = 'str:bookings';

const DEFAULT_SETTINGS: Settings = {
  sources: [],
  defaultNightlyRate: 0,
  currency: 'USD',
  propertyName: 'My STR Property',
};

// ─── KV backend (Vercel production) ───────────────────────────────────────────

async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const { kv } = await import('@vercel/kv');
  const data = await kv.get<T>(key);
  return data ?? fallback;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const { kv } = await import('@vercel/kv');
  await kv.set(key, value);
}

// ─── File backend (local dev) ─────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');

async function ensureDir() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
}

async function fileLoad<T>(file: string, fallback: T): Promise<T> {
  await ensureDir();
  try {
    return JSON.parse(await readFile(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

async function fileSave(file: string, value: unknown): Promise<void> {
  await ensureDir();
  await writeFile(file, JSON.stringify(value, null, 2));
}

// ─── Public API (auto-selects backend) ────────────────────────────────────────

const useKV = Boolean(process.env.KV_REST_API_URL);

export async function loadSettings(): Promise<Settings> {
  return useKV
    ? kvGet(KV_SETTINGS_KEY, DEFAULT_SETTINGS)
    : fileLoad(SETTINGS_FILE, DEFAULT_SETTINGS);
}

export async function saveSettings(settings: Settings): Promise<void> {
  useKV ? await kvSet(KV_SETTINGS_KEY, settings) : await fileSave(SETTINGS_FILE, settings);
}

export async function loadBookings(): Promise<Booking[]> {
  return useKV
    ? kvGet<Booking[]>(KV_BOOKINGS_KEY, [])
    : fileLoad<Booking[]>(BOOKINGS_FILE, []);
}

export async function saveBookings(bookings: Booking[]): Promise<void> {
  useKV ? await kvSet(KV_BOOKINGS_KEY, bookings) : await fileSave(BOOKINGS_FILE, bookings);
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
