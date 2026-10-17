import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { resolveScope, type Scope } from '@/lib/storage';
import type { Account } from '@/types';

export async function requireAuth(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new AuthError();
  return userId;
}

export class AuthError extends Error {
  constructor() { super('Unauthorized'); }
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * The signed-in user and the property the request is about.
 *
 * A request names its property with `?property=<id>`; without one it gets
 * whichever the account last had in view, so every existing call keeps working
 * untouched. This is also what creates the account record and migrates the
 * single-property data on first sight.
 */
export async function requireScope(req?: Request): Promise<{ userId: string; account: Account; scope: Scope }> {
  const userId = await requireAuth();
  const requested = req ? new URL(req.url).searchParams.get('property') : null;
  const { account, scope } = await resolveScope(userId, requested);
  return { userId, account, scope };
}
