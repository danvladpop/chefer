import { memo, useMemo, useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { Image } from 'expo-image';
import {
  RIR_VALUES,
  type EquipmentProfile,
  type ExerciseDto,
  type Rir,
  type SessionExerciseDoc,
  type SessionSummaryDto,
  type Suggestion,
  type WeightUnit,
} from '@chefer/types';
import { Chip, Text } from '@chefer/ui-mobile';
import { cn, explain, formatLoadNumber, unitLabel } from '@chefer/utils';
import { exerciseImageUrl } from '../library/exercise-image';
import { SetRow, type SetRowHandlers } from './set-row';
import {
  DIRECTION_ICON,
  directionOf,
  isCalibrating,
  isDone,
  lastTimeSets,
  lastWorkingSetDone,
  livePr,
  warmupSetsOf,
  weightModeOf,
  workingSets,
} from './workout-model';

export type WorkoutSheetRequest =
  | { kind: 'menu'; seId: string }
  | { kind: 'technique'; seId: string }
  | { kind: 'why'; seId: string }
  | { kind: 'weight'; seId: string; setId: string }
  | { kind: 'reps'; seId: string; setId: string };

/** Everything a card needs that isn't the exercise itself — one memoised object. */
export interface WorkoutContext {
  unit: WeightUnit;
  profile: EquipmentProfile;
  lookup: (exerciseId: string) => ExerciseDto;
  /** Completed sessions before this one (last-time column, PRs, history). */
  prior: SessionSummaryDto[];
  handlers: SetRowHandlers;
  onSheet: (request: WorkoutSheetRequest) => void;
  onToggle: (seId: string) => void;
  onRir: (seId: string, rir: Rir | null) => void;
  /** "Not now" on the RIR question. */
  onRirDismiss: (seId: string) => void;
  onSkip: (seId: string, skipped: boolean) => void;
  onAddSet: (seId: string) => void;
  onLayoutY: (seId: string, y: number) => void;
}

export interface ExerciseCardProps {
  exercise: SessionExerciseDoc;
  index: number;
  expanded: boolean;
  isCurrent: boolean;
  ctx: WorkoutContext;
}

function bannerChip(s: Suggestion, unit: WeightUnit): string {
  if (s.kind === 'deload') return '↓ Deload';
  if (s.kind === 'start') return 'New';
  const dir = directionOf(s);
  const delta = Math.abs(s.deltaKg);
  if (dir === 'same' || delta < 0.005) return DIRECTION_ICON[dir];
  return `${DIRECTION_ICON[dir]} ${formatLoadNumber(delta, unit)} ${unitLabel(unit)}`;
}

function ExerciseCardImpl({ exercise: se, index, expanded, isCurrent, ctx }: ExerciseCardProps) {
  const base = `exercise-${index}`;
  const meta = ctx.lookup(se.exerciseId);
  const [showWarmups, setShowWarmups] = useState(false);
  const [rirOpen, setRirOpen] = useState<boolean | null>(null);

  const lastSets = useMemo(
    () => lastTimeSets(se.exerciseId, ctx.prior),
    [se.exerciseId, ctx.prior],
  );
  const pr = useMemo(() => livePr(se, ctx.prior), [se, ctx.prior]);
  const sentence = useMemo(() => explain(se.prescription, ctx.unit), [se.prescription, ctx.unit]);
  const weightMode = weightModeOf(meta, ctx.profile);
  const working = workingSets(se);
  const warmups = warmupSetsOf(se);
  const done = working.filter(isDone).length;
  const warmupsDone = warmups.filter(isDone).length;
  const range = se.repMin === se.repMax ? `${se.repMin}` : `${se.repMin}–${se.repMax}`;
  const subtitle = `${working.length} × ${range}${meta.isTimed ? ' s' : ''} · ${done}/${working.length} done`;
  const imageUri = exerciseImageUrl(meta);
  const calibrating = isCalibrating(se.prescription);
  const showRir = !se.skipped && lastWorkingSetDone(se);
  const rirExpanded = rirOpen ?? se.lastSetRir === null;

  return (
    <View
      testID={base}
      onLayout={(e) => ctx.onLayoutY(se.id, e.nativeEvent.layout.y)}
      className={cn(
        'rounded-2xl border bg-card',
        isCurrent && !se.skipped ? 'border-primary/50' : 'border-border',
        se.skipped && 'opacity-60',
      )}
    >
      <View className="flex-row items-center gap-2 p-2">
        <Pressable
          testID={`${base}-thumb`}
          accessibilityRole="button"
          accessibilityLabel={`Technique for ${meta.name}`}
          onPress={() => ctx.onSheet({ kind: 'technique', seId: se.id })}
          className="h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-muted"
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ width: 48, height: 48 }}
              contentFit="cover"
              cachePolicy="disk"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <RNText className="text-lg font-bold text-muted-foreground">
              {meta.name.slice(0, 1)}
            </RNText>
          )}
        </Pressable>
        <Pressable
          testID={`${base}-header`}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${meta.name}, ${subtitle}`}
          onPress={() => ctx.onToggle(se.id)}
          className="min-h-12 min-w-0 flex-1 justify-center"
        >
          <Text testID={`${base}-name`} numberOfLines={2} className="text-base font-semibold">
            {meta.name}
          </Text>
          <Text testID={`${base}-progress`} variant="muted" numberOfLines={1}>
            {se.skipped ? 'Skipped' : subtitle}
            {pr ? ' · PR' : ''}
          </Text>
        </Pressable>
        <Pressable
          testID={`${base}-menu`}
          accessibilityRole="button"
          accessibilityLabel={`More options for ${meta.name}`}
          onPress={() => ctx.onSheet({ kind: 'menu', seId: se.id })}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
        >
          <RNText className="text-xl font-bold text-foreground">⋯</RNText>
        </Pressable>
      </View>

      {se.skipped ? (
        <View className="flex-row items-center justify-between px-3 pb-2">
          <Text variant="muted">Skipped today. It won&apos;t count as a miss.</Text>
          <Pressable
            testID={`${base}-unskip`}
            accessibilityRole="button"
            onPress={() => ctx.onSkip(se.id, false)}
            className="min-h-11 justify-center px-2"
          >
            <Text className="font-semibold text-primary">Undo</Text>
          </Pressable>
        </View>
      ) : expanded ? (
        <View className="gap-2 px-2 pb-3">
          <View className="flex-row items-start gap-2 rounded-xl bg-accent p-2">
            <View className="rounded-md bg-card px-2 py-1">
              <RNText testID={`${base}-direction`} className="text-xs font-bold text-primary">
                {bannerChip(se.prescription, ctx.unit)}
              </RNText>
            </View>
            <Text testID={`${base}-suggestion`} className="min-w-0 flex-1 text-sm">
              {sentence}
            </Text>
            <Pressable
              testID={`${base}-why`}
              accessibilityRole="button"
              accessibilityLabel="Why this target?"
              onPress={() => ctx.onSheet({ kind: 'why', seId: se.id })}
              className="-my-2 min-h-11 justify-center px-2"
            >
              <Text className="text-sm font-semibold text-primary">Why?</Text>
            </Pressable>
          </View>

          {warmups.length > 0 ? (
            <View>
              <Pressable
                testID={`${base}-warmups-toggle`}
                accessibilityRole="button"
                accessibilityState={{ expanded: showWarmups }}
                onPress={() => setShowWarmups((v) => !v)}
                className="min-h-11 flex-row items-center justify-between px-1"
              >
                <Text variant="muted">
                  {warmups.length} warm-up {warmups.length === 1 ? 'set' : 'sets'}
                  {warmupsDone > 0 ? ` · ${warmupsDone} done` : ''}
                </Text>
                <Text variant="muted">{showWarmups ? 'Hide ▴' : 'Show ▾'}</Text>
              </Pressable>
              {showWarmups
                ? warmups.map((s, i) => (
                    <SetRow
                      key={s.id}
                      seId={se.id}
                      set={s}
                      label={`Warm-up ${i + 1}`}
                      last={null}
                      meta={meta}
                      profile={ctx.profile}
                      unit={ctx.unit}
                      weightMode={weightMode}
                      prKind={null}
                      handlers={ctx.handlers}
                      testID={`${base}-warmup-${i + 1}`}
                    />
                  ))
                : null}
            </View>
          ) : null}

          {working.map((s, i) => (
            <SetRow
              key={s.id}
              seId={se.id}
              set={s}
              label={`Set ${i + 1}`}
              last={lastSets[i] ?? null}
              meta={meta}
              profile={ctx.profile}
              unit={ctx.unit}
              weightMode={weightMode}
              prKind={pr?.setId === s.id ? pr.kind : null}
              handlers={ctx.handlers}
              testID={`${base}-set-${i + 1}`}
            />
          ))}

          {showRir ? (
            rirExpanded ? (
              <View
                testID={`${base}-rir`}
                className={cn(
                  'gap-2 rounded-xl p-3',
                  calibrating ? 'border border-primary/40 bg-accent' : 'bg-muted',
                )}
              >
                <View className="flex-row items-start justify-between gap-2">
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-medium">
                      How many more reps could you have done?
                    </Text>
                    {calibrating ? (
                      <Text testID={`${base}-rir-calibrating`} className="text-xs text-primary">
                        Helps us find your weight
                      </Text>
                    ) : (
                      <Text variant="muted" className="text-xs">
                        Optional, on your last set
                      </Text>
                    )}
                  </View>
                  <Pressable
                    testID={`${base}-rir-hide`}
                    accessibilityRole="button"
                    accessibilityLabel="Hide reps-left question"
                    onPress={() => {
                      setRirOpen(false);
                      ctx.onRirDismiss(se.id);
                    }}
                    className="-my-2 min-h-11 justify-center px-2"
                  >
                    <Text variant="muted">{se.lastSetRir === null ? 'Not now' : 'Done'}</Text>
                  </Pressable>
                </View>
                <View className="flex-row gap-2">
                  {RIR_VALUES.map((v) => (
                    <Chip
                      key={v}
                      testID={`${base}-rir-${v}`}
                      label={v === 3 ? '3+' : String(v)}
                      selected={se.lastSetRir === v}
                      className="flex-1 px-0"
                      onPress={() => {
                        ctx.onRir(se.id, se.lastSetRir === v ? null : v);
                        if (se.lastSetRir !== v) setRirOpen(false);
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <Pressable
                testID={`${base}-rir-summary`}
                accessibilityRole="button"
                onPress={() => setRirOpen(true)}
                className="min-h-11 flex-row items-center justify-between rounded-xl bg-muted px-3"
              >
                <Text className="text-sm">
                  {se.lastSetRir === null
                    ? 'Reps left on the last set (optional)'
                    : `Reps left on the last set: ${se.lastSetRir === 3 ? '3+' : String(se.lastSetRir)}`}
                </Text>
                <Text className="text-sm font-semibold text-primary">
                  {se.lastSetRir === null ? 'Add' : 'Change'}
                </Text>
              </Pressable>
            )
          ) : null}

          {se.notes ? (
            <Text testID={`${base}-note`} variant="muted" className="px-1">
              Note: {se.notes}
            </Text>
          ) : null}

          <Pressable
            testID={`${base}-add-set`}
            accessibilityRole="button"
            onPress={() => ctx.onAddSet(se.id)}
            className="min-h-11 items-center justify-center rounded-lg border border-dashed border-border"
          >
            <Text className="text-sm font-medium text-primary">+ Add set</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export const ExerciseCard = memo(ExerciseCardImpl);
