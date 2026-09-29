import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/landing', '/onboarding', '/sign-in', '/sign-up', '/book', '/book-direct', '/privacy', '/terms', '/security'],
      disallow: [
        '/api/',
        '/bookings',
        '/expenses',
        '/forecast',
        '/guest-list',
        '/guests',
        '/import',
        '/income-statement',
        '/optimization',
        '/settings',
      ],
    },
    sitemap: 'https://www.hostcfo.com/sitemap.xml',
  };
}
