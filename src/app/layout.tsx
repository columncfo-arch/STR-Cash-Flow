import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });

const description = 'Short-term rental financial intelligence';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.hostcfo.com'),
  // template applies to child segments, so a page's own title reads
  // "CFO Dashboard · HostCFO" rather than replacing the brand outright
  title: {
    default: 'HostCFO',
    template: '%s · HostCFO',
  },
  description,
  openGraph: {
    title: 'HostCFO',
    description,
    url: 'https://www.hostcfo.com',
    siteName: 'HostCFO',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HostCFO',
    description,
  },
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
