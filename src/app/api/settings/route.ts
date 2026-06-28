import { NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/storage';
import { Settings } from '@/types';

export async function GET() {
  try {
    const settings = await loadSettings();
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body: Settings = await req.json();
    await saveSettings(body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
