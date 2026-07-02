'use client';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
  return <main className="ml-56 min-h-screen p-8" style={{ zoom: '90%' }}>{children}</main>;
}
