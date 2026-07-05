'use client';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
  return <main className="md:ml-56 min-h-screen p-4 md:p-8 pt-16 md:pt-8" style={{ zoom: '90%' }}>{children}</main>;
}
