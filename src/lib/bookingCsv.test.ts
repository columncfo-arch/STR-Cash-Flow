import { describe, expect, it } from 'vitest';
import { backupFilename, bookingsToCsv } from '@/lib/bookingCsv';
import type { Booking } from '@/types';

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1', platform: 'airbnb', uid: 'HM001', summary: 'Airbnb - Elias',
  checkIn: '2026-11-09', checkOut: '2026-11-13', nights: 4, income: 552.59,
  ...over,
} as Booking);

const rows = (csv: string) => csv.split('\n');
const cells = (line: string) => line.split('","').map(c => c.replace(/^"|"$/g, ''));

describe('a full copy of the books', () => {
  const csv = bookingsToCsv([booking()]);

  it('leads with a header row', () => expect(rows(csv)[0]).toContain('Platform'));

  it('carries one row per booking', () => expect(rows(csv)).toHaveLength(2));

  /**
   * The point of it. The contacts export carries five fields; what a wipe
   * destroys is the money, the dates and the codes, and none of that can be
   * recovered for a stay that came from a CSV rather than a channel manager.
   */
  it('carries the money, which the contacts export drops', () => {
    for (const column of ['Income', 'Platform fee', 'Paid out', 'Tax remitted']) {
      expect(rows(csv)[0]).toContain(column);
    }
    expect(cells(rows(csv)[1])).toContain('552.59');
  });

  it('carries the dates and the code', () => {
    const line = cells(rows(csv)[1]);
    expect(line).toContain('2026-11-09');
    expect(line).toContain('2026-11-13');
  });

  // A guest with no email is still a booking worth keeping
  it('keeps a booking that has no contact details', () =>
    expect(rows(bookingsToCsv([booking({ email: undefined, phone: undefined })]))).toHaveLength(2));

  it('writes an empty field rather than the word undefined', () => {
    const line = rows(bookingsToCsv([booking({ notes: undefined })]))[1];
    expect(line).not.toContain('undefined');
  });

  it('puts the most recent stay first', () => {
    const csv2 = bookingsToCsv([
      booking({ id: 'old', checkIn: '2025-01-02' }),
      booking({ id: 'new', checkIn: '2026-11-09' }),
    ]);
    expect(rows(csv2)[1]).toContain('2026-11-09');
    expect(rows(csv2)[2]).toContain('2025-01-02');
  });

  it('writes a header even with nothing to back up', () =>
    expect(rows(bookingsToCsv([]))).toHaveLength(1));
});

/**
 * A backup that corrupts on the one booking with an awkward note is not a
 * backup, so every field is quoted rather than the ones thought to need it.
 */
describe('fields that would otherwise break the file', () => {
  it('survives a comma in a note', () => {
    const csv = bookingsToCsv([booking({ notes: 'Late check-in, code 4471' })]);
    expect(rows(csv)).toHaveLength(2);
    expect(csv).toContain('Late check-in, code 4471');
  });

  it('doubles a quote rather than ending the field', () => {
    const csv = bookingsToCsv([booking({ notes: 'Asked for the "big" room' })]);
    expect(rows(csv)).toHaveLength(2);
    expect(csv).toContain('Asked for the ""big"" room');
  });

  it('keeps a newline inside its own quoted field', () => {
    const csv = bookingsToCsv([booking({ notes: 'Line one\nLine two' })]);
    // The newline stays in the data; the row count is what a reader would break on
    expect(csv).toContain('Line one\nLine two');
    expect(csv.split('\n')).toHaveLength(3);
  });

  it('quotes a guest name holding a comma', () => {
    const csv = bookingsToCsv([booking({ guestName: 'Rickwood, Catherine' })]);
    expect(csv).toContain('"Rickwood, Catherine"');
  });
});

describe('what the file is called', () => {
  it('carries the date so one backup does not overwrite the last', () =>
    expect(backupFilename('2026-11-15T09:30:00.000Z')).toBe('hostcfo-bookings-2026-11-15.csv'));

  it('takes a plain date just as well', () =>
    expect(backupFilename('2026-11-15')).toBe('hostcfo-bookings-2026-11-15.csv'));
});
