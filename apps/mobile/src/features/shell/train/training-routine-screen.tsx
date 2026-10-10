import { useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  TEMPLATE_BY_KEY,
  type ExerciseMeta,
  type MuscleVolume,
  type ProgressionDto,
  type RoutineDayDto,
  type RoutineHint,
  type VolumeGroup,
} from '@chefer/types';
import {
  IconButton,
  ListRow,
  ListSection,
  MediaTile,
  Screen,
  Sheet,
  Text,
  TileGrid,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  formatLoad,
  repBucket,
  validateRoutine,
  VOLUME_GROUP_LABELS,
  volumeByGroup,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import {
  GymBootstrapUnavailable,
  useGymBootstrapLoad,
} from '../../gym/components/gym-bootstrap-state';
import { dismissHint, getDismissedHints, hintKey } from '../../gym/routine/hints-storage';
import type { SetOverrideInput } from '../../gym/routine/override-payload';
import { OverrideSheet } from '../../gym/routine/override-sheet';
import { useIsOnline } from '../../gym/routine/use-online';
import { WEEKDAY_SHORT_LABELS, weekdayLabel } from '../../gym/routine/weekday';
import { StartConflictSheet } from '../../gym/today/start-conflict-sheet';
import { useGuardedStart } from '../../gym/today/use-train-today';
import { libraryLookup, useGymBootstrap } from '../../gym/use-gym-bootstrap';
import { equipmentOf } from '../../gym/workout/workout-model';
import { ShellTopBar } from '../shell-chrome';
import { TrainButton } from './train-button';
import { TrainCard } from './train-cards';

// ─── Routine (10 Oct redesign, board "TrainingRoutine") ─────────────────────
// The active routine as a card (Edit / My routines), its days as the same
// tiles the Meals grid uses — each with a play button that starts that day
// through the same guarded start as Train — and the weekly balance as bars
// against the target band. A day tile opens its exercises with their next
// targets; tapping one opens the override sheet, as on the old Routine tab.

interface OverrideTarget {
  exercise: ExerciseMeta;
  progression: ProgressionDto;
}

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** One muscle: track (surface + hairline), target band (brand tint), fill (brand). */
export function BalanceBar({ mv, testID }: { mv: MuscleVolume; testID?: string }) {
  const label = VOLUME_GROUP_LABELS[mv.group as VolumeGroup];
  const scale = Math.max(mv.warnAbove, mv.fractional, mv.productiveMax, 1) * 1.05;
  const pct = (v: number): `${number}%` => `${Math.min(100, Math.max(0, (v / scale) * 100))}%`;
  const under = mv.fractional < mv.floor;
  const over = mv.fractional > mv.warnAbove;
  const flag = under ? 'under' : over ? 'over' : null;
  const sets = `${fmt(mv.fractional)} sets`;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${sets} a week, target ${mv.floor} to ${mv.productiveMax}${flag ? `, ${flag} target` : ''}`}
      className="gap-1.5"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-subhead font-semibold text-label">{label}</Text>
        <Text className="text-subhead text-label-secondary">
          {sets}
          {flag ? <Text className="font-semibold text-attention">{` · ${flag}`}</Text> : null}
        </Text>
      </View>
      <View className="h-2.5 overflow-hidden rounded-full border border-separator bg-surface">
        <View
          pointerEvents="none"
          className="absolute h-full bg-brand-tint"
          style={{
            left: pct(mv.floor),
            width: pct(Math.max(0, Math.min(mv.productiveMax, scale) - mv.floor)),
          }}
        />
        <View className="h-full rounded-full bg-brand" style={{ width: pct(mv.fractional) }} />
      </View>
    </View>
  );
}

function BalanceHints({
  hints,
  onDismiss,
}: {
  hints: readonly RoutineHint[];
  onDismiss: (key: string) => void;
}) {
  const colors = useThemeColors();
  if (hints.length === 0) return null;
  return (
    <View className="gap-2 border-t border-separator pt-3">
      {hints.map((hint) => {
        const key = hintKey(hint);
        return (
          <View
            key={key}
            testID={`training-routine-hint-${key}`}
            className="min-h-11 flex-row items-center gap-2 rounded-control bg-surface-sunken py-1 pl-3"
          >
            <Icon
              name="info"
              color={hint.level === 'warning' ? colors.attention : colors.brand}
              size={18}
            />
            <Text className="min-w-0 flex-1 text-subhead text-label">
              {hint.level === 'warning' ? `Heads up: ${hint.message}` : hint.message}
            </Text>
            <IconButton
              testID={`training-routine-hint-${key}-dismiss`}
              accessibilityLabel="Dismiss"
              icon={<Icon name="close" color={colors.labelSecondary} size={18} />}
              onPress={() => onDismiss(key)}
            />
          </View>
        );
      })}
    </View>
  );
}

function dayMeta(day: RoutineDayDto): string {
  const when = day.plannedWeekday === null ? 'Any day' : WEEKDAY_SHORT_LABELS[day.plannedWeekday];
  const n = day.exercises.length;
  return `${when ?? 'Any day'} · ${n} ${n === 1 ? 'exercise' : 'exercises'}`;
}

export function TrainingRoutineScreen() {
  const colors = useThemeColors();
  const bootstrap = useGymBootstrap();
  const bootstrapLoad = useGymBootstrapLoad(bootstrap);
  const isOnline = useIsOnline();
  const utils = trpc.useUtils();
  const starts = useGuardedStart();
  const [openDayId, setOpenDayId] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(null);
  // iOS shows one modal at a time: what the day sheet chose runs once it's gone.
  const afterDaySheet = useRef<(() => void) | null>(null);
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
  void dismissTick;
  const dismissedKeys = routine ? getDismissedHints(routine.id) : new Set<string>();
  const visibleHints = hints.filter((h) => !dismissedKeys.has(hintKey(h)));

  if (!data) {
    return (
      <Screen className="bg-canvas px-0">
        <View className="px-4 pt-2">
          <ShellTopBar />
        </View>
        {/* UX-GYM-24: a failed load has Retry; offline with no cache says so. */}
        <GymBootstrapUnavailable
          load={bootstrapLoad.load === 'data' ? 'loading' : bootstrapLoad.load}
          onRetry={bootstrapLoad.retry}
          testID="training-routine"
          what="your routine"
        />
      </Screen>
    );
  }

  const days = routine ? [...routine.days].sort((a, b) => a.position - b.position) : [];
  const openDay = days.find((d) => d.id === openDayId) ?? null;
  const weeklyGoal = data.profile?.weeklyGoal ?? days.length;

  return (
    <Screen className="bg-canvas px-0">
      <ScrollView testID="training-routine-scroll" contentContainerClassName="gap-4 px-4 pb-8 pt-2">
        <ShellTopBar />

        {!isOnline ? (
          <Text
            testID="training-routine-offline"
            className="rounded-control bg-surface-sunken px-3 py-2 text-subhead text-label-secondary"
          >
            Editing routines needs a connection. Logging works offline.
          </Text>
        ) : null}

        {!routine ? (
          <TrainCard testID="training-routine-empty">
            <Text accessibilityRole="header" className="text-title3 font-bold text-label">
              No active routine
            </Text>
            <Text className="text-subhead text-label-secondary">
              Create one from a template or start from scratch.
            </Text>
            <TrainButton
              testID="training-routine-empty-my-routines"
              label="My routines"
              icon="list"
              onPress={() => router.push('/gym/routines')}
            />
          </TrainCard>
        ) : (
          <>
            <TrainCard testID="training-routine-card">
              <View>
                <Text
                  testID="training-routine-name"
                  accessibilityRole="header"
                  numberOfLines={2}
                  className="text-title3 font-bold text-label"
                >
                  {routine.name}
                </Text>
                <Text className="text-subhead text-label-secondary">
                  {`${days.length} ${days.length === 1 ? 'day' : 'days'} · goal ${weeklyGoal} a week`}
                </Text>
              </View>
              <View className="flex-row gap-2">
                <TrainButton
                  testID="training-routine-edit"
                  label="Edit"
                  icon="edit"
                  variant="tinted"
                  className="flex-1"
                  disabled={!isOnline}
                  accessibilityHint={isOnline ? undefined : 'Editing routines needs a connection'}
                  onPress={() => router.push(`/gym/routine-editor?id=${routine.id}`)}
                />
                <TrainButton
                  testID="training-routine-my-routines"
                  label="My routines"
                  icon="list"
                  variant="outline"
                  className="flex-1"
                  onPress={() => router.push('/gym/routines')}
                />
              </View>
            </TrainCard>

            <Text accessibilityRole="header" className="text-title3 font-bold text-label">
              Days
            </Text>
            <TileGrid testID="training-routine-days">
              {days.map((day) => (
                <MediaTile
                  key={day.id}
                  testID={`training-routine-day-${day.id}`}
                  title={day.name}
                  meta={dayMeta(day)}
                  badge={day.id === routine.nextDayId ? 'Up next' : undefined}
                  illustration={<Icon name="barbell" color={colors.brand} size={34} />}
                  accessibilityHint="Shows its exercises and next targets"
                  onPress={() => setOpenDayId(day.id)}
                  action={
                    <IconButton
                      testID={`training-routine-day-${day.id}-start`}
                      accessibilityLabel={`Start ${day.name}`}
                      className="bg-surface"
                      icon={<Icon name="play" color={colors.brand} size={20} />}
                      onPress={() => starts.startDay(data, day.id)}
                    />
                  }
                />
              ))}
            </TileGrid>

            <Text accessibilityRole="header" className="text-title3 font-bold text-label">
              Weekly balance
            </Text>
            <TrainCard testID="training-routine-balance">
              {volume.map((mv) => (
                <BalanceBar
                  key={mv.group}
                  mv={mv}
                  testID={`training-routine-balance-${mv.group}`}
                />
              ))}
              <Text className="text-caption text-label-secondary">
                Shaded band = weekly target sets
              </Text>
              <BalanceHints
                hints={visibleHints}
                onDismiss={(key) => {
                  dismissHint(routine.id, key);
                  setDismissTick((t) => t + 1);
                }}
              />
            </TrainCard>
          </>
        )}
      </ScrollView>

      <Sheet
        visible={openDay !== null}
        onClose={() => setOpenDayId(null)}
        onExited={() => {
          const run = afterDaySheet.current;
          afterDaySheet.current = null;
          run?.();
        }}
        eyebrow={openDay ? weekdayLabel(openDay.plannedWeekday) : undefined}
        title={openDay?.name ?? 'Day'}
        testID="training-routine-day-sheet"
      >
        {openDay ? (
          <View className="gap-4 pb-4">
            <ListSection footer="Tap an exercise to change its next target.">
              {openDay.exercises.map((ex) => {
                const meta = lookup(ex.exerciseId);
                const bucket = repBucket(ex.repMin, ex.repMax);
                const progression = data.progressions.find(
                  (p) => p.exerciseId === ex.exerciseId && p.repBucket === bucket,
                );
                const next =
                  meta && progression
                    ? ` · Next ${formatLoad(progression.suggestion.weightKg, unit, meta.loadType, {
                        each: meta.perHand,
                      })} × ${progression.suggestion.reps.join('/')}${progression.override ? ' (edited)' : ''}`
                    : '';
                return (
                  <ListRow
                    key={ex.id}
                    testID={`training-routine-exercise-${ex.id}`}
                    title={meta?.name ?? ex.exerciseId}
                    subtitle={`${ex.sets} × ${ex.repMin}–${ex.repMax}${next}`}
                    {...(meta && progression
                      ? {
                          onPress: () => {
                            afterDaySheet.current = () =>
                              setOverrideTarget({ exercise: meta, progression });
                            setOpenDayId(null);
                          },
                        }
                      : {})}
                  />
                );
              })}
            </ListSection>
            <TrainButton
              testID="training-routine-day-sheet-start"
              label={`Start ${openDay.name}`}
              icon="play"
              size="lg"
              onPress={() => {
                const dayId = openDay.id;
                afterDaySheet.current = () => starts.startDay(data, dayId);
                setOpenDayId(null);
              }}
            />
          </View>
        ) : null}
      </Sheet>

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

      {starts.activeWorkout.session ? (
        <StartConflictSheet
          visible={starts.pendingStart !== null}
          onClose={() => starts.setPendingStart(null)}
          session={starts.activeWorkout.session}
          targetName={starts.pendingStart?.targetName ?? 'a new workout'}
          onResume={starts.handleConflictResume}
          onFinishAndStart={() => void starts.handleConflictFinishAndStart()}
          onDiscardAndStart={starts.handleConflictDiscardAndStart}
        />
      ) : null}
    </Screen>
  );
}
