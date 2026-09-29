import Link from 'next/link';
import { BookOpen } from 'lucide-react';

export const metadata = { title: 'Security Statement' };

export default function SecurityPage() {
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
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Security Statement</h1>
        <p className="text-sm text-slate-400 mb-10">Last updated September 9, 2026</p>

        <div className="space-y-8 text-slate-600 leading-relaxed text-sm sm:text-base">
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Encryption in transit</h2>
            <p>
              Every connection to HostCFO — the dashboard, our APIs, and our booking-platform sync — runs over
              HTTPS/TLS. Nothing is sent in the clear.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Authentication</h2>
            <p>
              Sign-in and account security are handled by a dedicated, industry-standard authentication
              provider rather than a homegrown password system. We never see or store your booking platform
              passwords: connections to Airbnb, Vrbo, Booking.com, and other platforms are made through the
              platform&rsquo;s own secure sign-in or an API token you can revoke at any time.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Access controls</h2>
            <p>
              Your financial and guest data is scoped to your account — other customers can never see it, and
              internal access is limited to what&rsquo;s needed to operate and support the product.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Infrastructure</h2>
            <p>
              HostCFO runs on established cloud infrastructure providers rather than self-hosted servers,
              inheriting their physical and network security practices.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Reporting a concern</h2>
            <p>
              Found a security issue? We want to know right away — email{' '}
              <a href="mailto:column.cfo@gmail.com" className="text-emerald-600 hover:underline">column.cfo@gmail.com</a>{' '}
              with details and we&rsquo;ll respond promptly.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
