import Link from 'next/link';
import { BookOpen } from 'lucide-react';

export const metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-400 mb-10">Last updated September 9, 2026</p>

        <div className="space-y-8 text-slate-600 leading-relaxed text-sm sm:text-base">
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">What we collect</h2>
            <p>
              When you use HostCFO we collect the information you give us directly — your name, email, and
              property details during onboarding — along with the booking and financial data you import or
              connect, whether that&rsquo;s a CSV export from Airbnb, VRBO, or Booking.com, or a live sync through a
              connected channel manager. If you use the Guest List feature, we also store the guest contact
              information (name, email, phone) you choose to add.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">How we use it</h2>
            <p>
              We use this data to power your dashboard, forecasts, and reports — that&rsquo;s it. We do not sell your
              data, your guests&rsquo; data, or your financial history to anyone, and we do not use it to train
              third-party models.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">How we protect it</h2>
            <p>
              Data is encrypted in transit (HTTPS/TLS) and access to your account is protected by our
              authentication provider. We don&rsquo;t store your booking-platform passwords — connections are
              made through the platform&rsquo;s own secure sign-in or API tokens. See our{' '}
              <Link href="/security" className="text-emerald-600 hover:underline">Security Statement</Link> for
              details.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Sharing</h2>
            <p>
              We share data only with the service providers that make HostCFO work (hosting, email delivery,
              authentication) and only to the extent needed to run the product. We do not share it with
              advertisers.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Your rights</h2>
            <p>
              You can access, export, or delete your data at any time from your account settings, or by
              contacting us below.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Contact</h2>
            <p>
              Questions about this policy? Email us at{' '}
              <a href="mailto:column.cfo@gmail.com" className="text-emerald-600 hover:underline">column.cfo@gmail.com</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
