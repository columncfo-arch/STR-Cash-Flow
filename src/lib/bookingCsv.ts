// A complete copy of the books, as a file.
//
// Clearing the bookings cannot be undone, and for anything that did not come
// from a channel manager there is nothing to re-sync from: a stay imported from
// a VRBO or Booking.com export exists here and nowhere else, as does every note
// and phone number typed in by hand. The contacts export does not stand in for
// this — it carries five fields and only for guests who left contact details.
//
// So this writes every field that would be lost, for every booking, not the
// filtered view: a backup of what is on screen is not a backup.

import type { Booking } from '@/types';

/** Column header → how to read it off a booking. */
const COLUMNS: [string, (b: Booking) => string | number | undefined][] = [
  ['Platform', b => b.platform],
  ['Guest', b => b.guestName ?? b.bookerName],
  ['Check-in', b => b.checkIn],
  ['Check-out', b => b.checkOut],
  ['Nights', b => b.nights],
  ['Income', b => b.income],
  ['Platform fee', b => b.platformFee],
  ['Fast pay fee', b => b.fastPayFee],
  ['Paid out', b => b.paidOut],
  ['Cleaning fee', b => b.cleaningFee],
  ['Pet fee', b => b.petFee],
  ['Tax remitted', b => b.taxRemitted],
  ['Tax withheld', b => b.taxWithheld],
  ['Lodging tax owner remits', b => b.lodgingTaxOwnerRemits],
  ['Currency', b => b.currency],
  ['Confirmation code', b => b.confirmationCode],
  ['Status', b => b.status],
  ['Booking date', b => b.bookingDate],
  ['Email', b => b.email],
  ['Phone', b => b.phone],
  ['Adults', b => b.adults],
  ['Children', b => b.children],
  ['Guests', b => b.people],
  ['Notes', b => b.notes],
  ['Source', b => b.sourceId],
  ['Hostex unit', b => b.propertyId],
  ['Listing', b => b.unitId],
  ['Created', b => b.createdAt],
  ['Updated', b => b.updatedAt],
  ['Id', b => b.id],
];

/**
 * One CSV field, quoted so nothing in it can break the row.
 *
 * Everything is quoted rather than only the fields that need it. A guest note
 * holding a comma, a quote or a newline is ordinary, and a rule applied to
 * every field cannot be applied inconsistently to the one that mattered.
 */
function field(value: string | number | undefined): string {
  if (value == null) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** Every booking, every field, newest stay first. */
export function bookingsToCsv(bookings: readonly Booking[]): string {
  const rows = [...bookings]
    .sort((a, b) => (b.checkIn ?? '').localeCompare(a.checkIn ?? ''))
    .map(b => COLUMNS.map(([, read]) => field(read(b))).join(','));
  return [COLUMNS.map(([name]) => field(name)).join(','), ...rows].join('\n');
}

/** What to call the file, dated so successive backups do not overwrite. */
export function backupFilename(today: string): string {
  return `hostcfo-bookings-${today.slice(0, 10)}.csv`;
}
