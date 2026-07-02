'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CalendarDays, BookOpen, Settings, Home, Receipt, Upload, TrendingUp, Target, Users, Zap, Wifi } from 'lucide-react';

type SubLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; children?: SubLink[] };

const links: NavLink[] = [
  { href: '/', label: 'Dashboard', icon: Home },
  {
    href: '/income-statement',
    label: 'Income Statement',
    icon: BarChart3,
    children: [
      { href: '/bookings', label: 'Bookings', icon: CalendarDays },
      { href: '/expenses', label: 'Expenses', icon: Receipt },
    ],
  },
  { href: '/forecast', label: 'Long Term Forecast', icon: TrendingUp },
  { href: '/optimization', label: 'Optimization', icon: Target },
  {
    href: '/guest-list',
    label: 'Guest List',
    icon: Users,
    children: [
      { href: '/guest-list/guests', label: 'Guest Roster', icon: Users },
      { href: '/guest-list/direct-booking', label: 'Direct Booking', icon: Zap },
      { href: '/guest-list/welcome', label: 'Welcome Page', icon: Wifi },
    ],
  },
  { href: '/import', label: 'Import Earnings', icon: Upload },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const PUBLIC_PATHS = ['/welcome', '/book-direct', '/book', '/landing', '/onboarding'];

export default function Nav() {
  const pathname = usePathname();
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return null;
  return (
    <nav className="bg-slate-900 text-white h-screen w-56 flex flex-col fixed left-0 top-0">
      <div className="px-4 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-400" />
          <span className="font-semibold text-sm leading-tight">HostCFO</span>
        </div>
      </div>
      <ul className="flex-1 py-4 space-y-1 px-2">
        {links.map(({ href, label, icon: Icon, children }) => {
          const active = pathname === href;
          const inGroup = children?.some(c => pathname === c.href) ?? false;
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : inGroup
                    ? 'bg-slate-800 text-slate-200'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
              {children && (
                <ul className="mt-1 ml-3 pl-3 border-l border-slate-700 space-y-0.5">
                  {children.map(({ href: ch, label: cl, icon: CI }) => {
                    const childActive = pathname === ch;
                    return (
                      <li key={ch}>
                        <Link
                          href={ch}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors ${
                            childActive
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <CI className="w-3.5 h-3.5" />
                          {cl}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-500">
        HostCFO
      </div>
    </nav>
  );
}
