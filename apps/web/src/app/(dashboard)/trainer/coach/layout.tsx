import type { Metadata } from 'next';
import { getServerTranslator } from '@/lib/i18n/server';

// Per-segment tab title (trainer-mode.md §6.7); the pages are client components.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return { title: t('coaching.trainer.pages.coaching'), robots: { index: false } };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
