'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

export interface HostexSyncResult {
  created: number;
  updated: number;
  total: number;
  deduped: number;
  base: string;
}

interface Props {
  heading?: string;
  subheading?: string;
  onSynced?: (result: HostexSyncResult) => void;
}

/**
 * Hostex token entry + reservation sync. Hostex is the channel manager that
 * actually carries Airbnb/VRBO/Booking.com revenue, so this doubles as the
 * "connect Airbnb" control — Airbnb itself has no public host API.
 */
export default function HostexConnect({ heading, subheading, onSynced }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<HostexSyncResult | null>(null);
  const [error, setError] = useState('');
  // null = still loading, '' = no token saved, 'set' = token exists
  const [tokenStatus, setTokenStatus] = useState<null | '' | 'set'>(null);
  const [tokenInput, setTokenInput] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(s => setTokenStatus(s.hostexAccessToken ? 'set' : ''))
      .catch(() => setTokenStatus(''));
  }, []);

  async function sync() {
    setSyncing(true);
    setError('');
    setResult(null);
    try {
      // Persist a freshly typed token before syncing with it
      const token = tokenInput.trim();
      if (token) {
        const current = await fetch('/api/settings').then(r => r.json());
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...current, hostexAccessToken: token }),
        });
        setTokenStatus('set');
        setTokenInput('');
      }
      const res = await fetch('/api/sync/hostex', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setResult(data);
      onSynced?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      {heading && <h2 className="font-semibold text-slate-800 mb-1">{heading}</h2>}
      {subheading && <p className="text-xs text-slate-500 mb-4">{subheading}</p>}

      {tokenStatus === '' && (
        <div className="mb-3">
          <label className="text-xs text-slate-500 block mb-1">Hostex Access Token</label>
          <input
            type="password"
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono"
            placeholder="Paste your access token from Hostex → Settings → OpenAPI"
            autoComplete="off"
          />
        </div>
      )}

      {tokenStatus === 'set' && (
        <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-3">
          Token configured.
          <button
            onClick={() => { setTokenStatus(''); setTokenInput(''); }}
            className="underline ml-1"
          >
            Replace
          </button>
        </p>
      )}

      <button
        onClick={sync}
        disabled={syncing || tokenStatus === null || (tokenStatus === '' && !tokenInput.trim())}
        className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Syncing…' : 'Sync Now'}
      </button>

      {result && (
        <div className="flex items-start gap-3 mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-emerald-800">
              Synced {result.total} reservation{result.total !== 1 ? 's' : ''} —{' '}
              {result.created} new, {result.updated} updated
              {result.deduped > 0 && `, ${result.deduped} duplicate${result.deduped !== 1 ? 's' : ''} removed`}.
            </p>
            <p className="text-xs text-emerald-600 font-mono mt-1">via {result.base}</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 mt-4 text-sm text-red-600 bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap break-all">{error}</span>
        </div>
      )}
    </>
  );
}
