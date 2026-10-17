'use client';
import { useEffect, useState } from 'react';
import { Account } from '@/types';
import { Building2, Check, ChevronDown, Plus, X } from 'lucide-react';

/**
 * Which property the app is showing, and how to change it.
 *
 * The whole app reads one property at a time, so switching reloads rather than
 * threading a property id through every page's state — a full reload is a few
 * hundred milliseconds and cannot leave one page showing another unit's books.
 */
export default function PropertySwitcher() {
  const [account, setAccount] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/account').then(r => r.json()).then(setAccount).catch(() => {});
  }, []);

  const live = account?.properties.filter(p => !p.archived) ?? [];
  const archived = account?.properties.filter(p => p.archived) ?? [];
  const active = live.find(p => p.id === account?.activePropertyId) ?? live[0];

  async function send(body: Record<string, unknown>, method: 'POST' | 'PUT') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? 'That did not work');
        return;
      }
      // Every page is showing the previous property's figures
      window.location.reload();
    } catch {
      setError('That did not work');
    } finally {
      setBusy(false);
    }
  }

  if (!account || !active) return null;

  // One property and no way to add a second would just be a label
  const soloAndQuiet = live.length === 1 && !open;

  return (
    <div className="px-3 py-2 border-b border-slate-700">
      <button
        onClick={() => { setOpen(o => !o); setAdding(false); setError(null); }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-slate-800 transition-colors"
      >
        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-xs text-white truncate">{active.name}</span>
          {live.length > 1 && (
            <span className="block text-[10px] text-slate-500">{live.length} properties</span>
          )}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {!soloAndQuiet && open && (
        <div className="mt-1 space-y-0.5">
          {live.map(p => (
            <button
              key={p.id}
              disabled={busy}
              onClick={() => p.id === active.id ? setOpen(false) : send({ activePropertyId: p.id }, 'PUT')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                p.id === active.id ? 'text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="w-3.5 shrink-0">
                {p.id === active.id && <Check className="w-3 h-3 text-emerald-400" />}
              </span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}

          {adding ? (
            <div className="px-2 py-1.5">
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && name.trim()) send({ name }, 'POST');
                  if (e.key === 'Escape') { setAdding(false); setName(''); setError(null); }
                }}
                placeholder="45 Ocean Ave"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex items-center gap-2 mt-1.5">
                <button
                  disabled={busy || !name.trim()}
                  onClick={() => send({ name }, 'POST')}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 disabled:text-slate-600"
                >
                  Add property
                </button>
                <button
                  onClick={() => { setAdding(false); setName(''); setError(null); }}
                  className="text-[11px] text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setAdding(true); setError(null); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <span className="w-3.5 shrink-0"><Plus className="w-3 h-3" /></span>
              Add a property
            </button>
          )}

          {/* Archiving is reachable from Settings; without this, restoring is
              not reachable from anywhere. */}
          {archived.length > 0 && (
            <div className="mt-1 pt-1 border-t border-slate-800">
              <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-600">Removed</p>
              {archived.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-2 py-1">
                  <span className="w-3.5 shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-xs text-slate-600">{p.name}</span>
                  <button
                    disabled={busy}
                    onClick={() => send({ id: p.id, archived: false, activePropertyId: p.id }, 'PUT')}
                    className="text-[11px] text-slate-500 hover:text-emerald-400 shrink-0"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="px-2 pb-1 text-[11px] text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
