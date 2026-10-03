import { useMemo, useSyncExternalStore } from 'react';
import { Pressable, Text as RNText, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import type { SessionSummaryDto, WorkoutSessionDoc } from '@chefer/types';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  Screen,
  Text,
} from '@chefer/ui-mobile';
import {
  cn,
  distanceUnitFor,
  effortLabelForRpe,
  formatDistance,
  formatDurationMinutes,
  formatLoad,
  formatLocalDateLong,
  isNotFoundError,
  isStrengthTrackingType,
  toSessionSummary,
  trackingTypeOf,
  weekdayDateLabel,
} from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { useIsOnline } from '../library-screens/online-status';
import { StackBackButton } from '../library-screens/stack-back-button';
import { outbox } from '../offline/outbox';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { sessionDurationMin, viewFromDoc, viewFromSummary, type SessionView } from './session-view';
import { useSessionActions } from './use-session-actions';

// Past session detail (gym_plan.md §1.3): date, duration, each exercise's
// sets (warm-ups dimmed), RIR and notes. UX-44 (T-44.1): the header has `Edit`
// and a `⋯` menu (Edit / Delete workout) — the old bottom-of-screen native
// `Alert` delete is gone. Offline-first: renders from the cached
// `recentSessions` summary immediately, then upgrades to the full
// `session.get` doc (adds notes) once online. A correction still waiting in
// the outbox wins over both (an edit shows at once; a delete hides it).

/** The outbox's copy of a session, if a correction is still waiting to sync. */
function usePendingDoc(sessionId: string): WorkoutSessionDoc | null {
  const state = useSyncExternalStore(outbox.subscribe, outbox.getState);
  return state.entries.find((e) => e.doc.id === sessionId && !e.parkedReason)?.doc ?? null;
}

export function SessionDetailScreen({ sessionId }: { sessionId: string }) {
  const online = useIsOnline();
  const bootstrapQuery = useGymBootstrap();
  const bootstrap = bootstrapQuery.data;
  const bootstrapLoad = useGymBootstrapLoad(bootstrapQuery);
  const pending = usePendingDoc(sessionId);

  const summary = bootstrap?.recentSessions.find((s) => s.id === sessionId);
  const docQuery = trpc.gym.session.get.useQuery({ id: sessionId }, { enabled: online });

  const fullDoc = docQuery.data;

  const view: SessionView | undefined = useMemo(() => {
    if (pending) return pending.status === 'COMPLETED' ? viewFromDoc(pending) : undefined;
    if (fullDoc) return viewFromDoc(fullDoc);
    if (summary) return viewFromSummary(summary);
    return undefined;
  }, [pending, fullDoc, summary]);

  // The `SessionSummaryDto` the shared row actions work on (delete preview, tombstone).
  const actionSession: SessionSummaryDto | null = useMemo(() => {
    if (pending?.status === 'COMPLETED') return toSessionSummary(pending);
    if (summary) return summary;
    return fullDoc ? toSessionSummary(fullDoc) : null;
  }, [pending, summary, fullDoc]);

  const actions = useSessionActions({
    bootstrap,
    source: 'detail',
    onDeleted: () => router.back(),
    testIDPrefix: 'session-detail',
  });

  const libraryLookup = useMemo(
    () => new Map((bootstrap?.library ?? []).map((e) => [e.id, e])),
    [bootstrap],
  );

  if (!view) {
    return (
      <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="px-4 pt-2">
          <StackBackButton testID="gym-session-title-back" />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text testID="gym-session-title" variant="title" className="mb-2">
            Session
          </Text>
          {bootstrapLoad.load === 'loading' || docQuery.isLoading ? (
            <Text variant="muted">Loading…</Text>
          ) : bootstrapLoad.load === 'error' ||
            (docQuery.isError && !isNotFoundError(docQuery.error)) ? (
            // UX-GYM-24: a failed load has Retry; it is not "Session not found".
            <ErrorState
              testID="session-detail-error"
              title="Couldn’t load this session"
              onRetry={() => {
                bootstrapLoad.retry();
                if (online) void docQuery.refetch();
              }}
            />
          ) : (
            <EmptyState
              testID="session-detail-not-found"
              title="Session not found"
              description={online ? 'It may have been deleted.' : 'Connect to load it.'}
            />
          )}
        </View>
      </Screen>
    );
  }

  const duration = sessionDurationMin(view);
  const unit = bootstrap?.profile?.unit ?? 'KG';

  return (
    <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-2" testID="gym-session-detail">
        <View className="flex-row items-center gap-3">
          <StackBackButton testID="gym-session-title-back" />
          <View className="min-w-0 flex-1">
            <Text testID="gym-session-title" variant="title" numberOfLines={1}>
              {view.name}
            </Text>
            <Text variant="muted">
              {formatLocalDateLong(view.localDate)}
              {duration !== null ? ` · ${duration} min` : ''}
              {view.isDeload ? ' · Deload' : ''}
            </Text>
          </View>
          {actionSession ? (
            <>
              <Button
                testID="session-detail-edit"
                variant="ghost"
                size="sm"
                accessibilityLabel={`Edit ${view.name}, ${weekdayDateLabel(view.localDate)}`}
                onPress={() => actions.edit(actionSession)}
              >
                Edit
              </Button>
              <Pressable
                testID="session-detail-options"
                accessibilityRole="button"
                accessibilityLabel={`Options for ${view.name}, ${weekdayDateLabel(view.localDate)}`}
                onPress={() => actions.openMenu(actionSession)}
                className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
              >
                <RNText className="text-xl font-bold text-foreground">⋯</RNText>
              </Pressable>
            </>
          ) : null}
        </View>

        {view.notes ? (
          <Card testID="session-detail-notes">
            <Text variant="muted">{view.notes}</Text>
          </Card>
        ) : null}

        {view.exercises.map((exercise, exerciseIndex) => {
          const meta = libraryLookup.get(exercise.exerciseId);
          // T-42.3: a cardio exercise's one "set" is time/distance/effort,
          // never weightKg × reps (which would read "0 kg × 0" otherwise).
          const cardio = meta ? !isStrengthTrackingType(trackingTypeOf(meta)) : false;
          const distanceUnit = cardio
            ? distanceUnitFor(exercise.exerciseId, unit === 'LB' ? 'MI' : 'KM')
            : null;
          return (
            <Card
              // UX-GYM-34: a lift can appear twice in one session — key on the
              // session-exercise id (summary-only views fall back to the position).
              key={exercise.id ?? `${exercise.exerciseId}-${exerciseIndex}`}
              testID={`session-detail-exercise-${exercise.exerciseId}`}
            >
              <View className="mb-2 flex-row items-center justify-between">
                <CardTitle className="mb-0">{meta?.name ?? exercise.exerciseId}</CardTitle>
                {exercise.skipped ? <Badge variant="secondary">Skipped</Badge> : null}
              </View>
              {!exercise.skipped && cardio
                ? exercise.sets.map((set, i) => (
                    <View key={i} className="flex-row items-center justify-between py-1">
                      <Text>
                        {set.durationSec !== undefined
                          ? formatDurationMinutes(set.durationSec)
                          : '—'}
                        {set.distanceM !== undefined && distanceUnit
                          ? ` · ${formatDistance(set.distanceM, distanceUnit)}`
                          : ''}
                        {set.intensityRpe !== undefined
                          ? ` · ${effortLabelForRpe(set.intensityRpe) ?? `RPE ${set.intensityRpe}`}`
                          : ''}
                        {!set.completed ? ' (not logged)' : ''}
                      </Text>
                    </View>
                  ))
                : null}
              {!exercise.skipped &&
                !cardio &&
                (() => {
                  // Bug B-41: sets used to be numbered by their position in
                  // the WHOLE list (warm-ups included), so a working set
                  // after 2 warm-ups read "Set 3". Warm-ups and working
                  // sets each get their own 1-based counter — the same
                  // convention as `setLabelOf` in workout-model.ts.
                  let warmupN = 0;
                  let workingN = 0;
                  return exercise.sets.map((set, i) => {
                    const label = set.isWarmup ? `Warm-up ${++warmupN}` : `Set ${++workingN}`;
                    return (
                      <View
                        key={i}
                        className={cn(
                          'flex-row items-center justify-between py-1',
                          set.isWarmup && 'opacity-50',
                        )}
                      >
                        <Text variant={set.isWarmup ? 'muted' : 'default'}>{label}</Text>
                        <Text variant={set.isWarmup ? 'muted' : 'default'}>
                          {formatLoad(set.weightKg, unit, meta?.loadType, { each: meta?.perHand })}{' '}
                          × {set.reps}
                          {!set.completed ? ' (not done)' : ''}
                        </Text>
                      </View>
                    );
                  });
                })()}
              {!exercise.skipped && exercise.lastSetRir !== null ? (
                <Text variant="muted" className="mt-1">
                  RIR: {exercise.lastSetRir}
                </Text>
              ) : null}
              {exercise.notes ? (
                <Text variant="muted" className="mt-1">
                  {exercise.notes}
                </Text>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
      {actions.sheets}
    </Screen>
  );
}
