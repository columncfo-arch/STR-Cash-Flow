import { NextResponse } from 'next/server';
import { requireScope, unauthorized, AuthError } from '@/lib/auth';
import { loadBookings } from '@/lib/storage';
import { parseCSV } from '@/lib/csv';
import { mergePayouts, readPayouts, reconcile } from '@/lib/reconcile';
import type { Platform } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reconcile — compare the books against a channel's payout schedule.
 *
 * Reads only. The report says what disagrees and leaves every decision about
 * it to the owner, because the three findings have three different remedies
 * and none of them is safe to guess at: an unpaid stay is usually a
 * cancellation to delete, but it is sometimes a booking taken off-platform; a
 * missing payout is revenue to import, unless it belongs to a unit kept in
 * another account.
 *
 * Several files are accepted and merged, because a channel splits its export
 * between settled and scheduled payouts and either one alone covers only half
 * the calendar. Reservations are deduplicated by confirmation code so a stay
 * appearing in both files is reconciled once.
 */
export async function POST(req: Request) {
  try {
    const { scope } = await requireScope();
    const form = await req.formData();
    const platform = (form.get('platform') as Platform) ?? 'airbnb';

    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    let parsedRows = 0;
    const perFile = await Promise.all(files.map(async file => {
      const rows = parseCSV(await file.text());
      parsedRows += rows.length;
      return readPayouts(rows);
    }));
    const payouts = mergePayouts(perFile);
    if (payouts.length === 0) {
      return NextResponse.json({
        error: parsedRows === 0
          ? 'That file had no rows this could read. Export it as CSV rather than PDF.'
          : 'No reservations found in that export. It needs the transaction history, '
            + 'which lists each reservation — not a summary of payout totals.',
      }, { status: 400 });
    }

    const bookings = await loadBookings(scope);
    const result = reconcile(
      bookings.map(b => ({
        id: b.id,
        platform: b.platform,
        confirmationCode: b.confirmationCode,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        guestName: b.guestName,
        income: b.income,
        nights: b.nights,
        sourceId: b.sourceId,
      })),
      payouts,
      platform,
    );

    return NextResponse.json({ ...result, payoutsRead: payouts.length, files: files.length });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Reconcile error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    );
  }
}
