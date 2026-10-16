import type { Metadata } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo/brand';
import { APP_STORE_APP_ID, appStoreUrl, playStoreUrl } from '@chefer/types';

// Store-facing metadata for the public pages (ASO plan §5.3).

/**
 * Safari's Smart App Banner (`<meta name="apple-itunes-app">`). Spread into
 * the metadata of every PUBLIC_ROUTES page; empty until the iOS app has an
 * Apple ID, so nothing points at an app that isn't on the store yet.
 */
export function smartAppBanner(appId: string | null = APP_STORE_APP_ID): Metadata {
  return appId ? { itunes: { appId } } : {};
}

/** Live store listings, untagged — the canonical URLs for structured data. */
function storeListings(): string[] {
  return [playStoreUrl(), appStoreUrl()].filter((url): url is string => url !== null);
}

/**
 * schema.org SoftwareApplication for the landing page. No aggregateRating on
 * purpose: there are no real ratings to report yet, and invented ones break
 * Google's structured-data policy. iOS joins operatingSystem with its listing.
 */
export function softwareApplicationJsonLd(siteUrl: string) {
  const listings = storeListings();
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    // schema.org's closest category: meal planning, nutrition and training.
    applicationCategory: 'HealthApplication',
    operatingSystem: ['Android', appStoreUrl() && 'iOS', 'Web'].filter(Boolean).join(', '),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    installUrl: listings,
    sameAs: listings,
  };
}

/** `JSON.stringify` for a `<script>` body: `<` is escaped so data can't close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
