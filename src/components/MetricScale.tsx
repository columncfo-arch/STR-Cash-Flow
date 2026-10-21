'use client';
import { readScale, type Scale, type Tone } from '@/lib/returns';

const FILL: Record<Tone, string> = {
  weak: '#fda4af',
  fair: '#fcd34d',
  good: '#6ee7b7',
  strong: '#34d399',
};

export const TONE_TEXT: Record<Tone, string> = {
  weak: 'text-red-600',
  fair: 'text-amber-600',
  good: 'text-emerald-600',
  strong: 'text-emerald-700',
};

/**
 * Where a ratio sits in the range it could have been in.
 *
 * A figure on its own asks the reader to already know what good looks like.
 * The bands answer that without a sentence: the marker's position says how the
 * property is doing, and the colour under it says which direction is better —
 * which matters, because on half of these a low number is the good one.
 *
 * Drawn muted on purpose. Six of these at full strength is a row of rainbows
 * competing with the figures they are meant to serve; at half strength the
 * bands still say which end is which while the eye stays on the numbers.
 */
export default function MetricScale({
  value, scale, label,
}: {
  value: number | null;
  scale: Scale;
  /** Named for a screen reader, which cannot see where the marker is. */
  label: string;
}) {
  const read = readScale(value, scale);
  const span = scale.max - scale.min;

  return (
    <div
      className="mt-2"
      role="img"
      aria-label={read ? `${label}: ${read.band.label}` : `${label}: not available`}
    >
      <div className="relative h-1.5 flex rounded-full overflow-hidden bg-slate-100">
        {read && scale.bands.map((band, i) => {
          const from = i === 0 ? scale.min : scale.bands[i - 1].upTo;
          const to = Math.min(band.upTo, scale.max);
          const width = ((to - Math.max(from, scale.min)) / span) * 100;
          return width > 0 ? (
            <span
              key={band.label}
              style={{ width: `${width}%`, background: FILL[band.tone], opacity: 0.55 }}
            />
          ) : null;
        })}
        {read && (
          <span
            className="absolute top-[-2px] w-0.5 h-[10px] rounded-full bg-slate-800"
            style={{ left: `calc(${read.pct}% - 1px)` }}
          />
        )}
      </div>
    </div>
  );
}
