import { Booking, DirectLead, Expense, Settings } from '@/types';
import path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// ─── Per-user key factories ────────────────────────────────────────────────────

const K = (userId: string) => ({
  settings: `str:settings:${userId}`,
  bookings: `str:bookings:${userId}`,
  expenses: `str:expenses:${userId}`,
  leads:    `str:leads:${userId}`,
});

const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  propertyName: 'My STR Property',
  monthlyPITI: 0,
  cleaningFeePerBooking: 0,
  forecastGrowthPct: 0,
  forecastGrowthByYear: {},
  vacancyRate: 0,
  forecastOverrides: {},
  benchmarkAdr: undefined,
  benchmarkExpenseRatio: undefined,
  benchmarkCleaningFee: undefined,
  guestCleaningFeePerBooking: 0,
  mortgageRate: undefined,
  propertyValue: undefined,
  loanBalance: undefined,
  propertyAppreciationPct: undefined,
  loanOriginalBalance: undefined,
  loanTermYears: undefined,
  loanStructure: undefined,
};

// ─── In-process write lock ─────────────────────────────────────────────────────

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

async function redisHashAll<T extends { id: string }>(key: string): Promise<T[]> {
  const client = await getRedis();
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
const BASE_DIR = IS_VERCEL ? '/tmp/str-data' : path.join(process.cwd(), 'data');

function userDir(userId: string) {
  return path.join(BASE_DIR, userId);
}

function filePaths(userId: string) {
  const dir = userDir(userId);
  return {
    settings: path.join(dir, 'settings.json'),
    bookings: path.join(dir, 'bookings.json'),
    expenses: path.join(dir, 'expenses.json'),
    leads:    path.join(dir, 'leads.json'),
  };
}

async function ensureUserDir(userId: string) {
  const dir = userDir(userId);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function fileLoad<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

async function fileSave(file: string, userId: string, value: unknown): Promise<void> {
  await ensureUserDir(userId);
  await writeFile(file, JSON.stringify(value, null, 2));
}

async function fileMutate<T extends { id: string }>(file: string, userId: string, fn: (items: T[]) => T[]): Promise<T[]> {
  return withLock(file, async () => {
    const items = await fileLoad<T[]>(file, []);
    const next = fn(items);
    await fileSave(file, userId, next);
    return next;
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

const useRedis = Boolean(process.env.REDIS_URL);

export async function loadSettings(userId: string): Promise<Settings> {
  const raw = useRedis
    ? await redisGet<Partial<Settings> | null>(K(userId).settings, null)
    : await fileLoad<Partial<Settings>>(filePaths(userId).settings, {});
  return { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
}

export async function saveSettings(userId: string, settings: Settings): Promise<void> {
  useRedis
    ? await redisSet(K(userId).settings, settings)
    : await fileSave(filePaths(userId).settings, userId, settings);
}

export async function loadBookings(userId: string): Promise<Booking[]> {
  return useRedis
    ? redisHashAll<Booking>(K(userId).bookings)
    : fileLoad<Booking[]>(filePaths(userId).bookings, []);
}

export async function addBooking(userId: string, booking: Booking): Promise<void> {
  if (useRedis) {
    await redisHashSet(K(userId).bookings, booking.id, booking);
  } else {
    await fileMutate<Booking>(filePaths(userId).bookings, userId, items => [...items, booking]);
  }
}

export async function updateBooking(userId: string, id: string, patch: Partial<Booking>): Promise<Booking | null> {
  if (useRedis) {
    const bookings = await redisHashAll<Booking>(K(userId).bookings);
    const existing = bookings.find(b => b.id === id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id };
    await redisHashSet(K(userId).bookings, id, updated);
    return updated;
  }
  let updated: Booking | null = null;
  await fileMutate<Booking>(filePaths(userId).bookings, userId, items => items.map(b => {
    if (b.id !== id) return b;
    updated = { ...b, ...patch, id };
    return updated;
  }));
  return updated;
}

export async function deleteBooking(userId: string, id: string): Promise<boolean> {
  if (useRedis) {
    const bookings = await redisHashAll<Booking>(K(userId).bookings);
    if (!bookings.some(b => b.id === id)) return false;
    await redisHashDel(K(userId).bookings, id);
    return true;
  }
  let found = false;
  await fileMutate<Booking>(filePaths(userId).bookings, userId, items => {
    const next = items.filter(b => b.id !== id);
    found = next.length !== items.length;
    return next;
  });
  return found;
}

export async function deleteBookings(userId: string, predicate: (b: Booking) => boolean): Promise<number> {
  if (useRedis) {
    const bookings = await redisHashAll<Booking>(K(userId).bookings);
    const toDelete = bookings.filter(predicate).map(b => b.id);
    await redisHashClear(K(userId).bookings, toDelete);
    return toDelete.length;
  }
  let deleted = 0;
  await fileMutate<Booking>(filePaths(userId).bookings, userId, items => {
    const next = items.filter(b => !predicate(b));
    deleted = items.length - next.length;
    return next;
  });
  return deleted;
}

export async function replaceAllBookings(userId: string, bookings: Booking[]): Promise<void> {
  if (useRedis) {
    const client = await getRedis();
    const pipeline = client.multi();
    pipeline.del(K(userId).bookings);
    for (const b of bookings) pipeline.hSet(K(userId).bookings, b.id, JSON.stringify(b));
    await pipeline.exec();
  } else {
    await withLock(filePaths(userId).bookings, async () => fileSave(filePaths(userId).bookings, userId, bookings));
  }
}

export async function replaceAllExpenses(userId: string, expenses: Expense[]): Promise<void> {
  if (useRedis) {
    const client = await getRedis();
    const pipeline = client.multi();
    pipeline.del(K(userId).expenses);
    for (const e of expenses) pipeline.hSet(K(userId).expenses, e.id, JSON.stringify(e));
    await pipeline.exec();
  } else {
    await withLock(filePaths(userId).expenses, async () => fileSave(filePaths(userId).expenses, userId, expenses));
  }
}

export async function upsertBooking(userId: string, booking: Booking): Promise<void> {
  const bookings = await loadBookings(userId);
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
      await redisHashSet(K(userId).bookings, existing.id, merged);
    } else {
      await fileMutate<Booking>(filePaths(userId).bookings, userId, items => items.map(b => b.id === existing.id ? merged : b));
    }
  } else {
    await addBooking(userId, booking);
  }
}

export async function loadExpenses(userId: string): Promise<Expense[]> {
  return useRedis
    ? redisHashAll<Expense>(K(userId).expenses)
    : fileLoad<Expense[]>(filePaths(userId).expenses, []);
}

export async function addExpense(userId: string, expense: Expense): Promise<void> {
  if (useRedis) {
    await redisHashSet(K(userId).expenses, expense.id, expense);
  } else {
    await fileMutate<Expense>(filePaths(userId).expenses, userId, items => [...items, expense]);
  }
}

export async function updateExpense(userId: string, id: string, patch: Partial<Expense>): Promise<Expense | null> {
  if (useRedis) {
    const expenses = await redisHashAll<Expense>(K(userId).expenses);
    const existing = expenses.find(e => e.id === id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    await redisHashSet(K(userId).expenses, id, updated);
    return updated;
  }
  let updated: Expense | null = null;
  await fileMutate<Expense>(filePaths(userId).expenses, userId, items => items.map(e => {
    if (e.id !== id) return e;
    updated = { ...e, ...patch, id, updatedAt: new Date().toISOString() };
    return updated;
  }));
  return updated;
}

export async function deleteExpense(userId: string, id: string): Promise<boolean> {
  if (useRedis) {
    const expenses = await redisHashAll<Expense>(K(userId).expenses);
    if (!expenses.some(e => e.id === id)) return false;
    await redisHashDel(K(userId).expenses, id);
    return true;
  }
  let found = false;
  await fileMutate<Expense>(filePaths(userId).expenses, userId, items => {
    const next = items.filter(e => e.id !== id);
    found = next.length !== items.length;
    return next;
  });
  return found;
}

export async function loadLeads(userId: string): Promise<DirectLead[]> {
  return useRedis
    ? redisHashAll<DirectLead>(K(userId).leads)
    : fileLoad<DirectLead[]>(filePaths(userId).leads, []);
}

export async function addLead(userId: string, lead: DirectLead): Promise<void> {
  if (useRedis) {
    await redisHashSet(K(userId).leads, lead.id, lead);
  } else {
    await fileMutate<DirectLead>(filePaths(userId).leads, userId, items => [...items, lead]);
  }
}

export async function deleteLead(userId: string, id: string): Promise<boolean> {
  if (useRedis) {
    const leads = await redisHashAll<DirectLead>(K(userId).leads);
    if (!leads.some(l => l.id === id)) return false;
    await redisHashDel(K(userId).leads, id);
    return true;
  }
  let found = false;
  await fileMutate<DirectLead>(filePaths(userId).leads, userId, items => {
    const next = items.filter(l => l.id !== id);
    found = next.length !== items.length;
    return next;
  });
  return found;
}
