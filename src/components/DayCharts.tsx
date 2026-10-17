'use client';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell, usePlotArea,
} from 'recharts';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** One calendar day of the month view: what was earned, and whether it was booked. */
export type DayDatum = {
  day: string;
  /** Gross income of the stays that checked in on this day. */
  revenue: number;
  occupied: boolean;
  /** What this night sold for: the stay's gross spread evenly over its nights. */
  rate: number;
  /** Which night of the stay this is, and how long the stay is. */
  stayNight: number;
  stayNights: number;
  guest: string;
  isFuture: boolean;
};

const nightsLabel = (n: number) => `${n} night${n === 1 ? '' : 's'}`;

const COLORS = {
  earned: '#10b981',
  upcoming: '#cbd5e1',
};

/** Pixel width of one day's slot. The category gap is 0, so slots tile the plot area. */
const slotWidth = (plotWidth: number, dayCount: number) => plotWidth / dayCount;

/**
 * A month's progress towards its plan, as a ring.
 *
 * The ring is the distance the month has to travel: from where it opened —
 * zero for gross revenue, below zero at its committed costs for the layers
 * that carry them — to the figure it is held to. It fills with what has been
 * earned, then with what is booked but not yet earned, and whatever is left is
 * what still has to sell.
 *
 * That one rule reads as plain percent-of-plan for gross revenue, where the
 * month opens at zero, and still means something for cash flow, where both the
 * opening position and the plan can be losses and a share-of-plan ring would be
 * nonsense.
 */
export function MonthGoalDonut({
  monthLabel, fmt, color, start, goal, earned, booked,
}: {
  monthLabel: string;
  fmt: (n: number) => string;
  color: string;
  /** Where the month opened: zero, or minus what it had already committed. */
  start: number;
  /** What the month is held to, or null when nothing is set. */
  goal: number | null;
  /** The figure as it stands today. */
  earned: number;
  /** Where it lands if nothing else sells. */
  booked: number;
}) {
  const hasGoal = goal != null && goal > start;
  // With no plan the ring is simply everything on the books, so the split
  // between earned and booked is still drawn rather than showing nothing
  const distance = hasGoal ? goal - start : Math.max(booked - start, 1);
  const travelled = Math.max(booked - start, 0);

  // A ring scaled to the plan saturates the moment the month passes it, and a
  // month 50% past its number lost the earned-against-booked split exactly when
  // it was most worth seeing. So the ring grows to hold the overshoot and a tick
  // marks where the plan sat.
  const ring = Math.max(distance, travelled);
  const earnedArc = clamp(earned - start, 0, ring);
  const bookedArc = clamp(booked - earned, 0, ring - earnedArc);
  const remainder = Math.max(ring - earnedArc - bookedArc, 0);

  const segments = [
    { key: 'earned', value: earnedArc, fill: color },
    { key: 'booked', value: bookedArc, fill: `${color}59` },
    { key: 'rest', value: remainder, fill: '#f1f5f9' },
  ].filter(s => s.value > 0);

  const pct = hasGoal ? (travelled / distance) * 100 : null;
  const toGoal = hasGoal ? goal - booked : null;
  const over = toGoal != null && toGoal <= 0;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 py-2">
      <div className="relative shrink-0" style={{ width: 208, height: 208 }}>
        <PieChart width={208} height={208}>
          <Pie
            data={segments}
            dataKey="value"
            cx="50%" cy="50%"
            innerRadius={72} outerRadius={100}
            // Twelve o'clock, clockwise — the way a dial is read
            startAngle={90} endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {segments.map(s => <Cell key={s.key} fill={s.fill} />)}
          </Pie>
        </PieChart>
        {/* Where the plan sat, once the ring has outgrown it. The wrapper spans
            the chart and turns about its centre, so the tick lands on the band
            between the inner and outer radius. */}
        {over && ring > distance && (
          <span
            className="absolute inset-0 pointer-events-none"
            style={{ transform: `rotate(${(distance / ring) * 360}deg)` }}
            aria-hidden
          >
            <span
              className="absolute left-1/2 -translate-x-1/2 w-0.5 rounded-full"
              style={{ top: 4, height: 28, background: '#0f172a99' }}
            />
          </span>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className={`text-3xl font-bold leading-none ${pct == null ? 'text-slate-400' : 'text-slate-900'}`}>
            {pct == null ? '—' : `${Math.round(pct)}%`}
          </p>
          <p className="text-[11px] text-slate-400 mt-1.5">
            {pct == null ? 'no plan set' : 'of plan'}
          </p>
        </div>
      </div>

      {/* The column adds up: opening position, what has been earned against it,
          what is still only booked — and the last line is the sum. */}
      <dl className="w-full sm:w-auto sm:min-w-[260px] space-y-2.5">
        {start !== 0 && (
          <Figure label="Opened at" value={fmt(start)} muted />
        )}
        <Figure color={color} label="Earned so far" value={fmt(earned - start)} />
        <Figure color={`${color}59`} label="On the books" value={fmt(booked - earned)} />
        {hasGoal && (
          <Figure
            color={over ? undefined : '#e2e8f0'}
            label={over ? 'Over plan' : 'Still to sell'}
            value={over ? `+${fmt(-toGoal!)}` : fmt(toGoal!)}
            tone={over ? 'text-emerald-600' : undefined}
          />
        )}
        <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
          {monthLabel} lands at <span className="text-slate-600 font-medium">{fmt(booked)}</span>
          {hasGoal && (over
            ? `, past its ${fmt(goal!)} plan`
            : ` — ${fmt(toGoal!)} short of ${fmt(goal!)}`)}
        </p>
      </dl>
    </div>
  );
}

function Figure({
  color, label, value, tone, muted,
}: {
  color?: string; label: string; value: string; tone?: string; muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={color ? { background: color } : undefined} />
      <dt className={`text-xs flex-1 ${muted ? 'text-slate-400' : 'text-slate-500'}`}>{label}</dt>
      <dd className={`text-sm font-semibold ${tone ?? (muted ? 'text-slate-400' : 'text-slate-800')}`}>{value}</dd>
    </div>
  );
}

function NightTooltip({
  active, payload, monthLabel, fmt,
}: {
  active?: boolean;
  payload?: { payload: DayDatum }[];
  monthLabel?: string;
  fmt?: (n: number) => string;
}) {
  if (!active || !payload?.length || !fmt) return null;
  const d = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm min-w-[180px]">
      <p className="font-semibold text-slate-800 mb-1.5">{monthLabel} {d.day}</p>
      {d.occupied ? (
        <>
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">Rate</span>
            <span className="font-medium">{fmt(d.rate)}/night</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Night {d.stayNight} of {nightsLabel(d.stayNights)}
          </p>
        </>
      ) : (
        <p className="text-slate-500">{d.isFuture ? 'Open' : 'Not booked'}</p>
      )}
      {d.guest && <p className="text-xs text-slate-400 mt-1 truncate">{d.guest}</p>}
    </div>
  );
}

/**
 * One night's bar, positioned off the plot area rather than off the width
 * Recharts rounds for it: adjacent nights then tile exactly, and the nights of a
 * stay — which all carry the same rate — read as one block instead of a row of
 * bars separated by hairline seams.
 */
function NightBar(props: {
  x?: number; y?: number; width?: number; height?: number;
  index?: number; dayCount?: number;
  payload?: DayDatum;
}) {
  const { y = 0, width = 0, height = 0, index, dayCount, payload } = props;
  const plot = usePlotArea();
  if (!payload || !payload.occupied) return null;
  const slot = plot && dayCount ? slotWidth(plot.width, dayCount) : width;
  const x = plot && index != null ? plot.x + index * slot : props.x ?? 0;

  return (
    // A pixel of overlap so the antialiased edges of neighbouring nights merge
    // instead of leaving a seam down the middle of a stay
    <rect
      x={x}
      y={y}
      width={slot + 1}
      height={Math.max(0, height)}
      fill={payload.isFuture ? COLORS.upcoming : COLORS.earned}
    />
  );
}

/**
 * Occupancy for a single month, one bar per night.
 *
 * A month of daily occupancy percentages would only ever be 0 or 100, so the
 * daily view shows which nights sold and what they sold for instead: the bar's
 * height is the night's rate — the stay's gross spread over its nights — and a
 * gap is an open night. With no category gap, the nights of one stay share a
 * rate and merge into a single block.
 */
export function DayOccupancyChart({
  data, monthLabel, fmt, adrTarget,
}: {
  data: DayDatum[];
  monthLabel: string;
  fmt: (n: number) => string;
  /** The nightly rate the month is being held to, if one is set. */
  adrTarget?: number | null;
}) {
  const booked = data.filter(d => d.occupied).length;
  const occupancyPct = data.length ? (booked / data.length) * 100 : 0;

  return (
    <>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} barCategoryGap={0}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} interval={1} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} width={55} />
          <Tooltip
            cursor={{ fill: '#0f172a0a' }}
            content={<NightTooltip monthLabel={monthLabel} fmt={fmt} />}
          />
          {adrTarget != null && (
            <ReferenceLine
              y={adrTarget}
              stroke="#475569"
              strokeWidth={2}
              strokeDasharray="6 3"
              label={{ value: `${fmt(adrTarget)} target rate`, position: 'insideTopRight', fontSize: 10, fill: '#475569' }}
            />
          )}
          <Bar dataKey="rate" shape={<NightBar dayCount={data.length} />} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-400">
        <span className="text-slate-500 font-medium">
          {booked} of {nightsLabel(data.length)} booked · {occupancyPct.toFixed(0)}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.earned }} />
          Sold
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.upcoming }} />
          Upcoming
        </span>
      </div>
    </>
  );
}
