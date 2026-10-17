'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Account } from '@/types';

export interface HostexSyncResult {
  created: number;
  updated: number;
  total: number;
  deduped: number;
  /** Hostex units that match none of the properties on this account. */
  unassigned?: { hostexPropertyId: string; reservations: number }[];
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
  const [account, setAccount] = useState<Account | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/account').then(r => r.json()).then(setAccount).catch(() => {});
  }, []);

  /** Hand a Hostex unit to one of our properties, then pull its stays in. */
  async function claim(hostexPropertyId: string, propertyId: string) {
    setClaiming(hostexPropertyId);
    try {
      await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: propertyId, claimExternalId: hostexPropertyId }),
      });
      await sync();
    } finally {
      setClaiming(null);
    }
  }

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
        <p className="text-xs text-emerald-700 rounded-lg px-3 py-2 mb-3">
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
        <div className="flex items-start gap-3 mt-4 border border-emerald-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-emerald-800">
              Synced {result.total} reservation{result.total !== 1 ? 's' : ''} —{' '}
              {result.created} new, {result.updated} updated
              {result.deduped > 0 && `, ${result.deduped} duplicate${result.deduped !== 1 ? 's' : ''} removed`}.
            </p>
            <p className="text-xs text-emerald-600 font-mono mt-1">via {result.base}</p>
            {/* Say which stays were left out rather than filing them against
                whichever unit happened to be in view. */}
            {result.unassigned && result.unassigned.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-amber-700 leading-relaxed">
                  These Hostex units match no property here, so their stays were left out rather than filed
                  against the wrong books. Say which property each one is:
                </p>
                {result.unassigned.map(u => (
                  <div key={u.hostexPropertyId} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-slate-600">Hostex #{u.hostexPropertyId}</span>
                    <span className="text-slate-400">{u.reservations} stay{u.reservations === 1 ? '' : 's'}</span>
                    <select
                      disabled={claiming !== null}
                      defaultValue=""
                      onChange={e => e.target.value && claim(u.hostexPropertyId, e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1"
                    >
                      <option value="" disabled>Assign to…</option>
                      {(account?.properties ?? []).filter(p => !p.archived).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {claiming === u.hostexPropertyId && <span className="text-slate-400">assigning…</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 mt-4 text-sm text-red-600 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap break-all">{error}</span>
        </div>
      )}
    </>
  );
}
