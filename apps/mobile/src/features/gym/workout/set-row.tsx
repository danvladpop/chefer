import { memo, useCallback } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import type {
  EquipmentProfile,
  ExerciseMeta,
  LastTimeSet,
  PrKind,
  SessionSetDoc,
  WeightUnit,
} from '@chefer/types';
import { Text, ValueStepper } from '@chefer/ui-mobile';
import { cn, formatLoad, formatLoadNumber, unitLabel } from '@chefer/utils';
import { nextLoad, PR_LABELS, type WeightMode } from './workout-model';

// One set: `label | last time (muted) | [− weight +] | [− reps +] | ✓`
// (gym_plan.md §1.3). Memoised: ticking one set re-renders that row only —
// the reducer keeps every other set object identical, and all handlers are
// stable (they take ids and read the live doc from the store).

export interface SetRowHandlers {
  onTick: (seId: string, setId: string) => void;
  onWeight: (seId: string, setId: string, kg: number) => void;
  onReps: (seId: string, setId: string, reps: number) => void;
  onOpenWeight: (seId: string, setId: string) => void;
  onOpenReps: (seId: string, setId: string) => void;
}

export interface SetRowProps {
  seId: string;
  set: SessionSetDoc;
  /** "Set 1" / "Warm-up 1". */
  label: string;
  last: LastTimeSet | null;
  meta: ExerciseMeta;
  profile: EquipmentProfile;
  unit: WeightUnit;
  weightMode: WeightMode;
  prKind: PrKind | null;
  handlers: SetRowHandlers;
  testID: string;
}

const MAX_REPS = 100;
const MAX_SECONDS = 3600;
const TIMED_STEP = 5;

function weightCaption(meta: ExerciseMeta, unit: WeightUnit): string {
  if (meta.loadType === 'ASSISTED' || meta.equipment === 'ASSISTED')
    return `${unitLabel(unit)} assist`;
  if (meta.loadType === 'BODYWEIGHT_PLUS' || meta.equipment === 'BODYWEIGHT') {
    return `+${unitLabel(unit)}`;
  }
  return unitLabel(unit);
}

function SetRowImpl({
  seId,
  set,
  label,
  last,
  meta,
  profile,
  unit,
  weightMode,
  prKind,
  handlers,
  testID,
}: SetRowProps) {
  const done = set.completedAt !== null;
  const timed = meta.isTimed;
  const repsCaption = timed ? 's' : 'reps';

  const nextWeight = useCallback(
    (kg: number, direction: 1 | -1) => nextLoad(kg, direction, meta, profile),
    [meta, profile],
  );
  const nextReps = useCallback(
    (reps: number, direction: 1 | -1) =>
      Math.min(
        timed ? MAX_SECONDS : MAX_REPS,
        Math.max(0, reps + direction * (timed ? TIMED_STEP : 1)),
      ),
    [timed],
  );
  const formatWeight = useCallback((kg: number) => formatLoadNumber(kg, unit), [unit]);
  const formatReps = useCallback((reps: number) => String(reps), []);

  const { onTick, onWeight, onReps, onOpenWeight, onOpenReps } = handlers;
  const setWeight = useCallback(
    (kg: number) => onWeight(seId, set.id, kg),
    [onWeight, seId, set.id],
  );
  const setReps = useCallback((r: number) => onReps(seId, set.id, r), [onReps, seId, set.id]);
  const openWeight = useCallback(() => onOpenWeight(seId, set.id), [onOpenWeight, seId, set.id]);
  const openReps = useCallback(() => onOpenReps(seId, set.id), [onOpenReps, seId, set.id]);

  const loadText = formatLoad(set.weightKg, unit, meta.loadType);
  const summary = `${label}: ${loadText}, ${set.reps} ${repsCaption}`;
  const lastText = last
    ? `Last ${weightMode === 'none' ? '' : `${formatLoadNumber(last.weightKg, unit)} × `}${last.reps}${timed ? ' s' : ''}`
    : set.isWarmup
      ? 'Warm-up'
      : '';

  return (
    <View testID={testID} className={cn('gap-0.5 rounded-lg px-1 py-1', done && 'bg-emerald-50')}>
      <View className="min-h-5 flex-row items-center gap-2 px-1">
        <Text testID={`${testID}-label`} className="text-xs font-semibold text-foreground">
          {label}
        </Text>
        <Text
          testID={`${testID}-last`}
          numberOfLines={1}
          className="min-w-0 flex-1 text-xs text-muted-foreground"
        >
          {lastText}
        </Text>
        {prKind ? (
          <View className="rounded-full bg-amber-100 px-2 py-0.5">
            <RNText testID={`${testID}-pr`} className="text-[11px] font-bold text-amber-800">
              {PR_LABELS[prKind]}
            </RNText>
          </View>
        ) : null}
      </View>
      <View className="flex-row items-center gap-1">
        {weightMode === 'none' ? (
          <View className="min-h-11 flex-1 items-center justify-center">
            <Text testID={`${testID}-weight-value`} className="text-base font-semibold">
              BW
            </Text>
          </View>
        ) : (
          <ValueStepper
            className="flex-1"
            testID={`${testID}-weight`}
            name="Weight"
            value={set.weightKg}
            next={nextWeight}
            onChange={setWeight}
            format={formatWeight}
            caption={weightCaption(meta, unit)}
            onPressValue={openWeight}
            done={done}
          />
        )}
        <ValueStepper
          className="flex-1"
          testID={`${testID}-reps`}
          name={timed ? 'Seconds' : 'Reps'}
          value={set.reps}
          next={nextReps}
          onChange={setReps}
          format={formatReps}
          caption={repsCaption}
          onPressValue={openReps}
          done={done}
        />
        <Pressable
          testID={`${testID}-check`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? `${summary}. Logged, tap to undo` : `Log ${summary}`}
          onPress={() => onTick(seId, set.id)}
          className={cn(
            'h-14 w-14 items-center justify-center rounded-xl border-2 active:opacity-70',
            done ? 'border-emerald-600 bg-emerald-600' : 'border-border bg-background',
          )}
        >
          <RNText
            className={cn('text-2xl font-bold', done ? 'text-white' : 'text-muted-foreground')}
          >
            ✓
          </RNText>
        </Pressable>
      </View>
    </View>
  );
}

export const SetRow = memo(SetRowImpl);
