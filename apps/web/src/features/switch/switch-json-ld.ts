import { softwareApplicationJsonLd } from '@/features/app-stores/store-metadata';
import { SWITCH_DESCRIPTION, SWITCH_FAQ, SWITCH_TITLE } from './mealime-content';

/**
 * schema.org graph for /switch/mealime: the page itself, the app it is about
 * (the same SoftwareApplication as the landing page) and its FAQ. The page is
 * `about` Chefer only; Mealime appears in the text, never as an organisation
 * or brand node, so nothing reads as a relationship between the two.
 */
export function mealimeSwitchJsonLd(siteUrl: string) {
  const pageUrl = new URL('/switch/mealime', siteUrl).toString();
  const appId = new URL('/#app', siteUrl).toString();
  // The graph carries the one @context; the node inside it doesn't repeat it.
  const { '@context': _context, ...app } = softwareApplicationJsonLd(siteUrl);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': pageUrl,
        url: pageUrl,
        name: SWITCH_TITLE,
        description: SWITCH_DESCRIPTION,
        about: { '@id': appId },
      },
      { ...app, '@id': appId },
      {
        '@type': 'FAQPage',
        url: pageUrl,
        mainEntity: SWITCH_FAQ.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  };
}
