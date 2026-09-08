import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.hostcfo.com';
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/onboarding`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/sign-in`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
