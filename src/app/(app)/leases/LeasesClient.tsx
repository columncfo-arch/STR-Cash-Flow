'use client';
import { useCallback, useEffect, useState } from 'react';
import { Lease, LeaseCharge, PropertyModel, RecurrenceFrequency } from '@/types';
import {
  depositsHeld, effectiveEnd, endedEarly, isActiveOn, leaseMonth, leaseTotalsForMonth,
} from '@/lib/lease';
import { RECURRENCE_FREQUENCIES } from '@/lib/recurrence';
import { isoDate } from '@/lib/dateRange';
import InfoTip from '@/components/InfoTip';
import { Plus, Pencil, Trash2, X, AlertTriangle, DoorOpen } from 'lucide-react';

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** A blank tenancy, dated so the common case is one field of typing. */
const blankLease = (): Partial<Lease> => ({
  tenantName: '', monthlyRent: 0, startDate: isoDate(new Date()),
  endDate: null, depositHeld: 0,
});

type Draft = Partial<Lease> & { id?: string };
type ChargeDraft = Partial<LeaseCharge> & { id?: string };

export default function LeasesClient() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [charges, setCharges] = useState<LeaseCharge[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [propertyName, setPropertyName] = useState('');
  const [model, setModel] = useState<PropertyModel>('str');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [chargeFor, setChargeFor] = useState<string | null>(null);
  const [chargeDraft, setChargeDraft] = useState<ChargeDraft | null>(null);
  const [movingOut, setMovingOut] = useState<Lease | null>(null);

  const today = isoDate(new Date());
  const thisMonth = today.slice(0, 7);

  const fmt = useCallback((n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n),
    [currency]);

  // Bumped after every write, which is what re-reads the list. A counter rather
  // than a callback the effect calls: nothing is set synchronously in the
  // effect body, and a reply that lands after the page has gone is dropped.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/leases');
        const body = await res.json();
        if (!live) return;
        if (!res.ok) throw new Error((body as { error?: string }).error);
        setLeases(body.leases);
        setCharges(body.charges);
        setCurrency(body.currency ?? 'USD');
        setPropertyName(body.propertyName ?? '');
        setModel(body.model ?? 'str');
      } catch {
        if (live) setError('Could not load the tenancies');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [version]);

  async function send(url: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error ?? 'That did not work');
      return false;
    }
    setVersion(v => v + 1);
    return true;
  }

  async function saveLease() {
    if (!draft) return;
    const ok = draft.id
      ? await send('/api/leases', 'PUT', draft)
      : await send('/api/leases', 'POST', draft);
    if (ok) setDraft(null);
  }

  async function saveCharge() {
    if (!chargeDraft) return;
    const ok = chargeDraft.id
      ? await send('/api/leases/charges', 'PUT', chargeDraft)
      : await send('/api/leases/charges', 'POST', chargeDraft);
    if (ok) { setChargeDraft(null); setChargeFor(null); }
  }

  /**
   * Record a move-out, and offer the fee in the same breath.
   *
   * The date lives on the lease and the money lives on a charge, because a
   * tenancy that ends early without a fee — a mutual agreement, a military
   * clause, a buy-out waived — is the ordinary case rather than a null to work
   * around. They are entered together even though they are stored apart.
   */
  async function recordMoveOut(lease: Lease, on: string, fee: number) {
    const ok = await send('/api/leases', 'PUT', { id: lease.id, terminatedOn: on });
    if (ok && fee > 0) {
      await send('/api/leases/charges', 'POST', {
        leaseId: lease.id, label: 'Early termination fee', amount: fee,
        date: on, recurring: false, proratesWithLease: false,
      });
    }
    if (ok) setMovingOut(null);
  }

  const monthTotals = leaseTotalsForMonth(leases, charges, thisMonth);
  const held = depositsHeld(leases, today);
  const active = leases.filter(l => isActiveOn(l, today));

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leases</h1>
          <p className="text-slate-500 text-sm mt-1">
            {propertyName}
            {model === 'str' && ' · let nightly'}
          </p>
        </div>
        <button
          onClick={() => setDraft(blankLease())}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add a tenancy
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-700 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {/* ── What the tenancies are doing this month ── */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-xs uppercase tracking-wide text-slate-900 font-semibold">
            {MONTHS_LONG[Number(thisMonth.slice(5, 7)) - 1]}
          </h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <Stat label="Rent &amp; charges" value={fmt(monthTotals.revenue)} />
          <Stat label="Days under lease" value={String(monthTotals.leasedDays)} />
          <Stat label="Tenancies running" value={String(active.length)} />
          <Stat
            label="Deposits held"
            value={fmt(held)}
            tip="Money held on behalf of tenants and owed back. It is in no line of the profit and loss — the bank balance overstates what is yours by exactly this much."
          />
        </div>
      </section>

      {/* ── The tenancies ── */}
      {leases.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-10 text-center">
          <p className="text-sm text-slate-500">No tenancies on {propertyName || 'this unit'} yet.</p>
          <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto">
            Rent is recognised across the months a tenancy covers, prorated at both ends — not in the
            month the money arrived.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {leases.map(lease => (
            <LeaseCard
              key={lease.id}
              lease={lease}
              charges={charges.filter(c => c.leaseId === lease.id)}
              month={thisMonth}
              today={today}
              fmt={fmt}
              onEdit={() => setDraft(lease)}
              onDelete={async () => {
                if (!confirm(`Delete ${lease.tenantName}'s tenancy and everything billed to it? This cannot be undone.`)) return;
                await send(`/api/leases?id=${encodeURIComponent(lease.id)}`, 'DELETE');
              }}
              onAddCharge={() => {
                setChargeFor(lease.id);
                setChargeDraft({ leaseId: lease.id, label: '', amount: 0, date: today, recurring: true, recurrenceFrequency: 'monthly' });
              }}
              onDeleteCharge={async id => { await send(`/api/leases/charges?id=${encodeURIComponent(id)}`, 'DELETE'); }}
              onMoveOut={() => setMovingOut(lease)}
              chargeForm={chargeFor === lease.id && chargeDraft ? (
                <ChargeForm
                  draft={chargeDraft}
                  setDraft={setChargeDraft}
                  onSave={saveCharge}
                  onCancel={() => { setChargeDraft(null); setChargeFor(null); }}
                />
              ) : null}
            />
          ))}
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? 'Edit tenancy' : 'Add a tenancy'} onClose={() => setDraft(null)}>
          <LeaseForm draft={draft} setDraft={setDraft} onSave={saveLease} onCancel={() => setDraft(null)} />
        </Modal>
      )}

      {movingOut && (
        <Modal title={`${movingOut.tenantName} is moving out`} onClose={() => setMovingOut(null)}>
          <MoveOutForm lease={movingOut} fmt={fmt} onCancel={() => setMovingOut(null)} onSave={recordMoveOut} />
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <div className="px-4 py-4 border-b border-slate-100 odd:border-l-0 even:border-l even:border-slate-100 lg:border-b-0 lg:border-l lg:first:border-l-0 lg:odd:border-l">
      <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold flex items-center gap-1">
        {label}
        {tip && <InfoTip label={label}>{tip}</InfoTip>}
      </p>
      <p className="text-xl font-bold text-slate-900 leading-tight mt-1">{value}</p>
    </div>
  );
}

function LeaseCard({
  lease, charges, month, today, fmt,
  onEdit, onDelete, onAddCharge, onDeleteCharge, onMoveOut, chargeForm,
}: {
  lease: Lease;
  charges: LeaseCharge[];
  month: string;
  today: string;
  fmt: (n: number) => string;
  onEdit: () => void;
  onDelete: () => void;
  onAddCharge: () => void;
  onDeleteCharge: (id: string) => void;
  onMoveOut: () => void;
  chargeForm: React.ReactNode;
}) {
  const live = isActiveOn(lease, today);
  const end = effectiveEnd(lease);
  const early = endedEarly(lease);
  const m = leaseMonth(lease, charges, month);
  // Amber once the deadline to give or receive notice is within sight. It drops
  // out on a tenancy that has ended: nobody is renewing that.
  const noticeDue = live && lease.renewalNoticeDate && lease.renewalNoticeDate >= today;

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900">{lease.tenantName}</h3>
            <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
              live ? 'text-emerald-700 border border-emerald-200' : 'text-slate-400 border border-slate-200'
            }`}>
              {live ? 'Running' : 'Ended'}
            </span>
            {early && (
              <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                Ended early
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {fmt(lease.monthlyRent)}/month · {lease.startDate} to {end ?? 'month-to-month'}
            {early && lease.endDate && (
              <span className="text-slate-400"> · was written to {lease.endDate}</span>
            )}
          </p>
          {noticeDue && (
            <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Notice due by {lease.renewalNoticeDate}
            </p>
          )}
          {lease.notes && <p className="text-[11px] text-slate-400 mt-1.5">{lease.notes}</p>}
        </div>

        <div className="text-right shrink-0">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">This month</p>
          <p className="text-lg font-bold text-slate-900 leading-tight">{fmt(m.revenue)}</p>
          <p className="text-[11px] text-slate-400">
            {m.leaseDays} day{m.leaseDays === 1 ? '' : 's'}
            {m.charges !== 0 && ` · ${fmt(m.charges)} in charges`}
          </p>
        </div>
      </div>

      <div className="px-5 pb-4 flex flex-wrap items-center gap-3 text-[11px]">
        <button onClick={onEdit} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700">
          <Pencil className="w-3 h-3" /> Edit
        </button>
        <button onClick={onAddCharge} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700">
          <Plus className="w-3 h-3" /> Add a charge
        </button>
        {live && (
          <button onClick={onMoveOut} className="inline-flex items-center gap-1 text-slate-500 hover:text-amber-700">
            <DoorOpen className="w-3 h-3" /> Record move-out
          </button>
        )}
        <button onClick={onDelete} className="inline-flex items-center gap-1 text-slate-400 hover:text-red-600 ml-auto">
          <Trash2 className="w-3 h-3" /> Delete
        </button>
        {(lease.depositHeld ?? 0) > 0 && (
          <span className="text-slate-400 w-full">
            {fmt(lease.depositHeld!)} deposit held{live ? '' : ' — returned or withheld at move-out'}
          </span>
        )}
      </div>

      {(charges.length > 0 || chargeForm) && (
        <div className="border-t border-slate-100 px-5 py-3">
          {charges.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {charges.map(c => (
                <li key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-700 flex-1 truncate">{c.label}</span>
                  <span className="text-slate-400">
                    {c.recurring
                      ? (RECURRENCE_FREQUENCIES.find(f => f.id === c.recurrenceFrequency)?.short ?? 'Monthly')
                      : c.date}
                  </span>
                  <span className="font-medium text-slate-800 w-20 text-right">{fmt(c.amount)}</span>
                  <button onClick={() => onDeleteCharge(c.id)} className="text-slate-300 hover:text-red-600">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {chargeForm}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

const input = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-500';

function LeaseForm({
  draft, setDraft, onSave, onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Draft) => setDraft({ ...draft, ...patch });
  return (
    <div className="space-y-3">
      <Field label="Tenant">
        <input autoFocus className={input} value={draft.tenantName ?? ''} onChange={e => set({ tenantName: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly rent">
          <input type="number" className={input} value={draft.monthlyRent ?? 0}
            onChange={e => set({ monthlyRent: parseFloat(e.target.value) || 0 })} />
        </Field>
        <Field label="Deposit held">
          <input type="number" className={input} value={draft.depositHeld ?? 0}
            onChange={e => set({ depositHeld: parseFloat(e.target.value) || 0 })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <input type="date" className={input} value={draft.startDate ?? ''} onChange={e => set({ startDate: e.target.value })} />
        </Field>
        <Field label="Ends (blank for month-to-month)">
          <input type="date" className={input} value={draft.endDate ?? ''} onChange={e => set({ endDate: e.target.value || null })} />
        </Field>
      </div>
      <Field label="Notice due by">
        <input type="date" className={input} value={draft.renewalNoticeDate ?? ''}
          onChange={e => set({ renewalNoticeDate: e.target.value || null })} />
      </Field>
      <Field label="Notes">
        <input className={input} value={draft.notes ?? ''} onChange={e => set({ notes: e.target.value })} />
      </Field>
      <p className="text-[11px] text-slate-400">
        Rent is recognised across the months the tenancy covers and prorated at both ends, so a lease
        starting on the 20th earns eleven days of that month.
      </p>
      <Actions onSave={onSave} onCancel={onCancel} saveLabel={draft.id ? 'Save' : 'Add tenancy'} />
    </div>
  );
}

function ChargeForm({
  draft, setDraft, onSave, onCancel,
}: {
  draft: ChargeDraft;
  setDraft: (d: ChargeDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: ChargeDraft) => setDraft({ ...draft, ...patch });
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Charge">
          <input autoFocus className={input} placeholder="Parking" value={draft.label ?? ''}
            onChange={e => set({ label: e.target.value })} />
        </Field>
        <Field label="Amount">
          <input type="number" className={input} value={draft.amount ?? 0}
            onChange={e => set({ amount: parseFloat(e.target.value) || 0 })} />
        </Field>
        <Field label={draft.recurring ? 'First billed' : 'Date'}>
          <input type="date" className={input} value={draft.date ?? ''} onChange={e => set({ date: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={Boolean(draft.recurring)}
            onChange={e => set({ recurring: e.target.checked, proratesWithLease: e.target.checked })} />
          Repeats
        </label>
        {draft.recurring && (
          <select className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
            value={draft.recurrenceFrequency ?? 'monthly'}
            onChange={e => set({ recurrenceFrequency: e.target.value as RecurrenceFrequency })}>
            {RECURRENCE_FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={Boolean(draft.proratesWithLease)}
            onChange={e => set({ proratesWithLease: e.target.checked })} />
          Prorates with the tenancy
          <InfoTip label="What prorating means here">
            A standing charge shrinks with a part month, the way the rent does. A one-off event — a late
            fee, an early termination fee — lands whole on its date.
          </InfoTip>
        </label>
      </div>
      <Actions onSave={onSave} onCancel={onCancel} saveLabel={draft.id ? 'Save' : 'Add charge'} />
    </div>
  );
}

function MoveOutForm({
  lease, fmt, onCancel, onSave,
}: {
  lease: Lease;
  fmt: (n: number) => string;
  onCancel: () => void;
  onSave: (lease: Lease, on: string, fee: number) => void;
}) {
  const [on, setOn] = useState(isoDate(new Date()));
  const [fee, setFee] = useState(0);
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Rent stops on the move-out date, prorated to it. {lease.endDate
          ? `The lease was written to run to ${lease.endDate}, and that stays on the record.`
          : 'This is a month-to-month tenancy, so there is no contracted end to keep.'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Moving out">
          <input type="date" className={input} value={on} onChange={e => setOn(e.target.value)} />
        </Field>
        <Field label="Early termination fee">
          <input type="number" className={input} value={fee} onChange={e => setFee(parseFloat(e.target.value) || 0)} />
        </Field>
      </div>
      <p className="text-[11px] text-slate-400">
        {fee > 0
          ? `${fmt(fee)} will be billed as a one-off charge dated the move-out.`
          : 'Leave the fee at zero where none was agreed — a mutual end, a military clause, a waived buy-out.'}
      </p>
      <Actions onSave={() => onSave(lease, on, fee)} onCancel={onCancel} saveLabel="Record move-out" />
    </div>
  );
}

function Actions({ onSave, onCancel, saveLabel }: { onSave: () => void; onCancel: () => void; saveLabel: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button onClick={onSave}
        className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
        {saveLabel}
      </button>
      <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
