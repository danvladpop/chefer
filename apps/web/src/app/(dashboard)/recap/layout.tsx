import type { Metadata } from 'next';
import { getServerTranslator } from '@/lib/i18n/server';

// Lane E2: per-segment tab title — the page is a client component.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return { title: t('today.recap.title') };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
