'use client';
import { useEffect, useState } from 'react';
import { Settings } from '@/types';
import { Wifi, Copy, Check, ExternalLink } from 'lucide-react';

export default function WelcomeSettingsPage() {
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

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Wifi className="w-6 h-6 text-emerald-600" />
        <h1 className="text-2xl font-bold text-slate-900">Welcome Page</h1>
      </div>
      <p className="text-slate-500 text-sm mb-8">
        Guests scan a QR code at check-in, register their email, and instantly receive wifi details.
      </p>

      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">Wifi Credentials</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Network Name</label>
            <input
              type="text"
              value={settings.wifiNetwork ?? ''}
              onChange={e => setSettings({ ...settings, wifiNetwork: e.target.value || undefined })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
              placeholder="HomeNetwork_5G"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Password</label>
            <input
              type="text"
              value={settings.wifiPassword ?? ''}
              onChange={e => setSettings({ ...settings, wifiPassword: e.target.value || undefined })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono"
              placeholder="hunter2"
            />
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">Guest Message</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Welcome Message</label>
            <textarea
              value={settings.welcomeMessage ?? ''}
              onChange={e => setSettings({ ...settings, welcomeMessage: e.target.value || undefined })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none"
              rows={4}
              placeholder="Welcome! We hope you have a wonderful stay. Check-out is at 10am. Text us any time at…"
            />
            <p className="text-xs text-slate-400 mt-1">Shown to guests after they register. Keep it warm and practical.</p>
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
            <p className="text-xs text-slate-400 mt-1">Link to a Notion page, Google Doc, or PDF with restaurant picks and activities.</p>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-800 mb-3">Guest Link</h2>
        <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-4 py-3 mb-3">
          <code className="text-sm text-slate-700 flex-1 truncate">{origin}/welcome</code>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/welcome"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            <ExternalLink className="w-4 h-4" /> Preview guest page
          </a>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(`${origin}/welcome`)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5"
          >
            <Copy className="w-3.5 h-3.5" /> Copy link
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-3">Print as a QR code and place it on the kitchen counter or inside the front door.</p>
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
