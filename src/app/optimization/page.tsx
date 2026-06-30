'use client';
import { useEffect, useState } from 'react';
import { AnnualStatement, Settings } from '@/types';
import { Target, TrendingUp, AlertTriangle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Cell,
} from 'recharts';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PLATFORM_COLORS: Record<string, string> = {
  Airbnb: '#f43f5e',
  'Booking.com': '#3b82f6',
  VRBO: '#6366f1',
};

// Approximate US STR industry operating expense ratio range (% of gross revenue)
const INDUSTRY_EXP_MIN = 30;
const INDUSTRY_EXP_MAX = 45;

function pct(n: number) { return `${n.toFixed(1)}%`; }

function mean(arr: number[]) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}
function stdDev(arr: number[], avg: number) {
  return arr.length ? Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / arr.length) : 0;
}

interface InsightCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  alert?: boolean;
}
function InsightCard({ icon: Icon, label, value, sub, color = 'text-slate-800', alert }: InsightCardProps) {
  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm ${alert ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${alert ? 'text-amber-500' : 'text-slate-400'}`} />
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Scenario model ─────────────────────────────────────────────────────────────

interface ScenarioResult {
  target: number;
  stays: number;
  nights: number;
  occupancy: number;
  grossRevenue: number;
  cleaningCollected: number;
  cleaningPaidOut: number;
  annualPITI: number;
  trueBankPayout: number;
}

function computeScenario(
  target: number,
  adr: number,
  avgStay: number,
  cleaningFee: number,
  cleaningCost: number,
  annualPITI: number,
): ScenarioResult | null {
  const netCleaningPerStay = cleaningFee - cleaningCost;
  const totalPerStay = adr * avgStay + netCleaningPerStay;
  if (totalPerStay <= 0) return null;

  const stays = (target + annualPITI) / totalPerStay;
  const nights = stays * avgStay;
  return {
    target,
    stays,
    nights,
    occupancy: (nights / 365) * 100,
    grossRevenue: adr * nights,
    cleaningCollected: cleaningFee * stays,
    cleaningPaidOut: cleaningCost * stays,
    annualPITI,
    trueBankPayout: annualPITI + target,
  };
}

export default function OptimizationPage() {
  const [statement, setStatement] = useState<AnnualStatement | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [configOpen, setConfigOpen] = useState(false);
  const [benchmarkAdrDraft, setBenchmarkAdrDraft] = useState('');
  const [benchmarkExpDraft, setBenchmarkExpDraft] = useState('');
  const [saved, setSaved] = useState(false);

  // Scenario modeling inputs
  const [modelAdr, setModelAdr] = useState('');
  const [modelAvgStay, setModelAvgStay] = useState('');
  const [modelCleaningFee, setModelCleaningFee] = useState('');
  const [modelCleaningCost, setModelCleaningCost] = useState('');
  const [scenarioTargets, setScenarioTargets] = useState<[string, string, string]>(['0', '5000', '10000']);
  const [modelInitialized, setModelInitialized] = useState(false);

  useEffect(() => {
    fetch(`/api/income-statement?year=${year}`)
      .then(r => r.json())
      .then(d => {
        setStatement(d.statement);
        const available = (d.years as number[]);
        if (!available.includes(year)) available.push(year);
        setYears(available.sort((a, b) => b - a));
      });
  }, [year]);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then((s: Settings) => {
      setSettings(s);
      setBenchmarkAdrDraft(s.benchmarkAdr ? String(s.benchmarkAdr) : '');
      setBenchmarkExpDraft(s.benchmarkExpenseRatio ? String(s.benchmarkExpenseRatio) : '');
    });
  }, []);

  // Initialise scenario model inputs from actual data once loaded
  useEffect(() => {
    if (modelInitialized || !statement || !settings) return;
    const actMonths = statement.months.filter(m => m.grossRevenue > 0);
    if (!actMonths.length) return;
    const totalNights = actMonths.reduce((s, m) => s + m.totalNights, 0);
    const totalRevenue = actMonths.reduce((s, m) => s + m.grossRevenue, 0);
    const totalBookings = actMonths.reduce((s, m) => s + m.bookings.length, 0);
    const avgAdr = totalNights > 0 ? totalRevenue / totalNights : 0;
    const avgStay = totalBookings > 0 ? totalNights / totalBookings : 3;
    setModelAdr(Math.round(avgAdr).toString());
    setModelAvgStay(avgStay.toFixed(1));
    setModelCleaningFee((settings.cleaningFeePerBooking ?? 0).toString());
    setModelInitialized(true);
  }, [statement, settings, modelInitialized]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: settings?.currency ?? 'USD', maximumFractionDigits: 0 }).format(n);

  const fmt2 = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: settings?.currency ?? 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  async function saveBenchmarks() {
    if (!settings) return;
    const updated: Settings = {
      ...settings,
      benchmarkAdr: parseFloat(benchmarkAdrDraft) || undefined,
      benchmarkExpenseRatio: parseFloat(benchmarkExpDraft) || undefined,
    };
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // ── Derived data ──────────────────────────────────────────────────────────────

  const benchmarkAdr = settings?.benchmarkAdr ?? 0;
  const benchmarkExpRatio = settings?.benchmarkExpenseRatio ?? 0;

  const activeMonths = statement?.months.filter(m => m.grossRevenue > 0) ?? [];

  // Per-platform ADR by month
  const adrChartData = activeMonths.map(m => {
    const airbnbAdr = m.byPlatform.airbnb.nights > 0 ? m.byPlatform.airbnb.income / m.byPlatform.airbnb.nights : null;
    const vrboAdr   = m.byPlatform.vrbo.nights   > 0 ? m.byPlatform.vrbo.income   / m.byPlatform.vrbo.nights   : null;
    const bookAdr   = m.byPlatform.booking.nights > 0 ? m.byPlatform.booking.income / m.byPlatform.booking.nights : null;
    const overallAdr = m.totalNights > 0 ? m.grossRevenue / m.totalNights : null;
    return {
      name: MONTHS[m.month - 1],
      Airbnb:        airbnbAdr != null ? Math.round(airbnbAdr) : null,
      VRBO:          vrboAdr   != null ? Math.round(vrboAdr)   : null,
      'Booking.com': bookAdr   != null ? Math.round(bookAdr)   : null,
      'Your ADR':    overallAdr != null ? Math.round(overallAdr) : null,
      Benchmark:     benchmarkAdr > 0  ? benchmarkAdr : undefined,
    };
  });

  // Per-platform aggregate stats (all active months)
  type PlatformKey = 'airbnb' | 'vrbo' | 'booking';
  const platformStats = (['airbnb', 'vrbo', 'booking'] as PlatformKey[]).map(p => {
    const label = p === 'booking' ? 'Booking.com' : p === 'airbnb' ? 'Airbnb' : 'VRBO';
    const monthsWithData = activeMonths.filter(m => m.byPlatform[p].nights > 0);
    const adrs = monthsWithData.map(m => m.byPlatform[p].income / m.byPlatform[p].nights);
    return {
      platform: label,
      avgAdr: adrs.length ? mean(adrs) : null,
      minAdr: adrs.length ? Math.min(...adrs) : null,
      maxAdr: adrs.length ? Math.max(...adrs) : null,
      totalNights: activeMonths.reduce((s, m) => s + m.byPlatform[p].nights, 0),
      totalRevenue: activeMonths.reduce((s, m) => s + m.byPlatform[p].income, 0),
      bookings: activeMonths.reduce((s, m) => s + m.byPlatform[p].bookings, 0),
    };
  }).filter(p => p.bookings > 0);

  const overallAdrs = activeMonths.map(m => m.totalNights > 0 ? m.grossRevenue / m.totalNights : 0).filter(v => v > 0);
  const overallAvgAdr = overallAdrs.length ? mean(overallAdrs) : 0;

  // Scenario model derived values
  const mAdr = parseFloat(modelAdr) || 0;
  const mAvgStay = parseFloat(modelAvgStay) || 1;
  const mCleaningFee = parseFloat(modelCleaningFee) || 0;
  const mCleaningCost = parseFloat(modelCleaningCost) || 0;
  const annualPITI = (settings?.monthlyPITI ?? 0) * 12;
  const scenarios: ScenarioResult[] = scenarioTargets
    .map(t => computeScenario(parseFloat(t) || 0, mAdr, mAvgStay, mCleaningFee, mCleaningCost, annualPITI))
    .filter((s): s is ScenarioResult => s !== null);

  // Expense ratio analysis
  const expenseRatios = activeMonths.map(m => (m.totalOperatingExpenses / m.grossRevenue) * 100);
  const avgExpRatio = mean(expenseRatios);
  const sdExpRatio  = stdDev(expenseRatios, avgExpRatio);
  const outlierThreshold = avgExpRatio + 1.5 * sdExpRatio;

  const expChartData = activeMonths.map((m, i) => ({
    name: MONTHS[m.month - 1],
    ratio: Math.round(expenseRatios[i] * 10) / 10,
    revenue: m.grossRevenue,
    opEx: m.totalOperatingExpenses,
    isOutlier: expenseRatios[i] > outlierThreshold && sdExpRatio > 2,
  }));

  const outlierMonths = expChartData.filter(d => d.isOutlier);

  // ── Insight cards ─────────────────────────────────────────────────────────────

  const activePlatforms = platformStats.filter(p => p.avgAdr != null).sort((a, b) => b.avgAdr! - a.avgAdr!);
  const highestPlatform = activePlatforms[0];
  const lowestPlatform  = activePlatforms[activePlatforms.length - 1];
  const platformGap     = (activePlatforms.length > 1 && highestPlatform && lowestPlatform)
    ? highestPlatform.avgAdr! - lowestPlatform.avgAdr!
    : null;

  const adrVsBenchmark = benchmarkAdr > 0 ? overallAvgAdr - benchmarkAdr : null;

  const hasData = activeMonths.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-6 h-6 text-emerald-600" />
            Optimization
          </h1>
          <p className="text-slate-500 text-sm mt-1">{settings?.propertyName}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {!hasData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          No booking data found for {year}. Import earnings to see optimization insights.
        </div>
      )}

      {hasData && (
        <>
          {/* ── Insight cards ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <InsightCard
              icon={TrendingUp}
              label="Your Avg ADR"
              value={overallAvgAdr > 0 ? fmt(overallAvgAdr) : '—'}
              sub="per night across all platforms"
              color="text-emerald-700"
            />
            {adrVsBenchmark != null ? (
              <InsightCard
                icon={Target}
                label="vs Sub-Market ADR"
                value={`${adrVsBenchmark >= 0 ? '+' : ''}${fmt(adrVsBenchmark)}/nt`}
                sub={`${fmt(benchmarkAdr)}/nt sub-market target`}
                color={adrVsBenchmark >= 0 ? 'text-emerald-700' : 'text-red-600'}
              />
            ) : (
              <InsightCard
                icon={Target}
                label="vs Sub-Market ADR"
                value="Set benchmark"
                sub="Enter your sub-market rate below"
                color="text-slate-400"
              />
            )}
            <InsightCard
              icon={platformGap != null ? TrendingUp : Target}
              label="Platform ADR Gap"
              value={platformGap != null ? fmt(platformGap) : '—'}
              sub={platformGap != null
                ? `${highestPlatform!.platform} earns ${fmt(platformGap)}/nt more than ${lowestPlatform!.platform}`
                : 'Need data from 2+ platforms'}
              color={platformGap != null && platformGap > 20 ? 'text-amber-600' : 'text-slate-800'}
              alert={platformGap != null && platformGap > 20}
            />
            <InsightCard
              icon={outlierMonths.length > 0 ? AlertTriangle : Check}
              label="Expense Outliers"
              value={outlierMonths.length > 0 ? `${outlierMonths.length} month${outlierMonths.length > 1 ? 's' : ''}` : 'None'}
              sub={outlierMonths.length > 0
                ? outlierMonths.map(m => m.name).join(', ')
                : `Avg ratio ${pct(avgExpRatio)} — within normal range`}
              color={outlierMonths.length > 0 ? 'text-amber-600' : 'text-emerald-700'}
              alert={outlierMonths.length > 0}
            />
          </div>

          {/* ── Section 1: ADR by Platform ───────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Average Daily Rate by Platform</h2>
            <p className="text-xs text-slate-400 mb-4">
              Compare ADR per night across each platform by month. A consistent gap between platforms may indicate a pricing opportunity.
            </p>

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-4">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={adrChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v) => v != null ? fmt(Number(v)) : '—'} />
                  <Legend />
                  {(['Airbnb', 'VRBO', 'Booking.com'] as const).map(p => (
                    <Line
                      key={p}
                      type="monotone"
                      dataKey={p}
                      stroke={PLATFORM_COLORS[p]}
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 0 }}
                      connectNulls={false}
                      hide={!platformStats.some(s => s.platform === p)}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="Your ADR"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    strokeDasharray="6 3"
                    dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                    connectNulls
                  />
                  {benchmarkAdr > 0 && (
                    <Line
                      type="monotone"
                      dataKey="Benchmark"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      name="Sub-Market ADR"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Platform summary table */}
            {platformStats.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                      <th className="px-5 py-3 font-medium">Platform</th>
                      <th className="px-5 py-3 font-medium text-right">Avg ADR</th>
                      <th className="px-5 py-3 font-medium text-right">Min</th>
                      <th className="px-5 py-3 font-medium text-right">Max</th>
                      <th className="px-5 py-3 font-medium text-right">Nights</th>
                      <th className="px-5 py-3 font-medium text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformStats.map(p => (
                      <tr key={p.platform} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{p.platform}</td>
                        <td className="px-5 py-3 text-right font-semibold text-emerald-700">
                          {p.avgAdr != null ? fmt(p.avgAdr) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-500">
                          {p.minAdr != null ? fmt(p.minAdr) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-500">
                          {p.maxAdr != null ? fmt(p.maxAdr) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">{p.totalNights}</td>
                        <td className="px-5 py-3 text-right text-slate-700">{fmt(p.totalRevenue)}</td>
                      </tr>
                    ))}
                    {benchmarkAdr > 0 && (
                      <tr className="border-t border-slate-200 bg-slate-50 text-slate-500 text-xs">
                        <td className="px-5 py-2.5 italic">Sub-Market Benchmark</td>
                        <td className="px-5 py-2.5 text-right font-medium">{fmt(benchmarkAdr)}</td>
                        <td colSpan={4} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {platformGap != null && platformGap > 20 && (
              <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  {highestPlatform!.platform} has a {fmt(platformGap)}/night ADR advantage over {lowestPlatform!.platform}.
                  Consider reviewing your listing quality, photos, and pricing strategy on the lower-performing platform.
                </span>
              </div>
            )}
          </section>

          {/* ── Section 2: Expense-to-Revenue Ratio ──────────────────────────── */}
          <section className="mb-8">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Expense-to-Revenue Ratio</h2>
            <p className="text-xs text-slate-400 mb-4">
              Operating expenses as a percentage of gross revenue per month. Months above the outlier threshold ({pct(outlierThreshold)}) may warrant a closer review.
            </p>

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-4">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={expChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v}%`} domain={[0, 'auto']} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                  <Legend />
                  <Bar dataKey="ratio" name="Expense Ratio" radius={[3, 3, 0, 0]}>
                    {expChartData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.isOutlier ? '#ef4444' : d.ratio > INDUSTRY_EXP_MAX ? '#f97316' : '#64748b'}
                      />
                    ))}
                  </Bar>
                  {/* Mean */}
                  <ReferenceLine
                    y={avgExpRatio}
                    stroke="#10b981"
                    strokeDasharray="5 3"
                    label={{ value: `Avg ${pct(avgExpRatio)}`, fill: '#10b981', fontSize: 11, position: 'insideTopRight' }}
                  />
                  {/* Outlier threshold (only show if meaningful spread) */}
                  {sdExpRatio > 2 && (
                    <ReferenceLine
                      y={outlierThreshold}
                      stroke="#f97316"
                      strokeDasharray="4 4"
                      label={{ value: `Alert ${pct(outlierThreshold)}`, fill: '#f97316', fontSize: 11, position: 'insideTopRight' }}
                    />
                  )}
                  {/* Industry upper bound */}
                  <ReferenceLine
                    y={INDUSTRY_EXP_MAX}
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    label={{ value: `Industry max ${INDUSTRY_EXP_MAX}%`, fill: '#94a3b8', fontSize: 10, position: 'insideBottomRight' }}
                  />
                  {/* User benchmark */}
                  {benchmarkExpRatio > 0 && (
                    <ReferenceLine
                      y={benchmarkExpRatio}
                      stroke="#6366f1"
                      strokeDasharray="5 3"
                      label={{ value: `Sub-market ${pct(benchmarkExpRatio)}`, fill: '#6366f1', fontSize: 11, position: 'insideTopLeft' }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Benchmark comparison table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                    <th className="px-5 py-3 font-medium">Benchmark</th>
                    <th className="px-5 py-3 font-medium text-right">Expense Ratio</th>
                    <th className="px-5 py-3 font-medium text-right">vs Your Average</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">Your Average ({year})</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">{pct(avgExpRatio)}</td>
                    <td className="px-5 py-3 text-right text-slate-400">—</td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="px-5 py-3 text-slate-600">Industry Typical Range</td>
                    <td className="px-5 py-3 text-right text-slate-500">{INDUSTRY_EXP_MIN}–{INDUSTRY_EXP_MAX}%</td>
                    <td className="px-5 py-3 text-right text-xs">
                      {avgExpRatio < INDUSTRY_EXP_MIN
                        ? <span className="text-emerald-600 font-medium">Below industry min — excellent</span>
                        : avgExpRatio <= INDUSTRY_EXP_MAX
                        ? <span className="text-emerald-600 font-medium">Within industry range</span>
                        : <span className="text-red-600 font-medium">Above industry max</span>}
                    </td>
                  </tr>
                  {benchmarkExpRatio > 0 && (
                    <tr className="border-b border-slate-50">
                      <td className="px-5 py-3 text-slate-600">Sub-Market Benchmark</td>
                      <td className="px-5 py-3 text-right text-slate-500">{pct(benchmarkExpRatio)}</td>
                      <td className="px-5 py-3 text-right">
                        {(() => {
                          const delta = avgExpRatio - benchmarkExpRatio;
                          return (
                            <span className={`font-medium text-xs ${delta <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {delta > 0 ? '+' : ''}{pct(delta)} vs benchmark
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Outlier detail */}
            {outlierMonths.length > 0 && (
              <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold text-amber-800">
                    High-Expense Months — Review These Periods
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                      <th className="px-5 py-3 font-medium">Month</th>
                      <th className="px-5 py-3 font-medium text-right">Revenue</th>
                      <th className="px-5 py-3 font-medium text-right">Op. Expenses</th>
                      <th className="px-5 py-3 font-medium text-right">Expense Ratio</th>
                      <th className="px-5 py-3 font-medium text-right">vs Average</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outlierMonths.map(d => (
                      <tr key={d.name} className="border-b border-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{d.name}</td>
                        <td className="px-5 py-3 text-right text-slate-600">{fmt(d.revenue)}</td>
                        <td className="px-5 py-3 text-right text-red-600">{fmt(d.opEx)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-red-600">{pct(d.ratio)}</td>
                        <td className="px-5 py-3 text-right text-xs text-red-500">
                          +{pct(d.ratio - avgExpRatio)} above avg
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Monthly detail table ─────────────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Monthly Performance Detail</h2>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                    <th className="px-5 py-3 font-medium">Month</th>
                    <th className="px-5 py-3 font-medium text-right">Revenue</th>
                    <th className="px-5 py-3 font-medium text-right">Nights</th>
                    <th className="px-5 py-3 font-medium text-right">ADR</th>
                    {benchmarkAdr > 0 && <th className="px-5 py-3 font-medium text-right">vs Benchmark</th>}
                    <th className="px-5 py-3 font-medium text-right">Occ.</th>
                    <th className="px-5 py-3 font-medium text-right">Exp. Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMonths.map((m, i) => {
                    const adr = m.totalNights > 0 ? m.grossRevenue / m.totalNights : 0;
                    const ratio = expenseRatios[i];
                    const adrDelta = benchmarkAdr > 0 ? adr - benchmarkAdr : null;
                    const isHighExp = ratio > outlierThreshold && sdExpRatio > 2;
                    return (
                      <tr key={m.month} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{MONTHS[m.month - 1]}</td>
                        <td className="px-5 py-3 text-right text-slate-700">{fmt(m.grossRevenue)}</td>
                        <td className="px-5 py-3 text-right text-slate-600">{m.totalNights}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-800">
                          {adr > 0 ? fmt(adr) : '—'}
                        </td>
                        {benchmarkAdr > 0 && (
                          <td className={`px-5 py-3 text-right text-xs font-medium ${
                            adrDelta == null ? 'text-slate-400' : adrDelta >= 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            {adrDelta != null ? `${adrDelta >= 0 ? '+' : ''}${fmt(adrDelta)}` : '—'}
                          </td>
                        )}
                        <td className="px-5 py-3 text-right text-slate-500">{m.occupancyRate.toFixed(0)}%</td>
                        <td className={`px-5 py-3 text-right font-medium ${isHighExp ? 'text-red-600' : ratio > INDUSTRY_EXP_MAX ? 'text-amber-600' : 'text-slate-600'}`}>
                          {pct(ratio)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ── Section 3: Profitability Sensitivity Table ──────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Profitability Sensitivity Table</h2>
        <p className="text-xs text-slate-400 mb-5">
          Model what occupancy, nights, and revenue are required to hit each profit target.
          Edit the assumptions below — the table recalculates live.
        </p>

        {/* Model assumption inputs */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Model Assumptions</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">ADR ($/night)</label>
              <input type="number" value={modelAdr} onChange={e => setModelAdr(e.target.value)}
                placeholder="e.g. 250" min="0"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Avg Stay (nights)</label>
              <input type="number" value={modelAvgStay} onChange={e => setModelAvgStay(e.target.value)}
                placeholder="e.g. 3.0" min="1" step="0.1"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Cleaning Fee / Stay</label>
              <input type="number" value={modelCleaningFee} onChange={e => setModelCleaningFee(e.target.value)}
                placeholder="charged to guest" min="0"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
              <p className="text-xs text-slate-400 mt-0.5">Charged to guest</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Cleaning Cost / Stay</label>
              <input type="number" value={modelCleaningCost} onChange={e => setModelCleaningCost(e.target.value)}
                placeholder="paid to cleaner" min="0"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
              <p className="text-xs text-slate-400 mt-0.5">Paid to cleaner</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Annual PITI</label>
              <div className="text-sm border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-slate-500">
                {fmt(annualPITI)}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">From Settings</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Net Cleaning / Stay</label>
              <div className={`text-sm border rounded-lg px-3 py-2 font-medium ${mCleaningFee - mCleaningCost >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
                {fmt(mCleaningFee - mCleaningCost)}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Fee minus cost</p>
            </div>
          </div>

          {/* Scenario target inputs */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-3">Profit Targets (columns)</p>
            <div className="flex flex-wrap gap-4">
              {scenarioTargets.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Scenario {i + 1}</span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      value={t}
                      onChange={e => {
                        const next: [string, string, string] = [...scenarioTargets];
                        next[i] = e.target.value;
                        setScenarioTargets(next);
                      }}
                      className="pl-6 w-28 text-sm border border-slate-200 rounded-lg px-3 py-1.5"
                      min="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sensitivity table */}
        {scenarios.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-3 bg-slate-800 border-b border-slate-700">
              <h3 className="text-sm font-bold text-white">{year} STR Profitability Sensitivity Table</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 w-48">Key Financial Metrics</th>
                  {scenarios.map((s, i) => (
                    <th key={i} className="px-5 py-3 text-right font-semibold text-slate-800">
                      {s.target === 0
                        ? 'Break-Even Scenario ($0)'
                        : `${fmt(s.target)} Profit Scenario`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 bg-emerald-50">
                  <td className="px-5 py-2.5 text-xs font-semibold text-emerald-700 uppercase tracking-wide">Target Net Cash Flow</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-5 py-2.5 text-right font-bold text-emerald-700">
                      {s.target === 0 ? '$0.00' : `+${fmt2(s.target)}`}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-5 py-3 text-slate-600">Annual Occupancy Rate</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-5 py-3 text-right font-semibold text-slate-800">
                      {pct(s.occupancy)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td className="px-5 py-3 text-slate-600">Nights Booked / Year</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-5 py-3 text-right text-slate-700">
                      {s.nights.toFixed(1)} Nights
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-5 py-3 text-slate-600">Total Reservations / Year</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-5 py-3 text-right text-slate-700">
                      {s.stays.toFixed(1)} Stays
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-700">Gross Rental Revenue</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-5 py-3 text-right font-semibold text-slate-800">
                      {fmt2(s.grossRevenue)}
                    </td>
                  ))}
                </tr>
                {mCleaningFee > 0 && (
                  <tr className="border-b border-slate-100">
                    <td className="px-5 py-3 text-slate-600 pl-8 text-xs">Cleaning Fees Collected</td>
                    {scenarios.map((s, i) => (
                      <td key={i} className="px-5 py-3 text-right text-emerald-600 text-xs">
                        +{fmt2(s.cleaningCollected)}
                      </td>
                    ))}
                  </tr>
                )}
                {mCleaningCost > 0 && (
                  <tr className="border-b border-slate-100">
                    <td className="px-5 py-3 text-slate-600 pl-8 text-xs">Cleaning Costs Paid Out</td>
                    {scenarios.map((s, i) => (
                      <td key={i} className="px-5 py-3 text-right text-red-500 text-xs">
                        ({fmt2(s.cleaningPaidOut)})
                      </td>
                    ))}
                  </tr>
                )}
                <tr className="border-b border-slate-100">
                  <td className="px-5 py-3 text-slate-600">Total Hard Fixed Costs</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-5 py-3 text-right text-red-500">
                      ({fmt2(s.annualPITI)})
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-800">
                  <td className="px-5 py-4 font-bold text-white">True Bank Payout Position</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-5 py-4 text-right font-bold text-emerald-400 text-base">
                      {fmt2(s.trueBankPayout)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-4 text-xs text-slate-400">
              <span>ADR: {fmt(mAdr)}/night</span>
              <span>·</span>
              <span>Avg Stay: {mAvgStay} nights</span>
              <span>·</span>
              <span>Net Cleaning: {fmt(mCleaningFee - mCleaningCost)}/stay</span>
              <span>·</span>
              <span>Annual PITI: {fmt(annualPITI)}</span>
            </div>
          </div>
        )}
      </section>

      {/* ── Benchmark Configuration ───────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <button
          className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold text-slate-700"
          onClick={() => setConfigOpen(v => !v)}
        >
          <span className="flex items-center gap-2">
            <Target className="w-4 h-4 text-slate-400" />
            Benchmark Configuration
          </span>
          {configOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {configOpen && (
          <div className="px-6 pb-6 border-t border-slate-100">
            <p className="text-xs text-slate-400 mt-4 mb-5">
              Enter your sub-market benchmarks to compare against your property&apos;s performance.
              These values are typically sourced from AirDNA, PriceLabs, or your local STR market reports.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Sub-Market ADR ($/night)</label>
                <input
                  type="number"
                  value={benchmarkAdrDraft}
                  onChange={e => setBenchmarkAdrDraft(e.target.value)}
                  placeholder="e.g. 175"
                  min="0"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                />
                <p className="text-xs text-slate-400 mt-1">Average nightly rate for comparable properties in your sub-market.</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Sub-Market Expense Ratio (%)</label>
                <input
                  type="number"
                  value={benchmarkExpDraft}
                  onChange={e => setBenchmarkExpDraft(e.target.value)}
                  placeholder="e.g. 38"
                  min="0"
                  max="100"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Typical operating expenses as % of gross revenue for comparable STRs.
                  Industry range: {INDUSTRY_EXP_MIN}–{INDUSTRY_EXP_MAX}%.
                </p>
              </div>
            </div>
            <button
              onClick={saveBenchmarks}
              className="mt-5 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 transition-colors"
            >
              {saved ? <Check className="w-4 h-4" /> : null}
              {saved ? 'Saved!' : 'Save Benchmarks'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
