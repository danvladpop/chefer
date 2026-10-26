'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useT } from '@/lib/i18n';
import * as Sentry from '@sentry/nextjs';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorProps) {
  const { t } = useT();
  useEffect(() => {
    Sentry.captureException(error);
    console.error('Unhandled error:', error);
  }, [error]);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-dvh flex-col items-center justify-center px-4 text-center outline-none"
    >
      <div className="mb-6 text-6xl">⚠️</div>
      <h1 className="mb-2 text-3xl font-bold tracking-tight">{t('legal.appErrors.webTitle')}</h1>
      <p className="mb-6 max-w-md text-muted-foreground">{t('legal.appErrors.webBody')}</p>
      {error.digest && (
        <p className="mb-6 rounded-md bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
          {t('legal.appErrors.errorId', { id: error.digest })}
        </p>
      )}
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('legal.appErrors.tryAgain')}
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('legal.appErrors.goHome')}
        </Link>
      </div>
    </main>
  );
}
