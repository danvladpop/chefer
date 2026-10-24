'use client';

import { useOptionalAppMode } from '@/features/nav/mode-context';
import {
  AddBookingButton,
  ClientBookingsTab,
} from '@/features/trainer-bookings/components/ClientBookings';
import { LogWorkoutButton } from '@/features/trainer-coach/components/LogWorkoutButton';
import { AssignFromClientButton } from '@/features/trainer-templates/components/AssignFromClientButton';
import { COACHING_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';
import { firstName } from '../format';
import { isClientUnavailable, useClientOverview } from '../use-client-overview';
import { AdherenceView } from './AdherenceTab';
import { ClientHeader } from './ClientHeader';
import { ClientUnavailable } from './ClientUnavailable';
import { FoodTab } from './FoodTab';
import { PrivateNotesPanel } from './PrivateNotesPanel';
import { RemoveClientButton } from './RemoveClientButton';
import { WeekSummaryCard } from './WeekSummaryCard';
import { WorkoutsTab } from './WorkoutsTab';

/** /trainer/[clientId]: Workouts or Adherence, with the private notes beside (xl) or below. */
export function ClientView({
  clientId,
  tab,
}: {
  clientId: string;
  tab: 'workouts' | 'adherence' | 'bookings' | 'food';
}) {
  const overview = useClientOverview(clientId);
  // Templates live in trainer mode: without it (flag off) the header is unchanged.
  const trainerMode = useOptionalAppMode()?.trainerModeAvailable ?? false;

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
  // Lane K2: an older API sends no `sharing`, which reads as nothing shared.
  const sharing = overview.data.client.sharing ?? { food: false, weight: false };
  const sharesData = sharing.food || sharing.weight;
  // Bookings live in trainer mode (M3), Food while the client shares something (K2):
  // otherwise the tab falls back to Workouts.
  const active =
    (tab === 'bookings' && !trainerMode) || (tab === 'food' && !sharesData) ? 'workouts' : tab;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <ClientHeader
        clientId={clientId}
        name={name}
        active={active}
        showBookings={trainerMode}
        showFood={sharesData}
        keepItSimple={overview.data.client.keepItSimple}
        actions={
          trainerMode ? (
            <>
              <AssignFromClientButton clientId={clientId} />
              <AddBookingButton clientId={clientId} name={name} />
              <LogWorkoutButton clientId={clientId} name={name} />
            </>
          ) : undefined
        }
      />
      <WeekSummaryCard clientId={clientId} firstName={firstName(name)} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="min-w-0">
          {active === 'food' ? (
            <FoodTab clientId={clientId} firstName={firstName(name)} sharing={sharing} />
          ) : active === 'bookings' ? (
            <ClientBookingsTab clientId={clientId} />
          ) : active === 'adherence' ? (
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
