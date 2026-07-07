import { NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/storage';
import { requireAuth, unauthorized } from '@/lib/auth';
import { Settings } from '@/types';

export async function GET() {
  try {
    const userId = await requireAuth();
    const settings = await loadSettings(userId);
    return NextResponse.json(settings);
  } catch {
    return unauthorized();
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireAuth();
    const body: Settings = await req.json();
    await saveSettings(userId, body);
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorized();
  }
}
