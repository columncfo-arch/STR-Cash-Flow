import { NextResponse } from 'next/server';
import { requireScope, unauthorized, AuthError } from '@/lib/auth';
import { loadBookings, loadLeads, loadExpenses, storageBackend } from '@/lib/storage';
import { overlapClusters } from '@/lib/overlap';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/diagnostics — what is actually in this account's storage.
 *
 * Written to answer "where did the guest list data go?": it distinguishes data
 * that was never captured from data captured under a different host id, and
 * reports whether the storage backend survives a deploy at all.
 */
export async function GET() {
  try {
    const { userId, scope } = await requireScope();
    const [bookings, leads, expenses] = await Promise.all([
      loadBookings(scope),
      loadLeads(userId),
      loadExpenses(scope),
    ]);

    const leadsBySource = leads.reduce<Record<string, number>>((acc, l) => {
      const k = l.source ?? 'unknown';
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

    const defaultHostUserId = process.env.DEFAULT_HOST_USER_ID ?? null;

    /**
     * Stays claiming the same nights, with the fields that say why.
     *
     * One unit has one calendar, so every cluster here is an error. Which error
     * is readable off the rows:
     *
     *  - `updatedAt` older than the others in its cluster is a cancellation the
     *    sync never took back out. Every sync restamps a live booking, so a
     *    record Hostex has stopped reporting keeps the date of the last sync
     *    that still saw it, and falls behind its neighbours.
     *  - the same `guest` twice under different codes is one reservation stored
     *    twice, which the dedup pass misses when the dates were altered between
     *    syncs — it collapses identical date pairs, not overlapping ones.
     *  - differing `sourceId` is a CSV import sitting alongside its Hostex
     *    counterpart.
     *  - differing `hostexUnit` means stays from two Hostex listings have been
     *    filed against one property.
     */
    const overlapping = overlapClusters(bookings).map(cluster =>
      cluster.map(b => ({
        guest: b.guestName ?? null,
        platform: b.platform,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        nights: b.nights,
        income: b.income,
        code: b.confirmationCode ?? null,
        status: b.status ?? null,
        sourceId: b.sourceId ?? null,
        hostexUnit: b.propertyId ?? null,
        listing: b.unitId ?? null,
        updatedAt: b.updatedAt ?? null,
        createdAt: b.createdAt ?? null,
      })),
    );

    return NextResponse.json({
      // Compare this against the ?u= value in the welcome link you hand guests.
      // A mismatch means sign-ups are landing in a different account's bucket.
      signedInUserId: userId,
      defaultHostUserId,
      defaultHostMatchesSignedIn: defaultHostUserId ? defaultHostUserId === userId : null,

      storage: storageBackend(),

      counts: {
        bookings: bookings.length,
        leads: leads.length,
        expenses: expenses.length,
        bookingsWithContact: bookings.filter(b => b.email || b.phone).length,
        overlappingStays: overlapping.reduce((t, c) => t + c.length, 0),
        overlapClusters: overlapping.length,
      },

      // The nights double-booked across the whole history, newest first — a
      // month in view is rarely the only one affected.
      overlapping: overlapping.slice().reverse(),

      // What the sync has stamped most recently. A live account's latest sync
      // should be close to now; stays updated well before it are the ones no
      // recent sync has seen.
      latestBookingUpdate: bookings.map(b => b.updatedAt).filter(Boolean).sort().slice(-1)[0] ?? null,
      hostexBookings: bookings.filter(b => b.sourceId === 'hostex').length,
      hostexUnits: Array.from(
        new Set(bookings.map(b => b.propertyId).filter((p): p is string => !!p)),
      ),

      leadsBySource,
      earliestLead: leads.map(l => l.createdAt).sort()[0] ?? null,
      latestLead: leads.map(l => l.createdAt).sort().slice(-1)[0] ?? null,
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Diagnostics error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
