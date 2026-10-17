'use client';

/**
 * How far a figure has got towards its target, as a ring.
 *
 * Four of these sit in a row, so each has to be read at a glance and without a
 * legend: the arc is the share of target met, and its colour is the same ±5%
 * band every status on the dashboard uses. A ring with no target is drawn as a
 * bare track rather than an empty circle, which would read as zero.
 */
export default function PacingRing({
  pct,
  color,
  size = 44,
  label,
}: {
  /** Share of target met. Null when the metric has no target. */
  pct: number | null;
  /** Stroke colour; pass the status colour so ring and verdict always agree. */
  color: string;
  size?: number;
  label?: string;
}) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Over-target arcs stop at a full circle: a ring that wrapped would read as
  // less progress than a ring that merely filled.
  const filled = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - filled / 100);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label={label ?? (pct == null ? 'No target set' : `${Math.round(pct)}% of target`)}
    >
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="#e2e8f0" strokeWidth={stroke}
      />
      {pct != null && (
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          // Start the arc at twelve o'clock rather than three
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text
        x="50%" y="50%"
        textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.26} fontWeight={600}
        fill={pct == null ? '#cbd5e1' : '#334155'}
      >
        {pct == null ? '—' : `${Math.round(pct)}%`}
      </text>
    </svg>
  );
}
