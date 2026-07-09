import { BookOpen } from 'lucide-react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-100 px-6 py-4">
        <Link href="/landing" className="inline-flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-600" />
          <span className="font-bold text-slate-900">HostCFO</span>
        </Link>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        <p className="text-sm text-slate-500">14 days free · No credit card needed</p>
        {children}
      </div>
    </div>
  );
}
