import { describe, expect, it } from 'vitest';
import { coveredSpan, isCancelled, pruneCancelled, type StoredStay } from '@/lib/hostexSync';

/** A stay the sync wrote, in the books. */
const synced = (over: Partial<StoredStay> = {}): StoredStay => ({
  sourceId: 'hostex', confirmationCode: 'HM4K2P', checkIn: '2026-11-12', ...over,
});

const span = { from: '2026-01-04', to: '2027-02-20' };
const live = new Set(['HM4K2P', 'HMXT91']);

describe('the dates a fetch accounted for', () => {
  it('runs from the first check-in to the last', () =>
    expect(coveredSpan(['2026-06-01', '2026-01-04', '2027-02-20'])).toEqual(span));

  it('ignores reservations with no check-in', () =>
    expect(coveredSpan([undefined, '2026-06-01', '', '2026-08-01']))
      .toEqual({ from: '2026-06-01', to: '2026-08-01' }));

  it('is a single day for a single reservation', () =>
    expect(coveredSpan(['2026-06-01'])).toEqual({ from: '2026-06-01', to: '2026-06-01' }));

  // Nothing to go on means nothing gets deleted, which is the only safe
  // reading of a fetch that returned nothing
  it('is nothing at all for an empty account', () => expect(coveredSpan([])).toBeNull());
  it('is nothing at all where no reservation carries a date', () =>
    expect(coveredSpan([undefined, ''])).toBeNull());
});

describe('a stay Hostex no longer reports', () => {
  it('is cancelled when its code is gone from inside the covered span', () =>
    expect(isCancelled(synced({ confirmationCode: 'GONE42' }), live, span)).toBe(true));

  it('is kept while its code is still live', () =>
    expect(isCancelled(synced(), live, span)).toBe(false));

  // The whole point of the pruning: it is absence from the live set, not a
  // cancelled flag, that marks a stay cancelled after the fact
  it('needs no cancellation flag of its own to be recognised', () => {
    const stay = synced({ confirmationCode: 'GONE42' });
    expect('status' in stay).toBe(false);
    expect(isCancelled(stay, live, span)).toBe(true);
  });
});

describe('what the pruning refuses to delete', () => {
  it('leaves a hand-entered stay alone', () =>
    expect(isCancelled(synced({ sourceId: undefined, confirmationCode: 'GONE42' }), live, span))
      .toBe(false));

  it('leaves a stay imported from a CSV alone', () =>
    expect(isCancelled(synced({ sourceId: 'csv', confirmationCode: 'GONE42' }), live, span))
      .toBe(false));

  // Without a code there is no way to ask Hostex about it, and guessing from
  // the dates would delete a real stay whenever a guest rebooked the same week
  it('leaves a stay with no confirmation code alone', () =>
    expect(isCancelled(synced({ confirmationCode: undefined }), live, span)).toBe(false));

  /**
   * The condition that keeps a truncated history safe. Hostex paging stops
   * somewhere; everything before that is unmentioned rather than cancelled, and
   * deleting on silence would quietly erase the years the forecast is built on.
   */
  it('leaves a stay older than anything the fetch returned', () =>
    expect(isCancelled(synced({ confirmationCode: 'GONE42', checkIn: '2024-07-04' }), live, span))
      .toBe(false));

  it('leaves a stay later than anything the fetch returned', () =>
    expect(isCancelled(synced({ confirmationCode: 'GONE42', checkIn: '2028-01-01' }), live, span))
      .toBe(false));

  it('deletes nothing at all when the fetch proved nothing', () =>
    expect(isCancelled(synced({ confirmationCode: 'GONE42' }), live, null)).toBe(false));

  it('takes the ends of the span as covered', () => {
    expect(isCancelled(synced({ confirmationCode: 'GONE42', checkIn: span.from }), live, span))
      .toBe(true);
    expect(isCancelled(synced({ confirmationCode: 'GONE42', checkIn: span.to }), live, span))
      .toBe(true);
  });

  // Compared as strings, so no timezone can pull a date over a boundary
  it('compares dates without parsing them', () =>
    expect(isCancelled(synced({ confirmationCode: 'GONE42', checkIn: '2026-01-03' }), live, span))
      .toBe(false));
});

describe('pruning a set of books', () => {
  const books = [
    synced({ confirmationCode: 'HM4K2P', checkIn: '2026-11-06' }), // live
    synced({ confirmationCode: 'GONE42', checkIn: '2026-11-12' }), // cancelled
    synced({ confirmationCode: 'HMXT91', checkIn: '2026-11-13' }), // live
    synced({ sourceId: 'csv', confirmationCode: 'OLD001', checkIn: '2026-03-02' }), // not ours
    synced({ confirmationCode: 'GONE77', checkIn: '2026-11-25' }), // cancelled
  ];
  const { kept, cancelled } = pruneCancelled(books, live, span);

  it('counts what it removed', () => expect(cancelled).toBe(2));

  it('keeps everything else', () =>
    expect(kept.map(b => b.confirmationCode)).toEqual(['HM4K2P', 'HMXT91', 'OLD001']));

  it('keeps the books in the order it found them', () =>
    expect(kept.map(b => b.checkIn)).toEqual(['2026-11-06', '2026-11-13', '2026-03-02']));

  it('does not touch the list it was given', () => expect(books).toHaveLength(5));

  it('is unchanged by running twice', () => {
    const again = pruneCancelled(kept, live, span);
    expect(again.cancelled).toBe(0);
    expect(again.kept).toEqual(kept);
  });

  it('reports nothing removed from empty books', () =>
    expect(pruneCancelled([], live, span)).toEqual({ kept: [], cancelled: 0 }));

  /**
   * The bug this exists to fix, as it appeared: a week showing four guests in
   * one unit, three of them cancelled rebookings that no sync ever took back
   * out. Afterwards only the live stay is left, and the dates stop overlapping.
   */
  it('clears an overlapping week down to the stay that survived', () => {
    const week = [
      synced({ confirmationCode: 'GONE01', checkIn: '2026-11-09' }),
      synced({ confirmationCode: 'GONE02', checkIn: '2026-11-12' }),
      synced({ confirmationCode: 'HM4K2P', checkIn: '2026-11-13' }),
      synced({ confirmationCode: 'GONE03', checkIn: '2026-11-14' }),
    ];
    const result = pruneCancelled(week, live, span);
    expect(result.cancelled).toBe(3);
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0].confirmationCode).toBe('HM4K2P');
  });
});
