'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { COACHING_COPY } from '@chefer/types';
import { useTrainerStatus } from '../use-trainer-status';
import { ClientsView } from './ClientsView';
import { TrainerTurnOn } from './TrainerTurnOn';

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="font-serif text-2xl font-bold text-gray-900">{COACHING_COPY.trainer.title}</h1>
      <p className="mt-3 text-sm text-gray-700">{children}</p>
      <Link
        href="/profile"
        className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-gray-900 underline underline-offset-4"
      >
        Back to Profile
      </Link>
    </div>
  );
}

/** /trainer: off for this account, turn on, or the clients. */
export function TrainerHome() {
  const status = useTrainerStatus();
  const { data: user } = trpc.user.me.useQuery();

  if (status.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="sr-only">{COACHING_COPY.trainer.clients}</h1>
        <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      </div>
    );
  }
  if (status.active) return <ClientsView displayName={status.displayName ?? ''} />;
  if (status.enabled && status.canActivate) {
    return <TrainerTurnOn defaultName={user?.firstName ?? ''} />;
  }
  return <Notice>{COACHING_COPY.server.notAllowed}</Notice>;
}
