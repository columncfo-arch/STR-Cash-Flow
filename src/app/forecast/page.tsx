'use client';
import { useEffect, useState, useCallback } from 'react';
import { ForecastYear, Settings } from '@/types';
import { Pencil, Check, X, Plus, Trash2, TrendingUp } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';

type OverrideState = { revenue: string; expenses: string };

export default function ForecastPage() {
  const [rows, setRows] = useState<ForecastYear[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [editingYear, setEditingYear] = useState<number | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<OverrideState>({ revenue: '', expenses: '' });
  const [configOpen, setConfigOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<Partial<Settings>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedConfig, setSavedConfig] = useState(false);

  const fmt = useCallback((n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(n), [settings]);

  async function load() {
    const [forecastRes, settingsRes] = await Promise.all([
      fetch('/api/forecast'),
      fetch('/api/settings'),
    ]);
    const forecastData = await forecastRes.json();
    const settingsData = await settingsRes.json();
    setRows(forecastData.rows ?? []);
    setSettings(settingsData);
    setConfigDraft(settingsData);
  }

  useEffect(() => { load(); }, []);

  function startEditRow(row: ForecastYear) {
    setEditingYear(row.year);
    setOverrideDraft({
      revenue: row.isManualRevenue ? String(row.grossRevenue) : '',
      expenses: row.isManualExpenses ? String(row.operatingExpenses) : '',
    });
  }

  async function saveRowOverride(year: number) {
    if (!settings) return;
    const existing = settings.forecastOverrides ?? {};
    const entry: { revenue?: number; expenses?: number } = {};
    if (overrideDraft.revenue !== '') entry.revenue = parseFloat(overrideDraft.revenue) || 0;
    if (overrideDraft.expenses !== '') entry.expenses = parseFloat(overrideDraft.expenses) || 0;

    const next: Settings = {
      ...settings,
      forecastOverrides: { ...existing, [String(year)]: entry },
    };
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    setEditingYear(null);
    await load();
  }

  async function clearRowOverride(year: number) {
    if (!settings) return;
    const existing = { ...(settings.forecastOverrides ?? {}) };
    delete existing[String(year)];
    const next: Settings = { ...settings, forecastOverrides: existing };
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    await load();
  }

  async function saveConfig() {
    if (!settings) return;
    setSavingConfig(true);
    const next: Settings = { ...settings, ...configDraft };
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    setSettings(next);
    setSavingConfig(false);
    setSavedConfig(true);
    setTimeout(() => setSavedConfig(false), 2000);
    await load();
  }

  const currentYear = new Date().getFullYear();

  const chartData = rows.map(r => ({
    year: String(r.year),
    Revenue: r.grossRevenue,
    Expenses: r.operatingExpenses + r.piti,
    'Net Income': r.netIncome,
    isForecast: r.type === 'forecast',
  }));

  const growthByYear: Record<string, number> = (configDraft.forecastGrowthByYear ?? {});

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Long Term Forecast</h1>
          <p className="text-slate-500 text-sm mt-1">
            Historical actuals + {rows.filter(r => r.type === 'forecast').length}-year projection
          </p>
        </div>
        <button
          onClick={() => setConfigOpen(o => !o)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors ${
            configOpen
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Forecast Settings
        </button>
      </div>

      {/* Config panel */}
      {configOpen && configDraft && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">Forecast Configuration</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                Default YoY Revenue Growth Rate (fallback)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min="-50" max="100" step="1"
                  value={configDraft.forecastGrowthPct ?? 0}
                  onChange={e => setConfigDraft(d => ({ ...d, forecastGrowthPct: parseFloat(e.target.value) }))}
                  className="flex-1"
                />
                <span className={`text-sm font-semibold w-14 text-right ${
                  (configDraft.forecastGrowthPct ?? 0) > 0 ? 'text-emerald-600' :
                  (configDraft.forecastGrowthPct ?? 0) < 0 ? 'text-red-500' : 'text-slate-600'
                }`}>
                  {(configDraft.forecastGrowthPct ?? 0) > 0 ? '+' : ''}{configDraft.forecastGrowthPct ?? 0}%
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Applied to both revenue and expenses when no year-specific rate is set.</p>
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1">Vacancy / Unbooked Rate (%)</label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min="0" max="50" step="1"
                  value={configDraft.vacancyRate ?? 0}
                  onChange={e => setConfigDraft(d => ({ ...d, vacancyRate: parseFloat(e.target.value) }))}
                  className="flex-1"
                />
                <span className="text-sm font-semibold w-14 text-right text-slate-600">
                  {configDraft.vacancyRate ?? 0}%
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Expected % of potential nights that go unbooked. Informational — shown on chart.</p>
            </div>
          </div>

          {/* Year-specific growth rates */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Year-Specific Growth Rates</label>
              <button
                onClick={() => {
                  const nextYear = String(currentYear + 1);
                  if (growthByYear[nextYear] !== undefined) return;
                  setConfigDraft(d => ({
                    ...d,
                    forecastGrowthByYear: { ...growthByYear, [nextYear]: 0 },
                  }));
                }}
                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
              >
                <Plus className="w-3 h-3" /> Add Year
              </button>
            </div>
            {Object.keys(growthByYear).length === 0 && (
              <p className="text-xs text-slate-400">No year-specific rates. Using default above.</p>
            )}
            <div className="space-y-2">
              {Object.entries(growthByYear)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([yr, pct]) => (
                  <div key={yr} className="flex items-center gap-3">
                    <input
                      type="number" value={yr}
                      onChange={e => {
                        const next = { ...growthByYear };
                        delete next[yr];
                        next[e.target.value] = pct;
                        setConfigDraft(d => ({ ...d, forecastGrowthByYear: next }));
                      }}
                      className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                    <input
                      type="range" min="-50" max="100" step="1" value={pct}
                      onChange={e => setConfigDraft(d => ({
                        ...d,
                        forecastGrowthByYear: { ...growthByYear, [yr]: parseFloat(e.target.value) },
                      }))}
                      className="flex-1"
                    />
                    <span className={`text-sm font-semibold w-14 text-right ${
                      pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-500' : 'text-slate-600'
                    }`}>
                      {pct > 0 ? '+' : ''}{pct}%
                    </span>
                    <button
                      onClick={() => {
                        const next = { ...growthByYear };
                        delete next[yr];
                        setConfigDraft(d => ({ ...d, forecastGrowthByYear: next }));
                      }}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          </div>

          <button
            onClick={saveConfig}
            disabled={savingConfig}
            className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {savedConfig ? <Check className="w-4 h-4" /> : null}
            {savedConfig ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* Chart */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">Revenue, Expenses &amp; Net Income</h2>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Legend />
              <Bar yAxisId="left" dataKey="Revenue" stackId="a" name="Revenue">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.isForecast ? '#a7f3d0' : '#10b981'} />
                ))}
              </Bar>
              <Bar yAxisId="left" dataKey="Expenses" stackId="b" name="Expenses">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.isForecast ? '#fecaca' : '#f87171'} />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="Net Income"
                stroke="#f97316"
                strokeWidth={3}
                dot={{ r: 4, fill: '#f97316', strokeWidth: 0 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-slate-400 mt-2">
            Lighter bars = forecasted years. Net Income line uses right axis.
          </p>
        </div>
      )}

      {/* Forecast table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
              <th className="px-4 py-3 font-medium">Year</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium text-right">Gross Revenue</th>
              <th className="px-4 py-3 font-medium text-right">Op. Expenses</th>
              <th className="px-4 py-3 font-medium text-right">PITI</th>
              <th className="px-4 py-3 font-medium text-right">Net Income</th>
              <th className="px-4 py-3 font-medium text-right">Growth</th>
              <th className="px-4 py-3 font-medium w-20" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isEditing = editingYear === row.year;
              const isCurrent = row.year === currentYear;

              if (isEditing) {
                return (
                  <tr key={row.year} className="border-b border-slate-100 bg-emerald-50">
                    <td className="px-4 py-3 font-bold text-slate-800">{row.year}</td>
                    <td className="px-4 py-3">
                      <TypeBadge type={row.type} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-end gap-0.5">
                        <input
                          type="number"
                          value={overrideDraft.revenue}
                          onChange={e => setOverrideDraft(d => ({ ...d, revenue: e.target.value }))}
                          placeholder={String(row.grossRevenue)}
                          className="w-32 text-sm border border-emerald-300 rounded-lg px-2 py-1 text-right"
                        />
                        <span className="text-[10px] text-slate-400">leave blank = auto</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-end gap-0.5">
                        <input
                          type="number"
                          value={overrideDraft.expenses}
                          onChange={e => setOverrideDraft(d => ({ ...d, expenses: e.target.value }))}
                          placeholder={String(row.operatingExpenses)}
                          className="w-32 text-sm border border-emerald-300 rounded-lg px-2 py-1 text-right"
                        />
                        <span className="text-[10px] text-slate-400">leave blank = auto</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{fmt(row.piti)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">—</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => saveRowOverride(row.year)}
                          className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingYear(null)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              const hasOverride = row.isManualRevenue || row.isManualExpenses;

              return (
                <tr
                  key={row.year}
                  className={`border-b border-slate-50 ${isCurrent ? 'bg-blue-50/40' : row.type === 'forecast' ? 'bg-slate-50/50' : ''}`}
                >
                  <td className="px-4 py-3 font-bold text-slate-800">
                    {row.year}
                    {isCurrent && <span className="ml-2 text-[10px] font-normal text-blue-500 uppercase tracking-wide">current</span>}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={row.type} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">
                    {fmt(row.grossRevenue)}
                    {row.isManualRevenue && <span className="ml-1 text-[10px] text-amber-600">manual</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    ({fmt(row.operatingExpenses)})
                    {row.isManualExpenses && <span className="ml-1 text-[10px] text-amber-600">manual</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">({fmt(row.piti)})</td>
                  <td className={`px-4 py-3 text-right font-semibold ${
                    row.netIncome >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {row.netIncome >= 0 ? fmt(row.netIncome) : `(${fmt(Math.abs(row.netIncome))})`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.growthPct !== null ? (
                      <span className={`text-xs font-semibold ${
                        row.growthPct > 0 ? 'text-emerald-600' : row.growthPct < 0 ? 'text-red-500' : 'text-slate-400'
                      }`}>
                        {row.growthPct > 0 ? '+' : ''}{row.growthPct}%
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => startEditRow(row)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                        title="Override revenue / expenses"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {hasOverride && (
                        <button
                          onClick={() => clearRowOverride(row.year)}
                          className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500"
                          title="Clear manual overrides"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 mt-3">
        Click the pencil on any row to manually set revenue or expenses for that year. Leave blank to revert to auto-calculated.
        Growth rates apply to both revenue and expenses. Configure year-specific rates via Forecast Settings above.
      </p>
    </div>
  );
}

function TypeBadge({ type }: { type: ForecastYear['type'] }) {
  if (type === 'actual') return (
    <span className="text-[10px] uppercase tracking-wide bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Actual</span>
  );
  if (type === 'partial') return (
    <span className="text-[10px] uppercase tracking-wide bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">Partial</span>
  );
  return (
    <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">Forecast</span>
  );
}
