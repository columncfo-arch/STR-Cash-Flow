'use client';
import { useEffect, useRef, useState } from 'react';
import { AnnualStatement, MonthlyStatement, Settings, Platform } from '@/types';
import StatCard from '@/components/StatCard';
import { TrendingUp, X, Pencil, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { pacingStatus } from '@/lib/pacing';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell, ReferenceLine,
} from 'recharts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const PLATFORM_COLORS: Record<string, string> = {
  airbnb: '#f43f5e',
  booking: '#3b82f6',
  vrbo: '#6366f1',
  direct: '#0d9488',
  other: '#9ca3af',
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
  const bookedRevenue = ((d.Airbnb ?? 0) as number) + ((d['Booking.com'] ?? 0) as number) + ((d.VRBO ?? 0) as number) + ((d.Direct ?? 0) as number) + ((d.Other ?? 0) as number);
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

function PnLTooltip({
  active, payload, label, fmt,
}: {
  active?: boolean;
  payload?: { name: string; value: number | null; color: string }[];
  label?: string;
  fmt: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const entries = payload.filter(p => p.value != null);
  if (!entries.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm min-w-[190px]">
      <p className="font-semibold text-slate-800 mb-2">{label}</p>
      {entries.map(e => (
        <div key={e.name} className="flex justify-between gap-6">
          <span className="text-slate-500">{e.name}</span>
          <span className={`font-medium ${e.name === 'Net Income' && e.value! < 0 ? 'text-red-500' : ''}`}>
            {fmt(e.value!)}
          </span>
        </div>
      ))}
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

// Green = on/above target · Amber = missing by ≤25 · Red = missing by >25
// missMagnitude: absolute pct or pts below target (pass null → defaults to red)
function perfColor(variance: number, missMagnitude: number | null, withBg: boolean): string {
  if (variance >= 0) return withBg ? 'bg-emerald-50 text-emerald-700' : 'text-emerald-600';
  const miss = missMagnitude ?? Infinity;
  if (miss <= 25) return withBg ? 'bg-amber-50 text-amber-700' : 'text-amber-600';
  return withBg ? 'bg-red-50 text-red-600' : 'text-red-500';
}

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

type HealthScore = 1 | 0 | -1;
type HealthVerdict = { verdict: string; level: 'exceeding' | 'on-track' | 'at-risk' };

export default function Dashboard() {
  const [statement, setStatement] = useState<AnnualStatement | null>(null);
  const [prevStatement, setPrevStatement] = useState<AnnualStatement | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // 0-indexed
  // Which span the revenue tile reports on. Months, not days — targets are
  // distributed monthly.
  const [period, setPeriod] = useState<'month' | 'ytd' | 'last12' | 'custom'>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
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

  // YTD stats — tile/pacing metrics filter current month to check-ins on or before today;
  // ytdMonths (full current month) is kept for the P&L and platform tables below.
  const todayStr = `${year}-${String(currentMonthIdx + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const completedMonths = statement?.months.slice(0, currentMonthIdx) ?? [];
  const ytdMonths = statement?.months.slice(0, currentMonthIdx + 1) ?? [];

  const curMonthStmt = statement?.months[currentMonthIdx] ?? null;
  const curActualBookings = curMonthStmt?.bookings.filter(b => b.checkIn <= todayStr) ?? [];
  const curActualGross = curActualBookings.reduce((s, b) => s + b.income, 0);
  const curActualNights = curActualBookings.reduce((s, b) => s + b.nights, 0);

  // Gross: filter to check-ins on or before today (revenue can be tracked to the day)
  const ytdGross = completedMonths.reduce((s, m) => s + m.grossRevenue, 0) + curActualGross;
  // Net income: completed months only — mixing partial-month revenue with full-month expenses/PITI is misleading
  const ytdNetIncome = completedMonths.reduce((s, m) => s + m.netIncome, 0);
  const ytdNights = completedMonths.reduce((s, m) => s + m.totalNights, 0) + curActualNights;
  const daysInCurMonth = new Date(year, currentMonthIdx + 1, 0).getDate();
  const curMonthPartialOccupancy = curActualNights / daysInCurMonth;
  const occupancyMonthCount = completedMonths.length + (curMonthStmt ? 1 : 0);
  const ytdOccupancy = occupancyMonthCount > 0
    ? (completedMonths.reduce((s, m) => s + m.occupancyRate, 0) + curMonthPartialOccupancy) / occupancyMonthCount
    : 0;
  const ytdAdr = ytdNights > 0 ? ytdGross / ytdNights : null;

  // Confirmed future bookings in the current year (checkIn > today)
  const futureConfirmedGross = statement?.months.reduce((total, m, i) => {
    const eligible = i === currentMonthIdx
      ? m.bookings.filter(b => b.checkIn > todayStr)
      : i > currentMonthIdx
      ? m.bookings
      : [];
    return total + eligible.reduce((s, b) => s + b.income, 0);
  }, 0) ?? 0;

  // Confirmed future nights (for open-nights calculation)
  const futureConfirmedNights = statement?.months.reduce((total, m, i) => {
    if (i === currentMonthIdx) {
      return total + m.bookings.filter(b => b.checkIn > todayStr).reduce((s, b) => s + b.nights, 0);
    }
    return i > currentMonthIdx ? total + m.totalNights : total;
  }, 0) ?? 0;

  // Days remaining in the year from today (inclusive)
  const yearEnd = new Date(year, 11, 31);
  const daysRemainingInYear = Math.round((yearEnd.getTime() - now.getTime()) / 86400000) + 1;
  const openNights = Math.max(0, daysRemainingInYear - futureConfirmedNights);
  // P&L table uses completed months only — the only period where revenue and expenses are both fully settled
  const ytdPnL: PnLData = {
    grossRevenue: completedMonths.reduce((s, m) => s + m.grossRevenue, 0),
    platformFees: completedMonths.reduce((s, m) => s + m.platformFees, 0),
    fastPayFees: completedMonths.reduce((s, m) => s + m.fastPayFees, 0),
    taxRemitted: completedMonths.reduce((s, m) => s + m.taxRemitted, 0),
    refunds: completedMonths.reduce((s, m) => s + m.refunds, 0),
    netRevenue: completedMonths.reduce((s, m) => s + m.netRevenue, 0),
    ownerTaxes: completedMonths.reduce((s, m) => s + m.ownerTaxes, 0),
    totalOperatingExpenses: completedMonths.reduce((s, m) => s + m.totalOperatingExpenses, 0),
    operatingIncome: completedMonths.reduce((s, m) => s + m.operatingIncome, 0),
    piti: completedMonths.reduce((s, m) => s + m.piti, 0),
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
  const curMonthForecast = monthlyForecasts[currentMonthIdx];
  const stillToBook = annualForecast != null ? Math.max(0, annualForecast - ytdGross - futureConfirmedGross) : null;
  const breakEvenAdr = openNights > 0 && stillToBook != null && stillToBook > 0 ? Math.ceil(stillToBook / openNights) : null;
  // Prorate current month's forecast by days elapsed so ytdForecast matches the ytdGross horizon
  const daysElapsed = now.getDate();
  const curMonthForecastProrated = curMonthForecast != null
    ? Math.round(curMonthForecast * daysElapsed / daysInCurMonth)
    : 0;
  const ytdForecast = hasTarget
    ? monthlyForecasts.slice(0, currentMonthIdx).reduce<number>((s, v) => s + (v ?? 0), 0) + curMonthForecastProrated
    : null;
  const pacingVariance = ytdForecast != null ? ytdGross - ytdForecast : null;
  const pacingVariancePct = ytdForecast && ytdForecast > 0 ? (pacingVariance! / ytdForecast) * 100 : null;

  const hasDirectIncome = statement?.months.some(m => m.byPlatform.direct.income > 0) ?? false;
  const hasOtherIncome = statement?.months.some(m => m.byPlatform.other.income > 0) ?? false;

  const chartData = statement?.months.map((m, i) => {
    const isActual = i <= currentMonthIdx;
    return {
      name: MONTHS[i],
      Airbnb: m.byPlatform.airbnb.income,
      'Booking.com': m.byPlatform.booking.income,
      VRBO: m.byPlatform.vrbo.income,
      ...(hasDirectIncome ? { Direct: m.byPlatform.direct.income } : {}),
      ...(hasOtherIncome ? { Other: m.byPlatform.other.income } : {}),
      'Monthly Target': monthlyForecasts[i],
      _gross: isActual ? m.grossRevenue : null,
    };
  }) ?? [];

  // Net income forecast uses a contribution-margin ratio so fixed PITI is handled correctly.
  // CM ratio = (net + PITI) / gross → isolates variable cost rate from fixed costs.
  // Prefer YTD actuals (best signal); fall back to prior year annual if no current data.
  const monthlyPITI = settings?.monthlyPITI ?? 0;
  // CM ratio uses completed months for both sides so gross and net cover the same period
  const completedGross = completedMonths.reduce((s, m) => s + m.grossRevenue, 0);
  const ytdPITITotal = monthlyPITI * completedMonths.length;
  const ytdCmRatio = completedGross > 0 ? (ytdNetIncome + ytdPITITotal) / completedGross : null;

  const prevAnnualGross = prevStatement ? prevStatement.months.reduce((s, m) => s + m.grossRevenue, 0) : 0;
  const prevAnnualNet = prevStatement ? prevStatement.months.reduce((s, m) => s + m.netIncome, 0) : 0;
  const prevCmRatio = prevAnnualGross > 0 ? (prevAnnualNet + monthlyPITI * 12) / prevAnnualGross : null;

  // Prior year covers 12 months with full seasonal balance; prefer it over the partial-year
  // YTD ratio which is skewed toward low-revenue off-season months.
  const cmRatio = prevCmRatio ?? ytdCmRatio;

  const monthlyNetForecasts: (number | null)[] = Array.from({ length: 12 }, (_, i) => {
    if (cmRatio == null || monthlyForecasts[i] == null) return null;
    return Math.round(monthlyForecasts[i]! * cmRatio - monthlyPITI);
  });

  // Annual projection: Jan–Jul actual + Aug–Dec forecast (current month is in "remaining")
  // This ensures earned + projRemainingNet = annualNetForecast always reconciles
  const projRemainingGross = monthlyForecasts.slice(currentMonthIdx).reduce<number>((s, v) => s + (v ?? 0), 0);
  const projRemainingNet = cmRatio != null
    ? Math.round(projRemainingGross * cmRatio - monthlyPITI * (12 - currentMonthIdx))
    : null;
  const annualNetForecast = projRemainingNet != null ? ytdNetIncome + projRemainingNet : null;

  // NI pacing: compare completed months actual vs completed months forecast (same time horizon)
  const ytdGrossForecastTotal = monthlyForecasts.slice(0, currentMonthIdx).reduce<number>((s, v) => s + (v ?? 0), 0);
  const ytdNetForecast = cmRatio != null
    ? Math.round(ytdGrossForecastTotal * cmRatio - ytdPITITotal)
    : null;
  const netPacingVariance = ytdNetForecast != null ? ytdNetIncome - ytdNetForecast : null;
  const netPacingVariancePct = ytdNetForecast != null && ytdNetForecast !== 0
    ? (netPacingVariance! / Math.abs(ytdNetForecast)) * 100 : null;

  // Current-month cash flow tile
  const curMonthConfirmedGross = curMonthStmt?.grossRevenue ?? 0;
  const curMonthForecastGross = curMonthForecast ?? 0;
  const curMonthCashGapToFill = Math.max(0, curMonthForecastGross - curMonthConfirmedGross);
  const curMonthCoveragePct = curMonthForecastGross > 0 ? Math.min(100, Math.round((curMonthConfirmedGross / curMonthForecastGross) * 100)) : 0;

  const pnlChartData = statement?.months.map((m, i) => {
    const isActual = i <= currentMonthIdx;
    return {
      name: MONTHS[i],
      'Net Income': isActual ? m.netIncome : null,
      'Net Forecast': monthlyNetForecasts[i],
    };
  }) ?? [];

  const occChartData = statement?.months.map((m, i) => ({
    name: MONTHS[i],
    Occupancy: i <= currentMonthIdx ? parseFloat(m.occupancyRate.toFixed(1)) : null,
    // Confirmed future bookings expressed as occupancy — all remaining months shown, 0% if nothing booked yet
    ProjectedOccupancy: i > currentMonthIdx ? parseFloat(m.occupancyRate.toFixed(1)) : null,
    ADR: i <= currentMonthIdx && m.totalNights > 0 ? Math.round(m.grossRevenue / m.totalNights) : null,
  })) ?? [];

  const hasData = ytdGross > 0;

  // Occupancy baseline: prior year avg → YTD (if 3+ months in) → manual setting → 70%
  // Require ≥6 months with >5% occupancy so sparse/revenue-only imports don't corrupt the baseline
  const prevYearOcc = (() => {
    if (!prevStatement) return null;
    const meaningfulMonths = prevStatement.months.filter(m => m.occupancyRate > 5);
    if (meaningfulMonths.length < 6) return null;
    return prevStatement.months.reduce((s, m) => s + m.occupancyRate, 0) / 12;
  })();
  const effectiveOccBaseline =
    prevYearOcc ??
    (currentMonthIdx >= 2 ? ytdOccupancy : null) ??
    settings?.targetOccupancyPct ??
    70;
  const occBaselineLabel =
    prevYearOcc != null ? `${year - 1} avg` :
    currentMonthIdx >= 2 ? 'YTD avg' :
    settings?.targetOccupancyPct != null ? 'manual' : '70% default';

  // Revenue target controls: derive the ADR needed to hit it at the occupancy baseline
  const derivedAdrTarget = manualTarget != null && effectiveOccBaseline > 0
    ? Math.round(manualTarget / (365 * effectiveOccBaseline / 100))
    : null;

  // What to show on the cards
  const displayOccTarget = manualTarget != null ? effectiveOccBaseline : (settings?.targetOccupancyPct ?? null);
  const displayAdrTarget = derivedAdrTarget ?? settings?.targetAdr ?? null;

  const targetOcc = displayOccTarget;
  const occVariance = targetOcc != null ? ytdOccupancy - targetOcc : null;
  const currentMonthOccupancy = statement?.months[currentMonthIdx]?.occupancyRate ?? null;
  const curMonthOccVariance = targetOcc != null && currentMonthOccupancy != null ? currentMonthOccupancy - targetOcc : null;
  const adrVariance = displayAdrTarget != null && ytdAdr != null ? ytdAdr - displayAdrTarget : null;
  const adrVariancePct = adrVariance != null && displayAdrTarget ? (adrVariance / displayAdrTarget) * 100 : null;

  // Year Health: composite score from the key pacing and coverage signals
  const healthSignals: { label: string; score: HealthScore; detail: string }[] = [];

  if (pacingVariancePct != null) {
    const score: HealthScore = pacingVariancePct > 5 ? 1 : pacingVariancePct >= -10 ? 0 : -1;
    healthSignals.push({ label: 'Revenue', score, detail: `${pacingVariancePct >= 0 ? '+' : ''}${pacingVariancePct.toFixed(1)}% vs target` });
  }
  // Only score NI pacing when the base is large enough to be meaningful — a $20 forecast
  // base produces absurd percentages that mislead the health verdict.
  if (netPacingVariancePct != null && ytdNetForecast != null && Math.abs(ytdNetForecast) >= 500) {
    const score: HealthScore = netPacingVariancePct > 5 ? 1 : netPacingVariancePct >= -15 ? 0 : -1;
    healthSignals.push({ label: 'Net Income', score, detail: `${netPacingVariancePct >= 0 ? '+' : ''}${netPacingVariancePct.toFixed(1)}% vs projection` });
  }
  if (annualForecast != null) {
    if (breakEvenAdr == null) {
      healthSignals.push({ label: 'Target Path', score: 1, detail: 'Bookings cover target' });
    } else if (ytdAdr != null && ytdAdr > 0) {
      const stretchRatio = breakEvenAdr / ytdAdr;
      const score: HealthScore = stretchRatio <= 1.1 ? 1 : stretchRatio <= 1.4 ? 0 : -1;
      healthSignals.push({ label: 'Target Path', score, detail: `$${breakEvenAdr}/night · ${openNights} open nights` });
    }
  }
  if (occVariance != null) {
    const score: HealthScore = occVariance >= 0 ? 1 : occVariance >= -10 ? 0 : -1;
    healthSignals.push({ label: 'Occupancy', score, detail: `${occVariance >= 0 ? '+' : ''}${occVariance.toFixed(1)}pts vs target` });
  }
  // Annual NI projection: if the full-year outcome is negative, cap the verdict at "On Track"
  // regardless of how well individual signals are pacing — a projected loss is a loss.
  const annualNiIsNegative = annualNetForecast != null && annualNetForecast < 0;

  const healthTotal = healthSignals.reduce((s, sig) => s + sig.score, 0);
  const healthNorm = healthSignals.length > 0 ? healthTotal / healthSignals.length : 0;
  const yearHealth: HealthVerdict | null =
    healthSignals.length < 2 ? null
    : healthNorm > 0.6 && !annualNiIsNegative ? { verdict: 'Exceeding', level: 'exceeding' }
    : healthNorm > -0.4 ? { verdict: 'On Track', level: 'on-track' }
    : { verdict: 'At Risk', level: 'at-risk' };

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

      {/* Section label — the revenue tiles below track gross, but none of their
          own column headings say so. Unconditional, matching its chart. */}
      <h2 className="text-sm uppercase tracking-wide text-slate-400 font-semibold mb-3">Gross Revenue</h2>

      {/* ── Period filter + one revenue tile ────────────────────────────────
          Was two tiles, month and annual, showing the same three measures for
          different spans. One tile driven by a filter says the same thing once.
          Granularity is months, not days: targets are distributed monthly, so a
          day picker would imply precision the forecast does not have. */}
      {!selMonth && hasTarget && annualForecast != null && (() => {
        const priorMonthly = effectivePriorMonthly ?? [];

        // Months in the selected window, newest last
        const windowMonths: { year: number; mi: number }[] = (() => {
          if (period === 'month') return [{ year, mi: currentMonthIdx }];
          if (period === 'ytd') return Array.from({ length: currentMonthIdx + 1 }, (_, i) => ({ year, mi: i }));
          if (period === 'last12') {
            return Array.from({ length: 12 }, (_, k) => {
              const off = currentMonthIdx - 11 + k;
              return off < 0 ? { year: year - 1, mi: off + 12 } : { year, mi: off };
            });
          }
          // custom: inclusive YYYY-MM range, clamped to the two years we hold
          if (!customFrom || !customTo || customFrom > customTo) return [];
          const out: { year: number; mi: number }[] = [];
          for (const y of [year - 1, year]) {
            for (let mi = 0; mi < 12; mi++) {
              const key = `${y}-${String(mi + 1).padStart(2, '0')}`;
              if (key >= customFrom && key <= customTo) out.push({ year: y, mi });
            }
          }
          return out;
        })();

        const monthsOf = (y: number) => (y === year ? statement?.months : prevStatement?.months);
        const actualFor = ({ year: y, mi }: { year: number; mi: number }) =>
          monthsOf(y)?.[mi]?.grossRevenue ?? 0;
        // Closed prior-year months are their own baseline — there was no target
        // set for them, so they contribute no variance.
        const targetFor = ({ year: y, mi }: { year: number; mi: number }) =>
          y === year ? (monthlyForecasts[mi] ?? 0) : (priorMonthly[mi] ?? 0);

        const earned = windowMonths.reduce((s, m) => s + actualFor(m), 0);
        const target = windowMonths.reduce((s, m) => s + targetFor(m), 0);
        const stillNeeded = Math.max(0, target - earned);
        const variance = earned - target;
        const variancePct = target > 0 ? (variance / target) * 100 : null;
        const pctOfTarget = target > 0 ? Math.min(100, (earned / target) * 100) : 0;
        const status = pacingStatus(variancePct, { reached: stillNeeded === 0 && target > 0, label: 'Target Met' });

        const periodLabel = period === 'month' ? MONTHS_LONG[currentMonthIdx]
          : period === 'ytd' ? `${year} to date`
          : period === 'last12' ? 'last 12 months'
          : customFrom && customTo ? `${customFrom} to ${customTo}` : 'custom range';

        return (
          <>
            {/* Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  ['month', 'This Month'],
                  ['ytd', 'YTD'],
                  ['last12', 'Last 12 Months'],
                  ['custom', 'Custom'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setPeriod(id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      period === id
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 text-slate-600 hover:border-emerald-300 bg-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {period === 'custom' && (
                <div className="flex items-center gap-2 sm:ml-auto">
                  <input
                    type="month" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    min={`${year - 1}-01`} max={`${year}-12`}
                    className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
                    aria-label="From month"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <input
                    type="month" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    min={`${year - 1}-01`} max={`${year}-12`}
                    className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
                    aria-label="To month"
                  />
                </div>
              )}
            </div>

            {/* The tile */}
            <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm mb-6">
              {windowMonths.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">Pick a start and end month.</p>
              ) : (
                <>
                  <div className="flex items-start gap-4 sm:gap-6">
                    {/* Earned */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Earned</p>
                      <p className="text-xl font-bold text-slate-900 leading-tight mt-0.5">{fmt(earned)}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        of {fmt(target)} target · {periodLabel}
                      </p>
                    </div>

                    {/* Still needed */}
                    <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Still Needed</p>
                      <p className={`text-xl font-bold leading-tight mt-0.5 ${stillNeeded === 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {stillNeeded === 0 ? 'Covered' : fmt(stillNeeded)}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {pctOfTarget.toFixed(0)}% of target earned
                      </p>
                    </div>

                    {/* Status */}
                    <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Status</p>
                        <div className="flex items-center gap-1 shrink-0 -mt-0.5">
                          <button
                            onClick={openSeasonalityEditor}
                            className="text-slate-300 hover:text-slate-500 transition-colors"
                            title={`Edit ${year - 1} monthly actuals — sets how the annual target splits across months`}
                          >
                            <CalendarDays className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => { setTargetInput(String(manualTarget ?? Math.round(annualForecast))); setEditingTarget(true); }}
                            className="text-slate-300 hover:text-slate-500 transition-colors"
                            title="Edit annual target"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      {editingTarget ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-sm text-slate-400">$</span>
                          <input
                            type="number"
                            value={targetInput}
                            onChange={e => setTargetInput(e.target.value)}
                            onBlur={saveTarget}
                            onKeyDown={e => e.key === 'Enter' && saveTarget()}
                            className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2 py-1"
                            placeholder="68500"
                            autoFocus
                          />
                          <button onMouseDown={e => e.preventDefault()} onClick={() => setEditingTarget(false)} className="text-slate-300 hover:text-slate-500">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className={`text-xl font-bold leading-tight mt-0.5 ${status.color}`}>{status.label}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {variancePct != null
                              ? <>
                                  <span className={status.color}>
                                    {variance >= 0 ? '▲' : '▼'}{Math.abs(variancePct).toFixed(1)}%
                                  </span>
                                  {` · ${fmt(annualForecast)} annual target`}
                                </>
                              : 'no target for this period'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="w-full bg-slate-100 rounded-full h-1 mt-3.5">
                    <div
                      className={`h-1 rounded-full transition-all ${variance >= 0 ? 'bg-emerald-500' : pctOfTarget >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${pctOfTarget}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        );
      })()}

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
          Gross Revenue Pacing (Target and Actual)
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
                {(
                  [
                    'Airbnb',
                    'Booking.com',
                    'VRBO',
                    ...(hasDirectIncome ? ['Direct'] : []),
                    ...(hasOtherIncome ? ['Other'] : []),
                  ] as string[]
                ).map(p => (
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

      {hasData && (
        <h2 className="text-sm uppercase tracking-wide text-slate-400 font-semibold mb-3">Net Income</h2>
      )}

      {/* Current month cash flow tile — uses actual booked revenue and entered expenses */}
      {hasData && !selMonth && curMonthStmt != null && (() => {
        const totalCosts = curMonthStmt.totalOperatingExpenses + curMonthStmt.piti;
        // How far net cash flow sits from breakeven, as a share of the month's
        // costs. Same 5% band as the annual revenue status.
        const breakevenPct = totalCosts > 0 ? (curMonthStmt.netIncome / totalCosts) * 100 : null;
        const cashStatus = pacingStatus(breakevenPct);
        return (
          <div className={`bg-white rounded-xl border px-5 py-4 shadow-sm mb-6 ${curMonthStmt.netIncome < 0 ? 'border-red-200' : 'border-slate-200'}`}>
            <div className="flex items-start gap-4 sm:gap-6">
              {/* Net revenue */}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">
                  {MONTHS_LONG[currentMonthIdx]} Net Revenue
                </p>
                <p className="text-xl font-bold text-slate-900 leading-tight mt-0.5">{fmt(curMonthStmt.netRevenue)}</p>
                <p className="text-[11px] text-slate-400 truncate">booked − platform fees</p>
              </div>

              {/* Net cash flow */}
              <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Net Cash Flow</p>
                <p className={`text-xl font-bold leading-tight mt-0.5 ${curMonthStmt.netIncome < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {curMonthStmt.netIncome >= 0 ? '+' : ''}{fmt(curMonthStmt.netIncome)}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  after {fmt(curMonthStmt.totalOperatingExpenses)} opex · {fmt(curMonthStmt.piti)} PITI
                </p>
              </div>

              {/* Status against breakeven */}
              <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Status</p>
                <p className={`text-xl font-bold leading-tight mt-0.5 ${cashStatus.color}`}>{cashStatus.label}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {breakevenPct != null
                    ? <>
                        <span className={cashStatus.color}>
                          {breakevenPct >= 0 ? '▲' : '▼'}{Math.abs(breakevenPct).toFixed(1)}%
                        </span>
                        {' vs breakeven'}
                      </>
                    : 'no costs recorded'}
                </p>
              </div>
            </div>

            {curMonthForecastGross > 0 && (
              <>
                <div className="w-full bg-slate-100 rounded-full h-1 mt-3.5">
                  <div
                    className={`h-1 rounded-full transition-all ${curMonthCoveragePct >= 80 ? 'bg-emerald-400' : curMonthCoveragePct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${curMonthCoveragePct}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {fmt(curMonthConfirmedGross)} on books
                  {curMonthCashGapToFill > 0
                    ? ` · ${fmt(curMonthCashGapToFill)} to fill`
                    : <span className="text-emerald-600"> · covered</span>}
                </p>
              </>
            )}
          </div>
        );
      })()}

      {/* Net income pacing + annual projection — one condensed row */}
      {hasData && !selMonth && (ytdNetForecast != null || annualNetForecast != null) && (() => {
        const annualNetPct = annualNetForecast != null && annualNetForecast > 0
          ? Math.min(100, Math.max(0, (ytdNetIncome / annualNetForecast) * 100))
          : 0;
        // Measured against the YTD plan. Not the annual projection — that is
        // built from YTD actual, so comparing the two is circular.
        const netStatus = pacingStatus(netPacingVariancePct);
        return (
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm mb-6">
            <div className="flex items-start gap-4 sm:gap-6">
              {ytdNetForecast != null && (
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">YTD Net Income</p>
                  <p className={`text-xl font-bold leading-tight mt-0.5 ${ytdNetIncome >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                    {fmt(ytdNetIncome)}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">of {fmt(ytdNetForecast)} YTD projected</p>
                </div>
              )}
              {annualNetForecast != null && (
                <div className={`min-w-0 flex-1 ${ytdNetForecast != null ? 'border-l border-slate-100 pl-4 sm:pl-6' : ''}`}>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Annual Projection</p>
                  <p className={`text-xl font-bold leading-tight mt-0.5 ${annualNetForecast >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                    {fmt(annualNetForecast)}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {fmt(ytdNetIncome)} earned
                    {projRemainingNet != null && ` · ${fmt(projRemainingNet)} proj. ${MONTHS[currentMonthIdx]}–Dec`}
                  </p>
                </div>
              )}
              {ytdNetForecast != null && (
                <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Status</p>
                  <p className={`text-xl font-bold leading-tight mt-0.5 ${netStatus.color}`}>{netStatus.label}</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {netPacingVariance != null
                      ? <>
                          <span className={netStatus.color}>
                            {netPacingVariance >= 0 ? '▲' : '▼'}{fmt(Math.abs(netPacingVariance))}
                          </span>
                          {' vs YTD plan'}
                        </>
                      : 'no YTD plan'}
                  </p>
                </div>
              )}
            </div>
            {annualNetForecast != null && annualNetForecast > 0 && (
              <div className="w-full bg-slate-100 rounded-full h-1 mt-3.5">
                <div
                  className="h-1 rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${annualNetPct}%` }}
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* P&L Chart */}
      {hasData && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-8">
          <h2 className="font-semibold text-slate-800 mb-1">Net Income</h2>
          <p className="text-xs text-slate-400 mb-4">Monthly net income · actuals and projected</p>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={pnlChartData} barGap={4} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={(props) => (
                <PnLTooltip
                  active={props.active}
                  payload={props.payload as unknown as { name: string; value: number | null; color: string }[]}
                  label={String(props.label ?? '')}
                  fmt={fmt}
                />
              )} />
              <Legend />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              <Bar dataKey="Net Income" fill="#6366f1" radius={[3, 3, 0, 0]}>
                {/* Loss-making months read red; the rounded corner follows the bar's direction */}
                {pnlChartData.map((d, i) => {
                  const v = d['Net Income'] as number | null;
                  const negative = v != null && v < 0;
                  return (
                    <Cell
                      key={i}
                      fill={negative ? '#ef4444' : '#6366f1'}
                      radius={(negative ? [0, 0, 3, 3] : [3, 3, 0, 0]) as unknown as number}
                    />
                  );
                })}
              </Bar>
              <Line
                dataKey="Net Forecast"
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* One heading covers both the occupancy and rate tiles, since the chart
          closing this section plots the two together */}
      {hasData && (
        <h2 className="text-sm uppercase tracking-wide text-slate-400 font-semibold mb-3">Occupancy &amp; Pricing</h2>
      )}

      {/* Occupancy — YTD, current month and status against the baseline */}
      {hasData && !selMonth && (() => {
        // Variance is in points; express it against the baseline so it shares
        // the same 5% bands as the revenue and net income tiles.
        const occVariancePct = occVariance != null && displayOccTarget != null && displayOccTarget > 0
          ? (occVariance / displayOccTarget) * 100
          : null;
        const occStatus = pacingStatus(occVariancePct);
        return (
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm mb-6">
            {editingOccTarget ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 whitespace-nowrap">Occupancy baseline</span>
                <input
                  type="number" value={occTargetInput} onChange={e => setOccTargetInput(e.target.value)}
                  onBlur={saveOccTarget}
                  onKeyDown={e => e.key === 'Enter' && saveOccTarget()}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5" placeholder="70" autoFocus
                />
                <span className="text-sm text-slate-400">%</span>
                <button onMouseDown={e => e.preventDefault()} onClick={() => setEditingOccTarget(false)} className="text-slate-300 hover:text-slate-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-4 sm:gap-6">
                  {/* YTD occupancy */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">YTD Occupancy</p>
                    <p className="text-xl font-bold text-slate-900 leading-tight mt-0.5">{ytdOccupancy.toFixed(1)}%</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {displayOccTarget != null
                        ? <>of {displayOccTarget.toFixed(1)}% baseline · {occBaselineLabel}</>
                        : 'year to date'}
                    </p>
                  </div>

                  {/* Current month occupancy */}
                  <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">
                      {MONTHS_LONG[currentMonthIdx]} Occupancy
                    </p>
                    <p className={`text-xl font-bold leading-tight mt-0.5 ${currentMonthOccupancy != null ? 'text-slate-900' : 'text-slate-400'}`}>
                      {currentMonthOccupancy != null ? `${currentMonthOccupancy.toFixed(1)}%` : '—'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {curMonthOccVariance != null && targetOcc != null
                        ? <>
                            <span className={curMonthOccVariance >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                              {curMonthOccVariance >= 0 ? '▲' : '▼'}{Math.abs(curMonthOccVariance).toFixed(1)}pts
                            </span>
                            {' vs '}{targetOcc.toFixed(1)}% target
                          </>
                        : 'this month'}
                    </p>
                  </div>

                  {/* Status against the baseline */}
                  <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Status</p>
                      <button
                        onClick={() => { setOccTargetInput(String(settings?.targetOccupancyPct ?? '')); setEditingOccTarget(true); }}
                        className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 -mt-0.5"
                        title="Override occupancy baseline"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    <p className={`text-xl font-bold leading-tight mt-0.5 ${occStatus.color}`}>{occStatus.label}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {occVariance != null
                        ? <>
                            <span className={occStatus.color}>
                              {occVariance >= 0 ? '▲' : '▼'}{Math.abs(occVariance).toFixed(1)}pts
                            </span>
                            {' vs baseline'}
                          </>
                        : 'no baseline set'}
                    </p>
                  </div>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-1 mt-3.5">
                  <div
                    className={`h-1 rounded-full transition-all ${occStatus.color === 'text-emerald-600' ? 'bg-emerald-500' : 'bg-red-400'}`}
                    style={{ width: `${Math.min(100, Math.max(0, ytdOccupancy))}%` }}
                  />
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Daily rate — YTD, break-even and status against the target */}
      {hasData && !selMonth && (() => {
        const adrStatus = pacingStatus(adrVariancePct);
        return (
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm mb-6">
            {editingAdrTarget && derivedAdrTarget == null ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 whitespace-nowrap">ADR target</span>
                <span className="text-sm text-slate-400">$</span>
                <input
                  type="number" value={adrTargetInput} onChange={e => setAdrTargetInput(e.target.value)}
                  onBlur={saveAdrTarget}
                  onKeyDown={e => e.key === 'Enter' && saveAdrTarget()}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5" placeholder="225" autoFocus
                />
                <button onMouseDown={e => e.preventDefault()} onClick={() => setEditingAdrTarget(false)} className="text-slate-300 hover:text-slate-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-4 sm:gap-6">
                  {/* YTD daily rate */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">YTD Daily Rate</p>
                    <p className="text-xl font-bold text-slate-900 leading-tight mt-0.5">{ytdAdr != null ? fmt(ytdAdr) : '—'}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {displayAdrTarget != null
                        ? <>
                            of {fmt(displayAdrTarget)} target
                            {derivedAdrTarget != null && ` @ ${displayOccTarget?.toFixed(1)}% occ`}
                          </>
                        : 'per night YTD'}
                    </p>
                  </div>

                  {/* Break-even rate on remaining open nights */}
                  <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Break-Even Rate</p>
                    <p className={`text-xl font-bold leading-tight mt-0.5 ${breakEvenAdr == null && stillToBook === 0 ? 'text-emerald-600' : breakEvenAdr != null ? 'text-slate-900' : 'text-slate-400'}`}>
                      {breakEvenAdr != null ? fmt(breakEvenAdr) : stillToBook === 0 ? 'Covered' : '—'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {breakEvenAdr != null
                        ? `over ${openNights} open nights`
                        : stillToBook === 0 ? 'bookings exceed target' : 'no target set'}
                    </p>
                  </div>

                  {/* Status against the ADR target */}
                  <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Status</p>
                      {derivedAdrTarget == null && (
                        <button
                          onClick={() => { setAdrTargetInput(String(settings?.targetAdr ?? '')); setEditingAdrTarget(true); }}
                          className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 -mt-0.5"
                          title="Set ADR target"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className={`text-xl font-bold leading-tight mt-0.5 ${adrStatus.color}`}>{adrStatus.label}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {adrVariancePct != null
                        ? <>
                            <span className={adrStatus.color}>
                              {adrVariancePct >= 0 ? '▲' : '▼'}{Math.abs(adrVariancePct).toFixed(1)}%
                            </span>
                            {' vs target'}
                          </>
                        : 'no target set'}
                    </p>
                  </div>
                </div>

                {displayAdrTarget != null && displayAdrTarget > 0 && ytdAdr != null && (
                  <div className="w-full bg-slate-100 rounded-full h-1 mt-3.5">
                    <div
                      className={`h-1 rounded-full transition-all ${adrStatus.color === 'text-emerald-600' ? 'bg-emerald-500' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(100, Math.max(0, (ytdAdr / displayAdrTarget) * 100))}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* ── Pricing & Occupancy chart ── */}
      {hasData && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-800">Pricing &amp; Occupancy</h2>
            {targetOcc != null && (
              <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${perfColor(occVariance ?? 0, occVariance != null ? Math.abs(occVariance) : null, true)}`}>
                YTD {ytdOccupancy.toFixed(1)}% {occVariance != null ? `(${occVariance >= 0 ? '+' : ''}${occVariance.toFixed(1)}pts vs target)` : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-4">Monthly occupancy (bars) · faded = confirmed bookings only · ADR per night (line) · baseline {targetOcc != null ? `${targetOcc.toFixed(1)}%` : 'not set'}</p>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={occChartData} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis yAxisId="occ" domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={v => `${v}%`} />
              <YAxis yAxisId="adr" orientation="right" tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} width={55} />
              <Tooltip
                formatter={(value, name) =>
                  name === 'ADR' ? [`$${value}`, 'ADR / night']
                  : name === 'ProjectedOccupancy' ? [`${value}%`, 'Occupancy (booked)']
                  : [`${value}%`, 'Occupancy']
                }
                contentStyle={{ fontSize: 13, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              {targetOcc != null && (
                <ReferenceLine
                  yAxisId="occ"
                  y={targetOcc}
                  stroke="#475569"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  label={{ value: `${targetOcc.toFixed(1)}% baseline`, position: 'insideTopRight', fontSize: 11, fill: '#475569' }}
                />
              )}
              <Bar yAxisId="occ" dataKey="Occupancy" radius={[4, 4, 0, 0]}>
                {occChartData.map((entry, i) => {
                  let fill = '#e2e8f0';
                  if (entry.Occupancy != null) {
                    if (targetOcc == null || entry.Occupancy >= targetOcc) {
                      fill = '#10b981';
                    } else {
                      const miss = targetOcc - entry.Occupancy;
                      fill = miss <= 25 ? '#f59e0b' : '#f43f5e';
                    }
                  }
                  return <Cell key={i} fill={fill} />;
                })}
              </Bar>
              <Bar yAxisId="occ" dataKey="ProjectedOccupancy" radius={[4, 4, 0, 0]} opacity={0.35}>
                {occChartData.map((entry, i) => {
                  let fill = '#94a3b8';
                  if (entry.ProjectedOccupancy != null) {
                    if (targetOcc == null || entry.ProjectedOccupancy >= targetOcc) {
                      fill = '#10b981';
                    } else {
                      const miss = targetOcc - entry.ProjectedOccupancy;
                      fill = miss <= 25 ? '#f59e0b' : '#f43f5e';
                    }
                  }
                  return <Cell key={i} fill={fill} />;
                })}
              </Bar>
              <Line yAxisId="adr" dataKey="ADR" type="monotone" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} activeDot={{ r: 5 }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Year Health + YTD tables — hidden when a month is drilled into ── */}
      {hasData && !selMonth && (
        <>
          {yearHealth && (
            <div className={`rounded-xl border p-4 mb-6 ${
              yearHealth.level === 'exceeding' ? 'bg-emerald-50 border-emerald-200' :
              yearHealth.level === 'on-track' ? 'bg-slate-50 border-slate-200' :
              'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start md:items-center gap-4 flex-col md:flex-row">
                <div className="shrink-0">
                  <p className="text-xs uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Year Health</p>
                  <p className={`text-xl font-bold ${
                    yearHealth.level === 'exceeding' ? 'text-emerald-700' :
                    yearHealth.level === 'on-track' ? 'text-slate-700' :
                    'text-red-700'
                  }`}>{yearHealth.verdict}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {healthSignals.map(sig => (
                    <span key={sig.label} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border bg-white ${
                      sig.score === 1 ? 'text-emerald-700 border-emerald-300' :
                      sig.score === 0 ? 'text-amber-700 border-amber-300' :
                      'text-red-600 border-red-300'
                    }`}>
                      {sig.score === 1 ? '▲' : sig.score === -1 ? '▼' : '~'} {sig.label}
                      <span className="font-normal opacity-75 ml-0.5">· {sig.detail}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="space-y-6 mb-8">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm uppercase tracking-wide text-slate-400 font-semibold mb-4">Year-to-Date P&amp;L (Jan–{MONTHS[currentMonthIdx - 1] ?? MONTHS[0]})</h3>
              <PnLTable m={ytdPnL} fmt={fmt} />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm uppercase tracking-wide text-slate-400 font-semibold mb-4">Platform Breakdown</h3>
              <PlatformTable byPlatform={ytdByPlatform} totalRevenue={ytdGross} fmt={fmt} />
            </div>
          </div>
        </>
      )}

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

    </div>
  );
}
