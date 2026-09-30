'use client';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  usePlotArea,
} from 'recharts';

/** One calendar day of the month view: what was earned, and whether it was booked. */
export type DayDatum = {
  day: string;
  /** Gross income of the stays that checked in on this day. */
  revenue: number;
  /** Nights of those stays that fall inside this month — how wide the bar is drawn. */
  spanNights: number;
  occupied: boolean;
  /** Which night of the stay this is, and how long the stay is. */
  stayNight: number;
  stayNights: number;
  guest: string;
  isFuture: boolean;
};

const COLORS = {
  earned: '#10b981',
  upcoming: '#cbd5e1',
  bookedBand: '#ecfdf5',
  bookedRibbon: '#6ee7b7',
};

/** Height of the strip along the axis marking the nights that were booked. */
const RIBBON_H = 3;

/** Pixel width of one day's slot. The category gap is 0, so slots tile the plot area. */
const slotWidth = (plotWidth: number, dayCount: number) => plotWidth / dayCount;

/**
 * The shaded "these nights were booked" backdrop, drawn as one rect per stretch of
 * consecutive booked nights.
 *
 * It is a layer of its own, placed before <Bar>, for two reasons: runs of nights
 * merge into a single rect with no seams, and every band is painted before any
 * revenue block, so a block spanning several days is never overpainted by the
 * band of a later day.
 */
function OccupancyBands({ data }: { data: DayDatum[] }) {
  const plot = usePlotArea();
  if (!plot || data.length === 0) return null;
  const slot = slotWidth(plot.width, data.length);

  const runs: { from: number; to: number }[] = [];
  data.forEach((d, i) => {
    if (!d.occupied) return;
    const last = runs[runs.length - 1];
    if (last && last.to === i) last.to = i + 1;
    else runs.push({ from: i, to: i + 1 });
  });

  return (
    <g>
      {runs.map(run => {
        const x = plot.x + run.from * slot;
        const width = (run.to - run.from) * slot;
        return (
          <g key={run.from}>
            <rect x={x} y={plot.y} width={width} height={plot.height} fill={COLORS.bookedBand} />
            {/* The wash alone is easy to miss behind a tall block, so each run also
                gets a solid strip on the axis — the nights that were sold. */}
            <rect
              x={x}
              y={plot.y + plot.height - RIBBON_H}
              width={width}
              height={RIBBON_H}
              fill={COLORS.bookedRibbon}
            />
          </g>
        );
      })}
    </g>
  );
}

/**
 * A stay is drawn as one block covering the nights it occupies, so a four-night
 * booking reads as four booked nights instead of one spike and three gaps. The
 * block's height is the whole stay's revenue on its check-in day, which is what
 * keeps the chart summing to the Earned figure in the tile above it.
 *
 * Nights carrying no revenue of their own — the later nights of a stay, or one
 * that began last month — are covered by OccupancyBands instead, so they cannot
 * be read as vacancy.
 */
export function DayBar(props: {
  x?: number; y?: number; width?: number; height?: number;
  dayCount?: number;
  payload?: DayDatum;
}) {
  const { x = 0, y = 0, width = 0, height = 0, dayCount, payload } = props;
  const plot = usePlotArea();
  if (!payload || payload.revenue <= 0) return null;
  // Recharts rounds each bar's own width up; measuring the span off the plot area
  // instead keeps a long block's right edge on the same pixel as its band.
  const slot = plot && dayCount ? slotWidth(plot.width, dayCount) : width;
  const spanWidth = Math.max(payload.spanNights, 1) * slot;

  return (
    <rect
      // Inset a pixel each side so touching blocks stay readable as separate stays
      x={x + 1}
      y={y}
      width={Math.max(1, spanWidth - 2)}
      height={Math.max(0, height)}
      rx={3}
      fill={payload.isFuture ? COLORS.upcoming : COLORS.earned}
    />
  );
}

function DayTooltip({
  active, payload, monthLabel, fmt,
}: {
  active?: boolean;
  payload?: { payload: DayDatum }[];
  monthLabel?: string;
  fmt?: (n: number) => string;
}) {
  if (!active || !payload?.length || !fmt) return null;
  const d = payload[0].payload;
  const nights = (n: number) => `${n} night${n === 1 ? '' : 's'}`;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm min-w-[180px]">
      <p className="font-semibold text-slate-800 mb-1.5">{monthLabel} {d.day}</p>
      {d.revenue > 0 ? (
        <>
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">Check-in</span>
            <span className="font-medium">{fmt(d.revenue)}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{nights(d.stayNights)} · whole stay</p>
        </>
      ) : d.occupied ? (
        <>
          <p className="text-slate-600">Booked — night {d.stayNight} of {d.stayNights}</p>
          <p className="text-xs text-slate-400 mt-1">Counted on the check-in date</p>
        </>
      ) : (
        <p className="text-slate-500">{d.isFuture ? 'Open' : 'Vacant'}</p>
      )}
      {d.guest && <p className="text-xs text-slate-400 mt-1 truncate">{d.guest}</p>}
    </div>
  );
}

export default function DayRevenueChart({
  data, monthLabel, fmt, paceTarget,
}: {
  data: DayDatum[];
  monthLabel: string;
  fmt: (n: number) => string;
  /** Daily run rate needed to hit the month's target, if one is set. */
  paceTarget?: number | null;
}) {
  const anyOccupied = data.some(d => d.occupied);

  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        {/* No category gap: day slots tile the plot area, so a stay's block lines
            up with the nights it covers. */}
        <ComposedChart data={data} barCategoryGap={0}>
          <OccupancyBands data={data} />
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} interval={1} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
          <Tooltip
            cursor={{ fill: '#0f172a0a' }}
            content={<DayTooltip monthLabel={monthLabel} fmt={fmt} />}
          />
          {paceTarget != null && (
            <ReferenceLine
              y={paceTarget}
              stroke="#94a3b8"
              strokeDasharray="4 3"
              label={{ value: `${fmt(paceTarget)}/day needed`, position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }}
            />
          )}
          {/* Animation off: the reveal clips each bar to its own slot, which would
              cut the blocks that span several days. */}
          <Bar dataKey="revenue" shape={<DayBar dayCount={data.length} />} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.earned }} />
          Stay revenue
        </span>
        {anyOccupied && (
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: COLORS.bookedBand, borderBottom: `${RIBBON_H}px solid ${COLORS.bookedRibbon}` }}
            />
            Booked nights
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.upcoming }} />
          Upcoming
        </span>
      </div>
    </>
  );
}
