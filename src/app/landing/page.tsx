'use client';
import Link from 'next/link';
import { BookOpen, TrendingUp, Users, BarChart3, ChevronRight, Check } from 'lucide-react';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Real P&L, not just earnings',
    description: 'See net income after platform fees, operating expenses, and your mortgage payment. The number that actually matters.',
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
  },
  {
    icon: TrendingUp,
    title: 'Revenue forecasting',
    description: "Set annual targets and track monthly pacing against seasonal forecasts. Know if you're on track before it's too late.",
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
  },
  {
    icon: Users,
    title: 'Your guest list is an asset',
    description: 'After checkout, your guest base is worth nothing — it lives on Airbnb\'s servers. HostCFO helps you build a direct relationship list, so repeat guests book with you, not through a platform taking 15%.',
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

const BARS = [65, 75, 85, 80, 100, 95, 88, 40, 35, 0, 20, 15];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
            <Link href={`${APP_URL}/`} className="hidden sm:block text-sm text-slate-500 hover:text-slate-800 transition-colors">Log in</Link>
            <Link href={`${APP_URL}/onboarding`} className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap">
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 sm:mb-8">
          14-day free trial · No credit card required
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-4 sm:mb-5 max-w-3xl mx-auto">
          Start treating your rental like a business.
        </h1>
        <p className="text-base sm:text-lg text-slate-500 mb-8 sm:mb-10 max-w-xl mx-auto leading-relaxed">
          Platform fees, mortgage, ADR, occupancy rate, expenses — they all eat your payout. HostCFO shows your actual net cash flow, forecasts where you're heading, and tells you what to fix.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Link href={`${APP_URL}/onboarding`} className="w-full sm:w-auto bg-emerald-600 text-white px-7 py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
            Start your free trial <ChevronRight className="w-4 h-4" />
          </Link>
          <Link href={`${APP_URL}/`} className="text-slate-400 text-sm hover:text-slate-600 transition-colors">
            Already have an account? Log in →
          </Link>
        </div>

        {/* App preview */}
        <div className="mt-10 sm:mt-16 rounded-2xl border border-slate-200 shadow-2xl overflow-hidden text-left">
          <div className="bg-slate-900 px-4 py-3 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
            <span className="text-slate-500 text-xs ml-3">hostcfo.com</span>
          </div>
          <div className="bg-slate-50 p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
              {[
                { label: 'This Year Target', value: '$47,211', sub: 'of $44,923 YTD target', tag: '▲ $2,288 (5.1%)', green: true },
                { label: 'July Target', value: '$8,940', sub: 'of $8,148 target', tag: '▲ $792 (9.7%)', green: true },
                { label: 'Avg Occupancy', value: '79.9%', sub: 'Target 67%', tag: '▲ 12.9pts', green: true },
                { label: 'Avg Daily Rate', value: '$254', sub: 'Target $225', tag: '▲ $29 (12.9%)', green: true },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1 sm:mb-2 leading-tight">{c.label}</p>
                  <p className="text-lg sm:text-xl font-bold text-slate-900">{c.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5 mb-2">{c.sub}</p>
                  <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-lg ${c.green ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{c.tag}</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-4">Monthly Revenue by Platform</p>
              <div className="flex items-end gap-1 h-24">
                {BARS.map((h, i) => (
                  <div key={i} className="flex-1 h-full flex flex-col gap-0.5 justify-end">
                    <div className="w-full bg-indigo-400 rounded-t-sm" style={{ height: `${h * 0.22}%` }} />
                    <div className="w-full bg-rose-400 rounded-t-sm" style={{ height: `${h * 0.55}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-3 text-xs text-slate-400">
                {MONTHS_SHORT.map(m => <span key={m} className="flex-1 text-center">{m}</span>)}
              </div>
              <div className="flex gap-4 mt-3">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" />Airbnb</span>
                <span className="flex items-center gap-1.5 text-slate-400"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 inline-block" />VRBO</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-slate-50 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Everything your rental investment needs</h2>
            <p className="text-slate-500 text-base sm:text-lg max-w-lg mx-auto">Built for operators who treat their rental like a business, not a side project.</p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
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
            <p className="text-slate-500 text-base sm:text-lg">14 days free, then pay by property count. No feature gating.</p>
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
