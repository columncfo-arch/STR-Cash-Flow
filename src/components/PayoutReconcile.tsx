'use client';
import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle, FileSearch, Loader2, Trash2, TriangleAlert, Upload } from 'lucide-react';
import type { Platform } from '@/types';

interface ReportStay {
  id: string;
  checkIn: string;
  checkOut: string;
  guestName?: string;
  income: number;
  nights?: number;
  confirmationCode?: string;
}

interface ReportPayout {
  confirmationCode: string;
  checkIn: string;
  guestName?: string;
  grossEarnings: number;
  payoutDate?: string;
}

interface Report {
  span: { from: string; to: string } | null;
  matched: number;
  unpaid: ReportStay[];
  missing: ReportPayout[];
  mismatched: { booking: ReportStay; payout: ReportPayout; difference: number }[];
  unpaidIncome: number;
  missingIncome: number;
  payoutsRead: number;
  files: number;
}

const EXPORTS: { value: Platform; label: string; where: string }[] = [
  {
    value: 'airbnb',
    label: 'Airbnb',
    where: 'Airbnb → Menu → Earnings. Export CSV from both Paid and Upcoming, and upload the two together.',
  },
  { value: 'vrbo', label: 'VRBO', where: 'VRBO → Dashboard → Revenue → Reservations → Export CSV.' },
  { value: 'booking', label: 'Booking.com', where: 'Extranet → Finance → Transactions → Export.' },
];

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

/** `2026-11-09` → `Nov 9`, sliced rather than parsed so no timezone shifts it. */
const day = (iso: string) => {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
};

const year = (iso: string) => iso.slice(0, 4);

/**
 * Checking the books against the money the channel actually moved.
 *
 * The three findings are deliberately kept apart rather than totalled into a
 * single health score: they mean different things, they point in opposite
 * directions on the income statement, and only one of them is safe to act on
 * in bulk.
 */
export default function PayoutReconcile() {
  const [platform, setPlatform] = useState<Platform>('airbnb');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(files: FileList) {
    setError('');
    setReport(null);
    setRemoved(new Set());
    setLoading(true);
    try {
      const body = new FormData();
      body.append('platform', platform);
      for (const f of Array.from(files)) body.append('file', f);
      const res = await fetch('/api/reconcile', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not read that export.');
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that export.');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete that booking.');
      setRemoved(prev => new Set(prev).add(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that booking.');
    } finally {
      setRemoving('');
    }
  }

  const chosen = EXPORTS.find(e => e.value === platform)!;
  const stillUnpaid = report?.unpaid.filter(b => !removed.has(b.id)) ?? [];
  const clean = report && report.unpaid.length === 0
    && report.missing.length === 0 && report.mismatched.length === 0;

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap gap-2 mb-4">
          {EXPORTS.map(e => (
            <button
              key={e.value}
              onClick={() => { setPlatform(e.value); setReport(null); setError(''); }}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                platform === e.value
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        <p className="text-sm text-slate-600 leading-relaxed mb-4">{chosen.where}</p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={ev => ev.target.files?.length && run(ev.target.files)}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Reading…</>
            : <><Upload className="w-4 h-4" /> Choose export{platform === 'airbnb' ? 's' : ''}</>}
        </button>

        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          Nothing is changed by this. It reads the export, compares it with your books, and
          reports what the two disagree about.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 border border-red-200 bg-red-50 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {report && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <FileSearch className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-600 leading-relaxed">
                Read {report.payoutsRead} reservation{report.payoutsRead !== 1 ? 's' : ''} from{' '}
                {report.files} file{report.files !== 1 ? 's' : ''}, covering{' '}
                {report.span
                  ? <>{day(report.span.from)} {year(report.span.from)} to {day(report.span.to)} {year(report.span.to)}</>
                  : 'no dates'}
                . {report.matched} matched your books.
              </p>
            </div>
          </div>

          {clean && (
            <div className="flex items-start gap-3 border border-emerald-200 bg-emerald-50 rounded-xl p-4">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-800 leading-relaxed">
                Every stay in your books over those dates has a payout behind it, for the
                money your books record. Nothing to fix.
              </p>
            </div>
          )}

          {stillUnpaid.length > 0 && (
            <section className="bg-white border border-red-200 rounded-xl overflow-hidden">
              <header className="px-5 py-4 bg-red-50 border-b border-red-200">
                <h2 className="text-sm font-semibold text-red-900">
                  {stillUnpaid.length} stay{stillUnpaid.length !== 1 ? 's' : ''} nobody is paying for
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  In your books, but {chosen.label} has no payout for them — settled or scheduled.
                  Almost always a reservation cancelled after it synced. Together they add{' '}
                  {money(report.unpaid.filter(b => !removed.has(b.id)).reduce((t, b) => t + b.income, 0))}{' '}
                  of revenue you will not receive, and their nights inflate your occupancy.
                </p>
              </header>
              <ul className="divide-y divide-slate-100">
                {stillUnpaid.map(b => (
                  <li key={b.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 truncate">{b.guestName || 'Guest'}</p>
                      <p className="text-xs text-slate-500">
                        {day(b.checkIn)} → {day(b.checkOut)} · {money(b.income)}
                        {b.confirmationCode && ` · ${b.confirmationCode}`}
                      </p>
                    </div>
                    <button
                      onClick={() => remove(b.id)}
                      disabled={removing === b.id}
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs hover:bg-red-50 disabled:opacity-60"
                    >
                      {removing === b.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {removed.size > 0 && (
            <div className="flex items-start gap-3 border border-emerald-200 bg-emerald-50 rounded-xl p-4">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-800 leading-relaxed">
                {removed.size} stay{removed.size !== 1 ? 's' : ''} deleted. Your revenue and
                occupancy for those months will have moved — worth a look at the income statement.
              </p>
            </div>
          )}

          {report.missing.length > 0 && (
            <section className="bg-white border border-amber-200 rounded-xl overflow-hidden">
              <header className="px-5 py-4 bg-amber-50 border-b border-amber-200">
                <h2 className="text-sm font-semibold text-amber-900">
                  {report.missing.length} payout{report.missing.length !== 1 ? 's' : ''} with no booking
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {chosen.label} is paying for stays your books do not have — {money(report.missingIncome)}{' '}
                  of revenue going unrecorded. Import the export from Settings to bring them in,
                  unless they belong to a unit you keep elsewhere.
                </p>
              </header>
              <ul className="divide-y divide-slate-100">
                {report.missing.slice(0, 40).map(p => (
                  <li key={p.confirmationCode || p.checkIn} className="px-5 py-3">
                    <p className="text-sm text-slate-900 truncate">{p.guestName || 'Guest'}</p>
                    <p className="text-xs text-slate-500">
                      {day(p.checkIn)} {year(p.checkIn)} · {money(p.grossEarnings)}
                      {p.payoutDate && ` · paid ${day(p.payoutDate)}`}
                    </p>
                  </li>
                ))}
              </ul>
              {report.missing.length > 40 && (
                <p className="px-5 py-3 text-xs text-slate-500 border-t border-slate-100">
                  and {report.missing.length - 40} more.
                </p>
              )}
            </section>
          )}

          {report.mismatched.length > 0 && (
            <section className="bg-white border border-amber-200 rounded-xl overflow-hidden">
              <header className="px-5 py-4 bg-amber-50 border-b border-amber-200">
                <h2 className="text-sm font-semibold text-amber-900">
                  {report.mismatched.length} stay{report.mismatched.length !== 1 ? 's' : ''} booked for different money
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Matched to a payout, but your books and {chosen.label} disagree on what the
                  guest paid. Usually an alteration or a refund that reached one side only.
                </p>
              </header>
              <ul className="divide-y divide-slate-100">
                {report.mismatched.slice(0, 40).map(m => (
                  <li key={m.booking.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 truncate">
                        {m.booking.guestName || 'Guest'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {day(m.booking.checkIn)} · books {money(m.booking.income)} ·{' '}
                        {chosen.label} {money(m.payout.grossEarnings)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        m.difference > 0 ? 'text-red-600' : 'text-amber-700'
                      }`}
                    >
                      {m.difference > 0 ? '+' : ''}{money(m.difference)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.span && (
            <div className="flex items-start gap-3 border border-slate-200 rounded-xl p-4">
              <TriangleAlert className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Only stays checking in between {day(report.span.from)} {year(report.span.from)} and{' '}
                {day(report.span.to)} {year(report.span.to)} were judged — outside those dates the
                export says nothing, so nothing is concluded. Other channels are untouched either way.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
