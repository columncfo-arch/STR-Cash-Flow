'use client';
import { useEffect, useRef, useState } from 'react';
import { Platform } from '@/types';
import { Upload, CheckCircle, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
interface ParsedRow {
  confirmationCode: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
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
    instructions: 'VRBO → Dashboard → Revenue → Reservations → select date range → Export CSV. (Not Statements — that is monthly PDFs, not booking data.)',
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
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const [error, setError] = useState('');
  const [debugHeaders, setDebugHeaders] = useState<string[]>([]);
  const [debugFormat, setDebugFormat] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawSample, setRawSample] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [hostexSyncing, setHostexSyncing] = useState(false);
  const [hostexResult, setHostexResult] = useState<{ created: number; updated: number; total: number } | null>(null);
  const [hostexError, setHostexError] = useState('');
  // null = loading, '' = no token saved, 'set' = token exists
  const [hostexTokenStatus, setHostexTokenStatus] = useState<null | '' | 'set'>(null);
  const [hostexTokenInput, setHostexTokenInput] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(s => setHostexTokenStatus(s.hostexAccessToken ? 'set' : ''));
  }, []);

  async function handleFile(file: File) {
    setError('');
    setRows(null);
    setResult(null);
    setDebugHeaders([]);
    setDebugFormat('');
    setRawSample([]);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('platform', platform);
      formData.append('file', file);
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to parse file');
      setRows(data.rows);
      setTotalRows(data.totalRows);
      setDebugHeaders(data.debugHeaders ?? []);
      setDebugFormat(data.debugFormat ?? '');
      setRawSample(data.rawSample ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  }

  async function applyImport() {
    if (!rows?.length) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', platform, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setResult(data);
      setRows(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  async function syncHostex() {
    setHostexSyncing(true);
    setHostexError('');
    setHostexResult(null);
    try {
      // If a new token was typed, save it to settings first
      const token = hostexTokenInput.trim();
      if (token) {
        const s = await fetch('/api/settings').then(r => r.json());
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...s, hostexAccessToken: token }),
        });
        setHostexTokenStatus('set');
        setHostexTokenInput('');
      }
      const res = await fetch('/api/sync/hostex', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setHostexResult(data);
    } catch (e) {
      setHostexError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setHostexSyncing(false);
    }
  }

  const totals = rows?.reduce(
    (s, r) => ({ gross: s.gross + r.grossAmount, fee: s.fee + r.platformFee, net: s.net + r.netAmount }),
    { gross: 0, fee: 0, net: 0 }
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Import Earnings</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload a CSV export from your booking platform to import income and platform fees.
        </p>
      </div>

      {/* Hostex sync */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-800 mb-1">Sync from Hostex</h2>
        <p className="text-xs text-slate-500 mb-4">
          Pulls all reservations directly from your Hostex account — no CSV needed.
        </p>

        {hostexTokenStatus === '' && (
          <div className="mb-3">
            <label className="text-xs text-slate-500 block mb-1">Hostex Access Token</label>
            <input
              type="password"
              value={hostexTokenInput}
              onChange={e => setHostexTokenInput(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono"
              placeholder="Paste your access token from Hostex → Settings → OpenAPI"
              autoComplete="off"
            />
          </div>
        )}

        {hostexTokenStatus === 'set' && (
          <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-3">
            Token configured. <button onClick={() => { setHostexTokenStatus(''); setHostexTokenInput(''); }} className="underline ml-1">Replace</button>
          </p>
        )}

        <button
          onClick={syncHostex}
          disabled={hostexSyncing || hostexTokenStatus === null || (hostexTokenStatus === '' && !hostexTokenInput.trim())}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${hostexSyncing ? 'animate-spin' : ''}`} />
          {hostexSyncing ? 'Syncing…' : 'Sync Now'}
        </button>

        {hostexResult && (
          <div className="flex items-center gap-3 mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-800">
              Synced {hostexResult.total} reservation{hostexResult.total !== 1 ? 's' : ''} —{' '}
              {hostexResult.created} new, {hostexResult.updated} updated.
            </p>
          </div>
        )}
        {hostexError && (
          <div className="flex items-start gap-2 mt-4 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {hostexError}
          </div>
        )}
      </section>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
        <div className="relative flex justify-center"><span className="bg-slate-50 px-3 text-xs text-slate-400">or import from CSV</span></div>
      </div>

      {/* Platform selector */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">1. Select Platform</h2>
        <div className="flex gap-3">
          {PLATFORMS.map(p => (
            <button
              key={p.value}
              onClick={() => { setPlatform(p.value); setRows(null); setResult(null); }}
              className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                platform === p.value
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-emerald-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
          <strong>How to export:</strong> {PLATFORMS.find(p => p.value === platform)!.instructions}
        </p>
      </section>

      {/* File upload */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">2. Upload CSV</h2>
        <label
          className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-8 cursor-pointer hover:border-emerald-400 transition-colors"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <Upload className="w-8 h-8 text-slate-400 mb-2" />
          <span className="text-sm text-slate-500">Drag &amp; drop CSV or Excel file here, or</span>
          <span className="mt-1 text-sm font-medium text-emerald-600 underline">browse files</span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,.xlsm,text/csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </label>
        {loading && <p className="mt-3 text-sm text-slate-500 text-center">Parsing…</p>}
        {error && (
          <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
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
              {result.created} booking{result.created !== 1 ? 's' : ''} created
              {result.updated > 0 && `, ${result.updated} updated`}.
            </p>
          </div>
        </div>
      )}

      {/* Preview */}
      {rows && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">3. Review &amp; Confirm</h2>
            <span className="text-xs text-slate-400">{rows.length} bookings from {totalRows} CSV rows</span>
          </div>

          {rows.length === 0 ? (
            <div className="py-2 space-y-3">
              <p className="text-sm text-slate-500">
                No bookings found. Make sure you&apos;re exporting the correct file and the right platform is selected.
              </p>
              {debugHeaders.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  {debugFormat && <p className="text-xs font-mono text-amber-600 break-all">format: {debugFormat}</p>}
                  <p className="text-xs font-semibold text-amber-800">Columns detected ({debugHeaders.length}):</p>
                  <p className="text-xs text-amber-700 font-mono break-all">{debugHeaders.join(' | ')}</p>
                  {rawSample.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-amber-200 space-y-2">
                      <p className="text-xs font-semibold text-amber-800">First row values:</p>
                      {Object.entries(rawSample[0]).map(([k, v]) => (
                        <div key={k} className="text-xs font-mono text-amber-800">
                          <span className="text-amber-500">{k}</span>: &quot;{String(v)}&quot;
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-left">
                      <th className="px-3 py-2 font-medium">Check-in</th>
                      <th className="px-3 py-2 font-medium">Guest</th>
                      <th className="px-3 py-2 font-medium">Conf. Code</th>
                      <th className="px-3 py-2 font-medium text-right">Gross</th>
                      <th className="px-3 py-2 font-medium text-right">Platform Fee</th>
                      <th className="px-3 py-2 font-medium text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-600">{r.checkIn}</td>
                        <td className="px-3 py-2 text-slate-700 max-w-[120px] truncate">{r.guestName || '—'}</td>
                        <td className="px-3 py-2 text-slate-400 text-xs">{r.confirmationCode || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-800">{fmt(r.grossAmount)}</td>
                        <td className="px-3 py-2 text-right text-red-500">{r.platformFee > 0 ? `(${fmt(r.platformFee)})` : '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmt(r.netAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr className="bg-emerald-50 border-t-2 border-emerald-200 font-semibold text-sm">
                        <td colSpan={3} className="px-3 py-2 text-slate-700">Total</td>
                        <td className="px-3 py-2 text-right text-slate-700">{fmt(totals.gross)}</td>
                        <td className="px-3 py-2 text-right text-red-500">{totals.fee > 0 ? `(${fmt(totals.fee)})` : '—'}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{fmt(totals.net)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <button
                onClick={applyImport}
                disabled={loading}
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                {loading ? 'Importing…' : `Import ${rows.length} booking${rows.length !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
