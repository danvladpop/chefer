import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import type { SessionSummaryDto, WorkoutSessionDoc } from '@chefer/types';
import {
  EmptyState,
  ErrorState,
  IconButton,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  distanceUnitFor,
  effortLabelForRpe,
  formatDistance,
  formatDurationMinutes,
  formatLoad,
  formatLocalDateLong,
  isLoggedWorkout,
  isNotFoundError,
  isStrengthTrackingType,
  loggedWorkoutFacts,
  loggedWorkoutSummaryLine,
  toSessionSummary,
  trackingTypeOf,
  weekdayDateLabel,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { ShellChromeProvider, ShellTopBar, useShellChrome } from '../../shell/shell-chrome';
import { TrainButton } from '../../shell/train/train-button';
import { TrainCard } from '../../shell/train/train-cards';
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

/**
 * Back + the page's actions. 10 Oct redesign: inside the new shell (the route
 * provides a pushed `ShellChromeProvider`) this is the shell's top bar with the
 * actions on its right; the old shell keeps its own stack Back button.
 */
function TopBar({ actions }: { actions: ReactNode }) {
  const chrome = useShellChrome();
  if (chrome) {
    return (
      <ShellChromeProvider value={{ ...chrome, actions: actions ?? undefined }}>
        <ShellTopBar />
      </ShellChromeProvider>
    );
  }
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-2">
      <StackBackButton testID="gym-session-title-back" />
      {actions ? <View className="flex-row items-center gap-1">{actions}</View> : null}
    </View>
  );
}

export function SessionDetailScreen({ sessionId }: { sessionId: string }) {
  const colors = useThemeColors();
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
      <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="px-4 pt-2">
          <TopBar actions={null} />
        </View>
        <View className="flex-1 items-center justify-center gap-2 px-6">
          <Text
            testID="gym-session-title"
            accessibilityRole="header"
            className="text-title2 font-bold text-label"
          >
            Session
          </Text>
          {bootstrapLoad.load === 'loading' || docQuery.isLoading ? (
            <Text className="text-subhead text-label-secondary">Loading…</Text>
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
  const isActivity = isLoggedWorkout({
    routineDayId: view.routineDayId ?? null,
    exercises: view.exercises,
  });
  const activityEffort = isActivity
    ? view.exercises.flatMap((e) => e.sets).find((s) => s.intensityRpe !== undefined)?.intensityRpe
    : undefined;

  const dateLabel = weekdayDateLabel(view.localDate);
  const headerActions = actionSession ? (
    <>
      <TrainButton
        testID="session-detail-edit"
        label="Edit"
        variant="ghost"
        accessibilityLabel={`Edit ${view.name}, ${dateLabel}`}
        onPress={() => actions.edit(actionSession)}
        className="px-3"
      />
      <IconButton
        testID="session-detail-options"
        accessibilityLabel={`Options for ${view.name}, ${dateLabel}`}
        icon={<Icon name="more" color={colors.brand} />}
        onPress={() => actions.openMenu(actionSession)}
        className="-mr-2"
      />
    </>
  ) : null;

  return (
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-2" testID="gym-session-detail">
        <TopBar actions={headerActions} />
        <View className="gap-1">
          <Text
            testID="gym-session-title"
            accessibilityRole="header"
            className="text-title1 font-bold text-label"
            numberOfLines={2}
          >
            {view.name}
          </Text>
          <Text className="text-subhead text-label-secondary">
            {formatLocalDateLong(view.localDate)}
            {duration !== null ? ` · ${duration} min` : ''}
            {view.isDeload ? ' · Deload' : ''}
          </Text>
        </View>

        {view.notes ? (
          <TrainCard testID="session-detail-notes">
            <Text className="text-body text-label">{view.notes}</Text>
          </TrainCard>
        ) : null}

        {/* WP-20: a quick-logged activity reads "Cycling class · 45 min · ~400 kcal (from your
            watch)" — one line, no sets table (the unknown-exercise fallback is the session name). */}
        {isActivity ? (
          <TrainCard testID="session-detail-activity" className="gap-1">
            <Text className="text-headline font-semibold text-label">
              {loggedWorkoutSummaryLine(view.name, loggedWorkoutFacts(view))}
            </Text>
            {activityEffort !== undefined ? (
              <Text className="text-subhead text-label-secondary">
                {`Effort: ${effortLabelForRpe(activityEffort) ?? `RPE ${activityEffort}`}`}
              </Text>
            ) : null}
          </TrainCard>
        ) : null}

        {(isActivity ? [] : view.exercises).map((exercise, exerciseIndex) => {
          const meta = libraryLookup.get(exercise.exerciseId);
          // T-42.3: a cardio exercise's one "set" is time/distance/effort,
          // never weightKg × reps (which would read "0 kg × 0" otherwise).
          const cardio = meta ? !isStrengthTrackingType(trackingTypeOf(meta)) : false;
          const distanceUnit = cardio
            ? distanceUnitFor(exercise.exerciseId, unit === 'LB' ? 'MI' : 'KM')
            : null;
          return (
            <TrainCard
              // UX-GYM-34: a lift can appear twice in one session — key on the
              // session-exercise id (summary-only views fall back to the position).
              key={exercise.id ?? `${exercise.exerciseId}-${exerciseIndex}`}
              testID={`session-detail-exercise-${exercise.exerciseId}`}
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text
                  accessibilityRole="header"
                  className="min-w-0 flex-1 text-headline font-semibold text-label"
                >
                  {meta?.name ?? (view.exercises.length === 1 ? view.name : exercise.exerciseId)}
                </Text>
                {exercise.skipped ? (
                  <View className="rounded-full bg-surface-sunken px-2 py-0.5">
                    <Text className="text-caption font-semibold text-label-secondary">Skipped</Text>
                  </View>
                ) : null}
              </View>
              {!exercise.skipped && cardio
                ? exercise.sets.map((set, i) => (
                    <View key={i} className="flex-row items-center justify-between py-1">
                      <Text className="text-callout text-label">
                        {set.durationSec !== undefined
                          ? formatDurationMinutes(set.durationSec)
                          : '—'}
                        {set.distanceM !== undefined && distanceUnit
                          ? ` · ${formatDistance(set.distanceM, distanceUnit)}`
                          : ''}
                        {set.intensityRpe !== undefined
                          ? ` · ${effortLabelForRpe(set.intensityRpe) ?? `RPE ${set.intensityRpe}`}`
                          : ''}
                        {set.caloriesKcal !== undefined
                          ? ` · ~${Math.round(set.caloriesKcal)} kcal`
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
                          'min-h-8 flex-row items-center justify-between gap-3 py-1',
                          i > 0 && 'border-t border-separator',
                        )}
                      >
                        <Text
                          className={cn(
                            'text-callout',
                            set.isWarmup ? 'text-label-tertiary' : 'text-label-secondary',
                          )}
                        >
                          {label}
                        </Text>
                        <Text
                          className={cn(
                            'text-callout',
                            set.isWarmup ? 'text-label-tertiary' : 'font-semibold text-label',
                          )}
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {formatLoad(set.weightKg, unit, meta?.loadType, { each: meta?.perHand })}{' '}
                          × {set.reps}
                          {!set.completed ? ' (not done)' : ''}
                        </Text>
                      </View>
                    );
                  });
                })()}
              {!exercise.skipped && exercise.lastSetRir !== null ? (
                <Text className="text-subhead text-label-secondary">
                  RIR: {exercise.lastSetRir}
                </Text>
              ) : null}
              {exercise.notes ? (
                <Text className="text-subhead text-label-secondary">{exercise.notes}</Text>
              ) : null}
            </TrainCard>
          );
        })}
      </ScrollView>
      {actions.sheets}
    </Screen>
  );
}
