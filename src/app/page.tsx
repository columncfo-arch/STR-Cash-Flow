'use client';
import { useEffect, useState } from 'react';
import { AnnualStatement, MonthlyStatement, Settings, Platform } from '@/types';
import StatCard from '@/components/StatCard';
import { TrendingUp, X } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
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
  const gross = d._gross;
  const expenses = d._expenses;
  const netIncome = d['Net Income'];
  const forecast = d['Revenue Forecast'];
  const hasActual = gross != null && gross > 0;
  const hasForecast = forecast != null;
  if (!hasActual && !hasForecast) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm min-w-[175px]">
      <p className="font-semibold text-slate-800 mb-2">{label}</p>
      {hasActual && (
        <>
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">Revenue</span>
            <span className="font-medium">{fmt(gross!)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-slate-500">Expenses</span>
            <span className="font-medium text-red-600">({fmt(expenses!)})</span>
          </div>
          <div className="flex justify-between gap-6 border-t border-slate-100 mt-2 pt-2">
            <span className="font-medium text-slate-700">Net Income</span>
            <span className={`font-semibold ${(netIncome ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {fmt(netIncome ?? 0)}
            </span>
          </div>
        </>
      )}
      {hasForecast && (
        <div className={`flex justify-between gap-6 ${hasActual ? 'border-t border-slate-100 mt-2 pt-2' : ''}`}>
          <span className="text-slate-500">Rev. Forecast</span>
          <span className="font-medium text-slate-600">{fmt(forecast!)}</span>
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

function MonthPnL({ m, fmt }: { m: MonthlyStatement; fmt: (n: number) => string }) {
  const rows: { label: string; value: number; indent?: boolean; negative?: boolean; bold?: boolean; separator?: boolean; accent?: boolean }[] = [
    { label: 'Gross Revenue', value: m.grossRevenue },
    ...(m.platformFees > 0 ? [{ label: 'Platform Fees', value: m.platformFees, indent: true, negative: true }] : []),
    ...(m.taxRemitted > 0 ? [{ label: 'Tax Remitted by Platform', value: m.taxRemitted, indent: true, negative: true }] : []),
    ...(m.refunds > 0 ? [{ label: 'Guest Refunds', value: m.refunds, indent: true, negative: true }] : []),
    { label: 'Net Revenue', value: m.netRevenue, bold: true, separator: true },
    ...(m.totalOperatingExpenses > 0 ? [
      { label: 'Operating Expenses', value: m.totalOperatingExpenses, negative: true, indent: true },
    ] : []),
    { label: 'Operating Income', value: m.operatingIncome, bold: true, separator: true, accent: true },
    ...(m.piti > 0 ? [{ label: 'PITI', value: m.piti, negative: true, indent: true }] : []),
    { label: 'Net Income', value: m.netIncome, bold: true, separator: true, accent: true },
  ];

  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={`${r.separator ? 'border-t-2 border-slate-200' : 'border-t border-slate-50'} ${r.bold ? 'font-semibold' : ''}`}>
            <td className={`px-0 py-2 text-slate-700 ${r.indent ? 'pl-6 text-slate-500 text-xs' : ''}`}>{r.label}</td>
            <td className={`px-0 py-2 text-right text-sm ${
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

export default function Dashboard() {
  const [statement, setStatement] = useState<AnnualStatement | null>(null);
  const [prevStatement, setPrevStatement] = useState<AnnualStatement | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // 0-indexed
  const now = new Date();
  const year = now.getFullYear();
  const currentMonthIdx = now.getMonth();

  useEffect(() => {
    fetch('/api/income-statement?year=' + year).then(r => r.json()).then(d => setStatement(d.statement));
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

  // Selected month data
  const selMonth: MonthlyStatement | null = (selectedMonth !== null && statement) ? statement.months[selectedMonth] : null;
  const selAdr = selMonth && selMonth.totalNights > 0 ? selMonth.grossRevenue / selMonth.totalNights : null;

  const growthPct = settings?.forecastGrowthByYear?.[String(year)] ?? settings?.forecastGrowthPct ?? 0;
  const growthFactor = growthPct / 100;

  const chartData = statement?.months.map((m, i) => {
    const isActual = i <= currentMonthIdx;
    let forecastRevenue: number | null = null;
    if (i > currentMonthIdx && prevStatement) {
      const prev = prevStatement.months[i];
      forecastRevenue = prev.grossRevenue > 0 ? Math.round(prev.grossRevenue * (1 + growthFactor)) : null;
    }
    return {
      name: MONTHS[i],
      Airbnb: m.byPlatform.airbnb.income,
      'Booking.com': m.byPlatform.booking.income,
      VRBO: m.byPlatform.vrbo.income,
      'Net Income': isActual ? m.netIncome : null,
      'Revenue Forecast': forecastRevenue,
      _gross: isActual ? m.grossRevenue : null,
      _expenses: isActual ? m.grossRevenue - m.netIncome : null,
      _idx: i,
    };
  }) ?? [];

  const hasData = ytdGross > 0;
  const prevHasData = prevStatement?.months.some(m => m.grossRevenue > 0) ?? false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleChartClick(data: any) {
    const idx: number | null | undefined = data?.activeTooltipIndex;
    if (idx != null) setSelectedMonth(prev => prev === idx ? null : idx);
  }

  // KPI values depend on whether a month is selected
  const kpiGross = selMonth ? selMonth.grossRevenue : ytdGross;
  const kpiNetIncome = selMonth ? selMonth.netIncome : ytdNetIncome;
  const kpiNights = selMonth ? selMonth.totalNights : ytdNights;
  const kpiOccupancy = selMonth ? selMonth.occupancyRate : ytdOccupancy;
  const kpiAdr = selMonth ? selAdr : ytdAdr;
  const kpiSuffix = selMonth ? '' : ' YTD';

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{settings?.propertyName ?? 'Dashboard'}</h1>
        <p className="text-slate-500 text-sm mt-1">{year} overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label={`Gross Revenue${kpiSuffix}`} value={fmt(kpiGross)} color="text-emerald-700" />
        <StatCard label={`Net Income${kpiSuffix}`} value={fmt(kpiNetIncome)} color={kpiNetIncome >= 0 ? 'text-emerald-700' : 'text-red-600'} />
        <StatCard label="Nights Booked" value={kpiNights.toString()} sub={`nights${kpiSuffix}`} />
        <StatCard label="Avg Occupancy" value={`${kpiOccupancy.toFixed(1)}%`} sub={kpiSuffix.trim() || 'this month'} />
        <StatCard label="ADR" value={kpiAdr != null ? fmt(kpiAdr) : '—'} sub={`per night${kpiSuffix}`} color="text-emerald-700" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-8">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          Monthly Revenue by Platform &amp; Net Income
        </h2>
        <p className="text-xs text-slate-400 mb-4">Click a month to drill into its P&amp;L</p>
        {hasData ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={chartData}
                onClick={handleChartClick}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={(props) => (
                  <ChartTooltip
                    active={props.active}
                    payload={props.payload as unknown as TooltipEntry[]}
                    label={String(props.label ?? '')}
                    fmt={fmt}
                  />
                )} />
                <Legend />
                <ReferenceLine yAxisId="right" y={0} stroke="#e2e8f0" />
                {(['Airbnb', 'Booking.com', 'VRBO'] as const).map(p => (
                  <Bar
                    key={p}
                    yAxisId="left"
                    dataKey={p}
                    stackId="a"
                    fill={PLATFORM_COLORS[p.toLowerCase().replace('.com', '')]}
                    opacity={selectedMonth !== null ? 0.5 : 1}
                  />
                ))}
                <Line
                  yAxisId="right" type="monotone" dataKey="Net Income" stroke="#f97316"
                  strokeWidth={3} dot={{ r: 4, fill: '#f97316', strokeWidth: 0 }} connectNulls
                />
                <Line
                  yAxisId="left" type="monotone" dataKey="Revenue Forecast" stroke="#475569"
                  strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: '#475569', strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            {!prevHasData && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                No prior-year data found — forecast line is hidden. Go to{' '}
                <a href="/settings" className="underline font-medium">Settings</a>
                {' '}→ Import 2025 Baseline Data to enable the forecast.
              </p>
            )}
          </>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
            No data yet. Import your earnings CSV to get started.
          </div>
        )}
      </div>

      {/* ── Selected month detail ── */}
      {selMonth && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">
                {MONTHS_LONG[selectedMonth!]} {year} — P&amp;L
              </h2>
              <button
                onClick={() => setSelectedMonth(null)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-2 py-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            </div>
            <MonthPnL m={selMonth} fmt={fmt} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">Platform Breakdown — {MONTHS[selectedMonth!]}</h2>
            <PlatformTable byPlatform={selMonth.byPlatform} totalRevenue={selMonth.grossRevenue} fmt={fmt} />
            {selMonth.bookings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">Bookings ({selMonth.bookings.length})</p>
                <div className="space-y-1">
                  {selMonth.bookings.map(b => (
                    <div key={b.id} className="flex justify-between text-xs text-slate-600">
                      <span>{b.guestName ?? b.confirmationCode ?? 'Guest'} · {b.nights}n</span>
                      <span className="font-medium">{fmt(b.income)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── YTD platform breakdown (shown when no month selected) ── */}
      {hasData && !selMonth && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-4">Platform Breakdown (YTD)</h2>
          <PlatformTable byPlatform={statement!.byPlatform} totalRevenue={statement!.grossRevenue} fmt={fmt} />
        </div>
      )}
    </div>
  );
}
