'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Suspense, useState } from 'react';
import { BookOpen, Check, Upload, DollarSign, LayoutDashboard, MessageSquare, ArrowRight, Loader2 } from 'lucide-react';

const SELF_SERVE_STEPS = [
  { n: 1, icon: Upload,          title: 'Import your earnings', body: 'Upload a CSV from Airbnb, VRBO, or Booking.com.',  href: '/import' },
  { n: 2, icon: DollarSign,      title: 'Add your expenses',    body: 'Enter your mortgage (PITI) and recurring costs.',  href: '/expenses' },
  { n: 3, icon: LayoutDashboard, title: 'See your cash flow',   body: 'Your P&L, forecast, and pacing — all in one view.', href: '/' },
];

function ConfirmContent() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const propertyName = searchParams.get('property') || 'My Property';

  const [helpOpen, setHelpOpen] = useState(false);
  const [note, setNote] = useState('');
  const [helpState, setHelpState] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function requestHelp() {
    setHelpState('sending');
    try {
      await fetch('/api/request-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: user?.fullName ?? user?.firstName ?? '',
          email: user?.primaryEmailAddress?.emailAddress ?? '',
          propertyName,
          note: note.trim() || undefined,
        }),
      });
    } catch { /* silently succeed */ }
    setHelpState('sent');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-600" />
          <span className="font-bold text-slate-900">HostCFO</span>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center py-10 px-4">
        <div className="w-full max-w-2xl space-y-6">

          {/* Hero */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Trial active · 14 days free
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">
              {propertyName} is set up
            </h1>
            <p className="text-slate-500 text-sm">
              Your account is ready. Choose how you'd like to get started.
            </p>
          </div>

          {/* Two paths */}
          <div className="grid sm:grid-cols-2 gap-4">

            {/* Path A — Self-serve */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Set up yourself</p>
              <div className="space-y-4 flex-1">
                {SELF_SERVE_STEPS.map(s => (
                  <Link
                    key={s.href}
                    href={s.href}
                    className="flex items-start gap-3 group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-emerald-50 flex items-center justify-center flex-shrink-0 transition-colors mt-0.5">
                      <s.icon className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 group-hover:text-emerald-700 transition-colors leading-tight">
                        {s.n}. {s.title}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug">{s.body}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500 flex-shrink-0 mt-1 transition-colors" />
                  </Link>
                ))}
              </div>
              <Link
                href="/import"
                className="mt-6 block text-center bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                Import your earnings →
              </Link>
            </div>

            {/* Path B — Assisted setup */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm p-6 flex flex-col">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Get a guided setup</p>

              {helpState === 'sent' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
                  <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center mb-3">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-white font-semibold text-sm mb-1">Request received</p>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    We'll reach out within one business day to schedule your walkthrough.
                  </p>
                  <Link href="/" className="mt-5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                    Go to dashboard →
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <p className="text-slate-300 text-sm leading-relaxed mb-4">
                      We'll import your first CSV, configure your expenses, and walk you through the dashboard live. Takes about 20 minutes.
                    </p>
                    <div className="flex items-center gap-2 mb-5">
                      <div className="flex -space-x-1.5">
                        {['C', 'J'].map(l => (
                          <div key={l} className="w-6 h-6 rounded-full bg-emerald-600 border-2 border-slate-900 flex items-center justify-center text-white text-xs font-bold">
                            {l}
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-slate-400">Avg. response &lt; 1 business day</span>
                    </div>

                    {helpOpen && (
                      <div className="mb-4">
                        <label className="text-xs text-slate-400 block mb-1.5">Anything we should know? (optional)</label>
                        <textarea
                          autoFocus
                          rows={3}
                          value={note}
                          onChange={e => setNote(e.target.value)}
                          placeholder="e.g. I have 2 years of Airbnb history to import, prefer morning calls"
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                        />
                      </div>
                    )}
                  </div>

                  {!helpOpen ? (
                    <button
                      onClick={() => setHelpOpen(true)}
                      className="flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-900 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Request a walkthrough
                    </button>
                  ) : (
                    <button
                      onClick={requestHelp}
                      disabled={helpState === 'sending'}
                      className="flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-900 text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60"
                    >
                      {helpState === 'sending' ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                      ) : (
                        <>Send request</>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-slate-400">
            Already familiar with the app?{' '}
            <Link href="/" className="text-slate-500 hover:text-slate-700 underline underline-offset-2 transition-colors">
              Go straight to the dashboard
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmContent />
    </Suspense>
  );
}
