'use client';
import { useEffect, useState } from 'react';
import { AnnualStatement, Settings } from '@/types';
import StatCard from '@/components/StatCard';
import { TrendingUp, RefreshCw, AlertCircle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
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
  const [settings, setSettings] = useState<Settings | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const year = new Date().getFullYear();

  useEffect(() => {
    fetch('/api/income-statement?year=' + year)
      .then(r => r.json())
      .then(d => setStatement(d.statement));
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/ical', { method: 'POST' });
      const data = await res.json();
      if (data.errors?.length) {
        setSyncMsg(`Synced ${data.synced} bookings. Errors: ${data.errors.join(' | ')}`);
      } else {
        setSyncMsg(`Synced ${data.synced} bookings successfully`);
      }
      // Reload statement
      const r2 = await fetch('/api/income-statement?year=' + year);
      const d2 = await r2.json();
      setStatement(d2.statement);
    } catch {
      setSyncMsg('Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: settings?.currency ?? 'USD', maximumFractionDigits: 0 }).format(n);

  const chartData = statement?.months.map((m, i) => ({
    name: MONTHS[i],
    Airbnb: m.byPlatform.airbnb.income,
    'Booking.com': m.byPlatform.booking.income,
    VRBO: m.byPlatform.vrbo.income,
    Direct: m.byPlatform.direct.income,
    Other: m.byPlatform.other.income,
    total: m.totalIncome,
  })) ?? [];

  const hasData = statement && statement.totalIncome > 0;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {settings?.propertyName ?? 'Dashboard'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">{year} overview</p>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <span className="text-sm text-slate-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> {syncMsg}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync iCal'}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Income (YTD)"
          value={fmt(statement?.totalIncome ?? 0)}
          color="text-emerald-700"
        />
        <StatCard
          label="Total Nights Booked"
          value={(statement?.totalNights ?? 0).toString()}
          sub="nights"
        />
        <StatCard
          label="Avg Occupancy Rate"
          value={`${(statement?.avgOccupancyRate ?? 0).toFixed(1)}%`}
        />
        <StatCard
          label="Avg Nightly Rate"
          value={
            statement && statement.totalNights > 0
              ? fmt(statement.totalIncome / statement.totalNights)
              : '$0'
          }
          sub="per night"
        />
      </div>

      {/* Monthly chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-8">
        <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          Monthly Income by Platform
        </h2>
        {hasData ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Legend />
              {(['Airbnb', 'Booking.com', 'VRBO', 'Direct', 'Other'] as const).map(p => (
                <Bar
                  key={p}
                  dataKey={p}
                  stackId="a"
                  fill={PLATFORM_COLORS[p.toLowerCase().replace('.com', '')]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
            No booking data yet. Add iCal sources in Settings and sync.
          </div>
        )}
      </div>

      {/* Platform breakdown */}
      {hasData && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
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
              {Object.entries(statement.byPlatform)
                .filter(([, v]) => v.income > 0)
                .sort(([, a], [, b]) => b.income - a.income)
                .map(([platform, data]) => (
                  <tr key={platform} className="border-b border-slate-50">
                    <td className="py-2 capitalize font-medium">
                      {platform === 'booking' ? 'Booking.com' : platform}
                    </td>
                    <td className="py-2 text-right text-slate-600">{data.bookings}</td>
                    <td className="py-2 text-right text-slate-600">{data.nights}</td>
                    <td className="py-2 text-right font-semibold text-slate-800">{fmt(data.income)}</td>
                    <td className="py-2 text-right text-slate-500">
                      {((data.income / statement.totalIncome) * 100).toFixed(1)}%
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
