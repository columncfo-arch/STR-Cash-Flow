import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

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
