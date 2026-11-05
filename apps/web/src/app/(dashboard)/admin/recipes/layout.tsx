import type { Metadata } from 'next';
import { getServerTranslator } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return { title: t('nav.titles.curatedRecipes') };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
