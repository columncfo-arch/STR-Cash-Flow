import { NextResponse } from 'next/server';
import { requireAuth, unauthorized, AuthError } from '@/lib/auth';
import { loadBookings, loadLeads, loadExpenses, storageBackend } from '@/lib/storage';

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
    const userId = await requireAuth();
    const [bookings, leads, expenses] = await Promise.all([
      loadBookings(userId),
      loadLeads(userId),
      loadExpenses(userId),
    ]);

    const leadsBySource = leads.reduce<Record<string, number>>((acc, l) => {
      const k = l.source ?? 'unknown';
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

    const defaultHostUserId = process.env.DEFAULT_HOST_USER_ID ?? null;

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
      },

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
