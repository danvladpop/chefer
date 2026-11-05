import type { Metadata } from 'next';
import { getServerTranslator } from '@/lib/i18n/server';

// Per-segment tab title (F-X-1-1) — the page itself is a client component and
// can't export metadata. Renders as "Gym stats | Chefer" via the root template.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return { title: t('nav.titles.gymStats') };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
