'use client';
import { useEffect, useRef, useState } from 'react';
import { AnnualStatement, MonthlyStatement, Settings, Platform } from '@/types';
import StatCard from '@/components/StatCard';
import { TrendingUp, X, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell,
} from 'recharts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const PLATFORM_COLORS: Record<string, string> = {
  airbnb: '#f43f5e',
  booking: '#3b82f6',
  vrbo: '#6366f1',
};

type TooltipEntry = { payload: Record<string, number | null> };

function ChartTooltip({
  active, payload, label, fmt,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  fmt: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const gross = d._gross as number | null;
  const target = d['Monthly Target'] as number | null;
  const bookedRevenue = ((d.Airbnb ?? 0) as number) + ((d['Booking.com'] ?? 0) as number) + ((d.VRBO ?? 0) as number);
  const hasActual = gross != null;
  const hasPreBooked = !hasActual && bookedRevenue > 0;
  if (!hasActual && !hasPreBooked && target == null) return null;

  const variance = hasActual && target ? gross! - target : null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm min-w-[190px]">
      <p className="font-semibold text-slate-800 mb-2">{label}</p>
      {hasActual && (
        <div className="flex justify-between gap-6">
          <span className="text-slate-500">Revenue</span>
          <span className="font-medium">{fmt(gross!)}</span>
        </div>
      )}
      {hasPreBooked && (
        <div className="flex justify-between gap-6">
          <span className="text-slate-500">On books</span>
          <span className="font-medium text-slate-600">{fmt(bookedRevenue)}</span>
        </div>
      )}
      {target != null && (
        <div className={`flex justify-between gap-6 ${hasActual || hasPreBooked ? 'border-t border-slate-100 mt-2 pt-2' : ''}`}>
          <span className="text-slate-500">Monthly Target</span>
          <span className="font-medium text-slate-600">{fmt(target)}</span>
        </div>
      )}
      {variance != null && (
        <div className="flex justify-between gap-6">
          <span className="text-slate-500">vs. Target</span>
          <span className={`font-semibold ${variance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {variance >= 0 ? '+' : ''}{fmt(variance)}
          </span>
        </div>
      )}
    </div>
  );
}

function PlatformTable({
  byPlatform, totalRevenue, fmt,
}: {
  byPlatform: AnnualStatement['byPlatform'] | MonthlyStatement['byPlatform'];
  totalRevenue: number;
  fmt: (n: number) => string;
}) {
  const rows = Object.entries(byPlatform)
    .filter(([, v]) => v.income > 0)
    .sort(([, a], [, b]) => b.income - a.income) as [Platform, { income: number; nights: number; bookings: number }][];
  if (!rows.length) return null;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b border-slate-100">
          <th className="pb-2 font-medium">Platform</th>
          <th className="pb-2 font-medium text-right">Bookings</th>
          <th className="pb-2 font-medium text-right">Nights</th>
          <th className="pb-2 font-medium text-right">Gross Revenue</th>
          <th className="pb-2 font-medium text-right">% of Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([platform, data]) => (
          <tr key={platform} className="border-b border-slate-50">
            <td className="py-2 capitalize font-medium">{platform === 'booking' ? 'Booking.com' : platform}</td>
            <td className="py-2 text-right text-slate-600">{data.bookings}</td>
            <td className="py-2 text-right text-slate-600">{data.nights}</td>
            <td className="py-2 text-right font-semibold text-slate-800">{fmt(data.income)}</td>
            <td className="py-2 text-right text-slate-500">
              {totalRevenue > 0 ? ((data.income / totalRevenue) * 100).toFixed(1) : 0}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type PnLData = Pick<MonthlyStatement, 'grossRevenue' | 'platformFees' | 'fastPayFees' | 'taxRemitted' | 'refunds' | 'netRevenue' | 'ownerTaxes' | 'totalOperatingExpenses' | 'operatingIncome' | 'piti' | 'netIncome'>;

function PnLTable({ m, fmt }: { m: PnLData; fmt: (n: number) => string }) {
  // Operating expenses minus the owner-remitted taxes shown separately above the total
  const otherOpEx = m.totalOperatingExpenses - m.ownerTaxes;
  const rows: { label: string; value: number; indent?: boolean; negative?: boolean; bold?: boolean; separator?: boolean; accent?: boolean }[] = [
    { label: 'Gross Revenue', value: m.grossRevenue },
    ...(m.platformFees > 0 ? [{ label: 'Platform Fees', value: m.platformFees, indent: true, negative: true }] : []),
    ...(m.fastPayFees > 0 ? [{ label: 'Fast Pay Fees', value: m.fastPayFees, indent: true, negative: true }] : []),
    ...(m.taxRemitted > 0 ? [{ label: 'Tax Retained by Platform', value: m.taxRemitted, indent: true, negative: true }] : []),
    ...(m.refunds > 0 ? [{ label: 'Guest Refunds', value: m.refunds, indent: true, negative: true }] : []),
    { label: 'Net Revenue', value: m.netRevenue, bold: true, separator: true },
    ...(m.ownerTaxes > 0 ? [{ label: 'State & Local Taxes (Owner Remits)', value: m.ownerTaxes, indent: true, negative: true }] : []),
    ...(otherOpEx > 0 ? [{ label: 'Other Operating Expenses', value: otherOpEx, indent: true, negative: true }] : []),
    { label: 'Operating Income', value: m.operatingIncome, bold: true, separator: true, accent: true },
    ...(m.piti > 0 ? [{ label: 'PITI', value: m.piti, negative: true, indent: true }] : []),
    { label: 'Net Income', value: m.netIncome, bold: true, separator: true, accent: true },
  ];

  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={`${r.separator ? 'border-t-2 border-slate-200' : 'border-t border-slate-50'} ${r.bold ? 'font-semibold' : ''}`}>
            <td className={`py-2 text-slate-700 ${r.indent ? 'pl-6 text-slate-500 text-xs' : ''}`}>{r.label}</td>
            <td className={`py-2 text-right text-sm ${
              r.accent ? (r.value >= 0 ? 'text-emerald-700' : 'text-red-600') :
              r.negative ? 'text-red-500' :
              r.bold ? 'text-slate-800' : 'text-slate-600'
            }`}>
              {(r.negative && r.value > 0) ? `(${fmt(r.value)})` : fmt(r.value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MonthPnL({ m, fmt }: { m: MonthlyStatement; fmt: (n: number) => string }) {
  return <PnLTable m={m} fmt={fmt} />;
}

export default function Dashboard() {
  const [statement, setStatement] = useState<AnnualStatement | null>(null);
  const [prevStatement, setPrevStatement] = useState<AnnualStatement | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // 0-indexed
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [editingSeasonality, setEditingSeasonality] = useState(false);
  const [seasonalityInputs, setSeasonalityInputs] = useState<string[]>(Array(12).fill(''));
  const [editingOccTarget, setEditingOccTarget] = useState(false);
  const [occTargetInput, setOccTargetInput] = useState('');
  const [editingAdrTarget, setEditingAdrTarget] = useState(false);
  const [adrTargetInput, setAdrTargetInput] = useState('');

  const seasonalityInputsRef = useRef(seasonalityInputs);
  seasonalityInputsRef.current = seasonalityInputs;
  const seasonalitySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const now = new Date();
  const year = now.getFullYear();
  const currentMonthIdx = now.getMonth();

  useEffect(() => {
    fetch('/api/income-statement?year=' + year)
      .then(r => r.json())
      .then(d => setStatement(d.statement));
    fetch('/api/income-statement?year=' + (year - 1)).then(r => r.json()).then(d => setPrevStatement(d.statement));
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, []);


  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: settings?.currency ?? 'USD', maximumFractionDigits: 0 }).format(n);

  // YTD stats
  const ytdMonths = statement?.months.slice(0, currentMonthIdx + 1) ?? [];
  const ytdGross = ytdMonths.reduce((s, m) => s + m.grossRevenue, 0);
  const ytdNetIncome = ytdMonths.reduce((s, m) => s + m.netIncome, 0);
  const ytdNights = ytdMonths.reduce((s, m) => s + m.totalNights, 0);
  const ytdOccupancy = ytdMonths.length > 0 ? ytdMonths.reduce((s, m) => s + m.occupancyRate, 0) / ytdMonths.length : 0;
  const ytdAdr = ytdNights > 0 ? ytdGross / ytdNights : null;
  const ytdPnL: PnLData = {
    grossRevenue: ytdGross,
    platformFees: ytdMonths.reduce((s, m) => s + m.platformFees, 0),
    fastPayFees: ytdMonths.reduce((s, m) => s + m.fastPayFees, 0),
    taxRemitted: ytdMonths.reduce((s, m) => s + m.taxRemitted, 0),
    refunds: ytdMonths.reduce((s, m) => s + m.refunds, 0),
    netRevenue: ytdMonths.reduce((s, m) => s + m.netRevenue, 0),
    ownerTaxes: ytdMonths.reduce((s, m) => s + m.ownerTaxes, 0),
    totalOperatingExpenses: ytdMonths.reduce((s, m) => s + m.totalOperatingExpenses, 0),
    operatingIncome: ytdMonths.reduce((s, m) => s + m.operatingIncome, 0),
    piti: ytdMonths.reduce((s, m) => s + m.piti, 0),
    netIncome: ytdNetIncome,
  };

  // Aggregate YTD byPlatform for the platform table
  const ytdByPlatform = ytdMonths.reduce((acc, m) => {
    (Object.keys(m.byPlatform) as Platform[]).forEach(p => {
      if (!acc[p]) acc[p] = { income: 0, nights: 0, bookings: 0 };
      acc[p].income += m.byPlatform[p].income;
      acc[p].nights += m.byPlatform[p].nights;
      acc[p].bookings += m.byPlatform[p].bookings;
    });
    return acc;
  }, {} as Record<Platform, { income: number; nights: number; bookings: number }>);

  // Selected month data
  const selMonth: MonthlyStatement | null = (selectedMonth !== null && statement) ? statement.months[selectedMonth] : null;
  const selAvgStay = selMonth && selMonth.bookings.filter(b => b.income > 0).length > 0 ? selMonth.totalNights / selMonth.bookings.filter(b => b.income > 0).length : null;

  const growthPct = settings?.forecastGrowthByYear?.[String(year)] ?? settings?.forecastGrowthPct ?? 0;
  const growthFactor = growthPct / 100;

  // Manual annual target from forecast overrides (same field the LT Forecast page uses)
  const manualTarget = settings?.forecastOverrides?.[String(year)]?.revenue ?? null;

  // Stored prior-year monthly actuals for seasonality — takes precedence over database records
  const storedPriorMonthly = settings?.forecastOverrides?.[String(year - 1)]?.monthlyRevenue ?? null;
  const effectivePriorMonthly: number[] | null =
    storedPriorMonthly ?? (prevStatement ? prevStatement.months.map(m => m.grossRevenue) : null);
  const effectivePriorAnnual = effectivePriorMonthly?.reduce((s, v) => s + v, 0) ?? 0;
  const effectiveMonthsWithData = effectivePriorMonthly?.filter(v => v > 0).length ?? 0;
  const prevHasData = effectiveMonthsWithData > 0;
  const useSeasonality = effectivePriorAnnual > 0;

  async function saveTarget() {
    if (!settings) return;
    const val = parseFloat(targetInput);
    if (isNaN(val) || val <= 0) return;
    const overrides = { ...(settings.forecastOverrides ?? {}) };
    overrides[String(year)] = { ...(overrides[String(year)] ?? {}), revenue: val };
    const updated = { ...settings, forecastOverrides: overrides };
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    setSettings(updated);
    setEditingTarget(false);
  }

  async function saveSeasonality() {
    if (!settings) return;
    const values = seasonalityInputsRef.current.map(v => parseFloat(v.replace(/,/g, '')) || 0);
    const priorYear = String(year - 1);
    const overrides = { ...(settings.forecastOverrides ?? {}) };
    overrides[priorYear] = { ...(overrides[priorYear] ?? {}), monthlyRevenue: values };
    const updated = { ...settings, forecastOverrides: overrides };
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    setSettings(updated);
  }

  function scheduleSeasonalitySave() {
    if (seasonalitySaveTimerRef.current) clearTimeout(seasonalitySaveTimerRef.current);
    seasonalitySaveTimerRef.current = setTimeout(saveSeasonality, 200);
  }
  function cancelSeasonalitySave() {
    if (seasonalitySaveTimerRef.current) { clearTimeout(seasonalitySaveTimerRef.current); seasonalitySaveTimerRef.current = null; }
  }

  async function saveOccTarget() {
    if (!settings) return;
    const val = parseFloat(occTargetInput);
    if (isNaN(val)) return;
    const updated = { ...settings, targetOccupancyPct: val };
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    setSettings(updated);
    setEditingOccTarget(false);
  }

  async function saveAdrTarget() {
    if (!settings) return;
    const val = parseFloat(adrTargetInput);
    if (isNaN(val)) return;
    const updated = { ...settings, targetAdr: val };
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    setSettings(updated);
    setEditingAdrTarget(false);
  }

  function openSeasonalityEditor() {
    const existing = storedPriorMonthly ?? effectivePriorMonthly ?? Array(12).fill(0);
    setSeasonalityInputs(existing.map(v => v > 0 ? String(v) : ''));
    setEditingSeasonality(true);
    setEditingTarget(false);
  }

  // For seasonal distribution: zero-history months get the flat rate; the remaining
  // budget is split proportionally among months that had prior revenue.
  const priorNonZeroTotal = effectivePriorMonthly?.reduce((s, v) => s + v, 0) ?? 0;
  const priorZeroCount = effectivePriorMonthly?.filter(v => v === 0).length ?? 0;

  const monthlyForecasts: (number | null)[] = Array.from({ length: 12 }, (_, i) => {
    if (manualTarget) {
      if (useSeasonality && effectivePriorMonthly) {
        const prev = effectivePriorMonthly[i];
        const flatMonth = manualTarget / 12;
        if (prev === 0 || priorNonZeroTotal === 0) return Math.round(flatMonth);
        const proportionalBudget = manualTarget * ((12 - priorZeroCount) / 12);
        return Math.round(proportionalBudget * (prev / priorNonZeroTotal));
      }
      return Math.round(manualTarget / 12);
    }
    if (!effectivePriorMonthly) return null;
    const prev = effectivePriorMonthly[i];
    const straightLine = effectivePriorAnnual > 0 ? Math.round((effectivePriorAnnual / 12) * (1 + growthFactor)) : null;
    return prev > 0 ? Math.round(prev * (1 + growthFactor)) : straightLine;
  });

  const hasTarget = manualTarget != null || effectiveMonthsWithData > 0;
  const annualForecast = hasTarget
    ? (manualTarget ?? monthlyForecasts.reduce<number>((s, v) => s + (v ?? 0), 0))
    : null;
  const ytdForecast = hasTarget
    ? monthlyForecasts.slice(0, currentMonthIdx + 1).reduce<number>((s, v) => s + (v ?? 0), 0)
    : null;
  const pacingVariance = ytdForecast != null ? ytdGross - ytdForecast : null;
  const pacingVariancePct = ytdForecast && ytdForecast > 0 ? (pacingVariance! / ytdForecast) * 100 : null;

  const chartData = statement?.months.map((m, i) => {
    const isActual = i <= currentMonthIdx;
    return {
      name: MONTHS[i],
      Airbnb: m.byPlatform.airbnb.income,
      'Booking.com': m.byPlatform.booking.income,
      VRBO: m.byPlatform.vrbo.income,
      'Monthly Target': monthlyForecasts[i],
      _gross: isActual ? m.grossRevenue : null,
    };
  }) ?? [];

  const hasData = ytdGross > 0;

  // Occupancy and ADR targets for scoring
  const targetOcc = settings?.targetOccupancyPct ?? null;
  const occVariance = targetOcc != null ? ytdOccupancy - targetOcc : null;
  const targetAdrVal = settings?.targetAdr ?? null;
  const adrVariance = targetAdrVal != null && ytdAdr != null ? ytdAdr - targetAdrVal : null;
  const adrVariancePct = adrVariance != null && targetAdrVal ? (adrVariance / targetAdrVal) * 100 : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleChartClick(data: any) {
    const idx: number | null | undefined = data?.activeTooltipIndex;
    if (idx != null) setSelectedMonth(prev => prev === idx ? null : idx);
  }


  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{settings?.propertyName ?? 'Dashboard'}</h1>
        <p className="text-slate-500 text-sm mt-1">{year} overview</p>
      </div>

      {/* Pacing + operational KPIs */}
      {!selMonth && (hasTarget || hasData) && (
        <div className={`grid gap-4 mb-6 ${hasTarget && annualForecast != null ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'}`}>
          {/* This Year + This Month — only when target is configured */}
          {hasTarget && annualForecast != null && <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">This Year Target</p>
              {!editingTarget ? (
                <button
                  onClick={() => { setTargetInput(String(manualTarget ?? Math.round(annualForecast))); setEditingTarget(true); }}
                  className="text-slate-300 hover:text-slate-500 transition-colors"
                  title="Set annual revenue target"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button onMouseDown={e => e.preventDefault()} onClick={() => setEditingTarget(false)} className="text-slate-300 hover:text-slate-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {editingTarget ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Set your {year} annual target</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">$</span>
                  <input
                    type="number"
                    value={targetInput}
                    onChange={e => setTargetInput(e.target.value)}
                    onBlur={saveTarget}
                    onKeyDown={e => e.key === 'Enter' && saveTarget()}
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5"
                    placeholder="68500"
                    autoFocus
                  />
                </div>
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold text-slate-900">{fmt(ytdGross)}</p>
                <p className="text-xs text-slate-400 mt-0.5 mb-2">of {ytdForecast != null ? fmt(ytdForecast) : '—'} YTD target</p>
                {pacingVariance != null && (
                  <span className={`inline-flex items-center gap-1 text-sm font-semibold px-2 py-1 rounded-lg ${pacingVariance >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {pacingVariance >= 0 ? '▲' : '▼'} {fmt(Math.abs(pacingVariance))}
                    {pacingVariancePct != null && <span className="font-normal text-xs ml-0.5">({Math.abs(pacingVariancePct).toFixed(1)}%)</span>}
                  </span>
                )}
              </>
            )}
          </div>}

          {/* This Month */}
          {hasTarget && annualForecast != null && monthlyForecasts[currentMonthIdx] != null && (() => {
            const monthlyActual = statement?.months[currentMonthIdx].grossRevenue ?? 0;
            const monthlyTarget = monthlyForecasts[currentMonthIdx]!;
            const monthlyVariance = monthlyActual - monthlyTarget;
            const monthlyVariancePct = monthlyTarget > 0 ? (monthlyVariance / monthlyTarget) * 100 : null;
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">{MONTHS_LONG[currentMonthIdx]} Target</p>
                  <button
                    onClick={openSeasonalityEditor}
                    className="text-slate-300 hover:text-slate-500 transition-colors"
                    title={`Edit ${year - 1} monthly actuals for seasonal distribution`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-2xl font-bold text-slate-900">{fmt(monthlyActual)}</p>
                <p className="text-xs text-slate-400 mt-0.5 mb-2">of {fmt(monthlyTarget)} target</p>
                <span className={`inline-flex items-center gap-1 text-sm font-semibold px-2 py-1 rounded-lg ${monthlyVariance >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {monthlyVariance >= 0 ? '▲' : '▼'} {fmt(Math.abs(monthlyVariance))}
                  {monthlyVariancePct != null && <span className="font-normal text-xs ml-0.5">({Math.abs(monthlyVariancePct).toFixed(1)}%)</span>}
                </span>
              </div>
            );
          })()}

          {/* Avg Occupancy */}
          {hasData && (() => {
            const targetOcc = settings?.targetOccupancyPct ?? null;
            const occVariance = targetOcc != null ? ytdOccupancy - targetOcc : null;
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Avg Occupancy</p>
                  {editingOccTarget ? (
                    <button onMouseDown={e => e.preventDefault()} onClick={() => setEditingOccTarget(false)} className="text-slate-300 hover:text-slate-500"><X className="w-3.5 h-3.5" /></button>
                  ) : (
                    <button onClick={() => { setOccTargetInput(String(targetOcc ?? '')); setEditingOccTarget(true); }} className="text-slate-300 hover:text-slate-500" title="Set occupancy target"><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                </div>
                {editingOccTarget ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">Occupancy target (%)</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" value={occTargetInput} onChange={e => setOccTargetInput(e.target.value)}
                        onBlur={saveOccTarget}
                        onKeyDown={e => e.key === 'Enter' && saveOccTarget()}
                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5" placeholder="75" autoFocus
                      />
                      <span className="text-sm text-slate-400">%</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-slate-900">{ytdOccupancy.toFixed(1)}%</p>
                    {targetOcc != null ? (
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs text-slate-400">Target {targetOcc}%</p>
                        {occVariance != null && (
                          <span className={`text-xs font-semibold ${occVariance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {occVariance >= 0 ? '▲' : '▼'} {Math.abs(occVariance).toFixed(1)}pts
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 mt-3">Year to date</p>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ADR */}
          {hasData && (() => {
            const targetAdrVal = settings?.targetAdr ?? null;
            const adrVariance = targetAdrVal != null && ytdAdr != null ? ytdAdr - targetAdrVal : null;
            const adrVariancePct = adrVariance != null && targetAdrVal ? (adrVariance / targetAdrVal) * 100 : null;
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Avg Daily Rate</p>
                  {editingAdrTarget ? (
                    <button onMouseDown={e => e.preventDefault()} onClick={() => setEditingAdrTarget(false)} className="text-slate-300 hover:text-slate-500"><X className="w-3.5 h-3.5" /></button>
                  ) : (
                    <button onClick={() => { setAdrTargetInput(String(targetAdrVal ?? '')); setEditingAdrTarget(true); }} className="text-slate-300 hover:text-slate-500" title="Set ADR target"><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                </div>
                {editingAdrTarget ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">ADR target ($)</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-400">$</span>
                      <input
                        type="number" value={adrTargetInput} onChange={e => setAdrTargetInput(e.target.value)}
                        onBlur={saveAdrTarget}
                        onKeyDown={e => e.key === 'Enter' && saveAdrTarget()}
                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5" placeholder="225" autoFocus
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-emerald-700">{ytdAdr != null ? fmt(ytdAdr) : '—'}</p>
                    {targetAdrVal != null ? (
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs text-slate-400">Target {fmt(targetAdrVal)}</p>
                        {adrVariance != null && (
                          <span className={`text-xs font-semibold ${adrVariance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {adrVariance >= 0 ? '▲' : '▼'} {fmt(Math.abs(adrVariance))}{adrVariancePct != null ? ` (${Math.abs(adrVariancePct).toFixed(1)}%)` : ''}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 mt-3">Per night YTD</p>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* 2025 monthly actuals editor */}
      {editingSeasonality && !selMonth && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-1">
            <p className="font-semibold text-slate-800">{year - 1} Monthly Revenue</p>
            <button onMouseDown={e => e.preventDefault()} onClick={() => { cancelSeasonalitySave(); setEditingSeasonality(false); }} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Enter your actual {year - 1} gross revenue per month. Monthly targets will be distributed proportionally.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
            {MONTHS_LONG.map((month, i) => (
              <div key={i}>
                <label className="text-xs text-slate-500 block mb-1">{month}</label>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                  <span className="text-xs text-slate-400 px-2">$</span>
                  <input
                    type="number"
                    value={seasonalityInputs[i]}
                    onChange={e => {
                      const next = [...seasonalityInputs];
                      next[i] = e.target.value;
                      setSeasonalityInputs(next);
                    }}
                    onBlur={scheduleSeasonalitySave}
                    onFocus={cancelSeasonalitySave}
                    className="flex-1 text-sm py-1.5 pr-2 outline-none min-w-0"
                    placeholder="0"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onMouseDown={e => e.preventDefault()} onClick={() => { cancelSeasonalitySave(); setEditingSeasonality(false); }} className="text-slate-500 text-sm hover:text-slate-700">Close</button>
            <span className="text-xs text-slate-400 ml-auto">
              Total: {fmt(seasonalityInputs.reduce((s, v) => s + (parseFloat(v) || 0), 0))}
            </span>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-8">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          Monthly Revenue by Platform
        </h2>
        <p className="text-xs text-slate-400 mb-4">Click a month to drill into its P&amp;L</p>
        {hasData ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={(props) => {
                  const { x, y, payload, index } = props;
                  const isSelected = index === selectedMonth;
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
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={(props) => (
                  <ChartTooltip
                    active={props.active}
                    payload={props.payload as unknown as TooltipEntry[]}
                    label={String(props.label ?? '')}
                    fmt={fmt}
                  />
                )} />
                <Legend />
                {(['Airbnb', 'Booking.com', 'VRBO'] as const).map(p => (
                  <Bar key={p} dataKey={p} stackId="a" fill={PLATFORM_COLORS[p.toLowerCase().replace('.com', '')]}>
                    {chartData.map((_, i) => (
                      <Cell
                        key={i}
                        opacity={selectedMonth === null || selectedMonth === i ? 1 : 0.18}
                      />
                    ))}
                  </Bar>
                ))}
                <Line
                  type="monotone" dataKey="Monthly Target" stroke="#475569"
                  strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: '#475569', strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            {!prevHasData && manualTarget == null && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                No prior-year data — set an annual target on the pacing card above to enable the forecast line, or{' '}
                <a href="/settings" className="underline font-medium">import 2025 baseline data</a>.
              </p>
            )}
          </>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
            No data yet. Import your earnings CSV to get started.
          </div>
        )}
      </div>

      {/* ── Selected month detail — stacked ── */}
      {selMonth && (
        <div className="space-y-6 mb-8">
          {/* Header with clear button */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">
              {MONTHS_LONG[selectedMonth!]} {year}
            </h2>
            <button
              onClick={() => setSelectedMonth(null)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-2 py-1"
            >
              <X className="w-3 h-3" /> Clear selection
            </button>
          </div>

          {/* P&L table */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wide text-slate-400">Profit &amp; Loss</h3>
            <MonthPnL m={selMonth} fmt={fmt} />
          </div>

          {/* Platform breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wide text-slate-400">Platform Breakdown</h3>
            <PlatformTable byPlatform={selMonth.byPlatform} totalRevenue={selMonth.grossRevenue} fmt={fmt} />
          </div>

          {/* Bookings table */}
          {selMonth.bookings.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="text-sm uppercase tracking-wide text-slate-400 font-semibold">
                  Bookings — {selMonth.bookings.filter(b => b.income > 0).length} booking{selMonth.bookings.filter(b => b.income > 0).length !== 1 ? 's' : ''} · {selMonth.totalNights} nights · avg {selAvgStay?.toFixed(1)} nights/stay
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                    <th className="px-6 py-3 font-medium">Guest</th>
                    <th className="px-6 py-3 font-medium">Platform</th>
                    <th className="px-6 py-3 font-medium">Check-in</th>
                    <th className="px-6 py-3 font-medium">Check-out</th>
                    <th className="px-6 py-3 font-medium text-right">Nights</th>
                    <th className="px-6 py-3 font-medium text-right">Gross Revenue</th>
                    <th className="px-6 py-3 font-medium text-right">Net Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {selMonth.bookings.map(b => (
                    <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-6 py-3 font-medium text-slate-800">
                        {b.guestName ?? b.confirmationCode ?? 'Guest'}
                      </td>
                      <td className="px-6 py-3 capitalize text-slate-600">
                        {b.platform === 'booking' ? 'Booking.com' : b.platform}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {format(new Date(b.checkIn), 'MMM d')}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {format(new Date(b.checkOut), 'MMM d')}
                      </td>
                      <td className="px-6 py-3 text-right text-slate-600">{b.nights}</td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-800">
                        {fmt(b.income)}
                      </td>
                      <td className="px-6 py-3 text-right text-emerald-700 font-medium">
                        {fmt(b.income - (b.platformFee ?? 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-sm">
                    <td colSpan={4} className="px-6 py-3 text-slate-700">Total</td>
                    <td className="px-6 py-3 text-right text-slate-700">{selMonth.totalNights}</td>
                    <td className="px-6 py-3 text-right text-slate-800">{fmt(selMonth.grossRevenue)}</td>
                    <td className="px-6 py-3 text-right text-emerald-700">{fmt(selMonth.netRevenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── YTD summary (shown when no month selected) ── */}
      {hasData && !selMonth && (
        <div className="space-y-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-800">Year-to-Date Summary</h2>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm uppercase tracking-wide text-slate-400 font-semibold mb-4">Profit &amp; Loss</h3>
            <PnLTable m={ytdPnL} fmt={fmt} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm uppercase tracking-wide text-slate-400 font-semibold mb-4">Platform Breakdown</h3>
            <PlatformTable byPlatform={ytdByPlatform} totalRevenue={ytdGross} fmt={fmt} />
          </div>

        </div>
      )}
    </div>
  );
}
