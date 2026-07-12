'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
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

const STEP_LABELS_NEW  = ['Your property', 'Platforms', 'Set targets', 'Create account'];
const STEP_LABELS_AUTH = ['Your property', 'Platforms', 'Set targets'];

export default function OnboardingPage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const STEP_LABELS = isSignedIn ? STEP_LABELS_AUTH : STEP_LABELS_NEW;
  const [step, setStep] = useState(0);

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
    propertyName.trim().length > 0 && propertyType.length > 0,
    platforms.length > 0,
    true,
  ][step] ?? true;

  function goToSignUp() {
    sessionStorage.setItem('hostcfo_onboarding', JSON.stringify({
      propertyName: propertyName.trim() || 'My Property',
      propertyType,
      platforms,
      piti: piti ? parseFloat(piti) : undefined,
      occTarget: occTarget ? parseFloat(occTarget) : undefined,
      annualTarget: annualTarget ? parseFloat(annualTarget) : undefined,
    }));
    // Already signed in — skip account creation, apply settings on confirm page
    router.push(isSignedIn ? '/onboarding/confirm' : '/sign-up');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-600" />
          <span className="font-bold text-slate-900">HostCFO</span>
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

            {/* ── Step 0: Property ── */}
            {step === 0 && (
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

            {/* ── Step 1: Platforms ── */}
            {step === 1 && (
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

            {/* ── Step 2: Targets ── */}
            {step === 2 && (
              <>
                <h1 className="text-2xl font-bold text-slate-900 mb-1">Set your targets</h1>
                <p className="text-slate-500 text-sm mb-8">Optional — you can set these any time in the app.</p>
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

              {step < 2 ? (
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
                    onClick={goToSignUp}
                    className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Skip for now
                  </button>
                  <button
                    onClick={goToSignUp}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  );
}
