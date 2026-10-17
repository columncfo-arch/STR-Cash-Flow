'use client';
import { useState } from 'react';
import { PropertyModel } from '@/types';
import { X } from 'lucide-react';

/**
 * Name the unit and say how it is let.
 *
 * Two fields, because that is everything the app needs before it has somewhere
 * to put the rest. The mortgage, the target and the bookings all follow on the
 * new unit's own dashboard, which says what it is still waiting for — asking
 * for them here would be a wizard in front of an empty property.
 *
 * The model is asked now rather than inferred because it decides which page the
 * owner is sent to next, and because a unit with no bookings and no leases
 * gives nothing to infer from. It is only a label: the accounting counts stays
 * and tenancies for every unit either way, so getting it wrong costs a click.
 */
export default function AddPropertyForm({
  onDone, onCancel, autoFocus = true,
}: {
  /** Called with the new property's id once it is saved. */
  onDone: (propertyId: string, model: PropertyModel) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const [name, setName] = useState('');
  const [model, setModel] = useState<PropertyModel>('str');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, model }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'That did not work');
        return;
      }
      onDone((body as { activePropertyId: string }).activePropertyId, model);
    } catch {
      setError('That did not work');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="new-property-name" className="block text-xs text-slate-500 mb-1">Name</label>
        <input
          id="new-property-name"
          autoFocus={autoFocus}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="45 Ocean Ave"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-800 placeholder-slate-300 focus:outline-none focus:border-emerald-500"
        />
      </div>

      <fieldset>
        <legend className="block text-xs text-slate-500 mb-1">How is it let?</legend>
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: 'str', label: 'Short-term', hint: 'Nightly stays' },
            { id: 'ltr', label: 'Long-term', hint: 'Leased to a tenant' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setModel(opt.id)}
              aria-pressed={model === opt.id}
              className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                model === opt.id
                  ? 'border-emerald-500 bg-emerald-50/60'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className="block text-xs font-medium text-slate-800">{opt.label}</span>
              <span className="block text-[11px] text-slate-400 mt-0.5">{opt.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={save}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {busy ? 'Adding…' : 'Add property'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}
