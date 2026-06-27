import { NextResponse } from 'next/server';
import { loadSettings, saveSettings, upsertBooking, loadBookings } from '@/lib/storage';
import { parseICalSource } from '@/lib/ical';

export async function POST() {
  try {
    const settings = loadSettings();
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
          upsertBooking(booking);
        }
        totalSynced += bookings.length;

        // Update lastSynced
        source.lastSynced = new Date().toISOString();
      } catch (err) {
        errors.push(`${source.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    saveSettings({
      ...settings,
      sources: settings.sources.map(s => {
        const updated = enabledSources.find(e => e.id === s.id);
        return updated ?? s;
      }),
    });

    return NextResponse.json({
      synced: totalSynced,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
