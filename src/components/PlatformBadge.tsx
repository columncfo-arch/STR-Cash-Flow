import { Platform } from '@/types';

const config: Record<Platform, { label: string; color: string }> = {
  airbnb: { label: 'Airbnb', color: 'text-rose-700' },
  booking: { label: 'Booking.com', color: 'text-blue-700' },
  vrbo: { label: 'VRBO', color: 'text-indigo-700' },
  direct: { label: 'Direct', color: 'text-emerald-700' },
  other: { label: 'Other', color: 'text-slate-600' },
};

export default function PlatformBadge({ platform }: { platform: Platform }) {
  const { label, color } = config[platform] ?? config.other;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
