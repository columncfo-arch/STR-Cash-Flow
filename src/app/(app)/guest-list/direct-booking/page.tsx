'use client';
import { useEffect, useState, useMemo } from 'react';
import { DirectLead, Settings } from '@/types';
import { format } from 'date-fns';
import { Zap, Check, Mail, Phone, Download, Search, ExternalLink, Copy, RefreshCw } from 'lucide-react';

type Tab = 'leads' | 'site';

export default function DirectBookingPage() {
  const [tab, setTab] = useState<Tab>('leads');
  const [leads, setLeads] = useState<DirectLead[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function load() {
    const [l, s] = await Promise.all([
      fetch('/api/direct-booking').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]);
    setLeads(Array.isArray(l) ? l : []);
    setSettings(s);
  }

  useEffect(() => { load(); }, []);

  async function save(updated: Settings) {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  }

  async function bustCalendarCache() {
    setSyncing(true);
    setSyncResult(null);
    try {
      await fetch('/api/calendar', { method: 'POST' });
      const res = await fetch('/api/calendar');
      const { blocked } = await res.json();
      setSyncResult(`Synced — ${blocked.length} blocked date range${blocked.length !== 1 ? 's' : ''} found.`);
    } catch {
      setSyncResult('Sync failed. Check your iCal URLs.');
    } finally {
      setSyncing(false);
    }
  }

  function exportLeads() {
    if (leads.length === 0) return;
    const rows = leads.map(l => [
      `${l.firstName} ${l.lastName}`.trim(),
      l.email,
      l.phone ?? '',
      l.preferredDates ?? '',
      l.tcpaConsent ? 'Yes' : 'No',
      format(new Date(l.createdAt), 'yyyy-MM-dd'),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = ['Name,Email,Phone,Dates,TCPA Consent,Submitted', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'direct-booking-leads.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(l =>
      `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q) ||
      (l.phone ?? '').includes(q)
    );
  }, [leads, search]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  if (!settings) return <div className="text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-emerald-600" />
            Direct Booking
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {leads.length} lead{leads.length !== 1 ? 's' : ''} · {leads.filter(l => l.tcpaConsent).length} SMS opt-ins
          </p>
        </div>
        {tab === 'leads' && leads.length > 0 && (
          <button
            onClick={exportLeads}
            className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" /> Export Leads
          </button>
        )}
        {tab === 'site' && (
          <div className="flex items-center gap-3">
            <a
              href="/book"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              <ExternalLink className="w-4 h-4" /> Preview booking page
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(`${origin}/book`)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> Copy link
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('leads')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === 'leads' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Leads
          {leads.length > 0 && (
            <span className="bg-emerald-100 text-emerald-700 text-xs rounded-full px-2 py-0.5 font-semibold">
              {leads.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('site')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'site' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Booking Site Settings
        </button>
      </div>

      {/* ── Leads tab ── */}
      {tab === 'leads' && (
        <div>
          {leads.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
              <Zap className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">No direct booking leads yet</p>
              <p className="text-slate-400 text-xs mt-1">
                Share your{' '}
                <a href="/book" target="_blank" className="text-emerald-600 underline">/book</a>
                {' '}page or{' '}
                <a href="/book-direct" target="_blank" className="text-emerald-600 underline">/book-direct</a>
                {' '}campaign with past guests.
              </p>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-slate-500">Total Leads</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{leads.length}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-slate-500">SMS Opt-in</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{leads.filter(l => l.tcpaConsent).length}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-slate-500">With Dates</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{leads.filter(l => l.preferredDates).length}</p>
                </div>
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search leads…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Contact</th>
                      <th className="px-4 py-3 font-medium">Preferred Dates</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium text-center">SMS</th>
                      <th className="px-4 py-3 font-medium text-right">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-10 text-slate-400">No leads match your search.</td></tr>
                    ) : filteredLeads.map(lead => (
                      <tr key={lead.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {[lead.firstName, lead.lastName].filter(Boolean).join(' ')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <a href={`mailto:${lead.email}`} className="hover:text-emerald-600 hover:underline">{lead.email}</a>
                            </div>
                            {lead.phone && (
                              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <Phone className="w-3 h-3 text-slate-400" />{lead.phone}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {lead.preferredDates ?? <span className="text-slate-300 italic">Not specified</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                            lead.source === 'direct_booking'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {lead.source === 'direct_booking' ? 'Book page' : 'Welcome'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {lead.tcpaConsent
                            ? <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs rounded-full px-2 py-0.5"><Check className="w-3 h-3" /> Yes</span>
                            : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-400">
                          {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Site Settings tab ── */}
      {tab === 'site' && (
        <div className="space-y-6">

          <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-1">Pricing</h2>
            <p className="text-xs text-slate-400 mb-4">Shown on the public booking page. Guests pay nightly rate × nights + cleaning fee + 3% if paying by card.</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Nightly Rate ($)</label>
                <input
                  type="number"
                  value={settings.directNightlyRate ?? ''}
                  onChange={e => setSettings({ ...settings, directNightlyRate: parseFloat(e.target.value) || undefined })}
                  onBlur={() => save(settings)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  placeholder="150"
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Cleaning Fee ($)</label>
                <input
                  type="number"
                  value={settings.guestCleaningFeePerBooking ?? ''}
                  onChange={e => setSettings({ ...settings, guestCleaningFeePerBooking: parseFloat(e.target.value) || 0 })}
                  onBlur={() => save(settings)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  placeholder="85"
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Minimum Nights</label>
                <input
                  type="number"
                  value={settings.directMinNights ?? 2}
                  onChange={e => setSettings({ ...settings, directMinNights: parseInt(e.target.value) || 2 })}
                  onBlur={() => save(settings)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  placeholder="2"
                  min="1"
                />
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-1">Property Description</h2>
            <p className="text-xs text-slate-400 mb-4">Shown on the booking page. Keep it short — guests already know the property.</p>
            <textarea
              value={settings.directDescription ?? ''}
              onChange={e => setSettings({ ...settings, directDescription: e.target.value || undefined })}
              onBlur={() => save(settings)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none"
              rows={3}
              placeholder="3BR / 2BA · sleeps 6 · private pool · 5 min from downtown"
            />
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-1">Calendar Sync</h2>
            <p className="text-xs text-slate-400 mb-4">
              Paste your Airbnb / VRBO iCal feed URLs. These are private URLs found in your listing&apos;s calendar settings.
              Blocked dates sync every 4 hours and are shown on the booking page.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Airbnb iCal URL</label>
                <input
                  type="url"
                  value={settings.airbnbIcalUrl ?? ''}
                  onChange={e => setSettings({ ...settings, airbnbIcalUrl: e.target.value || undefined })}
                  onBlur={() => save(settings)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs"
                  placeholder="https://www.airbnb.com/calendar/ical/12345.ics?s=…"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">VRBO iCal URL</label>
                <input
                  type="url"
                  value={settings.vrboIcalUrl ?? ''}
                  onChange={e => setSettings({ ...settings, vrboIcalUrl: e.target.value || undefined })}
                  onBlur={() => save(settings)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs"
                  placeholder="https://www.vrbo.com/icalendar/…"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={bustCalendarCache}
                  disabled={syncing || (!settings.airbnbIcalUrl && !settings.vrboIcalUrl)}
                  className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Test & Sync Now'}
                </button>
                {syncResult && <p className="text-xs text-slate-500">{syncResult}</p>}
              </div>
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
