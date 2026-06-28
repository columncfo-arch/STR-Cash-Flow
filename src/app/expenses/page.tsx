'use client';
import { useEffect, useState } from 'react';
import { Expense, ExpenseCategory, EXPENSE_CATEGORIES, Settings, UTILITY_SUBCATEGORIES } from '@/types';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';

interface FormState {
  date: string;
  category: ExpenseCategory;
  subcategory: string;
  description: string;
  amount: string;
}

function emptyForm(): FormState {
  return {
    date: new Date().toISOString().slice(0, 10),
    category: 'utilities',
    subcategory: '',
    description: '',
    amount: '',
  };
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  async function load() {
    const res = await fetch(`/api/expenses?year=${filterYear}`);
    setExpenses(await res.json());
  }

  useEffect(() => {
    load();
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, [filterYear]);

  async function addExpense() {
    if (!form.amount || !form.date || !form.description) return;
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: form.date,
        category: form.category,
        subcategory: form.category === 'utilities' ? form.subcategory : undefined,
        description: form.description,
        amount: parseFloat(form.amount) || 0,
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
        subcategory: editForm.category === 'utilities' ? editForm.subcategory : undefined,
        description: editForm.description,
        amount: parseFloat(editForm.amount) || 0,
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
      subcategory: e.subcategory ?? '',
      description: e.description,
      amount: String(e.amount),
    });
  }

  const years = ['all', ...Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))];

  // Group expenses by category for totals
  const totalsByCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  const grandTotal = expenses.reduce((s, e) => s + e.amount, 0);

  const pitiMonthly = settings?.monthlyPITI ?? 0;
  const pitiAnnual = pitiMonthly * 12;

  function ExpenseForm({ f, onChange, onSave, onCancel }: {
    f: FormState;
    onChange: (patch: Partial<FormState>) => void;
    onSave: () => void;
    onCancel: () => void;
  }) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Date</label>
          <input type="date" value={f.date} onChange={e => onChange({ date: e.target.value })}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Category</label>
          <select value={f.category} onChange={e => onChange({ category: e.target.value as ExpenseCategory, subcategory: '' })}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2">
            {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        {f.category === 'utilities' && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Utility Type</label>
            <select value={f.subcategory} onChange={e => onChange({ subcategory: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2">
              <option value="">Select...</option>
              {UTILITY_SUBCATEGORIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Description</label>
          <input type="text" value={f.description} onChange={e => onChange({ description: e.target.value })}
            placeholder="e.g. April electric bill"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Amount ($)</label>
          <input type="number" value={f.amount} onChange={e => onChange({ amount: e.target.value })}
            placeholder="0.00" min="0" step="0.01"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
        </div>
        <div className="flex items-end gap-2">
          <button onClick={onSave}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700">
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button onClick={onCancel}
            className="flex items-center gap-1.5 border border-slate-200 px-4 py-2 rounded-lg text-sm hover:bg-slate-50">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>
    );
  }

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

      {/* PITI banner */}
      {pitiMonthly > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">PITI (Mortgage, Tax, Insurance)</p>
            <p className="text-xs text-slate-500 mt-0.5">Fixed monthly cost set in Settings — applied automatically to P&amp;L</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-slate-800">{fmt(pitiMonthly)}<span className="text-xs font-normal text-slate-500">/mo</span></p>
            {filterYear !== 'all' && <p className="text-xs text-slate-400">{fmt(pitiAnnual)}/yr</p>}
          </div>
        </div>
      )}

      {/* Add expense form */}
      {showAdd && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-4">New Expense</h2>
          <ExpenseForm
            f={form}
            onChange={patch => setForm(p => ({ ...p, ...patch }))}
            onSave={addExpense}
            onCancel={() => { setShowAdd(false); setForm(emptyForm()); }}
          />
        </div>
      )}

      {/* Expense table */}
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
                  No expenses yet. Add variable expenses above; set PITI in Settings.
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
                    />
                  </td>
                </tr>
              ) : (
                <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{format(new Date(e.date), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="capitalize text-slate-700">
                        {EXPENSE_CATEGORIES.find(c => c.value === e.category)?.label ?? e.category}
                      </span>
                      {e.subcategory && (
                        <span className="text-xs text-slate-400">· {e.subcategory}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{e.description}</td>
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
              {/* Category subtotals */}
              {Object.entries(totalsByCategory).sort(([,a],[,b]) => b - a).map(([cat, total]) => (
                <tr key={cat} className="border-t border-slate-100 text-xs text-slate-500">
                  <td colSpan={3} className="px-4 py-1.5 pl-8 capitalize">
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
