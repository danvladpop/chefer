'use client';

import { useState } from 'react';
import { CoachingNoticeList } from '@/features/coaching/components/CoachingNoticeList';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { trpc } from '@/lib/trpc';
import { UserPlus } from 'lucide-react';
import { COACHING_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';
import { ClientList } from './ClientList';
import { InviteSheet } from './InviteSheet';
import { InvitesSection } from './InvitesSection';
import { TrainerRequests } from './TrainerRequests';
import { TrainerSettings } from './TrainerSettings';

/**
 * /trainer for an active trainer: notices about clients, coaching requests, the
 * clients, the pending invites, the settings.
 */
export function ClientsView({
  displayName,
  gymLine,
  activeClients,
}: {
  displayName: string;
  gymLine: string | null;
  activeClients: number | null;
}) {
  const copy = COACHING_COPY.trainer;
  const [inviting, setInviting] = useState(false);
  const clients = trpc.trainer.clients.list.useQuery({ today: localDate() }, { retry: false });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            {copy.title}
          </p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">{copy.clients}</h1>
        </div>
        <Button type="button" className="min-h-11" onClick={() => setInviting(true)}>
          <UserPlus className="h-4 w-4" aria-hidden="true" /> {copy.invite}
        </Button>
      </div>

      <CoachingNoticeList side="trainer" />

      <TrainerRequests />

      {clients.isLoading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      ) : clients.isError ? (
        <div role="alert" className="rounded-2xl border bg-white p-4 text-sm text-gray-700">
          <p>{userFacingErrorMessage(clients.error)}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => void clients.refetch()}
          >
            {COACHING_COPY.common.retry}
          </Button>
        </div>
      ) : (
        <ClientList clients={clients.data ?? []} />
      )}

      <InvitesSection />

      <TrainerSettings
        displayName={displayName}
        gymLine={gymLine}
        activeClients={clients.data?.length ?? activeClients}
      />

      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
