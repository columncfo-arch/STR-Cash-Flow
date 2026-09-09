'use client';
import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, TrendingUp, Activity, Sliders, UserPlus, ChevronRight, Check } from 'lucide-react';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

const BENEFITS: { emoji: string; title: string; iconBg: string; bullets: { bold: string; rest: string }[] }[] = [
  {
    emoji: '💡',
    title: 'From Guesswork to Certainty',
    iconBg: 'bg-emerald-50',
    bullets: [
      { bold: 'Stop managing by bank balance.', rest: ' Know your true profitability after accounting for platform fees, cleaning, and hidden operational costs.' },
      { bold: 'Predict slow seasons months in advance.', rest: ' Never get caught off guard by predictable dips in seasonal tourist traffic.' },
      { bold: 'Keep a finger on your pulse.', rest: ' Instantly see if your business is healthier today than it was this time last year.' },
    ],
  },
  {
    emoji: '📈',
    title: 'From Passive Income to Active Wealth',
    iconBg: 'bg-blue-50',
    bullets: [
      { bold: 'Track your true equity.', rest: ' Watch your net worth climb as guests pay down your property mortgages month after month.' },
      { bold: 'Measure real cash-on-cash return.', rest: ' Stop looking at simple payouts and start looking at your actual cap rate and return on investment.' },
      { bold: 'Plan your next acquisition.', rest: ' Know exactly when your current cash flow gives you the leverage to buy property number two or three.' },
    ],
  },
  {
    emoji: '🔒',
    title: 'From Marketplace Dependent to Independent Brand',
    iconBg: 'bg-violet-50',
    bullets: [
      { bold: 'Own your guest relationships.', rest: ' Securely build a private database of guest contact info that you actually control.' },
      { bold: 'Ditch expensive platform fees.', rest: ' Keep more profit by easily inviting past guests back to book directly with you.' },
      { bold: 'Bulletproof your distribution.', rest: ' Spread your listings smoothly across Airbnb, Vrbo, and Booking.com without losing your financial sanity.' },
    ],
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

// Illustrative 12-month net income forecast with realistic STR seasonality (summer peak).
const FORECAST_1YR_LINE = 'M0,160 L45,156 L91,139 L136,120 L182,93 L227,56 L273,26 L318,20 L364,64 L409,104 L455,135 L500,141';
const FORECAST_1YR_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Illustrative 5-year stack: cash flow + principal paydown + equity appreciation, in $k.
const FORECAST_5YR = [
  { year: 'Y1', cash: 18, paydown: 6, equity: 9 },
  { year: 'Y2', cash: 26, paydown: 13, equity: 22 },
  { year: 'Y3', cash: 34, paydown: 21, equity: 38 },
  { year: 'Y4', cash: 44, paydown: 30, equity: 58 },
  { year: 'Y5', cash: 56, paydown: 40, equity: 84 },
];
const FORECAST_5YR_MAX = 180;

const PULSE_DATA = {
  month: { emoji: '🚀', headline: 'Net Income is 8% Ahead of July Target.', actual: 8940, target: 8148 },
  season: { emoji: '✅', headline: 'Tracking 4% Ahead of Season Plan.', actual: 34200, target: 32900 },
  ytd: { emoji: '📈', headline: 'YTD Net Income is 5% Ahead of Target.', actual: 47211, target: 44923 },
} as const;
type PulseView = keyof typeof PULSE_DATA;
const PULSE_TABS: { key: PulseView; label: string }[] = [
  { key: 'month', label: 'This Month' },
  { key: 'season', label: 'This Season' },
  { key: 'ytd', label: 'Year-to-Date' },
];

const GUEST_PROFILE = { initials: 'SJ', name: 'Sarah Jenkins', stays: 3, ltv: 4200 };

export default function LandingPage() {
  const [forecastYears, setForecastYears] = useState<1 | 5>(1);
  const [pulseView, setPulseView] = useState<PulseView>('month');
  const [rateChange, setRateChange] = useState(20);
  const [ratePulsing, setRatePulsing] = useState(false);

  function handleRateChange(v: number) {
    setRateChange(v);
    setRatePulsing(true);
    window.setTimeout(() => setRatePulsing(false), 200);
  }

  const rateAnnualImpact = rateChange * 240;
  const pulse = PULSE_DATA[pulseView];
  const pulsePct = Math.min(100, Math.round((pulse.actual / pulse.target) * 100));

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
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 sm:mb-8">
          14-day free trial · No credit card required
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-4 sm:mb-5 max-w-3xl mx-auto">
          Your Short-Term Rental CFO
        </h1>
        <p className="text-base sm:text-lg font-medium text-slate-500 mb-8 sm:mb-10 max-w-xl mx-auto leading-relaxed">
          Stop running your rental like a hobby, start running it like a business — increase revenue, cut costs, improve returns, and build equity.
        </p>
        {/* Growth snapshot */}
        <div className="mt-8 sm:mt-10 max-w-2xl mx-auto rounded-2xl border border-slate-200 shadow-xl p-6 sm:p-8 text-left bg-white">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Net Income</p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-900">
                $9,800<span className="text-sm sm:text-base font-medium text-slate-400"> /mo</span>
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 whitespace-nowrap">
              ▲ 28% YoY
            </span>
          </div>
          <svg viewBox="0 0 600 180" className="w-full h-28 sm:h-36" preserveAspectRatio="none">
            <defs>
              <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,170 L55,160 L109,145 L164,151 L218,129 L273,106 L327,78 L382,57 L436,71 L491,53 L545,41 L600,20 L600,180 L0,180 Z"
              fill="url(#growthFill)"
            />
            <path
              d="M0,170 L55,160 L109,145 L164,151 L218,129 L273,106 L327,78 L382,57 L436,71 L491,53 L545,41 L600,20"
              fill="none"
              stroke="#059669"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="600" cy="20" r="4" fill="#059669" />
          </svg>
          <div className="flex justify-between mt-2 text-[10px] sm:text-xs text-slate-400">
            {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-8 sm:mt-10">
          <Link href={`${APP_URL}/onboarding`} className="w-full sm:w-auto bg-emerald-600 text-white px-7 py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
            Start your free trial <ChevronRight className="w-4 h-4" />
          </Link>
          <Link href={`${APP_URL}/sign-in`} className="text-slate-400 text-sm hover:text-slate-600 transition-colors">
            Already have an account? Log in →
          </Link>
        </div>

      </section>

      {/* Platform trust bar */}
      <section className="bg-slate-50 border-y border-slate-100 py-10 sm:py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-6 sm:mb-8">
            Connects with the platforms you already use
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-12 text-slate-700">
            {PLATFORMS.map(p => (
              <span key={p} className="text-lg sm:text-xl font-bold tracking-tight">{p}</span>
            ))}
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
            {BENEFITS.map((b, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <div className={`w-12 h-12 ${b.iconBg} rounded-xl flex items-center justify-center mb-6 text-2xl`}>
                  {b.emoji}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-4">{b.title}</h3>
                <ul className="space-y-3">
                  {b.bullets.map(item => (
                    <li key={item.bold} className="text-slate-500 leading-relaxed text-sm">
                      <strong className="text-slate-900 font-semibold">{item.bold}</strong>{item.rest}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works — interactive */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14 sm:mb-20">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">How It Works</h2>
            <p className="text-slate-500 text-base sm:text-lg max-w-lg mx-auto">Every panel below is interactive — try it.</p>
          </div>

          {/* 1. Target-Based Forecaster */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center mb-16 sm:mb-24">
            <div className="order-1">
              <div className="inline-flex items-center gap-2 text-emerald-600 font-semibold text-xs uppercase tracking-wide mb-3">
                <TrendingUp className="w-4 h-4" /> Financial Forecasting &amp; Long-Term Forecast
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 leading-snug">
                Create a Predictive Roadmap for Your Rental, Ditch Your Spreadsheets
              </h3>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                Stop relying on generic market averages that don&rsquo;t reflect your unique home. HostCFO builds an intelligent, multi-year model centered on your actual history, seasonal trends, and true expense rates. Track gross revenue, net income, occupancy, and ADR across a 12-month window or project 5 years out to see how equity appreciation and principal paydown transform your overall return on investment.
              </p>
            </div>
            <div className="order-2 rounded-2xl border border-slate-200 shadow-xl bg-white p-6 sm:p-8">
              <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50 mb-6">
                <button
                  onClick={() => setForecastYears(1)}
                  className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${forecastYears === 1 ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                >
                  Look Ahead 1 Year
                </button>
                <button
                  onClick={() => setForecastYears(5)}
                  className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${forecastYears === 5 ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                >
                  Look Ahead 5 Years
                </button>
              </div>

              {forecastYears === 1 ? (
                <>
                  <svg viewBox="0 0 500 180" className="w-full h-32 sm:h-40" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="forecast1Fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={`${FORECAST_1YR_LINE} L500,180 L0,180 Z`} fill="url(#forecast1Fill)" />
                    <path d={FORECAST_1YR_LINE} fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex justify-between mt-2 text-[10px] sm:text-xs text-slate-400">
                    {FORECAST_1YR_MONTHS.map(m => <span key={m}>{m}</span>)}
                  </div>
                  <p className="text-xs text-slate-400 mt-4">Net Income forecast, built from your own seasonality — not a generic market curve.</p>
                </>
              ) : (
                <>
                  <div className="flex items-end justify-between gap-3 sm:gap-4 h-40 sm:h-48">
                    {FORECAST_5YR.map(row => (
                      <div key={row.year} className="flex-1 flex flex-col items-center gap-2 h-full">
                        <div className="w-full flex flex-col justify-end flex-1">
                          <div className="w-full bg-violet-400 rounded-t-sm" style={{ height: `${(row.equity / FORECAST_5YR_MAX) * 100}%` }} />
                          <div className="w-full bg-indigo-400" style={{ height: `${(row.paydown / FORECAST_5YR_MAX) * 100}%` }} />
                          <div className="w-full bg-emerald-500 rounded-b-sm" style={{ height: `${(row.cash / FORECAST_5YR_MAX) * 100}%` }} />
                        </div>
                        <span className="text-[10px] sm:text-xs text-slate-400">{row.year}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4 mt-4 text-[10px] sm:text-xs text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />Cash Flow</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 inline-block" />Principal Paydown</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-400 inline-block" />Equity Appreciation</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 2. The Real-Time Pulse */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center mb-16 sm:mb-24">
            <div className="order-2 md:order-1 rounded-2xl border border-slate-200 shadow-xl bg-white p-6 sm:p-8">
              <div className="inline-flex flex-wrap rounded-lg border border-slate-200 p-1 bg-slate-50 mb-6">
                {PULSE_TABS.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setPulseView(t.key)}
                    className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${pulseView === t.key ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-start gap-3 mb-5">
                <span className="text-3xl leading-none">{pulse.emoji}</span>
                <p className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">{pulse.headline}</p>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden mb-3">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pulsePct}%` }} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Actual <span className="font-semibold text-slate-900">${pulse.actual.toLocaleString()}</span></span>
                <span className="text-slate-400">Target ${pulse.target.toLocaleString()}</span>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 text-emerald-600 font-semibold text-xs uppercase tracking-wide mb-3">
                <Activity className="w-4 h-4" /> Financial Performance
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 leading-snug">
                Track Performance Real-Time, Against Your Planned Forecast
              </h3>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                Know exactly where your rental business stands today without jumping between five different platform tabs. Aggregating live booking data directly from Airbnb, Vrbo, Booking.com, Expedia, and Google Vacation Rentals, HostCFO automatically compares your actual performance against your planned targets. Instantly see your true financial status for this month, this season, or year-to-date so you can make confident, proactive business adjustments.
              </p>
            </div>
          </div>

          {/* 3. The "What-If" Sandbox */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center mb-16 sm:mb-24">
            <div className="order-1">
              <div className="inline-flex items-center gap-2 text-emerald-600 font-semibold text-xs uppercase tracking-wide mb-3">
                <Sliders className="w-4 h-4" /> Optimization &amp; Scenario Analysis
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 leading-snug">
                Run &ldquo;What-If&rdquo; Scenarios to Spot Your Next Big Revenue Growth Move
              </h3>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                Test big financial decisions risk-free before you pull the trigger. Our optimization sandbox lets you model infinite financial situations to see exactly how small tweaks yield massive returns. Find out how increasing your ADR by $15, lowering operational fees, or purchasing an additional short-term rental property affects your portfolio&rsquo;s cash flow, cap rate, and bottom line.
              </p>
            </div>
            <div className="order-2 rounded-2xl border border-slate-200 shadow-xl bg-white p-6 sm:p-8">
              <p className="text-sm font-semibold text-slate-700 mb-4">
                What if I {rateChange >= 0 ? 'increase' : 'cut'} nightly rates by ${Math.abs(rateChange)}?
              </p>
              <input
                type="range"
                min={-20}
                max={50}
                step={5}
                value={rateChange}
                onChange={e => handleRateChange(Number(e.target.value))}
                className="w-full accent-emerald-600 mb-6"
              />
              <div className={`rounded-xl bg-emerald-50 p-5 text-center transition-transform duration-200 ${ratePulsing ? 'scale-105' : 'scale-100'}`}>
                <p className={`text-2xl sm:text-3xl font-black ${rateAnnualImpact >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {rateAnnualImpact >= 0 ? '+' : '−'}${Math.abs(rateAnnualImpact).toLocaleString()}
                </p>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  {rateAnnualImpact >= 0 ? 'Adds to' : 'Cuts from'} your annual Net Income
                </p>
              </div>
            </div>
          </div>

          {/* 4. The Direct Revenue Engine */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <div className="order-2 md:order-1 group rounded-2xl border border-slate-200 shadow-xl bg-white p-6 sm:p-8">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-lg flex-shrink-0">
                  {GUEST_PROFILE.initials}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{GUEST_PROFILE.name}</p>
                  <p className="text-sm text-slate-500">{GUEST_PROFILE.stays} stays · ${GUEST_PROFILE.ltv.toLocaleString()} lifetime value</p>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-100 transition-all duration-200 opacity-100 sm:opacity-0 sm:translate-y-1 sm:group-hover:opacity-100 sm:group-hover:translate-y-0">
                <button className="w-full text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors px-3.5 py-2.5 rounded-lg">
                  Invite Back with Direct Booking Discount
                </button>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 text-emerald-600 font-semibold text-xs uppercase tracking-wide mb-3">
                <UserPlus className="w-4 h-4" /> Guest List &amp; Recurring Revenue
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 leading-snug">
                Turn Your Loyal Guests Into Recurring, Valuable Relationships
              </h3>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                Break free from complete dependency on booking platform algorithms and expensive marketplace fees. HostCFO securely logs guest names, contact details, stay dates, and lifetime spend so you can transition transactional visitors into deep direct-booking relationships. Engage the guests who already love your property, invite them back directly, and build a predictable pipeline of recurring revenue.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Onboarding steps */}
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
