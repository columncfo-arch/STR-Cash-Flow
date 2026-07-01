'use client';
import { useEffect, useState } from 'react';
import { Home, Check, CreditCard, Calendar, AlertCircle } from 'lucide-react';

interface PropertyInfo {
  propertyName: string;
  directNightlyRate: number | null;
  directMinNights: number;
  directDescription: string | null;
  guestCleaningFee: number;
}

interface BlockedRange { start: string; end: string; }

type Step = 'booking' | 'submitted' | 'error';
type PaymentMethod = 'card' | 'zelle' | 'venmo' | 'bank';

const CARD_FEE_PCT = 0.03;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((new Date(checkOut + 'T12:00:00').getTime() - new Date(checkIn + 'T12:00:00').getTime()) / 86400000);
}

function rangeOverlapsBlocked(checkIn: string, checkOut: string, blocked: BlockedRange[]): boolean {
  return blocked.some(b => checkIn < b.end && checkOut > b.start);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; note: string; fee: boolean }[] = [
  { value: 'card', label: 'Credit / Debit Card', note: '3% processing fee', fee: true },
  { value: 'zelle', label: 'Zelle', note: 'No fee', fee: false },
  { value: 'venmo', label: 'Venmo', note: 'No fee', fee: false },
  { value: 'bank', label: 'Bank Transfer', note: 'No fee', fee: false },
];

export default function BookPage() {
  const [info, setInfo] = useState<PropertyInfo | null>(null);
  const [blocked, setBlocked] = useState<BlockedRange[]>([]);
  const [step, setStep] = useState<Step>('booking');

  const today = toISODate(new Date());
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('card');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tcpaConsent, setTcpaConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/welcome').then(r => r.json()),
      fetch('/api/calendar').then(r => r.json()),
    ]).then(([propInfo, cal]) => {
      setInfo(propInfo);
      setBlocked(cal.blocked ?? []);
    }).catch(() => {});
  }, []);

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const minNights = info?.directMinNights ?? 2;
  const nightlyRate = info?.directNightlyRate ?? 0;
  const cleaningFee = info?.guestCleaningFee ?? 0;
  const subtotal = nights * nightlyRate;
  const cardFee = payment === 'card' ? (subtotal + cleaningFee) * CARD_FEE_PCT : 0;
  const total = subtotal + cleaningFee + cardFee;

  const checkOutMin = checkIn ? addDays(checkIn, minNights) : '';
  const isOverlap = checkIn && checkOut ? rangeOverlapsBlocked(checkIn, checkOut, blocked) : false;
  const isTooShort = checkIn && checkOut && nights < minNights;
  const canSubmit = checkIn && checkOut && !isOverlap && !isTooShort && firstName && email && nights > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const preferredDates = `${fmtDate(checkIn)} – ${fmtDate(checkOut)} (${nights} nights)`;
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
          <p className="text-slate-500 text-sm">Something went wrong. Please try again.</p>
          <button onClick={() => setStep('booking')} className="mt-4 text-sm text-emerald-600 underline">Go back</button>
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
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Booking request sent!</h1>
          <p className="text-slate-600 text-sm leading-relaxed mb-2">
            We&apos;ll confirm your dates and send a payment link within a few hours.
          </p>
          <p className="text-slate-500 text-xs mb-6">
            {checkIn && checkOut ? `${fmtDate(checkIn)} – ${fmtDate(checkOut)} · ${nights} night${nights !== 1 ? 's' : ''}` : ''}
          </p>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-left">
            <p className="text-xs font-semibold text-slate-700 mb-2">Payment options we accept</p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map(o => (
                <div key={o.value} className="flex items-center gap-2 text-xs text-slate-600">
                  <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                  <span>{o.label} <span className="text-slate-400">({o.note})</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100">
      <div className="max-w-lg mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-600 rounded-2xl mb-4 shadow-lg">
            <Home className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {info?.propertyName ?? 'Book Your Stay'}
          </h1>
          {info?.directDescription && (
            <p className="text-slate-500 text-sm mt-1">{info.directDescription}</p>
          )}
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 text-xs font-semibold mt-3">
            <Check className="w-3 h-3" /> Direct rate — no platform fees
          </div>
        </div>

        {!info?.directNightlyRate ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <p className="text-slate-500 text-sm">Booking is not yet configured. Please contact the host directly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Date selection */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold text-slate-800 text-sm">Select your dates</span>
                {minNights > 1 && <span className="text-xs text-slate-400 ml-auto">{minNights}-night minimum</span>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Check-in</label>
                  <input
                    type="date"
                    required
                    value={checkIn}
                    min={today}
                    onChange={e => {
                      setCheckIn(e.target.value);
                      if (checkOut && checkOut <= e.target.value) setCheckOut('');
                    }}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Check-out</label>
                  <input
                    type="date"
                    required
                    value={checkOut}
                    min={checkOutMin || today}
                    onChange={e => setCheckOut(e.target.value)}
                    disabled={!checkIn}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-40"
                  />
                </div>
              </div>

              {isOverlap && (
                <div className="mt-3 flex items-center gap-2 text-red-600 text-xs bg-red-50 rounded-xl px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Those dates are not available. Please choose different dates.
                </div>
              )}
              {isTooShort && !isOverlap && (
                <div className="mt-3 flex items-center gap-2 text-amber-600 text-xs bg-amber-50 rounded-xl px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Minimum stay is {minNights} nights.
                </div>
              )}
            </div>

            {/* Price breakdown — only show when valid dates selected */}
            {nights >= minNights && !isOverlap && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="font-semibold text-slate-800 text-sm mb-3">Price breakdown</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>{fmtMoney(nightlyRate)} × {nights} night{nights !== 1 ? 's' : ''}</span>
                    <span>{fmtMoney(subtotal)}</span>
                  </div>
                  {cleaningFee > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Cleaning fee</span>
                      <span>{fmtMoney(cleaningFee)}</span>
                    </div>
                  )}
                  {cardFee > 0 && (
                    <div className="flex justify-between text-slate-400 text-xs">
                      <span>Card processing (3%)</span>
                      <span>{fmtMoney(cardFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-100 pt-2 mt-2">
                    <span>Total</span>
                    <span className="text-emerald-700">{fmtMoney(total)}</span>
                  </div>
                </div>

                {/* Payment method */}
                <div className="mt-4">
                  <p className="text-xs font-medium text-slate-500 mb-2">Payment method</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_OPTIONS.map(o => (
                      <label
                        key={o.value}
                        className={`flex items-center gap-2 text-xs cursor-pointer rounded-xl px-3 py-2 border transition-colors ${
                          payment === o.value
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value={o.value}
                          checked={payment === o.value}
                          onChange={() => setPayment(o.value)}
                          className="sr-only"
                        />
                        <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium">{o.label}</span>
                          <span className="text-slate-400 ml-1">({o.note})</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Guest details */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="font-semibold text-slate-800 text-sm mb-4">Your details</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">First name <span className="text-red-400">*</span></label>
                    <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Last name</label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Email <span className="text-red-400">*</span></label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Phone (optional)</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>

                <label className="flex items-start gap-3 cursor-pointer pt-1">
                  <input type="checkbox" checked={tcpaConsent} onChange={e => setTcpaConsent(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 flex-shrink-0" />
                  <span className="text-xs text-slate-400 leading-relaxed">
                    I agree to receive text messages (availability, booking updates) from{' '}
                    <span className="font-medium text-slate-600">{info?.propertyName}</span>.
                    Message &amp; data rates may apply. Reply <strong>STOP</strong> to opt out.
                    Consent is not required to book.
                  </span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="w-full bg-emerald-600 text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Sending request…' : nights >= minNights && !isOverlap ? `Request to Book — ${fmtMoney(total)}` : 'Select dates to continue'}
            </button>

            <p className="text-xs text-center text-slate-400">
              No payment collected now — we&apos;ll send a secure payment link once your dates are confirmed.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
