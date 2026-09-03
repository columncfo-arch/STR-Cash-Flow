'use client';
import { useEffect, useState } from 'react';
import { Expense, ExpenseCategory, EXPENSE_CATEGORIES, Settings } from '@/types';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, Check, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  RANGE_PRESETS, presetRange, inRange, recurrenceOverlapsRange, type RangePreset,
} from '@/lib/dateRange';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function byCategory(expenses: Expense[]): Record<string, number> {
  return expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
}

function pct(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function changePct(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? Infinity : 0;
  return ((curr - prev) / prev) * 100;
}

function AnomalyBadge({ pctChange, inverse = false }: { pctChange: number; inverse?: boolean }) {
  const abs = Math.abs(pctChange);
  if (abs < 15) return null;
  const isIncrease = pctChange > 0;
  const isBad = inverse ? !isIncrease : isIncrease;
  if (abs >= 50) {
    return isBad
      ? <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700"><TrendingUp className="w-2.5 h-2.5" />High</span>
      : <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700"><TrendingDown className="w-2.5 h-2.5" />Low</span>;
  }
  return isBad
    ? <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"><TrendingUp className="w-2.5 h-2.5" />Up</span>
    : <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600"><TrendingDown className="w-2.5 h-2.5" />Down</span>;
}

function AnalysisTable({
  current, prior, currentLabel, priorLabel, fmt,
}: {
  current: Expense[];
  prior: Expense[];
  currentLabel: string;
  priorLabel: string;
  fmt: (n: number) => string;
}) {
  const currBycat = byCategory(current);
  const prevBycat = byCategory(prior);
  const currTotal = current.reduce((s, e) => s + e.amount, 0);
  const prevTotal = prior.reduce((s, e) => s + e.amount, 0);

  const allCats = Array.from(new Set([
    ...Object.keys(currBycat),
    ...Object.keys(prevBycat),
  ])).sort((a, b) => (currBycat[b] ?? 0) - (currBycat[a] ?? 0));

  if (allCats.length === 0) return null;

  const totalChange = changePct(currTotal, prevTotal);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-xs text-slate-400 font-semibold uppercase tracking-wide border-b border-slate-100">
            <th className="text-left py-2 pr-4">Category</th>
            <th className="text-right py-2 px-3">{currentLabel}</th>
            <th className="text-right py-2 px-3">% of Total</th>
            <th className="text-right py-2 px-3">{priorLabel}</th>
            <th className="text-right py-2 px-3">% of Total</th>
            <th className="text-right py-2 pl-3">Change</th>
          </tr>
        </thead>
        <tbody>
          {allCats.map(cat => {
            const curr = currBycat[cat] ?? 0;
            const prev = prevBycat[cat] ?? 0;
            const chg = changePct(curr, prev);
            const label = EXPENSE_CATEGORIES.find(c => c.value === cat)?.label ?? cat;
            const isNew = prev === 0 && curr > 0;
            const isGone = curr === 0 && prev > 0;
            return (
              <tr key={cat} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-2.5 pr-4 text-slate-700 font-medium">
                  {label}
                  {isNew && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">New</span>}
                  {isGone && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Gone</span>}
                </td>
                <td className="py-2.5 px-3 text-right font-medium text-slate-800">{curr > 0 ? fmt(curr) : '—'}</td>
                <td className="py-2.5 px-3 text-right text-slate-500">{curr > 0 ? `${pct(curr, currTotal).toFixed(1)}%` : '—'}</td>
                <td className="py-2.5 px-3 text-right text-slate-400">{prev > 0 ? fmt(prev) : '—'}</td>
                <td className="py-2.5 px-3 text-right text-slate-400">{prev > 0 ? `${pct(prev, prevTotal).toFixed(1)}%` : '—'}</td>
                <td className="py-2.5 pl-3 text-right">
                  {!isNew && !isGone && (
                    <span className={`font-semibold ${chg > 0 ? 'text-red-600' : chg < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {chg === 0 ? <Minus className="w-3.5 h-3.5 inline" /> : `${chg > 0 ? '+' : ''}${isFinite(chg) ? chg.toFixed(1) : '—'}%`}
                    </span>
                  )}
                  {!isNew && !isGone && <AnomalyBadge pctChange={chg} />}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 font-bold">
            <td className="py-2.5 pr-4 text-slate-800">Total</td>
            <td className="py-2.5 px-3 text-right text-slate-900">{fmt(currTotal)}</td>
            <td className="py-2.5 px-3 text-right text-slate-400">100%</td>
            <td className="py-2.5 px-3 text-right text-slate-500">{prevTotal > 0 ? fmt(prevTotal) : '—'}</td>
            <td className="py-2.5 px-3 text-right text-slate-400">{prevTotal > 0 ? '100%' : '—'}</td>
            <td className="py-2.5 pl-3 text-right">
              {prevTotal > 0 && (
                <span className={`font-semibold ${totalChange > 0 ? 'text-red-600' : totalChange < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {totalChange > 0 ? '+' : ''}{totalChange.toFixed(1)}%
                </span>
              )}
              {prevTotal > 0 && <AnomalyBadge pctChange={totalChange} />}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface FormState {
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  recurring: boolean;
  recurrenceEnd: string;
}

function emptyForm(): FormState {
  return {
    date: new Date().toISOString().slice(0, 10),
    category: 'cleaning',
    description: '',
    amount: '',
    recurring: false,
    recurrenceEnd: '',
  };
}

function ExpenseForm({ f, onChange, onSave, onCancel, submitLabel = 'Add' }: {
  f: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onSave: () => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [attempted, setAttempted] = useState(false);
  const err = {
    description: attempted && !f.description,
    amount: attempted && !f.amount,
  };

  function handleSave() {
    setAttempted(true);
    if (!f.amount || !f.date || !f.description) return;
    onSave();
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div>
        <label className="text-xs text-slate-500 block mb-1">Date</label>
        <input type="date" value={f.date} onChange={e => onChange({ date: e.target.value })}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">Category</label>
        <select value={f.category} onChange={e => onChange({ category: e.target.value as ExpenseCategory })}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2">
          {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">
          Description {err.description && <span className="text-red-500 ml-1">required</span>}
        </label>
        <input type="text" value={f.description} onChange={e => onChange({ description: e.target.value })}
          placeholder="e.g. April electric bill"
          className={`w-full text-sm border rounded-lg px-3 py-2 ${err.description ? 'border-red-400 bg-red-50' : 'border-slate-200'}`} />
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">
          Amount ($) {err.amount && <span className="text-red-500 ml-1">required</span>}
        </label>
        <input type="number" value={f.amount} onChange={e => onChange({ amount: e.target.value })}
          placeholder="0.00" min="0" step="0.01"
          className={`w-full text-sm border rounded-lg px-3 py-2 ${err.amount ? 'border-red-400 bg-red-50' : 'border-slate-200'}`} />
      </div>
      <div className="col-span-2 md:col-span-4 flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={f.recurring} onChange={e => onChange({ recurring: e.target.checked })} />
          Recurring monthly expense
        </label>
        {f.recurring && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Ends (optional)</label>
            <input type="date" value={f.recurrenceEnd} onChange={e => onChange({ recurrenceEnd: e.target.value })}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
          </div>
        )}
      </div>
      <div className="flex items-end gap-2 col-span-2 md:col-span-4">
        <button onClick={handleSave}
          className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700">
          <Check className="w-3.5 h-3.5" /> {submitLabel}
        </button>
        <button onClick={onCancel}
          className="flex items-center gap-1.5 border border-slate-200 px-4 py-2 rounded-lg text-sm hover:bg-slate-50">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}

export default function ExpensesPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  // The range drives the list; the year it lands in still drives the YoY
  // comparison and bulk entry, which are inherently year-based.
  const [preset, setPreset] = useState<RangePreset>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [analysisTab, setAnalysisTab] = useState<'yoy' | 'mom'>('yoy');

  // Bulk entry state
  // The month grid is the page's primary surface: one month, one column of
  // amounts, one save.
  const [gridMonth, setGridMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  // A range ending in 2026 analyses 2026 against 2025. An unbounded range has
  // no year of its own, so fall back to the current one.
  const activeYear = range.to ? Number(range.to.slice(0, 4)) : new Date().getFullYear();
  const filterYear = String(activeYear);

  // One fetch for everything; the year slices below are derived, not refetched.
  async function load() {
    const res = await fetch('/api/expenses?year=all');
    const data = await res.json();
    setAllExpenses(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    load();
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, []);

  function applyPreset(id: Exclude<RangePreset, 'custom'>) {
    setPreset(id);
    setRange(presetRange(id));
  }

  function setBound(key: 'from' | 'to', value: string) {
    setPreset('custom');
    setRange(r => ({ ...r, [key]: value }));
  }

  // Year slices the YoY / MoM analysis and bulk entry work against. Derived
  // rather than stored, so they cannot drift from allExpenses.
  const expenses = allExpenses.filter(e => e.date.startsWith(String(activeYear)));
  const prevExpenses = allExpenses.filter(e => e.date.startsWith(String(activeYear - 1)));

  // Recurring costs apply every month from their start until recurrenceEnd, so
  // a monthly bill begun in January must still show in a September range.
  const visible = allExpenses.filter(e =>
    e.recurring
      ? recurrenceOverlapsRange(e.date, e.recurrenceEnd, range)
      : inRange(e.date, range)
  );

  const rangeLabel = preset === 'all'
    ? 'across all dates'
    : RANGE_PRESETS.find(p => p.id === preset)?.label.toLowerCase()
      ?? `${range.from || '…'} to ${range.to || '…'}`;

  async function addExpense() {
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: form.date,
        category: form.category,
        description: form.description,
        amount: parseFloat(form.amount) || 0,
        recurring: form.recurring,
        recurrenceEnd: form.recurring && form.recurrenceEnd ? form.recurrenceEnd : undefined,
      }),
    });
    setShowAdd(false);
    setForm(emptyForm());
    load();
  }

  async function saveEdit(id: string) {
    await fetch(`/api/expenses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: editForm.date,
        category: editForm.category,
        description: editForm.description,
        amount: parseFloat(editForm.amount) || 0,
        recurring: editForm.recurring,
        recurrenceEnd: editForm.recurring && editForm.recurrenceEnd ? editForm.recurrenceEnd : null,
      }),
    });
    setEditId(null);
    load();
  }

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    load();
  }

  function startEdit(e: Expense) {
    setEditId(e.id);
    setEditForm({
      date: e.date,
      category: e.category,
      description: e.description,
      amount: String(e.amount),
      recurring: e.recurring ?? false,
      recurrenceEnd: e.recurrenceEnd ?? '',
    });
  }

  // ── Bulk entry helpers ──────────────────────────────────────────────────────

  // ── Month grid ────────────────────────────────────────────────────────────
  // Rows are per category for the selected month. Recurring costs are shown but
  // never edited here: they belong to a series, and rewriting one month's copy
  // would strip its recurrence. Categories holding several one-off entries are
  // shown as a read-only sum — collapsing them into a single figure would
  // destroy the individual records and their descriptions.

  interface MonthRow {
    category: ExpenseCategory;
    label: string;
    recurringTotal: number;
    oneOffs: Expense[];
    editable: Expense | null;   // the single entry this row may edit in place
    readOnlyTotal: number;      // shown when a row cannot be edited safely
  }

  const monthRows: MonthRow[] = EXPENSE_CATEGORIES.map(({ value, label }) => {
    const recurring = allExpenses.filter(e =>
      e.category === value && e.recurring &&
      recurrenceOverlapsRange(e.date, e.recurrenceEnd, { from: `${gridMonth}-01`, to: `${gridMonth}-31` })
    );
    const oneOffs = allExpenses.filter(e =>
      e.category === value && !e.recurring && e.date.startsWith(gridMonth)
    );
    return {
      category: value,
      label,
      recurringTotal: recurring.reduce((s, e) => s + e.amount, 0),
      oneOffs,
      editable: oneOffs.length <= 1 ? (oneOffs[0] ?? null) : null,
      readOnlyTotal: oneOffs.reduce((s, e) => s + e.amount, 0),
    };
  });

  // Reset the draft whenever the month or underlying data changes
  const draftKey = `${gridMonth}:${allExpenses.length}`;
  const [draftKeyRef, setDraftKeyRef] = useState(draftKey);
  if (draftKeyRef !== draftKey) {
    setDraftKeyRef(draftKey);
    setDraft(Object.fromEntries(
      monthRows.filter(r => r.oneOffs.length <= 1)
        .map(r => [r.category, r.editable ? String(r.editable.amount) : ''])
    ));
  }

  const monthVariableTotal =
    monthRows.reduce((s, r) => s + r.recurringTotal + r.readOnlyTotal, 0);

  async function saveMonth() {
    setSaving(true);
    try {
      const jobs: Promise<unknown>[] = [];
      for (const row of monthRows) {
        if (row.oneOffs.length > 1) continue;      // never touch multi-entry rows
        const raw = (draft[row.category] ?? '').trim();
        const value = raw === '' ? null : parseFloat(raw);
        if (value !== null && !isFinite(value)) continue;

        if (row.editable && value === null) {
          // cleared → remove that one entry
          jobs.push(fetch(`/api/expenses/${row.editable.id}`, { method: 'DELETE' }));
        } else if (row.editable && value !== null && value !== row.editable.amount) {
          // changed → update in place, keeping description and recurrence
          jobs.push(fetch(`/api/expenses/${row.editable.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: row.editable.date,
              category: row.editable.category,
              description: row.editable.description,
              amount: value,
              recurring: row.editable.recurring ?? false,
              recurrenceEnd: row.editable.recurrenceEnd ?? null,
            }),
          }));
        } else if (!row.editable && value !== null && value > 0) {
          // new entry for an empty category
          jobs.push(fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: `${gridMonth}-01`,
              category: row.category,
              description: `${MONTHS_SHORT[Number(gridMonth.slice(5, 7)) - 1]} ${row.label.toLowerCase()}`,
              amount: value,
            }),
          }));
        }
      }
      await Promise.all(jobs);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function shiftMonth(delta: number) {
    const [y, m] = gridMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setGridMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  // Footer totals summarise the table below, so they follow the range filter
  const totalsByCategory = visible.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  const grandTotal = visible.reduce((s, e) => s + e.amount, 0);

  const pitiMonthly = settings?.monthlyPITI ?? 0;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="text-slate-500 text-sm mt-1">
            {visible.length} of {allExpenses.length} entries · {rangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setShowAdd(v => !v); setForm(emptyForm()); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${showAdd ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          >
            <Plus className="w-4 h-4" /> Add one-off
          </button>
        </div>
      </div>

      {/* ── One-off entry (dated, or recurring) ── */}
      {showAdd && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-4">New Expense</h2>
          <ExpenseForm
            f={form}
            onChange={patch => setForm(p => ({ ...p, ...patch }))}
            onSave={addExpense}
            onCancel={() => { setShowAdd(false); setForm(emptyForm()); }}
            submitLabel="Add Expense"
          />
        </div>
      )}

      {/* ── Month grid: the primary way to log a month's costs ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Previous month">‹</button>
            <span className="font-semibold text-slate-800 min-w-[9rem] text-center">
              {MONTHS_LONG[Number(gridMonth.slice(5, 7)) - 1]} {gridMonth.slice(0, 4)}
            </span>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Next month">›</button>
          </div>
          <button
            onClick={saveMonth}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save month'}
          </button>
        </div>

        <div className="divide-y divide-slate-50">
          {monthRows.map(row => {
            const multi = row.oneOffs.length > 1;
            const hasRecurring = row.recurringTotal > 0;
            return (
              <div key={row.category} className="flex items-center gap-3 px-5 py-2">
                <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                  {row.label}
                  {hasRecurring && (
                    <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                      {fmt(row.recurringTotal)} recurring
                    </span>
                  )}
                  {multi && (
                    <span className="ml-2 text-[10px] text-slate-400">{row.oneOffs.length} entries — edit below</span>
                  )}
                </span>
                {multi ? (
                  <span className="text-sm font-medium text-slate-500 w-28 text-right pr-3">{fmt(row.readOnlyTotal)}</span>
                ) : (
                  <div className="flex items-center gap-1 w-28">
                    <span className="text-xs text-slate-400">$</span>
                    <input
                      type="number"
                      value={draft[row.category] ?? ''}
                      onChange={e => setDraft(d => ({ ...d, [row.category]: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1 text-right"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Variable expenses</span>
            <span className="font-medium text-slate-800">{fmt(monthVariableTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">
              PITI
              <a href="/settings" className="ml-1.5 text-xs text-emerald-600 underline">edit in Settings</a>
            </span>
            <span className="font-medium text-slate-800">{fmt(pitiMonthly)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-slate-200 pt-1 font-semibold">
            <span className="text-slate-700">Month total</span>
            <span className="text-red-700">{fmt(monthVariableTotal + pitiMonthly)}</span>
          </div>
        </div>
      </div>

      {/* Date range filter */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm mb-6 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGE_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                preset === p.id
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-emerald-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 lg:ml-auto">
          <input
            type="date"
            value={range.from}
            onChange={e => setBound('from', e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
            aria-label="From date"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={range.to}
            onChange={e => setBound('to', e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
            aria-label="To date"
          />
          {preset === 'custom' && (
            <button
              onClick={() => applyPreset('all')}
              className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              title="Clear date range"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium text-right">Amount</th>
              <th className="px-4 py-3 font-medium w-16" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400">
                  {allExpenses.length === 0 ? (
                    'No expenses yet. Add variable expenses above; PITI is set via the pencil above.'
                  ) : (
                    <>
                      No expenses in this date range.{' '}
                      <button onClick={() => applyPreset('all')} className="text-emerald-600 underline">
                        Show all {allExpenses.length}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ) : visible.map(e => (
              editId === e.id ? (
                <tr key={e.id} className="border-b border-slate-100 bg-emerald-50">
                  <td colSpan={5} className="px-4 py-3">
                    <ExpenseForm
                      f={editForm}
                      onChange={patch => setEditForm(p => ({ ...p, ...patch }))}
                      onSave={() => saveEdit(e.id)}
                      onCancel={() => setEditId(null)}
                      submitLabel="Update"
                    />
                  </td>
                </tr>
              ) : (
                <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{format(new Date(e.date), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3 capitalize text-slate-700">
                    {EXPENSE_CATEGORIES.find(c => c.value === e.category)?.label ?? e.category}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {e.description}
                    {e.recurring && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        Recurring
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">({fmt(e.amount)})</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(e)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteExpense(e.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
          {expenses.length > 0 && (
            <tfoot>
              {Object.entries(totalsByCategory).sort(([,a],[,b]) => b - a).map(([cat, total]) => (
                <tr key={cat} className="border-t border-slate-100 text-xs text-slate-500">
                  <td colSpan={3} className="px-4 py-1.5 pl-8">
                    {EXPENSE_CATEGORIES.find(c => c.value === cat)?.label ?? cat}
                  </td>
                  <td className="px-4 py-1.5 text-right text-slate-500">({fmt(total)})</td>
                  <td />
                </tr>
              ))}
              <tr className="bg-red-50 border-t-2 border-red-200 font-bold">
                <td colSpan={3} className="px-4 py-3 text-slate-800">Total Operating Expenses</td>
                <td className="px-4 py-3 text-right text-red-700 text-base">({fmt(grandTotal)})</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Analysis: a check you run, not the main event ── */}
      <div className="mt-6">
        <button
          onClick={() => setShowAnalysis(v => !v)}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800"
        >
          <span className="text-xs">{showAnalysis ? '▾' : '▸'}</span> Expense Analysis
        </button>
        {showAnalysis && (
          <div className="mt-3">
      {/* Expense Analysis */}
      {expenses.length > 0 && filterYear !== 'all' && (() => {
        const now = new Date();
        const thisMonthIdx = now.getMonth();
        const prevMonthIdx = thisMonthIdx === 0 ? 11 : thisMonthIdx - 1;
        const prevMonthYear = thisMonthIdx === 0 ? String(parseInt(filterYear) - 1) : filterYear;

        const currMonthExpenses = expenses.filter(e => {
          const d = new Date(e.date);
          return d.getFullYear() === parseInt(filterYear) && d.getMonth() === thisMonthIdx;
        });
        const priorMonthExpenses = (prevMonthYear === filterYear ? expenses : prevExpenses).filter(e => {
          const d = new Date(e.date);
          return d.getFullYear() === parseInt(prevMonthYear) && d.getMonth() === prevMonthIdx;
        });

        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">Expense Analysis</h2>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  onClick={() => setAnalysisTab('yoy')}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${analysisTab === 'yoy' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Year over Year
                </button>
                <button
                  onClick={() => setAnalysisTab('mom')}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${analysisTab === 'mom' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Month over Month
                </button>
              </div>
            </div>

            {analysisTab === 'yoy' ? (
              <AnalysisTable
                current={expenses}
                prior={prevExpenses}
                currentLabel={filterYear}
                priorLabel={String(parseInt(filterYear) - 1)}
                fmt={fmt}
              />
            ) : (
              <AnalysisTable
                current={currMonthExpenses}
                prior={priorMonthExpenses}
                currentLabel={MONTHS_SHORT[thisMonthIdx]}
                priorLabel={`${MONTHS_SHORT[prevMonthIdx]}${prevMonthYear !== filterYear ? ` '${prevMonthYear.slice(2)}` : ''}`}
                fmt={fmt}
              />
            )}

            <p className="text-xs text-slate-400 mt-3">
              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mr-2">↑ Up</span>
              ≥15% increase &nbsp;
              <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-1.5 py-0.5 rounded mr-2">↑ High</span>
              ≥50% increase &nbsp;
              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded mr-2">↓ Down/Low</span>
              decrease
            </p>
          </div>
        );
      })()}

          </div>
        )}
      </div>

    </div>
  );
}