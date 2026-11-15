import { describe, expect, it } from 'vitest';
import { coveredSpan, withinSpan } from '@/lib/span';

const span = { from: '2026-01-04', to: '2027-02-20' };

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

describe('whether a date is one the source looked at', () => {
  it('accepts a date inside the span', () => expect(withinSpan('2026-11-12', span)).toBe(true));
  it('accepts the first date it covered', () => expect(withinSpan(span.from, span)).toBe(true));
  it('accepts the last date it covered', () => expect(withinSpan(span.to, span)).toBe(true));
  it('rejects a date before it', () => expect(withinSpan('2026-01-03', span)).toBe(false));
  it('rejects a date after it', () => expect(withinSpan('2027-02-21', span)).toBe(false));
  it('rejects a missing date', () => expect(withinSpan('', span)).toBe(false));

  // A source that proved nothing licenses no conclusion about anything
  it('rejects everything when nothing was covered', () =>
    expect(withinSpan('2026-11-12', null)).toBe(false));

  // Compared as strings, so no timezone can pull a date over a boundary
  it('compares dates without parsing them', () =>
    expect(withinSpan('2026-01-04', { from: '2026-01-04', to: '2026-01-04' })).toBe(true));
});
