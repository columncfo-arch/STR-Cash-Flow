'use client';
import { useEffect, useState } from 'react';
import { Expense, ExpenseCategory, EXPENSE_CATEGORIES, Settings } from '@/types';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, Check, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
  // For expenses, increase = bad (red), decrease = good (green); inverse flips this
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
                <td className="py-2.5 px-3 text-right font-medium text-slate-800">
                  {curr > 0 ? fmt(curr) : '—'}
                </td>
                <td className="py-2.5 px-3 text-right text-slate-500">
                  {curr > 0 ? `${pct(curr, currTotal).toFixed(1)}%` : '—'}
                </td>
                <td className="py-2.5 px-3 text-right text-slate-400">
                  {prev > 0 ? fmt(prev) : '—'}
                </td>
                <td className="py-2.5 px-3 text-right text-slate-400">
                  {prev > 0 ? `${pct(prev, prevTotal).toFixed(1)}%` : '—'}
                </td>
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [pitiEdit, setPitiEdit] = useState(false);
  const [pitiDraft, setPitiDraft] = useState('');
  const [analysisTab, setAnalysisTab] = useState<'yoy' | 'mom'>('yoy');

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  async function load() {
    const res = await fetch(`/api/expenses?year=${filterYear}`);
    setExpenses(await res.json());
    if (filterYear !== 'all') {
      const prevYear = String(parseInt(filterYear) - 1);
      const prevRes = await fetch(`/api/expenses?year=${prevYear}`);
      setPrevExpenses(await prevRes.json());
    } else {
      setPrevExpenses([]);
    }
  }

  useEffect(() => {
    load();
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, [filterYear]);

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

  async function savePiti() {
    if (!settings) return;
    const updated = { ...settings, monthlyPITI: parseFloat(pitiDraft) || 0 };
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setSettings(updated);
    setPitiEdit(false);
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

  const years = ['all', ...Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))];

  const totalsByCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  const grandTotal = expenses.reduce((s, e) => s + e.amount, 0);

  const pitiMonthly = settings?.monthlyPITI ?? 0;
  const pitiAnnual = pitiMonthly * 12;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="text-slate-500 text-sm mt-1">
            {expenses.length} entries {filterYear === 'all' ? 'across all years' : `in ${filterYear}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700">
            {years.map(y => <option key={y} value={y}>{y === 'all' ? 'All Years' : y}</option>)}
          </select>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Add Expense
          </button>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
        {pitiEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700">Monthly PITI ($)</p>
              <p className="text-xs text-slate-500 mt-0.5">Mortgage P&amp;I + property tax + insurance</p>
            </div>
            <input
              type="number"
              value={pitiDraft}
              onChange={e => setPitiDraft(e.target.value)}
              onBlur={savePiti}
              autoFocus
              placeholder="0"
              min="0"
              className="w-32 text-sm border border-slate-300 rounded-lg px-3 py-2 text-right"
              onKeyDown={e => { if (e.key === 'Enter') savePiti(); if (e.key === 'Escape') setPitiEdit(false); }}
            />
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => setPitiEdit(false)}
              className="flex items-center gap-1.5 border border-slate-200 bg-white px-3 py-2 rounded-lg text-sm hover:bg-slate-50">
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">PITI (Mortgage, Tax, Insurance)</p>
              <p className="text-xs text-slate-500 mt-0.5">Fixed monthly cost applied automatically to P&amp;L</p>
            </div>
            <div className="flex items-center gap-2">
              {pitiMonthly > 0 ? (
                <div className="text-right">
                  <p className="font-bold text-slate-800">{fmt(pitiMonthly)}<span className="text-xs font-normal text-slate-500">/mo</span></p>
                  {filterYear !== 'all' && <p className="text-xs text-slate-400">{fmt(pitiAnnual)}/yr</p>}
                </div>
              ) : (
                <span className="text-sm text-slate-400">Not set</span>
              )}
              <button
                onClick={() => { setPitiDraft(pitiMonthly > 0 ? String(pitiMonthly) : ''); setPitiEdit(true); }}
                className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                title="Edit PITI"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

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
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400">
                  No expenses yet. Add variable expenses above; PITI is set via the pencil above.
                </td>
              </tr>
            ) : expenses.map(e => (
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
    </div>
  );
}
