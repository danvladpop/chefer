'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAppMode } from '@/features/nav/mode-context';
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

/**
 * /trainer: off for this account, turn on, or the clients. With trainer mode
 * available it hands over to trainer mode's Today (trainer-mode.md §5.3), so
 * Trainer tools' links and bookmarks keep working.
 */
export function TrainerHome() {
  const router = useRouter();
  const status = useTrainerStatus();
  const { trainerModeAvailable, trainerModeLoading } = useAppMode();
  const { data: user } = trpc.user.me.useQuery();

  useEffect(() => {
    if (trainerModeAvailable) router.replace('/trainer/today');
  }, [trainerModeAvailable, router]);

  // An active trainer waits for the flag too, so the old Clients page never
  // flashes before the redirect.
  if (status.isLoading || trainerModeAvailable || (status.active && trainerModeLoading)) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="sr-only">{COACHING_COPY.trainer.clients}</h1>
        <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      </div>
    );
  }
  if (status.active) {
    return (
      <ClientsView
        displayName={status.displayName ?? ''}
        gymLine={status.gymLine}
        activeClients={status.activeClients}
      />
    );
  }
  if (status.enabled && status.canActivate) {
    return <TrainerTurnOn defaultName={user?.firstName ?? ''} />;
  }
  return <Notice>{COACHING_COPY.server.notAllowed}</Notice>;
}
