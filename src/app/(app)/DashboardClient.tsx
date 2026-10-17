'use client';
import { useEffect, useRef, useState } from 'react';
import { AnnualStatement, MonthlyStatement, Settings, Platform } from '@/types';
import StatCard from '@/components/StatCard';
import { TrendingUp, X, Pencil, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { pacingStatus, paceStatus } from '@/lib/pacing';
import InfoTip from '@/components/InfoTip';
import { addDays } from '@/lib/dateRange';
import {
  DayRevenueChart, DayOccupancyChart, MonthProgressChart, DayDatum, ProgressPoint,
} from '@/components/DayCharts';
import { YearVarianceChart, VarianceDatum } from '@/components/YearVarianceChart';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine,
} from 'recharts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

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
  const curMonthForecast = monthlyForecasts[currentMonthIdx];
  // Prorate current month's forecast by days elapsed so ytdForecast matches the ytdGross horizon
  const daysElapsed = now.getDate();
  const curMonthForecastProrated = curMonthForecast != null
    ? Math.round(curMonthForecast * daysElapsed / daysInCurMonth)
    : 0;

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

  // Gross revenue as the gap to target rather than the level. The section reports
  // pacing, and a stack split five ways by platform asked the reader to add up
  // twelve comparisons to find it — the platform mix is already a table below.
  //
  // The current month compares like with like: revenue booked to date against
  // the target prorated to today, so a month half elapsed does not read as a
  // miss. Months not yet reached have no variance at all — what is on their
  // books is a forecast, not a shortfall.
  const varianceChartData: VarianceDatum[] = statement?.months.map((m, i) => {
    const isCurrent = i === currentMonthIdx;
    // A month still ahead is measured on what is booked so far against its full
    // target — the gap is what is left to sell, so the bar is drawn grey.
    const isForecast = i > currentMonthIdx;
    const target = isCurrent ? curMonthForecastProrated : monthlyForecasts[i];
    const actual = isCurrent ? curActualGross : m.grossRevenue;
    const hasTarget = target != null && target > 0;
    return {
      name: MONTHS[i],
      variance: hasTarget ? actual - target : null,
      actual,
      actualLine: hasTarget ? actual : null,
      target: target ?? null,
      isCurrent,
      isForecast,
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

  // Only current-year months carry a target; closed prior-year months are their
  // own baseline, so they contribute no variance.
  const periodGrossTarget = periodMonths.reduce((s, m) =>
    s + (m.year === year ? (monthlyForecasts[m.mi] ?? 0) : (effectivePriorMonthly?.[m.mi] ?? 0)), 0);
  const periodGrossActual = periodMonths.reduce((s, m) => s + (monthStmt(m)?.grossRevenue ?? 0), 0);

  // Where the period's target should stand by today, rather than where it ends.
  // Months already closed contribute in full, the month in progress contributes
  // the share of it that has elapsed, and months still ahead contribute nothing.
  // Earning 60% of a month's target reads differently on the 17th than the 28th,
  // and that difference is the only thing the first two columns cannot show.
  const periodGrossExpectedToDate = periodMonths.reduce((sum, m) => {
    const monthTarget = m.year === year ? (monthlyForecasts[m.mi] ?? 0) : (effectivePriorMonthly?.[m.mi] ?? 0);
    const isPast = m.year < year || m.mi < currentMonthIdx;
    const isCurrent = m.year === year && m.mi === currentMonthIdx;
    if (isPast) return sum + monthTarget;
    if (isCurrent) return sum + monthTarget * (now.getDate() / daysInCurMonth);
    return sum;
  }, 0);
  // A period that has not finished is the only one where pace differs from the
  // final result; once it closes, pace is the result.
  const periodStillRunning = periodMonths.some(m => m.year > year || (m.year === year && m.mi >= currentMonthIdx));
  const periodElapsedPct = periodGrossTarget > 0
    ? Math.min(100, (periodGrossExpectedToDate / periodGrossTarget) * 100)
    : null;
  // Revenue lands in lumps on check-in days, so in the first days of a period a
  // single stay that has not arrived yet swings pace to −100%. Withhold the
  // verdict until enough of the period has run for it to mean something.
  const PACE_MIN_ELAPSED_PCT = 10;
  const paceIsMeaningful = periodGrossExpectedToDate > 0
    && (periodElapsedPct ?? 0) >= PACE_MIN_ELAPSED_PCT;
  const pacePct = paceIsMeaningful
    ? ((periodGrossActual - periodGrossExpectedToDate) / periodGrossExpectedToDate) * 100
    : null;

  const periodNetTarget = periodMonths.reduce((s, m) =>
    s + (m.year === year ? (monthlyNetForecasts[m.mi] ?? 0) : (monthStmt(m)?.netIncome ?? 0)), 0);
  const periodNetActual = periodMonths.reduce((s, m) => s + (monthStmt(m)?.netIncome ?? 0), 0);

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

  // Cumulative net income through the selected month, shown in place of the year
  // view when the period is This Month.
  //
  // Only the revenue side has dates: bookings carry them, expenses reach the
  // dashboard as monthly category totals and PITI as one figure. So rather than
  // invent a daily cost, the month opens in the red by its whole committed cost
  // and climbs as bookings land. The line crossing zero is the breakeven day.
  //
  // Mirrors buildPnL so the last point equals the month's netIncome:
  //   netIncome = gross − platformFees − fastPay − tax − refunds − opex − piti
  // Per-booking terms are dated; refunds, opex and piti form the opening debt.
  // The month's net income as a running total, the same shape as the revenue
  // chart above it. It opens below zero at the costs the month has already
  // committed — operating expenses, PITI, refunds — and climbs as stays check
  // in, so crossing zero is the day the month paid for itself.
  const cumulativeNetData: ProgressPoint[] = (() => {
    if (period !== 'month') return [];
    const m = statement?.months[currentMonthIdx];
    if (!m) return [];
    const daysInMonth = new Date(year, currentMonthIdx + 1, 0).getDate();
    const committed = m.totalOperatingExpenses + m.piti + m.refunds;

    const byDay = new Array<number>(daysInMonth).fill(0);
    for (const b of m.bookings) {
      // Slice the day out of YYYY-MM-DD; Date would shift it across timezones
      const d = Number(b.checkIn.slice(8, 10));
      if (d < 1 || d > daysInMonth) continue;
      byDay[d - 1] += (b.income ?? 0) - (b.platformFee ?? 0) - (b.fastPayFee ?? 0)
        - (b.taxRemitted ?? 0) - (b.taxWithheld ?? 0);
    }

    const isLiveMonth = now.getFullYear() === year && now.getMonth() === currentMonthIdx;
    const todayDay = isLiveMonth ? now.getDate() : daysInMonth;

    let running = -committed;
    return byDay.map((v, i) => {
      running += v;
      const day = i + 1;
      const value = Math.round(running);
      // Solid to today, dashed beyond — the tail is confirmed bookings not yet
      // checked in. Both carry today's point so the lines meet.
      return {
        day: String(day),
        earned: day <= todayDay ? value : null,
        booked: day >= todayDay ? value : null,
        today: Math.round(v),
        isFuture: day > todayDay,
      };
    });
  })();

  // Net income against its forecast, as the gap. Completed months only: this
  // month's costs — a full month of PITI and recurring expenses — have all
  // landed while its revenue has not, so comparing it to a whole month's
  // forecast would report a loss that the day-by-day view shows closing. The
  // gross chart can prorate its target; costs do not prorate.
  const netVarianceChartData: VarianceDatum[] = statement?.months.map((m, i) => {
    const target = monthlyNetForecasts[i];
    const comparable = i < currentMonthIdx && target != null;
    return {
      name: MONTHS[i],
      variance: comparable ? m.netIncome - target : null,
      actual: m.netIncome,
      actualLine: comparable ? m.netIncome : null,
      target: target ?? null,
      isCurrent: i === currentMonthIdx,
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

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-xs uppercase tracking-wide text-slate-900 font-semibold">Gross Revenue</h2>
        </div>

      {/* One tile per measure, reporting the selected period */}
      {!selMonth && hasTarget && annualForecast != null && (() => {
        if (periodMonths.length === 0) {
          return (
            <div className="px-5 py-4">
              <p className="text-sm text-slate-400">Pick a start and end month.</p>
            </div>
          );
        }
        const earned = periodGrossActual;
        const target = periodGrossTarget;
        const hasTargetForPeriod = target > 0;
        const stillNeeded = Math.max(0, target - earned);
        // Beating the target is worth reporting, so keep the surplus rather than
        // clamping it to zero and showing only "Covered".
        const surplus = hasTargetForPeriod ? Math.max(0, earned - target) : 0;
        const variance = earned - target;
        // Uncapped for the caption — 112% of target is the fact. The bar is
        // capped separately so it cannot overflow its track.
        const pctOfTarget = hasTargetForPeriod ? (earned / target) * 100 : null;
        const barPct = pctOfTarget != null ? Math.min(100, pctOfTarget) : 0;
        const pace = paceStatus(pacePct);
        return (
          <div className="px-5 py-4">
            <div className="flex items-start gap-4 sm:gap-6">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Earned</p>
                <p className="text-xl font-bold text-slate-900 leading-tight mt-0.5">{fmt(earned)}</p>
                <p className="text-[11px] text-slate-400 truncate">of {fmt(target)} target · {periodLabel}</p>
              </div>
              <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">
                  {surplus > 0 ? 'Over Target' : 'Still Needed'}
                </p>
                <p className={`text-xl font-bold leading-tight mt-0.5 ${
                  !hasTargetForPeriod ? 'text-slate-400'
                    : surplus > 0 || stillNeeded === 0 ? 'text-emerald-600'
                    : 'text-slate-900'
                }`}>
                  {!hasTargetForPeriod ? '—'
                    : surplus > 0 ? `+${fmt(surplus)}`
                    : stillNeeded === 0 ? 'Covered'
                    : fmt(stillNeeded)}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {pctOfTarget != null ? `${pctOfTarget.toFixed(0)}% of target earned` : 'no target for this period'}
                </p>
              </div>
              <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold flex items-center gap-1">
                    Pace
                    <InfoTip label="What pace means" align="right">
                      Whether the revenue earned is ahead of where this period&rsquo;s target should stand by
                      today, rather than where it ends. Within 5% either way counts as on pace.
                    </InfoTip>
                  </p>
                  <div className="flex items-center gap-1 shrink-0 -mt-0.5">
                    <button onClick={openSeasonalityEditor} className="text-slate-300 hover:text-slate-500 transition-colors"
                      title={`Edit ${year - 1} monthly actuals — sets how the annual target splits across months`}>
                      <CalendarDays className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => { setTargetInput(String(manualTarget ?? Math.round(annualForecast))); setEditingTarget(true); }}
                      className="text-slate-300 hover:text-slate-500 transition-colors" title="Edit annual target">
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {editingTarget ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-sm text-slate-400">$</span>
                    <input type="number" value={targetInput} onChange={e => setTargetInput(e.target.value)}
                      onBlur={saveTarget} onKeyDown={e => e.key === 'Enter' && saveTarget()}
                      className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2 py-1" placeholder="68500" autoFocus />
                    <button onMouseDown={e => e.preventDefault()} onClick={() => setEditingTarget(false)} className="text-slate-300 hover:text-slate-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className={`text-xl font-bold leading-tight mt-0.5 ${pace.color}`}>{pace.label}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {pacePct == null
                        ? (hasTargetForPeriod ? `too early in ${periodLabel} to call` : 'no target for this period')
                        : periodStillRunning
                          ? `${pctOfTarget?.toFixed(0)}% earned · ${periodElapsedPct?.toFixed(0)}% of ${periodLabel} gone`
                          : `${periodLabel} closed`}
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1 mt-3.5">
              <div className={`h-1 rounded-full transition-all ${variance >= 0 ? 'bg-emerald-500' : barPct >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${barPct}%` }} />
            </div>
          </div>
        );
      })()}

      {/* 2025 monthly actuals editor */}
      {editingSeasonality && !selMonth && (
        <div className="mx-5 mb-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
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
        <div className="border-t border-slate-100">
      {/* Chart */}
      <div className="px-5 py-4">
        <p className="text-xs font-medium text-slate-500 mb-4 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
          {period === 'month'
            ? `${MONTHS_LONG[currentMonthIdx]} against target`
            : 'Over or under target by month'}
          <InfoTip label="How to read this chart">
            {period === 'month'
              ? 'Revenue adding up through the month, dashed where it is booked but not yet earned. The flat line is the month\u2019s target.'
              : 'Each bar is how far a month landed above or below its target, grey where the month is still ahead and the gap is left to sell. The faint line is revenue booked. Click a month to drill into its P&L.'}
          </InfoTip>
        </p>
        {!hasData ? (
          <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
            No data yet. Import your earnings CSV to get started.
          </div>
        ) : period === 'month' ? (
          <DayRevenueChart
            data={dailyChartData}
            monthLabel={MONTHS_LONG[currentMonthIdx]}
            fmt={fmt}
            target={periodGrossTarget}
          />
        ) : (
          <>
            <YearVarianceChart
              data={varianceChartData}
              fmt={fmt}
              selectedIndex={selectedMonth}
              onSelect={handleChartClick}
            />
            {!prevHasData && manualTarget == null && (
              <p className="text-xs text-amber-700 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                No prior-year data — set an annual target on the pacing card above to enable the forecast line, or{' '}
                <a href="/settings" className="underline font-medium">import 2025 baseline data</a>.
              </p>
            )}
          </>
        )}
      </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-xs uppercase tracking-wide text-slate-900 font-semibold">Cash Flow</h2>
        </div>

      {/* One tile: what the period earned after costs, and against projection */}
      {!selMonth && hasData && (() => {
        if (periodMonths.length === 0) return null;
        const net = periodNetActual;
        const projected = periodNetTarget;
        const variance = net - projected;
        const hasProjection = projected !== 0;
        const variancePct = hasProjection ? (variance / Math.abs(projected)) * 100 : null;
        const status = pacingStatus(variancePct);

        // Costs behind the figure, for the same window
        const revenue = periodMonths.reduce((s, m) => s + (monthStmt(m)?.netRevenue ?? 0), 0);
        const opex = periodMonths.reduce((s, m) => s + (monthStmt(m)?.totalOperatingExpenses ?? 0), 0);
        const piti = periodMonths.reduce((s, m) => s + (monthStmt(m)?.piti ?? 0), 0);
        // The part of the mortgage payment that bought equity rather than being
        // spent. This tile reports cash flow, which subtracts it — so a month
        // reading as a loss may still have moved the owner forward.
        const principal = periodMonths.reduce((s, m) => s + (monthStmt(m)?.mortgagePrincipal ?? 0), 0);

        // No red wash behind a negative month: the figure and the status are
        // already red, and tinting the whole tile only makes them harder to read
        return (
          <div className="px-5 py-4">
            <div className="flex items-start gap-4 sm:gap-6">
              {/* Same sequence as Gross Revenue: the total, the gap to what was
                  projected, then the verdict. Named for what it is inside the
                  section, the way that section's first column is "Earned" —
                  repeating the section title told the reader nothing. */}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold flex items-center gap-1">
                  Bottom Line
                  {principal > 0 && (
                    <InfoTip label="How cash flow differs from net income">
                      Net income was {fmt(net + principal)}. Cash flow is {fmt(principal)} lower because that much
                      of the mortgage payment repaid principal — equity built rather than money spent.
                    </InfoTip>
                  )}
                </p>
                <p className={`text-xl font-bold leading-tight mt-0.5 ${net < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {net >= 0 ? '+' : ''}{fmt(net)}
                </p>
                {/* The costs that produced it, sitting under the figure they explain
                    rather than in a column of their own. */}
                <p className="text-[11px] text-slate-400 truncate">
                  {periodLabel} · {fmt(revenue)} revenue − {fmt(opex + piti)} costs
                </p>
              </div>
              <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">
                  {hasProjection && variance >= 0 ? 'Over Projection' : 'Still Needed'}
                </p>
                <p className={`text-xl font-bold leading-tight mt-0.5 ${
                  !hasProjection ? 'text-slate-400' : variance >= 0 ? 'text-emerald-600' : 'text-slate-900'
                }`}>
                  {!hasProjection ? '—'
                    : variance >= 0 ? `+${fmt(variance)}`
                    : fmt(Math.abs(variance))}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {hasProjection ? `of ${fmt(projected)} projected` : 'no projection for this period'}
                </p>
              </div>
              <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Status</p>
                <p className={`text-xl font-bold leading-tight mt-0.5 ${status.color}`}>{status.label}</p>
                {/* The annual anchor, matching Gross Revenue's status caption. No
                    percentage: a month projected at $120 turns a $1,553 miss into
                    1,294%, which reads as a data error rather than a shortfall. */}
                <p className="text-[11px] text-slate-400 truncate">
                  {annualNetForecast != null
                    ? `${fmt(annualNetForecast)} annual projection`
                    : periodLabel}
                </p>
              </div>
            </div>
            {projected > 0 && (
              <div className="w-full bg-slate-100 rounded-full h-1 mt-3.5">
                <div className="h-1 rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, (net / projected) * 100))}%` }} />
              </div>
            )}
          </div>
        );
      })()}

        <div className="border-t border-slate-100">
      {/* P&L Chart */}
      {hasData && (
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-slate-500 mb-4 flex items-center gap-1.5">
            {period === 'month'
              ? `${MONTHS_LONG[currentMonthIdx]} against plan`
              : 'Over or under plan by month'}
            <InfoTip label="How to read this chart">
              {period === 'month'
                ? 'Opens at the month\u2019s committed costs and climbs as bookings land. Crossing zero is breakeven.'
                : 'Each bar is how far a month landed above or below its projection. The faint line is net income itself. Months still open have no bar — their costs land before their revenue does.'}
            </InfoTip>
          </p>
          {period === 'month' ? (
            <MonthProgressChart
              points={cumulativeNetData}
              monthLabel={MONTHS_LONG[currentMonthIdx]}
              fmt={fmt}
              target={periodNetTarget !== 0 ? periodNetTarget : null}
              color="#6366f1"
              breakeven
            />
          ) : (
            <YearVarianceChart
              data={netVarianceChartData}
              fmt={fmt}
              selectedIndex={selectedMonth}
              onSelect={handleChartClick}
              actualLabel="Net income"
              pendingNote="Not closed out yet"
            />
          )}
        </div>
      )}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-xs uppercase tracking-wide text-slate-900 font-semibold">Occupancy &amp; Pricing</h2>
        </div>

      {/* Occupancy and rate for the period, with one status. Break-even rate,
          nights booked and a second rate status came out: break-even is a
          full-year figure that ignores the filter, and two status verdicts in
          one section left it unclear which one the section was reporting. */}
      {!selMonth && hasData && (() => {
        if (periodMonths.length === 0) return null;
        const occ = periodOccActual;
        const baseline = displayOccTarget;
        const variancePts = occ != null && baseline != null ? occ - baseline : null;
        // Variance is in points; express against the baseline so it shares the
        // same 5% bands as the revenue and net income tiles.
        const variancePct = variancePts != null && baseline != null && baseline > 0
          ? (variancePts / baseline) * 100 : null;
        const status = pacingStatus(variancePct);

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
                {/* Same sequence as the other two sections: the measure, the gap
                    to what it is held to, then the verdict. The daily rate moves
                    under the occupancy it was earned at — it is context for the
                    figure, not a second thing to compare. */}
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Occupancy</p>
                    <p className="text-xl font-bold text-slate-900 leading-tight mt-0.5">
                      {occ != null ? `${occ.toFixed(1)}%` : '—'}
                    </p>
                    <div className="flex items-center gap-1 min-w-0">
                      <p className="text-[11px] text-slate-400 truncate">
                        {periodLabel}
                        {periodAdr != null && ` · ${fmt(periodAdr)}/night`}
                        {periodAdr != null && displayAdrTarget != null && ` of ${fmt(displayAdrTarget)} target`}
                      </p>
                      {derivedAdrTarget == null && (
                        <button
                          onClick={() => { setAdrTargetInput(String(settings?.targetAdr ?? '')); setEditingAdrTarget(true); }}
                          className="text-slate-300 hover:text-slate-500 transition-colors shrink-0"
                          title="Set daily rate target">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Gap to the baseline, carrying the pencil that sets it */}
                  <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">
                        {variancePts != null && variancePts >= 0 ? 'Over Baseline' : 'Still Needed'}
                      </p>
                      <button
                        onClick={() => { setOccTargetInput(String(settings?.targetOccupancyPct ?? '')); setEditingOccTarget(true); }}
                        className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 -mt-0.5"
                        title="Override occupancy baseline">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    <p className={`text-xl font-bold leading-tight mt-0.5 ${
                      variancePts == null ? 'text-slate-400'
                        : variancePts >= 0 ? 'text-emerald-600'
                        : 'text-slate-900'
                    }`}>
                      {variancePts == null ? '—'
                        : variancePts >= 0 ? `+${variancePts.toFixed(1)} pts`
                        : `${Math.abs(variancePts).toFixed(1)} pts`}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {baseline != null ? `of ${baseline.toFixed(1)}% baseline` : 'no baseline set'}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:pl-6">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Status</p>
                    <p className={`text-xl font-bold leading-tight mt-0.5 ${status.color}`}>{status.label}</p>
                    {/* Where the baseline comes from, the way Gross Revenue's status
                        caption names the annual target behind it. */}
                    <p className="text-[11px] text-slate-400 truncate">baseline · {occBaselineLabel}</p>
                  </div>
                </div>

                {occ != null && (
                  <div className="w-full bg-slate-100 rounded-full h-1 mt-3.5">
                    <div className={`h-1 rounded-full transition-all ${status.color === 'text-emerald-600' ? 'bg-emerald-500' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(100, Math.max(0, occ))}%` }} />
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
