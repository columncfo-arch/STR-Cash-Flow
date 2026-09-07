import type { Metadata } from 'next';
import DashboardClient from './DashboardClient';

// metadata cannot be exported from a Client Component, so this page stays a
// Server Component and the interactive dashboard lives in DashboardClient.
export const metadata: Metadata = {
  title: 'CFO Dashboard',
};

export default function DashboardPage() {
  return <DashboardClient />;
}
