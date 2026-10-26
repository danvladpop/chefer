import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerTranslator } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return { title: t('legal.appErrors.notFoundMeta') };
}

export default async function NotFound() {
  const { t } = await getServerTranslator();
  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-dvh flex-col items-center justify-center px-4 text-center outline-none"
    >
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">
        {t('legal.appErrors.notFoundCode')}
      </p>
      <h1 className="mb-4 text-5xl font-bold tracking-tight">
        {t('legal.appErrors.notFoundTitle')}
      </h1>
      <p className="mb-8 max-w-md text-lg text-muted-foreground">
        {t('legal.appErrors.notFoundBody')}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('legal.appErrors.returnHome')}
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('legal.appErrors.goToDashboard')}
        </Link>
      </div>
    </main>
  );
}
