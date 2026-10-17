'use client';
import { useEffect, useRef, useState } from 'react';
import { AnnualStatement, MonthlyStatement, Settings, Platform } from '@/types';
import StatCard from '@/components/StatCard';
import { TrendingUp, X, Pencil, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { pacingStatus, paceStatus, planShare } from '@/lib/pacing';
import InfoTip from '@/components/InfoTip';
import PacingRing from '@/components/PacingRing';
import PropertySetup from '@/components/PropertySetup';
import { addDays } from '@/lib/dateRange';
import {
  DayOccupancyChart, MonthProgressChart, DayDatum, ProgressPoint,
} from '@/components/DayCharts';
import { YearVarianceChart, VarianceDatum } from '@/components/YearVarianceChart';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine,
} from 'recharts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * The four layers of the money, outermost first.
 *
 * Gross revenue and cash flow used to be two sections, each with its own tile
 * row and its own chart — and the charts were the same chart on different
 * money, so comparing the two meant holding one in your head while scrolling to
 * the other. Here each layer is a tile, and the tile is the filter that puts its
 * own layer on the single chart below.
 */
const METRICS = [
  {
    key: 'grossRevenue',
    label: 'Gross Revenue',
    color: '#10b981',
    tip: 'Everything guests paid, before any deduction.',
    // Revenue carries dates, so a part-finished period can be judged against
    // the share of its plan that should have landed by now. The layers below
    // cannot: a month's operating expenses and mortgage payment land whole
    // while its revenue is still arriving, so they are judged on closed months.
    prorates: true,
    breakeven: false,
  },
  {
    key: 'netRevenue',
    label: 'Net Revenue',
    color: '#0ea5e9',
    tip: 'Gross revenue after platform fees, platform-remitted tax and guest refunds.',
    prorates: true,
    breakeven: false,
  },
  {
    key: 'operatingIncome',
    label: 'Net Operating Income',
    color: '#8b5cf6',
    tip: 'Net revenue less operating expenses, before the mortgage — what the property earns as a business.',
    prorates: false,
    breakeven: true,
  },
  {
    key: 'netIncome',
    label: 'Cash Flow',
    color: '#6366f1',
    tip: 'What is left after every cost including the whole mortgage payment. Net income is higher by the principal repaid, which builds equity rather than being spent.',
    prorates: false,
    breakeven: true,
  },
] as const;

type MetricKey = typeof METRICS[number]['key'];

/**
 * A month as a running total, opening at `start` and moving by each day's
 * figure. Solid up to today and dashed beyond, with the changeover day in both
 * series so the two lines meet rather than leaving a gap.
 *
 * Module level rather than inline: a running accumulator reassigned during a
 * component's render is exactly what the React compiler refuses.
 */
function runningFrom(
  start: number, byDay: number[], todayDay: number, grossByDay?: number[],
): ProgressPoint[] {
  let running = start;
  let gross = 0;
  return byDay.map((v, i) => {
    running += v;
    gross += grossByDay?.[i] ?? 0;
    const day = i + 1;
    const value = Math.round(running);
    return {
      day: String(day),
      earned: day <= todayDay ? value : null,
      booked: day >= todayDay ? value : null,
      today: Math.round(v),
      gross: grossByDay ? Math.round(gross) : null,
      isFuture: day > todayDay,
    };
  });
}

/**
 * What stands between gross revenue and each layer below it, outermost first.
 *
 * One list, so the stripes in the chart and the bar beneath it name the same
 * costs in the same colours. A deduction applies to the layer it is listed
 * against and to every layer below that one.
 */
const DEDUCTIONS = [
  {
    label: 'Platform fees & tax', color: '#cbd5e1', from: 'netRevenue',
    // Fees arrive with the booking that caused them, so they ride in the daily
    // steps. Everything below is a monthly figure with no day attached, which
    // is why it lands whole at the start of the month and draws as a stripe.
    dated: true,
    pick: (m: PnLData) => m.platformFees + m.fastPayFees + m.taxRemitted,
  },
  { label: 'Guest refunds', color: '#94a3b8', from: 'netRevenue', dated: false, pick: (m: PnLData) => m.refunds },
  { label: 'Operating expenses', color: '#64748b', from: 'operatingIncome', dated: false, pick: (m: PnLData) => m.totalOperatingExpenses },
  { label: 'Mortgage', color: '#475569', from: 'netIncome', dated: false, pick: (m: PnLData) => m.piti },
] as const;

/** Layers run outermost to innermost, so a deduction applies from its own layer down. */
const LAYER_ORDER = METRICS.map(m => m.key) as MetricKey[];
const deductedFrom = (from: MetricKey, metric: MetricKey) =>
  LAYER_ORDER.indexOf(metric) >= LAYER_ORDER.indexOf(from);

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

type PnLData = Pick<MonthlyStatement,
  'grossRevenue' | 'platformFees' | 'fastPayFees' | 'taxRemitted' | 'refunds' | 'netRevenue'
  | 'ownerTaxes' | 'totalOperatingExpenses' | 'operatingIncome' | 'piti'
  | 'mortgageInterest' | 'mortgagePrincipal' | 'mortgageTaxesInsurance' | 'netProfit' | 'netIncome'>;

// Green = on/above target · Amber = missing by ≤25 · Red = missing by >25
// missMagnitude: absolute pct or pts below target (pass null → defaults to red)
// `strong` picks the darker shade; it used to add a tinted pill behind the text.
function perfColor(variance: number, missMagnitude: number | null, strong: boolean): string {
  if (variance >= 0) return strong ? 'text-emerald-700' : 'text-emerald-600';
  const miss = missMagnitude ?? Infinity;
  if (miss <= 25) return strong ? 'text-amber-700' : 'text-amber-600';
  return strong ? 'text-red-600' : 'text-red-500';
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
    // Interest and escrow are costs; the principal below is equity, so it sits
    // under net income rather than inside it — as on the Income Statement
    ...(m.mortgageInterest > 0 ? [{ label: 'Mortgage Interest', value: m.mortgageInterest, negative: true, indent: true }] : []),
    ...(m.mortgageTaxesInsurance > 0 ? [{ label: 'Taxes, Insurance & Escrow', value: m.mortgageTaxesInsurance, negative: true, indent: true }] : []),
    ...(m.piti > 0 && m.mortgageInterest === 0 && m.mortgageTaxesInsurance === 0
      ? [{ label: 'PITI', value: m.piti, negative: true, indent: true }] : []),
    { label: 'Net Income', value: m.netProfit, bold: true, separator: true, accent: true },
    ...(m.mortgagePrincipal > 0 ? [{ label: 'Principal Repaid (equity built)', value: m.mortgagePrincipal, negative: true, indent: true }] : []),
    ...(m.mortgagePrincipal > 0
      ? [{ label: 'Cash Flow', value: m.netIncome, bold: true, separator: true, accent: true }] : []),
  ];

  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={`${r.separator ? 'border-t-2 border-slate-200' : 'border-t border-slate-50'} ${r.bold ? 'font-semibold' : ''}`}>
            <td className={`py-2 text-slate-700 ${r.indent ? 'pl-6 text-slate-500 text-xs' : ''}`}>{r.label}</td>
            {/* Only the accented rows — operating and net income — are a verdict.
                Deductions are set in slate and already read as deductions from the
                parentheses; red on every one of them made routine costs look like
                losses. */}
            <td className={`py-2 text-right text-sm ${
              r.accent ? (r.value >= 0 ? 'text-emerald-700' : 'text-red-600') :
              r.negative ? 'text-slate-500' :
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


export default function DashboardClient() {
  const [statement, setStatement] = useState<AnnualStatement | null>(null);
  const [prevStatement, setPrevStatement] = useState<AnnualStatement | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // 0-indexed
  // Which span the revenue tile reports on. Months, not days — targets are
  // distributed monthly.
  const [period, setPeriod] = useState<'month' | 'ytd' | 'custom'>('month');
  // Which layer of the money the chart reports. The tiles above it are the filter.
  const [metric, setMetric] = useState<MetricKey>('grossRevenue');
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

  // YTD stats — tile and pacing metrics filter the current month to check-ins on
  // or before today.
  const todayStr = `${year}-${String(currentMonthIdx + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const completedMonths = statement?.months.slice(0, currentMonthIdx) ?? [];

  const curMonthStmt = statement?.months[currentMonthIdx] ?? null;
  const curActualBookings = curMonthStmt?.bookings.filter(b => b.checkIn <= todayStr) ?? [];
  const curActualGross = curActualBookings.reduce((s, b) => s + b.income, 0);
  const curActualNights = curActualBookings.reduce((s, b) => s + b.nights, 0);

  // Gross: filter to check-ins on or before today (revenue can be tracked to the day)
  const ytdGross = completedMonths.reduce((s, m) => s + m.grossRevenue, 0) + curActualGross;
  // Net income: completed months only — mixing partial-month revenue with full-month expenses/PITI is misleading
  const ytdNetIncome = completedMonths.reduce((s, m) => s + m.netIncome, 0);
  const daysInCurMonth = new Date(year, currentMonthIdx + 1, 0).getDate();
  const curMonthPartialOccupancy = curActualNights / daysInCurMonth;
  const occupancyMonthCount = completedMonths.length + (curMonthStmt ? 1 : 0);
  const ytdOccupancy = occupancyMonthCount > 0
    ? (completedMonths.reduce((s, m) => s + m.occupancyRate, 0) + curMonthPartialOccupancy) / occupancyMonthCount
    : 0;

  // P&L table uses completed months only — the only period where revenue and expenses are both fully settled

  // Aggregate YTD byPlatform for the platform table

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
  // Days of the current month gone, for prorating a month's plan to today
  const daysElapsed = now.getDate();

  // Day-by-day view of the selected month, shown in place of the year charts when
  // the period is This Month. Both the revenue chart and the occupancy chart read
  // from this: revenue is what the day earned, rate is what the night sold for.
  //
  // A booking's whole income lands on its check-in day, matching how the API
  // assigns revenue to months (checkIn prefix). Spreading it across nights would
  // leak revenue into adjacent months and the bars would stop summing to the
  // Earned figure in the tile above.
  //
  // Revenue alone reads wrong though: the rest of a multi-night stay has no bar,
  // which looks identical to a vacant night. So each night also carries its
  // occupancy, and the bar for a stay is drawn as one block spanning its nights
  // (see DayBar) over a shaded "booked" band.
  const dailyChartData: DayDatum[] = (() => {
    if (period !== 'month') return [];
    const daysInMonth = new Date(year, currentMonthIdx + 1, 0).getDate();
    const monthPrefix = `${year}-${String(currentMonthIdx + 1).padStart(2, '0')}-`;
    const isLiveMonth = now.getFullYear() === year && now.getMonth() === currentMonthIdx;

    const days: DayDatum[] = Array.from({ length: daysInMonth }, (_, i) => ({
      day: String(i + 1),
      revenue: 0,
      occupied: false,
      rate: 0,
      stayNight: 0,
      stayNights: 0,
      guest: '',
      // Days still to come are greyed so an empty bar reads as "not yet"
      // rather than "earned nothing"
      isFuture: isLiveMonth && i + 1 > now.getDate(),
    }));

    // Every booking, not just this month's: a stay that checked in last month can
    // still occupy the first nights of this one.
    for (const b of statement?.months.flatMap(m => m.bookings) ?? []) {
      const nights = Math.max(1, b.nights || 0);
      const guest = b.guestName?.trim() || b.summary || '';
      // What the night sold for. The stay's gross spread evenly over its nights —
      // the same basis as the ADR figures elsewhere on the page.
      const nightlyRate = b.income / nights;

      for (let n = 0; n < nights; n++) {
        const night = addDays(b.checkIn, n);
        if (!night.startsWith(monthPrefix)) continue;
        // Slice the day out of YYYY-MM-DD rather than parsing — Date would shift it
        const day = days[Number(night.slice(8, 10)) - 1];
        if (!day) continue;
        day.occupied = true;
        day.rate = nightlyRate;
        day.stayNight = n + 1;
        day.stayNights = nights;
        day.guest = guest;
      }

      if (!b.checkIn.startsWith(monthPrefix)) continue;
      const checkInDay = Number(b.checkIn.slice(8, 10));
      const day = days[checkInDay - 1];
      if (!day) continue;
      day.revenue += b.income;
    }

    return days;
  })();

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

  // Only gross revenue has a goal anyone set. Net revenue and operating income
  // are that same goal kept at the margins the property actually ran at last
  // year — a derived mark rather than a figure anyone chose, and the only way to
  // hold four layers to one target. It scales the fixed part of operating costs
  // with revenue, which a thin month does not really do; cash flow avoids that
  // by using the contribution margin above and subtracting the mortgage whole.
  const prevNetRevenueMargin = prevStatement && prevAnnualGross > 0
    ? prevStatement.months.reduce((s, m) => s + m.netRevenue, 0) / prevAnnualGross : null;
  const prevOperatingMargin = prevStatement && prevAnnualGross > 0
    ? prevStatement.months.reduce((s, m) => s + m.operatingIncome, 0) / prevAnnualGross : null;
  const atMargin = (margin: number | null) =>
    monthlyForecasts.map(v => (v == null || margin == null ? null : Math.round(v * margin)));

  /** Each layer's plan for every month of this year, Jan–Dec. */
  const monthlyPlans: Record<MetricKey, (number | null)[]> = {
    grossRevenue: monthlyForecasts,
    netRevenue: atMargin(prevNetRevenueMargin),
    operatingIncome: atMargin(prevOperatingMargin),
    netIncome: monthlyNetForecasts,
  };

  /**
   * Where the year lands for a layer if the rest of it goes to plan: the months
   * that have closed as they actually came out, plus the plan for every month
   * still to come.
   *
   * The month in progress counts as one still to come. All of its costs have
   * landed while only part of its revenue has, so its actual is not yet a figure
   * to build a year on — which also makes closed + remaining reconcile exactly
   * to the projection.
   */
  const annualProjection = (key: MetricKey) => {
    if (!statement) return null;
    const ahead = monthlyPlans[key].slice(currentMonthIdx);
    if (ahead.some(v => v == null)) return null;
    return statement.months.slice(0, currentMonthIdx).reduce((s, m) => s + m[key], 0)
      + ahead.reduce<number>((s, v) => s + (v ?? 0), 0);
  };



  // ── Selected period ────────────────────────────────────────────────────────
  // One window drives the revenue, net income and occupancy tiles, so the whole
  // page reports the same span. Months, not days: targets and actuals are
  // monthly, so a day picker would imply precision the data does not have.
  const periodMonths: { year: number; mi: number }[] = (() => {
    if (period === 'month') return [{ year, mi: currentMonthIdx }];
    if (period === 'ytd') return Array.from({ length: currentMonthIdx + 1 }, (_, i) => ({ year, mi: i }));
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

  const monthsOfYear = (y: number) => (y === year ? statement?.months : prevStatement?.months);
  const monthStmt = ({ year: y, mi }: { year: number; mi: number }) => monthsOfYear(y)?.[mi];

  const periodLabel = period === 'month' ? MONTHS_LONG[currentMonthIdx]
    : period === 'ytd' ? `${year} to date`
    : customFrom && customTo ? `${customFrom} to ${customTo}` : 'custom range';

  // What a layer is held to for one month. Only current-year months carry a
  // plan; a closed prior-year month is its own baseline, so a custom range
  // reaching back into one takes no variance from it.
  const monthPlan = (key: MetricKey, m: { year: number; mi: number }) => {
    if (m.year === year) return monthlyPlans[key][m.mi] ?? 0;
    if (key === 'grossRevenue') return effectivePriorMonthly?.[m.mi] ?? 0;
    return monthStmt(m)?.[key] ?? 0;
  };

  /** Every layer's actual and plan for the window, so the tiles and the chart
   *  beneath them cannot disagree about what the period earned. */
  const periodTotals = METRICS.reduce((acc, { key }) => {
    acc[key] = {
      actual: periodMonths.reduce((s, m) => s + (monthStmt(m)?.[key] ?? 0), 0),
      plan: periodMonths.reduce((s, m) => s + monthPlan(key, m), 0),
    };
    return acc;
  }, {} as Record<MetricKey, { actual: number; plan: number }>);

  const periodGrossActual = periodTotals.grossRevenue.actual;

  // Where a layer's plan should stand by today, rather than where it ends.
  // Months already closed count in full, the month in progress counts the share
  // of it that has elapsed, and months still ahead count nothing. Earning 60% of
  // a month's plan reads differently on the 17th than on the 28th, and that
  // difference is the only thing the tiles cannot show.
  const planToDate = (key: MetricKey) => periodMonths.reduce((sum, m) => {
    const plan = monthPlan(key, m);
    const isPast = m.year < year || m.mi < currentMonthIdx;
    const isCurrent = m.year === year && m.mi === currentMonthIdx;
    if (isPast) return sum + plan;
    if (isCurrent) return sum + plan * (now.getDate() / daysInCurMonth);
    return sum;
  }, 0);

  // A period that has not finished is the only one where pace differs from the
  // final result; once it closes, pace is the result.
  const periodStillRunning = periodMonths.some(m => m.year > year || (m.year === year && m.mi >= currentMonthIdx));

  const selectedMetric = METRICS.find(mt => mt.key === metric) ?? METRICS[0];

  const closedMonths = periodMonths.filter(m => m.year < year || m.mi < currentMonthIdx);
  // Revenue lands in lumps on check-in days, so in the first days of a period a
  // single stay that has not arrived yet swings pace to −100%. Withhold the
  // verdict until enough of the period has run for it to mean something.
  const PACE_MIN_ELAPSED_PCT = 10;

  /**
   * The fair comparison for a layer over the window, or null while there is
   * nothing yet to judge.
   *
   * A dated layer is measured against the share of its plan that should have
   * landed by now. A layer carrying whole months of cost is measured on the
   * months that have closed instead, because the month in progress has all of
   * its costs and only part of its revenue — against a whole month's plan it
   * would read as a loss every time, which is the one thing a tile must not do.
   * The day-by-day chart is what reports the month in progress for those.
   */
  const fairPace = (key: MetricKey) => {
    const prorates = METRICS.find(mt => mt.key === key)?.prorates ?? false;
    const plan = prorates
      ? planToDate(key)
      : closedMonths.reduce((s, m) => s + monthPlan(key, m), 0);
    const actual = prorates
      ? periodTotals[key].actual
      : closedMonths.reduce((s, m) => s + (monthStmt(m)?.[key] ?? 0), 0);
    const wholePlan = periodTotals[key].plan;
    const elapsedPct = wholePlan !== 0 ? Math.min(100, (plan / wholePlan) * 100) : 0;
    if (plan === 0 || elapsedPct < PACE_MIN_ELAPSED_PCT) return null;
    return { plan, actual, pct: ((actual - plan) / Math.abs(plan)) * 100 };
  };

  const metricPace = fairPace(metric);
  const pace = paceStatus(metricPace?.pct ?? null);
  const paceCaption = metricPace == null
    ? periodTotals[metric].plan === 0
      ? 'no plan for this period'
      : selectedMetric.prorates
        ? `too early in ${periodLabel} to call`
        : `${periodLabel} is still open`
    : periodStillRunning
      ? `${Math.round((metricPace.actual / Math.abs(metricPace.plan)) * 100)}% of plan to date`
      : `${periodLabel} closed`;
  const metricProjection = annualProjection(metric);

  // Occupancy is a rate: average across the window rather than a sum.
  const periodNights = periodMonths.reduce((s, m) => s + (monthStmt(m)?.totalNights ?? 0), 0);
  // Rate, so it divides the window's revenue by its nights rather than
  // averaging monthly rates — a month with 2 nights must not weigh the same as
  // a month with 28.
  const periodAdr = periodNights > 0 ? periodGrossActual / periodNights : null;
  const periodOccMonths = periodMonths.map(monthStmt).filter((m): m is NonNullable<typeof m> => !!m);
  const periodOccActual = periodOccMonths.length
    ? periodOccMonths.reduce((s, m) => s + m.occupancyRate, 0) / periodOccMonths.length
    : null;

  /**
   * The selected layer through the month in progress, day by day.
   *
   * Only the revenue side has dates: bookings carry them, while expenses reach
   * the dashboard as monthly category totals and the mortgage as one figure. So
   * rather than invent a daily cost, the month opens at whatever it has already
   * committed and climbs as stays check in. Gross revenue opens at zero; the
   * layers beneath it open in the red, which is why crossing zero is the day the
   * month paid for itself.
   *
   * It mirrors buildPnL so the last point equals the month's own figure:
   *   netIncome = gross − platformFees − fastPay − tax − refunds − opex − piti
   * The per-booking terms are dated; refunds, operating expenses and the
   * mortgage form the opening debt of whichever layers include them.
   */
  const cumulativeData: ProgressPoint[] = (() => {
    if (period !== 'month') return [];
    const m = statement?.months[currentMonthIdx];
    if (!m) return [];
    const committed =
      metric === 'grossRevenue' ? 0
        : metric === 'netRevenue' ? m.refunds
        : metric === 'operatingIncome' ? m.refunds + m.totalOperatingExpenses
        : m.refunds + m.totalOperatingExpenses + m.piti;

    const byDay = new Array<number>(daysInCurMonth).fill(0);
    const grossByDay = new Array<number>(daysInCurMonth).fill(0);
    for (const b of m.bookings) {
      // Slice the day out of YYYY-MM-DD; Date would shift it across timezones
      const d = Number(b.checkIn.slice(8, 10));
      if (d < 1 || d > daysInCurMonth) continue;
      grossByDay[d - 1] += b.income;
      byDay[d - 1] += metric === 'grossRevenue'
        ? b.income
        : b.income - (b.platformFee ?? 0) - (b.fastPayFee ?? 0)
          - (b.taxRemitted ?? 0) - (b.taxWithheld ?? 0);
    }

    const isLiveMonth = now.getFullYear() === year && now.getMonth() === currentMonthIdx;
    return runningFrom(
      -committed, byDay, isLiveMonth ? now.getDate() : daysInCurMonth,
      // On the gross chart this would be the same line drawn twice
      metric === 'grossRevenue' ? undefined : grossByDay,
    );
  })();

  /**
   * What the month owed before it sold a night: the depth `cumulativeData`
   * opens at, shaded on the chart so the climb out of it is visible.
   */
  const monthCommitted = (() => {
    const m = statement?.months[currentMonthIdx];
    if (!m || period !== 'month') return 0;
    return DEDUCTIONS
      .filter(d => !d.dated && deductedFrom(d.from, metric))
      .reduce((s, d) => s + d.pick(m), 0);
  })();

  /**
   * Where the period's gross revenue went to arrive at the selected layer.
   *
   * The chart can only show the shape of a layer over time, and for every layer
   * but gross revenue that shape is the same staircase moved down — the costs
   * are monthly figures, so they offset the line without bending it. What they
   * cost is a composition, not a trend, so it is drawn as one.
   */
  const bridge = (() => {
    if (metric === 'grossRevenue' || periodMonths.length === 0) return null;
    const months = periodMonths.map(monthStmt).filter((m): m is NonNullable<typeof m> => !!m);
    const taken = DEDUCTIONS
      .filter(d => deductedFrom(d.from, metric))
      .map(d => ({ label: d.label, color: d.color, amount: months.reduce((s, m) => s + d.pick(m), 0) }))
      .filter(t => t.amount > 0);
    const gross = periodTotals.grossRevenue.actual;
    const left = periodTotals[metric].actual;
    // When the costs outrun the revenue there is no remainder to draw, and the
    // bar fills with them — which is the honest picture of a month that lost money
    const scale = Math.max(gross, taken.reduce((s, t) => s + t.amount, 0));
    return { gross, taken, left, scale };
  })();

  /**
   * The year as the gap to plan, month by month, for the selected layer.
   *
   * A dated layer can compare the month in progress like with like: what has
   * been earned against the plan prorated to today, so a month half elapsed does
   * not read as a miss. The layers below it cannot — a month's costs land whole
   * while its revenue is still arriving — so for those the month in progress
   * gets no bar at all and the day-by-day chart reports it instead.
   *
   * Months not yet reached show what is already booked against their whole plan,
   * drawn grey: that gap is revenue left to sell, not revenue missed.
   */
  const varianceData: VarianceDatum[] = statement?.months.map((m, i) => {
    const isCurrent = i === currentMonthIdx;
    const plan = monthlyPlans[metric][i];
    const prorated = selectedMetric.prorates && isCurrent && plan != null
      ? Math.round(plan * daysElapsed / daysInCurMonth)
      : plan;
    const actual = selectedMetric.prorates && isCurrent
      ? curActualBookings.reduce((s, b) => s + (metric === 'grossRevenue'
        ? b.income
        : b.income - (b.platformFee ?? 0) - (b.fastPayFee ?? 0)
          - (b.taxRemitted ?? 0) - (b.taxWithheld ?? 0)), 0)
      : m[metric];
    const comparable = selectedMetric.prorates
      ? prorated != null && prorated > 0
      : i < currentMonthIdx && plan != null;
    return {
      name: MONTHS[i],
      variance: comparable ? actual - (prorated ?? 0) : null,
      actual,
      actualLine: comparable ? actual : null,
      target: prorated ?? null,
      isCurrent,
      isForecast: i > currentMonthIdx,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleChartClick(data: any) {
    const idx: number | null | undefined = data?.activeTooltipIndex;
    if (idx != null) setSelectedMonth(prev => prev === idx ? null : idx);
  }


  return (
    <div className="max-w-6xl mx-auto">
      {/* A unit with no stays yet has nothing to chart, so say what it is
          waiting for rather than showing a page of zeroes. */}
      {!hasData && settings && (
        <PropertySetup
          propertyName={settings.propertyName}
          hasPITI={(settings.monthlyPITI ?? 0) > 0}
          hasTarget={manualTarget != null}
        />
      )}

      {/* ── Period filter: drives every tile on the page ── */}
      {!selMonth && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              ['month', 'This Month'],
              ['ytd', 'YTD'],
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
      )}

      {/* ── Financial performance: one chart, four layers ──
          Gross revenue and cash flow were two sections whose charts were the
          same chart on different money. The tiles are now the filter: each one
          reports its layer for the selected period and puts that layer on the
          chart below. */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
          <h2 className="text-xs uppercase tracking-wide text-slate-900 font-semibold">Financial Performance</h2>
          {/* The annual target, and the shape it is spread over, drive every
              plan figure in this section — so the controls that set them belong
              to the section rather than to one layer's tile. */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openSeasonalityEditor}
              className="text-slate-300 hover:text-slate-500 transition-colors"
              title={`Edit ${year - 1} monthly actuals — sets how the annual target splits across months`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setTargetInput(manualTarget != null ? String(manualTarget)
                  : annualForecast != null ? String(Math.round(annualForecast)) : '');
                setEditingTarget(true);
              }}
              className="text-slate-300 hover:text-slate-500 transition-colors"
              title={`Edit the ${year} revenue target`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {editingTarget && (
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <span className="text-xs text-slate-500 whitespace-nowrap">{year} revenue target</span>
            <span className="text-sm text-slate-400">$</span>
            <input
              type="number" value={targetInput} onChange={e => setTargetInput(e.target.value)}
              onBlur={saveTarget} onKeyDown={e => e.key === 'Enter' && saveTarget()}
              className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2 py-1"
              placeholder="68500" autoFocus
            />
            <button onMouseDown={e => e.preventDefault()} onClick={() => setEditingTarget(false)} className="text-slate-300 hover:text-slate-500">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Prior-year monthly actuals: what the annual target is spread over */}
        {editingSeasonality && (
          <div className="mx-5 my-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
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

        {/* ── The four layers, each one a filter for the chart below ── */}
        {!selMonth && (periodMonths.length === 0 ? (
          <div className="px-5 py-4">
            <p className="text-sm text-slate-400">Pick a start and end month.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4">
            {METRICS.map((mt, i) => {
              const { actual, plan } = periodTotals[mt.key];
              const hasPlan = plan !== 0;
              // The verdict is read against where the plan should stand by now,
              // not against the whole window — mid-month every layer is short of
              // a figure it still has half a month to earn.
              const tilePace = fairPace(mt.key);
              const verdict = tilePace ? paceStatus(tilePace.pct) : null;
              const pctOfPlan = planShare(actual, plan);
              const on = metric === mt.key;
              return (
                <button
                  key={mt.key}
                  type="button"
                  onClick={() => setMetric(mt.key)}
                  aria-pressed={on}
                  title={mt.tip}
                  className={`text-left px-4 py-4 border-b border-slate-100 transition-colors
                    ${i % 2 === 1 ? 'border-l border-slate-100' : ''}
                    ${i >= 2 ? 'border-t border-slate-100' : ''} lg:border-t-0
                    ${i > 0 ? 'lg:border-l lg:border-slate-100' : 'lg:border-l-0'}
                    ${on ? '' : 'hover:bg-slate-50/60'}`}
                  // The selected tile is washed in its own layer's colour,
                  // fading out towards the chart it is driving. Faded to the
                  // same hue at zero alpha rather than to `transparent`, which
                  // interpolates through grey and dirties the middle of the
                  // gradient.
                  style={on
                    ? { backgroundImage: `linear-gradient(180deg, ${mt.color}26 0%, ${mt.color}00 100%)` }
                    : undefined}
                >
                  <p className={`text-[11px] uppercase tracking-wide font-semibold truncate ${on ? 'text-slate-700' : 'text-slate-400'}`}>
                    {mt.label}
                  </p>
                  <div className="flex items-center justify-between gap-3 mt-1">
                    <div className="min-w-0">
                      <p className={`text-xl font-bold leading-tight ${actual < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                        {fmt(actual)}
                      </p>
                      <p className="text-[11px] truncate mt-0.5 text-slate-400">
                        {hasPlan ? `of ${fmt(plan)} plan` : 'no plan for this period'}
                        {verdict && <span className={`ml-1 font-medium ${verdict.color}`}>· {verdict.label}</span>}
                      </p>
                    </div>
                    {/* The same ring the portfolio tiles use, so a share of plan
                        is drawn one way across the app. Its colour follows the
                        verdict rather than the layer, so the ring and the words
                        beside it can never disagree. A planned loss that has
                        been beaten fills the ring, which is what beating it
                        looks like. */}
                    <PacingRing
                      pct={pctOfPlan}
                      color={verdict?.color === 'text-red-600' ? '#f43f5e' : '#10b981'}
                      label={`${mt.label}: ${pctOfPlan == null ? 'no plan' : `${Math.round(pctOfPlan)}% of plan`}`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        ))}

        {/* ── The selected layer, actual against plan ── */}
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: selectedMetric.color }} />
              {period === 'month'
                ? `${selectedMetric.label} through ${MONTHS_LONG[currentMonthIdx]}`
                : `${selectedMetric.label} over or under plan by month`}
              <InfoTip label="How to read this chart">
                {selectedMetric.tip}{' '}
                {period === 'month'
                  ? selectedMetric.breakeven
                    ? 'The month opens at the costs it has already committed — the shaded block, divided at each cost — and climbs as stays check in, so crossing zero is the day it paid for itself. The bar below names each cost; hover any day for the revenue in by then.'
                    : 'Adding up through the month, dashed where it is booked but not yet earned. The flat line is the plan. Hover any day for the gross revenue in by then and what had been taken out of it.'
                  : selectedMetric.prorates
                    ? 'Each bar is how far a month landed above or below its plan, grey where the month is still ahead and the gap is left to sell. The faint line is the level itself. Click a month to drill into its P&L.'
                    : 'Each bar is how far a month landed above or below its plan. The month in progress has no bar — its costs land before its revenue does. The faint line is the level itself. Click a month to drill into its P&L.'}
              </InfoTip>
            </p>
            <div className="text-right shrink-0">
              <p className={`text-xs font-semibold ${pace.color}`}>{pace.label}</p>
              <p className="text-[10px] text-slate-400">{paceCaption}</p>
              {metricProjection != null && (
                <p className="text-[10px] text-slate-400">{fmt(metricProjection)} projected for {year}</p>
              )}
            </div>
          </div>
          {!hasData ? (
            <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
              No data yet. Import your earnings CSV to get started.
            </div>
          ) : period === 'month' ? (
            <MonthProgressChart
              points={cumulativeData}
              monthLabel={MONTHS_LONG[currentMonthIdx]}
              fmt={fmt}
              target={periodTotals[metric].plan !== 0 ? periodTotals[metric].plan : null}
              color={selectedMetric.color}
              breakeven={selectedMetric.breakeven}
              committed={monthCommitted}
            />
          ) : (
            <>
              <YearVarianceChart
                data={varianceData}
                fmt={fmt}
                selectedIndex={selectedMonth}
                onSelect={handleChartClick}
                actualLabel={selectedMetric.label}
                pendingNote={selectedMetric.prorates ? 'Not reached yet' : 'Not closed out yet'}
              />
              {!prevHasData && manualTarget == null && (
                <p className="text-xs text-amber-700 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                  No prior-year data — set an annual target with the pencil above to enable the plan, or{' '}
                  <a href="/settings" className="underline font-medium">import {year - 1} baseline data</a>.
                </p>
              )}
            </>
          )}

          {/* ── What the period's revenue went on to reach this layer ──
              The chart shows the shape over time; this shows the composition,
              which is the part a running total cannot draw. */}
          {hasData && bridge && bridge.scale > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <p className="text-[11px] text-slate-400 mb-2">
                Where {fmt(bridge.gross)} of gross revenue went · {periodLabel}
              </p>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                {bridge.taken.map(t => (
                  <div
                    key={t.label}
                    style={{ width: `${(t.amount / bridge.scale) * 100}%`, background: t.color }}
                    title={`${t.label}: ${fmt(t.amount)}`}
                  />
                ))}
                {bridge.left > 0 && (
                  <div
                    style={{ width: `${(bridge.left / bridge.scale) * 100}%`, background: selectedMetric.color }}
                    title={`${selectedMetric.label}: ${fmt(bridge.left)}`}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[11px]">
                {bridge.taken.map(t => (
                  <span key={t.label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: t.color }} />
                    <span className="text-slate-400">{t.label}</span>
                    <span className="text-slate-600 font-medium">−{fmt(t.amount)}</span>
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: selectedMetric.color }} />
                  <span className="text-slate-400">{selectedMetric.label}</span>
                  <span className={`font-semibold ${bridge.left < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    {fmt(bridge.left)}
                  </span>
                </span>
                {/* "−38% of gross kept" is not a sentence. A period whose costs
                    outran its revenue says so instead. */}
                <span className="text-slate-400 ml-auto">
                  {bridge.gross <= 0 ? null
                    : bridge.left >= 0 ? `${((bridge.left / bridge.gross) * 100).toFixed(0)}% of gross kept`
                    : `costs ran ${fmt(-bridge.left)} past revenue`}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-xs uppercase tracking-wide text-slate-900 font-semibold">Occupancy &amp; Pricing</h2>
        </div>

      {/* The two levers, and one verdict on the pair of them. */}
      {!selMonth && hasData && (() => {
        if (periodMonths.length === 0) return null;
        const occ = periodOccActual;
        const baseline = displayOccTarget;
        const occVariancePts = occ != null && baseline != null ? occ - baseline : null;

        const adr = periodAdr;
        const adrTarget = displayAdrTarget;
        const adrVariance = adr != null && adrTarget != null ? adr - adrTarget : null;

        // The status judges the two together, as revenue per available night.
        // They trade against each other — a higher rate sells fewer nights — so
        // holding each to its own number calls a property behind for the very
        // move that put it ahead. Their product is the figure neither lever can
        // flatter on its own: raising the rate only helps while it costs fewer
        // nights than it is worth.
        const revpar = occ != null && adr != null ? (occ / 100) * adr : null;
        const planRevpar = baseline != null && adrTarget != null ? (baseline / 100) * adrTarget : null;
        const revparPct = revpar != null && planRevpar != null && planRevpar > 0
          ? ((revpar - planRevpar) / planRevpar) * 100 : null;
        const status = pacingStatus(revparPct);

        return (
          <div className="px-5 py-4">
            {editingOccTarget ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 whitespace-nowrap">Occupancy baseline</span>
                <input type="number" value={occTargetInput} onChange={e => setOccTargetInput(e.target.value)}
                  onBlur={saveOccTarget} onKeyDown={e => e.key === 'Enter' && saveOccTarget()}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5" placeholder="70" autoFocus />
                <span className="text-sm text-slate-400">%</span>
                <button onMouseDown={e => e.preventDefault()} onClick={() => setEditingOccTarget(false)} className="text-slate-300 hover:text-slate-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : editingAdrTarget && derivedAdrTarget == null ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 whitespace-nowrap">Daily rate target</span>
                <span className="text-sm text-slate-400">$</span>
                <input type="number" value={adrTargetInput} onChange={e => setAdrTargetInput(e.target.value)}
                  onBlur={saveAdrTarget} onKeyDown={e => e.key === 'Enter' && saveAdrTarget()}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5" placeholder="225" autoFocus />
                <button onMouseDown={e => e.preventDefault()} onClick={() => setEditingAdrTarget(false)} className="text-slate-300 hover:text-slate-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                {/* The two levers, each against what it is held to, and then the
                    verdict on the pair. Each lever keeps the pencil that sets
                    its own target. */}
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Occupancy</p>
                      <button
                        onClick={() => { setOccTargetInput(String(settings?.targetOccupancyPct ?? '')); setEditingOccTarget(true); }}
                        className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 -mt-0.5"
                        title="Override occupancy baseline">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-xl font-bold text-slate-900 leading-tight mt-0.5">
                      {occ != null ? `${occ.toFixed(1)}%` : '—'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {occVariancePts != null && baseline != null ? (
                        <>
                          <span className={occVariancePts >= 0 ? 'text-emerald-600' : 'text-slate-500'}>
                            {occVariancePts >= 0 ? '+' : '−'}{Math.abs(occVariancePts).toFixed(1)} pts
                          </span>
                          {` vs ${baseline.toFixed(1)}% baseline`}
                        </>
                      ) : 'no baseline set'}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Daily Rate (ADR)</p>
                      {/* With a revenue target set the rate plan is derived from
                          it, so there is nothing here to type. */}
                      {derivedAdrTarget == null && (
                        <button
                          onClick={() => { setAdrTargetInput(String(settings?.targetAdr ?? '')); setEditingAdrTarget(true); }}
                          className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 -mt-0.5"
                          title="Set daily rate target">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-xl font-bold text-slate-900 leading-tight mt-0.5">
                      {adr != null ? `${fmt(adr)}` : '—'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {adrVariance != null && adrTarget != null ? (
                        <>
                          <span className={adrVariance >= 0 ? 'text-emerald-600' : 'text-slate-500'}>
                            {adrVariance >= 0 ? '+' : '−'}{fmt(Math.abs(adrVariance))}
                          </span>
                          {` vs ${fmt(adrTarget)} plan`}
                        </>
                      ) : adr != null ? 'no rate plan set' : `no nights sold · ${periodLabel}`}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold flex items-center gap-1">
                      Status
                      <InfoTip label="How the two are judged together" align="right">
                        Occupancy and rate are read as one figure — revenue per available night, occupancy ×
                        rate. A higher rate on fewer nights can still beat the plan, and a full calendar at a
                        cut rate can still miss it, so neither lever is held to its own number alone.
                      </InfoTip>
                    </p>
                    <p className={`text-xl font-bold leading-tight mt-0.5 ${status.color}`}>{status.label}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {revpar != null && planRevpar != null
                        ? `${fmt(revpar)} of ${fmt(planRevpar)} per night available`
                        : `baseline · ${occBaselineLabel}`}
                    </p>
                  </div>
                </div>

                {revpar != null && planRevpar != null && planRevpar > 0 && (
                  <div className="w-full bg-slate-100 rounded-full h-1 mt-3.5">
                    <div className={`h-1 rounded-full transition-all ${status.color === 'text-emerald-600' ? 'bg-emerald-500' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(100, Math.max(0, (revpar / planRevpar) * 100))}%` }} />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

        <div className="border-t border-slate-100">
      {/* ── Pricing & Occupancy chart ── */}
      {hasData && (
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-slate-500 mb-3 flex items-center gap-1.5">
              {period === 'month'
                ? `${MONTHS_LONG[currentMonthIdx]} night by night`
                : 'Rate and occupancy by month'}
              <InfoTip label="How to read this chart">
                {period === 'month'
                  ? `Which nights sold and what they sold for; gaps are open nights.${displayAdrTarget != null ? ` The dashed line is the ${fmt(displayAdrTarget)} target rate.` : ''}`
                  : `Bars are occupancy, faded where they are confirmed bookings rather than nights already stayed. The line is the rate per night.${targetOcc != null ? ` The dashed line is the ${targetOcc.toFixed(1)}% baseline.` : ''}`}
              </InfoTip>
            </p>
            {targetOcc != null && (
              <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${perfColor(occVariance ?? 0, occVariance != null ? Math.abs(occVariance) : null, true)}`}>
                YTD {ytdOccupancy.toFixed(1)}% {occVariance != null ? `(${occVariance >= 0 ? '+' : ''}${occVariance.toFixed(1)}pts vs target)` : ''}
              </span>
            )}
          </div>
          {period === 'month' ? (
          <DayOccupancyChart
            data={dailyChartData}
            monthLabel={MONTHS_LONG[currentMonthIdx]}
            fmt={fmt}
            adrTarget={displayAdrTarget}
          />
          ) : (
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
          )}
        </div>
      )}
        </div>
      </section>


      {/* ── Hidden when a month is drilled into ── */}
      {hasData && !selMonth && (
        <>
          {/* The year-to-date P&L and the platform split used to sit here as two
              bare tables, in a page that is otherwise sections of tiles. The
              Income Statement tab already presents both, over any period and
              with a CSV export, so they live there and this points at them. */}
          <p className="text-xs text-slate-400 mb-8">
            Full profit &amp; loss and revenue by platform live in the{' '}
            <a href="/income-statement" className="text-slate-500 hover:text-slate-700 underline underline-offset-2">
              Income Statement
            </a>.
          </p>
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
