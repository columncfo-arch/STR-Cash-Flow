'use client';
import { useEffect, useState, useCallback } from 'react';
import { ForecastYear, Settings, ForecastOverride } from '@/types';
import { Pencil, Check, X, Plus, Trash2, TrendingUp } from 'lucide-react';
import {
  ComposedChart, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

const EXPENSE_DETAIL_KEYS: { key: string; label: string }[] = [
  { key: 'platformFees', label: 'Platform Fees' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'electric', label: 'Electric' },
  { key: 'water', label: 'Water' },
  { key: 'internet', label: 'Internet' },
  { key: 'yard_care', label: 'Yard Care' },
  { key: 'supplies', label: 'Supplies' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'other', label: 'Other' },
  { key: 'ownerTaxes', label: 'Lodging Tax (Owner Remits)' },
];

type OverrideState = { revenue: string; expenses: string; piti: string };

interface AddYearDraft {
  year: string;
  mode: 'simple' | 'detailed';
  revenue: string;
  expenses: string;
  piti: string;
  detail: Record<string, string>;
}

function emptyAddYearDraft(defaultYear: number): AddYearDraft {
  return { year: String(defaultYear), mode: 'simple', revenue: '', expenses: '', piti: '', detail: {} };
}

type EnrichedRow = ForecastYear & { cumulative: number };

// ── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean | null;
  large?: boolean;
}
function KpiCard({ label, value, sub, positive, large }: KpiCardProps) {
  const color = positive === true ? 'text-emerald-600' : positive === false ? 'text-red-500' : 'text-slate-900';
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{label}</p>
      <p className={`font-bold ${large ? 'text-3xl' : 'text-2xl'} ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
    </div>
  );
}

export default function ForecastPage() {
  const [rows, setRows] = useState<ForecastYear[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [editingYear, setEditingYear] = useState<number | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<OverrideState>({ revenue: '', expenses: '', piti: '' });

  const [addYearOpen, setAddYearOpen] = useState(false);
  const [addYearDraft, setAddYearDraft] = useState<AddYearDraft>(emptyAddYearDraft(new Date().getFullYear() - 1));

  const [configOpen, setConfigOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<Partial<Settings>>({});
  const [savedConfig, setSavedConfig] = useState(false);

  const fmt = useCallback((n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(n), [settings]);

  async function load() {
    const [fr, sr] = await Promise.all([fetch('/api/forecast'), fetch('/api/settings')]);
    const fd = await fr.json();
    const sd = await sr.json();
    setRows(fd.rows ?? []);
    setSettings(sd);
    setConfigDraft(sd);
  }

  useEffect(() => { load(); }, []);

  // ── Row override (pencil edit) ──────────────────────────────────────────────

  function startEditRow(row: ForecastYear) {
    setEditingYear(row.year);
    setOverrideDraft({
      revenue: row.isManualRevenue ? String(row.grossRevenue) : '',
      expenses: row.isManualExpenses ? String(row.operatingExpenses) : '',
      piti: row.isManualPiti ? String(row.piti) : '',
    });
  }

  async function saveRowOverride(year: number) {
    if (!settings) return;
    const existing = settings.forecastOverrides ?? {};
    const prev = existing[String(year)] ?? {};
    const entry: ForecastOverride = { ...prev };
    if (overrideDraft.revenue !== '') entry.revenue = parseFloat(overrideDraft.revenue) || 0;
    else delete entry.revenue;
    if (overrideDraft.expenses !== '') entry.expenses = parseFloat(overrideDraft.expenses) || 0;
    else delete entry.expenses;
    if (overrideDraft.piti !== '') entry.piti = parseFloat(overrideDraft.piti) || 0;
    else delete entry.piti;

    const next: Settings = { ...settings, forecastOverrides: { ...existing, [String(year)]: entry } };
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    setEditingYear(null);
    await load();
  }

  async function clearRowOverride(year: number) {
    if (!settings) return;
    const existing = { ...(settings.forecastOverrides ?? {}) };
    delete existing[String(year)];
    const next: Settings = { ...settings, forecastOverrides: existing };
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    await load();
  }

  // ── Add Prior Year ──────────────────────────────────────────────────────────

  function openAddYear() {
    const earliestRow = rows.find(r => r.type === 'actual' || r.type === 'partial');
    const defaultYear = earliestRow ? earliestRow.year - 1 : new Date().getFullYear() - 1;
    setAddYearDraft(emptyAddYearDraft(defaultYear));
    setAddYearOpen(true);
  }

  async function saveAddYear() {
    if (!settings || !addYearDraft.year) return;
    const yr = addYearDraft.year;
    const entry: ForecastOverride = { isManualYear: true };
    if (addYearDraft.revenue !== '') entry.revenue = parseFloat(addYearDraft.revenue) || 0;
    if (addYearDraft.piti !== '') entry.piti = parseFloat(addYearDraft.piti) || 0;

    if (addYearDraft.mode === 'simple') {
      if (addYearDraft.expenses !== '') entry.expenses = parseFloat(addYearDraft.expenses) || 0;
    } else {
      const detail: Record<string, number> = {};
      for (const [k, v] of Object.entries(addYearDraft.detail)) {
        if (v !== '') detail[k] = parseFloat(v) || 0;
      }
      if (Object.keys(detail).length > 0) entry.expenseDetail = detail;
    }

    const next: Settings = {
      ...settings,
      forecastOverrides: { ...(settings.forecastOverrides ?? {}), [yr]: entry },
    };
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    setAddYearOpen(false);
    await load();
  }

  // ── Forecast Settings ───────────────────────────────────────────────────────

  async function saveConfig() {
    if (!settings) return;
    const next: Settings = { ...settings, ...configDraft };
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    setSettings(next);
    setSavedConfig(true);
    setTimeout(() => setSavedConfig(false), 2000);
    await load();
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const currentYear = new Date().getFullYear();
  const growthByYear: Record<string, number> = configDraft.forecastGrowthByYear ?? {};

  // Enrich each row with running cumulative cash flow
  let running = 0;
  const enriched: EnrichedRow[] = rows.map(r => {
    running += r.netIncome;
    return { ...r, cumulative: running };
  });

  // Split index for chart: last non-forecast row
  const lastActualIdx = enriched.reduce((best, r, i) => r.type !== 'forecast' ? i : best, -1);

  const actualRows = enriched.filter(r => r.type !== 'forecast');
  const forecastRows = enriched.filter(r => r.type === 'forecast');
  const currentYearRow = enriched.find(r => r.year === currentYear);
  const finalRow = enriched[enriched.length - 1];

  const cashToDate = actualRows.reduce((s, r) => s + r.netIncome, 0);
  const projectedCash = forecastRows.reduce((s, r) => s + r.netIncome, 0);
  const avgAnnual = actualRows.length ? cashToDate / actualRows.length : 0;

  // Wealth chart: split into actual (solid) vs forecast (lighter, dashed)
  const wealthData = enriched.map((r, i) => ({
    year: String(r.year),
    actual:   i <= lastActualIdx ? r.cumulative : null,
    forecast: i >= lastActualIdx ? r.cumulative : null,
  }));

  // Annual cash flow bars
  const annualData = enriched.map(r => ({
    year: String(r.year),
    cashFlow: r.netIncome,
    isForecast: r.type === 'forecast',
  }));

  const detailTotal = Object.entries(addYearDraft.detail)
    .reduce((s, [, v]) => s + (parseFloat(v) || 0), 0);

  const hasData = enriched.length > 0;

  return (
    <div className="max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Long Term Forecast</h1>
          <p className="text-slate-500 text-sm mt-1">
            {actualRows.length > 0
              ? `${actualRows.length} year${actualRows.length !== 1 ? 's' : ''} of actuals · ${forecastRows.length}-year projection`
              : `${forecastRows.length}-year projection`}
          </p>
        </div>
        <button
          onClick={() => setConfigOpen(o => !o)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors ${
            configOpen ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Forecast Settings
        </button>
      </div>

      {/* ── Config panel ── */}
      {configOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">Forecast Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Default YoY Growth Rate (fallback)</label>
              <div className="flex items-center gap-3">
                <input type="range" min="-50" max="100" step="1"
                  value={configDraft.forecastGrowthPct ?? 0}
                  onChange={e => setConfigDraft(d => ({ ...d, forecastGrowthPct: parseFloat(e.target.value) }))}
                  className="flex-1" />
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
                <input type="range" min="0" max="50" step="1"
                  value={configDraft.vacancyRate ?? 0}
                  onChange={e => setConfigDraft(d => ({ ...d, vacancyRate: parseFloat(e.target.value) }))}
                  className="flex-1" />
                <span className="text-sm font-semibold w-14 text-right text-slate-600">{configDraft.vacancyRate ?? 0}%</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Informational — expected % of nights that go unbooked.</p>
            </div>
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Year-Specific Growth Rates</label>
              <button
                onClick={() => {
                  const nextYear = String(currentYear + 1);
                  if (growthByYear[nextYear] !== undefined) return;
                  setConfigDraft(d => ({ ...d, forecastGrowthByYear: { ...growthByYear, [nextYear]: 0 } }));
                }}
                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
              >
                <Plus className="w-3 h-3" /> Add Year
              </button>
            </div>
            {Object.keys(growthByYear).length === 0 && (
              <p className="text-xs text-slate-400">No year-specific rates — using default above.</p>
            )}
            <div className="space-y-2">
              {Object.entries(growthByYear).sort(([a], [b]) => a.localeCompare(b)).map(([yr, pct]) => (
                <div key={yr} className="flex items-center gap-3">
                  <input type="number" value={yr}
                    onChange={e => {
                      const next = { ...growthByYear };
                      delete next[yr];
                      next[e.target.value] = pct;
                      setConfigDraft(d => ({ ...d, forecastGrowthByYear: next }));
                    }}
                    className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                  <input type="range" min="-50" max="100" step="1" value={pct}
                    onChange={e => setConfigDraft(d => ({
                      ...d, forecastGrowthByYear: { ...growthByYear, [yr]: parseFloat(e.target.value) },
                    }))}
                    className="flex-1" />
                  <span className={`text-sm font-semibold w-14 text-right ${pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-500' : 'text-slate-600'}`}>
                    {pct > 0 ? '+' : ''}{pct}%
                  </span>
                  <button onClick={() => {
                    const next = { ...growthByYear };
                    delete next[yr];
                    setConfigDraft(d => ({ ...d, forecastGrowthByYear: next }));
                  }} className="text-slate-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button onClick={saveConfig}
            className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm hover:bg-emerald-700 transition-colors">
            {savedConfig ? <Check className="w-4 h-4" /> : null}
            {savedConfig ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* ── Hero KPI Cards ── */}
      {hasData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="Cash Generated to Date"
            value={fmt(cashToDate)}
            sub={`${actualRows.length} actual year${actualRows.length !== 1 ? 's' : ''}`}
            positive={cashToDate >= 0}
            large
          />
          <KpiCard
            label={`${currentYear} Net Cash Flow`}
            value={currentYearRow ? fmt(currentYearRow.netIncome) : '—'}
            sub={currentYearRow?.blended ? 'YTD actuals + projected remainder' : currentYearRow?.type === 'forecast' ? 'Projected' : 'Actual'}
            positive={currentYearRow ? currentYearRow.netIncome >= 0 : null}
          />
          <KpiCard
            label="Avg Annual Cash Flow"
            value={actualRows.length ? fmt(avgAnnual) : '—'}
            sub={actualRows.length ? `Avg across ${actualRows.length} actual year${actualRows.length !== 1 ? 's' : ''}` : 'No actuals yet'}
            positive={avgAnnual >= 0}
          />
          <KpiCard
            label={`${forecastRows.length}-Year Projected`}
            value={fmt(projectedCash)}
            sub="Additional from forecast years"
            positive={projectedCash >= 0}
          />
        </div>
      )}

      {/* ── Cumulative Cash Flow (Wealth Building) Chart ── */}
      {hasData && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-6">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="font-semibold text-slate-800">Cumulative Net Cash Flow</h2>
              <p className="text-xs text-slate-400 mt-0.5">Total cash this property has put in your pocket, accumulating over time</p>
            </div>
            {finalRow && (
              <div className="text-right">
                <p className="text-xs text-slate-400">End of projection</p>
                <p className={`text-lg font-bold ${finalRow.cumulative >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmt(finalRow.cumulative)}
                </p>
              </div>
            )}
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={wealthData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillForecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.07} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value: unknown, name: unknown) => [
                  fmt(Number(value)),
                  name === 'actual' ? 'Cumulative (Actual)' : 'Cumulative (Forecast)',
                ]}
                labelFormatter={(label: unknown) => `Year ${label}`}
              />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />
              <Area
                type="monotone"
                dataKey="actual"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#fillActual)"
                connectNulls={false}
                name="actual"
                dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              <Area
                type="monotone"
                dataKey="forecast"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="6 3"
                fill="url(#fillForecast)"
                connectNulls={false}
                name="forecast"
                dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-slate-400 mt-2">Solid = actuals · Dashed = projected</p>
        </div>
      )}

      {/* ── Annual Net Cash Flow Chart ── */}
      {hasData && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-6">
          <h2 className="font-semibold text-slate-800 mb-0.5">Annual Net Cash Flow</h2>
          <p className="text-xs text-slate-400 mb-4">Revenue minus all expenses and PITI — what actually hits the bank each year</p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={annualData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: unknown) => [fmt(Number(v)), 'Net Cash Flow']} labelFormatter={(l: unknown) => `Year ${l}`} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
              <Bar dataKey="cashFlow" name="Net Cash Flow" radius={[3, 3, 0, 0]}>
                {annualData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.cashFlow >= 0
                      ? (d.isForecast ? '#a7f3d0' : '#10b981')
                      : (d.isForecast ? '#fecaca' : '#f87171')}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-slate-400 mt-2">Green = positive · Red = negative · Lighter = forecasted</p>
        </div>
      )}

      {/* ── Year-by-Year Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
              <th className="px-4 py-3 font-medium">Year</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium text-right">Net Cash Flow</th>
              <th className="px-4 py-3 font-medium text-right">Cumulative</th>
              <th className="px-4 py-3 font-medium text-right">Gross Revenue</th>
              <th className="px-4 py-3 font-medium text-right">Op. Expenses</th>
              <th className="px-4 py-3 font-medium text-right">PITI</th>
              <th className="px-4 py-3 font-medium text-right">Growth</th>
              <th className="px-4 py-3 font-medium w-20" />
            </tr>
          </thead>
          <tbody>
            {enriched.map(row => {
              const isEditing = editingYear === row.year;
              const isCurrent = row.year === currentYear;
              const hasOverride = row.isManualRevenue || row.isManualExpenses || row.isManualPiti;

              if (isEditing) {
                return (
                  <tr key={row.year} className="border-b border-slate-100 bg-emerald-50">
                    <td className="px-4 py-3 font-bold text-slate-800">{row.year}</td>
                    <td className="px-4 py-3"><TypeBadge type={row.type} manual={row.isManualEntry} blended={row.blended} /></td>
                    <td className="px-4 py-3 text-right text-slate-400 text-xs">recalc on save</td>
                    <td className="px-4 py-3 text-right text-slate-400 text-xs">—</td>
                    <td className="px-4 py-3">
                      <EditCell value={overrideDraft.revenue} placeholder={String(row.grossRevenue)}
                        onChange={v => setOverrideDraft(d => ({ ...d, revenue: v }))} />
                    </td>
                    <td className="px-4 py-3">
                      <EditCell value={overrideDraft.expenses} placeholder={String(row.operatingExpenses)}
                        onChange={v => setOverrideDraft(d => ({ ...d, expenses: v }))} />
                    </td>
                    <td className="px-4 py-3">
                      <EditCell value={overrideDraft.piti} placeholder={String(row.piti)}
                        onChange={v => setOverrideDraft(d => ({ ...d, piti: v }))} />
                    </td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => saveRowOverride(row.year)}
                          className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingYear(null)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={row.year}
                  className={`border-b border-slate-50 ${isCurrent ? 'bg-blue-50/40' : row.type === 'forecast' ? 'bg-slate-50/50' : ''}`}
                >
                  <td className="px-4 py-3 font-bold text-slate-800">
                    {row.year}
                    {isCurrent && <span className="ml-2 text-[10px] font-normal text-blue-500 uppercase tracking-wide">current</span>}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={row.type} manual={row.isManualEntry} blended={row.blended} />
                  </td>

                  {/* Net Cash Flow — hero column */}
                  <td className={`px-4 py-3 text-right font-bold text-base ${row.netIncome >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {row.netIncome >= 0 ? fmt(row.netIncome) : `(${fmt(Math.abs(row.netIncome))})`}
                  </td>

                  {/* Cumulative */}
                  <td className={`px-4 py-3 text-right font-semibold ${row.cumulative >= 0 ? 'text-slate-700' : 'text-red-500'}`}>
                    {fmt(row.cumulative)}
                  </td>

                  <td className="px-4 py-3 text-right text-slate-600">
                    {fmt(row.grossRevenue)}
                    {row.isManualRevenue && <span className="ml-1 text-[10px] text-amber-600">manual</span>}
                    {row.blended && !row.isManualRevenue && row.ytdGross !== undefined && row.forecastGross !== undefined && (
                      <div className="text-[10px] text-slate-400 font-normal">
                        {fmt(row.ytdGross)} act + {fmt(row.forecastGross)} proj
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    ({fmt(row.operatingExpenses)})
                    {row.isManualExpenses && <span className="ml-1 text-[10px] text-amber-600">manual</span>}
                    {row.blended && !row.isManualExpenses && row.ytdOpEx !== undefined && row.forecastOpEx !== undefined && (
                      <div className="text-[10px] text-slate-400 font-normal">
                        {fmt(row.ytdOpEx)} act + {fmt(row.forecastOpEx)} proj
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    ({fmt(row.piti)})
                    {row.isManualPiti && <span className="ml-1 text-[10px] text-amber-600">manual</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.growthPct !== null ? (
                      <span className={`text-xs font-semibold ${row.growthPct > 0 ? 'text-emerald-600' : row.growthPct < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {row.growthPct > 0 ? '+' : ''}{row.growthPct}%
                      </span>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEditRow(row)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                        title="Override revenue / expenses / PITI">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {(hasOverride || row.isManualEntry) && (
                        <button onClick={() => clearRowOverride(row.year)}
                          className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500"
                          title={row.isManualEntry ? 'Remove this year' : 'Clear manual overrides'}>
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

      {/* ── Add Prior Year ── */}
      {addYearOpen ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Add Prior Year</h2>
            <button onClick={() => setAddYearOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Year</label>
              <input type="number" value={addYearDraft.year}
                onChange={e => setAddYearDraft(d => ({ ...d, year: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                placeholder="2024" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Gross Revenue ($)</label>
              <input type="number" value={addYearDraft.revenue}
                onChange={e => setAddYearDraft(d => ({ ...d, revenue: e.target.value }))}
                placeholder="0" min="0"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">PITI Total ($)</label>
              <input type="number" value={addYearDraft.piti}
                onChange={e => setAddYearDraft(d => ({ ...d, piti: e.target.value }))}
                placeholder={settings ? String(settings.monthlyPITI * 12) : '0'} min="0"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
              <p className="text-[10px] text-slate-400 mt-0.5">Blank = 12 × monthly PITI</p>
            </div>
            <div className="flex items-end">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 h-fit">
                {(['simple', 'detailed'] as const).map(m => (
                  <button key={m} onClick={() => setAddYearDraft(d => ({ ...d, mode: m }))}
                    className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                      addYearDraft.mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {addYearDraft.mode === 'simple' ? (
            <div className="mb-4">
              <label className="text-xs text-slate-500 block mb-1">Total Operating Expenses ($)</label>
              <input type="number" value={addYearDraft.expenses}
                onChange={e => setAddYearDraft(d => ({ ...d, expenses: e.target.value }))}
                placeholder="0" min="0"
                className="w-48 text-sm border border-slate-200 rounded-lg px-3 py-2" />
              <p className="text-xs text-slate-400 mt-1">All costs except PITI: platform fees, cleaning, utilities, etc.</p>
            </div>
          ) : (
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-2">Enter each expense category (all except PITI):</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {EXPENSE_DETAIL_KEYS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[10px] text-slate-500 block mb-0.5">{label}</label>
                    <input type="number"
                      value={addYearDraft.detail[key] ?? ''}
                      onChange={e => setAddYearDraft(d => ({ ...d, detail: { ...d.detail, [key]: e.target.value } }))}
                      placeholder="0" min="0"
                      className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                  </div>
                ))}
              </div>
              {detailTotal > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  Total: <span className="font-semibold">{fmt(detailTotal)}</span>
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={saveAddYear}
              className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700">
              <Check className="w-3.5 h-3.5" /> Add Year
            </button>
            <button onClick={() => setAddYearOpen(false)}
              className="flex items-center gap-1.5 border border-slate-200 px-4 py-2 rounded-lg text-sm hover:bg-slate-50">
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={openAddYear}
          className="mt-4 flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 transition-colors">
          <Plus className="w-4 h-4" /> Add Prior Year Data
        </button>
      )}

      <p className="text-xs text-slate-400 mt-3">
        Pencil = override revenue, expenses, or PITI for any row. X = remove overrides (or remove manual year).
        Growth rates apply to both revenue and expenses. PITI always shown as full 12-month cost.
      </p>
    </div>
  );
}

function EditCell({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <input type="number" value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-32 text-sm border border-emerald-300 rounded-lg px-2 py-1 text-right" />
      <span className="text-[10px] text-slate-400">blank = auto</span>
    </div>
  );
}

function TypeBadge({ type, manual, blended }: { type: ForecastYear['type']; manual?: boolean; blended?: boolean }) {
  if (manual) return (
    <span className="text-[10px] uppercase tracking-wide bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">Manual</span>
  );
  if (blended) return (
    <span className="text-[10px] uppercase tracking-wide bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded font-medium">YTD+Proj</span>
  );
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
