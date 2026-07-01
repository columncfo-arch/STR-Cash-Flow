'use client';
import { useEffect, useMemo, useState } from 'react';
import { Booking, DirectLead, Platform, Settings } from '@/types';
import PlatformBadge from '@/components/PlatformBadge';
import { format } from 'date-fns';
import { Users, ChevronDown, ChevronRight, Pencil, Check, X, Search, Download, Mail, Phone } from 'lucide-react';

// ── Guest aggregation ─────────────────────────────────────────────────────────

interface GuestRecord {
  key: string;
  name: string;
  email: string;
  phone: string;
  platforms: Platform[];
  bookings: Booking[];
  totalNights: number;
  totalRevenue: number;
  firstStay: string;
  lastStay: string;
}

function guestKey(b: Booking): string {
  const name = (b.guestName ?? b.bookerName ?? '').trim().toLowerCase();
  return name || b.confirmationCode?.toLowerCase() || b.id;
}

function displayName(b: Booking): string {
  return b.guestName ?? b.bookerName ?? b.confirmationCode ?? 'Unknown Guest';
}

function buildGuestRoster(bookings: Booking[]): GuestRecord[] {
  const map = new Map<string, GuestRecord>();
  for (const b of bookings) {
    const key = guestKey(b);
    const name = displayName(b);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        name,
        email: b.email ?? '',
        phone: b.phone ?? '',
        platforms: [b.platform],
        bookings: [b],
        totalNights: b.nights,
        totalRevenue: b.income,
        firstStay: b.checkIn,
        lastStay: b.checkIn,
      });
    } else {
      if (!existing.email && b.email) existing.email = b.email;
      if (!existing.phone && b.phone) existing.phone = b.phone;
      if (!existing.platforms.includes(b.platform)) existing.platforms.push(b.platform);
      existing.bookings.push(b);
      existing.totalNights += b.nights;
      existing.totalRevenue += b.income;
      if (b.checkIn < existing.firstStay) existing.firstStay = b.checkIn;
      if (b.checkIn > existing.lastStay) existing.lastStay = b.checkIn;
    }
  }
  return [...map.values()].sort((a, b) => b.lastStay.localeCompare(a.lastStay));
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ContactEditState {
  key: string;
  email: string;
  phone: string;
  notes: string;
}

type Tab = 'guests' | 'leads';

export default function GuestsPage() {
  const [tab, setTab] = useState<Tab>('guests');
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [leads, setLeads] = useState<DirectLead[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editContact, setEditContact] = useState<ContactEditState | null>(null);
  const [search, setSearch] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  async function load() {
    const [bookingsRes, settingsRes, leadsRes] = await Promise.all([
      fetch('/api/bookings?year=all'),
      fetch('/api/settings'),
      fetch('/api/direct-booking'),
    ]);
    const bookings = await bookingsRes.json();
    const s = await settingsRes.json();
    const l = await leadsRes.json();
    setAllBookings(Array.isArray(bookings) ? bookings : []);
    setSettings(s);
    setLeads(Array.isArray(l) ? l : []);
  }

  useEffect(() => { load(); }, []);

  const roster = useMemo(() => buildGuestRoster(allBookings), [allBookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(g =>
      g.name.toLowerCase().includes(q) ||
      g.email.toLowerCase().includes(q) ||
      g.phone.includes(q)
    );
  }, [roster, search]);

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function saveContact(guest: GuestRecord) {
    if (!editContact) return;
    setSaving(true);
    await Promise.all(
      guest.bookings.map(b =>
        fetch(`/api/bookings/${b.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: editContact.email || undefined,
            phone: editContact.phone || undefined,
            notes: editContact.notes || undefined,
          }),
        })
      )
    );
    setSaving(false);
    setEditContact(null);
    load();
  }

  function exportContacts() {
    const rows = roster
      .filter(g => g.email || g.phone)
      .map(g => {
        const lastCheckIn = format(new Date(g.lastStay + 'T12:00:00'), 'yyyy-MM-dd');
        return [g.name, g.email, g.phone, String(g.bookings.length), lastCheckIn, g.platforms[0]]
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(',');
      });
    if (rows.length === 0) { alert('No guests with contact info yet.'); return; }
    const csv = ['Name,Email,Phone,Stays,Last Stay,Platform', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guest-contacts.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportLeads() {
    if (leads.length === 0) { alert('No leads yet.'); return; }
    const rows = leads.map(l => [
      `${l.firstName} ${l.lastName}`.trim(),
      l.email,
      l.phone ?? '',
      l.preferredDates ?? '',
      l.tcpaConsent ? 'Yes' : 'No',
      format(new Date(l.createdAt), 'yyyy-MM-dd'),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = ['Name,Email,Phone,Preferred Dates,TCPA Consent,Submitted', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'direct-booking-leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(l =>
      `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q) ||
      (l.phone ?? '').includes(q)
    );
  }, [leads, leadSearch]);

  const withContact = roster.filter(g => g.email || g.phone).length;
  const repeatGuests = roster.filter(g => g.bookings.length > 1).length;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            Guests
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {roster.length} unique guests · {repeatGuests} repeat · {leads.length} direct booking {leads.length === 1 ? 'lead' : 'leads'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tab === 'guests' && withContact > 0 && (
            <button
              onClick={exportContacts}
              className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              <Download className="w-4 h-4" /> Export Contacts
            </button>
          )}
          {tab === 'leads' && leads.length > 0 && (
            <button
              onClick={exportLeads}
              className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              <Download className="w-4 h-4" /> Export Leads
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('guests')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'guests' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Guest Roster
        </button>
        <button
          onClick={() => setTab('leads')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === 'leads' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Direct Booking Leads
          {leads.length > 0 && (
            <span className="bg-emerald-100 text-emerald-700 text-xs rounded-full px-2 py-0.5 font-semibold">
              {leads.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Direct Booking Leads tab ─────────────────────────────────────── */}
      {tab === 'leads' && (
        <div>
          {leads.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
              <Mail className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">No direct booking leads yet</p>
              <p className="text-slate-400 text-xs mt-1">
                Share your{' '}
                <a href="/book-direct" target="_blank" className="text-emerald-600 underline">/book-direct</a>
                {' '}page with past guests to start collecting leads.
              </p>
            </div>
          ) : (
            <>
              {/* Lead KPIs */}
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-slate-500">Total Leads</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{leads.length}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-slate-500">TCPA Consent</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    {leads.filter(l => l.tcpaConsent).length}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">opted in for SMS</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-slate-500">With Dates</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {leads.filter(l => l.preferredDates).length}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">specified trip dates</p>
                </div>
              </div>

              {/* Lead search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={leadSearch}
                  onChange={e => setLeadSearch(e.target.value)}
                  placeholder="Search leads by name, email, or phone…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Leads table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Contact</th>
                      <th className="px-4 py-3 font-medium">Preferred Dates</th>
                      <th className="px-4 py-3 font-medium text-center">SMS Opt-in</th>
                      <th className="px-4 py-3 font-medium text-right">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-10 text-slate-400">
                          No leads match your search.
                        </td>
                      </tr>
                    ) : filteredLeads.map(lead => (
                      <tr key={lead.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {[lead.firstName, lead.lastName].filter(Boolean).join(' ')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <a href={`mailto:${lead.email}`} className="hover:text-emerald-600 hover:underline">
                                {lead.email}
                              </a>
                            </div>
                            {lead.phone && (
                              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {lead.phone}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {lead.preferredDates ?? <span className="text-slate-300 italic">Not specified</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {lead.tcpaConsent ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs rounded-full px-2 py-0.5 font-medium">
                              <Check className="w-3 h-3" /> Yes
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
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

      {/* ── Guest Roster tab ──────────────────────────────────────────────── */}
      {tab === 'guests' && <>

      {/* KPI chips */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Guests</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{roster.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Repeat Guests</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{repeatGuests}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {roster.length > 0 ? ((repeatGuests / roster.length) * 100).toFixed(0) : 0}% of all guests
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Revenue per Guest</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {roster.length > 0
              ? fmt(roster.reduce((s, g) => s + g.totalRevenue, 0) / roster.length)
              : '—'}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone…"
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      {/* Guest roster table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
              <th className="px-4 py-3 font-medium w-8" />
              <th className="px-4 py-3 font-medium">Guest</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium text-right">Stays</th>
              <th className="px-4 py-3 font-medium text-right">Nights</th>
              <th className="px-4 py-3 font-medium text-right">Total Revenue</th>
              <th className="px-4 py-3 font-medium text-right">Last Stay</th>
              <th className="px-4 py-3 font-medium w-16" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400">
                  {search ? 'No guests match your search.' : 'No booking data yet. Import earnings to populate the guest roster.'}
                </td>
              </tr>
            )}
            {filtered.map(guest => {
              const isOpen = expanded.has(guest.key);
              const isEditingContact = editContact?.key === guest.key;
              const isRepeat = guest.bookings.length > 1;

              return (
                <>
                  {/* Guest summary row */}
                  <tr
                    key={guest.key}
                    className={`border-b ${isOpen ? 'border-slate-200 bg-slate-50/60' : 'border-slate-50 hover:bg-slate-50'} cursor-pointer`}
                    onClick={() => !isEditingContact && toggleExpand(guest.key)}
                  >
                    <td className="px-4 py-3">
                      {isOpen
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{guest.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {guest.platforms.map(p => (
                          <PlatformBadge key={p} platform={p} />
                        ))}
                        {isRepeat && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-medium">
                            Repeat
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {guest.email || guest.phone ? (
                        <div className="text-xs text-slate-500 space-y-0.5">
                          {guest.email && <div className="truncate max-w-[160px]">{guest.email}</div>}
                          {guest.phone && <div>{guest.phone}</div>}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 italic">No contact info</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{guest.bookings.length}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{guest.totalNights}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(guest.totalRevenue)}</td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">
                      {format(new Date(guest.lastStay + 'T12:00:00'), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {isEditingContact ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => saveContact(guest)}
                            disabled={saving}
                            className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditContact(null)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditContact({ key: guest.key, email: guest.email, phone: guest.phone, notes: guest.bookings[0]?.notes ?? '' });
                            if (!isOpen) toggleExpand(guest.key);
                          }}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                          title="Edit contact info"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Contact edit row */}
                  {isEditingContact && (
                    <tr key={`${guest.key}-edit`} className="border-b border-slate-200 bg-emerald-50/40">
                      <td />
                      <td colSpan={7} className="px-4 pb-3 pt-1">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs text-slate-500 block mb-1">Email</label>
                            <input
                              type="email"
                              value={editContact.email}
                              onChange={e => setEditContact(s => s ? { ...s, email: e.target.value } : s)}
                              className="w-full text-sm border border-emerald-300 rounded-lg px-3 py-1.5"
                              placeholder="guest@example.com"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 block mb-1">Phone</label>
                            <input
                              type="tel"
                              value={editContact.phone}
                              onChange={e => setEditContact(s => s ? { ...s, phone: e.target.value } : s)}
                              className="w-full text-sm border border-emerald-300 rounded-lg px-3 py-1.5"
                              placeholder="+1 555 000 0000"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 block mb-1">Notes</label>
                            <input
                              type="text"
                              value={editContact.notes}
                              onChange={e => setEditContact(s => s ? { ...s, notes: e.target.value } : s)}
                              className="w-full text-sm border border-emerald-300 rounded-lg px-3 py-1.5"
                              placeholder="Any notes about this guest"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                          Contact info is applied to all {guest.bookings.length} booking{guest.bookings.length !== 1 ? 's' : ''} for this guest.
                        </p>
                      </td>
                    </tr>
                  )}

                  {/* Booking ledger — expanded */}
                  {isOpen && (
                    <tr key={`${guest.key}-ledger`} className="border-b border-slate-200">
                      <td colSpan={8} className="px-0 pb-0">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-500">
                              <th className="pl-12 pr-4 py-2 font-medium text-left">Check-in</th>
                              <th className="px-4 py-2 font-medium text-left">Check-out</th>
                              <th className="px-4 py-2 font-medium text-left">Platform</th>
                              <th className="px-4 py-2 font-medium text-left">Confirmation</th>
                              <th className="px-4 py-2 font-medium text-right">Nights</th>
                              <th className="px-4 py-2 font-medium text-right">Revenue</th>
                              <th className="px-4 py-2 font-medium text-right">Nightly</th>
                              <th className="px-4 py-2 font-medium text-left">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...guest.bookings]
                              .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
                              .map(b => (
                                <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50">
                                  <td className="pl-12 pr-4 py-2 text-slate-600">
                                    {format(new Date(b.checkIn + 'T12:00:00'), 'MMM d, yyyy')}
                                  </td>
                                  <td className="px-4 py-2 text-slate-600">
                                    {format(new Date(b.checkOut + 'T12:00:00'), 'MMM d, yyyy')}
                                  </td>
                                  <td className="px-4 py-2">
                                    <PlatformBadge platform={b.platform} />
                                  </td>
                                  <td className="px-4 py-2 text-slate-400 font-mono">
                                    {b.confirmationCode ?? b.referenceCode ?? '—'}
                                  </td>
                                  <td className="px-4 py-2 text-right text-slate-600">{b.nights}</td>
                                  <td className="px-4 py-2 text-right font-semibold text-slate-800">
                                    {b.income > 0 ? fmt(b.income) : <span className="text-slate-300">$0</span>}
                                  </td>
                                  <td className="px-4 py-2 text-right text-slate-400">
                                    {b.nights > 0 && b.income > 0 ? fmt(b.income / b.nights) : '—'}
                                  </td>
                                  <td className="px-4 py-2 text-slate-400 max-w-[140px] truncate">
                                    {b.notes ?? '—'}
                                  </td>
                                </tr>
                              ))}
                            {/* Ledger totals */}
                            {guest.bookings.length > 1 && (
                              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-700">
                                <td className="pl-12 pr-4 py-2" colSpan={4}>Total</td>
                                <td className="px-4 py-2 text-right">{guest.totalNights}</td>
                                <td className="px-4 py-2 text-right text-emerald-700">{fmt(guest.totalRevenue)}</td>
                                <td className="px-4 py-2 text-right text-slate-400 font-normal">
                                  {guest.totalNights > 0 ? fmt(guest.totalRevenue / guest.totalNights) : '—'}/night avg
                                </td>
                                <td />
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      </>}
    </div>
  );
}
