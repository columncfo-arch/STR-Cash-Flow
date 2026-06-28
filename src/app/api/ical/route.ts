import { NextResponse } from 'next/server';
import { loadSettings, saveSettings, upsertBooking } from '@/lib/storage';
import { parseICalSource } from '@/lib/ical';

export async function POST() {
  try {
    const settings = await loadSettings();
    const enabledSources = settings.sources.filter(s => s.enabled);

    if (enabledSources.length === 0) {
      return NextResponse.json({ message: 'No enabled iCal sources', synced: 0 });
    }

    let totalSynced = 0;
    const errors: string[] = [];

    for (const source of enabledSources) {
      try {
        const bookings = await parseICalSource(source, settings.defaultNightlyRate);
        for (const booking of bookings) {
          await upsertBooking(booking);
        }
        totalSynced += bookings.length;
        source.lastSynced = new Date().toISOString();
      } catch (err) {
        errors.push(`${source.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    await saveSettings({
      ...settings,
      sources: settings.sources.map(s => enabledSources.find(e => e.id === s.id) ?? s),
    });

    return NextResponse.json({ synced: totalSynced, errors: errors.length ? errors : undefined });
  } catch {
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
