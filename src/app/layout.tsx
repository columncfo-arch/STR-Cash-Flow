import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'STR Cash Flow',
  description: 'Short-term rental income tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-slate-50`}>
        <Nav />
        <main className="ml-56 min-h-screen p-8">{children}</main>
      </body>
    </html>
  );
}
