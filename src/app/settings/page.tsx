'use client';
import { useEffect, useState } from 'react';
import { Settings } from '@/types';
import { Check } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

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
        </div>
      </section>

      <button
        onClick={save}
        className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm hover:bg-emerald-700 transition-colors"
      >
        {saved ? <Check className="w-4 h-4" /> : null}
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}
