import { describe, expect, it } from 'vitest';
import { paceStatus, pacingStatus, planShare } from '@/lib/pacing';

describe('a share of plan, where 100% is exactly on plan', () => {
  // The case this was written for: a month planned to lose money that did not.
  // The rule it replaced produced a share only where the plan was above zero,
  // so it drew nothing at all for the one case where the news was best.
  it('runs over 100% when a planned loss has been beaten', () =>
    expect(planShare(84, -1084)).toBeCloseTo(207.7, 1));

  it('reads exactly 100% on a planned loss met exactly', () =>
    expect(planShare(-1084, -1084)).toBe(100));

  it('reads over 100% for a smaller loss than planned', () =>
    expect(planShare(-385, -1943)).toBeCloseTo(180.2, 1));

  it('falls short for a bigger loss than planned', () =>
    expect(planShare(-1500, -1084)).toBeCloseTo(61.6, 1));

  it('reaches nothing at twice the planned loss', () =>
    expect(planShare(-2168, -1084)).toBeCloseTo(0, 6));

  it('goes negative beyond that, for the ring to clamp', () =>
    expect(planShare(-3000, -1084)).toBeLessThan(0));
});

describe('nothing that already read sensibly moves', () => {
  it('is actual ÷ plan on plan', () => expect(planShare(4536, 4536)).toBe(100));
  it('is actual ÷ plan half way', () => expect(planShare(2268, 4536)).toBe(50));
  it('is actual ÷ plan over plan', () => expect(planShare(6900, 4536)).toBeCloseTo(152.1, 1));

  it('matches the rule it replaced wherever the plan is above zero', () =>
    expect(planShare(6210, 4061)).toBeCloseTo((6210 / 4061) * 100, 6));
});

describe('no plan draws no ring', () => {
  it('returns null for a plan of zero', () => expect(planShare(500, 0)).toBeNull());
  it('returns null for an absent plan', () => expect(planShare(500, null)).toBeNull());
  it('returns null for an undefined plan', () => expect(planShare(500, undefined)).toBeNull());
});

// A ring and the words printed beside it must never land on opposite sides of
// plan, whatever the signs are.
describe('the ring and the verdict beside it agree', () => {
  const cases: [number, number][] = [
    [84, -1084], [-385, -1943], [6900, 4536], [-1500, -1084], [2000, 4536], [-1084, -1084],
  ];

  it.each(cases)('agree for %d of %d', (actual, plan) => {
    const share = planShare(actual, plan)!;
    const verdict = pacingStatus(((actual - plan) / Math.abs(plan)) * 100);
    // The same ±5% band, read off the ring and off the words
    expect(share >= 95).toBe(verdict.label !== 'Behind');
  });
});

describe('the status bands themselves', () => {
  it('calls an absent variance nothing at all', () => expect(pacingStatus(null).label).toBe('—'));
  it('holds the band at 5% short', () => expect(pacingStatus(-5).label).toBe('On Track'));
  it('breaks the band past 5% short', () => expect(pacingStatus(-5.1).label).toBe('Behind'));

  // Banded as displayed rather than raw, so a caption reading 5.0% never sits
  // beside "Behind" because the real figure was 5.04%
  it('bands on the figure as shown, not the figure as held', () =>
    expect(pacingStatus(-5.04).label).toBe('On Track'));

  it('distinguishes clearing the bar from holding it', () => {
    expect(paceStatus(6).label).toBe('Ahead');
    expect(paceStatus(0).label).toBe('On Pace');
    expect(paceStatus(-6).label).toBe('Behind');
  });

  it('short-circuits the bands once the goal is reached', () =>
    expect(pacingStatus(-80, { reached: true, label: 'Target met' }).label).toBe('Target met'));
});
