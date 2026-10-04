'use client';

import { COACHING_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';
import { isClientUnavailable, useClientOverview } from '../use-client-overview';
import { AdherenceView } from './AdherenceTab';
import { ClientHeader } from './ClientHeader';
import { ClientUnavailable } from './ClientUnavailable';
import { PrivateNotesPanel } from './PrivateNotesPanel';
import { RemoveClientButton } from './RemoveClientButton';
import { WorkoutsTab } from './WorkoutsTab';

/** /trainer/[clientId]: Workouts or Adherence, with the private notes beside (xl) or below. */
export function ClientView({ clientId, tab }: { clientId: string; tab: 'workouts' | 'adherence' }) {
  const overview = useClientOverview(clientId);

  if (overview.isError && isClientUnavailable(overview.error)) return <ClientUnavailable />;
  if (overview.isError) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6">
        <h1 className="font-serif text-2xl font-bold text-gray-900">
          {COACHING_COPY.trainer.clients}
        </h1>
        <p role="alert" className="mt-3 text-sm text-gray-700">
          {userFacingErrorMessage(overview.error)}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 min-h-11"
          onClick={() => void overview.refetch()}
        >
          {COACHING_COPY.common.retry}
        </Button>
      </div>
    );
  }
  if (!overview.data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="sr-only">{COACHING_COPY.trainer.clients}</h1>
        <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      </div>
    );
  }

  const name = overview.data.client.name;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <ClientHeader clientId={clientId} name={name} active={tab} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="min-w-0">
          {tab === 'adherence' ? (
            <AdherenceView adherence={overview.data.adherence} />
          ) : (
            <WorkoutsTab clientId={clientId} />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <PrivateNotesPanel clientId={clientId} clientName={name} />
          <div>
            <RemoveClientButton clientId={clientId} clientName={name} />
          </div>
        </div>
      </div>
    </div>
  );
}
