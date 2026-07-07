'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { BookOpen, Check, Upload, DollarSign, BarChart3, ArrowRight } from 'lucide-react';

const NEXT_STEPS = [
  {
    icon: Upload,
    title: 'Import your earnings',
    body: 'Upload a CSV from Airbnb, VRBO, or Booking.com to populate your income history.',
    href: '/import',
    cta: 'Import now →',
    primary: true,
  },
  {
    icon: DollarSign,
    title: 'Add your expenses',
    body: 'Enter your mortgage (PITI) and recurring costs so your net income is accurate.',
    href: '/expenses',
    cta: 'Add expenses →',
    primary: false,
  },
  {
    icon: BarChart3,
    title: 'Review your forecast',
    body: 'See where your property is heading this year and adjust your revenue targets.',
    href: '/forecast',
    cta: 'View forecast →',
    primary: false,
  },
];

function ConfirmContent() {
  const searchParams = useSearchParams();
  const propertyName = searchParams.get('property') || 'My Property';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-600" />
          <span className="font-bold text-slate-900">HostCFO</span>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center py-12 px-4">
        <div className="w-full max-w-lg space-y-6">

          {/* Hero card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              Trial active · 14 days free
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              {propertyName} is set up
            </h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              Your account is ready. Now let's get your numbers in so you can see your real cash flow.
            </p>
          </div>

          {/* Step trail */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
            {[
              { label: 'Account created', done: true },
              { label: 'Property configured', done: true },
              { label: 'Import earnings', done: false },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-6 py-4">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item.done ? 'bg-emerald-500' : 'border-2 border-slate-200'
                }`}>
                  {item.done && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className={`text-sm ${item.done ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                  {item.label}
                </span>
                {!item.done && <span className="ml-auto text-xs text-slate-400">Next</span>}
              </div>
            ))}
          </div>

          {/* Next steps */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">Next steps</p>
            {NEXT_STEPS.map((step) => (
              <Link
                key={step.href}
                href={step.href}
                className={`block rounded-2xl border shadow-sm p-5 transition-colors group ${
                  step.primary
                    ? 'bg-emerald-600 border-emerald-600 hover:bg-emerald-700'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    step.primary ? 'bg-emerald-500' : 'bg-slate-100'
                  }`}>
                    <step.icon className={`w-4 h-4 ${step.primary ? 'text-white' : 'text-slate-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold mb-0.5 ${step.primary ? 'text-white' : 'text-slate-900'}`}>
                      {step.title}
                    </p>
                    <p className={`text-xs leading-relaxed ${step.primary ? 'text-emerald-100' : 'text-slate-500'}`}>
                      {step.body}
                    </p>
                  </div>
                  <ArrowRight className={`w-4 h-4 flex-shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5 ${
                    step.primary ? 'text-emerald-200' : 'text-slate-300'
                  }`} />
                </div>
              </Link>
            ))}
          </div>

          <div className="text-center">
            <Link href="/" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Go to dashboard instead →
            </Link>
          </div>
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
