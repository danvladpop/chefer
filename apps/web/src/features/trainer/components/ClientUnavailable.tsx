'use client';

import Link from 'next/link';
import { useTrainerClientsHref } from '@/features/nav/mode-context';
import { useT } from '@/lib/i18n';

/** The uniform answer for a client that is not (or no longer) the trainer's. */
export function ClientUnavailable() {
  const { t } = useT();
  const clientsHref = useTrainerClientsHref();
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="font-serif text-2xl font-bold text-gray-900">
        {t('coaching.trainer.clientUnavailable')}
      </h1>
      <Link
        href={clientsHref}
        className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-gray-900 underline underline-offset-4"
      >
        {t('coaching.trainer.clients')}
      </Link>
    </div>
  );
}
