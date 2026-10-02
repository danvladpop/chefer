import { memo, useCallback } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { SwipeToRemove } from '../../../components/swipe-to-remove';
import { nextLoad, PR_LABELS, type WeightMode } from './workout-model';

// One set: `label | last time (muted) | [− weight +] | [− reps +] | ✓`
// (gym_plan.md §1.3). Memoised: ticking one set re-renders that row only —
// the reducer keeps every other set object identical, and all handlers are
// stable (they take ids and read the live doc from the store). Long-pressing
// the row (outside its buttons) offers to remove the set (G4-B).

export interface SetRowHandlers {
  onTick: (seId: string, setId: string) => void;
  onWeight: (seId: string, setId: string, kg: number) => void;
  onReps: (seId: string, setId: string, reps: number) => void;
  onOpenWeight: (seId: string, setId: string) => void;
  onOpenReps: (seId: string, setId: string) => void;
  /** Long-press / swipe / ✕ on the row: remove the set (Undo in the snackbar). */
  onLongPress: (seId: string, setId: string) => void;
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
  /** The set to do next (the workout's focus): outlined. */
  focused?: boolean;
  /** False in log mode, where every listed set counts (no ✓ to tick). */
  showCheck?: boolean;
  handlers: SetRowHandlers;
  testID: string;
}

/** muted-foreground — Ionicons takes a colour, not a class. */
const MUTED_ICON = '#6b7280';
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
  focused = false,
  showCheck = true,
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

  const { onTick, onWeight, onReps, onOpenWeight, onOpenReps, onLongPress } = handlers;
  const setWeight = useCallback(
    (kg: number) => onWeight(seId, set.id, kg),
    [onWeight, seId, set.id],
  );
  const setReps = useCallback((r: number) => onReps(seId, set.id, r), [onReps, seId, set.id]);
  const openWeight = useCallback(() => onOpenWeight(seId, set.id), [onOpenWeight, seId, set.id]);
  const openReps = useCallback(() => onOpenReps(seId, set.id), [onOpenReps, seId, set.id]);
  const longPress = useCallback(() => onLongPress(seId, set.id), [onLongPress, seId, set.id]);

  const loadText = formatLoad(set.weightKg, unit, meta.loadType);
  const summary = `${label}: ${loadText}, ${set.reps} ${repsCaption}`;
  const lastText = last
    ? `Last ${weightMode === 'none' ? '' : `${formatLoadNumber(last.weightKg, unit)} × `}${last.reps}${timed ? ' s' : ''}`
    : set.isWarmup
      ? 'Warm-up'
      : '';

  return (
    // T-05.A1.2 (PAT-16, Δ2.6): swipe left removes the set, same path as the
    // ⋯/long-press options below — SwipeToRemove is progressive enhancement,
    // never the only way to remove it (AC14).
    <SwipeToRemove testID={`${testID}-swipe`} onRemove={longPress}>
      {/* accessible={false}: the steppers and ✓ stay individually reachable by
          screen readers (the exercise ⋯ menu also offers "Remove set"). */}
      <Pressable
        testID={testID}
        accessible={false}
        onLongPress={longPress}
        className={cn(
          'gap-0.5 rounded-lg border px-1 py-1',
          done
            ? 'border-transparent bg-emerald-50'
            : focused
              ? 'border-primary/40'
              : 'border-transparent',
        )}
      >
        {/* WP-04: labels one step up (text-sm). min-h, not h: at large OS text
            the row grows; "Last 60 × 10" wraps to two lines instead of clipping. */}
        <View className="min-h-6 flex-row items-center gap-2 px-1">
          <Text testID={`${testID}-label`} className="text-sm font-semibold text-foreground">
            {label}
          </Text>
          <Text
            testID={`${testID}-last`}
            numberOfLines={2}
            className="min-w-0 flex-1 text-sm text-muted-foreground"
          >
            {lastText}
          </Text>
          {prKind ? (
            <View className="rounded-full bg-amber-100 px-2 py-0.5">
              <RNText testID={`${testID}-pr`} className="text-xs font-bold text-amber-800">
                {PR_LABELS[prKind]}
              </RNText>
            </View>
          ) : null}
          {/* UX-05 A1 (T-05.A1.2, PAT-16): a visible remove control on every
            set's label line, same path as long-press/swipe. An ✕, not a ⋯
            (owner dogfood 2026-09-30): it removes the set outright — Undo is
            in the snackbar — so it must not look like a menu. */}
          <Pressable
            testID={`${testID}-menu`}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${label}`}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={longPress}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="close" size={18} color={MUTED_ICON} />
          </Pressable>
        </View>
        {/* UX-05 A1 (T-05.A1.1, O-05/O-06): grouped kg/reps containers 8 pt
          apart, and before the ✓, which is now a round 52 pt control — one
          filled shape per control, not seven equal tiles. */}
        <View className="flex-row items-center gap-2">
          {weightMode === 'none' ? (
            <View className="min-h-11 flex-1 items-center justify-center">
              <Text testID={`${testID}-weight-value`} className="text-xl font-semibold">
                BW
              </Text>
            </View>
          ) : (
            <ValueStepper
              className="flex-1"
              testID={`${testID}-weight`}
              variant="grouped"
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
            variant="grouped"
            name={timed ? 'Seconds' : 'Reps'}
            value={set.reps}
            next={nextReps}
            onChange={setReps}
            format={formatReps}
            caption={repsCaption}
            onPressValue={openReps}
            done={done}
          />
          {showCheck ? (
            <Pressable
              testID={`${testID}-check`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={done ? `${summary}. Logged, tap to undo` : `Log ${summary}`}
              onPress={() => onTick(seId, set.id)}
              className={cn(
                // WP-04: 52 pt visual + hit area (SET_TICK_SIZE) — the control
                // used with a barbell in hand.
                'h-[52px] w-[52px] items-center justify-center rounded-full border-2 active:opacity-70',
                done ? 'border-emerald-600 bg-emerald-600' : 'border-primary/40 bg-background',
              )}
            >
              <RNText
                className={cn('text-2xl font-bold', done ? 'text-white' : 'text-muted-foreground')}
              >
                ✓
              </RNText>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </SwipeToRemove>
  );
}

export const SetRow = memo(SetRowImpl);
