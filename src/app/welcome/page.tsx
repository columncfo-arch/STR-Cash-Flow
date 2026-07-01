'use client';
import { useEffect, useState } from 'react';
import { Wifi, MapPin, Check, Home } from 'lucide-react';

type Step = 'loading' | 'form' | 'success' | 'error';

interface WelcomeInfo {
  propertyName: string;
  wifiNetwork: string | null;
  wifiPassword: string | null;
  welcomeMessage: string | null;
  localGuideUrl: string | null;
}

export default function WelcomePage() {
  const [step, setStep] = useState<Step>('loading');
  const [propertyName, setPropertyName] = useState('');
  const [hasWifi, setHasWifi] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tcpaConsent, setTcpaConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<WelcomeInfo | null>(null);
  const [copied, setCopied] = useState<'network' | 'password' | null>(null);

  useEffect(() => {
    fetch('/api/welcome')
      .then(r => r.json())
      .then(d => {
        setPropertyName(d.propertyName ?? 'Your Stay');
        setHasWifi(d.hasWifi ?? false);
        setStep('form');
      })
      .catch(() => setStep('error'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, phone, tcpaConsent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInfo(data);
      setStep('success');
    } catch {
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  }

  function copy(text: string, field: 'network' | 'password') {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-500 text-sm">Something went wrong. Please try again or ask your host for the wifi details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-sm w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-600 rounded-2xl mb-4 shadow-lg">
            <Home className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome!</h1>
          <p className="text-slate-500 text-sm mt-1">{propertyName}</p>
        </div>

        {step === 'form' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <p className="text-slate-600 text-sm mb-5 text-center">
              {hasWifi
                ? 'Register your stay to instantly receive the wifi password and local guide.'
                : 'Register your stay and we\'ll share local tips and future availability.'}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">First name <span className="text-red-400">*</span></label>
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
                <label className="text-xs font-medium text-slate-500 block mb-1">Email address <span className="text-red-400">*</span></label>
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

              {/* TCPA consent */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tcpaConsent}
                  onChange={e => setTcpaConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 flex-shrink-0"
                />
                <span className="text-xs text-slate-400 leading-relaxed">
                  I agree to receive marketing text messages (e.g. availability alerts and offers) from{' '}
                  <span className="font-medium text-slate-600">{propertyName}</span> at the number provided.
                  Message &amp; data rates may apply. Reply <strong>STOP</strong> to opt out at any time.
                  Consent is not required to receive the wifi password.
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting || !email || !firstName}
                className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
              >
                {submitting ? 'Just a moment…' : hasWifi ? 'Get Wifi Password →' : 'Register My Stay →'}
              </button>
            </form>
          </div>
        )}

        {step === 'success' && info && (
          <div className="space-y-4">

            {/* Welcome message */}
            {info.welcomeMessage && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <p className="text-slate-700 text-sm leading-relaxed">{info.welcomeMessage}</p>
              </div>
            )}

            {/* Wifi card */}
            {(info.wifiNetwork || info.wifiPassword) && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Wifi className="w-5 h-5 text-emerald-600" />
                  <span className="font-semibold text-slate-800">Wifi</span>
                </div>
                {info.wifiNetwork && (
                  <div className="mb-3">
                    <p className="text-xs text-slate-400 mb-1">Network</p>
                    <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                      <span className="font-mono text-sm font-semibold text-slate-800">{info.wifiNetwork}</span>
                      <button
                        onClick={() => copy(info.wifiNetwork!, 'network')}
                        className="text-xs text-emerald-600 font-medium hover:text-emerald-700 ml-2"
                      >
                        {copied === 'network' ? <Check className="w-4 h-4" /> : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
                {info.wifiPassword && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Password</p>
                    <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                      <span className="font-mono text-sm font-semibold text-slate-800 tracking-wide">{info.wifiPassword}</span>
                      <button
                        onClick={() => copy(info.wifiPassword!, 'password')}
                        className="text-xs text-emerald-600 font-medium hover:text-emerald-700 ml-2"
                      >
                        {copied === 'password' ? <Check className="w-4 h-4" /> : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Local guide */}
            {info.localGuideUrl && (
              <a
                href={info.localGuideUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:bg-slate-50 transition-colors"
              >
                <MapPin className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Local Guide</p>
                  <p className="text-xs text-slate-400">Restaurants, activities &amp; tips from your host</p>
                </div>
                <span className="ml-auto text-slate-300">→</span>
              </a>
            )}

            <div className="text-center pt-2">
              <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 rounded-full px-4 py-2 text-xs font-medium">
                <Check className="w-3.5 h-3.5" />
                You&apos;re all set — enjoy your stay!
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
