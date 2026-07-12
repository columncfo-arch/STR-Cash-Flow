import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';

export default function SignInPage() {
  return (
    <div className="flex flex-col items-center gap-4">
      <SignIn
        signUpUrl="/onboarding"
        fallbackRedirectUrl="/import"
        signUpFallbackRedirectUrl="/onboarding/confirm"
      />
      <p className="text-sm text-slate-500">
        No account yet?{' '}
        <Link href="/onboarding" className="text-emerald-600 font-medium hover:underline">
          Start your free trial →
        </Link>
      </p>
    </div>
  );
}
