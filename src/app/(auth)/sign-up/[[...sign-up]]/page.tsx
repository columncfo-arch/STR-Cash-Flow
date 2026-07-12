'use client';
import { SignUp, useClerk } from '@clerk/nextjs';
import { BookOpen, Check } from 'lucide-react';
import { useEffect, useState } from 'react';

const STEP_LABELS = ['Your property', 'Platforms', 'Set targets', 'Create account'];

export default function SignUpPage() {
  const { signOut, session } = useClerk();
  const [ready, setReady] = useState(false);
  const fromOnboarding = typeof window !== 'undefined' && !!sessionStorage.getItem('hostcfo_onboarding');

  // Sign out any existing session so the user always sees the sign-up form
  useEffect(() => {
    if (session) {
      signOut().then(() => setReady(true));
    } else {
      setReady(true);
    }
  }, [session, signOut]);

  if (!ready) return null;

  if (!fromOnboarding) {
    return <SignUp fallbackRedirectUrl="/onboarding/confirm" />;
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-6 py-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span className="font-bold text-sm text-slate-900">HostCFO</span>
          </div>
          <p className="text-xs text-slate-400">Step 4 of 4</p>
        </div>
        <div className="flex items-center gap-1">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-1 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                i < 3 ? 'bg-emerald-600 text-white' : 'bg-emerald-600 text-white'
              }`}>
                {i < 3 ? <Check className="w-3.5 h-3.5" /> : 4}
              </div>
              <span className={`text-xs hidden sm:block ${i === 3 ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && (
                <div className={`h-px flex-1 mx-1 ${i < 3 ? 'bg-emerald-300' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <SignUp fallbackRedirectUrl="/onboarding/confirm" />
      </div>
    </div>
  );
}
