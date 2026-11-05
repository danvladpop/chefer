import type { Metadata } from 'next';
import { getServerTranslator } from '@/lib/i18n/server';

// Per-segment tab title — the page is a client component and can't export
// metadata. Renders as "Import workouts | Chefer" via the root template.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return { title: t('nav.titles.importWorkouts') };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
