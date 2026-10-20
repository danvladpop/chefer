'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { syncFailureHint } from '@/features/gym/shared/sync-indicator';
import { RestTimerBar } from '@/features/gym/workout/components/rest-timer-bar';
import {
  formatElapsed,
  sessionProgress,
  unfinishedSets,
  type WorkoutActionInput,
} from '@/features/gym/workout/workout-model';
import { useWakeLock } from '@/features/gym/workout/workout-view';
import { firstName } from '@/features/trainer/format';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, CloudOff, CloudUpload } from 'lucide-react';
import { BOOKING_COPY, COACHING_COPY } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { userFacingErrorMessage, type SessionSupersetSlot } from '@chefer/utils';
import { activeWorkouts, finishPlan, pendingWorkouts, type CoachState } from '../coach-state';
import { chipStatus, coachRoster, pickActiveClient, unstartedClients } from '../roster';
import { useCoachSession, type FinishScope } from '../use-coach-session';
import { ClientSwitcher, COACH_PANEL_ID, coachTabId } from './ClientSwitcher';
import { CoachLogger } from './CoachLogger';

// ─── Coach this session (docs/prd-2026-10/trainer-mode.md §6.7, M3) ───────────
// `/trainer/coach/[bookingId]` (a booking's Start) and `/trainer/coach/new?clientId=`
// ("Log a workout for Maria"). The header reads "Coaching Maria" with the
// timer; a group booking adds a chip per client, each with their own workout
// (started lazily, kept while switching). Finish asks: just this client, or
// everyone. Saving goes through `trainer.coach.sync` into the client's history.

export function CoachView({
  bookingId,
  clientId,
}: {
  bookingId: string | null;
  /** No booking: the client to log for. With a booking: the chip to open first. */
  clientId: string | null;
}) {
  const booking = trpc.trainer.bookings.get.useQuery(
    { bookingId: bookingId ?? '' },
    { enabled: bookingId !== null, retry: false },
  );
  const bookingClients = booking.data?.clients.filter((c) => c.attendance !== 'CANCELLED');
  const exitHref = bookingId
    ? `/trainer/bookings/${encodeURIComponent(bookingId)}`
    : `/trainer/${encodeURIComponent(clientId ?? '')}`;
  const coach = useCoachSession({
    bookingId,
    initialClientId: clientId,
    group: (bookingClients?.length ?? 1) > 1,
    exitHref,
  });
  const { state, starting, startClient, select, dispatch } = coach;
  const roster = useMemo(
    () => coachRoster({ booking: booking.data, state, clientId }),
    [booking.data, state, clientId],
  );
  const activeId = state ? pickActiveClient(roster, state, clientId) : null;
  const activeRoster = roster.find((c) => c.clientId === activeId) ?? null;

  // Open the chosen client: their workout starts the first time they are opened.
  useEffect(() => {
    // Leaving (Finish everyone / the last one): never start anyone else.
    if (!state || !activeId || state.exitWhenSynced) return;
    if (state.workouts[activeId] || starting[activeId] || activeRoster?.alreadyLogged) {
      if (state.activeClientId !== activeId) select(activeId);
      return;
    }
    startClient(activeId);
  }, [state, activeId, activeRoster, starting, select, startClient]);

  const entry = activeId && state ? (state.workouts[activeId] ?? null) : null;
  const logging = entry?.doc && entry.phase === 'active' ? entry : null;
  useWakeLock(logging !== null);

  const [finishOpen, setFinishOpen] = useState(false);
  const onDispatch = useCallback(
    (action: WorkoutActionInput, supersets: ReadonlyMap<string, SessionSupersetSlot>) => {
      if (activeId) dispatch(activeId, action, supersets);
    },
    [activeId, dispatch],
  );

  if (!state || (bookingId !== null && booking.isLoading && roster.length === 0)) {
    return (
      <Frame>
        <h1 className="sr-only">{BOOKING_COPY.coach.header('')}</h1>
        <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      </Frame>
    );
  }

  if (roster.length === 0) {
    return (
      <Frame>
        <h1 className="font-serif text-2xl font-bold text-gray-900">
          {BOOKING_COPY.coach.header('').trim()}
        </h1>
        <p role="alert" className="mt-3 text-sm text-gray-700">
          {booking.error ? userFacingErrorMessage(booking.error) : BOOKING_COPY.server.notFound}
        </p>
        {booking.error && (
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11"
            onClick={() => void booking.refetch()}
          >
            {COACHING_COPY.common.retry}
          </Button>
        )}
      </Frame>
    );
  }

  // Names can be '' (a client known only by id until their workout loads).
  const name = [entry?.name, activeRoster?.name].find((n) => n) ?? '';
  const first = name ? firstName(name) : '';
  const progress = logging?.doc ? sessionProgress(logging.doc) : null;
  const unstarted = unstartedClients(roster, state);
  const others = activeWorkouts(state).filter((w) => w.clientId !== activeId);
  const group = roster.length > 1;

  const finish = (scope: FinishScope) => {
    setFinishOpen(false);
    coach.finish(scope, unstarted);
  };
  const onFinishClick = () => {
    if (!logging?.doc || !activeId) return;
    if (others.length === 0 && unfinishedSets(logging.doc) === 0) {
      finish({ kind: 'this', clientId: activeId });
    } else {
      setFinishOpen(true);
    }
  };

  const panel = (
    <CoachPanel
      state={state}
      activeId={activeId}
      first={first}
      alreadyLogged={activeRoster?.alreadyLogged ?? false}
      startStatus={activeId ? starting[activeId] : undefined}
      onRetryStart={() => activeId && startClient(activeId)}
      onDispatch={onDispatch}
    />
  );

  return (
    <Frame>
      <div className="sticky top-16 z-20 -mx-4 border-b bg-gray-50/95 px-4 py-2 backdrop-blur lg:top-0">
        <div className="flex items-center gap-2">
          <Link
            href={exitHref}
            aria-label={bookingId ? BOOKING_COPY.detail.title : name || 'Back'}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1
              className="truncate font-serif text-lg font-bold text-gray-900"
              data-testid="coach-header"
            >
              {BOOKING_COPY.coach.header(first)}
            </h1>
            {logging?.doc && progress && (
              <p className="flex flex-wrap gap-x-2 text-xs text-gray-500">
                <span className="min-w-0 truncate">{logging.doc.name}</span>
                <ElapsedClock startedAt={logging.doc.startedAt} />
                <span aria-label={`${progress.done} of ${progress.planned} sets done`}>
                  {progress.done}/{progress.planned} sets
                </span>
              </p>
            )}
          </div>
          {logging && (
            <Button
              type="button"
              onClick={onFinishClick}
              className="shrink-0 bg-[#944a00] hover:bg-[#7a3d00]"
              data-testid="coach-finish"
            >
              {BOOKING_COPY.coach.finish}
            </Button>
          )}
        </div>
        {group && (
          <ClientSwitcher
            clients={roster.map((c) => ({
              clientId: c.clientId,
              label: firstName([c.name, state.workouts[c.clientId]?.name].find((n) => n) ?? '…'),
              ...chipStatus(c, state),
            }))}
            activeId={activeId}
            onSelect={(id) => (id === activeId ? undefined : startClient(id))}
          />
        )}
      </div>

      {group && activeId ? (
        <div
          role="tabpanel"
          id={COACH_PANEL_ID}
          aria-labelledby={coachTabId(activeId)}
          className="mt-4"
        >
          {panel}
        </div>
      ) : (
        <div className="mt-4">{panel}</div>
      )}

      <CoachSyncLine state={state} syncing={coach.syncing} onSync={coach.syncNow} />
      <RestTimerBar />

      <FinishSheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        first={first}
        unticked={logging?.doc ? unfinishedSets(logging.doc) : 0}
        others={others.length}
        leftOut={finishPlan(state, { kind: 'all' }).drop.map((id) =>
          firstName(state.workouts[id]?.name ?? ''),
        )}
        onFinishThis={() => activeId && finish({ kind: 'this', clientId: activeId })}
        onFinishAll={() => finish({ kind: 'all' })}
      />
    </Frame>
  );
}

function CoachPanel({
  state,
  activeId,
  first,
  alreadyLogged,
  startStatus,
  onRetryStart,
  onDispatch,
}: {
  state: CoachState;
  activeId: string | null;
  first: string;
  alreadyLogged: boolean;
  startStatus: ReturnType<typeof useCoachSession>['starting'][string] | undefined;
  onRetryStart: () => void;
  onDispatch: (
    action: WorkoutActionInput,
    supersets: ReadonlyMap<string, SessionSupersetSlot>,
  ) => void;
}) {
  const entry = activeId ? state.workouts[activeId] : undefined;
  if (entry?.doc && entry.phase === 'active') {
    return (
      <CoachLogger
        key={entry.clientId}
        entry={{ ...entry, doc: entry.doc }}
        onDispatch={onDispatch}
      />
    );
  }
  if (entry && !entry.doc) {
    return (
      <div
        className="rounded-2xl border border-dashed bg-white p-6 text-center"
        data-testid="coach-no-routine"
      >
        <p className="text-sm text-gray-700">{BOOKING_COPY.coach.noRoutine(first)}</p>
        <Button asChild variant="outline" className="mt-4 min-h-11">
          <Link href={`/trainer/${encodeURIComponent(entry.clientId)}/routine`}>
            {BOOKING_COPY.coach.setUpRoutine(first)}
          </Link>
        </Button>
      </div>
    );
  }
  if (entry) {
    return (
      <div
        className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-700"
        data-testid="coach-saved"
      >
        {entry.phase === 'synced'
          ? BOOKING_COPY.coach.saved(first)
          : BOOKING_COPY.coach.waitingToUpload(first)}
      </div>
    );
  }
  if (alreadyLogged) {
    return (
      <div
        className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-700"
        data-testid="coach-logged"
      >
        {BOOKING_COPY.detail.loggedByYou}
      </div>
    );
  }
  if (startStatus?.status === 'error') {
    return (
      <div className="rounded-2xl border bg-white p-6 text-center">
        <p role="alert" className="text-sm text-gray-700">
          {startStatus.message}
        </p>
        <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={onRetryStart}>
          {COACHING_COPY.common.retry}
        </Button>
      </div>
    );
  }
  return (
    <div
      className="h-48 animate-pulse rounded-2xl bg-gray-100"
      aria-busy="true"
      aria-label="Loading the workout"
    />
  );
}

/** The gym sync line's pattern for finished coached workouts that have not uploaded yet. */
function CoachSyncLine({
  state,
  syncing,
  onSync,
}: {
  state: CoachState;
  syncing: boolean;
  onSync: () => void;
}) {
  const pending = pendingWorkouts(state);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (pending.length === 0) return null;
  const n = pending.length;
  const lastError = pending.find((w) => w.syncError)?.syncError ?? null;
  return (
    <div role="status" className="mt-4">
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        data-testid="coach-sync"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        {online ? (
          <CloudUpload className="h-4 w-4 shrink-0 text-[#944a00]" aria-hidden="true" />
        ) : (
          <CloudOff className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        )}
        {syncing
          ? 'Uploading…'
          : `${n} workout${n === 1 ? '' : 's'} waiting to upload${syncFailureHint(lastError)}${online ? ' · Sync now' : ' · offline'}`}
      </button>
    </div>
  );
}

function FinishSheet({
  open,
  onClose,
  first,
  unticked,
  others,
  leftOut,
  onFinishThis,
  onFinishAll,
}: {
  open: boolean;
  onClose: () => void;
  first: string;
  unticked: number;
  /** Other clients still training. */
  others: number;
  /** Clients "Finish everyone" leaves out (nothing ticked). */
  leftOut: string[];
  onFinishThis: () => void;
  onFinishAll: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={BOOKING_COPY.coach.finishTitle}
      description={unticked > 0 ? BOOKING_COPY.coach.unticked(unticked, first) : undefined}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            {BOOKING_COPY.coach.keepGoing}
          </Button>
          <Button
            variant={others > 0 ? 'outline' : 'default'}
            onClick={onFinishThis}
            data-testid="coach-finish-this"
          >
            {BOOKING_COPY.coach.finishThis(first)}
          </Button>
          {others > 0 && (
            <Button onClick={onFinishAll} data-testid="coach-finish-all">
              {BOOKING_COPY.coach.finishAll}
            </Button>
          )}
        </div>
      }
    >
      {others > 0 && leftOut.length > 0 ? (
        <p className="px-5 pb-4 text-sm text-gray-600">{BOOKING_COPY.coach.leftOut(leftOut)}</p>
      ) : (
        <div />
      )}
    </Sheet>
  );
}

function ElapsedClock({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{formatElapsed(startedAt, now)}</span>;
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:py-6">{children}</div>;
}
