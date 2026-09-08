'use client';
import Link from 'next/link';
import { BookOpen, TrendingUp, Users, BarChart3, ChevronRight, Check } from 'lucide-react';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

const FEATURES: { icon: React.ComponentType<{ className?: string }>; title: React.ReactNode; description: string; iconColor: string; iconBg: string }[] = [
  {
    icon: TrendingUp,
    title: 'Build a financial forecast — and hit your revenue goals',
    description: "Most owners never set a real target — they eyeball generic market averages and find out they're behind only when the season's already over. HostCFO builds a forecast from your own historical performance, tracks you against it month by month, and shows you the specific levers — rate, occupancy, length of stay — to close the gap before it becomes one.",
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
  },
  {
    icon: BarChart3,
    title: 'Plan long-term to increase return on investment',
    description: "Your rental is an investment, not just a monthly payout. HostCFO projects your equity as your loan pays down and your property appreciates, and tracks your total return — equity plus cash flow — against every dollar you've put in, so you can see the long-term payoff, not just this month's numbers.",
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
  },
  {
    icon: Users,
    title: <>Higher rates lose bookings. <strong>Guest List</strong> helps you win them back.</>,
    description: 'Airbnb limits how you can contact past guests, so most hosts lose the relationship the moment checkout ends. HostCFO gives you a direct guest list, so next season\'s booking doesn\'t start from zero.',
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-50',
  },
];

const PRICING = [
  {
    name: 'Solo',
    price: 19,
    properties: '1–2 properties',
    features: ['Full P&L dashboard', 'Income statement', 'Revenue forecasting', 'Guest list & direct booking', 'CSV import'],
    highlight: false,
  },
  {
    name: 'Pro',
    price: 39,
    properties: '3–5 properties',
    features: ['Everything in Solo', 'Multi-property dashboard', 'Portfolio forecasting', 'Priority support'],
    highlight: true,
  },
  {
    name: 'Portfolio',
    price: 79,
    properties: '6–10 properties',
    features: ['Everything in Pro', 'Portfolio-level P&L', 'Custom booking domains', 'Dedicated support'],
    highlight: false,
  },
];

const STEPS = [
  { n: '01', title: 'Import your earnings', body: 'Upload a CSV from Airbnb, VRBO, or Booking.com. Takes 30 seconds.' },
  { n: '02', title: 'Add your expenses', body: 'Enter your mortgage (PITI). Platform fees are pulled automatically from your import.' },
  { n: '03', title: 'See your real numbers', body: 'Net income, forecasts, and pacing against your annual target — all in one place.' },
];

const PLATFORMS = ['Airbnb', 'Vrbo', 'Booking.com', 'Expedia', 'Agoda', 'Trip.com', 'Houfy', 'Google Vacation Rentals'];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Top nav */}
      <header className="border-b border-slate-100 bg-white/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            <span className="font-bold text-slate-900">HostCFO</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`${APP_URL}/sign-in`} className="text-sm text-slate-500 hover:text-slate-800 transition-colors">Log in</Link>
            <Link href={`${APP_URL}/onboarding`} className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap">
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 640" preserveAspectRatio="xMidYMid slice" fill="none">
            <defs>
              <linearGradient id="heroLineA" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0" />
                <stop offset="60%" stopColor="#34d399" stopOpacity="0.07" />
                <stop offset="100%" stopColor="#047857" stopOpacity="0.14" />
              </linearGradient>
              <linearGradient id="heroLineB" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0" />
                <stop offset="60%" stopColor="#10b981" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.11" />
              </linearGradient>
              <filter id="heroSoftBlur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="18" />
              </filter>
            </defs>

            {/* soft ribbon glow, logarithmic sweep: steep rise then flattening toward upper right */}
            <path
              d="M -150 620 C 0 460, 150 350, 320 300 C 550 240, 800 200, 1050 175 C 1300 155, 1500 140, 1800 130"
              stroke="url(#heroLineA)"
              strokeWidth="80"
              strokeLinecap="round"
              filter="url(#heroSoftBlur)"
            />
            <path
              d="M -150 560 C 0 410, 140 300, 310 255 C 550 195, 800 160, 1040 140 C 1280 120, 1480 108, 1800 100"
              stroke="url(#heroLineB)"
              strokeWidth="48"
              strokeLinecap="round"
              filter="url(#heroSoftBlur)"
            />

            {/* crisp ascending chart line, same logarithmic shape */}
            <path
              d="M -80 540 C 40 400, 140 300, 300 255 C 520 200, 740 165, 980 140 C 1220 118, 1420 105, 1700 98"
              stroke="#059669"
              strokeOpacity="0.16"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-20 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 sm:mb-8">
            14-day free trial · No credit card required
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-4 sm:mb-5 max-w-3xl mx-auto">
            Your Short-Term Rental CFO
          </h1>
          <p className="text-base sm:text-lg text-slate-500 mb-8 sm:mb-10 max-w-xl mx-auto leading-relaxed">
            Stop running your rental like a hobby, start running it like a business — get tools to increase revenue, cut costs, and generate yield.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link href={`${APP_URL}/onboarding`} className="w-full sm:w-auto bg-emerald-600 text-white px-7 py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
              Start your free trial <ChevronRight className="w-4 h-4" />
            </Link>
            <Link href={`${APP_URL}/sign-in`} className="text-slate-400 text-sm hover:text-slate-600 transition-colors">
              Already have an account? Log in →
            </Link>
          </div>

          {/* Platform trust bar */}
          <div className="mt-12 sm:mt-20">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-6 sm:mb-8">
              Connects with the platforms you already use
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4 sm:gap-x-10 text-slate-400">
              {PLATFORMS.map(p => (
                <span key={p} className="text-base sm:text-lg font-bold tracking-tight">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-slate-50 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">The financial layer your STR needs to grow</h2>
            <p className="text-slate-500 text-base sm:text-lg max-w-lg mx-auto">Measure more than payout amount — guide your STR to increased profitability, higher revenue, and lower expenses with CFO-caliber tools.</p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {FEATURES.map((f, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <div className={`w-12 h-12 ${f.iconBg} rounded-xl flex items-center justify-center mb-6`}>
                  <f.icon className={`w-6 h-6 ${f.iconColor}`} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">{f.title}</h3>
                <p className="text-slate-500 leading-relaxed text-sm">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Up and running in minutes</h2>
            <p className="text-slate-500 text-base sm:text-lg">No accountant required.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8 sm:gap-10">
            {STEPS.map(s => (
              <div key={s.n} className="text-center">
                <div className="text-6xl font-black text-emerald-100 mb-3 leading-none">{s.n}</div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{s.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-slate-50 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Simple pricing</h2>
            <p className="text-slate-500 text-base sm:text-lg">14 days free, then pay by property count.</p>
          </div>
          <p className="text-center text-sm text-emerald-600 font-medium mb-8 sm:mb-12">Save 20% with annual billing</p>
          <div className="grid sm:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
            {PRICING.map(p => (
              <div key={p.name} className={`rounded-2xl border p-8 ${p.highlight ? 'bg-emerald-600 border-emerald-600 shadow-xl shadow-emerald-200' : 'bg-white border-slate-200 shadow-sm'}`}>
                {p.highlight && <p className="text-xs font-bold text-emerald-200 uppercase tracking-widest mb-4">Most popular</p>}
                <h3 className={`text-lg font-bold mb-1 ${p.highlight ? 'text-white' : 'text-slate-900'}`}>{p.name}</h3>
                <p className={`text-sm mb-5 ${p.highlight ? 'text-emerald-200' : 'text-slate-400'}`}>{p.properties}</p>
                <div className="mb-6">
                  <span className={`text-4xl font-black ${p.highlight ? 'text-white' : 'text-slate-900'}`}>${p.price}</span>
                  <span className={`text-sm ml-1 ${p.highlight ? 'text-emerald-200' : 'text-slate-400'}`}>/mo</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${p.highlight ? 'text-emerald-200' : 'text-emerald-500'}`} />
                      <span className={`text-sm ${p.highlight ? 'text-emerald-50' : 'text-slate-600'}`}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`${APP_URL}/onboarding`}
                  className={`block text-center py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    p.highlight ? 'bg-white text-emerald-700 hover:bg-emerald-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-8">All plans include a 14-day free trial · Cancel anytime · No credit card required</p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 sm:py-24">
        <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Ready to see your real numbers?</h2>
          <p className="text-slate-500 mb-8">14 days free. No credit card. Full access from day one.</p>
          <Link href={`${APP_URL}/onboarding`} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-7 py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors">
            Get started free <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-sm text-slate-700">HostCFO</span>
          </div>
          <p className="text-xs text-slate-400">© 2026 HostCFO · Financial intelligence for STR operators</p>
        </div>
      </footer>
    </div>
  );
}
