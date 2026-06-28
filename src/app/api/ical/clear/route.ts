import { NextResponse } from 'next/server';
import { saveBookings, loadSettings, saveSettings } from '@/lib/storage';
import { parseICalSource } from '@/lib/ical';
import { upsertBooking } from '@/lib/storage';

// Clears all synced (non-manual) bookings then re-imports from all iCal sources
export async function POST() {
  try {
    const settings = await loadSettings();
    const enabledSources = settings.sources.filter(s => s.enabled);

    // Remove all auto-synced bookings, keep manual ones
    const { loadBookings } = await import('@/lib/storage');
    const existing = await loadBookings();
    const manualBookings = existing.filter(b => b.isManual);
    await saveBookings(manualBookings);

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

    return NextResponse.json({
      cleared: existing.length - manualBookings.length,
      synced: totalSynced,
      errors: errors.length ? errors : undefined,
    });
  } catch {
    return NextResponse.json({ error: 'Clear & re-sync failed' }, { status: 500 });
  }
}
