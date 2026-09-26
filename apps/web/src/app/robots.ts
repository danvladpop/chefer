import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { PUBLIC_ROUTES } from '@/lib/seo/brand';

// Audit F-PUB-1-1: there was no robots.txt. Only the public pages are worth
// crawling; the app itself sits behind sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: [...PUBLIC_ROUTES], disallow: ['/api/', '/trpc/'] }],
    sitemap: new URL('/sitemap.xml', env.NEXT_PUBLIC_APP_URL).toString(),
  };
}
