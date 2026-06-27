'use client';
import { useEffect, useState } from 'react';
import { AnnualStatement, Settings } from '@/types';
import { format } from 'date-fns';
import { Download, ChevronDown, ChevronRight } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function IncomeStatementPage() {
  const [statement, setStatement] = useState<AnnualStatement | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());

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

  function exportCSV() {
    if (!statement) return;
    const rows = [
      ['Month', 'Bookings', 'Nights', 'Occupancy %', 'Income', 'Avg Nightly Rate'],
      ...statement.months.map((m, i) => [
        MONTHS[i],
        m.bookings.length,
        m.totalNights,
        m.occupancyRate.toFixed(1) + '%',
        m.totalIncome.toFixed(2),
        m.totalNights > 0 ? (m.totalIncome / m.totalNights).toFixed(2) : '0.00',
      ]),
      ['TOTAL', statement.months.reduce((s, m) => s + m.bookings.length, 0),
        statement.totalNights, statement.avgOccupancyRate.toFixed(1) + '%',
        statement.totalIncome.toFixed(2),
        statement.totalNights > 0 ? (statement.totalIncome / statement.totalNights).toFixed(2) : '0.00'],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `income-statement-${selectedYear}.csv`;
    a.click();
  }

  const chartData = statement?.months.map((m, i) => ({
    name: MONTHS_SHORT[i],
    income: m.totalIncome,
    occupancy: m.occupancyRate,
  })) ?? [];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Income Statement</h1>
          <p className="text-slate-500 text-sm mt-1">
            {settings?.propertyName} — {selectedYear}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          >
            {years.length === 0 ? (
              <option>{selectedYear}</option>
            ) : (
              years.map(y => <option key={y}>{y}</option>)
            )}
          </select>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 border border-slate-200 bg-white text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary row */}
      {statement && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Annual Revenue', value: fmt(statement.totalIncome), accent: true },
            { label: 'Total Nights', value: statement.totalNights.toString() },
            { label: 'Avg Occupancy', value: `${statement.avgOccupancyRate.toFixed(1)}%` },
            {
              label: 'Avg Nightly Rate',
              value: statement.totalNights > 0
                ? fmt(statement.totalIncome / statement.totalNights)
                : '$0',
            },
          ].map(c => (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className={`text-xl font-bold mt-1 ${c.accent ? 'text-emerald-700' : 'text-slate-900'}`}>
                {c.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Income trend chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-8">
        <h2 className="font-semibold text-slate-800 mb-4">Monthly Revenue Trend</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v, name) => [name === 'income' ? fmt(Number(v)) : `${Number(v).toFixed(1)}%`, name === 'income' ? 'Income' : 'Occupancy']} />
            <Line
              type="monotone"
              dataKey="income"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 4 }}
              name="Income"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly detail table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Month</th>
              <th className="px-4 py-3 font-medium text-right">Bookings</th>
              <th className="px-4 py-3 font-medium text-right">Nights</th>
              <th className="px-4 py-3 font-medium text-right">Occupancy</th>
              <th className="px-4 py-3 font-medium text-right">Avg/Night</th>
              <th className="px-4 py-3 font-medium text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {statement?.months.map((m, i) => (
              <>
                <tr
                  key={i}
                  className={`border-b border-slate-50 cursor-pointer ${m.bookings.length > 0 ? 'hover:bg-slate-50' : ''}`}
                  onClick={() => m.bookings.length > 0 && toggleMonth(i)}
                >
                  <td className="px-4 py-3 text-slate-300">
                    {m.bookings.length > 0 ? (
                      expandedMonths.has(i)
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{MONTHS[i]}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{m.bookings.length}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{m.totalNights}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5">
                        <div
                          className="bg-emerald-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(m.occupancyRate, 100)}%` }}
                        />
                      </div>
                      <span className="text-slate-600 w-10 text-right">
                        {m.occupancyRate.toFixed(0)}%
                      </span>
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
                    <td className="px-4 py-2 pl-8 text-slate-500">
                      {b.guestName ?? b.confirmationCode ?? 'Guest'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-400">1</td>
                    <td className="px-4 py-2 text-right text-slate-400">{b.nights}</td>
                    <td className="px-4 py-2 text-right text-slate-400">
                      {format(new Date(b.checkIn), 'MMM d')} – {format(new Date(b.checkOut), 'MMM d')}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-400">
                      {b.nights > 0 && b.income > 0 ? fmt(b.income / b.nights) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-600 font-medium">
                      {fmt(b.income)}
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-emerald-50 border-t-2 border-emerald-200 font-bold text-sm">
              <td className="px-4 py-4" />
              <td className="px-4 py-4 text-slate-800">Annual Total</td>
              <td className="px-4 py-4 text-right text-slate-700">
                {statement?.months.reduce((s, m) => s + m.bookings.length, 0)}
              </td>
              <td className="px-4 py-4 text-right text-slate-700">{statement?.totalNights}</td>
              <td className="px-4 py-4 text-right text-slate-700">
                {statement?.avgOccupancyRate.toFixed(1)}%
              </td>
              <td className="px-4 py-4 text-right text-slate-700">
                {statement && statement.totalNights > 0
                  ? fmt(statement.totalIncome / statement.totalNights)
                  : '—'}
              </td>
              <td className="px-4 py-4 text-right text-emerald-700 text-base">
                {fmt(statement?.totalIncome ?? 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
