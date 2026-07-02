import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import MainWrapper from '@/components/MainWrapper';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HostCFO',
  description: 'Short-term rental financial intelligence',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-slate-50`}>
        <Nav />
        <MainWrapper>{children}</MainWrapper>
      </body>
    </html>
  );
}
