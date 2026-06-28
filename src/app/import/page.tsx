'use client';
import { useRef, useState } from 'react';
import { Platform } from '@/types';
import { Upload, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

interface MatchResult {
  bookingId: string;
  confirmationCode: string;
  guestName: string;
  checkIn: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  matchedBy: 'confirmation_code' | 'check_in_date';
}

interface NewBookingResult {
  tempId: string;
  confirmationCode: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  platform: Platform;
}

interface Preview {
  matched: MatchResult[];
  toCreate: NewBookingResult[];
  totalRows: number;
}

const PLATFORMS: { value: Platform; label: string; instructions: string }[] = [
  {
    value: 'airbnb',
    label: 'Airbnb',
    instructions: 'Airbnb → Menu → Earnings → Transaction History → Export to CSV',
  },
  {
    value: 'vrbo',
    label: 'VRBO',
    instructions: 'VRBO → Dashboard → Revenue → Statements → Export',
  },
  {
    value: 'booking',
    label: 'Booking.com',
    instructions: 'Booking.com Extranet → Finance → Transactions → Export',
  },
];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function ImportPage() {
  const [platform, setPlatform] = useState<Platform>('airbnb');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ updated: number; created: number } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const platformInfo = PLATFORMS.find(p => p.value === platform)!;

  async function handleFile(file: File) {
    setError('');
    setPreview(null);
    setResult(null);
    setLoading(true);
    try {
      const csvText = await file.text();
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', platform, csvText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Preview failed');
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse CSV');
    } finally {
      setLoading(false);
    }
  }

  async function applyImport() {
    if (!preview) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', matched: preview.matched, toCreate: preview.toCreate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Apply failed');
      setResult(data);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setLoading(false);
    }
  }

  const total = (preview?.matched.length ?? 0) + (preview?.toCreate.length ?? 0);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Import Earnings</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload a CSV export from your booking platform to import actual income and platform fees.
        </p>
      </div>

      {/* Platform selector */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">1. Select Platform</h2>
        <div className="flex gap-3">
          {PLATFORMS.map(p => (
            <button
              key={p.value}
              onClick={() => { setPlatform(p.value); setPreview(null); setResult(null); }}
              className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                platform === p.value
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
          <strong>How to export:</strong> {platformInfo.instructions}
        </p>
      </section>

      {/* File upload */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">2. Upload CSV</h2>
        <label
          className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-8 cursor-pointer hover:border-emerald-400 transition-colors"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <Upload className="w-8 h-8 text-slate-400 mb-2" />
          <span className="text-sm text-slate-500">Drag &amp; drop CSV here, or</span>
          <span className="mt-1 text-sm font-medium text-emerald-600 underline">browse files</span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </label>
        {loading && <p className="mt-3 text-sm text-slate-500 text-center">Parsing…</p>}
        {error && (
          <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </section>

      {/* Success */}
      {result && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6">
          <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800">Import complete</p>
            <p className="text-sm text-emerald-700">
              {result.updated > 0 && `${result.updated} booking${result.updated !== 1 ? 's' : ''} updated. `}
              {result.created > 0 && `${result.created} new booking${result.created !== 1 ? 's' : ''} created from CSV.`}
            </p>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">3. Review &amp; Confirm</h2>
            <span className="text-xs text-slate-400">
              {preview.totalRows} rows parsed · {preview.matched.length} match existing · {preview.toCreate.length} new
            </span>
          </div>

          {/* Matched bookings */}
          {preview.matched.length > 0 && (
            <>
              <p className="text-sm font-medium text-slate-700 mb-2">
                Updating existing bookings ({preview.matched.length})
              </p>
              <BookingTable rows={preview.matched.map(m => ({
                confirmationCode: m.confirmationCode,
                guestName: m.guestName,
                checkIn: m.checkIn,
                grossAmount: m.grossAmount,
                platformFee: m.platformFee,
                netAmount: m.netAmount,
                note: m.matchedBy === 'confirmation_code' ? 'Matched by code' : 'Matched by date',
              }))} />
            </>
          )}

          {/* New bookings */}
          {preview.toCreate.length > 0 && (
            <div className={preview.matched.length > 0 ? 'mt-5' : ''}>
              <p className="text-sm font-medium text-slate-700 mb-2">
                Creating new bookings from CSV ({preview.toCreate.length})
              </p>
              <p className="text-xs text-slate-400 mb-2">
                These bookings aren&apos;t in your iCal history yet — they&apos;ll be added directly from the CSV.
              </p>
              <BookingTable rows={preview.toCreate.map(n => ({
                confirmationCode: n.confirmationCode,
                guestName: n.guestName,
                checkIn: n.checkIn,
                grossAmount: n.grossAmount,
                platformFee: n.platformFee,
                netAmount: n.netAmount,
                note: 'New',
              }))} />
            </div>
          )}

          {total === 0 && (
            <p className="text-sm text-slate-500 py-4">
              No bookings found in this CSV. Make sure you&apos;re exporting Transaction History (not a summary report) and the correct platform is selected above.
            </p>
          )}

          {total > 0 && (
            <button
              onClick={applyImport}
              disabled={loading}
              className="mt-5 flex items-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              {loading ? 'Importing…' : `Import ${total} booking${total !== 1 ? 's' : ''}`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function BookingTable({ rows }: {
  rows: { confirmationCode: string; guestName: string; checkIn: string; grossAmount: number; platformFee: number; netAmount: number; note: string }[];
}) {
  const total = rows.reduce((s, r) => ({ gross: s.gross + r.grossAmount, fee: s.fee + r.platformFee, net: s.net + r.netAmount }), { gross: 0, fee: 0, net: 0 });
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden mb-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-left">
            <th className="px-3 py-2 font-medium">Check-in</th>
            <th className="px-3 py-2 font-medium">Guest</th>
            <th className="px-3 py-2 font-medium text-right">Gross</th>
            <th className="px-3 py-2 font-medium text-right">Platform Fee</th>
            <th className="px-3 py-2 font-medium text-right">Net</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-3 py-2 text-slate-600">{r.checkIn}</td>
              <td className="px-3 py-2 text-slate-700 max-w-[120px] truncate">{r.guestName || '—'}</td>
              <td className="px-3 py-2 text-right font-medium text-slate-800">{fmt(r.grossAmount)}</td>
              <td className="px-3 py-2 text-right text-red-500">{r.platformFee > 0 ? `(${fmt(r.platformFee)})` : '—'}</td>
              <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmt(r.netAmount)}</td>
              <td className="px-3 py-2 text-xs text-slate-400">{r.note}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-emerald-50 border-t-2 border-emerald-200 font-semibold text-sm">
            <td colSpan={2} className="px-3 py-2 text-slate-700">Total</td>
            <td className="px-3 py-2 text-right text-slate-700">{fmt(total.gross)}</td>
            <td className="px-3 py-2 text-right text-red-500">{total.fee > 0 ? `(${fmt(total.fee)})` : '—'}</td>
            <td className="px-3 py-2 text-right text-emerald-700">{fmt(total.net)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
