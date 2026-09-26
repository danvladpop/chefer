import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { PUBLIC_ROUTES } from '@/lib/seo/brand';

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => ({
    url: new URL(path, env.NEXT_PUBLIC_APP_URL).toString(),
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.5,
  }));
}
