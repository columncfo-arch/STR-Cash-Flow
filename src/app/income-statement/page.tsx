'use client';
import { useEffect, useState } from 'react';
import { AnnualStatement, MonthlyStatement, Platform, PnLSummary, Settings } from '@/types';
import { format, getMonth, getYear } from 'date-fns';
import { Download, ChevronDown, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from 'recharts';

const MONTHS_LONG = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PLATFORM_COLORS: Record<string, string> = {
  airbnb: '#f43f5e',
  booking: '#3b82f6',
  vrbo: '#6366f1',
  direct: '#10b981',
  other: '#94a3b8',
};
const PLATFORMS = ['airbnb','booking','vrbo','direct','other'] as Platform[];

type View = 'mtd' | 'ytd' | 'monthly';

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

  const expensesByCategory = { utilities: 0, cleaning: 0, supplies: 0, maintenance: 0, refund: 0, other: 0 };

  for (const m of months) {
    totalNights += m.totalNights;
    totalOccupancy += m.occupancyRate;
    grossRevenue += m.grossRevenue;
    platformFees += m.platformFees;
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

  const netRevenue = grossRevenue - platformFees - refunds;
  const operatingIncome = netRevenue - totalOperatingExpenses;
  const netIncome = operatingIncome - piti;

  return {
    grossRevenue, platformFees, refunds, netRevenue,
    expensesByCategory, totalOperatingExpenses,
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
  const [view, setView] = useState<View>('ytd');
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());

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

  useEffect(() => {
    fetch(`/api/income-statement?year=${selectedYear}`)
      .then(r => r.json())
      .then(d => {
        setStatement(d.statement);
        const available = d.years as number[];
        if (!available.includes(selectedYear)) available.push(selectedYear);
        setYears(available.sort((a, b) => b - a));
      });
  }, [selectedYear]);

  function toggleMonth(m: number) {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  }

  const mtdMonth = statement?.months[currentMonthIdx];
  const mtdStats = mtdMonth ? sumMonths([mtdMonth]) : null;

  const ytdSlice = statement
    ? selectedYear < currentYear
      ? statement.months
      : statement.months.slice(0, currentMonthIdx + 1)
    : [];
  const ytdStats = sumMonths(ytdSlice);

  const annualStats = statement ? sumMonths(statement.months) : null;

  function PnLTable({ pnl, label, months: monthCount }: { pnl: ReturnType<typeof sumMonths>; label: string; months: number }) {
    const hasData = pnl.grossRevenue > 0 || pnl.totalOperatingExpenses > 0 || pnl.piti > 0;
    const hasFees = pnl.platformFees > 0;
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
            {hasFees && <Row label="Platform Fees" value={pnl.platformFees} indent negative />}
            {hasRefunds && <Row label="Guest Refunds" value={pnl.refunds} indent negative />}
            <Row label="Net Revenue" value={pnl.netRevenue} bold separator accent />

            {/* Operating expenses */}
            {hasExpenses && (
              <>
                <tr>
                  <td colSpan={2} className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide border-t border-slate-100">Operating Expenses</td>
                </tr>
                {pnl.expensesByCategory.cleaning > 0 && <Row label="Cleaning" value={pnl.expensesByCategory.cleaning} indent negative />}
                {pnl.expensesByCategory.utilities > 0 && <Row label="Utilities" value={pnl.expensesByCategory.utilities} indent negative />}
                {pnl.expensesByCategory.supplies > 0 && <Row label="Supplies" value={pnl.expensesByCategory.supplies} indent negative />}
                {pnl.expensesByCategory.maintenance > 0 && <Row label="Maintenance" value={pnl.expensesByCategory.maintenance} indent negative />}
                {pnl.expensesByCategory.other > 0 && <Row label="Other" value={pnl.expensesByCategory.other} indent negative />}
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

  function MonthTable({ months }: { months: MonthlyStatement[] }) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
              <th className="px-4 py-3 font-medium w-8" />
              <th className="px-4 py-3 font-medium">Month</th>
              <th className="px-4 py-3 font-medium text-right">Bookings</th>
              <th className="px-4 py-3 font-medium text-right">Nights</th>
              <th className="px-4 py-3 font-medium text-right">Occ.</th>
              <th className="px-4 py-3 font-medium text-right">Gross Rev.</th>
              <th className="px-4 py-3 font-medium text-right">Net Rev.</th>
              <th className="px-4 py-3 font-medium text-right">Op. Income</th>
              <th className="px-4 py-3 font-medium text-right">Net Income</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const i = m.month - 1;
              return (
                <>
                  <tr
                    key={i}
                    className={`border-b border-slate-50 ${m.bookings.length > 0 ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                    onClick={() => m.bookings.length > 0 && toggleMonth(i)}
                  >
                    <td className="px-4 py-3">
                      {m.bookings.length > 0 && (expandedMonths.has(i)
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{MONTHS_LONG[i]}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{m.bookings.length}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{m.totalNights}</td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">{m.occupancyRate.toFixed(0)}%</td>
                    <td className="px-4 py-3 text-right text-slate-600">{m.grossRevenue > 0 ? fmt(m.grossRevenue) : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{m.netRevenue > 0 ? fmt(m.netRevenue) : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{m.grossRevenue > 0 ? fmt(m.operatingIncome) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${m.grossRevenue > 0 ? (m.netIncome >= 0 ? 'text-emerald-700' : 'text-red-600') : 'text-slate-300'}`}>
                      {m.grossRevenue > 0 ? fmt(m.netIncome) : '—'}
                    </td>
                  </tr>
                  {expandedMonths.has(i) && m.bookings.map(b => (
                    <tr key={b.id} className="bg-slate-50 border-b border-slate-100 text-xs">
                      <td />
                      <td className="px-4 py-2 pl-8 text-slate-500">{b.guestName ?? b.confirmationCode ?? 'Guest'}</td>
                      <td className="px-4 py-2 text-right text-slate-400">1</td>
                      <td className="px-4 py-2 text-right text-slate-400">{b.nights}</td>
                      <td className="px-4 py-2 text-right text-slate-400">{format(new Date(b.checkIn), 'MMM d')} – {format(new Date(b.checkOut), 'MMM d')}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{b.income > 0 ? fmt(b.income) : '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{b.income > 0 ? fmt(b.income - (b.platformFee ?? 0)) : '—'}</td>
                      <td colSpan={2} />
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
          {months.length > 1 && (() => {
            const s = sumMonths(months);
            return (
              <tfoot>
                <tr className="bg-emerald-50 border-t-2 border-emerald-200 font-bold text-sm">
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4 text-slate-800">Total</td>
                  <td className="px-4 py-4 text-right text-slate-700">{months.reduce((n, m) => n + m.bookings.length, 0)}</td>
                  <td className="px-4 py-4 text-right text-slate-700">{s.totalNights}</td>
                  <td className="px-4 py-4 text-right text-slate-500">{s.avgOccupancy.toFixed(0)}%</td>
                  <td className="px-4 py-4 text-right text-slate-700">{fmt(s.grossRevenue)}</td>
                  <td className="px-4 py-4 text-right text-slate-700">{fmt(s.netRevenue)}</td>
                  <td className="px-4 py-4 text-right text-slate-700">{fmt(s.operatingIncome)}</td>
                  <td className={`px-4 py-4 text-right text-base ${s.netIncome >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(s.netIncome)}</td>
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>
    );
  }

  function PlatformTable({ byPlatform, total }: { byPlatform: Record<Platform, { income: number; nights: number; bookings: number }>; total: number }) {
    const rows = Object.entries(byPlatform).filter(([, v]) => v.income > 0).sort(([, a], [, b]) => b.income - a.income);
    if (!rows.length) return null;
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mt-4">
        <h2 className="font-semibold text-slate-800 mb-4">Platform Breakdown</h2>
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
                <td className="py-2 text-right text-slate-500">{total > 0 ? ((data.income / total) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      ['Utilities', (-pnl.expensesByCategory.utilities).toFixed(2)],
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
    a.download = `pnl-${view}-${selectedYear}.csv`;
    a.click();
  }

  const TAB: { key: View; label: string }[] = [
    { key: 'mtd', label: 'MTD' },
    { key: 'ytd', label: 'YTD' },
    { key: 'monthly', label: 'Monthly' },
  ];

  const activePnL = view === 'mtd' ? mtdStats : view === 'ytd' ? ytdStats : annualStats;
  const activeMonths = view === 'mtd' ? (mtdMonth ? [mtdMonth] : []) : view === 'ytd' ? ytdSlice : (statement?.months ?? []);
  const activeLabel = view === 'mtd'
    ? `${MONTHS_LONG[currentMonthIdx]} ${selectedYear} MTD`
    : view === 'ytd'
    ? `Jan – ${MONTHS_SHORT[Math.min(currentMonthIdx, ytdSlice.length - 1)]} ${selectedYear} YTD`
    : `Full Year ${selectedYear}`;

  const pitiMonths = view === 'mtd' ? 1 : view === 'ytd' ? ytdSlice.length : 12;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Income Statement</h1>
          <p className="text-slate-500 text-sm mt-1">{settings?.propertyName} — {selectedYear}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          >
            {(years.length ? years : [selectedYear]).map(y => <option key={y}>{y}</option>)}
          </select>
          <button
            onClick={() => activePnL && exportCSV(activePnL, activeLabel)}
            className="flex items-center gap-2 border border-slate-200 bg-white text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-50"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-6">
        {TAB.map(t => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              view === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-2">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{activeLabel}</span>
      </div>

      {activePnL && <KPICards pnl={activePnL} />}
      {activePnL && <PnLTable pnl={activePnL} label={activeLabel} months={pitiMonths} />}

      {/* Chart */}
      {activeMonths.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mt-4">
          <h2 className="font-semibold text-slate-800 mb-4">Monthly Revenue</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={activeMonths.map(m => ({
              name: MONTHS_SHORT[m.month - 1],
              Airbnb: m.byPlatform.airbnb.income,
              'Booking.com': m.byPlatform.booking.income,
              VRBO: m.byPlatform.vrbo.income,
              Direct: m.byPlatform.direct.income,
              Other: m.byPlatform.other.income,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Legend />
              {(['Airbnb','Booking.com','VRBO','Direct','Other'] as const).map(p => (
                <Bar key={p} dataKey={p} stackId="a" fill={PLATFORM_COLORS[p.toLowerCase().replace('.com','')]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === 'monthly' && statement && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mt-4">
          <h2 className="font-semibold text-slate-800 mb-4">Net Income by Month</h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={statement.months.map(m => ({
              name: MONTHS_SHORT[m.month - 1],
              'Net Income': m.netIncome,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(Number(v)/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(Number(v))} />
              <Line type="monotone" dataKey="Net Income" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <MonthTable months={activeMonths} />
      {activePnL && <PlatformTable byPlatform={activePnL.byPlatform} total={activePnL.grossRevenue} />}
    </div>
  );
}
