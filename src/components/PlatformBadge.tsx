import { Platform } from '@/types';

const config: Record<Platform, { label: string; color: string }> = {
  airbnb: { label: 'Airbnb', color: 'bg-rose-100 text-rose-700' },
  booking: { label: 'Booking.com', color: 'bg-blue-100 text-blue-700' },
  vrbo: { label: 'VRBO', color: 'bg-indigo-100 text-indigo-700' },
  direct: { label: 'Direct', color: 'bg-emerald-100 text-emerald-700' },
  other: { label: 'Other', color: 'bg-slate-100 text-slate-600' },
};

export default function PlatformBadge({ platform }: { platform: Platform }) {
  const { label, color } = config[platform] ?? config.other;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
