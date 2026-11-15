import type { Metadata } from 'next';
import PayoutReconcile from '@/components/PayoutReconcile';

export const metadata: Metadata = {
  title: 'Reconcile Payouts',
  description: 'Check your books against what the channel actually paid.',
};

export default function ReconcilePage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Reconcile Payouts</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          A channel pays once per reservation, on a date it commits to in advance — so its
          payout schedule is an independent list of the stays it believes are real. Checking
          your books against it catches what neither side flags on its own: a stay cancelled
          after it synced, revenue that never landed in the books, and the two disagreeing
          about what a guest paid.
        </p>
      </header>
      <PayoutReconcile />
    </div>
  );
}
