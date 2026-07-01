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

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 w-full py-3 group"
      >
        <div className="h-px flex-1 bg-slate-200 group-hover:bg-slate-300 transition-colors" />
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap group-hover:text-slate-600 transition-colors">
          {title}
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
        <div className="h-px flex-1 bg-slate-200 group-hover:bg-slate-300 transition-colors" />
      </button>
      {open && <div className="mt-2 mb-6">{children}</div>}
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
  const [draftCleaningCostPerBooking, setDraftCleaningCostPerBooking] = useState('');
  const [draftCapitalDeployed, setDraftCapitalDeployed] = useState('');

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
      setDraftFeePerStay(s.guestCleaningFeePerBooking ? String(s.guestCleaningFeePerBooking) : '');
      setDraftCleaningCostPerBooking(s.cleaningFeePerBooking ? String(s.cleaningFeePerBooking) : '');
      setDraftCapitalDeployed(s.totalCapitalDeployed ? String(s.totalCapitalDeployed) : '');
      setDraftYourAdr(s.yourAdr ? String(s.yourAdr) : '');
      if (s.sensitivityAdr) setModelAdr(String(s.sensitivityAdr));
      if (s.sensitivityAvgStay) setModelAvgStay(String(s.sensitivityAvgStay));
      if (s.sensitivityCleaningFee != null) setModelCleaningFee(String(s.sensitivityCleaningFee));
      if (s.sensitivityCleaningCost != null) setModelCleaningCost(String(s.sensitivityCleaningCost));
      if (s.sensitivityOpEx != null) setModelOpEx(String(s.sensitivityOpEx));
      if (s.sensitivityTarget1 != null || s.sensitivityTarget2 != null || s.sensitivityTarget3 != null) {
        setScenarioTargets([
          String(s.sensitivityTarget1 ?? 0),
          String(s.sensitivityTarget2 ?? 5000),
          String(s.sensitivityTarget3 ?? 10000),
        ]);
      }
    });
  }, []);

  // Seed sensitivity model from real data for fields the user hasn't saved yet
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

    // Only seed from data if user hasn't saved a value already
    if (!settings.sensitivityAdr && avgAdr > 0) setModelAdr(String(Math.round(avgAdr)));
    if (!settings.sensitivityAvgStay) setModelAvgStay(String(parseFloat(avgStay.toFixed(1))));
    if (settings.sensitivityCleaningFee == null) setModelCleaningFee(String(Math.round(settings.guestCleaningFeePerBooking ?? 0)));
    if (settings.sensitivityCleaningCost == null) setModelCleaningCost(String(Math.round(cleaningCostPerStay)));
    if (settings.sensitivityOpEx == null && otherOpEx > 0) setModelOpEx(String(Math.round(otherOpEx)));
    setModelInitialized(true);
  }, [settings, statement, modelInitialized]);

  function saveModel() {
    saveSection('model', {
      sensitivityAdr: parseFloat(modelAdr) || undefined,
      sensitivityAvgStay: parseFloat(modelAvgStay) || undefined,
      sensitivityCleaningFee: parseFloat(modelCleaningFee) || 0,
      sensitivityCleaningCost: parseFloat(modelCleaningCost) || 0,
      sensitivityOpEx: parseFloat(modelOpEx) || 0,
      sensitivityTarget1: parseFloat(scenarioTargets[0]) || 0,
      sensitivityTarget2: parseFloat(scenarioTargets[1]) || 5000,
      sensitivityTarget3: parseFloat(scenarioTargets[2]) || 10000,
    });
  }

  function savePiti() {
    saveSection('piti', {
      mortgageRate: parseFloat(draftRate) || undefined,
      propertyValue: parseFloat(draftValue) || undefined,
      loanBalance: parseFloat(draftBalance) || undefined,
      loanTermYears: parseInt(draftLoanTerm) || undefined,
      loanStructure: draftLoanStructure,
      totalCapitalDeployed: parseFloat(draftCapitalDeployed) || undefined,
    });
  }

  function saveCleaningFee() {
    saveSection('cleaning', {
      benchmarkCleaningFee: parseFloat(draftCleaningFee) || undefined,
      guestCleaningFeePerBooking: parseFloat(draftFeePerStay) || 0,
      cleaningFeePerBooking: parseFloat(draftCleaningCostPerBooking) || 0,
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
                  onBlur={saveModel} placeholder="e.g. 250" min="0"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Avg Stay (nights)</label>
                <input type="number" value={modelAvgStay} onChange={e => setModelAvgStay(e.target.value)}
                  onBlur={saveModel} placeholder="e.g. 3.0" min="1" step="0.1"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Cleaning Fee / Stay</label>
                <input type="number" value={modelCleaningFee} onChange={e => setModelCleaningFee(e.target.value)}
                  onBlur={saveModel} placeholder="charged to guest" min="0"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                <p className="text-xs text-slate-400 mt-0.5">Charged to guest</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Cleaning Cost / Stay</label>
                <input type="number" value={modelCleaningCost} onChange={e => setModelCleaningCost(e.target.value)}
                  onBlur={saveModel} placeholder="paid to cleaner" min="0"
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
                  onBlur={saveModel} placeholder="e.g. 9000" min="0"
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
                        onBlur={saveModel}
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

          {/* ── Action Plan ──────────────────────────────────────────────────────── */}
          <CollapsibleSection title="Action Plan">
            {opportunities.length > 0 ? (
              <div className="bg-slate-900 rounded-xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ranked Opportunities</p>
                  <span className="text-sm font-bold text-emerald-400">{fmt(totalOpportunity)}/yr potential</span>
                </div>
                <div className="space-y-4">
                  {opportunities.map((op, i) => {
                    const colors = {
                      emerald: 'border-emerald-500 bg-emerald-950',
                      amber: 'border-amber-500 bg-amber-950',
                      blue: 'border-blue-500 bg-blue-950',
                    };
                    const textColors = {
                      emerald: 'text-emerald-400',
                      amber: 'text-amber-400',
                      blue: 'text-blue-400',
                    };
                    return (
                      <div key={i} className={`border-l-2 pl-4 py-2 rounded-r-lg ${colors[op.variant]}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold uppercase tracking-wide ${textColors[op.variant]}`}>
                            #{i + 1} {op.label}
                          </span>
                          <span className={`text-sm font-bold ${textColors[op.variant]}`}>{fmt(op.amount)}/yr</span>
                        </div>
                        <p className="text-xs text-slate-400">{op.action}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <p className="text-sm text-slate-600">No benchmark gaps detected. Set sub-market benchmarks in the sections below to unlock opportunity analysis.</p>
              </div>
            )}
          </CollapsibleSection>

          {/* ── Revenue Optimization ─────────────────────────────────────────────── */}
          <CollapsibleSection title="Revenue Optimization">
            {/* ADR benchmark card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">ADR Benchmarks</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <InlineInput
                  label="Sub-Market Benchmark ADR"
                  value={draftAdr}
                  onChange={setDraftAdr}
                  onBlur={() => saveSection('adr', { benchmarkAdr: parseFloat(draftAdr) || undefined })}
                  unit="$" placeholder="e.g. 280"
                  note="Your target vs. comparable listings"
                />
                <InlineInput
                  label="Your ADR Override"
                  value={draftYourAdr}
                  onChange={setDraftYourAdr}
                  onBlur={() => saveSection('adr', { benchmarkAdr: parseFloat(draftAdr) || undefined, yourAdr: parseFloat(draftYourAdr) || undefined })}
                  unit="$" placeholder={overallAvgAdr > 0 ? String(Math.round(overallAvgAdr)) : 'calculated'}
                  note={`Calculated from data: ${fmt2(overallAvgAdr)}/night`}
                />
                <div className="flex flex-col justify-center">
                  <p className="text-xs text-slate-500 mb-1">Gap to Benchmark</p>
                  <p className={`text-lg font-bold ${adrGap == null ? 'text-slate-400' : adrGap >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {adrGap == null ? '—' : `${adrGap >= 0 ? '+' : ''}${fmt2(adrGap)}`}
                  </p>
                  <p className="text-[10px] text-slate-400">per night</p>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-xs text-slate-500 mb-1">Annual Revenue Impact</p>
                  <p className={`text-lg font-bold ${adrOpportunity == null ? 'text-slate-400' : adrOpportunity > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                    {adrOpportunity == null ? '—' : adrOpportunity > 0 ? `(${fmt(adrOpportunity)})` : `+${fmt(Math.abs(adrGap! * totalNights))}`}
                  </p>
                  <p className="text-[10px] text-slate-400">across {totalNights} nights</p>
                </div>
              </div>
              {savedSection === 'adr' && (
                <p className="text-xs text-emerald-600 mt-3 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</p>
              )}
            </div>

            {/* Platform mix table */}
            {platformData.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">Platform Mix</p>
                  {topPlatform && <p className="text-xs text-slate-400">Best ADR: <span className="font-semibold text-slate-700">{topPlatform.platform}</span> @ {fmt2(topAdr)}/night</p>}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold">
                      <th className="px-5 py-2.5 text-left">Platform</th>
                      <th className="px-5 py-2.5 text-right">Bookings</th>
                      <th className="px-5 py-2.5 text-right">Nights</th>
                      <th className="px-5 py-2.5 text-right">Revenue</th>
                      <th className="px-5 py-2.5 text-right">ADR</th>
                      <th className="px-5 py-2.5 text-right">Rev Share</th>
                      <th className="px-5 py-2.5 text-right">vs Best ADR</th>
                      <th className="px-5 py-2.5 text-left pl-4">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformData.map((p, i) => {
                      const gap = topAdr > 0 ? p.adr - topAdr : 0;
                      const isTop = p.adr === topAdr;
                      return (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-5 py-3 font-medium text-slate-800">{p.platform}</td>
                          <td className="px-5 py-3 text-right text-slate-600">{p.bookings}</td>
                          <td className="px-5 py-3 text-right text-slate-600">{p.nights}</td>
                          <td className="px-5 py-3 text-right text-slate-700 font-medium">{fmt(p.income)}</td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-800">{fmt2(p.adr)}</td>
                          <td className="px-5 py-3 text-right text-slate-600">{p.share.toFixed(1)}%</td>
                          <td className={`px-5 py-3 text-right font-medium ${isTop ? 'text-emerald-600' : gap < -20 ? 'text-red-500' : 'text-amber-600'}`}>
                            {isTop ? '— best —' : `${fmt2(gap)}`}
                          </td>
                          <td className="px-5 py-3 pl-4 text-xs text-slate-500">
                            {isTop ? 'Keep growing this channel' : gap < -20 ? 'Consider raising rates or reducing allocation' : 'Competitive — monitor trends'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleSection>

          {/* ── Occupancy Optimization ───────────────────────────────────────────── */}
          <CollapsibleSection title="Occupancy Optimization">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-900">{ytdOccPct.toFixed(1)}%</p>
                <p className="text-xs text-slate-500 mt-1">YTD Occupancy</p>
                <p className="text-[10px] text-slate-400 mt-1">{totalNights} nights / {ytdDays} days elapsed</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-900">{totalNights}</p>
                <p className="text-xs text-slate-500 mt-1">Nights Booked YTD</p>
                <p className="text-[10px] text-slate-400 mt-1">across {ytdMonths} months</p>
              </div>
              <div className={`border rounded-xl p-4 text-center ${nightsAtRisk > 60 ? 'bg-red-50 border-red-200' : nightsAtRisk > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <p className={`text-2xl font-bold ${nightsAtRisk > 60 ? 'text-red-600' : nightsAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{nightsAtRisk}</p>
                <p className="text-xs text-slate-500 mt-1">Nights at Risk</p>
                <p className="text-[10px] text-slate-400 mt-1">calendar days left in {year}</p>
              </div>
            </div>

            {/* Price suppression flags */}
            {flaggedMonths.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1">Price-Suppression Flags</p>
                  <p className="text-xs text-amber-600">
                    {flaggedMonths.map(m => m.name).join(', ')} — high ADR + low occupancy. Consider lowering nightly rate to fill gaps.
                  </p>
                </div>
              </div>
            )}

            {/* Occupancy bar chart */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Monthly Occupancy Rate</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={occupancyChartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                  <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, 'Occupancy']} />
                  {ytdOccPct > 0 && (
                    <ReferenceLine y={ytdOccPct} stroke="#6366f1" strokeDasharray="4 2"
                      label={{ value: `YTD avg ${ytdOccPct.toFixed(0)}%`, position: 'insideTopRight', fontSize: 10, fill: '#6366f1' }} />
                  )}
                  <Bar dataKey="occupancy" radius={[3, 3, 0, 0]}>
                    {occupancyChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.flag ? '#f59e0b' : entry.occupancy >= 70 ? '#10b981' : entry.occupancy >= 40 ? '#6366f1' : '#cbd5e1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> ≥70% occ</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> 40–69%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" /> &lt;40%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> price-suppressed</span>
              </div>
            </div>
          </CollapsibleSection>

          {/* ── Expense Optimization ─────────────────────────────────────────────── */}
          <CollapsibleSection title="Expense Optimization">
            {/* Cleaning fee card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Cleaning Fee Analysis</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
                <InlineInput
                  label="Your Fee / Stay"
                  value={draftFeePerStay}
                  onChange={setDraftFeePerStay}
                  onBlur={saveCleaningFee}
                  unit="$" placeholder="e.g. 150"
                  note="Charged to guest each booking"
                />
                <InlineInput
                  label="Your Cost / Stay"
                  value={draftCleaningCostPerBooking}
                  onChange={setDraftCleaningCostPerBooking}
                  onBlur={saveCleaningFee}
                  unit="$" placeholder="e.g. 110"
                  note="Paid to cleaner — auto-expensed in P&L"
                />
                <InlineInput
                  label="Sub-Market Benchmark"
                  value={draftCleaningFee}
                  onChange={setDraftCleaningFee}
                  onBlur={saveCleaningFee}
                  unit="$" placeholder="e.g. 175"
                  note="Comparable listings in your market"
                />
                <div>
                  <p className="text-xs text-slate-500 mb-1">Net / Stay</p>
                  <p className={`text-lg font-bold ${cleaningNetPerStay < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt2(cleaningNetPerStay)}</p>
                  <p className="text-[10px] text-slate-400 mt-1">fee minus cleaner cost</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Annual Cleaning Net</p>
                  <p className={`text-lg font-bold ${cleaningNetAnnual < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(cleaningNetAnnual)}</p>
                  <p className="text-[10px] text-slate-400 mt-1">across {totalBookings} stays</p>
                </div>
              </div>
              {savedSection === 'cleaning' && (
                <p className="text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</p>
              )}
            </div>

            {/* PITI card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">PITI &amp; Mortgage</p>
                <button onClick={() => setPitiOpen(o => !o)} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                  {pitiOpen ? 'Hide' : 'Edit loan details'}
                  {pitiOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* PITI KPI row */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Annual PITI</p>
                  <p className="text-xl font-bold text-slate-900">{fmt(annualPITI)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{fmt(settings?.monthlyPITI ?? 0)}/month</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">YTD Revenue vs PITI</p>
                  <p className={`text-xl font-bold ${pitiCoverage >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {pitiCoverage >= 0 ? `+${fmt(pitiCoverage)}` : `(${fmt(Math.abs(pitiCoverage))})`}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{ytdMonths}mo revenue vs {ytdMonths}mo PITI</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">LTV</p>
                  <p className={`text-xl font-bold ${ltv == null ? 'text-slate-400' : ltv > 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {ltv == null ? '—' : pct(ltv)}
                  </p>
                  {hasPMI && <p className="text-[10px] text-amber-500 mt-0.5">PMI applies (~{fmt(estimatedPMI)}/yr)</p>}
                </div>
              </div>

              {pitiOpen && (
                <div className="pt-4 border-t border-slate-100">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <InlineInput label="Mortgage Rate" value={draftRate} onChange={setDraftRate} onBlur={savePiti}
                      unit="%" placeholder="e.g. 6.75" step="0.01" note="Current interest rate" />
                    <InlineInput label="Property Value" value={draftValue} onChange={setDraftValue} onBlur={savePiti}
                      unit="$" placeholder="e.g. 450000" note="Current market estimate" />
                    <InlineInput label="Remaining Balance" value={draftBalance} onChange={setDraftBalance} onBlur={savePiti}
                      unit="$" placeholder="e.g. 320000" note="Current loan balance" />
                    <InlineInput label="Remaining Term" value={draftLoanTerm} onChange={setDraftLoanTerm} onBlur={savePiti}
                      placeholder="e.g. 27" note="Years remaining on loan" />
                    <InlineInput label="Capital Deployed" value={draftCapitalDeployed} onChange={setDraftCapitalDeployed} onBlur={savePiti}
                      unit="$" placeholder="e.g. 196000" note="Down payment + reno + startup" />
                  </div>
                  <div className="mt-4">
                    <p className="text-xs text-slate-500 mb-2">Loan Structure</p>
                    <div className="flex gap-2">
                      {(['fixed', 'arm'] as LoanStructure[]).map(s => (
                        <button key={s} onClick={() => { setDraftLoanStructure(s); savePiti(); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${draftLoanStructure === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                          {s === 'fixed' ? 'Fixed Rate' : 'ARM'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {refiSavings05 != null && (
                    <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                      <p className="text-xs font-semibold text-blue-700 mb-1">Refinance Scenarios</p>
                      <p className="text-xs text-blue-600">−0.5% rate → save {fmt(refiSavings05)}/month ({fmt(refiSavings05 * 12)}/yr)</p>
                      {refiSavings10 && <p className="text-xs text-blue-600">−1.0% rate → save {fmt(refiSavings10)}/month ({fmt(refiSavings10 * 12)}/yr)</p>}
                    </div>
                  )}
                  {savedSection === 'piti' && (
                    <p className="text-xs text-emerald-600 mt-3 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</p>
                  )}
                </div>
              )}
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
