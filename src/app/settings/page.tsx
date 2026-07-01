'use client';
import { useEffect, useState } from 'react';
import { Settings } from '@/types';
import { Check, AlertTriangle, Wifi, Copy } from 'lucide-react';

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

      <p className="text-xs text-slate-500 mb-4">
        Growth rates and vacancy assumptions are configured on the{' '}
        <a href="/forecast" className="text-emerald-600 underline font-medium">Long Term Forecast</a> page.
      </p>

      {/* Guest welcome form settings */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Wifi className="w-4 h-4 text-emerald-600" />
          <h2 className="font-semibold text-slate-800">Guest Welcome Page</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Guests scan a QR code → register their email → get wifi details instantly.{' '}
          Share this link: <code className="bg-slate-100 px-1 rounded text-xs">
            {typeof window !== 'undefined' ? window.location.origin : ''}/welcome
          </code>
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Wifi Network Name</label>
              <input
                type="text"
                value={settings.wifiNetwork ?? ''}
                onChange={e => setSettings({ ...settings, wifiNetwork: e.target.value || undefined })}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                placeholder="HomeNetwork_5G"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Wifi Password</label>
              <input
                type="text"
                value={settings.wifiPassword ?? ''}
                onChange={e => setSettings({ ...settings, wifiPassword: e.target.value || undefined })}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono"
                placeholder="hunter2"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Welcome Message</label>
            <textarea
              value={settings.welcomeMessage ?? ''}
              onChange={e => setSettings({ ...settings, welcomeMessage: e.target.value || undefined })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none"
              rows={3}
              placeholder="Welcome! We hope you have a wonderful stay. Check-out is at 10am. Text us any time at…"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Local Guide URL (optional)</label>
            <input
              type="url"
              value={settings.localGuideUrl ?? ''}
              onChange={e => setSettings({ ...settings, localGuideUrl: e.target.value || undefined })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
              placeholder="https://notion.so/your-local-guide"
            />
            <p className="text-xs text-slate-400 mt-1">Link to a Notion page, Google Doc, or PDF with restaurant picks, activities, etc.</p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <a
              href="/welcome"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-emerald-600 underline"
            >
              Preview guest page ↗
            </a>
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/welcome`;
                navigator.clipboard.writeText(url);
              }}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> Copy link
            </button>
          </div>
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
            onClick={() => seed2025()}
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
