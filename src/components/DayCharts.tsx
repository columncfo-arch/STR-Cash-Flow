'use client';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  usePlotArea,
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

const COLORS = {
  earned: '#10b981',
  upcoming: '#cbd5e1',
};

/** Pixel width of one day's slot. The category gap is 0, so slots tile the plot area. */
const slotWidth = (plotWidth: number, dayCount: number) => plotWidth / dayCount;

/** A day on the cumulative revenue chart. */
type RunningDatum = {
  day: string;
  /** Cumulative revenue up to and including this day, while it has happened. */
  earned: number | null;
  /** The same running total carried on through what is already booked ahead. */
  booked: number | null;
  /** This day's own takings, for the tooltip. */
  today: number;
  isFuture: boolean;
};

/**
 * Each day's cumulative revenue, split into the part already earned and the part
 * still only booked. The changeover day belongs to both series so the solid line
 * hands over to the dashed one without a break.
 */
function runningTotals(data: DayDatum[]): RunningDatum[] {
  const lastActual = data.reduce((acc, d, i) => (d.isFuture ? acc : i), -1);
  let running = 0;
  return data.map((d, i) => {
    running += d.revenue;
    return {
      day: d.day,
      earned: i <= lastActual ? running : null,
      booked: i >= lastActual ? running : null,
      today: d.revenue,
      isFuture: d.isFuture,
    };
  });
}

function RunningTooltip({
  active, payload, monthLabel, fmt, target,
}: {
  active?: boolean;
  payload?: { payload: RunningDatum }[];
  monthLabel?: string;
  fmt?: (n: number) => string;
  target?: number | null;
}) {
  if (!active || !payload?.length || !fmt) return null;
  const d = payload[0].payload;
  const total = d.earned ?? d.booked ?? 0;
  const gap = target != null && target > 0 ? target - total : null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm min-w-[200px]">
      <p className="font-semibold text-slate-800 mb-2">{monthLabel} {d.day}</p>
      <div className="flex justify-between gap-6">
        <span className="text-slate-500">{d.isFuture ? 'On the books' : 'Earned'}</span>
        <span className="font-semibold">{fmt(total)}</span>
      </div>
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
 * The month's revenue as one climbing total against the month's target.
 *
 * Revenue arrives in lumps on check-in days, so a bar per day was a row of
 * spikes and gaps that answered nothing about the month. The question the
 * section asks is whether the month gets to its number, and that is a running
 * total: solid while it has been earned, dashed onward through what is already
 * booked, against a flat line at the target. Where the dashed line ends is
 * where the month lands if nothing else sells.
 *
 * Which nights actually sold is the Occupancy section's night-by-night chart —
 * this one is about the money.
 */
export function DayRevenueChart({
  data, monthLabel, fmt, target,
}: {
  data: DayDatum[];
  monthLabel: string;
  fmt: (n: number) => string;
  /** The month's gross revenue target, if one is set. */
  target?: number | null;
}) {
  const series = runningTotals(data);
  const endsAt = series.length ? series[series.length - 1].booked ?? 0 : 0;
  const hasTarget = target != null && target > 0;

  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={series}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} interval={1} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={v => `$${(v / 1000).toFixed(1)}k`}
            // Keep the target line on screen even when the month falls well short
            domain={[0, (max: number) => Math.max(max, hasTarget ? target : 0) * 1.08]}
          />
          <Tooltip
            content={<RunningTooltip monthLabel={monthLabel} fmt={fmt} target={target} />}
          />
          {hasTarget && (
            <ReferenceLine
              y={target}
              stroke="#475569"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              label={{ value: `${fmt(target)} target`, position: 'insideTopRight', fontSize: 10, fill: '#475569' }}
            />
          )}
          {/* Steps, not a curve: the total holds flat and jumps on a check-in day,
              which is when the money actually arrives. A smoothed line would show
              revenue trickling in on days nothing was sold.

              Animation off, as on the occupancy chart: the period toggle swaps
              these in and out, and redrawing the line each time is noise. */}
          <Line
            dataKey="earned" type="stepAfter" stroke={COLORS.earned} strokeWidth={2.5}
            dot={false} connectNulls={false} isAnimationActive={false}
          />
          <Line
            dataKey="booked" type="stepAfter" stroke={COLORS.earned} strokeWidth={2}
            strokeDasharray="5 4" strokeOpacity={0.55} dot={false} connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded" style={{ background: COLORS.earned }} />
          Earned so far
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded opacity-60" style={{ background: COLORS.earned }} />
          Already booked
        </span>
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
