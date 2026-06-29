'use client';
import { useEffect, useState } from 'react';
import { Settings } from '@/types';
import { Check, AlertTriangle } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);

  async function clearAllBookings() {
    if (!confirm('Delete ALL bookings? This cannot be undone.')) return;
    await fetch('/api/bookings?all=true', { method: 'DELETE' });
    setCleared(true);
    setTimeout(() => setCleared(false), 3000);
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
          Used to project future months on the dashboard chart. Set based on AirDNA or similar market data
          comparing this year&apos;s expected performance vs last year.
        </p>
        <div>
          <label className="text-xs text-slate-500 block mb-1">
            Year-over-Year Growth Assumption (%)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="-50"
              max="100"
              step="1"
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
          <p className="text-xs text-slate-400 mt-1">
            Example: AirDNA shows your market is up 12% this summer → set +12%. Applied to last year&apos;s monthly revenue to project future months.
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

      <section className="bg-white border border-red-100 rounded-xl p-6 shadow-sm mt-8">
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
