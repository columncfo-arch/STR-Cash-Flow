'use client';
import { useEffect, useState } from 'react';
import { Settings } from '@/types';
import { Check, AlertTriangle, Plus, Trash2 } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);

  async function clearAllBookings() {
    if (!confirm('Delete ALL bookings? This cannot be undone.')) return;
    await fetch('/api/bookings?all=true', { method: 'DELETE' });
    setCleared(true);
    setTimeout(() => setCleared(false), 3000);
  }

  async function seed2025(force = false) {
    const msg = force
      ? 'This will DELETE existing 2025 data and re-import. Continue?'
      : 'Import Jan–Oct 2025 baseline data (bookings + expenses)?';
    if (!confirm(msg)) return;
    const res = await fetch(`/api/seed-2025${force ? '?force=true' : ''}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok && data.hint) {
      if (confirm(`${data.error} Re-import and overwrite existing 2025 data?`)) seed2025(true);
      return;
    }
    if (!res.ok) { setSeeded(data.error ?? 'Error'); }
    else { setSeeded(`Done — ${data.bookingsAdded} bookings, ${data.expensesAdded} expenses added. ${data.note}`); }
    setTimeout(() => setSeeded(null), 15000);
  }

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, []);

  async function save() {
    if (!settings) return;
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!settings) return <div className="text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Settings</h1>
      <p className="text-slate-500 text-sm mb-8">Property details and fixed monthly costs.</p>

      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">Property</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Property Name</label>
            <input
              type="text"
              value={settings.propertyName}
              onChange={e => setSettings({ ...settings, propertyName: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
              placeholder="My STR Property"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Currency</label>
            <select
              value={settings.currency}
              onChange={e => setSettings({ ...settings, currency: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
            >
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="CAD">CAD — Canadian Dollar</option>
              <option value="AUD">AUD — Australian Dollar</option>
              <option value="MXN">MXN — Mexican Peso</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Monthly PITI ($)</label>
            <input
              type="number"
              value={settings.monthlyPITI ?? 0}
              onChange={e => setSettings({ ...settings, monthlyPITI: parseFloat(e.target.value) || 0 })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
              placeholder="0"
              min="0"
            />
            <p className="text-xs text-slate-400 mt-1">
              Combined monthly mortgage P&I + property tax + insurance. Applied automatically to every month in your P&L.
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Cleaning Fee per Booking ($)</label>
            <input
              type="number"
              value={settings.cleaningFeePerBooking ?? 0}
              onChange={e => setSettings({ ...settings, cleaningFeePerBooking: parseFloat(e.target.value) || 0 })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
              placeholder="0"
              min="0"
            />
            <p className="text-xs text-slate-400 mt-1">
              Added to cleaning expenses automatically for every booking in the period. Combined with any manually logged cleaning expenses.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-800 mb-1">Revenue Forecast</h2>
        <p className="text-xs text-slate-500 mb-4">
          Year-over-year growth assumptions used to project future months. Set based on AirDNA or similar market data.
          The dashboard uses last year&apos;s actuals × (1 + growth%) to forecast remaining months.
        </p>

        <div className="mb-5">
          <label className="text-xs text-slate-500 block mb-1">
            Default Growth Rate (fallback if no year-specific rate is set)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range" min="-50" max="100" step="1"
              value={settings.forecastGrowthPct ?? 0}
              onChange={e => setSettings({ ...settings, forecastGrowthPct: parseFloat(e.target.value) })}
              className="flex-1"
            />
            <span className={`text-sm font-semibold w-14 text-right ${
              (settings.forecastGrowthPct ?? 0) > 0 ? 'text-emerald-600' :
              (settings.forecastGrowthPct ?? 0) < 0 ? 'text-red-500' : 'text-slate-600'
            }`}>
              {(settings.forecastGrowthPct ?? 0) > 0 ? '+' : ''}{settings.forecastGrowthPct ?? 0}%
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-600">Year-Specific Rates</label>
            <button
              onClick={() => {
                const nextYear = String(new Date().getFullYear() + 1);
                const existing = settings.forecastGrowthByYear ?? {};
                if (existing[nextYear] !== undefined) return;
                setSettings({ ...settings, forecastGrowthByYear: { ...existing, [nextYear]: 0 } });
              }}
              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
            >
              <Plus className="w-3 h-3" /> Add Year
            </button>
          </div>
          {Object.keys(settings.forecastGrowthByYear ?? {}).length === 0 && (
            <p className="text-xs text-slate-400">No year-specific rates. Using default above.</p>
          )}
          <div className="space-y-2">
            {Object.entries(settings.forecastGrowthByYear ?? {})
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([yr, pct]) => (
                <div key={yr} className="flex items-center gap-3">
                  <input
                    type="number" value={yr}
                    onChange={e => {
                      const next = { ...settings.forecastGrowthByYear };
                      delete next[yr];
                      next[e.target.value] = pct;
                      setSettings({ ...settings, forecastGrowthByYear: next });
                    }}
                    className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1.5"
                  />
                  <input
                    type="range" min="-50" max="100" step="1"
                    value={pct}
                    onChange={e => setSettings({
                      ...settings,
                      forecastGrowthByYear: { ...settings.forecastGrowthByYear, [yr]: parseFloat(e.target.value) },
                    })}
                    className="flex-1"
                  />
                  <span className={`text-sm font-semibold w-14 text-right ${
                    pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-500' : 'text-slate-600'
                  }`}>
                    {pct > 0 ? '+' : ''}{pct}%
                  </span>
                  <button
                    onClick={() => {
                      const next = { ...settings.forecastGrowthByYear };
                      delete next[yr];
                      setSettings({ ...settings, forecastGrowthByYear: next });
                    }}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            AirDNA showing +4% ADR for Cocoa Beach in 2026? Add year 2026 → +4%.
          </p>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm hover:bg-emerald-700 transition-colors"
        >
          {saved ? <Check className="w-4 h-4" /> : null}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mt-8">
        <h2 className="font-semibold text-slate-800 mb-2">Data Management</h2>
        <p className="text-sm text-slate-500 mb-4">Seed historical data or clear the database.</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={seed2025}
            className="flex items-center gap-2 border border-emerald-300 text-emerald-700 px-4 py-2 rounded-lg text-sm hover:bg-emerald-50 transition-colors"
          >
            Import 2025 Baseline Data
          </button>
        </div>
        {seeded && <p className="text-xs text-slate-600 mt-3 p-3 bg-slate-50 rounded-lg">{seeded}</p>}
      </section>

      <section className="bg-white border border-red-100 rounded-xl p-6 shadow-sm mt-4">
        <h2 className="font-semibold text-red-700 mb-2">Danger Zone</h2>
        <p className="text-sm text-slate-500 mb-4">Permanently delete all booking data from the database.</p>
        <button
          onClick={clearAllBookings}
          className="flex items-center gap-2 border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm hover:bg-red-50 transition-colors"
        >
          <AlertTriangle className="w-4 h-4" />
          {cleared ? 'All bookings deleted.' : 'Delete All Bookings'}
        </button>
      </section>
    </div>
  );
}
