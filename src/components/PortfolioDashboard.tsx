'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2 } from 'lucide-react';
import { pacingStatus, planShare } from '@/lib/pacing';
import PacingRing from '@/components/PacingRing';
import InfoTip from '@/components/InfoTip';
import type { PortfolioEntry } from '@/app/api/portfolio/route';

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** The four layers of the money, outermost first. */
const LAYERS = [
  { key: 'grossRevenue', label: 'Gross Revenue', tip: 'Everything guests paid, before any deduction.' },
  { key: 'netRevenue', label: 'Net Revenue', tip: 'After platform fees, platform-remitted tax and refunds.' },
  { key: 'operatingIncome', label: 'NOI', tip: 'Net operating income: net revenue less operating expenses, before the mortgage.' },
  { key: 'netIncome', label: 'Cash Flow', tip: 'After every cost including the whole mortgage payment. Net income is higher by the principal repaid, which builds equity rather than being spent.' },
] as const;

type LayerKey = typeof LAYERS[number]['key'];

/** One property's figures for the window in view. */
interface Row {
  id: string;
  name: string;
  grossRevenue: number;
  netRevenue: number;
  operatingIncome: number;
  netIncome: number;
  nights: number;
  occupancy: number;
  adr: number | null;
  /** What the window should have produced by now, layer by layer. Null where
   *  there is no goal, or no finished year to derive one of the lower layers
   *  from. */
  targets: Record<LayerKey, number | null>;
}

type Period = 'month' | 'ytd' | 'year';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'month', label: 'This Month' },
  { id: 'ytd', label: 'YTD' },
  { id: 'year', label: 'Full Year' },
];

/**
 * How a property's annual goal lands in each month.
 *
 * A goal spread evenly would call a January ahead and a July behind for reasons
 * that have nothing to do with how either was run, so it follows last year's
 * shape where there is one and falls back to even twelfths where there is not.
 */
function monthlyTargets(target: PortfolioEntry['target']): (number | null)[] {
  const annual = target.annualRevenue;
  if (annual == null || annual <= 0) return Array(12).fill(null);
  const prior = target.priorMonthlyRevenue;
  const priorTotal = prior?.reduce((s, v) => s + v, 0) ?? 0;
  if (!prior || priorTotal <= 0) return Array(12).fill(annual / 12);
  return prior.map(v => (v / priorTotal) * annual);
}

export default function PortfolioDashboard({ children }: { children?: React.ReactNode }) {
  const year = new Date().getFullYear();
  const monthIdx = new Date().getMonth();
  const today = new Date().getDate();

  const [data, setData] = useState<{ currency: string; entries: PortfolioEntry[] } | null>(null);
  const [period, setPeriod] = useState<Period>('ytd');
  const [sortBy, setSortBy] = useState<LayerKey>('netIncome');
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portfolio?year=${year}`).then(r => r.json()).then(setData).catch(() => {});
  }, [year]);

  const fmt = useMemo(() => {
    const currency = data?.currency ?? 'USD';
    return (n: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  }, [data?.currency]);

  const monthsInWindow = useMemo(() => (
    period === 'month' ? [monthIdx]
      : period === 'ytd' ? Array.from({ length: monthIdx + 1 }, (_, i) => i)
      : Array.from({ length: 12 }, (_, i) => i)
  ), [period, monthIdx]);

  const rows: Row[] = useMemo(() => (data?.entries ?? []).map(entry => {
    const months = monthsInWindow.map(i => entry.statement.months[i]).filter(Boolean);
    const sum = (pick: (m: typeof months[number]) => number) => months.reduce((s, m) => s + pick(m), 0);
    const nights = sum(m => m.totalNights);
    const gross = sum(m => m.grossRevenue);
    const targets = monthlyTargets(entry.target);

    // Only count target for months that have been lived: a full-year window
    // compared against a part-finished year would call every unit behind.
    let elapsedMonths = 0;
    const grossTarget = monthsInWindow.reduce((s, i) => {
      if (i < monthIdx) { elapsedMonths += 1; return s + (targets[i] ?? 0); }
      if (i === monthIdx) {
        const share = today / new Date(year, i + 1, 0).getDate();
        elapsedMonths += share;
        return s + (targets[i] ?? 0) * share;
      }
      return s;
    }, 0);
    const hasGoal = targets.some(t => t != null) && grossTarget > 0;
    const m = entry.target.priorMargins;

    // The lower layers are the gross goal kept at last year's margins. Cash
    // flow subtracts the mortgage at the window's own length rather than
    // scaling it with revenue, because the payment does not move with takings.
    const layerTargets: Record<LayerKey, number | null> = {
      grossRevenue: hasGoal ? grossTarget : null,
      netRevenue: hasGoal && m ? grossTarget * m.netRevenue : null,
      operatingIncome: hasGoal && m ? grossTarget * m.operatingIncome : null,
      netIncome: hasGoal && m
        ? grossTarget * m.contribution - entry.target.monthlyPITI * elapsedMonths
        : null,
    };

    return {
      id: entry.property.id,
      name: entry.property.name,
      grossRevenue: gross,
      netRevenue: sum(m => m.netRevenue),
      operatingIncome: sum(m => m.operatingIncome),
      netIncome: sum(m => m.netIncome),
      nights,
      occupancy: months.length ? months.reduce((s, m) => s + m.occupancyRate, 0) / months.length : 0,
      adr: nights > 0 ? gross / nights : null,
      targets: layerTargets,
    };
  }), [data, monthsInWindow, monthIdx, today, year]);

  const inView = focused ? rows.filter(r => r.id === focused) : rows;

  const totals = useMemo(() => {
    const actual: Record<LayerKey, number> = { grossRevenue: 0, netRevenue: 0, operatingIncome: 0, netIncome: 0 };
    // A layer's plan is the sum of the plans of the units that have one. A unit
    // with no goal contributes its actual to the total but nothing to the plan,
    // which would otherwise read as a shortfall the size of that unit.
    const plan: Record<LayerKey, number | null> = { grossRevenue: null, netRevenue: null, operatingIncome: null, netIncome: null };
    let nights = 0;
    for (const r of inView) {
      nights += r.nights;
      for (const { key } of LAYERS) {
        actual[key] += r[key];
        const t = r.targets[key];
        if (t != null) plan[key] = (plan[key] ?? 0) + t;
      }
    }
    return { actual, plan, nights };
  }, [inView]);

  // Worst first. An average hides the one unit losing money, and the whole
  // point of a portfolio view is that it cannot.
  const sorted = useMemo(
    () => [...rows].sort((a, b) => a[sortBy] - b[sortBy]),
    [rows, sortBy],
  );

  /** Make a property the one the whole app is showing, not just these tiles. */
  async function openFully(propertyId: string) {
    await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activePropertyId: propertyId }),
    });
    window.location.reload();
  }

  if (!data) {
    return <div className="py-12 text-center text-sm text-slate-400">Loading…</div>;
  }

  const live = rows.length;
  const focusedRow = focused ? rows.find(r => r.id === focused) : null;
  const periodLabel = period === 'month' ? `${MONTHS_LONG[monthIdx]} ${year}`
    : period === 'ytd' ? `Jan – ${MONTHS_LONG[monthIdx].slice(0, 3)} ${year}`
    : `${year}`;

  /**
   * Each layer's share of the gross target.
   *
   * Only gross revenue has a target of its own, so the others are measured
   * against the same plan scaled by the margin they have actually run at. That
   * is honest about what it is — a derived mark, not a figure anyone set — and
   * it is the only way to pace four layers from one goal.
   */
  function layerPacing(key: LayerKey) {
    const target = totals.plan[key];
    const actual = totals.actual[key];
    if (target == null) return { pct: null, variance: null, status: pacingStatus(null) };
    const variance = actual - target;
    const variancePct = target !== 0 ? (variance / Math.abs(target)) * 100 : null;
    return { pct: planShare(actual, target), variance, status: pacingStatus(variancePct) };
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            {focusedRow ? focusedRow.name : live > 1 ? 'Portfolio' : rows[0]?.name ?? 'Portfolio'}
          </h1>
          {/* With one unit the roll-up below is hidden, so there is no window
              for this to describe — the property's own dashboard carries its
              period filter. */}
          {live > 1 && (
            <p className="text-slate-500 text-sm mt-1">
              {focusedRow ? 'One property · ' : `${live} properties · `}
              {periodLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {focused && (
            <button
              onClick={() => setFocused(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:border-slate-300"
            >
              <ArrowLeft className="w-3 h-3" /> All properties
            </button>
          )}
          {live > 1 && PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                period === p.id
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-emerald-300 bg-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── The four layers, rolled up across every unit ──
          Only with more than one unit. With a single property this said exactly
          what the property's own Financial Performance tiles say below, over a
          second period filter of its own. */}
      {live > 1 && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {LAYERS.map(layer => {
          const { pct, variance, status } = layerPacing(layer.key);
          const value = totals.actual[layer.key];
          return (
            <div key={layer.key} className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-4">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold flex items-center gap-1">
                {layer.label}
                <InfoTip label={`What ${layer.label} means`}>{layer.tip}</InfoTip>
              </p>
              <div className="flex items-center justify-between gap-3 mt-1.5">
                <div className="min-w-0">
                  <p className={`text-xl font-bold leading-tight ${value < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                    {fmt(value)}
                  </p>
                  <p className={`text-[11px] truncate mt-0.5 ${variance == null ? 'text-slate-400' : status.color}`}>
                    {variance == null
                      ? 'no plan set'
                      : `${variance >= 0 ? '+' : '−'}${fmt(Math.abs(variance))} vs plan`}
                  </p>
                </div>
                <PacingRing
                  pct={pct}
                  color={status.color === 'text-emerald-600' ? '#10b981' : '#f43f5e'}
                  label={`${layer.label}: ${pct == null ? 'no plan' : `${Math.round(pct)}% of plan`}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* ── The properties ── */}
      {live > 1 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs uppercase tracking-wide text-slate-900 font-semibold">Properties</span>
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              worst first
              <InfoTip label="Why the order">
                Sorted lowest first, so the unit losing money is the one you see. A portfolio average will
                always hide it otherwise.
              </InfoTip>
            </span>
            <div className="flex flex-wrap items-center gap-1 ml-auto">
              {LAYERS.map(l => (
                <button
                  key={l.key}
                  onClick={() => setSortBy(l.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    sortBy === l.key
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left text-xs">
                  <th className="px-5 py-2.5 font-medium">Property</th>
                  <th className="px-3 py-2.5 font-medium text-right">Gross</th>
                  <th className="px-3 py-2.5 font-medium text-right">Net Revenue</th>
                  <th className="px-3 py-2.5 font-medium text-right">NOI</th>
                  <th className="px-3 py-2.5 font-medium text-right">Cash Flow</th>
                  <th className="px-3 py-2.5 font-medium text-right">Occupancy</th>
                  <th className="px-3 py-2.5 font-medium text-right">ADR</th>
                  <th className="px-5 py-2.5 font-medium text-right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => setFocused(r.id)}
                    className={`border-b border-slate-50 cursor-pointer hover:bg-slate-50 ${
                      focused === r.id ? 'bg-slate-50' : ''
                    }`}
                  >
                    <td className="px-5 py-3 font-medium text-slate-800">
                      <span className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        <span className="truncate">{r.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-slate-700">{fmt(r.grossRevenue)}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{fmt(r.netRevenue)}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{fmt(r.operatingIncome)}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${r.netIncome < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                      {fmt(r.netIncome)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">{r.occupancy.toFixed(1)}%</td>
                    <td className="px-3 py-3 text-right text-slate-600">{r.adr != null ? fmt(r.adr) : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 whitespace-nowrap">
                        Isolate <ArrowRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* The detail below belongs to the property the app is set to. While one
          unit is isolated up top, showing another's charts underneath would put
          two properties' books on one screen. */}
      {focusedRow ? (
        <div className="mt-6 bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-6 text-center">
          <p className="text-sm text-slate-500">
            Showing {focusedRow.name}&rsquo;s headline figures only.
          </p>
          <button
            onClick={() => openFully(focusedRow.id)}
            className="mt-3 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Open the full dashboard for {focusedRow.name} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="mt-6">{children}</div>
      )}
    </div>
  );
}
