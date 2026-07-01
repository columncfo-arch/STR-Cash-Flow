'use client';
import { useState, useEffect } from 'react';
import { Home, Check, CreditCard, Zap, Shield, Star, ChevronDown, ChevronUp } from 'lucide-react';

type Step = 'hero' | 'submitted' | 'error';

const PLATFORM_FEE_PCT = 0.14;
const DIRECT_FEE_PCT = 0.03;

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function BookDirectPage() {
  const [step, setStep] = useState<Step>('hero');
  const [propertyName, setPropertyName] = useState('Our Property');
  const [tripBase, setTripBase] = useState(1000);
  const [showCalc, setShowCalc] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredDates, setPreferredDates] = useState('');
  const [tcpaConsent, setTcpaConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/welcome')
      .then(r => r.json())
      .then(d => { if (d.propertyName) setPropertyName(d.propertyName); })
      .catch(() => {});
  }, []);

  const platformTotal = tripBase * (1 + PLATFORM_FEE_PCT);
  const directTotal = tripBase * (1 + DIRECT_FEE_PCT);
  const savings = platformTotal - directTotal;
  const savingsPct = Math.round((savings / platformTotal) * 100);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName || !email) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/direct-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, phone, preferredDates, tcpaConsent }),
      });
      if (!res.ok) throw new Error();
      setStep('submitted');
    } catch {
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-500 text-sm">Something went wrong. Please try again or reach out directly.</p>
          <button
            onClick={() => setStep('hero')}
            className="mt-4 text-sm text-emerald-600 underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (step === 'submitted') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl mb-6 shadow-lg">
            <Check className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">You&apos;re on the list!</h1>
          <p className="text-slate-600 text-sm leading-relaxed mb-6">
            We&apos;ll be in touch to confirm your dates and send a direct booking link — no platform fees, just the best rate.
          </p>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-left space-y-3">
            <div className="flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-800 text-sm">Accepted payments</p>
                <p className="text-xs text-slate-500 mt-0.5">Credit/debit card (3% fee) · Zelle · Venmo · Bank transfer</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-800 text-sm">Same property, same experience</p>
                <p className="text-xs text-slate-500 mt-0.5">Everything you loved — just at a better price for both of us.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100">
      <div className="max-w-lg mx-auto px-4 py-12">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-600 rounded-2xl mb-4 shadow-lg">
            <Home className="w-7 h-7 text-white" />
          </div>
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 text-xs font-semibold mb-4">
            <Star className="w-3 h-3" />
            Returning Guest Exclusive
          </div>
          <h1 className="text-3xl font-bold text-slate-900 leading-tight">
            Book direct.<br />
            <span className="text-emerald-600">Save up to {savingsPct}%.</span>
          </h1>
          <p className="text-slate-500 mt-3 text-sm leading-relaxed max-w-sm mx-auto">
            Skip the platform fees and book {propertyName} directly with us.
            You get the best rate — we both win.
          </p>
        </div>

        {/* Value prop cards */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600 mb-1">0%</div>
            <p className="text-xs text-slate-500">Platform service fee</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-slate-800 mb-1">3%</div>
            <p className="text-xs text-slate-500">Card processing only</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600 mb-1">~{savingsPct}%</div>
            <p className="text-xs text-slate-500">You save vs. platform</p>
          </div>
        </div>

        {/* Savings calculator */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCalc(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              See your savings — interactive calculator
            </span>
            {showCalc ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {showCalc && (
            <div className="px-6 pb-6 border-t border-slate-100">
              <div className="mt-4 mb-5">
                <label className="text-xs font-medium text-slate-500 block mb-3">
                  Trip base price (nightly rate × nights)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={200}
                    max={5000}
                    step={50}
                    value={tripBase}
                    onChange={e => setTripBase(Number(e.target.value))}
                    className="flex-1 accent-emerald-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 w-20 text-right">{fmt(tripBase)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="text-xs text-red-500 font-medium mb-1">Via platform (Airbnb)</p>
                  <p className="text-xl font-bold text-red-700">{fmt(platformTotal)}</p>
                  <p className="text-xs text-red-400 mt-1">Includes ~14% service fee</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-xs text-emerald-600 font-medium mb-1">Book direct with us</p>
                  <p className="text-xl font-bold text-emerald-700">{fmt(directTotal)}</p>
                  <p className="text-xs text-emerald-500 mt-1">Only 3% card processing</p>
                </div>
              </div>

              <div className="mt-3 bg-emerald-600 rounded-xl p-4 text-center text-white">
                <p className="text-xs font-medium opacity-80 mb-1">Your savings</p>
                <p className="text-2xl font-bold">{fmt(savings)}</p>
                <p className="text-xs opacity-70 mt-1">({savingsPct}% less than the platform price)</p>
              </div>
            </div>
          )}
        </div>

        {/* Payment methods */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-slate-800 text-sm">Flexible payment options</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Credit / Debit Card', note: '3% processing fee' },
              { label: 'Zelle', note: 'No fee' },
              { label: 'Venmo', note: 'No fee' },
              { label: 'Bank Transfer', note: 'No fee' },
            ].map(({ label, note }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                <div>
                  <span className="font-medium">{label}</span>
                  <span className="text-slate-400 ml-1">({note})</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interest form */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-800 mb-1">Request your direct booking</h2>
          <p className="text-xs text-slate-400 mb-5">
            Share your details and preferred dates — we&apos;ll send a booking link within 24 hours.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  First name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Jane"
                  className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Smith"
                  className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">
                Email address <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Phone (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Preferred dates (optional)</label>
              <input
                type="text"
                value={preferredDates}
                onChange={e => setPreferredDates(e.target.value)}
                placeholder="e.g. July 4–7 or flexible in August"
                className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={tcpaConsent}
                onChange={e => setTcpaConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 flex-shrink-0"
              />
              <span className="text-xs text-slate-400 leading-relaxed">
                I agree to receive marketing text messages (e.g. availability and booking offers) from{' '}
                <span className="font-medium text-slate-600">{propertyName}</span> at the number provided.
                Message &amp; data rates may apply. Reply <strong>STOP</strong> to opt out at any time.
                Consent is not required to request a direct booking.
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting || !firstName || !email}
              className="w-full bg-emerald-600 text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Sending request…' : `Get My Direct Booking Rate →`}
            </button>

            <p className="text-xs text-center text-slate-400">
              No commitment required. We&apos;ll confirm availability and send your custom link.
            </p>
          </form>
        </div>

        <p className="text-xs text-center text-slate-400 mt-6">
          {propertyName} · Best rate guarantee for returning guests
        </p>
      </div>
    </div>
  );
}
