import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { BOOKING_COPY, type TrainerBookingDto } from '@chefer/types';
import { Button, Chip, EmptyState, ErrorState, Screen, Sheet, Text } from '@chefer/ui-mobile';
import { trpc } from '../../lib/trpc';
import { localDate } from '../gym/offline/ids';
import { getGymOwner, subscribeGymOwner } from '../gym/offline/owner';
import { useIsOnline } from '../gym/workout/use-is-online';
import { WorkoutScreen } from '../gym/workout/workout-screen';
import { WorkoutSourceProvider, type CoachedWorkoutChrome } from '../gym/workout/workout-source';
import { TrainerHeader } from '../trainer/components/trainer-header';
import { bookingIdOf, coachedName } from './coach-model';
import { invalidateAfterCoaching } from './coach-sync';
import {
  coachedSessionStore,
  useCoachedRecords,
  type CoachedWorkoutRecord,
} from './coached-session-store';
import { startCoaching, type CoachStartOutcome } from './coached-start';
import { coachedGroup, finishCoachedGroup, finishCoachedWithDefaults } from './coached-workouts';
import { useCoachedSource } from './use-coached-source';

// ─── Coach this session (trainer-mode.md §6.7) ────────────────────────────────
// `/trainer/coach/[bookingId]` (`none` + `?clientId=` = "Log a workout for
// Maria" with no booking). Opening it starts one coached workout per client
// (coached-start.ts), then runs THE workout logger against the active client's
// workout (WorkoutSourceProvider). A group booking gets client chips under the
// header; each client keeps their own workout while switching, and Finish asks
// "Finish Maria's workout" / "Finish everyone". Afterwards: back to the booking
// (or the client) — attendance is marked by the server when the sync lands.

type StartState =
  | { kind: 'starting' }
  | { kind: 'done'; outcome: CoachStartOutcome }
  | { kind: 'failed' };

const NONE: { clientId: string; name: string }[] = [];
const EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

/** Where "done" goes: the booking detail, or the client without a booking. */
function leaveCoaching(bookingId: string | null, clientId: string | null): void {
  if (bookingId !== null) {
    router.dismissTo({ pathname: '/trainer/bookings/[id]', params: { id: bookingId } });
  } else if (clientId) {
    router.dismissTo({ pathname: '/trainer/[clientId]', params: { clientId } });
  } else if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Minimise: the workouts keep going (the mini bar brings them back). */
function minimise(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function CoachScreen({
  bookingKey,
  clientId: clientParam,
}: {
  bookingKey: string;
  clientId: string | null;
}) {
  const bookingId = bookingIdOf(bookingKey);
  const online = useIsOnline();
  const utils = trpc.useUtils();
  const owner = useSyncExternalStore(subscribeGymOwner, getGymOwner);
  const records = useCoachedRecords();
  const group = useMemo(() => coachedGroup(records, bookingId, owner), [records, bookingId, owner]);

  const booking = trpc.trainer.bookings.get.useQuery(
    { bookingId: bookingId ?? '' },
    { enabled: bookingId !== null, retry: false },
  );
  // Start can go once the booking answered — or right away offline / without a booking.
  const bookingSettled = bookingId === null || !online || !booking.isPending;
  const bookingDto: TrainerBookingDto | null = booking.data ?? null;

  const [start, setStart] = useState<StartState>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const startedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!bookingSettled || startedFor.current === attempt) return;
    startedFor.current = attempt;
    setStart({ kind: 'starting' });
    startCoaching({
      bookingId,
      clientId: clientParam,
      booking: bookingDto,
      online,
      today: localDate(),
      fetchStart: (input) => utils.client.trainer.coach.start.mutate(input),
    }).then(
      (outcome) => setStart({ kind: 'done', outcome }),
      () => setStart({ kind: 'failed' }),
    );
  }, [attempt, bookingSettled, bookingDto, bookingId, clientParam, online, utils]);

  // ── The active client ──────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(clientParam);
  const active: CoachedWorkoutRecord | null =
    group.find((r) => r.client.id === activeId) ?? group[0] ?? null;
  const activeClientId = active?.client.id ?? activeId ?? '';

  const finishedClients = useRef(new Set<string>());
  const done = useCallback(() => {
    for (const clientId of finishedClients.current) invalidateAfterCoaching(utils, clientId);
    leaveCoaching(bookingId, clientParam ?? [...finishedClients.current][0] ?? null);
  }, [bookingId, clientParam, utils]);

  /** After one client finished: the next one in the group, or done. */
  const afterFinish = useCallback(
    (clientId: string) => {
      finishedClients.current.add(clientId);
      // Read the store fresh: the finished record is already gone.
      const next = coachedGroup(coachedSessionStore.all(), bookingId, getGymOwner())[0];
      if (next) setActiveId(next.client.id);
      else done();
    },
    [bookingId, done],
  );

  // ── Finish (group) ─────────────────────────────────────────────────────────
  const [finishOpen, setFinishOpen] = useState(false);
  const isGroup = group.length > 1;
  const activeName = active ? coachedName(active.client) : '';

  const finishThis = useCallback(() => {
    setFinishOpen(false);
    if (!active) return;
    if (finishCoachedWithDefaults(bookingId, active.client.id)) afterFinish(active.client.id);
  }, [active, afterFinish, bookingId]);

  const finishAll = useCallback(() => {
    setFinishOpen(false);
    for (const doc of finishCoachedGroup(bookingId)) {
      const clientId = group.find((r) => r.doc.id === doc.id)?.client.id;
      if (clientId) finishedClients.current.add(clientId);
    }
    done();
  }, [bookingId, done, group]);

  const noRoutine = start.kind === 'done' ? start.outcome.noRoutine : NONE;

  const chrome = useMemo<CoachedWorkoutChrome>(
    () => ({
      title: BOOKING_COPY.coach.header(activeName),
      accessory: (
        <CoachAccessory
          group={group}
          activeId={activeClientId}
          onSelect={setActiveId}
          noRoutine={noRoutine}
        />
      ),
      ...(isGroup && { onFinishPress: () => setFinishOpen(true) }),
      onFinished: () => afterFinish(activeClientId),
      onLeave: minimise,
    }),
    [activeName, isGroup, afterFinish, activeClientId, group, noRoutine],
  );
  const source = useCoachedSource(active, bookingId, activeClientId, chrome);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (active) {
    return (
      <WorkoutSourceProvider value={source}>
        <WorkoutScreen key={active.client.id} />
        <Sheet
          testID="coach-finish-sheet"
          visible={finishOpen}
          onClose={() => setFinishOpen(false)}
          title={BOOKING_COPY.coach.finishTitle}
        >
          <View className="gap-3 pb-2">
            <Button testID="coach-finish-this" size="lg" onPress={finishThis}>
              {BOOKING_COPY.coach.finishThis(activeName)}
            </Button>
            <Button testID="coach-finish-all" size="lg" variant="outline" onPress={finishAll}>
              {BOOKING_COPY.coach.finishAll}
            </Button>
            <Button testID="coach-finish-keep" variant="ghost" onPress={() => setFinishOpen(false)}>
              {BOOKING_COPY.coach.keepGoing}
            </Button>
          </View>
        </Sheet>
      </WorkoutSourceProvider>
    );
  }

  return (
    <Screen edges={EDGES} className="bg-canvas px-0" testID="coach-screen">
      <TrainerHeader testID="coach-header" title={BOOKING_COPY.detail.title} onBack={minimise} />
      <View className="flex-1 gap-4 px-4 pt-2">
        {start.kind === 'starting' ? (
          <View testID="coach-starting" className="items-center gap-3 py-10">
            <ActivityIndicator />
            <Text className="text-subhead text-label-secondary">{BOOKING_COPY.coach.starting}</Text>
          </View>
        ) : start.kind === 'failed' ||
          (start.outcome.needsConnection.length > 0 && noRoutine.length === 0) ? (
          <ErrorState
            testID="coach-needs-connection"
            title={BOOKING_COPY.coach.needsConnection}
            description={BOOKING_COPY.coach.needsConnectionBody}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        ) : noRoutine.length > 0 ? (
          <NoRoutineList items={noRoutine} />
        ) : (
          <EmptyState
            testID="coach-done"
            title={BOOKING_COPY.coach.allLogged}
            action={{
              label: BOOKING_COPY.coach.back,
              testID: 'coach-done-back',
              onPress: () => leaveCoaching(bookingId, clientParam),
            }}
          />
        )}
      </View>
    </Screen>
  );
}

/** "Maria has no routine yet." with a link to her routine editor (§6.7). */
function NoRoutineList({ items }: { items: { clientId: string; name: string }[] }) {
  return (
    <View testID="coach-no-routine" className="gap-3">
      {items.map((item) => (
        <View key={item.clientId} className="gap-2">
          <Text className="text-body text-label">{BOOKING_COPY.coach.noRoutine(item.name)}</Text>
          <Button
            testID={`coach-no-routine-edit-${item.clientId}`}
            variant="outline"
            onPress={() =>
              router.push({
                pathname: '/trainer/[clientId]/routine',
                params: { clientId: item.clientId },
              })
            }
          >
            {BOOKING_COPY.coach.setUpRoutine(item.name)}
          </Button>
        </View>
      ))}
    </View>
  );
}

/** Under the logger's header: the group's client chips, and who can't start (no routine). */
function CoachAccessory({
  group,
  activeId,
  onSelect,
  noRoutine,
}: {
  group: readonly CoachedWorkoutRecord[];
  activeId: string | null;
  onSelect: (clientId: string) => void;
  noRoutine: { clientId: string; name: string }[];
}) {
  if (group.length < 2 && noRoutine.length === 0) return null;
  return (
    <View className="gap-2 px-4 pt-3">
      {group.length > 1 ? (
        <View
          testID="coach-switcher"
          accessibilityLabel={BOOKING_COPY.coach.switcherLabel}
          className="flex-row flex-wrap gap-2"
        >
          {group.map((r, index) => (
            <Chip
              key={r.client.id}
              testID={`coach-client-${index}`}
              label={coachedName(r.client)}
              selected={r.client.id === activeId}
              onPress={() => onSelect(r.client.id)}
            />
          ))}
        </View>
      ) : null}
      {noRoutine.length > 0 ? <NoRoutineList items={noRoutine} /> : null}
    </View>
  );
}
