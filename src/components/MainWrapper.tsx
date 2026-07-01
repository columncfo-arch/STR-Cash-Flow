'use client';
import { usePathname } from 'next/navigation';

const PUBLIC_PATHS = ['/welcome'];

export default function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (isPublic) return <>{children}</>;
  return <main className="ml-56 min-h-screen p-8">{children}</main>;
}
