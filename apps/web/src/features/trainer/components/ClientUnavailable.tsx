import Link from 'next/link';
import { COACHING_COPY } from '@chefer/types';

/** The uniform answer for a client that is not (or no longer) the trainer's. */
export function ClientUnavailable() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="font-serif text-2xl font-bold text-gray-900">
        {COACHING_COPY.server.clientUnavailable}
      </h1>
      <Link
        href="/trainer"
        className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-gray-900 underline underline-offset-4"
      >
        {COACHING_COPY.trainer.clients}
      </Link>
    </div>
  );
}
