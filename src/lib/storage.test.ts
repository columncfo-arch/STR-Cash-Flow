import { describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_PROPERTY_ID, addLease, addLeaseCharge, allScopes, deleteLease,
  loadAccount, loadBookings, loadExpenses, loadLeaseCharges, loadLeases,
  loadSettings, resolveScope, saveAccount, updateLease,
} from '@/lib/storage';
import type { Account, Booking, Expense, Lease, LeaseCharge } from '@/types';

const BASE = () => process.env.STR_DATA_DIR!;

/** Write the records a single-property account used to keep, as they were kept. */
async function seedLegacy(userId: string, data: {
  settings?: object; bookings?: Booking[]; expenses?: Expense[];
}) {
  const dir = path.join(BASE(), userId);
  await mkdir(dir, { recursive: true });
  for (const [name, value] of Object.entries(data)) {
    await writeFile(path.join(dir, `${name}.json`), JSON.stringify(value, null, 2));
  }
}

const readJson = async <T>(...parts: string[]): Promise<T> =>
  JSON.parse(await readFile(path.join(BASE(), ...parts), 'utf-8')) as T;

const booking = (id: string, income: number): Booking => ({
  id, sourceId: 's', platform: 'airbnb', uid: id, summary: 'Airbnb - Guest',
  checkIn: '2026-03-02', checkOut: '2026-03-05', nights: 3, income,
  createdAt: '', updatedAt: '',
});

const expense = (id: string, amount: number): Expense => ({
  id, date: '2026-03-10', category: 'cleaning', description: 'Turnover',
  amount, createdAt: '', updatedAt: '',
});

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'L1', tenantName: 'Dana Moore', monthlyRent: 2400,
  startDate: '2026-01-01', endDate: null, createdAt: '', updatedAt: '', ...over,
});

const charge = (over: Partial<LeaseCharge> = {}): LeaseCharge => ({
  id: 'c1', leaseId: 'L1', label: 'Parking', amount: 75, date: '2026-01-01',
  recurring: true, createdAt: '', updatedAt: '', ...over,
});

describe('bringing a single-property account across', () => {
  const userId = 'test-migrate';

  it('migrates the legacy records and leaves them where they were', async () => {
    await seedLegacy(userId, {
      settings: { propertyName: '112 Surf Dr', currency: 'USD', monthlyPITI: 2800 },
      bookings: [booking('b1', 725), booking('b2', 980)],
      expenses: [expense('e1', 120)],
    });

    const account = await loadAccount(userId);
    const scope = { userId, propertyId: DEFAULT_PROPERTY_ID };

    expect(account.properties).toHaveLength(1);
    expect(account.properties[0].id).toBe(DEFAULT_PROPERTY_ID);
    expect(account.properties[0].name).toBe('112 Surf Dr');
    expect(account.activePropertyId).toBe(DEFAULT_PROPERTY_ID);
    expect(account.migratedAt).toBeTruthy();

    expect(await loadBookings(scope)).toHaveLength(2);
    expect(await loadExpenses(scope)).toHaveLength(1);
    expect((await loadSettings(scope)).monthlyPITI).toBe(2800);

    // The copy is the point: if any of this is wrong the originals are still
    // sitting where they always were, so a deploy can be rolled back
    expect(await readJson<Booking[]>(userId, 'bookings.json')).toHaveLength(2);
    expect(await readJson<Expense[]>(userId, 'expenses.json')).toHaveLength(1);
  });

  it('does not run twice', async () => {
    const first = await loadAccount(userId);
    const again = await loadAccount(userId);

    expect(again.properties).toHaveLength(1);
    expect(again.migratedAt).toBe(first.migratedAt);
    expect(await loadBookings({ userId, propertyId: DEFAULT_PROPERTY_ID })).toHaveLength(2);
  });

  it('gives a user with no history a default account', async () => {
    const fresh = await loadAccount('test-fresh');
    expect(fresh.properties).toHaveLength(1);
    expect(fresh.properties[0].name).toBe('My STR Property');
    expect(await loadBookings({ userId: 'test-fresh', propertyId: DEFAULT_PROPERTY_ID })).toEqual([]);
  });
});

describe('which property a request is about', () => {
  const userId = 'test-scope';

  const account = (): Account => ({
    properties: [
      { id: 'p1', name: '45 Ocean Ave', createdAt: '' },
      { id: 'p2', name: '77 Pine Ln', createdAt: '' },
      { id: 'p3', name: 'Sold last year', createdAt: '', archived: true },
    ],
    activePropertyId: 'p1',
    currency: 'USD',
  });

  it('falls back to whichever is in view', async () => {
    await saveAccount(userId, account());
    expect((await resolveScope(userId)).scope.propertyId).toBe('p1');
  });

  it('honours a property it knows', async () => {
    await saveAccount(userId, account());
    expect((await resolveScope(userId, 'p2')).scope.propertyId).toBe('p2');
  });

  // A welcome link carrying a stale id must not land on nothing
  it('ignores a property it does not know', async () => {
    await saveAccount(userId, account());
    expect((await resolveScope(userId, 'nonsense')).scope.propertyId).toBe('p1');
  });

  it('leaves archived units out of the portfolio', () => {
    const scopes = allScopes(userId, account());
    expect(scopes.map(s => s.property.id)).toEqual(['p1', 'p2']);
  });
});

describe('a property keeps its books when it is archived', () => {
  const userId = 'test-archive';

  it('still has them after being hidden and restored', async () => {
    const scope = { userId, propertyId: 'p1' };
    const live: Account = {
      properties: [
        { id: 'p1', name: '45 Ocean Ave', createdAt: '' },
        { id: 'p2', name: '77 Pine Ln', createdAt: '' },
      ],
      activePropertyId: 'p1',
      currency: 'USD',
    };
    await saveAccount(userId, live);
    await addLease(scope, lease());

    // Archiving is a flag on the property and touches nothing it owns, which
    // is why there is no delete anywhere near it
    await saveAccount(userId, {
      ...live,
      properties: live.properties.map(p => p.id === 'p1' ? { ...p, archived: true } : p),
      activePropertyId: 'p2',
    });
    expect(allScopes(userId, await loadAccount(userId)).map(s => s.property.id)).toEqual(['p2']);
    expect(await loadLeases(scope)).toHaveLength(1);

    await saveAccount(userId, { ...live, activePropertyId: 'p1' });
    expect(await loadLeases(scope)).toHaveLength(1);
  });
});

describe('tenancies and the charges billed to them', () => {
  const scope = { userId: 'test-leases', propertyId: 'p1' };

  it('round-trips a tenancy', async () => {
    await addLease(scope, lease());
    const [saved] = await loadLeases(scope);
    expect(saved.tenantName).toBe('Dana Moore');
    expect(saved.monthlyRent).toBe(2400);
  });

  it('patches a tenancy and stamps it', async () => {
    const updated = await updateLease(scope, 'L1', { terminatedOn: '2026-08-15' });
    expect(updated?.terminatedOn).toBe('2026-08-15');
    expect(updated?.updatedAt).not.toBe('');
    expect(updated?.tenantName).toBe('Dana Moore');
  });

  it('reports a tenancy it does not have', async () => {
    expect(await updateLease(scope, 'nope', { monthlyRent: 1 })).toBeNull();
  });

  /**
   * Charges point at a lease by id. Left behind, they would bill against a
   * tenancy that no longer exists — invisible in the app and counted by
   * nothing, since recognition walks the leases to find them.
   */
  it('takes a tenancy’s charges with it when it goes', async () => {
    await addLeaseCharge(scope, charge());
    await addLeaseCharge(scope, charge({ id: 'c2', label: 'Pet rent', amount: 40 }));
    await addLeaseCharge(scope, charge({ id: 'c3', leaseId: 'OTHER', label: 'Storage' }));
    expect(await loadLeaseCharges(scope)).toHaveLength(3);

    expect(await deleteLease(scope, 'L1')).toBe(true);
    expect(await loadLeases(scope)).toHaveLength(0);

    const left = await loadLeaseCharges(scope);
    expect(left.map(c => c.id)).toEqual(['c3']);
  });

  it('reports a deletion that found nothing', async () => {
    expect(await deleteLease(scope, 'L1')).toBe(false);
  });

  it('keeps each property’s tenancies to itself', async () => {
    await addLease({ ...scope, propertyId: 'p2' }, lease({ id: 'L9', tenantName: 'Ray Okafor' }));
    expect(await loadLeases(scope)).toHaveLength(0);
    expect(await loadLeases({ ...scope, propertyId: 'p2' })).toHaveLength(1);
  });
});
