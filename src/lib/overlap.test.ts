import { describe, expect, it } from 'vitest';
import { classifyClashes, overlapClusters, overlaps } from '@/lib/overlap';

const stay = (checkIn: string, checkOut: string, guest = '') => ({ checkIn, checkOut, guest });

describe('two stays claiming the same nights', () => {
  it('clash when one starts inside the other', () =>
    expect(overlaps(stay('2026-11-09', '2026-11-13'), stay('2026-11-12', '2026-11-15'))).toBe(true));

  it('clash when one sits wholly inside the other', () =>
    expect(overlaps(stay('2026-11-12', '2026-11-15'), stay('2026-11-13', '2026-11-14'))).toBe(true));

  it('clash on identical dates', () =>
    expect(overlaps(stay('2026-11-12', '2026-11-15'), stay('2026-11-12', '2026-11-15'))).toBe(true));

  it('are symmetric', () => {
    const [a, b] = [stay('2026-11-09', '2026-11-13'), stay('2026-11-12', '2026-11-15')];
    expect(overlaps(a, b)).toBe(overlaps(b, a));
  });

  /**
   * The case that decides whether this is useful or noise. Check-out day is not
   * a night stayed, so a guest leaving on the 8th and the next arriving on the
   * 8th is an ordinary turnover. Counting it would flag most of a busy month and
   * bury the real clashes.
   */
  it('do not clash on a same-day turnover', () =>
    expect(overlaps(stay('2026-11-06', '2026-11-07'), stay('2026-11-07', '2026-11-08'))).toBe(false));

  it('do not clash with a gap between them', () =>
    expect(overlaps(stay('2026-11-06', '2026-11-07'), stay('2026-11-19', '2026-11-20'))).toBe(false));
});

describe('finding the pile-ups on a calendar', () => {
  it('reports nothing for a cleanly turned-over month', () => {
    const clean = [
      stay('2026-11-06', '2026-11-07'), stay('2026-11-07', '2026-11-08'),
      stay('2026-11-19', '2026-11-20'), stay('2026-11-22', '2026-11-25'),
      stay('2026-11-25', '2026-11-28'),
    ];
    expect(overlapClusters(clean)).toEqual([]);
  });

  it('reports nothing for an empty calendar', () => expect(overlapClusters([])).toEqual([]));
  it('reports nothing for a single stay', () =>
    expect(overlapClusters([stay('2026-11-06', '2026-11-07')])).toEqual([]));

  /**
   * The month that prompted this, as it appeared on the booking list: four
   * stays over Nov 9–16 and two over Nov 22–28, with clean turnovers either
   * side that must not be swept in.
   */
  it('groups the real month into the two clusters it has', () => {
    const month = [
      stay('2026-11-06', '2026-11-07', 'Alissa'),
      stay('2026-11-07', '2026-11-08', 'Brookes'),
      stay('2026-11-09', '2026-11-13', 'Elias'),
      stay('2026-11-12', '2026-11-15', 'Ira'),
      stay('2026-11-13', '2026-11-14', 'Paula'),
      stay('2026-11-14', '2026-11-16', 'Melissa'),
      stay('2026-11-19', '2026-11-20', 'Michelle'),
      stay('2026-11-22', '2026-11-28', 'Catherine'),
      stay('2026-11-25', '2026-11-28', 'Beth'),
    ];
    const found = overlapClusters(month);
    expect(found).toHaveLength(2);
    expect(found[0].map(s => s.guest)).toEqual(['Elias', 'Ira', 'Paula', 'Melissa']);
    expect(found[1].map(s => s.guest)).toEqual(['Catherine', 'Beth']);
  });

  // A long stay can straddle several short ones that do not touch each other,
  // and following only the previous check-out would break the run in the middle
  it('holds a run together across a straddling stay', () => {
    const found = overlapClusters([
      stay('2026-11-01', '2026-11-20', 'long'),
      stay('2026-11-03', '2026-11-04', 'first'),
      stay('2026-11-17', '2026-11-18', 'last'),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].map(s => s.guest)).toEqual(['long', 'first', 'last']);
  });

  it('keeps separate pile-ups separate', () => {
    const found = overlapClusters([
      stay('2026-11-01', '2026-11-05'), stay('2026-11-02', '2026-11-06'),
      stay('2026-12-01', '2026-12-05'), stay('2026-12-02', '2026-12-06'),
    ]);
    expect(found).toHaveLength(2);
  });

  it('returns each cluster in date order whatever order it was given', () => {
    const found = overlapClusters([
      stay('2026-11-13', '2026-11-14', 'third'),
      stay('2026-11-09', '2026-11-13', 'first'),
      stay('2026-11-12', '2026-11-15', 'second'),
    ]);
    expect(found[0].map(s => s.guest)).toEqual(['first', 'second', 'third']);
  });

  describe('stays it cannot place on a calendar', () => {
    it('skips one with no check-out', () =>
      expect(overlapClusters([stay('2026-11-09', ''), stay('2026-11-10', '2026-11-12')])).toEqual([]));

    it('skips one with no check-in', () =>
      expect(overlapClusters([stay('', '2026-11-13'), stay('2026-11-10', '2026-11-12')])).toEqual([]));

    it('skips one that ends before it starts', () =>
      expect(overlapClusters([
        stay('2026-11-14', '2026-11-10'), stay('2026-11-11', '2026-11-13'),
      ])).toEqual([]));

    it('skips a stay of no nights at all', () =>
      expect(overlapClusters([
        stay('2026-11-12', '2026-11-12'), stay('2026-11-11', '2026-11-13'),
      ])).toEqual([]));
  });
});

/**
 * Telling a stale cancellation from a real double booking.
 *
 * An owner whose channels run through one manager only ever has the first kind.
 * An owner running Airbnb through one system and VRBO through another, with no
 * shared calendar between them, has both — and they call for opposite
 * responses, so collapsing them into one warning helps nobody.
 */
describe('which clashes are real', () => {
  const stay = (platform: string, checkIn: string, checkOut: string, id = '') =>
    ({ platform, checkIn, checkOut, id });

  it('calls a clash within one channel a stale record', () => {
    const r = classifyClashes([
      stay('airbnb', '2026-11-09', '2026-11-13', 'elias'),
      stay('airbnb', '2026-11-12', '2026-11-15', 'ira'),
    ]);
    expect(r.sameChannel.map(s => s.id).sort()).toEqual(['elias', 'ira']);
    expect(r.crossChannel).toEqual([]);
  });

  it('calls a clash across two channels a double booking', () => {
    const r = classifyClashes([
      stay('airbnb', '2026-11-09', '2026-11-13', 'elias'),
      stay('vrbo', '2026-11-12', '2026-11-15', 'real-guest'),
    ]);
    expect(r.crossChannel.map(s => s.id).sort()).toEqual(['elias', 'real-guest']);
    expect(r.sameChannel).toEqual([]);
  });

  it('leaves a cleanly turned-over calendar alone whatever the channels', () =>
    expect(classifyClashes([
      stay('airbnb', '2026-11-06', '2026-11-07'),
      stay('vrbo', '2026-11-07', '2026-11-08'),
    ])).toEqual({ sameChannel: [], crossChannel: [] }));

  /**
   * The reason this is judged pair by pair. A long stay chains the two short
   * ones into one run, but those two never touch each other — so asking only
   * whether the run holds two channels would report a double booking between
   * stays that do not collide.
   */
  it('does not invent a clash between two stays that never touch', () => {
    const r = classifyClashes([
      stay('airbnb', '2026-11-01', '2026-11-20', 'long'),
      stay('airbnb', '2026-11-03', '2026-11-04', 'early'),
      stay('vrbo', '2026-11-17', '2026-11-18', 'late'),
    ]);
    // long collides with both; early and late never meet
    expect(r.crossChannel.map(s => s.id).sort()).toEqual(['late', 'long']);
    expect(r.sameChannel.map(s => s.id)).toEqual(['early']);
  });

  // The urgent reading wins: a stay that is both is one to look at first
  it('reports a stay clashing both ways as the double booking', () => {
    const r = classifyClashes([
      stay('airbnb', '2026-11-10', '2026-11-16', 'middle'),
      stay('airbnb', '2026-11-11', '2026-11-12', 'ghost'),
      stay('vrbo', '2026-11-14', '2026-11-15', 'guest'),
    ]);
    expect(r.crossChannel.map(s => s.id).sort()).toEqual(['guest', 'middle']);
    expect(r.sameChannel.map(s => s.id)).toEqual(['ghost']);
  });

  it('reports nothing for an empty calendar', () =>
    expect(classifyClashes([])).toEqual({ sameChannel: [], crossChannel: [] }));
});
