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
  forecastGrowthByYear: {},
};

// ─── In-process write lock (serializes read-modify-write on the file backend) ──

const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  locks.set(key, run.catch(() => undefined));
  return run;
}

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

// Hash-backed collections: each record lives in its own field, keyed by id.
// This makes add/update/delete atomic per-record — concurrent writes to
// different records never clobber each other (unlike a single JSON blob).

async function redisHashAll<T extends { id: string }>(key: string): Promise<T[]> {
  const client = await getRedis();
  // Transparent migration: old code stored the whole array as a JSON string.
  // If the key is still a STRING type, parse + migrate to Hash, then return.
  const keyType = await client.type(key);
  if (keyType === 'string') {
    const raw = await client.get(key);
    const items: T[] = raw ? (JSON.parse(raw) as T[]) : [];
    const pipeline = client.multi();
    pipeline.del(key);
    for (const item of items) {
      if (item.id) pipeline.hSet(key, item.id, JSON.stringify(item));
    }
    await pipeline.exec();
    return items;
  }
  if (keyType === 'none') return [];
  const all = await client.hGetAll(key);
  return Object.values(all).map(v => JSON.parse(v) as T);
}

async function redisHashSet(key: string, id: string, value: unknown): Promise<void> {
  const client = await getRedis();
  await client.hSet(key, id, JSON.stringify(value));
}

async function redisHashDel(key: string, id: string): Promise<void> {
  const client = await getRedis();
  await client.hDel(key, id);
}

async function redisHashClear(key: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = await getRedis();
  await client.hDel(key, ids);
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

// file-backend mutation: locked read-modify-write so same-process concurrent
// requests (e.g. a double click) can't race and drop a record.
async function fileMutate<T extends { id: string }>(file: string, fn: (items: T[]) => T[]): Promise<T[]> {
  return withLock(file, async () => {
    const items = await fileLoad<T[]>(file, []);
    const next = fn(items);
    await fileSave(file, next);
    return next;
  });
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
    ? redisHashAll<Booking>(REDIS_BOOKINGS_KEY)
    : fileLoad<Booking[]>(BOOKINGS_FILE, []);
}

export async function addBooking(booking: Booking): Promise<void> {
  if (useRedis) {
    await redisHashSet(REDIS_BOOKINGS_KEY, booking.id, booking);
  } else {
    await fileMutate<Booking>(BOOKINGS_FILE, items => [...items, booking]);
  }
}

export async function updateBooking(id: string, patch: Partial<Booking>): Promise<Booking | null> {
  if (useRedis) {
    const bookings = await redisHashAll<Booking>(REDIS_BOOKINGS_KEY);
    const existing = bookings.find(b => b.id === id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id };
    await redisHashSet(REDIS_BOOKINGS_KEY, id, updated);
    return updated;
  }
  let updated: Booking | null = null;
  await fileMutate<Booking>(BOOKINGS_FILE, items => items.map(b => {
    if (b.id !== id) return b;
    updated = { ...b, ...patch, id };
    return updated;
  }));
  return updated;
}

export async function deleteBooking(id: string): Promise<boolean> {
  if (useRedis) {
    const bookings = await redisHashAll<Booking>(REDIS_BOOKINGS_KEY);
    if (!bookings.some(b => b.id === id)) return false;
    await redisHashDel(REDIS_BOOKINGS_KEY, id);
    return true;
  }
  let found = false;
  await fileMutate<Booking>(BOOKINGS_FILE, items => {
    const next = items.filter(b => b.id !== id);
    found = next.length !== items.length;
    return next;
  });
  return found;
}

export async function deleteBookings(predicate: (b: Booking) => boolean): Promise<number> {
  if (useRedis) {
    const bookings = await redisHashAll<Booking>(REDIS_BOOKINGS_KEY);
    const toDelete = bookings.filter(predicate).map(b => b.id);
    await redisHashClear(REDIS_BOOKINGS_KEY, toDelete);
    return toDelete.length;
  }
  let deleted = 0;
  await fileMutate<Booking>(BOOKINGS_FILE, items => {
    const next = items.filter(b => !predicate(b));
    deleted = items.length - next.length;
    return next;
  });
  return deleted;
}

// Bulk replace for the CSV importer, which builds the full next-state array
// in memory across hundreds of rows before persisting once.
export async function replaceAllBookings(bookings: Booking[]): Promise<void> {
  if (useRedis) {
    const client = await getRedis();
    const pipeline = client.multi();
    pipeline.del(REDIS_BOOKINGS_KEY);
    for (const b of bookings) pipeline.hSet(REDIS_BOOKINGS_KEY, b.id, JSON.stringify(b));
    await pipeline.exec();
  } else {
    await withLock(BOOKINGS_FILE, async () => fileSave(BOOKINGS_FILE, bookings));
  }
}

export async function replaceAllExpenses(expenses: Expense[]): Promise<void> {
  if (useRedis) {
    const client = await getRedis();
    const pipeline = client.multi();
    pipeline.del(REDIS_EXPENSES_KEY);
    for (const e of expenses) pipeline.hSet(REDIS_EXPENSES_KEY, e.id, JSON.stringify(e));
    await pipeline.exec();
  } else {
    await withLock(EXPENSES_FILE, async () => fileSave(EXPENSES_FILE, expenses));
  }
}

export async function upsertBooking(booking: Booking): Promise<void> {
  const bookings = await loadBookings();
  const existing = bookings.find(b =>
    (b.uid === booking.uid && b.sourceId === booking.sourceId) ||
    (booking.confirmationCode && b.confirmationCode === booking.confirmationCode && b.platform === booking.platform)
  );
  if (existing) {
    const merged: Booking = {
      ...booking,
      id: existing.id,
      income: existing.income > 0 ? existing.income : booking.income,
      platformFee: existing.platformFee ?? booking.platformFee,
      isManual: existing.isManual,
      notes: existing.notes ?? booking.notes,
    };
    if (useRedis) {
      await redisHashSet(REDIS_BOOKINGS_KEY, existing.id, merged);
    } else {
      await fileMutate<Booking>(BOOKINGS_FILE, items => items.map(b => b.id === existing.id ? merged : b));
    }
  } else {
    await addBooking(booking);
  }
}

export async function loadExpenses(): Promise<Expense[]> {
  return useRedis
    ? redisHashAll<Expense>(REDIS_EXPENSES_KEY)
    : fileLoad<Expense[]>(EXPENSES_FILE, []);
}

export async function addExpense(expense: Expense): Promise<void> {
  if (useRedis) {
    await redisHashSet(REDIS_EXPENSES_KEY, expense.id, expense);
  } else {
    await fileMutate<Expense>(EXPENSES_FILE, items => [...items, expense]);
  }
}

export async function updateExpense(id: string, patch: Partial<Expense>): Promise<Expense | null> {
  if (useRedis) {
    const expenses = await redisHashAll<Expense>(REDIS_EXPENSES_KEY);
    const existing = expenses.find(e => e.id === id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    await redisHashSet(REDIS_EXPENSES_KEY, id, updated);
    return updated;
  }
  let updated: Expense | null = null;
  await fileMutate<Expense>(EXPENSES_FILE, items => items.map(e => {
    if (e.id !== id) return e;
    updated = { ...e, ...patch, id, updatedAt: new Date().toISOString() };
    return updated;
  }));
  return updated;
}

export async function deleteExpense(id: string): Promise<boolean> {
  if (useRedis) {
    const expenses = await redisHashAll<Expense>(REDIS_EXPENSES_KEY);
    if (!expenses.some(e => e.id === id)) return false;
    await redisHashDel(REDIS_EXPENSES_KEY, id);
    return true;
  }
  let found = false;
  await fileMutate<Expense>(EXPENSES_FILE, items => {
    const next = items.filter(e => e.id !== id);
    found = next.length !== items.length;
    return next;
  });
  return found;
}
