import type { Metadata } from 'next';
import DashboardClient from './DashboardClient';
import PortfolioDashboard from '@/components/PortfolioDashboard';

// metadata cannot be exported from a Client Component, so this page stays a
// Server Component and the interactive dashboard lives in its children.
export const metadata: Metadata = {
  title: 'CFO Dashboard',
};

/**
 * The portfolio across the top — the four layers of the money for every unit,
 * and the table of units beneath them — with the property in view's own
 * dashboard below it. With one property the table hides itself and the page
 * reads as it always did, with the four layers gained.
 */
export default function DashboardPage() {
  return (
    <PortfolioDashboard>
      <DashboardClient />
    </PortfolioDashboard>
  );
}
