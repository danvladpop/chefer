import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  TEMPLATE_BY_KEY,
  type ExerciseMeta,
  type ProgressionDto,
  type RoutineDayDto,
} from '@chefer/types';
import { Badge, Button, Card, EmptyState, Screen, Text } from '@chefer/ui-mobile';
import { formatLoad, repBucket, validateRoutine, volumeByGroup } from '@chefer/utils';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { dismissHint, getDismissedHints } from '../../src/features/gym/routine/hints-storage';
import type { SetOverrideInput } from '../../src/features/gym/routine/override-payload';
import { OverrideSheet } from '../../src/features/gym/routine/override-sheet';
import { useIsOnline } from '../../src/features/gym/routine/use-online';
import { weekdayLabel } from '../../src/features/gym/routine/weekday';
import { WeeklyBalanceCard } from '../../src/features/gym/routine/weekly-balance';
import { libraryLookup, useGymBootstrap } from '../../src/features/gym/use-gym-bootstrap';
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
}: {
  day: RoutineDayDto;
  isNext: boolean;
  lookup: (id: string) => ExerciseMeta | undefined;
  progressions: readonly ProgressionDto[];
  unit: 'KG' | 'LB';
  onOverridePress: (target: OverrideTarget) => void;
}) {
  return (
    <Card testID={`routine-day-${day.id}`}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text variant="heading" numberOfLines={1}>
            {day.name}
          </Text>
          <Text variant="muted" className="text-xs">
            {weekdayLabel(day.plannedWeekday)}
          </Text>
        </View>
        {isNext ? (
          <Badge testID={`routine-day-${day.id}-next`} variant="default">
            Next up
          </Badge>
        ) : null}
      </View>
      <View className="mt-3 gap-3">
        {day.exercises.map((ex) => {
          const meta = lookup(ex.exerciseId);
          const bucket = repBucket(ex.repMin, ex.repMax);
          const progression = progressions.find(
            (p) => p.exerciseId === ex.exerciseId && p.repBucket === bucket,
          );
          const canEditTarget = meta !== undefined && progression !== undefined;
          return (
            <Pressable
              key={ex.id}
              testID={`routine-exercise-${ex.id}`}
              accessibilityRole={canEditTarget ? 'button' : undefined}
              disabled={!canEditTarget}
              onPress={() => {
                if (meta && progression) onOverridePress({ exercise: meta, progression });
              }}
              className="min-h-11 justify-center gap-0.5"
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text className="min-w-0 flex-1 font-medium" numberOfLines={1}>
                  {meta?.name ?? ex.exerciseId}
                </Text>
                <Text variant="muted" className="text-xs">
                  {ex.sets} × {ex.repMin}–{ex.repMax}
                </Text>
              </View>
              {progression && meta ? (
                <View className="flex-row items-center gap-2">
                  <Text variant="muted" className="min-w-0 flex-1 text-xs" numberOfLines={1}>
                    Next: {formatLoad(progression.suggestion.weightKg, unit, meta.loadType)} ×{' '}
                    {progression.suggestion.reps.join('/')}
                  </Text>
                  {progression.override ? (
                    <Badge testID={`routine-exercise-${ex.id}-edited`} variant="secondary">
                      Edited
                    </Badge>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {day.exercises.length === 0 ? (
          <Text variant="muted" className="text-sm">
            No exercises yet.
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

export default function RoutineScreen() {
  const bootstrap = useGymBootstrap();
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

  const data = bootstrap.data;
  const routine = data?.activeRoutine ?? null;
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
          <ModeSwitch />
          <Text testID="gym-routine-title" variant="title">
            Routine
          </Text>
          {bootstrap.isFetching ? (
            <ActivityIndicator testID="gym-routine-loading" />
          ) : (
            <EmptyState
              testID="gym-routine-offline-empty"
              title="Needs a connection"
              description="Your routine will load once you're back online."
            />
          )}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen className="px-0">
      <ScrollView contentContainerClassName="gap-4 px-4 py-4">
        <ModeSwitch />
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

        <Button
          testID="gym-routine-my-routines"
          variant="outline"
          onPress={() => router.push('/gym/routines')}
        >
          My routines
        </Button>
      </ScrollView>

      {overrideTarget ? (
        <OverrideSheet
          visible
          onClose={() => setOverrideTarget(null)}
          exercise={overrideTarget.exercise}
          unit={unit}
          repBucket={overrideTarget.progression.repBucket}
          progression={overrideTarget.progression}
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
