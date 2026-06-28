'use client';
import { useEffect, useState } from 'react';
import { Booking, Platform, Settings } from '@/types';
import PlatformBadge from '@/components/PlatformBadge';
import { format } from 'date-fns';
import { Pencil, Trash2, Plus, X, Check } from 'lucide-react';

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking', label: 'Booking.com' },
  { value: 'vrbo', label: 'VRBO' },
  { value: 'direct', label: 'Direct' },
  { value: 'other', label: 'Other' },
];

interface EditState {
  id: string;
  income: string;
  notes: string;
}

interface NewBooking {
  platform: Platform;
  checkIn: string;
  checkOut: string;
  guestName: string;
  income: string;
  notes: string;
}

const emptyNew = (): NewBooking => ({
  platform: 'direct',
  checkIn: '',
  checkOut: '',
  guestName: '',
  income: '',
  notes: '',
});

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newBooking, setNewBooking] = useState<NewBooking>(emptyNew());
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  async function load() {
    const res = await fetch(`/api/bookings?year=${filterYear}`);
    setBookings(await res.json());
  }

  useEffect(() => {
    load();
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, [filterYear]);

  async function saveEdit(id: string) {
    if (!editState) return;
    await fetch(`/api/bookings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ income: parseFloat(editState.income) || 0, notes: editState.notes }),
    });
    setEditState(null);
    load();
  }

  async function deleteBooking(id: string) {
    if (!confirm('Delete this booking?')) return;
    await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
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

  const years = ['all', ...Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bookings</h1>
          <p className="text-slate-500 text-sm mt-1">{bookings.length} bookings {filterYear === 'all' ? 'across all years' : `in ${filterYear}`}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
          >
            {years.map(y => <option key={y} value={y}>{y === 'all' ? 'All Years' : y}</option>)}
          </select>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Booking
          </button>
        </div>
      </div>

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
              <label className="text-xs text-slate-500 block mb-1">Guest Name (optional)</label>
              <input
                type="text"
                value={newBooking.guestName}
                onChange={e => setNewBooking(p => ({ ...p, guestName: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                placeholder="Guest name"
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
              <Check className="w-4 h-4" /> Save
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 text-left">
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Guest</th>
              <th className="px-4 py-3 font-medium">Check-in</th>
              <th className="px-4 py-3 font-medium">Check-out</th>
              <th className="px-4 py-3 font-medium text-right">Nights</th>
              <th className="px-4 py-3 font-medium text-right">Income</th>
              <th className="px-4 py-3 font-medium text-right">Nightly</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400">
                  No bookings found. Import a CSV from your platform or add bookings manually.
                </td>
              </tr>
            ) : (
              bookings.map(b => (
                <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <PlatformBadge platform={b.platform} />
                  </td>
                  <td className="px-4 py-3 text-slate-700 max-w-[150px] truncate">
                    {b.guestName ?? b.confirmationCode ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {format(new Date(b.checkIn), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {format(new Date(b.checkOut), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{b.nights}</td>
                  <td className="px-4 py-3 text-right">
                    {editState?.id === b.id ? (
                      <input
                        type="number"
                        value={editState.income}
                        onChange={e => setEditState(s => s ? { ...s, income: e.target.value } : s)}
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
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {editState?.id === b.id ? (
                        <>
                          <button
                            onClick={() => saveEdit(b.id)}
                            className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditState(null)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditState({ id: b.id, income: String(b.income), notes: b.notes ?? '' })}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                            title="Edit income"
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
              ))
            )}
          </tbody>
          {bookings.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                <td colSpan={5} className="px-4 py-3 text-slate-700">Total</td>
                <td className="px-4 py-3 text-right text-emerald-700">
                  {fmt(bookings.reduce((s, b) => s + b.income, 0))}
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
