import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

// Legacy Redis keys (before multi-tenancy)
const LEGACY = {
  settings: 'str:settings',
  bookings: 'str:bookings',
  expenses: 'str:expenses',
  leads:    'str:leads',
};

const NEW = (userId: string) => ({
  settings: `str:settings:${userId}`,
  bookings: `str:bookings:${userId}`,
  expenses: `str:expenses:${userId}`,
  leads:    `str:leads:${userId}`,
});

export async function POST() {
  const userId = await requireAuth();

  if (!process.env.REDIS_URL) {
    return NextResponse.json({ error: 'No Redis configured — nothing to migrate' }, { status: 400 });
  }

  const { createClient } = await import('redis');
  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', err => console.error('Redis migration error:', err));
  await client.connect();

  const results: Record<string, string> = {};
  const newKeys = NEW(userId);

  try {
    for (const [collection, legacyKey] of Object.entries(LEGACY)) {
      const newKey = newKeys[collection as keyof typeof newKeys];

      // Don't overwrite if the new per-user key already has data
      const existingType = await client.type(newKey);
      if (existingType !== 'none') {
        results[collection] = 'skipped (already has data)';
        continue;
      }

      const legacyType = await client.type(legacyKey);
      if (legacyType === 'none') {
        results[collection] = 'skipped (no legacy data)';
        continue;
      }

      if (legacyType === 'string') {
        // settings is stored as a JSON string
        const raw = await client.get(legacyKey);
        if (raw) {
          await client.set(newKey, raw);
          results[collection] = 'copied';
        } else {
          results[collection] = 'skipped (empty)';
        }
      } else if (legacyType === 'hash') {
        // bookings / expenses / leads are stored as hashes
        const all = await client.hGetAll(legacyKey);
        const entries = Object.entries(all);
        if (entries.length > 0) {
          const pipeline = client.multi();
          for (const [field, value] of entries) {
            pipeline.hSet(newKey, field, value);
          }
          await pipeline.exec();
          results[collection] = `copied (${entries.length} records)`;
        } else {
          results[collection] = 'skipped (empty hash)';
        }
      } else {
        results[collection] = `skipped (unknown type: ${legacyType})`;
      }
    }
  } finally {
    await client.disconnect();
  }

  return NextResponse.json({ userId, results });
}
