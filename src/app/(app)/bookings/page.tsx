'use client';
import { useEffect, useRef, useState } from 'react';
import { Booking, Platform, Settings } from '@/types';
import PlatformBadge from '@/components/PlatformBadge';
import { format } from 'date-fns';
import { Pencil, Trash2, Plus, X, Check, AlertTriangle, Download } from 'lucide-react';
import { RANGE_PRESETS, presetRange, inRange, type RangePreset } from '@/lib/dateRange';

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking', label: 'Booking.com' },
  { value: 'vrbo', label: 'VRBO' },
  { value: 'direct', label: 'Direct' },
  { value: 'other', label: 'Other' },
];

interface EditState {
  id: string;
  platform: Platform;
  checkIn: string;
  checkOut: string;
  income: string;
  guestName: string;
  email: string;
  phone: string;
  notes: string;
}

interface NewBooking {
  platform: Platform;
  checkIn: string;
  checkOut: string;
  guestName: string;
  email: string;
  phone: string;
  income: string;
  notes: string;
}

const emptyNew = (): NewBooking => ({
  platform: 'direct',
  checkIn: '',
  checkOut: '',
  guestName: '',
  email: '',
  phone: '',
  income: '',
  notes: '',
});

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const editStateRef = useRef(editState);
  editStateRef.current = editState;
  const [showAdd, setShowAdd] = useState(false);
  const [newBooking, setNewBooking] = useState<NewBooking>(emptyNew());
  // Always load the full set and narrow client-side, so switching range is
  // instant and the API's year-prefix filter stays untouched.
  const [preset, setPreset] = useState<RangePreset>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipBlurRef = useRef(false);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  const fmtDate = (dateStr: string | undefined) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T12:00:00');
    return isNaN(d.getTime()) ? '—' : format(d, 'MMM d, yyyy');
  };

  async function load() {
    try {
      const res = await fetch('/api/bookings?year=all');
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        setLoadError(`Server returned an unexpected response (HTTP ${res.status}). Check the browser console.`);
        setBookings([]);
        return;
      }
      if (!res.ok) {
        setLoadError(res.status === 401 ? 'Not signed in. Please refresh the page.' : `Failed to load bookings (${res.status}). Please try again.`);
        setBookings([]);
        return;
      }
      setLoadError(null);
      setBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError('Network error loading bookings. Please try again.');
      console.error('Bookings load error:', err);
    }
  }

  useEffect(() => {
    load();
    fetch('/api/settings').then(r => r.json()).then(setSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(id: Exclude<RangePreset, 'custom'>) {
    setPreset(id);
    setRange(presetRange(id));
  }

  function setBound(key: 'from' | 'to', value: string) {
    setPreset('custom');
    setRange(r => ({ ...r, [key]: value }));
  }

  function scheduleEditSave(id: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveEdit(id), 200);
  }
  function cancelEditSave() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
  }

  async function saveEdit(id: string) {
    const current = editStateRef.current;
    if (!current || current.id !== id) return;
    await fetch(`/api/bookings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: current.platform,
        checkIn: current.checkIn,
        checkOut: current.checkOut,
        nights: current.checkOut && current.checkIn
          ? Math.max(Math.round((new Date(current.checkOut).getTime() - new Date(current.checkIn).getTime()) / 86400000), 1)
          : undefined,
        income: parseFloat(current.income) || 0,
        guestName: current.guestName || undefined,
        email: current.email || undefined,
        phone: current.phone || undefined,
        notes: current.notes || undefined,
      }),
    });
    setEditState(null);
    load();
  }

  async function deleteBooking(id: string) {
    if (!confirm('Delete this booking?')) return;
    await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
    load();
  }

  async function clearAll() {
    if (!confirm(`Delete ALL ${bookings.length} bookings? This cannot be undone.`)) return;
    await fetch('/api/bookings?all=true', { method: 'DELETE' });
    load();
  }

  async function addBooking() {
    const checkIn = newBooking.checkIn;
    const checkOut = newBooking.checkOut;
    if (!checkIn || !checkOut) return;
    const nights = Math.max(
      Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000),
      1,
    );
    const body: Partial<Booking> = {
      id: `manual-${Date.now()}`,
      sourceId: 'manual',
      platform: newBooking.platform,
      uid: `manual-${Date.now()}`,
      summary: newBooking.guestName ? `Direct booking - ${newBooking.guestName}` : 'Direct booking',
      checkIn,
      checkOut,
      nights,
      guestName: newBooking.guestName || undefined,
      email: newBooking.email || undefined,
      phone: newBooking.phone || undefined,
      income: parseFloat(newBooking.income) || 0,
      notes: newBooking.notes || undefined,
      isManual: true,
    };
    await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setShowAdd(false);
    setNewBooking(emptyNew());
    load();
  }

  function exportContacts() {
    // Exports what's on screen, matching the count shown on the button
    const rows = visible
      .filter(b => b.email || b.phone)
      .map(b => {
        const name = b.guestName ?? b.bookerName ?? '';
        const checkIn = fmtDate(b.checkIn);
        const platform = b.platform;
        return [name, b.email ?? '', b.phone ?? '', checkIn, platform]
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(',');
      });
    if (rows.length === 0) {
      alert('No guests with email or phone on record yet.');
      return;
    }
    const csv = ['Name,Email,Phone,Check-in,Platform', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guest-contacts-${range.from || 'start'}_${range.to || 'end'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Filter on check-in, matching how the API's year/month params behave.
  const visible = bookings.filter(b => inRange(b.checkIn, range));

  const rangeLabel = preset === 'all'
    ? 'across all dates'
    : RANGE_PRESETS.find(p => p.id === preset)?.label.toLowerCase()
      ?? `${range.from || '…'} to ${range.to || '…'}`;

  const contactCount = visible.filter(b => b.email || b.phone).length;

  return (
    <div className="max-w-5xl mx-auto overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bookings</h1>
          <p className="text-slate-500 text-sm mt-1">
            {visible.length} of {bookings.length} bookings · {rangeLabel}
            {contactCount > 0 && (
              <span className="ml-2 text-slate-400">· {contactCount} with contact info</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {contactCount > 0 && (
            <button
              onClick={exportContacts}
              className="flex items-center gap-2 border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm hover:bg-slate-50 transition-colors"
              title={`Export ${contactCount} guest contact${contactCount !== 1 ? 's' : ''} as CSV`}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Contacts</span>
            </button>
          )}
          {bookings.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-2 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm hover:bg-red-50 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              <span className="hidden sm:inline">Clear All</span>
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Booking</span>
          </button>
        </div>
      </div>

      {/* Date range filter */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm mb-6 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGE_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                preset === p.id
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-emerald-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 lg:ml-auto">
          <input
            type="date"
            value={range.from}
            onChange={e => setBound('from', e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
            aria-label="From date"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={range.to}
            onChange={e => setBound('to', e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
            aria-label="To date"
          />
          {preset === 'custom' && (
            <button
              onClick={() => applyPreset('all')}
              className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              title="Clear date range"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {loadError}
        </div>
      )}

      {/* Add booking form */}
      {showAdd && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-4">New Booking</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Platform</label>
              <select
                value={newBooking.platform}
                onChange={e => setNewBooking(p => ({ ...p, platform: e.target.value as Platform }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
              >
                {PLATFORM_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Check-in</label>
              <input
                type="date"
                value={newBooking.checkIn}
                onChange={e => setNewBooking(p => ({ ...p, checkIn: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Check-out</label>
              <input
                type="date"
                value={newBooking.checkOut}
                onChange={e => setNewBooking(p => ({ ...p, checkOut: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Guest Name</label>
              <input
                type="text"
                value={newBooking.guestName}
                onChange={e => setNewBooking(p => ({ ...p, guestName: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                placeholder="Guest name"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Email</label>
              <input
                type="email"
                value={newBooking.email}
                onChange={e => setNewBooking(p => ({ ...p, email: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                placeholder="guest@example.com"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Phone</label>
              <input
                type="tel"
                value={newBooking.phone}
                onChange={e => setNewBooking(p => ({ ...p, phone: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                placeholder="+1 555 000 0000"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Total Income ($)</label>
              <input
                type="number"
                value={newBooking.income}
                onChange={e => setNewBooking(p => ({ ...p, income: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                placeholder="0.00"
                min="0"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Notes (optional)</label>
              <input
                type="text"
                value={newBooking.notes}
                onChange={e => setNewBooking(p => ({ ...p, notes: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                placeholder="Optional notes"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={addBooking}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700"
            >
              <Check className="w-4 h-4" /> Add Booking
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewBooking(emptyNew()); }}
              className="flex items-center gap-2 border border-slate-200 px-4 py-2 rounded-lg text-sm hover:bg-slate-50"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 text-left">
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Guest</th>
              <th className="px-4 py-3 font-medium">Check-in</th>
              <th className="px-4 py-3 font-medium">Check-out</th>
              <th className="px-4 py-3 font-medium text-right">Nights</th>
              <th className="px-4 py-3 font-medium text-right">Income</th>
              <th className="px-4 py-3 font-medium text-right">Nightly</th>
              <th className="sticky right-0 bg-slate-50 px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400">
                  {bookings.length === 0 ? (
                    'No bookings found. Import a CSV from your platform or add bookings manually.'
                  ) : (
                    <>
                      No bookings in this date range.{' '}
                      <button onClick={() => applyPreset('all')} className="text-emerald-600 underline">
                        Show all {bookings.length}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              visible.map(b => {
                const isEditing = editState?.id === b.id;
                const displayName = b.guestName ?? b.bookerName ?? b.confirmationCode ?? '—';
                const hasContact = !!(b.email || b.phone);
                return (
                  <>
                    <tr key={b.id} className={`border-b ${isEditing ? 'border-slate-200 bg-slate-50' : 'border-slate-50 hover:bg-slate-50'}`}>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editState.platform}
                            onChange={e => setEditState(s => s ? { ...s, platform: e.target.value as Platform } : s)}
                            onBlur={() => scheduleEditSave(b.id)}
                            onFocus={cancelEditSave}
                            className="text-sm border border-emerald-300 rounded px-2 py-1 bg-white"
                          >
                            {PLATFORM_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <PlatformBadge platform={b.platform} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-[160px]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editState.guestName}
                            onChange={e => setEditState(s => s ? { ...s, guestName: e.target.value } : s)}
                            onBlur={() => scheduleEditSave(b.id)}
                            onFocus={cancelEditSave}
                            className="w-full border border-emerald-300 rounded px-2 py-1 text-sm"
                            placeholder="Guest name"
                          />
                        ) : (
                          <div className="truncate">
                            <span className="block truncate">{displayName}</span>
                            {hasContact && (
                              <span className="block text-xs text-slate-400 truncate">
                                {b.email ?? b.phone}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editState.checkIn}
                            onChange={e => setEditState(s => s ? { ...s, checkIn: e.target.value } : s)}
                            onBlur={() => scheduleEditSave(b.id)}
                            onFocus={cancelEditSave}
                            className="border border-emerald-300 rounded px-2 py-1 text-sm"
                          />
                        ) : (
                          fmtDate(b.checkIn)
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editState.checkOut}
                            onChange={e => setEditState(s => s ? { ...s, checkOut: e.target.value } : s)}
                            onBlur={() => scheduleEditSave(b.id)}
                            onFocus={cancelEditSave}
                            className="border border-emerald-300 rounded px-2 py-1 text-sm"
                          />
                        ) : (
                          fmtDate(b.checkOut)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{b.nights}</td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editState.income}
                            onChange={e => setEditState(s => s ? { ...s, income: e.target.value } : s)}
                            onBlur={() => scheduleEditSave(b.id)}
                            onFocus={cancelEditSave}
                            className="w-24 text-right border border-emerald-300 rounded px-2 py-1 text-sm"
                            min="0"
                          />
                        ) : (
                          <span className={`font-semibold ${b.income > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {fmt(b.income)}
                            {b.isManual && <span className="ml-1 text-xs text-slate-400">(manual)</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 text-xs">
                        {b.nights > 0 && b.income > 0 ? fmt(b.income / b.nights) : '—'}
                      </td>
                      <td className="sticky right-0 bg-white px-4 py-3 text-right border-l border-slate-100">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <button
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { cancelEditSave(); saveEdit(b.id); }}
                                className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"
                                title="Save changes"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { cancelEditSave(); setEditState(null); }}
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                                title="Discard changes"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  cancelEditSave();
                                  setEditState({
                                    id: b.id,
                                    platform: b.platform,
                                    checkIn: b.checkIn,
                                    checkOut: /^\d{4}-\d{2}-\d{2}$/.test(b.checkOut ?? '') ? b.checkOut! : '',
                                    income: String(b.income),
                                    guestName: b.guestName ?? b.bookerName ?? '',
                                    email: b.email ?? '',
                                    phone: b.phone ?? '',
                                    notes: b.notes ?? '',
                                  });
                                }}
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                                title="Edit booking"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteBooking(b.id)}
                                className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Contact edit row — visible only when editing */}
                    {isEditing && (
                      <tr key={`${b.id}-contact`} className="border-b border-slate-200 bg-slate-50">
                        <td colSpan={8} className="px-4 pb-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">Email</label>
                              <input
                                type="email"
                                value={editState.email}
                                onChange={e => setEditState(s => s ? { ...s, email: e.target.value } : s)}
                                onBlur={() => scheduleEditSave(b.id)}
                                onFocus={cancelEditSave}
                                className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                                placeholder="guest@example.com"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">Phone</label>
                              <input
                                type="tel"
                                value={editState.phone}
                                onChange={e => setEditState(s => s ? { ...s, phone: e.target.value } : s)}
                                onBlur={() => scheduleEditSave(b.id)}
                                onFocus={cancelEditSave}
                                className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                                placeholder="+1 555 000 0000"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">Notes</label>
                              <input
                                type="text"
                                value={editState.notes}
                                onChange={e => setEditState(s => s ? { ...s, notes: e.target.value } : s)}
                                onBlur={() => scheduleEditSave(b.id)}
                                onFocus={cancelEditSave}
                                className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                                placeholder="Optional notes"
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
          {visible.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                <td colSpan={5} className="px-4 py-3 text-slate-700">
                  Total
                  <span className="ml-2 font-normal text-xs text-slate-400">{rangeLabel}</span>
                </td>
                <td className="px-4 py-3 text-right text-emerald-700">
                  {fmt(visible.reduce((s, b) => s + b.income, 0))}
                </td>
                <td colSpan={2} className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
