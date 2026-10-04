import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  COACHING_COPY,
  FALLBACK_TRAINER_NAME,
  TEMPLATE_BY_KEY,
  type ExerciseMeta,
  type ProgressionDto,
  type RoutineDayDto,
  type RoutineDto,
} from '@chefer/types';
import { Badge, Button, EmptyState, Screen, Text } from '@chefer/ui-mobile';
import {
  formatLoad,
  repBucket,
  userFacingErrorMessage,
  validateRoutine,
  volumeByGroup,
} from '@chefer/utils';
import { useMarkRoutineSeen } from '../../src/features/coaching/seen-markers';
import {
  GymBootstrapUnavailable,
  useGymBootstrapLoad,
} from '../../src/features/gym/components/gym-bootstrap-state';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { ChangedByLine, TrainerNoteLine } from '../../src/features/gym/routine/attribution';
import { DayCardView } from '../../src/features/gym/routine/day-card-view';
import { dismissHint, getDismissedHints } from '../../src/features/gym/routine/hints-storage';
import { draftToRoutineDoc, routineDtoToDraft } from '../../src/features/gym/routine/mapping';
import type { SetOverrideInput } from '../../src/features/gym/routine/override-payload';
import { OverrideSheet } from '../../src/features/gym/routine/override-sheet';
import { useIsOnline } from '../../src/features/gym/routine/use-online';
import { weekdayLabel } from '../../src/features/gym/routine/weekday';
import { WeeklyBalanceCard } from '../../src/features/gym/routine/weekly-balance';
import { libraryLookup, useGymBootstrap } from '../../src/features/gym/use-gym-bootstrap';
import { equipmentOf } from '../../src/features/gym/workout/workout-model';
import { trpc } from '../../src/lib/trpc';

// Routine tab (gym_plan.md §1.3 "Routine tab"): the active routine's days,
// next targets per exercise, and the weekly-balance card. Editing (routine
// days/exercises) lives in gym/routine-editor.tsx; this screen also opens the
// per-exercise "next target" override sheet (D5c) directly.

interface OverrideTarget {
  exercise: ExerciseMeta;
  progression: ProgressionDto;
}

function DayCard({
  day,
  isNext,
  lookup,
  progressions,
  unit,
  onOverridePress,
  trainerName,
  onRemoveNote,
}: {
  trainerName: string;
  /** Trainer coaching: the client clears a trainer note (the note itself is never editable here). */
  onRemoveNote: ((rowId: string) => void) | undefined;
  day: RoutineDayDto;
  isNext: boolean;
  lookup: (id: string) => ExerciseMeta | undefined;
  progressions: readonly ProgressionDto[];
  unit: 'KG' | 'LB';
  onOverridePress: (target: OverrideTarget) => void;
}) {
  return (
    <DayCardView
      testID={`routine-day-${day.id}`}
      exerciseTestIDPrefix="routine-exercise"
      title={day.name}
      subtitle={weekdayLabel(day.plannedWeekday)}
      badge={
        isNext ? (
          <Badge testID={`routine-day-${day.id}-next`} variant="default">
            Next up
          </Badge>
        ) : null
      }
      exercises={day.exercises.map((ex) => {
        const meta = lookup(ex.exerciseId);
        const bucket = repBucket(ex.repMin, ex.repMax);
        const progression = progressions.find(
          (p) => p.exerciseId === ex.exerciseId && p.repBucket === bucket,
        );
        return {
          id: ex.id,
          name: meta?.name ?? ex.exerciseId,
          summary: `${ex.sets} × ${ex.repMin}–${ex.repMax}`,
          supersetGroup: ex.supersetGroup,
          restSec: ex.restSec,
          ...(ex.lastEditedByOther || ex.trainerNote
            ? {
                extra: (
                  <View className="min-w-0 gap-0.5 pb-1 pl-1">
                    {ex.lastEditedByOther ? (
                      <ChangedByLine
                        testID={`routine-exercise-${ex.id}-changed-by`}
                        stamp={ex.lastEditedByOther}
                      />
                    ) : null}
                    {ex.trainerNote ? (
                      <TrainerNoteLine
                        testID={`routine-exercise-${ex.id}-trainer-note`}
                        trainer={trainerName}
                        note={ex.trainerNote}
                        {...(onRemoveNote ? { onRemove: () => onRemoveNote(ex.id) } : {})}
                      />
                    ) : null}
                  </View>
                ),
              }
            : {}),
          ...(meta && progression
            ? {
                onPress: () => onOverridePress({ exercise: meta, progression }),
                detail: (
                  <View className="flex-row items-center gap-2">
                    <Text variant="muted" className="min-w-0 flex-1 text-xs" numberOfLines={1}>
                      Next:{' '}
                      {formatLoad(progression.suggestion.weightKg, unit, meta.loadType, {
                        each: meta.perHand,
                      })}{' '}
                      × {progression.suggestion.reps.join('/')}
                    </Text>
                    {progression.override ? (
                      <Badge testID={`routine-exercise-${ex.id}-edited`} variant="secondary">
                        {progression.override.setByName
                          ? COACHING_COPY.stamps.setBy(progression.override.setByName)
                          : 'Edited'}
                      </Badge>
                    ) : null}
                  </View>
                ),
              }
            : {}),
        };
      })}
    />
  );
}

export default function RoutineScreen() {
  const bootstrap = useGymBootstrap();
  const bootstrapLoad = useGymBootstrapLoad(bootstrap);
  const isOnline = useIsOnline();
  const utils = trpc.useUtils();
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(null);
  const [dismissTick, setDismissTick] = useState(0);

  const setOverride = trpc.gym.progression.setOverride.useMutation({
    onSuccess: () => {
      setOverrideTarget(null);
      void utils.gym.bootstrap.invalidate();
    },
  });
  const clearOverride = trpc.gym.progression.clearOverride.useMutation({
    onSuccess: () => {
      setOverrideTarget(null);
      void utils.gym.bootstrap.invalidate();
    },
  });

  // Trainer coaching: the client clears a trainer note with a normal version-checked save that names it.
  // Imperative (not a mutation hook) so an uncoached user's screen carries no extra hook.
  const [removingNote, setRemovingNote] = useState(false);
  const removeNote = (routine: RoutineDto, rowId: string) => {
    setRemovingNote(true);
    utils.client.gym.routine.save
      .mutate({
        routine: draftToRoutineDoc(routineDtoToDraft(routine)),
        expectedVersion: routine.version,
        clearTrainerNoteIds: [rowId],
      })
      .catch((error: unknown) => {
        Alert.alert('Could not remove the note', userFacingErrorMessage(error));
      })
      .finally(() => {
        setRemovingNote(false);
        void utils.gym.bootstrap.invalidate();
      });
  };

  const data = bootstrap.data;
  const routine = data?.activeRoutine ?? null;
  // WP-18: opening the Routine tab counts as seeing the trainer's change (Today's notice goes away).
  useMarkRoutineSeen(routine?.id ?? null, routine?.lastEditedByOther?.at ?? null);
  const trainerName = data?.coaching?.trainerName ?? FALLBACK_TRAINER_NAME;
  const lookup = useMemo(() => (data ? libraryLookup(data) : () => undefined), [data]);
  const unit = data?.profile?.unit ?? 'KG';

  const { volume, hints } = useMemo(() => {
    if (!routine || !data?.profile) return { volume: [], hints: [] };
    const template = routine.templateKey ? TEMPLATE_BY_KEY.get(routine.templateKey) : undefined;
    return {
      volume: volumeByGroup(routine, lookup, data.profile.experience),
      hints: validateRoutine(routine, lookup, data.profile.experience, {
        suppressLowVolume: template?.suppressLowVolumeHints ?? false,
      }),
    };
  }, [routine, data, lookup]);

  // Re-read on every render; dismissTick just forces one after a dismiss.
  const dismissedKeys = routine ? getDismissedHints(routine.id) : new Set<string>();
  void dismissTick;

  if (!data) {
    return (
      <Screen className="px-0">
        <ScrollView contentContainerClassName="gap-4 px-4 py-4">
          <ModeSwitch mode="gym" />
          <Text testID="gym-routine-title" variant="title">
            Routine
          </Text>
          {/* UX-GYM-24: a failed load has Retry; offline with no cache says so. */}
          <GymBootstrapUnavailable
            load={bootstrapLoad.load === 'data' ? 'loading' : bootstrapLoad.load}
            onRetry={bootstrapLoad.retry}
            testID="gym-routine"
            what="your routine"
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen className="px-0">
      <ScrollView contentContainerClassName="gap-4 px-4 py-4">
        <ModeSwitch mode="gym" />
        <Text testID="gym-routine-title" variant="title">
          Routine
        </Text>

        {!isOnline ? (
          <View testID="gym-routine-offline-banner" className="rounded-lg bg-amber-50 px-3 py-2">
            <Text className="text-sm text-amber-900">
              Editing routines needs a connection. Logging works offline.
            </Text>
          </View>
        ) : null}

        {!routine ? (
          <EmptyState
            testID="gym-routine-empty"
            title="No active routine"
            description="Create one from a template or start from scratch."
            action={{
              label: 'My routines',
              testID: 'gym-routine-empty-my-routines',
              onPress: () => router.push('/gym/routines'),
            }}
          />
        ) : (
          <>
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text testID="gym-routine-name" variant="heading" numberOfLines={1}>
                  {routine.name}
                </Text>
                <Text variant="muted" className="text-sm">
                  Weekly goal: {data.profile?.weeklyGoal ?? routine.days.length} sessions
                </Text>
                {routine.lastEditedByOther ? (
                  <ChangedByLine
                    routine
                    testID="gym-routine-changed-by"
                    stamp={routine.lastEditedByOther}
                  />
                ) : null}
              </View>
              <Button
                testID="gym-routine-edit"
                size="sm"
                disabled={!isOnline}
                onPress={() => router.push(`/gym/routine-editor?id=${routine.id}`)}
              >
                Edit
              </Button>
            </View>

            {routine.days.map((day) => (
              <DayCard
                key={day.id}
                day={day}
                isNext={day.id === routine.nextDayId}
                lookup={lookup}
                progressions={data.progressions}
                unit={unit}
                onOverridePress={setOverrideTarget}
                trainerName={trainerName}
                onRemoveNote={
                  isOnline && !removingNote ? (rowId) => removeNote(routine, rowId) : undefined
                }
              />
            ))}

            <WeeklyBalanceCard
              testID="gym-routine-balance"
              volume={volume}
              hints={hints}
              dismissedKeys={dismissedKeys}
              onDismiss={(key) => {
                dismissHint(routine.id, key);
                setDismissTick((t) => t + 1);
              }}
            />
          </>
        )}

        {routine ? (
          <Button
            testID="gym-routine-my-routines"
            variant="outline"
            onPress={() => router.push('/gym/routines')}
          >
            My routines
          </Button>
        ) : null}
      </ScrollView>

      {overrideTarget ? (
        <OverrideSheet
          visible
          onClose={() => setOverrideTarget(null)}
          exercise={overrideTarget.exercise}
          unit={unit}
          repBucket={overrideTarget.progression.repBucket}
          progression={overrideTarget.progression}
          profile={equipmentOf(data)}
          saving={setOverride.isPending || clearOverride.isPending}
          onSave={(payload: SetOverrideInput) => setOverride.mutate(payload)}
          onReset={() =>
            clearOverride.mutate({
              exerciseId: overrideTarget.exercise.id,
              repBucket: overrideTarget.progression.repBucket,
            })
          }
        />
      ) : null}
    </Screen>
  );
}
