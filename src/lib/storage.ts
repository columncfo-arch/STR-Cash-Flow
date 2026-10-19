import { Account, Booking, DirectLead, Expense, Lease, LeaseCharge, Property, Settings } from '@/types';
import path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// ─── Keys ──────────────────────────────────────────────────────────────────────

/**
 * Whose books, and which unit's. Bookings, expenses and settings all belong to
 * one property; the account owns the list of properties and the guest leads,
 * which arrive from a welcome link that knows only the user.
 */
export interface Scope {
  userId: string;
  propertyId: string;
}

/** The original single-property keys. Still read, to migrate from. */
const K = (userId: string) => ({
  account:  `str:account:${userId}`,
  settings: `str:settings:${userId}`,
  bookings: `str:bookings:${userId}`,
  expenses: `str:expenses:${userId}`,
  leads:    `str:leads:${userId}`,
});

const KP = ({ userId, propertyId }: Scope) => ({
  settings: `str:settings:${userId}:${propertyId}`,
  bookings: `str:bookings:${userId}:${propertyId}`,
  expenses: `str:expenses:${userId}:${propertyId}`,
  leases: `str:leases:${userId}:${propertyId}`,
  leaseCharges: `str:lease-charges:${userId}:${propertyId}`,
});

/** The property every pre-multi-property record is moved under. */
export const DEFAULT_PROPERTY_ID = 'default';

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
// STR_DATA_DIR points the filesystem backend somewhere disposable. Nothing in
// the app sets it; the tests do, so they can exercise migration and archiving
// for real rather than against a stand-in for this module.
const BASE_DIR = process.env.STR_DATA_DIR
  ?? (IS_VERCEL ? '/tmp/str-data' : path.join(process.cwd(), 'data'));

function userDir(userId: string) {
  return path.join(BASE_DIR, userId);
}

function filePaths(userId: string) {
  const dir = userDir(userId);
  return {
    account:  path.join(dir, 'account.json'),
    settings: path.join(dir, 'settings.json'),
    bookings: path.join(dir, 'bookings.json'),
    expenses: path.join(dir, 'expenses.json'),
    leads:    path.join(dir, 'leads.json'),
  };
}

function propertyDir({ userId, propertyId }: Scope) {
  return path.join(userDir(userId), 'properties', propertyId);
}

function propertyPaths(scope: Scope) {
  const dir = propertyDir(scope);
  return {
    settings: path.join(dir, 'settings.json'),
    bookings: path.join(dir, 'bookings.json'),
    expenses: path.join(dir, 'expenses.json'),
    leases: path.join(dir, 'leases.json'),
    leaseCharges: path.join(dir, 'lease-charges.json'),
  };
}

async function ensureDirFor(file: string) {
  const dir = path.dirname(file);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function fileLoad<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

async function fileSave(file: string, value: unknown): Promise<void> {
  await ensureDirFor(file);
  await writeFile(file, JSON.stringify(value, null, 2));
}

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

/**
 * Which backend is live, and whether it survives a deploy. On Vercel the file
 * backend writes to /tmp, which is per-instance and wiped on every deployment —
 * so without REDIS_URL nothing persists.
 */
export function storageBackend(): { backend: 'redis' | 'filesystem'; persists: boolean } {
  return {
    backend: useRedis ? 'redis' : 'filesystem',
    persists: useRedis || !IS_VERCEL,
  };
}

// ─── Account: the properties under one login ──────────────────────────────────

const DEFAULT_ACCOUNT = (propertyName: string, currency: string): Account => ({
  properties: [{ id: DEFAULT_PROPERTY_ID, name: propertyName, createdAt: new Date().toISOString() }],
  activePropertyId: DEFAULT_PROPERTY_ID,
  currency,
});

async function readAccount(userId: string): Promise<Account | null> {
  return useRedis
    ? redisGet<Account | null>(K(userId).account, null)
    : fileLoad<Account | null>(filePaths(userId).account, null);
}

export async function saveAccount(userId: string, account: Account): Promise<void> {
  if (useRedis) await redisSet(K(userId).account, account);
  else await fileSave(filePaths(userId).account, account);
}

/**
 * The account, creating it on first sight and bringing the single-property
 * records across with it.
 *
 * The migration copies rather than moves. The original keys are left exactly as
 * they were, so if anything here is wrong the data is still sitting where it
 * always was — a deploy can be rolled back without a restore. It is also
 * idempotent: the destination is a fixed property id, and the account record it
 * writes last is what stops it running twice.
 */
export async function loadAccount(userId: string): Promise<Account> {
  const existing = await readAccount(userId);
  if (existing) return existing;

  return withLock(`account:${userId}`, async () => {
    // Another request may have migrated while this one waited for the lock
    const raced = await readAccount(userId);
    if (raced) return raced;

    const legacySettings = useRedis
      ? await redisGet<Partial<Settings> | null>(K(userId).settings, null)
      : await fileLoad<Partial<Settings> | null>(filePaths(userId).settings, null);

    const account = DEFAULT_ACCOUNT(
      legacySettings?.propertyName || DEFAULT_SETTINGS.propertyName,
      legacySettings?.currency || DEFAULT_SETTINGS.currency,
    );
    account.hostexAccessToken = legacySettings?.hostexAccessToken;

    const scope: Scope = { userId, propertyId: DEFAULT_PROPERTY_ID };
    const legacyBookings = useRedis
      ? await redisHashAll<Booking>(K(userId).bookings)
      : await fileLoad<Booking[]>(filePaths(userId).bookings, []);
    const legacyExpenses = useRedis
      ? await redisHashAll<Expense>(K(userId).expenses)
      : await fileLoad<Expense[]>(filePaths(userId).expenses, []);

    if (legacySettings) await saveSettings(scope, { ...DEFAULT_SETTINGS, ...legacySettings });
    if (legacyBookings.length) await replaceAllBookings(scope, legacyBookings);
    if (legacyExpenses.length) await replaceAllExpenses(scope, legacyExpenses);

    account.migratedAt = new Date().toISOString();
    await saveAccount(userId, account);
    return account;
  });
}

/**
 * The property a request is about: the one asked for when it exists, otherwise
 * whichever the account last had in view.
 */
export async function resolveScope(userId: string, requested?: string | null): Promise<{ account: Account; scope: Scope }> {
  const account = await loadAccount(userId);
  const known = account.properties.some(p => p.id === requested);
  const propertyId = known && requested ? requested : account.activePropertyId;
  return { account, scope: { userId, propertyId } };
}

/** Every property's scope, for the portfolio view. Archived units are left out. */
export function allScopes(userId: string, account: Account): { property: Property; scope: Scope }[] {
  return account.properties
    .filter(p => !p.archived)
    .map(property => ({ property, scope: { userId, propertyId: property.id } }));
}

export async function loadSettings(scope: Scope): Promise<Settings> {
  const raw = useRedis
    ? await redisGet<Partial<Settings> | null>(KP(scope).settings, null)
    : await fileLoad<Partial<Settings>>(propertyPaths(scope).settings, {});
  return { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
}

export async function saveSettings(scope: Scope, settings: Settings): Promise<void> {
  if (useRedis) await redisSet(KP(scope).settings, settings);
  else await fileSave(propertyPaths(scope).settings, settings);
}

export async function loadBookings(scope: Scope): Promise<Booking[]> {
  return useRedis
    ? redisHashAll<Booking>(KP(scope).bookings)
    : fileLoad<Booking[]>(propertyPaths(scope).bookings, []);
}

export async function addBooking(scope: Scope, booking: Booking): Promise<void> {
  if (useRedis) {
    await redisHashSet(KP(scope).bookings, booking.id, booking);
  } else {
    await fileMutate<Booking>(propertyPaths(scope).bookings, items => [...items, booking]);
  }
}

export async function updateBooking(scope: Scope, id: string, patch: Partial<Booking>): Promise<Booking | null> {
  if (useRedis) {
    const bookings = await redisHashAll<Booking>(KP(scope).bookings);
    const existing = bookings.find(b => b.id === id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id };
    await redisHashSet(KP(scope).bookings, id, updated);
    return updated;
  }
  let updated: Booking | null = null;
  await fileMutate<Booking>(propertyPaths(scope).bookings, items => items.map(b => {
    if (b.id !== id) return b;
    updated = { ...b, ...patch, id };
    return updated;
  }));
  return updated;
}

export async function deleteBooking(scope: Scope, id: string): Promise<boolean> {
  if (useRedis) {
    const bookings = await redisHashAll<Booking>(KP(scope).bookings);
    if (!bookings.some(b => b.id === id)) return false;
    await redisHashDel(KP(scope).bookings, id);
    return true;
  }
  let found = false;
  await fileMutate<Booking>(propertyPaths(scope).bookings, items => {
    const next = items.filter(b => b.id !== id);
    found = next.length !== items.length;
    return next;
  });
  return found;
}

export async function deleteBookings(scope: Scope, predicate: (b: Booking) => boolean): Promise<number> {
  if (useRedis) {
    const bookings = await redisHashAll<Booking>(KP(scope).bookings);
    const toDelete = bookings.filter(predicate).map(b => b.id);
    await redisHashClear(KP(scope).bookings, toDelete);
    return toDelete.length;
  }
  let deleted = 0;
  await fileMutate<Booking>(propertyPaths(scope).bookings, items => {
    const next = items.filter(b => !predicate(b));
    deleted = items.length - next.length;
    return next;
  });
  return deleted;
}

export async function replaceAllBookings(scope: Scope, bookings: Booking[]): Promise<void> {
  if (useRedis) {
    const client = await getRedis();
    const pipeline = client.multi();
    pipeline.del(KP(scope).bookings);
    for (const b of bookings) pipeline.hSet(KP(scope).bookings, b.id, JSON.stringify(b));
    await pipeline.exec();
  } else {
    await withLock(propertyPaths(scope).bookings, async () => fileSave(propertyPaths(scope).bookings, bookings));
  }
}

export async function replaceAllExpenses(scope: Scope, expenses: Expense[]): Promise<void> {
  if (useRedis) {
    const client = await getRedis();
    const pipeline = client.multi();
    pipeline.del(KP(scope).expenses);
    for (const e of expenses) pipeline.hSet(KP(scope).expenses, e.id, JSON.stringify(e));
    await pipeline.exec();
  } else {
    await withLock(propertyPaths(scope).expenses, async () => fileSave(propertyPaths(scope).expenses, expenses));
  }
}

export async function upsertBooking(scope: Scope, booking: Booking): Promise<void> {
  const bookings = await loadBookings(scope);
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
      await redisHashSet(KP(scope).bookings, existing.id, merged);
    } else {
      await fileMutate<Booking>(propertyPaths(scope).bookings, items => items.map(b => b.id === existing.id ? merged : b));
    }
  } else {
    await addBooking(scope, booking);
  }
}

export async function loadExpenses(scope: Scope): Promise<Expense[]> {
  return useRedis
    ? redisHashAll<Expense>(KP(scope).expenses)
    : fileLoad<Expense[]>(propertyPaths(scope).expenses, []);
}

export async function addExpense(scope: Scope, expense: Expense): Promise<void> {
  if (useRedis) {
    await redisHashSet(KP(scope).expenses, expense.id, expense);
  } else {
    await fileMutate<Expense>(propertyPaths(scope).expenses, items => [...items, expense]);
  }
}

export async function updateExpense(scope: Scope, id: string, patch: Partial<Expense>): Promise<Expense | null> {
  if (useRedis) {
    const expenses = await redisHashAll<Expense>(KP(scope).expenses);
    const existing = expenses.find(e => e.id === id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    await redisHashSet(KP(scope).expenses, id, updated);
    return updated;
  }
  let updated: Expense | null = null;
  await fileMutate<Expense>(propertyPaths(scope).expenses, items => items.map(e => {
    if (e.id !== id) return e;
    updated = { ...e, ...patch, id, updatedAt: new Date().toISOString() };
    return updated;
  }));
  return updated;
}

export async function deleteExpense(scope: Scope, id: string): Promise<boolean> {
  if (useRedis) {
    const expenses = await redisHashAll<Expense>(KP(scope).expenses);
    if (!expenses.some(e => e.id === id)) return false;
    await redisHashDel(KP(scope).expenses, id);
    return true;
  }
  let found = false;
  await fileMutate<Expense>(propertyPaths(scope).expenses, items => {
    const next = items.filter(e => e.id !== id);
    found = next.length !== items.length;
    return next;
  });
  return found;
}

// ─── Leases ───────────────────────────────────────────────────────────────────

/**
 * The four operations every per-property collection needs, over whichever
 * backend is live.
 *
 * Bookings and expenses each spell these out above, which was four near-copies
 * of the same twenty lines before leases would have made it six. They are left
 * as they are rather than moved onto this — they work, they are covered, and
 * rewriting proven storage paths to save repetition is a trade in the wrong
 * direction. New collections start here.
 */
function collection<T extends { id: string }>(
  key: (scope: Scope) => string,
  file: (scope: Scope) => string,
) {
  return {
    load: (scope: Scope): Promise<T[]> =>
      useRedis ? redisHashAll<T>(key(scope)) : fileLoad<T[]>(file(scope), []),

    add: async (scope: Scope, item: T): Promise<void> => {
      if (useRedis) await redisHashSet(key(scope), item.id, item);
      else await fileMutate<T>(file(scope), items => [...items, item]);
    },

    update: async (scope: Scope, id: string, patch: Partial<T>): Promise<T | null> => {
      const stamped = { ...patch, id, updatedAt: new Date().toISOString() };
      if (useRedis) {
        const all = await redisHashAll<T>(key(scope));
        const existing = all.find(i => i.id === id);
        if (!existing) return null;
        const updated = { ...existing, ...stamped } as T;
        await redisHashSet(key(scope), id, updated);
        return updated;
      }
      let updated: T | null = null;
      await fileMutate<T>(file(scope), items => items.map(i => {
        if (i.id !== id) return i;
        updated = { ...i, ...stamped } as T;
        return updated;
      }));
      return updated;
    },

    remove: async (scope: Scope, id: string): Promise<boolean> => {
      if (useRedis) {
        const all = await redisHashAll<T>(key(scope));
        if (!all.some(i => i.id === id)) return false;
        await redisHashDel(key(scope), id);
        return true;
      }
      let found = false;
      await fileMutate<T>(file(scope), items => {
        const next = items.filter(i => i.id !== id);
        found = next.length !== items.length;
        return next;
      });
      return found;
    },

    /** Every id matching a predicate, removed together. */
    removeWhere: async (scope: Scope, predicate: (item: T) => boolean): Promise<number> => {
      if (useRedis) {
        const all = await redisHashAll<T>(key(scope));
        const ids = all.filter(predicate).map(i => i.id);
        await redisHashClear(key(scope), ids);
        return ids.length;
      }
      let removed = 0;
      await fileMutate<T>(file(scope), items => {
        const next = items.filter(i => !predicate(i));
        removed = items.length - next.length;
        return next;
      });
      return removed;
    },
  };
}

const leases = collection<Lease>(s => KP(s).leases, s => propertyPaths(s).leases);
const leaseCharges = collection<LeaseCharge>(s => KP(s).leaseCharges, s => propertyPaths(s).leaseCharges);

export const loadLeases = leases.load;
export const addLease = leases.add;
export const updateLease = leases.update;

export const loadLeaseCharges = leaseCharges.load;
export const addLeaseCharge = leaseCharges.add;
export const updateLeaseCharge = leaseCharges.update;
export const deleteLeaseCharge = leaseCharges.remove;

/**
 * Remove a lease and everything billed against it.
 *
 * Charges point at a lease by id, so leaving them behind would leave records
 * that bill against a tenancy that no longer exists — invisible in the app and
 * still counted by nothing, since recognition skips charges whose lease is
 * gone. Deleting them together is what keeps the two in step.
 */
export async function deleteLease(scope: Scope, id: string): Promise<boolean> {
  const removed = await leases.remove(scope, id);
  if (removed) await leaseCharges.removeWhere(scope, c => c.leaseId === id);
  return removed;
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
    await fileMutate<DirectLead>(filePaths(userId).leads, items => [...items, lead]);
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
  await fileMutate<DirectLead>(filePaths(userId).leads, items => {
    const next = items.filter(l => l.id !== id);
    found = next.length !== items.length;
    return next;
  });
  return found;
}
