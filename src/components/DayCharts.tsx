'use client';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  ReferenceArea, usePlotArea,
} from 'recharts';

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

/** Money on an axis, with the sign in front of the symbol rather than after it. */
const moneyTick = (v: number) => {
  const abs = Math.abs(v);
  // A round thousand reads as $6k; only an awkward one needs the decimal
  const s = abs >= 1000
    ? `$${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k`
    : `$${Math.round(abs)}`;
  return v < 0 ? `\u2212${s}` : s;
};

/**
 * Round bounds and ticks for a money axis.
 *
 * Letting the data decide gave axes labelled $7.5k, $4.0k, $0.5k, \u2212$3.0k \u2014 six
 * numbers with nothing in common, which is most of why a chart reads as noise.
 * This picks a round step near a sixth of the span and hangs the ticks off
 * multiples of it, leaving the bounds where the data actually is so the plot is
 * not padded out with empty space.
 */
function moneyScale(lo: number, hi: number): { min: number; max: number; ticks: number[] } {
  const span = Math.max(hi - lo, 1);
  const rough = span / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10]
    .map(m => m * mag)
    .reduce((best, s) => (Math.abs(s - rough) < Math.abs(best - rough) ? s : best));
  // Breathing room above for the target label, a little below for the floor
  const min = lo - span * 0.04;
  const max = hi + span * 0.1;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return { min, max, ticks };
}

const COLORS = {
  earned: '#10b981',
  upcoming: '#cbd5e1',
};

/** Pixel width of one day's slot. The category gap is 0, so slots tile the plot area. */
const slotWidth = (plotWidth: number, dayCount: number) => plotWidth / dayCount;

/** A day on a month-progress chart: the running total so far. */
export type ProgressPoint = {
  day: string;
  /** Cumulative revenue up to and including this day, while it has happened. */
  earned: number | null;
  /** The same running total carried on through what is already booked ahead. */
  booked: number | null;
  /** This day's own movement, for the tooltip. */
  today: number;
  /** Cumulative gross revenue to this day, for the tooltip. It is deliberately
   *  not plotted: as a second line it doubled the height of the axis to show a
   *  figure that belongs to the layer above this one. Null on the gross chart,
   *  where it would repeat the number beside it. */
  gross?: number | null;
  isFuture: boolean;
};


function RunningTooltip({
  active, payload, monthLabel, fmt, target,
}: {
  active?: boolean;
  payload?: { payload: ProgressPoint }[];
  monthLabel?: string;
  fmt?: (n: number) => string;
  target?: number | null;
}) {
  if (!active || !payload?.length || !fmt) return null;
  const d = payload[0].payload;
  const total = d.earned ?? d.booked ?? 0;
  const gap = target != null ? target - total : null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm min-w-[200px]">
      <p className="font-semibold text-slate-800 mb-2">{monthLabel} {d.day}</p>
      {d.gross != null && (
        <div className="flex justify-between gap-6">
          <span className="text-slate-500">Revenue in</span>
          <span className="font-medium text-slate-500">{fmt(d.gross)}</span>
        </div>
      )}
      <div className="flex justify-between gap-6">
        <span className="text-slate-500">{d.isFuture ? 'On the books' : 'So far'}</span>
        <span className="font-semibold">{fmt(total)}</span>
      </div>
      {/* The distance between the two lines, which is the whole point of
          drawing the second one */}
      {d.gross != null && (
        <p className="text-xs text-slate-400 mt-1">{fmt(d.gross - total)} taken out by this day</p>
      )}
      {d.today > 0 && (
        <p className="text-xs text-slate-400 mt-1">{fmt(d.today)} checked in this day</p>
      )}
      {gap != null && (
        <div className="flex justify-between gap-6 border-t border-slate-100 mt-2 pt-2">
          <span className="text-slate-500">{gap > 0 ? 'Still needed' : 'Over target'}</span>
          <span className={`font-medium ${gap > 0 ? 'text-slate-600' : 'text-emerald-600'}`}>
            {gap > 0 ? fmt(gap) : `+${fmt(-gap)}`}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * A month as one running total against the month's target.
 *
 * Money arrives in lumps on check-in days, so a bar per day was a row of spikes
 * and gaps that answered nothing about the month. The question each section asks
 * is whether the month gets to its number, and that is a running total: solid
 * while it has been earned, dashed onward through what is already booked,
 * against a flat line at the target. Where the dashed line ends is where the
 * month lands if nothing else sells.
 *
 * All four layers of the money are the same chart on different money, so they
 * share this one. What separates them here is the depth they start at: a
 * cash-flow month opens below a mortgage and a month of operating costs, where
 * a net-revenue month barely opens below zero at all.
 *
 * What those costs were belongs to the composition bar under the chart, not on
 * top of it. An earlier version striped the hole into a labelled band per cost
 * and drew gross revenue as a second line; between those, the target and
 * breakeven it carried five annotations, three of them on the same right edge.
 */
export function MonthProgressChart({
  points, monthLabel, fmt, target, color = COLORS.earned, breakeven = false, committed = 0,
}: {
  points: ProgressPoint[];
  monthLabel: string;
  fmt: (n: number) => string;
  /** What the month is held to, or null when nothing is set. */
  target?: number | null;
  color?: string;
  /** Mark zero as breakeven — meaningful for net income, not for revenue. */
  breakeven?: boolean;
  /** What the month owed before it sold a night: the depth the line opens at. */
  committed?: number;
}) {
  const endsAt = points.length ? points[points.length - 1].booked ?? 0 : 0;
  const hasTarget = target != null;

  // The axis is read off the lines, the target and the floor of the costs —
  // never off the gross series, which is carried for the tooltip only and would
  // otherwise stretch the scale to twice what the chart is about.
  const levels = points.flatMap(p => [p.earned, p.booked]).filter((v): v is number => v != null);
  const scale = moneyScale(
    Math.min(0, target ?? 0, -committed, ...levels),
    Math.max(0, target ?? 0, ...levels),
  );

  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={points}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} interval={1} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={moneyTick}
            // Zero and the target are always in view, so a loss is read against
            // breakeven and a short month still shows what it was short of
            domain={[scale.min, scale.max]}
            ticks={scale.ticks}
          />
          <Tooltip content={<RunningTooltip monthLabel={monthLabel} fmt={fmt} target={target} />} />
          {/* Declared before everything else so the lines and the zero rule
              paint over the stripes rather than under them */}
          {/* The hole the month starts in. One block, not a stripe per cost:
              divided, it needed a label on each division to mean anything, and
              those labels plus the target's all landed on the same right edge.
              Which cost is which belongs to the bar under the chart. */}
          {committed > 0 && (
            <ReferenceArea
              y1={-committed} y2={0}
              fill="#64748b" fillOpacity={0.09}
              stroke="#94a3b8" strokeOpacity={0.35} strokeWidth={1}
              ifOverflow="hidden"
            />
          )}
          {breakeven && (
            <ReferenceLine
              y={0} stroke="#94a3b8" strokeWidth={1}
              label={{ value: 'breakeven', position: 'insideTopLeft', fontSize: 10, fill: '#94a3b8' }}
            />
          )}
          {hasTarget && (
            <ReferenceLine
              y={target} stroke="#475569" strokeWidth={1.5} strokeDasharray="6 3"
              label={{ value: `${fmt(target)} target`, position: 'insideTopRight', fontSize: 10, fill: '#475569' }}
            />
          )}
          {/* Steps, not a curve: the total holds flat and jumps on a check-in day,
              which is when the money actually arrives. A smoothed line would show
              it trickling in on days nothing was sold.

              Animation off, as on the occupancy chart: the period toggle swaps
              these in and out, and redrawing the line each time is noise. */}
          <Line
            dataKey="earned" type="stepAfter" stroke={color} strokeWidth={2.5}
            dot={false} connectNulls={false} isAnimationActive={false}
          />
          <Line
            dataKey="booked" type="stepAfter" stroke={color} strokeWidth={2}
            strokeDasharray="5 4" strokeOpacity={0.55} dot={false} connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded" style={{ background: color }} />
          Earned so far
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded opacity-60" style={{ background: color }} />
          Already booked
        </span>
        {committed > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-200" />
            {fmt(committed)} committed before a night sold
          </span>
        )}
        <span className="text-slate-500 font-medium">
          {!hasTarget ? `Lands at ${fmt(endsAt)} on what is booked`
            : endsAt >= target ? `Lands at ${fmt(endsAt)} — ${fmt(endsAt - target)} over target`
            : `Lands at ${fmt(endsAt)} — ${fmt(target - endsAt)} short unless more sells`}
        </span>
      </div>
    </>
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
