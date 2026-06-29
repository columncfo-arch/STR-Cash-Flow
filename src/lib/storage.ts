import { Booking, Expense, Settings } from '@/types';
import path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const REDIS_SETTINGS_KEY = 'str:settings';
const REDIS_BOOKINGS_KEY = 'str:bookings';
const REDIS_EXPENSES_KEY = 'str:expenses';

const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  propertyName: 'My STR Property',
  monthlyPITI: 0,
  cleaningFeePerBooking: 0,
  forecastGrowthPct: 0,
};

// ─── Redis backend ─────────────────────────────────────────────────────────────

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

// ─── File backend (local dev) ──────────────────────────────────────────────────

const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? '/tmp/str-data' : path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const EXPENSES_FILE = path.join(DATA_DIR, 'expenses.json');

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

// ─── Public API ───────────────────────────────────────────────────────────────

const useRedis = Boolean(process.env.REDIS_URL);

export async function loadSettings(): Promise<Settings> {
  const raw = useRedis
    ? await redisGet<Partial<Settings> | null>(REDIS_SETTINGS_KEY, null)
    : await fileLoad<Partial<Settings>>(SETTINGS_FILE, {});
  return { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
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
  const idx = bookings.findIndex(b =>
    (b.uid === booking.uid && b.sourceId === booking.sourceId) ||
    (booking.confirmationCode && b.confirmationCode === booking.confirmationCode && b.platform === booking.platform)
  );
  if (idx >= 0) {
    const existing = bookings[idx];
    bookings[idx] = {
      ...booking,
      income: existing.income > 0 ? existing.income : booking.income,
      platformFee: existing.platformFee ?? booking.platformFee,
      isManual: existing.isManual,
      notes: existing.notes ?? booking.notes,
    };
  } else {
    bookings.push(booking);
  }
  await saveBookings(bookings);
}

export async function loadExpenses(): Promise<Expense[]> {
  return useRedis
    ? redisGet<Expense[]>(REDIS_EXPENSES_KEY, [])
    : fileLoad<Expense[]>(EXPENSES_FILE, []);
}

export async function saveExpenses(expenses: Expense[]): Promise<void> {
  useRedis
    ? await redisSet(REDIS_EXPENSES_KEY, expenses)
    : await fileSave(EXPENSES_FILE, expenses);
}

export async function upsertExpense(expense: Expense): Promise<void> {
  const expenses = await loadExpenses();
  const idx = expenses.findIndex(e => e.id === expense.id);
  if (idx >= 0) {
    expenses[idx] = { ...expense, updatedAt: new Date().toISOString() };
  } else {
    expenses.push(expense);
  }
  await saveExpenses(expenses);
}

export async function deleteExpense(id: string): Promise<void> {
  const expenses = await loadExpenses();
  await saveExpenses(expenses.filter(e => e.id !== id));
}
