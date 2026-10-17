'use client';
import { ArrowRight, Check } from 'lucide-react';

/**
 * What a property still needs before its dashboard can say anything.
 *
 * A unit added today has no bookings, no mortgage and no goal, so every figure
 * on the page is zero and every chart is empty — which looks like a broken
 * dashboard rather than one waiting to be told about a property. This says what
 * is missing, in the order it is worth doing, and disappears once the unit has
 * its first stay.
 */
export default function PropertySetup({
  propertyName, hasPITI, hasTarget,
}: {
  propertyName: string;
  hasPITI: boolean;
  hasTarget: boolean;
}) {
  const steps = [
    {
      done: true,
      title: 'Add the property',
      body: `${propertyName} is on your account.`,
      href: null,
    },
    {
      done: hasPITI,
      title: 'Enter the mortgage payment',
      body: 'PITI, the loan balance and the rate. Without them every cost figure is revenue minus nothing.',
      href: '/optimization',
      cta: 'Open PITI & Mortgage',
    },
    {
      done: hasTarget,
      title: 'Set this year’s revenue target',
      body: 'The pencil on the Gross Revenue tile. Pacing, the plan rings and every status read against it.',
      href: null,
    },
    {
      done: false,
      title: 'Bring in the bookings',
      body: 'Sync Hostex to pull this unit’s stays, or import a CSV from Airbnb, VRBO or Booking.com.',
      href: '/settings',
      cta: 'Import or connect',
    },
  ];

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h2 className="text-xs uppercase tracking-wide text-slate-900 font-semibold">
          Set up {propertyName}
        </h2>
      </div>
      <ol className="divide-y divide-slate-50">
        {steps.map(step => (
          <li key={step.title} className="flex items-start gap-3 px-5 py-3">
            <span
              className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                step.done ? 'border-emerald-500 text-emerald-600' : 'border-slate-300'
              }`}
            >
              {step.done && <Check className="w-2.5 h-2.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${step.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                {step.title}
              </p>
              {!step.done && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{step.body}</p>}
            </div>
            {!step.done && step.href && (
              <a
                href={step.href}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 whitespace-nowrap mt-0.5"
              >
                {step.cta} <ArrowRight className="w-3 h-3" />
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
