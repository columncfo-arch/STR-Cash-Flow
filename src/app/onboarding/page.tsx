'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Check, ChevronRight, Home, Building2, TreePine, Waves } from 'lucide-react';

const PROPERTY_TYPES = [
  { id: 'house',  label: 'House',       icon: Home },
  { id: 'condo',  label: 'Condo / Apt', icon: Building2 },
  { id: 'cabin',  label: 'Cabin',       icon: TreePine },
  { id: 'beach',  label: 'Beach house', icon: Waves },
];

const PLATFORMS = [
  { id: 'airbnb',  label: 'Airbnb',          color: 'bg-rose-500' },
  { id: 'vrbo',    label: 'VRBO',             color: 'bg-indigo-500' },
  { id: 'booking', label: 'Booking.com',      color: 'bg-blue-500' },
  { id: 'direct',  label: 'Direct bookings',  color: 'bg-emerald-500' },
];

const STEP_LABELS = ['Account', 'Your property', 'Platforms', 'Set targets'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [piti, setPiti] = useState('');
  const [annualTarget, setAnnualTarget] = useState('');
  const [occTarget, setOccTarget] = useState('');

  function togglePlatform(id: string) {
    setPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }

  const canAdvance = [
    name.trim().length > 0 && email.includes('@'),
    propertyName.trim().length > 0 && propertyType.length > 0,
    platforms.length > 0,
    true,
  ][step];

  async function finish() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings');
      const current = await res.json();
      const year = String(new Date().getFullYear());
      const updated = {
        ...current,
        propertyName: propertyName.trim() || 'My Property',
        ...(piti ? { monthlyPITI: parseFloat(piti) } : {}),
        ...(occTarget ? { targetOccupancyPct: parseFloat(occTarget) } : {}),
        ...(annualTarget ? {
          forecastOverrides: {
            ...(current.forecastOverrides ?? {}),
            [year]: {
              ...(current.forecastOverrides?.[year] ?? {}),
              revenue: parseFloat(annualTarget),
            },
          },
        } : {}),
      };
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      router.push('/');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-600" />
          <span className="font-bold text-slate-900">HostIQ</span>
        </div>
        <p className="text-xs text-slate-400">Step {step + 1} of {STEP_LABELS.length}</p>
      </div>

      {/* Progress bar */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-xl mx-auto px-6 py-4">
          <div className="flex items-center gap-1">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center gap-1 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                  i < step ? 'bg-emerald-600 text-white' :
                  i === step ? 'bg-emerald-600 text-white' :
                  'bg-slate-100 text-slate-400'
                }`}>
                  {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-xs hidden sm:block transition-colors ${i === step ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                  {label}
                </span>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`h-px flex-1 mx-1 transition-colors ${i < step ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-start justify-center py-12 px-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 w-full max-w-lg">

          {/* ── Step 0: Account ── */}
          {step === 0 && (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome to HostIQ</h1>
              <p className="text-slate-500 text-sm mb-8">Your 3-month free trial starts today. No credit card needed.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Your name</label>
                  <input
                    autoFocus
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && canAdvance && setStep(1)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="jane@example.com"
                  />
                </div>
              </div>
              <div className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <p className="text-sm font-semibold text-emerald-800">3 months free, then $19–79/mo</p>
                <p className="text-xs text-emerald-600 mt-0.5">Cancel anytime. Pricing based on number of properties.</p>
              </div>
            </>
          )}

          {/* ── Step 1: Property ── */}
          {step === 1 && (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Your property</h1>
              <p className="text-slate-500 text-sm mb-8">Tell us about the property you want to track first.</p>
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Property name</label>
                  <input
                    autoFocus
                    type="text"
                    value={propertyName}
                    onChange={e => setPropertyName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="112 Surf Drive"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-3">Property type</label>
                  <div className="grid grid-cols-2 gap-3">
                    {PROPERTY_TYPES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setPropertyType(t.id)}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors text-left ${
                          propertyType === t.id
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <t.icon className={`w-5 h-5 flex-shrink-0 ${propertyType === t.id ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className={`text-sm font-medium ${propertyType === t.id ? 'text-emerald-700' : 'text-slate-600'}`}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Step 2: Platforms ── */}
          {step === 2 && (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Where do you list?</h1>
              <p className="text-slate-500 text-sm mb-8">Select all platforms you use. You'll import earnings from each one.</p>
              <div className="space-y-3">
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors text-left ${
                      platforms.includes(p.id)
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className={`w-8 h-8 ${p.color} rounded-lg flex-shrink-0`} />
                    <span className={`font-medium text-sm flex-1 ${platforms.includes(p.id) ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {p.label}
                    </span>
                    {platforms.includes(p.id) && <Check className="w-4 h-4 text-emerald-600" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Step 3: Targets ── */}
          {step === 3 && (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Set your targets</h1>
              <p className="text-slate-500 text-sm mb-8">Optional — you can set these any time in the app. These help HostIQ show you how you're pacing.</p>
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Monthly mortgage (PITI)</label>
                  <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 bg-white">
                    <span className="text-slate-400 text-sm px-3 border-r border-slate-200 py-3">$</span>
                    <input
                      type="number"
                      value={piti}
                      onChange={e => setPiti(e.target.value)}
                      className="flex-1 py-3 px-3 text-sm outline-none"
                      placeholder="2,800"
                    />
                    <span className="text-slate-400 text-xs pr-3">/mo</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Principal, interest, taxes &amp; insurance</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Annual revenue target</label>
                  <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 bg-white">
                    <span className="text-slate-400 text-sm px-3 border-r border-slate-200 py-3">$</span>
                    <input
                      type="number"
                      value={annualTarget}
                      onChange={e => setAnnualTarget(e.target.value)}
                      className="flex-1 py-3 px-3 text-sm outline-none"
                      placeholder="68,500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Occupancy target</label>
                  <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 bg-white">
                    <input
                      type="number"
                      value={occTarget}
                      onChange={e => setOccTarget(e.target.value)}
                      className="flex-1 py-3 pl-4 text-sm outline-none"
                      placeholder="70"
                    />
                    <span className="text-slate-400 text-sm px-3 border-l border-slate-200 py-3">%</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
            {step > 0 ? (
              <button onClick={() => setStep(s => s - 1)} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                ← Back
              </button>
            ) : <div />}

            {step < STEP_LABELS.length - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance}
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/')}
                  className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Skip for now
                </button>
                <button
                  onClick={finish}
                  disabled={saving}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-40"
                >
                  {saving ? 'Setting up…' : 'Go to dashboard'}
                  {!saving && <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
