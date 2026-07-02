'use client';
import { useEffect, useState } from 'react';
import { AnnualStatement, MonthlyStatement, Platform, PnLSummary, Settings } from '@/types';
import { getMonth, getYear } from 'date-fns';
import { Download } from 'lucide-react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts';

const MONTHS_LONG = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PLATFORMS = ['airbnb','booking','vrbo','direct','other'] as Platform[];
const platformLabel = (p: string) => p === 'booking' ? 'Booking.com' : p.charAt(0).toUpperCase() + p.slice(1);

type Mode = 'month' | 'ytd' | 'prior_year' | 'full_year';

function emptyBreakdown() {
  return Object.fromEntries(
    PLATFORMS.map(p => [p, { income: 0, nights: 0, bookings: 0 }])
  ) as Record<Platform, { income: number; nights: number; bookings: number }>;
}

function sumMonths(months: MonthlyStatement[]): PnLSummary & { totalNights: number; avgOccupancy: number; byPlatform: Record<Platform, { income: number; nights: number; bookings: number }> } {
  const byPlatform = emptyBreakdown();
  let totalNights = 0;
  let totalOccupancy = 0;
  let grossRevenue = 0;
  let platformFees = 0;
  let refunds = 0;
  let totalOperatingExpenses = 0;
  let piti = 0;

  let fastPayFees = 0;
  let taxRemitted = 0;
  let ownerTaxes = 0;
  const expensesByCategory = { cleaning: 0, electric: 0, water: 0, internet: 0, yard_care: 0, supplies: 0, refund: 0, maintenance: 0, other: 0 };

  for (const m of months) {
    totalNights += m.totalNights;
    totalOccupancy += m.occupancyRate;
    grossRevenue += m.grossRevenue;
    platformFees += m.platformFees;
    fastPayFees += m.fastPayFees;
    taxRemitted += m.taxRemitted;
    ownerTaxes += m.ownerTaxes;
    refunds += m.refunds;
    totalOperatingExpenses += m.totalOperatingExpenses;
    piti += m.piti;
    for (const cat of Object.keys(expensesByCategory) as (keyof typeof expensesByCategory)[]) {
      expensesByCategory[cat] += m.expensesByCategory[cat] ?? 0;
    }
    for (const p of PLATFORMS) {
      byPlatform[p].income += m.byPlatform[p].income;
      byPlatform[p].nights += m.byPlatform[p].nights;
      byPlatform[p].bookings += m.byPlatform[p].bookings;
    }
  }

  const netRevenue = grossRevenue - platformFees - fastPayFees - taxRemitted - refunds;
  const operatingIncome = netRevenue - totalOperatingExpenses;
  const netIncome = operatingIncome - piti;

  return {
    grossRevenue, platformFees, fastPayFees, taxRemitted, refunds, netRevenue,
    expensesByCategory, ownerTaxes, totalOperatingExpenses,
    operatingIncome, piti, netIncome,
    totalNights,
    avgOccupancy: months.length ? totalOccupancy / months.length : 0,
    byPlatform,
  };
}

export default function IncomeStatementPage() {
  const [statement, setStatement] = useState<AnnualStatement | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [mode, setMode] = useState<Mode>('ytd');
  const today = new Date();
  const currentMonthIdx = getMonth(today);
  const currentYear = getYear(today);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, []);

  const fetchYear = mode === 'prior_year' ? currentYear - 1
    : mode === 'ytd' ? currentYear
    : selectedYear;

  useEffect(() => {
    fetch(`/api/income-statement?year=${fetchYear}`)
      .then(r => r.json())
      .then(d => {
        setStatement(d.statement);
        const available = d.years as number[];
        if (!available.includes(fetchYear)) available.push(fetchYear);
        setYears(available.sort((a, b) => b - a));
      });
  }, [fetchYear]);

  // Slice of months to display based on selected mode
  const activeMonthsSlice: MonthlyStatement[] = statement
    ? mode === 'month'
      ? ([statement.months[selectedMonth - 1]].filter(Boolean) as MonthlyStatement[])
      : mode === 'ytd'
      ? statement.months.slice(0, currentMonthIdx + 1)
      : statement.months
    : [];

  function PnLTable({ pnl, label, months: monthCount }: { pnl: ReturnType<typeof sumMonths>; label: string; months: number }) {
    const hasData = pnl.grossRevenue > 0 || pnl.totalOperatingExpenses > 0 || pnl.piti > 0;
    const hasFees = pnl.platformFees > 0;
    const hasFastPayFees = pnl.fastPayFees > 0;
    const hasTaxRemitted = pnl.taxRemitted > 0;
    const hasRefunds = pnl.refunds > 0;
    const hasExpenses = pnl.totalOperatingExpenses > 0;
    const hasPITI = pnl.piti > 0;

    function Row({ label: l, value, indent = false, bold = false, accent = false, negative = false, separator = false }: {
      label: string; value: number; indent?: boolean; bold?: boolean; accent?: boolean; negative?: boolean; separator?: boolean;
    }) {
      return (
        <tr className={`${separator ? 'border-t-2 border-slate-200' : 'border-t border-slate-50'} ${bold ? 'font-semibold' : ''}`}>
          <td className={`px-4 py-2 text-slate-700 ${indent ? 'pl-8 text-slate-500 text-sm' : ''}`}>{l}</td>
          <td className={`px-4 py-2 text-right ${
            accent ? (value >= 0 ? 'text-emerald-700' : 'text-red-600') :
            negative ? 'text-red-500' :
            bold ? 'text-slate-800' : 'text-slate-600'
          } ${bold ? 'text-base' : 'text-sm'}`}>
            {negative || value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
          </td>
        </tr>
      );
    }

    if (!hasData) {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 text-sm text-amber-800">
          No data yet for {label}. Go to Import Earnings and upload a CSV from your platform dashboard to get started.
        </div>
      );
    }

    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">{label} — Profit &amp; Loss</h2>
        </div>
        <table className="w-full">
          <tbody>
            {/* Revenue */}
            <tr className="border-t border-slate-100">
              <td colSpan={2} className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Revenue</td>
            </tr>
            <Row label="Gross Revenue" value={pnl.grossRevenue} />
            {PLATFORMS.filter(p => pnl.byPlatform[p].income > 0)
              .sort((a, b) => pnl.byPlatform[b].income - pnl.byPlatform[a].income)
              .map(p => (
                <Row key={p} label={platformLabel(p)} value={pnl.byPlatform[p].income} indent />
              ))}
            {hasFees && <Row label="Platform Fees" value={pnl.platformFees} indent negative />}
            {hasFastPayFees && <Row label="Fast Pay Fees" value={pnl.fastPayFees} indent negative />}
            {hasTaxRemitted && <Row label="Tax Remitted by Platform" value={pnl.taxRemitted} indent negative />}
            {hasRefunds && <Row label="Guest Refunds" value={pnl.refunds} indent negative />}
            <Row label="Net Revenue" value={pnl.netRevenue} bold separator accent />

            {/* Operating expenses */}
            {hasExpenses && (
              <>
                <tr>
                  <td colSpan={2} className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide border-t border-slate-100">Operating Expenses</td>
                </tr>
                {pnl.expensesByCategory.cleaning > 0 && <Row label="Cleaning" value={pnl.expensesByCategory.cleaning} indent negative />}
                {pnl.expensesByCategory.electric > 0 && <Row label="Electric" value={pnl.expensesByCategory.electric} indent negative />}
                {pnl.expensesByCategory.water > 0 && <Row label="Water" value={pnl.expensesByCategory.water} indent negative />}
                {pnl.expensesByCategory.internet > 0 && <Row label="Internet" value={pnl.expensesByCategory.internet} indent negative />}
                {pnl.expensesByCategory.yard_care > 0 && <Row label="Yard Care" value={pnl.expensesByCategory.yard_care} indent negative />}
                {pnl.expensesByCategory.supplies > 0 && <Row label="Supplies" value={pnl.expensesByCategory.supplies} indent negative />}
                {pnl.expensesByCategory.maintenance > 0 && <Row label="Maintenance" value={pnl.expensesByCategory.maintenance} indent negative />}
                {pnl.expensesByCategory.other > 0 && <Row label="Other" value={pnl.expensesByCategory.other} indent negative />}
                {pnl.ownerTaxes > 0 && <Row label="Lodging Tax (Owner Remits)" value={pnl.ownerTaxes} indent negative />}
                <Row label="Total Operating Expenses" value={pnl.totalOperatingExpenses} bold separator negative />
              </>
            )}

            <Row label="Operating Income" value={pnl.operatingIncome} bold separator accent />

            {/* PITI */}
            {hasPITI && (
              <>
                <tr>
                  <td colSpan={2} className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide border-t border-slate-100">Debt Service</td>
                </tr>
                <Row label={`PITI (${monthCount} mo × ${fmt((settings?.monthlyPITI ?? 0))})`} value={pnl.piti} indent negative />
                <Row label="Total PITI" value={pnl.piti} bold separator negative />
              </>
            )}

            <Row label="Net Income" value={pnl.netIncome} bold separator accent />
          </tbody>
        </table>
      </div>
    );
  }

  function KPICards({ pnl }: { pnl: ReturnType<typeof sumMonths> }) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { l: 'Gross Revenue', v: fmt(pnl.grossRevenue) },
          { l: 'Net Revenue', v: fmt(pnl.netRevenue) },
          { l: 'Operating Income', v: fmt(pnl.operatingIncome), accent: true },
          { l: 'Net Income', v: fmt(pnl.netIncome), accent: true },
        ].map(c => (
          <div key={c.l} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">{c.l}</p>
            <p className={`text-xl font-bold mt-1 ${c.accent ? (parseFloat(c.v.replace(/[^0-9.-]/g, '')) >= 0 ? 'text-emerald-700' : 'text-red-600') : 'text-slate-900'}`}>{c.v}</p>
          </div>
        ))}
      </div>
    );
  }

  function exportCSV(pnl: ReturnType<typeof sumMonths>, label: string) {
    const rows = [
      [label + ' — P&L'],
      [],
      ['REVENUE'],
      ['Gross Revenue', pnl.grossRevenue.toFixed(2)],
      ['Platform Fees', (-pnl.platformFees).toFixed(2)],
      ['Guest Refunds', (-pnl.refunds).toFixed(2)],
      ['Net Revenue', pnl.netRevenue.toFixed(2)],
      [],
      ['OPERATING EXPENSES'],
      ['Cleaning', (-pnl.expensesByCategory.cleaning).toFixed(2)],
      ['Electric', (-pnl.expensesByCategory.electric).toFixed(2)],
      ['Water', (-pnl.expensesByCategory.water).toFixed(2)],
      ['Internet', (-pnl.expensesByCategory.internet).toFixed(2)],
      ['Yard Care', (-pnl.expensesByCategory.yard_care).toFixed(2)],
      ['Supplies', (-pnl.expensesByCategory.supplies).toFixed(2)],
      ['Maintenance', (-pnl.expensesByCategory.maintenance).toFixed(2)],
      ['Other', (-pnl.expensesByCategory.other).toFixed(2)],
      ['Total Operating Expenses', (-pnl.totalOperatingExpenses).toFixed(2)],
      [],
      ['Operating Income', pnl.operatingIncome.toFixed(2)],
      [],
      ['PITI', (-pnl.piti).toFixed(2)],
      ['Net Income', pnl.netIncome.toFixed(2)],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `pnl-${mode}-${fetchYear}.csv`;
    a.click();
  }

  const yearOptions = [...new Set([...years, currentYear, currentYear + 1, currentYear + 2])].sort((a, b) => b - a);

  const activePnL = activeMonthsSlice.length > 0 ? sumMonths(activeMonthsSlice) : null;

  const activeLabel = mode === 'month'
    ? `${MONTHS_LONG[selectedMonth - 1]} ${fetchYear}`
    : mode === 'ytd'
    ? `Jan – ${MONTHS_SHORT[currentMonthIdx]} ${currentYear} YTD`
    : mode === 'prior_year'
    ? `Full Year ${currentYear - 1}`
    : `Full Year ${selectedYear}`;

  const pitiMonths = mode === 'month' ? 1 : mode === 'ytd' ? currentMonthIdx + 1 : 12;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Income Statement</h1>
          <p className="text-slate-500 text-sm mt-1">{settings?.propertyName}</p>
        </div>
        <button
          onClick={() => activePnL && exportCSV(activePnL, activeLabel)}
          className="flex items-center gap-2 border border-slate-200 bg-white text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-50"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Net Income overview chart */}
      {statement && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-6">
          <h2 className="font-semibold text-slate-800 mb-1">Monthly Net Income — {fetchYear}</h2>
          <p className="text-xs text-slate-400 mb-4">Net income after all expenses and debt service</p>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={statement.months.map(m => ({
              name: MONTHS_SHORT[m.month - 1],
              netIncome: m.grossRevenue > 0 ? m.netIncome : null,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              <Bar dataKey="netIncome" name="Net Income" radius={[3, 3, 0, 0]}>
                {statement.months.map((m, i) => (
                  <Cell key={i} fill={m.netIncome >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Mode selector */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {([
            { key: 'month' as Mode, label: 'Month' },
            { key: 'ytd' as Mode, label: 'YTD' },
            { key: 'prior_year' as Mode, label: 'Prior Year' },
            { key: 'full_year' as Mode, label: 'Full Year' },
          ]).map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === m.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'month' && (
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(parseInt(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              {MONTHS_LONG.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
            </select>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              {yearOptions.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        )}

        {mode === 'full_year' && (
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          >
            {yearOptions.map(y => <option key={y}>{y}</option>)}
          </select>
        )}
      </div>

      <div className="mb-4">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{activeLabel}</span>
      </div>

      {activePnL && <KPICards pnl={activePnL} />}
      {activePnL && <PnLTable pnl={activePnL} label={activeLabel} months={pitiMonths} />}
    </div>
  );
}
