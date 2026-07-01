'use client';
import { useEffect, useState } from 'react';
import { AnnualStatement, Settings, LoanStructure } from '@/types';
import {
  Target, Check, DollarSign, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];


function pct(n: number) { return `${n.toFixed(1)}%`; }
function mean(arr: number[]) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

// ── Sensitivity model ─────────────────────────────────────────────────────────

interface ScenarioResult {
  target: number; stays: number; nights: number; occupancy: number;
  grossRevenue: number; cleaningCollected: number; cleaningPaidOut: number;
  annualPITI: number; annualOpEx: number; netCashFlow: number;
}

function computeScenario(
  target: number, adr: number, avgStay: number,
  cleaningFee: number, cleaningCost: number, annualPITI: number, annualOpEx: number,
): ScenarioResult | null {
  const netCleaningPerStay = cleaningFee - cleaningCost;
  const totalPerStay = adr * avgStay + netCleaningPerStay;
  if (totalPerStay <= 0) return null;
  // Solve: target = grossRevenue + cleaningNet - annualOpEx - annualPITI
  const stays = (target + annualPITI + annualOpEx) / totalPerStay;
  const nights = stays * avgStay;
  return {
    target, stays, nights, occupancy: (nights / 365) * 100,
    grossRevenue: adr * nights,
    cleaningCollected: cleaningFee * stays,
    cleaningPaidOut: cleaningCost * stays,
    annualPITI, annualOpEx, netCashFlow: target,
  };
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

function InlineInput({ label, value, onChange, onBlur, placeholder, unit, note, min, max, step }: {
  label: string; value: string; onChange: (v: string) => void;
  onBlur?: () => void;
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
          onBlur={onBlur}
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
  const [draftCleaningFee, setDraftCleaningFee] = useState('');
  const [draftRate, setDraftRate] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [draftBalance, setDraftBalance] = useState('');
  const [draftLoanTerm, setDraftLoanTerm] = useState('');
  const [draftLoanStructure, setDraftLoanStructure] = useState<LoanStructure>('fixed');
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [pitiOpen, setPitiOpen] = useState(false);
  const [draftYourAdr, setDraftYourAdr] = useState('');
  const [draftFeePerStay, setDraftFeePerStay] = useState('');

  // Sensitivity model state
  const [modelAdr, setModelAdr] = useState('');
  const [modelAvgStay, setModelAvgStay] = useState('');
  const [modelCleaningFee, setModelCleaningFee] = useState('');
  const [modelCleaningCost, setModelCleaningCost] = useState('');
  const [modelOpEx, setModelOpEx] = useState('');
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
      setDraftAdr(s.benchmarkAdr ? String(s.benchmarkAdr) : '');
      setDraftCleaningFee(s.benchmarkCleaningFee ? String(s.benchmarkCleaningFee) : '');
      setDraftRate(s.mortgageRate ? String(s.mortgageRate) : '');
      setDraftValue(s.propertyValue ? String(s.propertyValue) : '');
      setDraftBalance(s.loanBalance ? String(s.loanBalance) : '');
      setDraftLoanTerm(s.loanTermYears ? String(s.loanTermYears) : '');
      setDraftLoanStructure(s.loanStructure ?? 'fixed');
      setDraftFeePerStay(s.cleaningFeePerBooking ? String(s.cleaningFeePerBooking) : '');
    });
  }, []);

  // Initialize sensitivity model from real data once both loads complete
  useEffect(() => {
    if (modelInitialized || !settings || !statement) return;
    const activeMonths = statement.months.filter(m => m.grossRevenue > 0);
    const allBookings = activeMonths.flatMap(m => m.bookings);
    const nights = statement.totalNights ?? 0;
    const stays = allBookings.length;
    const overallAdrs = activeMonths
      .map(m => m.totalNights > 0 ? m.grossRevenue / m.totalNights : 0)
      .filter(v => v > 0);
    const avgAdr = overallAdrs.length ? mean(overallAdrs) : 0;
    const avgStay = stays > 0 && nights > 0 ? nights / stays : 3;
    const cleaningCostPaid = statement.expensesByCategory.cleaning ?? 0;
    const cleaningCostPerStay = stays > 0 ? cleaningCostPaid / stays : 0;

    const otherOpEx = (statement.totalOperatingExpenses ?? 0) - (statement.expensesByCategory.cleaning ?? 0);
    if (avgAdr > 0) setModelAdr(String(Math.round(avgAdr)));
    setModelAvgStay(String(parseFloat(avgStay.toFixed(1))));
    setModelCleaningFee(String(Math.round(settings.cleaningFeePerBooking ?? 0)));
    setModelCleaningCost(String(Math.round(cleaningCostPerStay)));
    if (otherOpEx > 0) setModelOpEx(String(Math.round(otherOpEx)));
    setModelInitialized(true);
  }, [settings, statement, modelInitialized]);

  function savePiti() {
    saveSection('piti', {
      mortgageRate: parseFloat(draftRate) || undefined,
      propertyValue: parseFloat(draftValue) || undefined,
      loanBalance: parseFloat(draftBalance) || undefined,
      loanTermYears: parseInt(draftLoanTerm) || undefined,
      loanStructure: draftLoanStructure,
    });
  }

  function saveCleaningFee() {
    saveSection('cleaning', {
      benchmarkCleaningFee: parseFloat(draftCleaningFee) || undefined,
      cleaningFeePerBooking: parseFloat(draftFeePerStay) || 0,
    });
  }

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
    new Intl.NumberFormat('en-US', {
      style: 'currency', currency: settings?.currency ?? 'USD', maximumFractionDigits: 0,
    }).format(n);

  const fmt2 = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency', currency: settings?.currency ?? 'USD',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const benchmarkAdr = settings?.benchmarkAdr ?? 0;
  const benchmarkCleaningFee = settings?.benchmarkCleaningFee ?? 0;

  const activeMonths = statement?.months.filter(m => m.grossRevenue > 0) ?? [];
  const allBookings = activeMonths.flatMap(m => m.bookings);
  const totalBookings = allBookings.length;
  const totalNights = statement?.totalNights ?? 0;
  const grossRevenue = statement?.grossRevenue ?? 0;

  // ── ADR ───────────────────────────────────────────────────────────────────────

  type PlatformKey = 'airbnb' | 'vrbo' | 'booking' | 'direct' | 'other';
  const platformData = (['airbnb', 'vrbo', 'booking', 'direct', 'other'] as PlatformKey[]).map(p => {
    const label = p === 'booking' ? 'Booking.com' : p === 'airbnb' ? 'Airbnb' : p === 'vrbo' ? 'VRBO' : p === 'direct' ? 'Direct' : 'Other';
    const income   = activeMonths.reduce((s, m) => s + (m.byPlatform[p]?.income   ?? 0), 0);
    const nights   = activeMonths.reduce((s, m) => s + (m.byPlatform[p]?.nights   ?? 0), 0);
    const bookings = activeMonths.reduce((s, m) => s + (m.byPlatform[p]?.bookings ?? 0), 0);
    const adr   = nights > 0 ? income / nights : 0;
    const share = grossRevenue > 0 ? (income / grossRevenue) * 100 : 0;
    return { platform: label, income, nights, bookings, adr, share };
  }).filter(p => p.bookings > 0);

  const topAdr = platformData.length > 0 ? Math.max(...platformData.map(p => p.adr)) : 0;
  const topPlatform = platformData.find(p => p.adr === topAdr);

  const overallAdrs = activeMonths
    .map(m => m.totalNights > 0 ? m.grossRevenue / m.totalNights : 0)
    .filter(v => v > 0);
  const overallAvgAdr = overallAdrs.length ? mean(overallAdrs) : 0;
  // Allow user to override the calculated ADR for scenario modeling
  const effectiveAdr = parseFloat(draftYourAdr) || overallAvgAdr;
  const adrGap = benchmarkAdr > 0 ? effectiveAdr - benchmarkAdr : null;
  const adrOpportunity = adrGap != null && adrGap < 0 && totalNights > 0
    ? Math.abs(adrGap) * totalNights : null;

  // ── Occupancy optimization ────────────────────────────────────────────────────

  // YTD occupancy: denominator = calendar days in months with actual data (not 365)
  const ytdDays = activeMonths.reduce((s, m) => s + new Date(m.year, m.month, 0).getDate(), 0);
  const ytdOccPct = ytdDays > 0 ? (totalNights / ytdDays) * 100 : 0;
  // Nights at risk = remaining calendar days in the year not yet reached
  const nightsAtRisk = Math.max(0, 365 - ytdDays);

  const occupancyChartData = (statement?.months ?? []).map(m => {
    const daysInMonth = new Date(m.year, m.month, 0).getDate();
    const occ = parseFloat(((m.totalNights / daysInMonth) * 100).toFixed(1));
    const monthAdr = m.totalNights > 0 ? m.grossRevenue / m.totalNights : 0;
    const flag = m.totalNights > 0 && overallAvgAdr > 0 && monthAdr > overallAvgAdr * 1.1 && occ < ytdOccPct * 0.85;
    return { name: MONTHS[m.month - 1], occupancy: occ, nights: m.totalNights, monthAdr, flag };
  });

  const flaggedMonths = occupancyChartData.filter(d => d.flag);

  // ── Cleaning fee ──────────────────────────────────────────────────────────────
  // Use user-editable fee per stay (initialized from Settings); booking-record cleaningFee
  // fields are unreliable (Airbnb CSV stores a platform-computed value, not the guest-facing fee).

  const cleaningFeePerStay = parseFloat(draftFeePerStay) || 0;
  const cleaningFeeIncome = cleaningFeePerStay * totalBookings;
  const cleaningCostPaid = statement?.expensesByCategory.cleaning ?? 0;
  const cleaningNetAnnual = cleaningFeeIncome - cleaningCostPaid;
  const cleaningCostPerStay = totalBookings > 0 ? cleaningCostPaid / totalBookings : 0;
  const cleaningNetPerStay = cleaningFeePerStay - cleaningCostPerStay;

  const cleaningOpportunity: number | null = cleaningNetPerStay < 0
    ? Math.abs(cleaningNetAnnual)
    : (benchmarkCleaningFee > 0 && cleaningFeePerStay < benchmarkCleaningFee)
      ? (benchmarkCleaningFee - cleaningFeePerStay) * totalBookings
      : null;

  // ── PITI ──────────────────────────────────────────────────────────────────────

  const annualPITI = (settings?.monthlyPITI ?? 0) * 12;
  // YTD PITI = months with actual data × monthly PITI; compare against YTD gross revenue
  const ytdMonths = activeMonths.length;
  const ytdPITI = (settings?.monthlyPITI ?? 0) * ytdMonths;
  const pitiCoverage = grossRevenue - ytdPITI;

  const mortgageRate = parseFloat(draftRate) || 0;
  const propertyValue = parseFloat(draftValue) || 0;
  const loanBalance = parseFloat(draftBalance) || 0;

  const ltv = propertyValue > 0 && loanBalance > 0 ? (loanBalance / propertyValue) * 100 : null;
  const hasPMI = ltv != null && ltv > 80;
  const estimatedPMI = hasPMI ? loanBalance * 0.01 : 0;

  const refiSavings05 = loanBalance > 0 && mortgageRate > 0 ? (loanBalance * 0.005) / 12 : null;
  const refiSavings10 = loanBalance > 0 && mortgageRate > 0 ? (loanBalance * 0.01) / 12 : null;

  // ── Ranked opportunities ──────────────────────────────────────────────────────

  const opportunities: {
    label: string; amount: number; action: string;
    variant: 'emerald' | 'amber' | 'blue';
  }[] = [];

  if (adrOpportunity != null && adrOpportunity > 0) {
    opportunities.push({
      label: 'Close ADR Gap',
      amount: adrOpportunity,
      action: `Your ADR is ${fmt(Math.abs(adrGap!))}/night below the ${fmt(benchmarkAdr)} sub-market benchmark — across ${totalNights} nights that leaves ${fmt(adrOpportunity)}/yr on the table`,
      variant: 'emerald',
    });
  }

  if (cleaningOpportunity != null && cleaningOpportunity > 0) {
    opportunities.push({
      label: cleaningNetPerStay < 0 ? 'Fix Cleaning Fee Deficit' : 'Raise Cleaning Fee to Market',
      amount: cleaningOpportunity,
      action: cleaningNetPerStay < 0
        ? `Cleaning fee is ${fmt(Math.abs(cleaningNetPerStay))}/stay below actual cost — you are subsidizing every guest stay (${fmt(Math.abs(cleaningNetAnnual))}/yr)`
        : `Your fee (${fmt(cleaningFeePerStay)}/stay) is ${fmt(benchmarkCleaningFee - cleaningFeePerStay)} below the ${fmt(benchmarkCleaningFee)} sub-market rate across ${totalBookings} stays`,
      variant: cleaningNetPerStay < 0 ? 'amber' : 'blue',
    });
  }

  if (hasPMI && estimatedPMI > 0) {
    opportunities.push({
      label: 'Remove PMI',
      amount: estimatedPMI,
      action: `LTV is ${pct(ltv!)} — above the 80% threshold. Request removal when LTV reaches 80% via paydown or appraisal (~1% of loan balance)`,
      variant: 'amber',
    });
  }

  if (refiSavings05 != null && refiSavings05 > 0) {
    opportunities.push({
      label: 'Refinance at −0.5%',
      amount: refiSavings05 * 12,
      action: `Current rate ${mortgageRate}% on ${fmt(loanBalance)} balance — a 0.5% reduction saves ${fmt(refiSavings05)}/month (${fmt(refiSavings05 * 12)}/yr)`,
      variant: 'blue',
    });
  }

  opportunities.sort((a, b) => b.amount - a.amount);
  const totalOpportunity = opportunities.reduce((s, o) => s + o.amount, 0);

  // ── Current trajectory (annualized YTD) ──────────────────────────────────────

  const annFactor = ytdMonths > 0 ? 12 / ytdMonths : 1;
  const trajNights = totalNights * annFactor;
  const trajOccupancy = (trajNights / 365) * 100;
  const trajStays = totalBookings * annFactor;
  const trajGrossRevenue = grossRevenue * annFactor;
  const ytdOtherOpEx = (statement?.totalOperatingExpenses ?? 0) - (statement?.expensesByCategory.cleaning ?? 0);
  const trajCleaningCollected = cleaningFeeIncome * annFactor;
  const trajCleaningCost = cleaningCostPaid * annFactor;
  const trajOpEx = ytdOtherOpEx * annFactor;
  const trajNetCash = trajGrossRevenue + trajCleaningCollected - trajCleaningCost - trajOpEx - annualPITI;

  // ── Sensitivity scenarios ─────────────────────────────────────────────────────

  const mAdr = parseFloat(modelAdr) || 0;
  const mAvgStay = parseFloat(modelAvgStay) || 1;
  const mCleaningFee = parseFloat(modelCleaningFee) || 0;
  const mCleaningCost = parseFloat(modelCleaningCost) || 0;
  const mOpEx = parseFloat(modelOpEx) || 0;
  const scenarios: ScenarioResult[] = scenarioTargets
    .map(t => computeScenario(parseFloat(t) || 0, mAdr, mAvgStay, mCleaningFee, mCleaningCost, annualPITI, mOpEx))
    .filter((s): s is ScenarioResult => s !== null);

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
        <select value={year} onChange={e => setYear(parseInt(e.target.value))}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
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
          {/* ══════════════════════════════════════════════════ */}
          {/* RANKED ACTION PLAN                                 */}
          {/* ══════════════════════════════════════════════════ */}
          {opportunities.length > 0 ? (
            <div className="bg-slate-900 rounded-xl p-6 mb-8">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-white">Ranked Action Plan</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Dollar-ranked opportunities identified from your {year} data</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 mb-0.5">Total Opportunity</p>
                  <p className="text-2xl font-bold text-emerald-400">{fmt(totalOpportunity)}</p>
                  <p className="text-xs text-slate-500">per year</p>
                </div>
              </div>
              <div className="space-y-3">
                {opportunities.map((opp, i) => {
                  const barWidth = totalOpportunity > 0 ? (opp.amount / totalOpportunity) * 100 : 0;
                  const colors = {
                    emerald: { bar: 'bg-emerald-500', badge: 'bg-emerald-900 text-emerald-300', amount: 'text-emerald-400' },
                    amber:   { bar: 'bg-amber-400',   badge: 'bg-amber-900 text-amber-300',     amount: 'text-amber-400'   },
                    blue:    { bar: 'bg-blue-500',    badge: 'bg-blue-900 text-blue-300',       amount: 'text-blue-400'    },
                  }[opp.variant];
                  return (
                    <div key={i} className="bg-slate-800 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${colors.badge}`}>
                            #{i + 1}
                          </span>
                          <span className="text-sm font-semibold text-white">{opp.label}</span>
                        </div>
                        <span className={`text-base font-bold ${colors.amount}`}>+{fmt(opp.amount)}/yr</span>
                      </div>
                      <p className="text-xs text-slate-400 mb-2 leading-relaxed">{opp.action}</p>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 mb-8 flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <p className="text-sm text-slate-600">
                No benchmark gaps detected. Set sub-market benchmarks in the sections below to unlock opportunity analysis.
              </p>
            </div>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/* REVENUE OPTIMIZATION                               */}
          {/* ══════════════════════════════════════════════════ */}
          <SectionHeader title="Revenue Optimization" />

          {/* ADR benchmark config */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-8">
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-400 mb-1">Your Avg ADR</p>
                <div className="flex items-baseline justify-center gap-0.5 mb-0.5">
                  <span className="text-lg font-bold text-slate-500">$</span>
                  <input
                    type="number" value={draftYourAdr}
                    onChange={e => setDraftYourAdr(e.target.value)}
                    placeholder={overallAvgAdr > 0 ? String(Math.round(overallAvgAdr)) : '—'}
                    min="0"
                    className="w-24 text-2xl font-bold text-slate-900 bg-transparent border-b border-slate-300 focus:border-emerald-500 outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400">{draftYourAdr ? 'adjusted · ' : 'from actuals · '}per night</p>
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
                  onClick={() => saveSection('adr', { benchmarkAdr: parseFloat(draftAdr) || undefined })}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700"
                >
                  {savedSection === 'adr' ? <><Check className="w-4 h-4" /> Saved</> : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {/* Platform Mix Optimization */}
          {platformData.length > 1 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-8">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Platform Mix Optimization</h3>
              <p className="text-xs text-slate-400 mb-4">
                Compare ADR and revenue share across platforms — large gaps signal an under-priced or underlisted channel.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left text-xs font-semibold text-slate-500 pb-2 pr-4">Platform</th>
                      <th className="text-right text-xs font-semibold text-slate-500 pb-2 px-4">Revenue</th>
                      <th className="text-right text-xs font-semibold text-slate-500 pb-2 px-4">Share</th>
                      <th className="text-right text-xs font-semibold text-slate-500 pb-2 px-4">ADR</th>
                      <th className="text-right text-xs font-semibold text-slate-500 pb-2 px-4">vs Best</th>
                      <th className="text-left text-xs font-semibold text-slate-500 pb-2 pl-4">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformData.map((p, i) => {
                      const gap = p.adr - topAdr;
                      const gapPct = topAdr > 0 ? (gap / topAdr) * 100 : 0;
                      const isBest = p.adr === topAdr && topAdr > 0;
                      const isUnderpriced = gapPct < -15;
                      const isLowVolume = p.share < 10 && platformData.length > 1;
                      return (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="py-3 pr-4 font-medium text-slate-700">{p.platform}</td>
                          <td className="py-3 px-4 text-right text-slate-600">{fmt(p.income)}</td>
                          <td className="py-3 px-4 text-right text-slate-600">{pct(p.share)}</td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-800">{fmt(p.adr)}/nt</td>
                          <td className={`py-3 px-4 text-right font-medium ${isBest ? 'text-emerald-600' : gap < 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                            {isBest ? '★ Best' : `${gap >= 0 ? '+' : ''}${fmt(gap)}`}
                          </td>
                          <td className="py-3 pl-4 text-xs">
                            {isBest ? (
                              <span className="text-emerald-600">Top performer</span>
                            ) : isUnderpriced && isLowVolume ? (
                              <span className="text-amber-600">Low ADR + low volume — raise pricing or improve listing</span>
                            ) : isUnderpriced ? (
                              <span className="text-amber-600">ADR {pct(Math.abs(gapPct))} below best — consider raising price</span>
                            ) : isLowVolume ? (
                              <span className="text-blue-600">Low volume — consider expanding availability</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {topPlatform && platformData.filter(p => p.adr < topAdr * 0.85).length > 0 && (
                <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  <span className="font-medium">{topPlatform.platform}</span> leads at {fmt(topAdr)}/night.
                  {platformData.filter(p => p.adr < topAdr * 0.85 && p.adr > 0).map(p =>
                    ` ${p.platform} (${fmt(p.adr)}/nt) is ${pct(((topAdr - p.adr) / topAdr) * 100)} below — test higher rates there.`
                  ).join('')}
                </p>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/* OCCUPANCY OPTIMIZATION                             */}
          {/* ══════════════════════════════════════════════════ */}
          <SectionHeader title="Occupancy Optimization" />

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">YTD Occupancy</p>
              <p className="text-2xl font-bold text-slate-900">
                {totalNights > 0 ? pct(ytdOccPct) : '—'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">{totalNights} nights / {ytdDays} days elapsed</p>
            </div>
            <div className={`rounded-xl border shadow-sm p-4 text-center ${nightsAtRisk > 180 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
              <p className="text-xs text-slate-400 mb-1">Nights at Risk</p>
              <p className={`text-2xl font-bold ${nightsAtRisk > 180 ? 'text-amber-700' : 'text-slate-900'}`}>
                {nightsAtRisk}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">calendar days left in {year}</p>
            </div>
            <div className={`rounded-xl border shadow-sm p-4 text-center ${flaggedMonths.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
              <p className="text-xs text-slate-400 mb-1">Price-Suppressed Months</p>
              <p className={`text-2xl font-bold ${flaggedMonths.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {flaggedMonths.length}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                {flaggedMonths.length > 0 ? flaggedMonths.map(d => d.name).join(', ') : 'none detected'}
              </p>
            </div>
          </div>

          {occupancyChartData.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-8">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Monthly Occupancy Rate</h3>
              <p className="text-xs text-slate-400 mb-4">
                Amber bars have above-average ADR but below-average occupancy — a signal that pricing may be suppressing bookings.
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={occupancyChartData} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                  <Tooltip
                    formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, 'Occupancy']}
                    labelFormatter={label => {
                      const d = occupancyChartData.find(x => x.name === label);
                      return d ? `${label} · ${d.nights} nights · ADR ${d.monthAdr > 0 ? fmt(d.monthAdr) : '—'}` : label;
                    }}
                  />
                  {ytdOccPct > 0 && (
                    <ReferenceLine y={ytdOccPct} stroke="#94a3b8" strokeDasharray="4 4"
                      label={{ value: `YTD avg ${ytdOccPct.toFixed(0)}%`, position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
                  )}
                  <Bar dataKey="occupancy" name="Occupancy" radius={[4, 4, 0, 0]}>
                    {occupancyChartData.map((d, i) => (
                      <Cell key={i} fill={d.flag ? '#f59e0b' : d.nights === 0 ? '#e2e8f0' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {flaggedMonths.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mt-4 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-800">
                    <span className="font-semibold">{flaggedMonths.map(d => d.name).join(', ')}</span>
                    {flaggedMonths.length === 1 ? ' has' : ' have'} above-average ADR but below-average occupancy —
                    consider testing lower rates to capture more bookings in {flaggedMonths.length === 1 ? 'that month' : 'those months'}.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/* EXPENSE OPTIMIZATION                               */}
          {/* ══════════════════════════════════════════════════ */}
          <SectionHeader title="Expense Optimization" />

          {/* Cleaning fee — single merged card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Cleaning Fee Analysis</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {totalBookings} stays · {fmt(cleaningFeePerStay)}/stay charged · {fmt(cleaningCostPerStay)}/stay cost
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 mb-0.5">Annual Net</p>
                <p className={`text-xl font-bold ${cleaningNetAnnual >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {cleaningNetAnnual >= 0 ? `+${fmt(cleaningNetAnnual)}` : `(${fmt(Math.abs(cleaningNetAnnual))})`}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-slate-400 mb-1">Fee Collected</p>
                <div className="flex items-baseline justify-center gap-0.5 mb-0.5">
                  <span className="text-sm font-bold text-emerald-600">$</span>
                  <input
                    type="number" value={draftFeePerStay}
                    onChange={e => setDraftFeePerStay(e.target.value)}
                    onBlur={saveCleaningFee}
                    placeholder="0" min="0"
                    className="w-14 text-base font-bold text-emerald-700 bg-transparent border-b border-emerald-300 focus:border-emerald-500 outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400">per stay</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-slate-400 mb-1">Cost Paid</p>
                <p className="text-base font-bold text-red-500">({fmt(cleaningCostPerStay)})</p>
                <p className="text-[10px] text-slate-400">per stay</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${cleaningNetPerStay >= 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <p className="text-[10px] text-slate-400 mb-1">Net per Stay</p>
                <p className={`text-base font-bold ${cleaningNetPerStay >= 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                  {cleaningNetPerStay >= 0 ? fmt(cleaningNetPerStay) : `(${fmt(Math.abs(cleaningNetPerStay))})`}
                </p>
                <p className="text-[10px] text-slate-400">{cleaningNetPerStay >= 0 ? 'profit center' : 'subsidized'}</p>
              </div>
            </div>
            {cleaningNetPerStay < 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  You are absorbing {fmt(Math.abs(cleaningNetPerStay))}/stay in cleaning costs.
                  Raising your fee to <strong>{fmt(cleaningCostPerStay + 25)}</strong> would cover costs and produce a margin.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
              <InlineInput
                label="Sub-market cleaning fee/stay ($)"
                value={draftCleaningFee} onChange={setDraftCleaningFee}
                placeholder="e.g. 150" unit="$"
                note="Average cleaning fee in your sub-market"
              />
              <div className="flex flex-col justify-end">
                {benchmarkCleaningFee > 0 && (
                  <p className="text-xs text-slate-500 mb-2">
                    You charge {fmt(cleaningFeePerStay)} vs {fmt(benchmarkCleaningFee)} market.{' '}
                    <span className={cleaningFeePerStay >= benchmarkCleaningFee ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                      {cleaningFeePerStay >= benchmarkCleaningFee ? 'At or above market.' : `${fmt(benchmarkCleaningFee - cleaningFeePerStay)}/stay below.`}
                    </span>
                  </p>
                )}
                <button
                  onClick={saveCleaningFee}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 w-fit"
                >
                  {savedSection === 'cleaning' ? <><Check className="w-4 h-4" /> Saved</> : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {/* PITI */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-10">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">PITI Analysis</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-400 mb-1">Monthly PITI</p>
                <p className="text-2xl font-bold text-slate-900">{fmt(settings?.monthlyPITI ?? 0)}</p>
                <p className="text-[10px] text-slate-400 mt-1">from settings</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-400 mb-1">Annual PITI</p>
                <p className="text-2xl font-bold text-slate-900">{fmt(annualPITI)}</p>
                <p className="text-[10px] text-slate-400 mt-1">total fixed cost</p>
              </div>
              <div className={`rounded-lg p-4 text-center ${
                pitiCoverage < 0 ? 'bg-red-50 border border-red-200'
                : pitiCoverage < (settings?.monthlyPITI ?? 0) * 2 ? 'bg-amber-50 border border-amber-200'
                : 'bg-emerald-50 border border-emerald-200'
              }`}>
                <p className="text-xs text-slate-400 mb-1">YTD Revenue vs PITI</p>
                <p className={`text-2xl font-bold ${pitiCoverage < 0 ? 'text-red-700' : pitiCoverage < (settings?.monthlyPITI ?? 0) * 2 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {grossRevenue > 0
                    ? (pitiCoverage >= 0 ? `+${fmt(pitiCoverage)}` : `(${fmt(Math.abs(pitiCoverage))})`)
                    : '—'}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {pitiCoverage >= 0 ? 'surplus after ' : 'shortfall vs '}{ytdMonths}mo PITI
                </p>
              </div>
            </div>

            {/* Loan & Property Details — always visible */}
            <div className="border-t border-slate-100 mt-4 pt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Loan & Property Details</p>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
                <InlineInput
                  label="Market Value ($)" value={draftValue} onChange={setDraftValue}
                  onBlur={savePiti} placeholder="e.g. 500000" unit="$"
                />
                <InlineInput
                  label="Remaining Principal ($)" value={draftBalance} onChange={setDraftBalance}
                  onBlur={savePiti} placeholder="e.g. 380000" unit="$"
                />
                <InlineInput
                  label="APR (%)" value={draftRate} onChange={setDraftRate}
                  onBlur={savePiti} placeholder="e.g. 7.25" unit="%" min="0" max="30" step="0.125"
                />
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Loan Structure</label>
                  <select
                    value={draftLoanStructure}
                    onChange={e => {
                      const s = e.target.value as LoanStructure;
                      setDraftLoanStructure(s);
                      saveSection('piti', {
                        mortgageRate: parseFloat(draftRate) || undefined,
                        propertyValue: parseFloat(draftValue) || undefined,
                        loanBalance: parseFloat(draftBalance) || undefined,
                        loanTermYears: parseInt(draftLoanTerm) || undefined,
                        loanStructure: s,
                      });
                    }}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="fixed">Fixed Rate</option>
                    <option value="arm">Adjustable (ARM)</option>
                    <option value="interest_only">Interest-Only</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Loan Term (years)</label>
                  <input
                    type="number" value={draftLoanTerm}
                    onChange={e => setDraftLoanTerm(e.target.value)}
                    onBlur={savePiti}
                    placeholder="e.g. 30" min="5" max="40" step="1"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => saveSection('piti', {
                    mortgageRate: parseFloat(draftRate) || undefined,
                    propertyValue: parseFloat(draftValue) || undefined,
                    loanBalance: parseFloat(draftBalance) || undefined,
                    loanTermYears: parseInt(draftLoanTerm) || undefined,
                    loanStructure: draftLoanStructure,
                  })}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700"
                >
                  {savedSection === 'piti' ? <><Check className="w-4 h-4" /> Saved</> : 'Save'}
                </button>
                {ltv != null && (
                  <span className="text-xs text-slate-500">
                    LTV: <span className={`font-semibold ${ltv > 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{pct(ltv)}</span>
                  </span>
                )}
                {draftLoanStructure === 'interest_only' && (
                  <span className="text-xs text-amber-600 font-medium">
                    Interest-only: no principal paydown — equity grows from appreciation only
                  </span>
                )}
              </div>
            </div>

            {/* Refinance & PMI Analysis */}
            <button
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 mt-4"
              onClick={() => setPitiOpen(v => !v)}
            >
              {pitiOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {pitiOpen ? 'Hide' : 'Show'} refinance + PMI analysis
            </button>

            {pitiOpen && (
              <div className="border-t border-slate-100 mt-3 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-600 mb-2">Rate Reduction</p>
                    {mortgageRate > 0 && loanBalance > 0 ? (
                      <>
                        <p className="text-xs text-slate-500 mb-3">Current APR: <span className="font-semibold">{mortgageRate}%</span></p>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">−0.5% reduction</span>
                            <span className="font-semibold text-emerald-700">+{fmt(refiSavings05!)}/mo</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">−1.0% reduction</span>
                            <span className="font-semibold text-emerald-700">+{fmt(refiSavings10!)}/mo</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400">Enter APR and principal above.</p>
                    )}
                  </div>
                  <div className={`rounded-xl p-4 ${hasPMI ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                    <p className="text-xs font-semibold text-slate-600 mb-2">PMI Removal</p>
                    {ltv != null ? (
                      hasPMI ? (
                        <>
                          <p className="text-xs text-amber-700 mb-1">LTV {pct(ltv)} — above 80%</p>
                          <p className="text-sm font-bold text-amber-700">~{fmt(estimatedPMI)}/yr</p>
                          <p className="text-[10px] text-slate-500 mt-1">Request removal when LTV hits 80%.</p>
                        </>
                      ) : (
                        <p className="text-xs text-emerald-700">LTV {pct(ltv)} — below 80%, PMI likely n/a.</p>
                      )
                    ) : (
                      <p className="text-xs text-slate-400">Enter market value and principal.</p>
                    )}
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-600 mb-2">Insurance Review</p>
                    <ul className="text-[11px] text-slate-500 space-y-1">
                      <li>• Shop 3 STR-specific carriers annually</li>
                      <li>• Bundle with auto/umbrella for discounts</li>
                      <li>• Check AirCover overlap to avoid double coverage</li>
                      <li>• Verify liability limits ≥ $1M</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════ */}
          {/* PROFITABILITY SENSITIVITY TABLE                    */}
          {/* ══════════════════════════════════════════════════ */}
          <SectionHeader title="Profitability Sensitivity" />

          <p className="text-xs text-slate-400 mb-5">
            Model what it takes to hit each profit target — nights, occupancy, and revenue required given your cost structure.
            Edit assumptions to recalculate live.
          </p>

          {/* Model assumptions */}
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
                <label className="text-xs text-slate-500 block mb-1">Other Annual Op Ex</label>
                <input type="number" value={modelOpEx} onChange={e => setModelOpEx(e.target.value)}
                  placeholder="e.g. 9000" min="0"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <p className="text-xs text-slate-400 mt-0.5">Utilities, maintenance, etc. (excl. cleaning)</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-3">Profit Targets (columns)</p>
              <div className="flex flex-wrap gap-4">
                {scenarioTargets.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Scenario {i + 1}</span>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <input type="number" value={t}
                        onChange={e => {
                          const next: [string, string, string] = [...scenarioTargets] as [string, string, string];
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
          {scenarios.length > 0 && mAdr > 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
              <div className="px-6 py-3 bg-slate-800 border-b border-slate-700">
                <h3 className="text-sm font-bold text-white">STR Profitability Sensitivity Table</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-5 py-3 text-left font-semibold text-slate-600 w-52">Key Financial Metrics</th>
                    {scenarios.map((s, i) => (
                      <th key={i} className="px-5 py-3 text-right font-semibold text-slate-800">
                        {s.target === 0 ? 'Break-Even ($0)' : `${fmt(s.target)} Profit`}
                      </th>
                    ))}
                    {ytdMonths > 0 && (
                      <th className="px-5 py-3 text-right font-semibold text-indigo-700 bg-indigo-50 border-l border-indigo-100">
                        Your Pace ×12
                        <div className="text-[10px] font-normal text-indigo-400">{ytdMonths}mo annualized</div>
                      </th>
                    )}
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
                    {ytdMonths > 0 && <td className="px-5 py-2.5 text-right font-bold text-indigo-600 bg-indigo-50 border-l border-indigo-100 text-xs italic">projected</td>}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-5 py-3 text-slate-600">Annual Occupancy Rate</td>
                    {scenarios.map((s, i) => (
                      <td key={i} className="px-5 py-3 text-right font-semibold text-slate-800">{s.occupancy.toFixed(1)}%</td>
                    ))}
                    {ytdMonths > 0 && <td className="px-5 py-3 text-right font-semibold text-indigo-700 bg-indigo-50 border-l border-indigo-100">{trajOccupancy.toFixed(1)}%</td>}
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td className="px-5 py-3 text-slate-600">Nights Booked / Year</td>
                    {scenarios.map((s, i) => (
                      <td key={i} className="px-5 py-3 text-right text-slate-700">{s.nights.toFixed(1)} nights</td>
                    ))}
                    {ytdMonths > 0 && <td className="px-5 py-3 text-right text-indigo-700 bg-indigo-50 border-l border-indigo-100">{trajNights.toFixed(1)} nights</td>}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-5 py-3 text-slate-600">Total Reservations / Year</td>
                    {scenarios.map((s, i) => (
                      <td key={i} className="px-5 py-3 text-right text-slate-700">{s.stays.toFixed(1)} stays</td>
                    ))}
                    {ytdMonths > 0 && <td className="px-5 py-3 text-right text-indigo-700 bg-indigo-50 border-l border-indigo-100">{trajStays.toFixed(1)} stays</td>}
                  </tr>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <td className="px-5 py-3 font-semibold text-slate-700">Gross Rental Revenue</td>
                    {scenarios.map((s, i) => (
                      <td key={i} className="px-5 py-3 text-right font-semibold text-slate-800">{fmt2(s.grossRevenue)}</td>
                    ))}
                    {ytdMonths > 0 && <td className="px-5 py-3 text-right font-semibold text-indigo-700 bg-indigo-50 border-l border-indigo-100">{fmt2(trajGrossRevenue)}</td>}
                  </tr>
                  {mCleaningFee > 0 && (
                    <tr className="border-b border-slate-100">
                      <td className="px-5 py-3 text-slate-500 pl-8 text-xs">+ Cleaning Fees Collected</td>
                      {scenarios.map((s, i) => (
                        <td key={i} className="px-5 py-3 text-right text-emerald-600 text-xs">+{fmt2(s.cleaningCollected)}</td>
                      ))}
                      {ytdMonths > 0 && <td className="px-5 py-3 text-right text-indigo-500 text-xs bg-indigo-50 border-l border-indigo-100">+{fmt2(trajCleaningCollected)}</td>}
                    </tr>
                  )}
                  {mCleaningCost > 0 && (
                    <tr className="border-b border-slate-100">
                      <td className="px-5 py-3 text-slate-500 pl-8 text-xs">− Cleaning Costs Paid Out</td>
                      {scenarios.map((s, i) => (
                        <td key={i} className="px-5 py-3 text-right text-red-500 text-xs">({fmt2(s.cleaningPaidOut)})</td>
                      ))}
                      {ytdMonths > 0 && <td className="px-5 py-3 text-right text-red-400 text-xs bg-indigo-50 border-l border-indigo-100">({fmt2(trajCleaningCost)})</td>}
                    </tr>
                  )}
                  {(mOpEx > 0 || ytdOtherOpEx > 0) && (
                    <tr className="border-b border-slate-100">
                      <td className="px-5 py-3 text-slate-600">Other Operating Expenses</td>
                      {scenarios.map((s, i) => (
                        <td key={i} className="px-5 py-3 text-right text-red-500">({fmt2(s.annualOpEx)})</td>
                      ))}
                      {ytdMonths > 0 && <td className="px-5 py-3 text-right text-red-400 bg-indigo-50 border-l border-indigo-100">({fmt2(trajOpEx)})</td>}
                    </tr>
                  )}
                  <tr className="border-b border-slate-100">
                    <td className="px-5 py-3 text-slate-600">Annual PITI</td>
                    {scenarios.map((s, i) => (
                      <td key={i} className="px-5 py-3 text-right text-red-500">({fmt2(s.annualPITI)})</td>
                    ))}
                    {ytdMonths > 0 && <td className="px-5 py-3 text-right text-red-400 bg-indigo-50 border-l border-indigo-100">({fmt2(annualPITI)})</td>}
                  </tr>
                  <tr className="bg-slate-800">
                    <td className="px-5 py-4 font-bold text-white">Net Cash Flow</td>
                    {scenarios.map((s, i) => (
                      <td key={i} className="px-5 py-4 text-right font-bold text-emerald-400 text-base">
                        {s.netCashFlow === 0 ? '$0.00' : `+${fmt2(s.netCashFlow)}`}
                      </td>
                    ))}
                    {ytdMonths > 0 && (
                      <td className={`px-5 py-4 text-right font-bold text-base bg-indigo-900 border-l border-indigo-700 ${trajNetCash >= 0 ? 'text-indigo-300' : 'text-red-400'}`}>
                        {trajNetCash >= 0 ? `+${fmt2(trajNetCash)}` : `(${fmt2(Math.abs(trajNetCash))})`}
                      </td>
                    )}
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
                <span>Other OpEx: {fmt(mOpEx)}/yr</span>
                <span>·</span>
                <span>Annual PITI: {fmt(annualPITI)}</span>
                <span>·</span>
                <span className="font-medium text-slate-500">Total fixed costs: {fmt(mOpEx + annualPITI)}/yr</span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500 mb-8">
              Enter an ADR above to generate the sensitivity table.
            </div>
          )}
        </>
      )}
    </div>
  );
}
