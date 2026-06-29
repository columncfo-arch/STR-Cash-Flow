'use client';
import { useEffect, useState } from 'react';
import { AnnualStatement, Settings } from '@/types';
import StatCard from '@/components/StatCard';
import { TrendingUp } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PLATFORM_COLORS: Record<string, string> = {
  airbnb: '#f43f5e',
  booking: '#3b82f6',
  vrbo: '#6366f1',
  direct: '#10b981',
  other: '#94a3b8',
};

export default function Dashboard() {
  const [statement, setStatement] = useState<AnnualStatement | null>(null);
  const [prevStatement, setPrevStatement] = useState<AnnualStatement | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const now = new Date();
  const year = now.getFullYear();
  // 0-indexed month (0=Jan), slice months up to and including current month
  const currentMonthIdx = now.getMonth();

  useEffect(() => {
    fetch('/api/income-statement?year=' + year).then(r => r.json()).then(d => setStatement(d.statement));
    fetch('/api/income-statement?year=' + (year - 1)).then(r => r.json()).then(d => setPrevStatement(d.statement));
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, []);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: settings?.currency ?? 'USD', maximumFractionDigits: 0 }).format(n);

  // YTD = only months that have passed or are current, so stats stay consistent
  const ytdMonths = statement?.months.slice(0, currentMonthIdx + 1) ?? [];
  const ytdGross = ytdMonths.reduce((s, m) => s + m.grossRevenue, 0);
  const ytdNetIncome = ytdMonths.reduce((s, m) => s + m.netIncome, 0);
  const ytdNights = ytdMonths.reduce((s, m) => s + m.totalNights, 0);
  const ytdOccupancy = ytdMonths.length > 0
    ? ytdMonths.reduce((s, m) => s + m.occupancyRate, 0) / ytdMonths.length
    : 0;
  const adr = ytdNights > 0 ? ytdGross / ytdNights : null;

  const growthFactor = (settings?.forecastGrowthPct ?? 0) / 100;

  const chartData = statement?.months.map((m, i) => {
    const actualNetIncome: number | null = i <= currentMonthIdx ? m.netIncome : null;
    let forecast: number | null = null;
    if (i >= currentMonthIdx && prevStatement) {
      const prev = prevStatement.months[i];
      // At current month: connect to actual; beyond: project using prev year net income + growth on prev revenue
      forecast = i === currentMonthIdx
        ? m.netIncome
        : prev.netIncome + prev.grossRevenue * growthFactor;
    }
    return {
      name: MONTHS[i],
      Airbnb: m.byPlatform.airbnb.income,
      'Booking.com': m.byPlatform.booking.income,
      VRBO: m.byPlatform.vrbo.income,
      Direct: m.byPlatform.direct.income,
      Other: m.byPlatform.other.income,
      'Net Income': actualNetIncome,
      Forecast: forecast,
    };
  }) ?? [];

  const hasData = ytdGross > 0;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{settings?.propertyName ?? 'Dashboard'}</h1>
        <p className="text-slate-500 text-sm mt-1">{year} overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Gross Revenue (YTD)" value={fmt(ytdGross)} color="text-emerald-700" />
        <StatCard label="Net Income (YTD)" value={fmt(ytdNetIncome)} color={ytdNetIncome >= 0 ? 'text-emerald-700' : 'text-red-600'} />
        <StatCard label="Total Nights Booked" value={ytdNights.toString()} sub="nights YTD" />
        <StatCard label="Avg Occupancy" value={`${ytdOccupancy.toFixed(1)}%`} sub="YTD" />
        <StatCard label="ADR" value={adr != null ? fmt(adr) : '—'} sub="per night YTD" color="text-emerald-700" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-8">
        <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          Monthly Revenue by Platform &amp; Net Income
        </h2>
        {hasData ? (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v, name) => [fmt(Number(v)), name]} />
              <Legend />
              <ReferenceLine yAxisId="right" y={0} stroke="#e2e8f0" />
              {(['Airbnb', 'Booking.com', 'VRBO', 'Direct', 'Other'] as const).map(p => (
                <Bar key={p} yAxisId="left" dataKey={p} stackId="a" fill={PLATFORM_COLORS[p.toLowerCase().replace('.com', '')]} />
              ))}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="Net Income"
                stroke="#f97316"
                strokeWidth={3}
                dot={{ r: 4, fill: '#f97316', strokeWidth: 0 }}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="Forecast"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
            No data yet. Import your earnings CSV to get started.
          </div>
        )}
      </div>

      {hasData && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
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
              {Object.entries(statement!.byPlatform)
                .filter(([, v]) => v.income > 0)
                .sort(([, a], [, b]) => b.income - a.income)
                .map(([platform, data]) => (
                  <tr key={platform} className="border-b border-slate-50">
                    <td className="py-2 capitalize font-medium">{platform === 'booking' ? 'Booking.com' : platform}</td>
                    <td className="py-2 text-right text-slate-600">{data.bookings}</td>
                    <td className="py-2 text-right text-slate-600">{data.nights}</td>
                    <td className="py-2 text-right font-semibold text-slate-800">{fmt(data.income)}</td>
                    <td className="py-2 text-right text-slate-500">
                      {((data.income / statement!.grossRevenue) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
