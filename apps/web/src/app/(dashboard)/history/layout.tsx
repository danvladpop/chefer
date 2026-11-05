import type { Metadata } from 'next';
import { getServerTranslator } from '@/lib/i18n/server';

// Per-segment tab title (F-X-1-1). /history itself redirects to /my-weeks;
// this still titles the read-only week view at /history/[planId].
// UX-PLAN-15: the screen is "My weeks › past weeks" now, not "History".
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return { title: t('nav.titles.pastWeeks') };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
