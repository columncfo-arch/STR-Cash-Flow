'use client';
import { useEffect, useState } from 'react';
import { AnnualStatement, MonthlyStatement, Platform, Settings } from '@/types';
import { format, getMonth, getYear, isAfter, parseISO } from 'date-fns';
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

type View = 'mtd' | 'monthly' | 'ytd';

function emptyBreakdown() {
  return Object.fromEntries(
    PLATFORMS.map(p => [p, { income: 0, nights: 0, bookings: 0 }])
  ) as Record<Platform, { income: number; nights: number; bookings: number }>;
}

function sumMonths(months: MonthlyStatement[]) {
  const byPlatform = emptyBreakdown();
  let totalIncome = 0;
  let totalNights = 0;
  let totalOccupancy = 0;
  for (const m of months) {
    totalIncome += m.totalIncome;
    totalNights += m.totalNights;
    totalOccupancy += m.occupancyRate;
    for (const p of PLATFORMS) {
      byPlatform[p].income += m.byPlatform[p].income;
      byPlatform[p].nights += m.byPlatform[p].nights;
      byPlatform[p].bookings += m.byPlatform[p].bookings;
    }
  }
  return { totalIncome, totalNights, avgOccupancy: months.length ? totalOccupancy / months.length : 0, byPlatform };
}

export default function IncomeStatementPage() {
  const [statement, setStatement] = useState<AnnualStatement | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [view, setView] = useState<View>('ytd');
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());

  const today = new Date();
  const currentMonthIdx = getMonth(today); // 0-based
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

  // ── Derived data per view ──────────────────────────────────────────────────

  // MTD: current month only
  const mtdMonth = statement?.months[currentMonthIdx];
  const mtdStats = mtdMonth ? sumMonths([mtdMonth]) : null;

  // YTD: Jan → current month (for selected year; if past year, all 12)
  const ytdSlice = statement
    ? selectedYear < currentYear
      ? statement.months
      : statement.months.slice(0, currentMonthIdx + 1)
    : [];
  const ytdStats = sumMonths(ytdSlice);

  // Monthly: all 12 months
  const annualStats = statement ? sumMonths(statement.months) : null;

  function exportCSV() {
    if (!statement) return;
    const rows: (string | number)[][] = [
      ['Month','Bookings','Nights','Occupancy %','Income','Avg Nightly Rate'],
    ];
    const src = view === 'monthly' ? statement.months
      : view === 'ytd' ? ytdSlice
      : mtdMonth ? [mtdMonth] : [];

    for (const m of src) {
      rows.push([
        MONTHS_LONG[m.month - 1],
        m.bookings.length,
        m.totalNights,
        m.occupancyRate.toFixed(1) + '%',
        m.totalIncome.toFixed(2),
        m.totalNights > 0 ? (m.totalIncome / m.totalNights).toFixed(2) : '0.00',
      ]);
    }
    const sumSrc = view === 'monthly' ? annualStats : view === 'ytd' ? ytdStats : mtdStats;
    if (sumSrc) {
      rows.push([
        view === 'mtd' ? 'MTD Total' : view === 'ytd' ? 'YTD Total' : 'Annual Total',
        src.reduce((s, m) => s + m.bookings.length, 0),
        sumSrc.totalNights,
        sumSrc.avgOccupancy.toFixed(1) + '%',
        sumSrc.totalIncome.toFixed(2),
        sumSrc.totalNights > 0 ? (sumSrc.totalIncome / sumSrc.totalNights).toFixed(2) : '0.00',
      ]);
    }

    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `income-${view}-${selectedYear}.csv`;
    a.click();
  }

  const TAB: { key: View; label: string }[] = [
    { key: 'mtd', label: 'MTD' },
    { key: 'ytd', label: 'YTD' },
    { key: 'monthly', label: 'Monthly' },
  ];

  // ── Summary cards for current view ────────────────────────────────────────

  function SummaryCards({ income, nights, occupancy, label }: { income: number; nights: number; occupancy: number; label: string }) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { l: `${label} Revenue`, v: fmt(income), accent: true },
          { l: 'Nights Booked', v: nights.toString(), sub: 'nights' },
          { l: 'Avg Occupancy', v: `${occupancy.toFixed(1)}%` },
          { l: 'Avg Nightly Rate', v: nights > 0 ? fmt(income / nights) : '$0', sub: 'per night' },
        ].map(c => (
          <div key={c.l} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">{c.l}</p>
            <p className={`text-xl font-bold mt-1 ${c.accent ? 'text-emerald-700' : 'text-slate-900'}`}>{c.v}</p>
            {c.sub && <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>
    );
  }

  function PlatformTable({ byPlatform, total }: { byPlatform: Record<Platform, { income: number; nights: number; bookings: number }>; total: number }) {
    const rows = Object.entries(byPlatform).filter(([, v]) => v.income > 0).sort(([, a], [, b]) => b.income - a.income);
    if (!rows.length) return null;
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mt-6">
        <h2 className="font-semibold text-slate-800 mb-4">Platform Breakdown</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="pb-2 font-medium">Platform</th>
              <th className="pb-2 font-medium text-right">Bookings</th>
              <th className="pb-2 font-medium text-right">Nights</th>
              <th className="pb-2 font-medium text-right">Income</th>
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

  function MonthTable({ months }: { months: MonthlyStatement[] }) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
              <th className="px-4 py-3 font-medium w-8" />
              <th className="px-4 py-3 font-medium">Month</th>
              <th className="px-4 py-3 font-medium text-right">Bookings</th>
              <th className="px-4 py-3 font-medium text-right">Nights</th>
              <th className="px-4 py-3 font-medium text-right">Occupancy</th>
              <th className="px-4 py-3 font-medium text-right">Avg/Night</th>
              <th className="px-4 py-3 font-medium text-right">Revenue</th>
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
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5">
                          <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(m.occupancyRate, 100)}%` }} />
                        </div>
                        <span className="text-slate-600 w-10 text-right">{m.occupancyRate.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {m.totalNights > 0 ? fmt(m.totalIncome / m.totalNights) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${m.totalIncome > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>
                      {m.totalIncome > 0 ? fmt(m.totalIncome) : '—'}
                    </td>
                  </tr>
                  {expandedMonths.has(i) && m.bookings.map(b => (
                    <tr key={b.id} className="bg-slate-50 border-b border-slate-100 text-xs">
                      <td />
                      <td className="px-4 py-2 pl-8 text-slate-500">{b.guestName ?? b.confirmationCode ?? 'Guest'}</td>
                      <td className="px-4 py-2 text-right text-slate-400">1</td>
                      <td className="px-4 py-2 text-right text-slate-400">{b.nights}</td>
                      <td className="px-4 py-2 text-right text-slate-400">
                        {format(new Date(b.checkIn), 'MMM d')} – {format(new Date(b.checkOut), 'MMM d')}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-400">{b.nights > 0 && b.income > 0 ? fmt(b.income / b.nights) : '—'}</td>
                      <td className="px-4 py-2 text-right text-emerald-600 font-medium">{fmt(b.income)}</td>
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
                  <td className="px-4 py-4 text-right text-slate-700">{s.avgOccupancy.toFixed(1)}%</td>
                  <td className="px-4 py-4 text-right text-slate-700">{s.totalNights > 0 ? fmt(s.totalIncome / s.totalNights) : '—'}</td>
                  <td className="px-4 py-4 text-right text-emerald-700 text-base">{fmt(s.totalIncome)}</td>
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>
    );
  }

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
            onClick={exportCSV}
            className="flex items-center gap-2 border border-slate-200 bg-white text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-8">
        {TAB.map(t => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              view === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── MTD ─────────────────────────────────────────────────────────────── */}
      {view === 'mtd' && mtdMonth && mtdStats && (
        <>
          <div className="mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              {MONTHS_LONG[currentMonthIdx]} {selectedYear} · Month to Date
            </span>
          </div>
          <SummaryCards
            income={mtdStats.totalIncome}
            nights={mtdStats.totalNights}
            occupancy={mtdMonth.occupancyRate}
            label="MTD"
          />
          {/* Bookings this month */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Guest</th>
                  <th className="px-4 py-3 font-medium">Check-in</th>
                  <th className="px-4 py-3 font-medium">Check-out</th>
                  <th className="px-4 py-3 font-medium text-right">Nights</th>
                  <th className="px-4 py-3 font-medium text-right">Income</th>
                </tr>
              </thead>
              <tbody>
                {mtdMonth.bookings.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400">No bookings this month yet.</td></tr>
                ) : mtdMonth.bookings.map(b => (
                  <tr key={b.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 capitalize text-slate-700">{b.platform === 'booking' ? 'Booking.com' : b.platform}</td>
                    <td className="px-4 py-3 text-slate-700">{b.guestName ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{format(new Date(b.checkIn), 'MMM d')}</td>
                    <td className="px-4 py-3 text-slate-600">{format(new Date(b.checkOut), 'MMM d')}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{b.nights}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmt(b.income)}</td>
                  </tr>
                ))}
              </tbody>
              {mtdMonth.bookings.length > 0 && (
                <tfoot>
                  <tr className="bg-emerald-50 border-t-2 border-emerald-200 font-bold text-sm">
                    <td colSpan={5} className="px-4 py-3 text-slate-800">MTD Total</td>
                    <td className="px-4 py-3 text-right text-emerald-700 text-base">{fmt(mtdStats.totalIncome)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <PlatformTable byPlatform={mtdStats.byPlatform} total={mtdStats.totalIncome} />
        </>
      )}

      {/* ── YTD ─────────────────────────────────────────────────────────────── */}
      {view === 'ytd' && (
        <>
          <div className="mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Jan – {MONTHS_SHORT[Math.min(currentMonthIdx, ytdSlice.length - 1)]} {selectedYear} · Year to Date
            </span>
          </div>
          <SummaryCards
            income={ytdStats.totalIncome}
            nights={ytdStats.totalNights}
            occupancy={ytdStats.avgOccupancy}
            label="YTD"
          />
          {/* YTD bar chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-2">
            <h2 className="font-semibold text-slate-800 mb-4">Monthly Revenue (YTD)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ytdSlice.map(m => ({
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
          <MonthTable months={ytdSlice} />
          <PlatformTable byPlatform={ytdStats.byPlatform} total={ytdStats.totalIncome} />
        </>
      )}

      {/* ── Monthly ──────────────────────────────────────────────────────────── */}
      {view === 'monthly' && annualStats && (
        <>
          <div className="mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Full Year {selectedYear}
            </span>
          </div>
          <SummaryCards
            income={annualStats.totalIncome}
            nights={annualStats.totalNights}
            occupancy={annualStats.avgOccupancy}
            label="Annual"
          />
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-2">
            <h2 className="font-semibold text-slate-800 mb-4">Revenue by Month</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={statement?.months.map(m => ({
                name: MONTHS_SHORT[m.month - 1],
                income: m.totalIncome,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(Number(v))} />
                <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Income" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <MonthTable months={statement?.months ?? []} />
          <PlatformTable byPlatform={annualStats.byPlatform} total={annualStats.totalIncome} />
        </>
      )}
    </div>
  );
}
