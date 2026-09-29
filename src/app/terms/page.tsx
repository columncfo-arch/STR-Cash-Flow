import Link from 'next/link';
import { BookOpen } from 'lucide-react';

export const metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            <span className="font-bold text-slate-900">HostCFO</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-400 mb-10">Last updated September 9, 2026</p>

        <div className="space-y-8 text-slate-600 leading-relaxed text-sm sm:text-base">
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Using HostCFO</h2>
            <p>
              By creating an account you agree to these terms. HostCFO is a financial dashboard and forecasting
              tool for short-term rental operators. You&rsquo;re responsible for the accuracy of the data you
              import and for keeping your login credentials secure.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Not financial, tax, or legal advice</h2>
            <p>
              HostCFO helps you organize and forecast your own numbers. It does not provide financial, tax, or
              legal advice, and nothing in the product should be treated as a substitute for a qualified
              professional. You&rsquo;re responsible for decisions you make based on it.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Trial &amp; billing</h2>
            <p>
              New accounts get a 14-day free trial with no credit card required. After the trial, paid plans
              bill monthly (or annually, at a discount) based on the property-count tier you select. You can
              cancel at any time from your account settings; you won&rsquo;t be charged again after
              cancellation.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Acceptable use</h2>
            <p>
              Don&rsquo;t use HostCFO to store or process data you don&rsquo;t have the right to use, attempt to
              disrupt the service, or resell access without our written permission.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Service &ldquo;as is&rdquo;</h2>
            <p>
              HostCFO is provided as-is, without warranties of any kind. We work to keep it accurate and
              available, but we&rsquo;re not liable for indirect or consequential damages arising from its use.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Changes</h2>
            <p>
              We may update these terms as the product evolves. Material changes will be posted here with an
              updated date.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Contact</h2>
            <p>
              Questions about these terms? Email{' '}
              <a href="mailto:column.cfo@gmail.com" className="text-emerald-600 hover:underline">column.cfo@gmail.com</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
