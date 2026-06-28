'use client';
import { useEffect, useState } from 'react';
import { ICalSource, Platform, Settings } from '@/types';
import { Plus, Trash2, RefreshCw, Check, ExternalLink } from 'lucide-react';

const PLATFORM_OPTIONS: { value: Platform; label: string; placeholder: string }[] = [
  {
    value: 'airbnb',
    label: 'Airbnb',
    placeholder: 'https://www.airbnb.com/calendar/ical/XXXXX.ics?s=XXXXX',
  },
  {
    value: 'booking',
    label: 'Booking.com',
    placeholder: 'https://admin.booking.com/hotel/hoteladmin/ical.html?...',
  },
  {
    value: 'vrbo',
    label: 'VRBO / Vrbo',
    placeholder: 'https://www.vrbo.com/icalendar/yourCalendar.ics',
  },
  {
    value: 'direct',
    label: 'Direct / Other',
    placeholder: 'https://example.com/calendar.ics',
  },
];

function newSource(platform: Platform = 'airbnb'): ICalSource {
  return {
    id: `src-${Date.now()}`,
    platform,
    name: PLATFORM_OPTIONS.find(p => p.value === platform)?.label ?? 'Source',
    url: '',
    enabled: true,
  };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, []);

  async function save(updated: Settings) {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function syncNow() {
    if (!settings) return;
    await save(settings);
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await fetch('/api/ical', { method: 'POST' });
      const data = await res.json();
      setSyncResult(
        `Synced ${data.synced} bookings${data.errors?.length ? '. Errors: ' + data.errors.join('; ') : ''}`,
      );
    } catch {
      setSyncResult('Sync failed — check your iCal URLs');
    } finally {
      setSyncing(false);
    }
  }

  async function clearAndResync() {
    if (!settings) return;
    if (!confirm('This will delete all auto-synced bookings and re-import fresh from your iCal feeds. Manually added bookings are kept. Continue?')) return;
    await save(settings);
    setClearing(true);
    setSyncResult('');
    try {
      const res = await fetch('/api/ical/clear', { method: 'POST' });
      const data = await res.json();
      setSyncResult(
        `Cleared ${data.cleared} old bookings, synced ${data.synced} fresh${data.errors?.length ? '. Errors: ' + data.errors.join('; ') : ''}`,
      );
    } catch {
      setSyncResult('Clear & re-sync failed');
    } finally {
      setClearing(false);
    }
  }

  function addSource(platform: Platform) {
    if (!settings) return;
    setSettings({ ...settings, sources: [...settings.sources, newSource(platform)] });
  }

  function updateSource(id: string, patch: Partial<ICalSource>) {
    if (!settings) return;
    setSettings({
      ...settings,
      sources: settings.sources.map(s => s.id === id ? { ...s, ...patch } : s),
    });
  }

  function removeSource(id: string) {
    if (!settings) return;
    setSettings({ ...settings, sources: settings.sources.filter(s => s.id !== id) });
  }

  if (!settings) {
    return <div className="text-slate-400 text-sm">Loading…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Settings</h1>
      <p className="text-slate-500 text-sm mb-8">Configure your property and iCal feed sources.</p>

      {/* General settings */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">Property</h2>
        <div className="grid grid-cols-2 gap-4">
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
              Combined monthly mortgage P&I + property tax + insurance. Applied automatically to P&L.
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Default Nightly Rate ($)</label>
            <input
              type="number"
              value={settings.defaultNightlyRate}
              onChange={e => setSettings({ ...settings, defaultNightlyRate: parseFloat(e.target.value) || 0 })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
              placeholder="0"
              min="0"
            />
            <p className="text-xs text-slate-400 mt-1">
              Fallback estimate when iCal syncs bookings with no imported income yet.
            </p>
          </div>
        </div>
      </section>

      {/* iCal sources */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">iCal Sources</h2>
        </div>

        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <strong>Note:</strong> iCal feeds from Airbnb, Booking.com, and VRBO include booking
          dates but <em>not</em> prices. Set a default nightly rate above for automatic estimates,
          or manually enter income per booking in the Bookings page.
        </div>

        {settings.sources.length === 0 && (
          <p className="text-sm text-slate-400 mb-4">No iCal sources yet. Add one below.</p>
        )}

        <div className="space-y-4">
          {settings.sources.map(source => (
            <div key={source.id} className="border border-slate-200 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Platform</label>
                  <select
                    value={source.platform}
                    onChange={e => updateSource(source.id, {
                      platform: e.target.value as Platform,
                      name: PLATFORM_OPTIONS.find(p => p.value === e.target.value)?.label ?? source.name,
                    })}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  >
                    {PLATFORM_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Display Name</label>
                  <input
                    type="text"
                    value={source.name}
                    onChange={e => updateSource(source.id, { name: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="text-xs text-slate-500 block mb-1">iCal URL</label>
                <input
                  type="url"
                  value={source.url}
                  onChange={e => updateSource(source.id, { url: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono"
                  placeholder={PLATFORM_OPTIONS.find(p => p.value === source.platform)?.placeholder}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={e => updateSource(source.id, { enabled: e.target.checked })}
                    className="rounded"
                  />
                  Enabled
                  {source.lastSynced && (
                    <span className="text-xs text-slate-400 ml-2">
                      Last synced: {new Date(source.lastSynced).toLocaleString()}
                    </span>
                  )}
                </label>
                <button
                  onClick={() => removeSource(source.id)}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PLATFORM_OPTIONS.map(p => (
            <button
              key={p.value}
              onClick={() => addSource(p.value)}
              className="flex items-center gap-1.5 text-sm border border-dashed border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg hover:border-emerald-400 hover:text-emerald-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* How to find iCal URLs */}
      <section className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6 text-sm text-slate-600">
        <h3 className="font-semibold text-slate-700 mb-3">How to find your iCal URL</h3>
        <ul className="space-y-2">
          <li>
            <strong>Airbnb:</strong> Go to your listing → Calendar → Export calendar → Copy the link.
          </li>
          <li>
            <strong>Booking.com:</strong> Extranet → Calendar → Sync calendar → Copy iCal link.
          </li>
          <li>
            <strong>VRBO:</strong> Dashboard → Calendar → Import/Export → Export → Copy iCal URL.
          </li>
        </ul>
      </section>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => save(settings)}
          className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm hover:bg-emerald-700 transition-colors"
        >
          {saved ? <Check className="w-4 h-4" /> : null}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
        <button
          onClick={syncNow}
          disabled={syncing || clearing}
          className="flex items-center gap-2 border border-slate-200 bg-white text-slate-700 px-5 py-2.5 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Save & Sync Now'}
        </button>
        <button
          onClick={clearAndResync}
          disabled={syncing || clearing}
          className="flex items-center gap-2 border border-red-200 bg-white text-red-600 px-5 py-2.5 rounded-lg text-sm hover:bg-red-50 disabled:opacity-60 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${clearing ? 'animate-spin' : ''}`} />
          {clearing ? 'Clearing…' : 'Clear & Re-sync'}
        </button>
        {syncResult && (
          <span className="text-sm text-slate-500">{syncResult}</span>
        )}
      </div>
    </div>
  );
}
