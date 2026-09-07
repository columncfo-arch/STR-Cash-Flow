import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  // template applies to child segments, so a page's own title reads
  // "CFO Dashboard · HostCFO" rather than replacing the brand outright
  title: {
    default: 'HostCFO',
    template: '%s · HostCFO',
  },
  description: 'Short-term rental financial intelligence',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${geist.className} bg-slate-50`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
