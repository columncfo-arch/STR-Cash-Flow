import type { Metadata } from 'next';
import LeasesClient from './LeasesClient';

// metadata cannot be exported from a Client Component, so this page stays a
// Server Component and the interactive part lives in its child.
export const metadata: Metadata = {
  title: 'Leases',
};

export default function LeasesPage() {
  return <LeasesClient />;
}
