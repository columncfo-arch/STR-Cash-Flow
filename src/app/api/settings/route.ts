import { NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/storage';
import { requireAuth, unauthorized, AuthError } from '@/lib/auth';
import { Settings } from '@/types';

export async function GET() {
  try {
    const userId = await requireAuth();
    const settings = await loadSettings(userId);
    return NextResponse.json(settings);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Settings GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireAuth();
    const body: Settings = await req.json();
    await saveSettings(userId, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Settings PUT error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
