import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['node-ical', 'redis'],
};

export default nextConfig;
