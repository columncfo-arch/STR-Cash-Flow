'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Booking, Platform, Settings } from '@/types';
import PlatformBadge from '@/components/PlatformBadge';
import { format } from 'date-fns';
import {
  ArrowLeft, Mail, Phone, FileText, Check, Pencil, X,
  CalendarDays, Hash, DollarSign, Star, ShieldCheck,
} from 'lucide-react';

// ─── shared guest-key logic (must match roster page) ─────────────────────────
function guestKey(b: Booking): string {
  const name = (b.guestName ?? b.bookerName ?? '').trim().toLowerCase();
  return name || b.confirmationCode?.toLowerCase() || b.id;
}

function displayName(b: Booking): string {
  return b.guestName ?? b.bookerName ?? b.confirmationCode ?? 'Unknown Guest';
}

interface GuestRecord {
  key: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  platforms: Platform[];
  bookings: Booking[];
  totalNights: number;
  totalRevenue: number;
  totalPlatformFees: number;
  totalNetPayout: number;
  firstStay: string;
  lastStay: string;
  tcpaConsent: boolean;
}

function buildRecord(bookings: Booking[], targetKey: string): GuestRecord | null {
  const mine = bookings.filter(b => guestKey(b) === targetKey);
  if (mine.length === 0) return null;

  const name = displayName(mine[0]);
  let email = '';
  let phone = '';
  let notes = '';
  let tcpaConsent = false;
  const platforms: Platform[] = [];
  let totalNights = 0;
  let totalRevenue = 0;
  let totalPlatformFees = 0;
  let totalNetPayout = 0;
  let firstStay = mine[0].checkIn;
  let lastStay = mine[0].checkIn;

  for (const b of mine) {
    if (!email && b.email) email = b.email;
    if (!phone && b.phone) phone = b.phone;
    if (!notes && b.notes) notes = b.notes;
    if (!tcpaConsent && b.notes?.includes('TCPA consent: yes')) tcpaConsent = true;
    if (!platforms.includes(b.platform)) platforms.push(b.platform);
    totalNights += b.nights;
    totalRevenue += b.income;
    totalPlatformFees += b.platformFee ?? 0;
    totalNetPayout += b.paidOut ?? 0;
    if (b.checkIn < firstStay) firstStay = b.checkIn;
    if (b.checkIn > lastStay) lastStay = b.checkIn;
  }

  return {
    key: targetKey, name, email, phone, notes, platforms,
    bookings: [...mine].sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    totalNights, totalRevenue, totalPlatformFees, totalNetPayout,
    firstStay, lastStay, tcpaConsent,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GuestDetailPage() {
  const { guestKey: encodedKey } = useParams<{ guestKey: string }>();
  const targetKey = decodeURIComponent(encodedKey);
  const router = useRouter();

  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: settings?.currency ?? 'USD', maximumFractionDigits: 0 }).format(n);

  async function load() {
    const [b, s] = await Promise.all([
      fetch('/api/bookings?year=all').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]);
    setAllBookings(Array.isArray(b) ? b : []);
    setSettings(s);
  }

  useEffect(() => { load(); }, []);

  const guest = useMemo(
    () => buildRecord(allBookings, targetKey),
    [allBookings, targetKey],
  );

  function startEdit() {
    if (!guest) return;
    setEditEmail(guest.email);
    setEditPhone(guest.phone);
    setEditNotes(guest.notes);
    setEditMode(true);
  }

  async function saveContact() {
    if (!guest) return;
    setSaving(true);
    try {
      await Promise.all(
        guest.bookings.map(b =>
          fetch(`/api/bookings/${b.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: editEmail || undefined,
              phone: editPhone || undefined,
              notes: editNotes || undefined,
            }),
          })
        )
      );
      await load();
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  }

  if (!settings || allBookings.length === 0) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!guest) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-slate-400">
        Guest not found.{' '}
        <button onClick={() => router.back()} className="text-emerald-600 hover:underline">Go back</button>
      </div>
    );
  }

  const avgNightly = guest.totalNights > 0 ? guest.totalRevenue / guest.totalNights : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Back nav */}
      <button
        onClick={() => router.push('/guest-list/guests')}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Guest Roster
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{guest.name}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {guest.platforms.map(p => <PlatformBadge key={p} platform={p} />)}
              {guest.bookings.length > 1 && (
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  <Star className="w-3 h-3" /> Repeat guest
                </span>
              )}
              {guest.tcpaConsent && (
                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" /> Marketing consent
                </span>
              )}
            </div>
          </div>
          {!editMode && (
            <button
              onClick={startEdit}
              className="flex items-center gap-2 text-sm border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors flex-shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit contact
            </button>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-100">
          {[
            { label: 'Stays', value: String(guest.bookings.length) },
            { label: 'Nights', value: String(guest.totalNights) },
            { label: 'Total Revenue', value: fmt(guest.totalRevenue) },
            { label: 'Avg Nightly', value: avgNightly > 0 ? fmt(avgNightly) : '—' },
            { label: 'First Stay', value: format(new Date(guest.firstStay + 'T12:00:00'), 'MMM d, yyyy') },
            { label: 'Last Stay', value: format(new Date(guest.lastStay + 'T12:00:00'), 'MMM d, yyyy') },
          ].map(s => (
            <div key={s.label}>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">{s.label}</p>
              <p className="text-base font-bold text-slate-900 mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contact info */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Contact Info</h2>
          {editMode && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditMode(false)}
                className="text-sm text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                onClick={saveContact}
                disabled={saving}
                className="flex items-center gap-1.5 bg-emerald-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {editMode ? (
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Email</label>
              <input
                type="email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                autoFocus
                className="w-full text-sm border border-emerald-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="guest@example.com"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Phone</label>
              <input
                type="tel"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                className="w-full text-sm border border-emerald-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="+1 555 000 0000"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Notes</label>
              <input
                type="text"
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                className="w-full text-sm border border-emerald-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Any notes…"
              />
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-slate-300 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Email</p>
                {guest.email
                  ? <a href={`mailto:${guest.email}`} className="text-sm text-emerald-600 hover:underline">{guest.email}</a>
                  : <span className="text-sm text-slate-300 italic">Not collected</span>}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-slate-300 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Phone</p>
                {guest.phone
                  ? <a href={`tel:${guest.phone}`} className="text-sm text-slate-700">{guest.phone}</a>
                  : <span className="text-sm text-slate-300 italic">Not collected</span>}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 text-slate-300 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Notes</p>
                {guest.notes
                  ? <p className="text-sm text-slate-700 leading-relaxed">{guest.notes}</p>
                  : <span className="text-sm text-slate-300 italic">None</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Booking ledger */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Booking History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 text-left">
                <th className="px-4 py-3 font-medium">Check-in</th>
                <th className="px-4 py-3 font-medium">Check-out</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">
                  <span className="flex items-center gap-1"><Hash className="w-3 h-3" />Confirmation</span>
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  <span className="flex items-center gap-1 justify-end"><CalendarDays className="w-3 h-3" />Nights</span>
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  <span className="flex items-center gap-1 justify-end"><DollarSign className="w-3 h-3" />Gross</span>
                </th>
                <th className="px-4 py-3 font-medium text-right">Platform Fee</th>
                <th className="px-4 py-3 font-medium text-right">Net Payout</th>
                <th className="px-4 py-3 font-medium text-right">Nightly</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {guest.bookings.map((b, i) => {
                const nightly = b.nights > 0 && b.income > 0 ? b.income / b.nights : 0;
                const isCancelled = !!b.cancellationDate || b.status?.toLowerCase().includes('cancel');
                return (
                  <tr key={b.id} className={`border-b border-slate-50 hover:bg-slate-50 ${isCancelled ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                      {format(new Date(b.checkIn + 'T12:00:00'), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {format(new Date(b.checkOut + 'T12:00:00'), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3"><PlatformBadge platform={b.platform} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {b.confirmationCode ?? b.referenceCode ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{b.nights}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {b.income > 0 ? fmt(b.income) : <span className="text-slate-300">$0</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {b.platformFee ? fmt(b.platformFee) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700">
                      {b.paidOut ? fmt(b.paidOut) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400 text-xs">
                      {nightly > 0 ? fmt(nightly) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {isCancelled
                        ? <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">Cancelled</span>
                        : <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Completed</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px]">
                      <span className="line-clamp-2">{b.notes ?? '—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {guest.bookings.length > 1 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-700">
                  <td className="px-4 py-3" colSpan={4}>Total</td>
                  <td className="px-4 py-3 text-right">{guest.totalNights}</td>
                  <td className="px-4 py-3 text-right text-slate-800">{fmt(guest.totalRevenue)}</td>
                  <td className="px-4 py-3 text-right text-slate-500 font-normal">
                    {guest.totalPlatformFees > 0 ? fmt(guest.totalPlatformFees) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-700">
                    {guest.totalNetPayout > 0 ? fmt(guest.totalNetPayout) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 font-normal text-xs">
                    {guest.totalNights > 0 ? fmt(guest.totalRevenue / guest.totalNights) : '—'}/night
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Booking.com / VRBO extra fields if present */}
      {guest.bookings.some(b => b.bookerCountry || b.travelPurpose || b.adults) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Platform Details</h2>
          <div className="space-y-4">
            {guest.bookings.filter(b => b.bookerCountry || b.travelPurpose || b.adults).map(b => (
              <div key={b.id} className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <PlatformBadge platform={b.platform} />
                  <span className="text-xs text-slate-400">{format(new Date(b.checkIn + 'T12:00:00'), 'MMM d, yyyy')}</span>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {b.bookerCountry && (
                    <div><dt className="text-xs text-slate-400">Country</dt><dd className="font-medium text-slate-700 mt-0.5">{b.bookerCountry}</dd></div>
                  )}
                  {b.travelPurpose && (
                    <div><dt className="text-xs text-slate-400">Purpose</dt><dd className="font-medium text-slate-700 mt-0.5">{b.travelPurpose}</dd></div>
                  )}
                  {b.adults != null && (
                    <div><dt className="text-xs text-slate-400">Adults</dt><dd className="font-medium text-slate-700 mt-0.5">{b.adults}</dd></div>
                  )}
                  {b.children != null && b.children > 0 && (
                    <div><dt className="text-xs text-slate-400">Children</dt><dd className="font-medium text-slate-700 mt-0.5">{b.children}{b.childrenAges ? ` (${b.childrenAges})` : ''}</dd></div>
                  )}
                  {b.device && (
                    <div><dt className="text-xs text-slate-400">Booked via</dt><dd className="font-medium text-slate-700 mt-0.5">{b.device}</dd></div>
                  )}
                  {b.paymentMethod && (
                    <div><dt className="text-xs text-slate-400">Payment</dt><dd className="font-medium text-slate-700 mt-0.5">{b.paymentMethod}</dd></div>
                  )}
                  {b.paymentStatus && (
                    <div><dt className="text-xs text-slate-400">Payment Status</dt><dd className="font-medium text-slate-700 mt-0.5">{b.paymentStatus}</dd></div>
                  )}
                  {b.bookingDate && (
                    <div><dt className="text-xs text-slate-400">Booked On</dt><dd className="font-medium text-slate-700 mt-0.5">{format(new Date(b.bookingDate + 'T12:00:00'), 'MMM d, yyyy')}</dd></div>
                  )}
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
