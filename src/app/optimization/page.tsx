'use client';
import { useEffect, useState } from 'react';
import { AnnualStatement, Settings } from '@/types';
import {
  Target, TrendingUp, AlertTriangle, Check, DollarSign,
  Home, Users, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';
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

const INDUSTRY_EXP_MIN = 30;
const INDUSTRY_EXP_MAX = 45;

function pct(n: number) { return `${n.toFixed(1)}%`; }
function mean(arr: number[]) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function stdDev(arr: number[], avg: number) {
  return arr.length ? Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / arr.length) : 0;
}

// ── Small reusable components ─────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="h-px flex-1 bg-slate-200" />
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{title}</h2>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

interface ActionCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  metric?: string;
  variant?: 'emerald' | 'amber' | 'blue' | 'slate';
}
function ActionCard({ icon: Icon, title, body, metric, variant = 'slate' }: ActionCardProps) {
  const v = {
    emerald: { wrap: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-600', title: 'text-emerald-800', metric: 'text-emerald-700' },
    amber:   { wrap: 'bg-amber-50 border-amber-200',     icon: 'text-amber-500',   title: 'text-amber-800',   metric: 'text-amber-700'   },
    blue:    { wrap: 'bg-blue-50 border-blue-200',       icon: 'text-blue-600',    title: 'text-blue-800',    metric: 'text-blue-700'    },
    slate:   { wrap: 'bg-slate-50 border-slate-200',     icon: 'text-slate-500',   title: 'text-slate-700',   metric: 'text-slate-600'   },
  }[variant];
  return (
    <div className={`border rounded-xl p-4 ${v.wrap}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${v.icon}`} />
        <div>
          <p className={`text-sm font-semibold ${v.title}`}>{title}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{body}</p>
          {metric && <p className={`text-sm font-bold mt-1.5 ${v.metric}`}>{metric}</p>}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-semibold ${color ?? 'text-slate-800'}`}>{value}</span>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function InlineInput({
  label, value, onChange, placeholder, unit, note, min, max, step,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; unit?: string; note?: string;
  min?: string; max?: string; step?: string;
}) {
  return (
    <div>
      <label className="text-xs text-slate-500 font-medium block mb-1">{label}</label>
      <div className="relative">
        {unit && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{unit}</span>}
        <input
          type="number" value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? '—'}
          min={min} max={max} step={step}
          className={`w-full text-sm border border-slate-200 rounded-lg py-2 ${unit ? 'pl-7 pr-3' : 'px-3'}`}
        />
      </div>
      {note && <p className="text-[10px] text-slate-400 mt-1">{note}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OptimizationPage() {
  const [statement, setStatement] = useState<AnnualStatement | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());

  // Benchmark / config drafts
  const [draftAdr, setDraftAdr] = useState('');
  const [draftExpRatio, setDraftExpRatio] = useState('');
  const [draftCleaningFee, setDraftCleaningFee] = useState('');
  const [draftRate, setDraftRate] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [draftBalance, setDraftBalance] = useState('');
  const [savedSection, setSavedSection] = useState<string | null>(null);

  // Toggle for expense ratio detail
  const [expRatioOpen, setExpRatioOpen] = useState(false);

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
      setDraftAdr(s.benchmarkAdr ? String(s.benchmarkAdr) : '');
      setDraftExpRatio(s.benchmarkExpenseRatio ? String(s.benchmarkExpenseRatio) : '');
      setDraftCleaningFee(s.benchmarkCleaningFee ? String(s.benchmarkCleaningFee) : '');
      setDraftRate(s.mortgageRate ? String(s.mortgageRate) : '');
      setDraftValue(s.propertyValue ? String(s.propertyValue) : '');
      setDraftBalance(s.loanBalance ? String(s.loanBalance) : '');
    });
  }, []);

  async function saveSection(section: string, patch: Partial<Settings>) {
    if (!settings) return;
    const updated = { ...settings, ...patch };
    await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated),
    });
    setSettings(updated);
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  }

  // ── Formatters ───────────────────────────────────────────────────────────────

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: settings?.currency ?? 'USD', maximumFractionDigits: 0 }).format(n);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const benchmarkAdr = settings?.benchmarkAdr ?? 0;
  const benchmarkExpRatio = settings?.benchmarkExpenseRatio ?? 0;
  const benchmarkCleaningFee = settings?.benchmarkCleaningFee ?? 0;

  const activeMonths = statement?.months.filter(m => m.grossRevenue > 0) ?? [];
  const allBookings = activeMonths.flatMap(m => m.bookings);
  const totalBookings = allBookings.length;

  // ── ADR / Revenue ────────────────────────────────────────────────────────────

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

  type PlatformKey = 'airbnb' | 'vrbo' | 'booking';
  const platformStats = (['airbnb', 'vrbo', 'booking'] as PlatformKey[]).map(p => {
    const label = p === 'booking' ? 'Booking.com' : p === 'airbnb' ? 'Airbnb' : 'VRBO';
    const monthsWithData = activeMonths.filter(m => m.byPlatform[p].nights > 0);
    const adrs = monthsWithData.map(m => m.byPlatform[p].income / m.byPlatform[p].nights);
    return {
      platform: label, key: p,
      avgAdr: adrs.length ? mean(adrs) : null,
      minAdr: adrs.length ? Math.min(...adrs) : null,
      maxAdr: adrs.length ? Math.max(...adrs) : null,
      totalNights: activeMonths.reduce((s, m) => s + m.byPlatform[p].nights, 0),
      totalRevenue: activeMonths.reduce((s, m) => s + m.byPlatform[p].income, 0),
      bookings: activeMonths.reduce((s, m) => s + m.byPlatform[p].bookings, 0),
    };
  }).filter(p => p.bookings > 0);

  const totalNights = statement?.totalNights ?? 0;
  const overallAdrs = activeMonths.map(m => m.totalNights > 0 ? m.grossRevenue / m.totalNights : 0).filter(v => v > 0);
  const overallAvgAdr = overallAdrs.length ? mean(overallAdrs) : 0;
  const adrGap = benchmarkAdr > 0 ? overallAvgAdr - benchmarkAdr : null;
  const adrOpportunity = adrGap != null && adrGap < 0 && totalNights > 0
    ? Math.abs(adrGap) * totalNights
    : null;

  const activePlatforms = platformStats.filter(p => p.avgAdr != null).sort((a, b) => b.avgAdr! - a.avgAdr!);
  const lowestPlatform  = activePlatforms[activePlatforms.length - 1];
  const highestPlatform = activePlatforms[0];
  const platformGap     = activePlatforms.length > 1 ? highestPlatform.avgAdr! - lowestPlatform.avgAdr! : null;

  // Monthly ADR vs yearly average — find weakest month
  const weakestMonthData = activeMonths
    .map(m => ({ name: MONTHS[m.month - 1], adr: m.totalNights > 0 ? m.grossRevenue / m.totalNights : 0 }))
    .filter(m => m.adr > 0)
    .sort((a, b) => a.adr - b.adr)[0];

  // ── Cleaning fee analysis ────────────────────────────────────────────────────

  // Fee collected from guests (from booking records, fallback to setting)
  const cleaningFeeFromBookings = allBookings.reduce((s, b) => s + (b.cleaningFee ?? 0), 0);
  const cleaningFeeIncome = cleaningFeeFromBookings > 0
    ? cleaningFeeFromBookings
    : totalBookings * (settings?.cleaningFeePerBooking ?? 0);
  const cleaningCostPaid = statement?.expensesByCategory.cleaning ?? 0;
  const cleaningNetAnnual = cleaningFeeIncome - cleaningCostPaid;
  const cleaningFeePerStay = totalBookings > 0 ? cleaningFeeIncome / totalBookings : (settings?.cleaningFeePerBooking ?? 0);
  const cleaningCostPerStay = totalBookings > 0 ? cleaningCostPaid / totalBookings : 0;
  const cleaningNetPerStay = cleaningFeePerStay - cleaningCostPerStay;

  // ── PITI analysis ────────────────────────────────────────────────────────────

  const annualPITI = (settings?.monthlyPITI ?? 0) * 12;
  const grossRevenue = statement?.grossRevenue ?? 0;
  const pitiPctRevenue = grossRevenue > 0 ? (annualPITI / grossRevenue) * 100 : 0;

  const mortgageRate = parseFloat(draftRate) || 0;
  const propertyValue = parseFloat(draftValue) || 0;
  const loanBalance = parseFloat(draftBalance) || 0;

  // PMI: applies when LTV > 80%
  const ltv = propertyValue > 0 && loanBalance > 0 ? (loanBalance / propertyValue) * 100 : null;
  const hasPMI = ltv != null && ltv > 80;
  const estimatedPMI = hasPMI ? loanBalance * 0.01 : 0; // ~1% of loan balance/yr

  // Refinance: show savings for 0.5% and 1% rate reduction
  const refiSavings05 = loanBalance > 0 && mortgageRate > 0
    ? (loanBalance * 0.005) / 12 // monthly savings at 0.5% rate reduction
    : null;
  const refiSavings10 = loanBalance > 0 && mortgageRate > 0
    ? (loanBalance * 0.01) / 12
    : null;

  // ── Expense ratio ────────────────────────────────────────────────────────────

  const expenseRatios = activeMonths.map(m => (m.totalOperatingExpenses / m.grossRevenue) * 100);
  const avgExpRatio = mean(expenseRatios);
  const sdExpRatio  = stdDev(expenseRatios, avgExpRatio);
  const outlierThreshold = avgExpRatio + 1.5 * sdExpRatio;

  const expChartData = activeMonths.map((m, i) => ({
    name: MONTHS[m.month - 1],
    ratio: Math.round(expenseRatios[i] * 10) / 10,
    isOutlier: expenseRatios[i] > outlierThreshold && sdExpRatio > 2,
  }));

  const hasData = activeMonths.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-6 h-6 text-emerald-600" />
            Optimization
          </h1>
          <p className="text-slate-500 text-sm mt-1">{settings?.propertyName}</p>
        </div>
        <select
          value={year}
          onChange={e => setYear(parseInt(e.target.value))}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {!hasData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          No booking data found for {year}. Import earnings to see optimization insights.
        </div>
      )}

      {hasData && (
        <>
          {/* ════════════════════════════════════════════════════════════════ */}
          {/* SECTION 1: REVENUE OPTIMIZATION                                 */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <SectionHeader title="Revenue Optimization" />

          {/* Opportunity banner */}
          {adrOpportunity != null && adrOpportunity > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 mb-6 flex items-center gap-4">
              <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Revenue Opportunity Detected</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Your ADR is {fmt(Math.abs(adrGap!))} below the sub-market benchmark ({fmt(benchmarkAdr)}/night).
                  Closing that gap across {totalNights} booked nights would add{' '}
                  <span className="font-bold">{fmt(adrOpportunity)}/year</span> to your top line.
                </p>
              </div>
            </div>
          )}

          {/* ADR by Platform chart */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">ADR by Platform — Monthly Trend</h3>
            <p className="text-xs text-slate-400 mb-4">
              Consistent gaps between platforms signal a pricing or listing quality opportunity on the lower-performing channel.
            </p>

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-4">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={adrChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v: unknown) => v != null ? fmt(Number(v)) : '—'} />
                  <Legend />
                  {(['Airbnb', 'VRBO', 'Booking.com'] as const).map(p => (
                    <Line key={p} type="monotone" dataKey={p}
                      stroke={PLATFORM_COLORS[p]} strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 0 }} connectNulls={false}
                      hide={!platformStats.some(s => s.platform === p)}
                    />
                  ))}
                  <Line type="monotone" dataKey="Your ADR" stroke="#10b981" strokeWidth={2.5}
                    strokeDasharray="6 3" dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }} connectNulls />
                  {benchmarkAdr > 0 && (
                    <Line type="monotone" dataKey="Benchmark" stroke="#94a3b8" strokeWidth={1.5}
                      strokeDasharray="4 4" dot={false} name="Sub-Market ADR" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

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
                        <td className="px-5 py-3 text-right text-slate-500">{p.minAdr != null ? fmt(p.minAdr) : '—'}</td>
                        <td className="px-5 py-3 text-right text-slate-500">{p.maxAdr != null ? fmt(p.maxAdr) : '—'}</td>
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
          </div>

          {/* ADR vs Sub-Market + config */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Benchmarking Your ADR</h3>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-400 mb-1">Your Avg ADR</p>
                <p className="text-2xl font-bold text-slate-900">{overallAvgAdr > 0 ? fmt(overallAvgAdr) : '—'}</p>
                <p className="text-[10px] text-slate-400 mt-1">per night</p>
              </div>
              <div className={`rounded-lg p-4 text-center ${benchmarkAdr > 0 ? (adrGap! >= 0 ? 'bg-emerald-50' : 'bg-amber-50') : 'bg-slate-50'}`}>
                <p className="text-xs text-slate-400 mb-1">Sub-Market Benchmark</p>
                <p className={`text-2xl font-bold ${benchmarkAdr > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                  {benchmarkAdr > 0 ? fmt(benchmarkAdr) : 'Not set'}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">per night</p>
              </div>
              <div className={`rounded-lg p-4 text-center ${adrGap == null ? 'bg-slate-50' : adrGap >= 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <p className="text-xs text-slate-400 mb-1">Gap</p>
                <p className={`text-2xl font-bold ${adrGap == null ? 'text-slate-300' : adrGap >= 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                  {adrGap == null ? '—' : `${adrGap >= 0 ? '+' : ''}${fmt(adrGap)}`}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">vs benchmark</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
              <InlineInput
                label="Sub-Market ADR ($/night)"
                value={draftAdr} onChange={setDraftAdr}
                placeholder="e.g. 175" unit="$"
                note="From AirDNA, PriceLabs, or local market data"
              />
              <div className="flex items-end">
                <button
                  onClick={() => saveSection('adr', {
                    benchmarkAdr: parseFloat(draftAdr) || undefined,
                  })}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700"
                >
                  {savedSection === 'adr' ? <><Check className="w-4 h-4" /> Saved</> : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {/* Revenue action items */}
          <div className="mb-10">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">How to Increase Your ADR</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {adrGap != null && adrGap < 0 && (
                <ActionCard
                  icon={TrendingUp}
                  title="Close the Sub-Market Gap"
                  body={`You're ${fmt(Math.abs(adrGap))}/night below the sub-market benchmark. Auditing your listing title, hero photo, and amenity list can drive ADR up 10–20% without additional overhead.`}
                  metric={adrOpportunity ? `+${fmt(adrOpportunity)}/yr if gap closed` : undefined}
                  variant="emerald"
                />
              )}
              {platformGap != null && platformGap > 15 && lowestPlatform && (
                <ActionCard
                  icon={Target}
                  title={`Optimize ${lowestPlatform.platform} Listing`}
                  body={`${highestPlatform.platform} earns ${fmt(platformGap)}/night more than ${lowestPlatform.platform}. Refresh your photos, tighten your description, and align pricing rules on the lower-performing platform.`}
                  metric={`${lowestPlatform.platform} avg: ${fmt(lowestPlatform.avgAdr!)}/nt`}
                  variant="amber"
                />
              )}
              {weakestMonthData && overallAvgAdr > 0 && weakestMonthData.adr < overallAvgAdr * 0.8 && (
                <ActionCard
                  icon={Zap}
                  title={`Lift ${weakestMonthData.name} with Seasonal Pricing`}
                  body={`${weakestMonthData.name} ADR of ${fmt(weakestMonthData.adr)} is your weakest month — ${pct(((overallAvgAdr - weakestMonthData.adr) / overallAvgAdr) * 100)} below your annual average. Proactive pricing and minimum-stay rules in shoulder months can close this gap.`}
                  variant="blue"
                />
              )}
              <ActionCard
                icon={Zap}
                title="Dynamic Pricing Tools"
                body="PriceLabs, Wheelhouse, and DPGO sync with Airbnb and VRBO to automatically adjust nightly rates based on demand, local events, and competitor pricing — typically lifting ADR 10–15%."
                variant="slate"
              />
              <ActionCard
                icon={Users}
                title="Longer-Stay Minimum Rules"
                body="Setting a 2–3 night minimum for weekends reduces turnover cost, increases effective ADR, and improves occupancy. Most platforms allow gap-night pricing rules to fill single-night holes."
                variant="slate"
              />
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* SECTION 2: EXPENSE OPTIMIZATION                                 */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <SectionHeader title="Expense Optimization" />

          {/* 2a: Cleaning Fee */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Cleaning Fee — Turn It Into a Profit Center</h3>
            <p className="text-xs text-slate-400 mb-4">
              A well-structured cleaning fee should cover your cleaning costs and generate net income. If it doesn't, you're subsidizing every stay.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Stats card */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Per-Stay Breakdown</p>
                <StatRow label="Cleaning fee charged" value={fmt(cleaningFeePerStay)} sub="per stay (guest-facing)" color="text-emerald-700" />
                <StatRow label="Cleaning cost paid" value={`(${fmt(cleaningCostPerStay)})`} sub="per stay (to cleaner)" color="text-red-500" />
                <div className={`mt-3 pt-3 border-t border-slate-100 flex justify-between items-center`}>
                  <span className="text-sm font-semibold text-slate-700">Net per stay</span>
                  <span className={`text-lg font-bold ${cleaningNetPerStay >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {cleaningNetPerStay >= 0 ? fmt(cleaningNetPerStay) : `(${fmt(Math.abs(cleaningNetPerStay))})`}
                  </span>
                </div>
              </div>
              {/* Annual totals */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Annual ({totalBookings} stays)</p>
                <StatRow label="Fees collected" value={fmt(cleaningFeeIncome)} color="text-emerald-700" />
                <StatRow label="Costs paid out" value={`(${fmt(cleaningCostPaid)})`} color="text-red-500" />
                <div className={`mt-3 pt-3 border-t border-slate-100 flex justify-between items-center`}>
                  <span className="text-sm font-semibold text-slate-700">Net cleaning income</span>
                  <span className={`text-lg font-bold ${cleaningNetAnnual >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {cleaningNetAnnual >= 0 ? `+${fmt(cleaningNetAnnual)}` : `(${fmt(Math.abs(cleaningNetAnnual))})`}
                  </span>
                </div>
              </div>
            </div>

            {/* Opportunity + benchmark config */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  {cleaningNetPerStay < 0 ? (
                    <ActionCard
                      icon={AlertTriangle}
                      title="Cleaning Fee Below Cost"
                      body={`You're absorbing ${fmt(Math.abs(cleaningNetPerStay))}/stay in cleaning costs. Increasing your fee to ${fmt(cleaningCostPerStay + 25)} would cover costs and produce a small profit margin.`}
                      metric={`Annual drag: ${fmt(Math.abs(cleaningNetAnnual))}`}
                      variant="amber"
                    />
                  ) : (
                    <ActionCard
                      icon={Check}
                      title="Cleaning Fee Is a Profit Center"
                      body={`Your cleaning fee generates ${fmt(cleaningNetPerStay)}/stay after cleaner costs — a well-structured approach. Benchmark against sub-market rates to ensure you're not leaving revenue on the table.`}
                      metric={`Annual net: +${fmt(cleaningNetAnnual)}`}
                      variant="emerald"
                    />
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-3">Sub-Market Cleaning Fee Benchmark</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <InlineInput
                      label="Sub-market fee/stay"
                      value={draftCleaningFee} onChange={setDraftCleaningFee}
                      placeholder="e.g. 150" unit="$"
                      note="Avg cleaning fee in your market"
                    />
                    <div className="flex flex-col justify-end">
                      {benchmarkCleaningFee > 0 && (
                        <p className="text-xs text-slate-500 mb-2">
                          You charge {fmt(cleaningFeePerStay)} vs {fmt(benchmarkCleaningFee)} sub-market.{' '}
                          <span className={cleaningFeePerStay >= benchmarkCleaningFee ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                            {cleaningFeePerStay >= benchmarkCleaningFee ? 'At or above market.' : `${fmt(benchmarkCleaningFee - cleaningFeePerStay)}/stay below.`}
                          </span>
                        </p>
                      )}
                      <button
                        onClick={() => saveSection('cleaning', { benchmarkCleaningFee: parseFloat(draftCleaningFee) || undefined })}
                        className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 w-fit"
                      >
                        {savedSection === 'cleaning' ? <><Check className="w-4 h-4" /> Saved</> : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2b: PITI */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">PITI — Reduce Your Biggest Fixed Cost</h3>
            <p className="text-xs text-slate-400 mb-4">
              PITI (principal, interest, taxes, insurance) is typically the largest cost in an STR. Three levers can reduce it: refinancing, PMI removal, and insurance review.
            </p>

            {/* PITI overview */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-center">
                <p className="text-xs text-slate-400 mb-1">Monthly PITI</p>
                <p className="text-2xl font-bold text-slate-900">{fmt(settings?.monthlyPITI ?? 0)}</p>
                <p className="text-[10px] text-slate-400 mt-1">from settings</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-center">
                <p className="text-xs text-slate-400 mb-1">Annual PITI</p>
                <p className="text-2xl font-bold text-slate-900">{fmt(annualPITI)}</p>
                <p className="text-[10px] text-slate-400 mt-1">total fixed cost</p>
              </div>
              <div className={`rounded-xl border shadow-sm p-4 text-center ${
                pitiPctRevenue > 60 ? 'bg-red-50 border-red-200' : pitiPctRevenue > 40 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
              }`}>
                <p className="text-xs text-slate-400 mb-1">PITI % of Revenue</p>
                <p className={`text-2xl font-bold ${pitiPctRevenue > 60 ? 'text-red-700' : pitiPctRevenue > 40 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {grossRevenue > 0 ? pct(pitiPctRevenue) : '—'}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {pitiPctRevenue > 60 ? 'High — revenue may be constrained' : pitiPctRevenue > 40 ? 'Medium — watch closely' : 'Good ratio'}
                </p>
              </div>
            </div>

            {/* Mortgage detail inputs + opportunities */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Mortgage Details (optional — unlocks opportunity analysis)</p>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <InlineInput
                  label="Current Interest Rate (%)"
                  value={draftRate} onChange={setDraftRate}
                  placeholder="e.g. 7.25" unit="%" min="0" max="30" step="0.125"
                  note="Your current mortgage rate"
                />
                <InlineInput
                  label="Property Value ($)"
                  value={draftValue} onChange={setDraftValue}
                  placeholder="e.g. 500000" unit="$"
                  note="Current estimated market value"
                />
                <InlineInput
                  label="Loan Balance ($)"
                  value={draftBalance} onChange={setDraftBalance}
                  placeholder="e.g. 380000" unit="$"
                  note="Outstanding mortgage balance"
                />
              </div>
              <div className="flex items-center gap-3 mb-5">
                <button
                  onClick={() => saveSection('piti', {
                    mortgageRate: parseFloat(draftRate) || undefined,
                    propertyValue: parseFloat(draftValue) || undefined,
                    loanBalance: parseFloat(draftBalance) || undefined,
                  })}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700"
                >
                  {savedSection === 'piti' ? <><Check className="w-4 h-4" /> Saved</> : 'Save Details'}
                </button>
                {ltv != null && (
                  <span className="text-xs text-slate-500">LTV: <span className={`font-semibold ${ltv > 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{pct(ltv)}</span></span>
                )}
              </div>

              {/* Opportunity cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-100 pt-5">
                {/* Refinance */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Interest Rate Reduction</p>
                  {mortgageRate > 0 && loanBalance > 0 ? (
                    <>
                      <p className="text-xs text-slate-500 mb-3">Current rate: <span className="font-semibold">{mortgageRate}%</span></p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">−0.5% rate reduction</span>
                          <span className="font-semibold text-emerald-700">+{fmt(refiSavings05!)}/mo</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">−1.0% rate reduction</span>
                          <span className="font-semibold text-emerald-700">+{fmt(refiSavings10!)}/mo</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2">Compare rates at your bank, credit union, and mortgage brokers annually.</p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">Enter your interest rate and loan balance above to see refinance savings estimates.</p>
                  )}
                </div>

                {/* PMI */}
                <div className={`rounded-xl p-4 ${hasPMI ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                  <p className="text-xs font-semibold text-slate-600 mb-2">PMI Removal</p>
                  {ltv != null ? (
                    hasPMI ? (
                      <>
                        <p className="text-xs text-amber-700 mb-2">LTV is {pct(ltv)} — you may be paying PMI.</p>
                        <p className="text-sm font-bold text-amber-700">~{fmt(estimatedPMI)}/yr</p>
                        <p className="text-[10px] text-slate-500 mt-1">Estimated 1% of loan balance. Request removal when LTV reaches 80% via paydown or appraisal.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-emerald-700 mb-1">LTV is {pct(ltv)} — below 80%.</p>
                        <p className="text-[10px] text-slate-500">PMI typically doesn&apos;t apply. Confirm with your lender.</p>
                      </>
                    )
                  ) : (
                    <p className="text-xs text-slate-400">Enter property value and loan balance to evaluate PMI status.</p>
                  )}
                </div>

                {/* Insurance */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Insurance Review</p>
                  <p className="text-xs text-slate-500 mb-2">STR-specific landlord policies vary significantly. Annual review opportunities:</p>
                  <ul className="text-[11px] text-slate-500 space-y-1">
                    <li>• Shop 3 STR-specific carriers annually</li>
                    <li>• Bundle with auto/umbrella for discounts</li>
                    <li>• Verify Airbnb AirCover overlap to avoid double coverage</li>
                    <li>• Review liability limits (typically $1M+)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* 2c: Property Management */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Property Management — Know Your True Cost</h3>
            <p className="text-xs text-slate-400 mb-4">
              Management fees are a direct hit to net cash flow. Modeled on your actual {year} gross revenue of {fmt(grossRevenue)}.
            </p>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white text-left">
                    <th className="px-5 py-3 font-medium">Option</th>
                    <th className="px-5 py-3 font-medium text-right">Fee</th>
                    <th className="px-5 py-3 font-medium text-right">Annual Cost</th>
                    <th className="px-5 py-3 font-medium text-right">Net Revenue</th>
                    <th className="px-5 py-3 font-medium">What You Give Up</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100 bg-emerald-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">Self-Management</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">You handle guest comms, check-in, maintenance</p>
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-emerald-700">0%</td>
                    <td className="px-5 py-4 text-right font-bold text-emerald-700">$0</td>
                    <td className="px-5 py-4 text-right font-bold text-emerald-700">{fmt(grossRevenue)}</td>
                    <td className="px-5 py-4 text-xs text-slate-500">Time, availability, on-call stress</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">Low-Cost / Tech PM</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Evolve, Vacasa Lite, Guesty + local team</p>
                    </td>
                    <td className="px-5 py-4 text-right text-slate-700">10–15%</td>
                    <td className="px-5 py-4 text-right text-amber-700">
                      {fmt(grossRevenue * 0.10)}–{fmt(grossRevenue * 0.15)}
                    </td>
                    <td className="px-5 py-4 text-right text-slate-700">
                      {fmt(grossRevenue * 0.85)}–{fmt(grossRevenue * 0.90)}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">Some control, limited local presence</td>
                  </tr>
                  <tr>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">Full-Service PM</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Local PM company, fully hands-off</p>
                    </td>
                    <td className="px-5 py-4 text-right text-slate-700">20–25%</td>
                    <td className="px-5 py-4 text-right text-red-600">
                      {fmt(grossRevenue * 0.20)}–{fmt(grossRevenue * 0.25)}
                    </td>
                    <td className="px-5 py-4 text-right text-slate-700">
                      {fmt(grossRevenue * 0.75)}–{fmt(grossRevenue * 0.80)}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">Revenue (fees often reduce listing performance)</td>
                  </tr>
                </tbody>
              </table>
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
                Note: PM fees are on gross revenue. Many PMs also charge additional fees for maintenance coordination, supply restocking, and owner statements — always get a full fee schedule.
              </div>
            </div>
          </div>

          {/* 2d: Expense Ratio Trend */}
          <div className="mb-4">
            <button
              className="flex items-center justify-between w-full text-sm font-semibold text-slate-700 mb-3"
              onClick={() => setExpRatioOpen(v => !v)}
            >
              <span>Expense Ratio — Monthly Trend</span>
              <span className="flex items-center gap-1 text-xs text-slate-400 font-normal">
                {expRatioOpen ? <><ChevronUp className="w-3.5 h-3.5" /> Hide</> : <><ChevronDown className="w-3.5 h-3.5" /> Show</>}
              </span>
            </button>

            {expRatioOpen && (
              <>
                <p className="text-xs text-slate-400 mb-4">
                  Operating expenses as a percentage of gross revenue per month. Industry typical: {INDUSTRY_EXP_MIN}–{INDUSTRY_EXP_MAX}%.
                </p>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={expChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v}%`} domain={[0, 'auto']} />
                      <Tooltip formatter={(v: unknown) => `${Number(v).toFixed(1)}%`} />
                      <Bar dataKey="ratio" name="Expense Ratio" radius={[3, 3, 0, 0]}>
                        {expChartData.map((d, i) => (
                          <Cell key={i} fill={d.isOutlier ? '#ef4444' : d.ratio > INDUSTRY_EXP_MAX ? '#f97316' : '#64748b'} />
                        ))}
                      </Bar>
                      <ReferenceLine y={avgExpRatio} stroke="#10b981" strokeDasharray="5 3"
                        label={{ value: `Avg ${pct(avgExpRatio)}`, fill: '#10b981', fontSize: 11, position: 'insideTopRight' }} />
                      {sdExpRatio > 2 && (
                        <ReferenceLine y={outlierThreshold} stroke="#f97316" strokeDasharray="4 4"
                          label={{ value: `Alert ${pct(outlierThreshold)}`, fill: '#f97316', fontSize: 11, position: 'insideTopRight' }} />
                      )}
                      <ReferenceLine y={INDUSTRY_EXP_MAX} stroke="#94a3b8" strokeDasharray="3 3"
                        label={{ value: `Industry max ${INDUSTRY_EXP_MAX}%`, fill: '#94a3b8', fontSize: 10, position: 'insideBottomRight' }} />
                      {benchmarkExpRatio > 0 && (
                        <ReferenceLine y={benchmarkExpRatio} stroke="#6366f1" strokeDasharray="5 3"
                          label={{ value: `Sub-market ${pct(benchmarkExpRatio)}`, fill: '#6366f1', fontSize: 11, position: 'insideTopLeft' }} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 grid grid-cols-2 gap-4">
                  <InlineInput
                    label="Sub-Market Expense Ratio (%)"
                    value={draftExpRatio} onChange={setDraftExpRatio}
                    placeholder="e.g. 38" unit="%" min="0" max="100"
                    note={`Typical STR operating expenses: ${INDUSTRY_EXP_MIN}–${INDUSTRY_EXP_MAX}%`}
                  />
                  <div className="flex items-end">
                    <button
                      onClick={() => saveSection('exp', { benchmarkExpenseRatio: parseFloat(draftExpRatio) || undefined })}
                      className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700"
                    >
                      {savedSection === 'exp' ? <><Check className="w-4 h-4" /> Saved</> : 'Save'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
