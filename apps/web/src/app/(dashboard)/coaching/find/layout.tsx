import type { Metadata } from 'next';
import { getServerTranslator } from '@/lib/i18n/server';

// Per-segment tab title; the page is a client component and cannot export metadata.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return { title: t('coaching.find.title'), robots: { index: false } };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
