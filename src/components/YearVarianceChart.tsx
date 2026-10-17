'use client';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

/** A month measured against its target, for a year chart. */
export type VarianceDatum = {
  name: string;
  /** actual − target, or null for a month not comparable yet. */
  variance: number | null;
  actual: number;
  /** `actual` again, but blank for months with no bar, so the line stops where
      the bars do instead of diving through months nobody has lived yet. */
  actualLine: number | null;
  target: number | null;
  isCurrent: boolean;
  /** A month still ahead: `actual` is what is booked, not what was earned. */
  isForecast?: boolean;
};

/** The level axis, in thousands, with the sign in front of the symbol. */
const kMoneyTick = (v: number) => {
  const s = `$${(Math.abs(v) / 1000).toFixed(0)}k`;
  return v < 0 ? `\u2212${s}` : s;
};

/** Axis ticks that read as a gap: signed, and in whole dollars while small. */
const signedMoneyTick = (v: number) => {
  const abs = Math.abs(v);
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k` : `$${Math.round(abs)}`;
  return v < 0 ? `−${s}` : s;
};

function VarianceTooltip({
  active, payload, fmt, actualLabel, pendingNote,
}: {
  active?: boolean;
  payload?: { payload: VarianceDatum }[];
  fmt: (n: number) => string;
  actualLabel: string;
  pendingNote: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm min-w-[200px]">
      <p className="font-semibold text-slate-800 mb-2">{d.name}{d.isCurrent ? ' · so far' : ''}</p>
      {d.variance == null ? (
        <p className="text-slate-500">{pendingNote}</p>
      ) : (
        <>
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">{d.variance >= 0 ? 'Over target' : 'Under target'}</span>
            <span className={`font-semibold ${d.variance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {d.variance >= 0 ? '+' : '−'}{fmt(Math.abs(d.variance))}
            </span>
          </div>
          <div className="flex justify-between gap-6 border-t border-slate-100 mt-2 pt-2">
            <span className="text-slate-500">{actualLabel}</span>
            <span className="font-medium">{fmt(d.actual)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">Target</span>
            <span className="font-medium text-slate-600">{fmt(d.target ?? 0)}</span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A year as the gap to target, month by month.
 *
 * Showing the level instead — stacked by platform, or a bar beside a forecast
 * line — left the reader adding up twelve comparisons to find the one thing the
 * section reports. Here the target is the zero line: above it the month beat its
 * number, below it the month missed.
 *
 * The level still matters for reading the shape of a year, so it runs behind as
 * a faint line on its own scale. Months still ahead can show what is already
 * booked against their target, drawn grey: that gap is revenue not yet sold
 * rather than revenue missed.
 */
export function YearVarianceChart({
  data, fmt, selectedIndex, onSelect, actualLabel = 'Earned', pendingNote = 'Not reached yet',
}: {
  data: VarianceDatum[];
  fmt: (n: number) => string;
  /** Dims the other months, for the month drill-down. */
  selectedIndex: number | null;
  onSelect: (data: unknown) => void;
  actualLabel?: string;
  pendingNote?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} onClick={onSelect} style={{ cursor: 'pointer' }} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={(props) => {
          const { x, y, payload, index } = props;
          const isSelected = index === selectedIndex;
          return (
            <g transform={`translate(${x},${y})`}>
              <text
                x={0} y={0} dy={16}
                textAnchor="middle"
                fontSize={12}
                fontWeight={isSelected ? 700 : 400}
                fill={isSelected ? '#0f172a' : '#94a3b8'}
              >
                {payload.value}
              </text>
              {isSelected && (
                <line x1={-20} y1={4} x2={20} y2={4} stroke="#0f172a" strokeWidth={2} />
              )}
            </g>
          );
        }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={signedMoneyTick} width={60} />
        {/* The level is an order of magnitude bigger than the gap to target, so it
            needs its own scale. Faint, and anchored at zero so the shape of the
            year is honest. */}
        <YAxis
          yAxisId="actual" orientation="right"
          // Net income runs below zero, so the level axis cannot be pinned at it
          domain={[(min: number) => Math.min(min, 0), 'auto']}
          tick={{ fontSize: 10, fill: '#cbd5e1' }} tickFormatter={kMoneyTick}
          width={42} axisLine={false} tickLine={false}
        />
        <Tooltip
          cursor={{ fill: '#0f172a0a' }}
          content={(props) => (
            <VarianceTooltip
              active={props.active}
              payload={props.payload as unknown as { payload: VarianceDatum }[]}
              fmt={fmt}
              actualLabel={actualLabel}
              pendingNote={pendingNote}
            />
          )}
        />
        {/* Target is the zero line now, so it needs no legend entry */}
        <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} />
        {/* Declared before the bars so they paint over it */}
        {/* Animation off, as on the month charts: the period toggle and the
            month drill-down swap these in and out, and redrawing on every
            click is noise. */}
        <Line
          yAxisId="actual" dataKey="actualLine" type="monotone"
          stroke="#cbd5e1" strokeWidth={2} dot={false} connectNulls={false}
          isAnimationActive={false}
        />
        <Bar dataKey="variance" isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell
              key={i}
              // Grey for months still ahead: that gap is revenue not yet sold,
              // not revenue missed
              fill={d.isForecast ? '#e2e8f0' : (d.variance ?? 0) >= 0 ? '#10b981' : '#f43f5e'}
              opacity={selectedIndex === null || selectedIndex === i ? 1 : 0.25}
            />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
