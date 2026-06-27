'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CalendarDays, BookOpen, Settings, Home } from 'lucide-react';

const links = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/income-statement', label: 'Income Statement', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="bg-slate-900 text-white h-screen w-56 flex flex-col fixed left-0 top-0">
      <div className="px-4 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-400" />
          <span className="font-semibold text-sm leading-tight">STR Cash Flow</span>
        </div>
      </div>
      <ul className="flex-1 py-4 space-y-1 px-2">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-500">
        STR Income Tracker
      </div>
    </nav>
  );
}
