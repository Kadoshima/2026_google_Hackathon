import type { MetadataRoute } from 'next';

/**
 * Generated at build-time into /robots.txt.
 * Adjust the siteUrl via the SITE_URL env variable at build time.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://reviewer-zero.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/legal/privacy', '/legal/terms'],
        disallow: ['/session/', '/api/', '/settings']
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl
  };
}
