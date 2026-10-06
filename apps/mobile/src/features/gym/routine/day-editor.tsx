import { useEffect, useRef, useState } from 'react';
import { Pressable, Text as RNText, useWindowDimensions, View, type TextInput } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { elevation } from '@chefer/tokens';
import type { ExerciseMeta } from '@chefer/types';
import {
  Button,
  Card,
  ConfirmSheet,
  DONE_FIELD_PROPS,
  Input,
  Sheet,
  Text,
  useReducedMotion,
  useScrollFieldIntoView,
  useSnackbar,
  ValueStepper,
} from '@chefer/ui-mobile';
import {
  cn,
  estimateDurationMin,
  isSupersetWithNext,
  supersetRuns,
  supersetSlot,
} from '@chefer/utils';
import { ExerciseNameLink } from '../components/exercise-name-link';
import { SUPERSET_COPY, SupersetSheet } from '../components/superset-sheet';
import { newId } from '../offline/ids';
import type { RoutineDraftAction } from './reducer';
import {
  MAX_DAYS,
  MAX_EXERCISES_PER_DAY,
  MAX_REST_SEC,
  MAX_SETS,
  MAX_TARGET_RIR,
  MIN_REST_SEC,
  MIN_SETS,
  MIN_TARGET_RIR,
  REST_STEP_SEC,
  type RoutineDayDraft,
  type RoutineExerciseDraft,
} from './types';
import { WeekdayPicker } from './weekday-picker';

// One day of the routine editor (gym_plan.md §5.4, UX-05 A4/T-05.3, O-23).
// Exercise cards are compact by default ("{n} sets · {min}–{max} reps · {rest}
// s rest") and expand ONE AT A TIME (opening another collapses the first) into
// a labelled two-column grid of grouped ValueSteppers, with RIR + superset
// tucked under "More" (MO-05). The name is its own tap target (→
// /gym/exercise/[id], T-05.5 follow-up) — never nested inside the
// expand/collapse Pressable, which instead covers the summary line + chevron.
// Move up/down, Swap and Remove all live in a per-row "⋯" sheet; Remove is
// also a text button once the card is open. Removing a row is immediate (no
// confirm — the routine only ever changes on Save) with an 8s Undo snackbar
// (`restoreExercise`, mirroring the workout reducer's `restoreSet`).

/** "{n} sets · {min}–{max} reps · {rest} s rest" */
export function exerciseSummary(ex: RoutineExerciseDraft): string {
  const range = ex.repMin === ex.repMax ? `${ex.repMin}` : `${ex.repMin}–${ex.repMax}`;
  return `${ex.sets} sets · ${range} reps · ${ex.restSec} s rest`;
}

function clampedStep(min: number, max: number, step = 1) {
  return (value: number, direction: 1 | -1) =>
    Math.min(max, Math.max(min, value + direction * step));
}

/** A grouped ValueStepper with its own 13pt label above it (UX-05 A4). */
function LabeledStepper({
  testID,
  label,
  value,
  format,
  next,
  onChange,
  className,
}: {
  testID: string;
  label: string;
  value: number;
  format: (value: number) => string;
  next: (value: number, direction: 1 | -1) => number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <View className={cn('min-w-0 gap-1', className)}>
      <Text className="text-[13px] text-muted-foreground">{label}</Text>
      <ValueStepper
        testID={testID}
        variant="grouped"
        name={label}
        value={value}
        next={next}
        onChange={onChange}
        format={format}
        caption=""
      />
    </View>
  );
}

function MenuRow({
  testID,
  label,
  onPress,
  disabled = false,
  destructive = false,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-12 justify-center border-b border-border px-1 py-2 active:bg-muted',
        disabled && 'opacity-50',
      )}
    >
      <Text className={cn('text-base font-medium', destructive && 'text-destructive')}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ExerciseRow({
  exercise,
  meta,
  linkedToNext,
  superset,
  isLastInDay,
  expanded,
  onToggleExpand,
  onDispatch,
  onSwap,
  onRemove,
  onOpenMenu,
  testIDBase,
}: {
  exercise: RoutineExerciseDraft;
  meta: ExerciseMeta | undefined;
  /** Place in a superset ("A", 0-based position), when in one. */
  superset: { label: string; position: number } | null;
  linkedToNext: boolean;
  /** No "Superset with next" toggle on the day's last exercise. */
  isLastInDay: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  /** Row actions carry `dayKey: ''`; DayEditor fills it in. */
  onDispatch: (action: RoutineDraftAction) => void;
  onSwap: () => void;
  onRemove: () => void;
  /** Opens the shared "⋯" sheet (Move up/down, Swap, Remove) for this row. */
  onOpenMenu: () => void;
  testIDBase: string;
}) {
  const { fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [moreOpen, setMoreOpen] = useState(false);
  const name = meta?.name ?? exercise.exerciseId;
  const summary = exerciseSummary(exercise);
  const set = onDispatch;
  // AC23: 2 lines at default text, unlimited above 1.3x (a beginner's long
  // name must never truncate at accessibility sizes).
  const nameLines = fontScale > 1.3 ? undefined : 2;
  // The two-column grid becomes one column at 1.8x text (A11y).
  const stacked = fontScale >= 1.8;
  const layoutMs = reducedMotion ? 0 : 220;
  const fadeMs = reducedMotion ? 0 : 150;

  return (
    <Animated.View
      testID={testIDBase}
      layout={LinearTransition.duration(layoutMs)}
      style={expanded ? { boxShadow: elevation.e1 } : undefined}
      className={cn(
        'rounded-2xl bg-card',
        expanded ? 'gap-4 border border-border p-4' : 'px-4 py-3',
        superset && 'border-l-4 border-l-violet-500',
      )}
    >
      <View className="flex-row items-start gap-1">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            {superset ? (
              <View className="rounded bg-violet-100 px-1.5 py-0.5">
                <RNText
                  testID={`${testIDBase}-superset`}
                  className="text-xs font-bold text-violet-800"
                >
                  {superset.label}
                  {superset.position + 1}
                </RNText>
              </View>
            ) : null}
            {/* T-05.5 follow-up: the name is its own tap target, never nested
                inside the expand/collapse Pressable below. */}
            <ExerciseNameLink
              testID={`${testIDBase}-name`}
              exerciseId={exercise.exerciseId}
              name={name}
              numberOfLines={nameLines}
              className="min-w-0 flex-1"
              textClassName="font-medium"
              underline={false}
            />
          </View>
          <Pressable
            testID={`${testIDBase}-toggle`}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`${summary}. Double tap to ${expanded ? 'hide' : 'show'} settings.`}
            onPress={onToggleExpand}
            className="-ml-1 min-h-11 flex-row items-center gap-1 py-1 pl-1 pr-2"
          >
            <Text
              testID={`${testIDBase}-summary`}
              variant="muted"
              numberOfLines={1}
              className="min-w-0 flex-1 text-sm"
            >
              {summary}
            </Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#6b7280" />
          </Pressable>
        </View>
        <Pressable
          testID={`${testIDBase}-menu`}
          accessibilityRole="button"
          accessibilityLabel={`Options for ${name}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onOpenMenu}
          className="h-11 w-11 items-center justify-center"
        >
          <RNText className="text-lg font-bold text-muted-foreground">⋯</RNText>
        </Pressable>
      </View>

      {expanded ? (
        <Animated.View
          testID={`${testIDBase}-details`}
          entering={FadeIn.duration(fadeMs)}
          exiting={FadeOut.duration(fadeMs)}
          className="gap-4"
        >
          <View className={cn('gap-3', stacked ? '' : 'flex-row')}>
            <LabeledStepper
              testID={`${testIDBase}-sets`}
              label="Sets"
              value={exercise.sets}
              format={(v) => String(v)}
              next={clampedStep(MIN_SETS, MAX_SETS)}
              onChange={(sets) =>
                set({ type: 'setSets', dayKey: '', exerciseKey: exercise.key, sets })
              }
              className="flex-1"
            />
            <LabeledStepper
              testID={`${testIDBase}-rest`}
              label="Rest between sets"
              value={exercise.restSec}
              format={(v) => `${v} s`}
              next={clampedStep(MIN_REST_SEC, MAX_REST_SEC, REST_STEP_SEC)}
              onChange={(restSec) =>
                set({ type: 'setRestSec', dayKey: '', exerciseKey: exercise.key, restSec })
              }
              className="flex-1"
            />
          </View>
          <View className={cn('gap-3', stacked ? '' : 'flex-row')}>
            <LabeledStepper
              testID={`${testIDBase}-rep-min`}
              label="Reps from"
              value={exercise.repMin}
              format={(v) => String(v)}
              next={clampedStep(1, 200)}
              onChange={(repMin) =>
                set({ type: 'setRepMin', dayKey: '', exerciseKey: exercise.key, repMin })
              }
              className="flex-1"
            />
            <LabeledStepper
              testID={`${testIDBase}-rep-max`}
              label="to"
              value={exercise.repMax}
              format={(v) => String(v)}
              next={clampedStep(1, 200)}
              onChange={(repMax) =>
                set({ type: 'setRepMax', dayKey: '', exerciseKey: exercise.key, repMax })
              }
              className="flex-1"
            />
          </View>

          {/* MO-05: RIR + superset are expert settings, out of the way. */}
          <Pressable
            testID={`${testIDBase}-more`}
            accessibilityRole="button"
            accessibilityState={{ expanded: moreOpen }}
            accessibilityLabel="More settings"
            onPress={() => setMoreOpen((v) => !v)}
            className="min-h-11 flex-row items-center gap-1 self-start"
          >
            <Text className="text-sm font-medium text-primary">More</Text>
            <Ionicons
              name={moreOpen ? 'chevron-down' : 'chevron-forward'}
              size={14}
              color="#944a00"
            />
          </Pressable>

          {moreOpen ? (
            <Animated.View
              testID={`${testIDBase}-more-content`}
              entering={FadeIn.duration(fadeMs)}
              exiting={FadeOut.duration(fadeMs)}
              className="gap-3"
            >
              <LabeledStepper
                testID={`${testIDBase}-rir`}
                label="Target effort (RIR)"
                value={exercise.targetRir}
                format={(v) => String(v)}
                next={clampedStep(MIN_TARGET_RIR, MAX_TARGET_RIR)}
                onChange={(targetRir) =>
                  set({ type: 'setTargetRir', dayKey: '', exerciseKey: exercise.key, targetRir })
                }
              />
              {!isLastInDay ? (
                <Pressable
                  testID={`${testIDBase}-superset-next`}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: linkedToNext }}
                  accessibilityLabel="Superset with next"
                  onPress={() =>
                    set({
                      type: 'setSupersetWithNext',
                      dayKey: '',
                      exerciseKey: exercise.key,
                      linked: !linkedToNext,
                    })
                  }
                  className="min-h-11 flex-row items-center justify-between rounded-lg bg-muted px-3"
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-medium">Superset with next</Text>
                    <Text variant="muted" className="text-xs">
                      No rest in between; rest after the round
                    </Text>
                  </View>
                  <View
                    className={cn(
                      'h-6 w-11 justify-center rounded-full px-0.5',
                      linkedToNext ? 'items-end bg-violet-500' : 'items-start bg-gray-300',
                    )}
                  >
                    <View className="h-5 w-5 rounded-full bg-white" />
                  </View>
                </Pressable>
              ) : null}
            </Animated.View>
          ) : null}

          {/* One filled control area (the steppers); Swap/Remove are text buttons. */}
          <View className="flex-row items-center gap-4">
            <Pressable
              testID={`${testIDBase}-swap`}
              accessibilityRole="button"
              onPress={onSwap}
              className="min-h-11 justify-center"
            >
              <Text className="text-sm font-medium text-primary">Swap exercise</Text>
            </Pressable>
            <Pressable
              testID={`${testIDBase}-remove`}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${name}`}
              onPress={onRemove}
              className="min-h-11 justify-center"
            >
              <Text className="text-sm font-medium text-destructive">Remove</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export function DayEditor({
  day,
  index,
  dayCount,
  lookup,
  dispatch,
  onAddExercise,
  onSwapExercise,
}: {
  day: RoutineDayDraft;
  index: number;
  dayCount: number;
  lookup: (id: string) => ExerciseMeta | undefined;
  dispatch: (action: RoutineDraftAction) => void;
  onAddExercise: (dayKey: string) => void;
  onSwapExercise: (dayKey: string, exerciseKey: string) => void;
}) {
  const testIDBase = `routine-editor-day-${day.key}`;
  // ExerciseRow dispatches with dayKey: '' — patch it in here, one place, so
  // every row action stays a plain object the reducer can match on dayKey.
  const dispatchForDay = (action: RoutineDraftAction) =>
    dispatch('dayKey' in action ? { ...action, dayKey: day.key } : action);
  const runs = supersetRuns(day.exercises);
  const nameRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  const snackbar = useSnackbar();

  // UX-05 A4 (AC25): only one exercise card is open at a time.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [dayMenuOpen, setDayMenuOpen] = useState(false);
  // UX-X-13: "Delete day" confirms in a ConfirmSheet that opens once the menu
  // sheet has exited (iOS can't present one sheet over a dismissing one).
  const [deleteDayOpen, setDeleteDayOpen] = useState(false);
  // plan-library-supersets S2: the visible "Superset" pick sheet.
  const [supersetOpen, setSupersetOpen] = useState(false);
  // iOS refuses to present a Modal (the exercise picker) or an Alert while
  // a sheet is still dismissing — the invisible sheet then swallows every
  // tap ("Swap exercise freezes", owner dogfood 2026-09-30). Actions that
  // open something run from the sheet's onExited instead.
  const afterSheetExit = useRef<(() => void) | null>(null);
  const runAfterSheetExit = () => {
    const next = afterSheetExit.current;
    afterSheetExit.current = null;
    next?.();
  };

  // A newly added exercise opens expanded.
  const prevKeys = useRef<string[]>(day.exercises.map((e) => e.key));
  useEffect(() => {
    const keys = day.exercises.map((e) => e.key);
    const added = keys.find((k) => !prevKeys.current.includes(k));
    if (added) setExpandedKey(added);
    prevKeys.current = keys;
  }, [day.exercises]);

  const menuIndex = menuKey ? day.exercises.findIndex((e) => e.key === menuKey) : -1;
  const menuExercise = menuIndex >= 0 ? day.exercises[menuIndex] : undefined;
  const menuName = menuExercise ? (lookup(menuExercise.exerciseId)?.name ?? 'this exercise') : '';

  // UX-05 A4: removing a row is immediate — no confirm dialog, the routine
  // only changes on Save — with an 8s Undo snackbar (PAT-16 style).
  const removeExercise = (exerciseKey: string) => {
    const idx = day.exercises.findIndex((e) => e.key === exerciseKey);
    const removed = idx >= 0 ? day.exercises[idx] : undefined;
    if (!removed) return;
    const name = lookup(removed.exerciseId)?.name ?? 'Exercise';
    dispatch({ type: 'removeExercise', dayKey: day.key, exerciseKey });
    setExpandedKey((k) => (k === exerciseKey ? null : k));
    snackbar.show({
      message: `Removed ${name}`,
      actionLabel: 'Undo',
      durationMs: 8000,
      onAction: () => {
        dispatch({ type: 'restoreExercise', dayKey: day.key, index: idx, exercise: removed });
      },
    });
  };

  const durationMin = estimateDurationMin(day, lookup);

  return (
    <Card testID={testIDBase}>
      <View className="flex-row items-center gap-2">
        <Input
          ref={nameRef}
          testID={`${testIDBase}-name`}
          className="flex-1"
          value={day.name}
          maxLength={40}
          onChangeText={(name) => dispatch({ type: 'renameDay', dayKey: day.key, name })}
          onFocus={() => scrollFieldIntoView(nameRef.current)}
          {...DONE_FIELD_PROPS}
          placeholder="Day name"
        />
        <Pressable
          testID={`${testIDBase}-up`}
          accessibilityRole="button"
          accessibilityLabel="Move day up"
          disabled={index === 0}
          onPress={() => dispatch({ type: 'moveDay', dayKey: day.key, direction: 'up' })}
          className="h-11 w-11 items-center justify-center rounded-md bg-muted disabled:opacity-30"
        >
          <Ionicons name="chevron-up" size={18} color="#374151" />
        </Pressable>
        <Pressable
          testID={`${testIDBase}-down`}
          accessibilityRole="button"
          accessibilityLabel="Move day down"
          disabled={index === dayCount - 1}
          onPress={() => dispatch({ type: 'moveDay', dayKey: day.key, direction: 'down' })}
          className="h-11 w-11 items-center justify-center rounded-md bg-muted disabled:opacity-30"
        >
          <Ionicons name="chevron-down" size={18} color="#374151" />
        </Pressable>
      </View>

      <View className="mt-3 gap-1">
        <Text variant="label">Planned weekday</Text>
        <WeekdayPicker
          testID={`${testIDBase}-weekday`}
          value={day.plannedWeekday}
          onChange={(weekday) => dispatch({ type: 'setPlannedWeekday', dayKey: day.key, weekday })}
        />
      </View>

      <View className="mt-3 gap-3">
        {day.exercises.map((ex, i) => {
          const slot = supersetSlot(day.exercises, i);
          const run = slot?.position === 0 ? runs.find((r) => r.start === i) : undefined;
          const lastRest = run ? day.exercises[run.end]?.restSec : undefined;
          return (
            <View key={ex.key} className="gap-1">
              {run && slot ? (
                <View
                  testID={`${testIDBase}-superset-${slot.label}`}
                  className="flex-row items-center gap-2 pt-1"
                >
                  <Text className="text-sm font-semibold text-violet-800">
                    Superset {slot.label}
                  </Text>
                  <Text variant="muted" className="min-w-0 flex-1 text-xs" numberOfLines={1}>
                    {lastRest ?? ex.restSec} s rest after each round
                  </Text>
                  <Pressable
                    testID={`${testIDBase}-superset-${slot.label}-ungroup`}
                    accessibilityRole="button"
                    accessibilityLabel={`Ungroup superset ${slot.label}`}
                    onPress={() =>
                      dispatch({ type: 'ungroupSuperset', dayKey: day.key, exerciseKey: ex.key })
                    }
                    className="min-h-11 justify-center px-2"
                  >
                    <Text className="text-sm font-medium text-primary">
                      {SUPERSET_COPY.ungroup}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <ExerciseRow
                exercise={ex}
                meta={lookup(ex.exerciseId)}
                superset={slot ? { label: slot.label, position: slot.position } : null}
                linkedToNext={isSupersetWithNext(day.exercises, i)}
                isLastInDay={i === day.exercises.length - 1}
                expanded={expandedKey === ex.key}
                onToggleExpand={() => setExpandedKey((k) => (k === ex.key ? null : ex.key))}
                onDispatch={dispatchForDay}
                onSwap={() => onSwapExercise(day.key, ex.key)}
                onRemove={() => removeExercise(ex.key)}
                onOpenMenu={() => setMenuKey(ex.key)}
                testIDBase={`${testIDBase}-exercise-${ex.key}`}
              />
            </View>
          );
        })}
      </View>

      {/* Day footer: a full-width outline "+ Add exercise" that never wraps
          (AC26), the live duration, and the day's own "⋯" (day delete is only
          here, per AC26 — no filled red Delete on the page). */}
      <View className="mt-3">
        <Button
          testID={`${testIDBase}-add-exercise`}
          variant="outline"
          disabled={day.exercises.length >= MAX_EXERCISES_PER_DAY}
          onPress={() => onAddExercise(day.key)}
        >
          <Text numberOfLines={1} className="font-medium text-primary">
            + Add exercise
          </Text>
        </Button>
      </View>
      <View className="mt-1 flex-row items-center justify-between">
        <Text testID={`${testIDBase}-duration`} variant="muted" className="min-w-0 flex-1 text-xs">
          ~{durationMin} min
        </Text>
        {/* plan-library-supersets S2: grouping is one visible tap away, not
            under each exercise's "More". */}
        <Pressable
          testID={`${testIDBase}-superset-create`}
          accessibilityRole="button"
          accessibilityLabel={`Superset, ${day.name}`}
          accessibilityHint="Pick exercises to do back to back"
          accessibilityState={{ disabled: day.exercises.length < 2 }}
          disabled={day.exercises.length < 2}
          onPress={() => setSupersetOpen(true)}
          className={cn(
            'min-h-11 flex-row items-center gap-1 rounded-md px-3 active:bg-muted',
            day.exercises.length < 2 && 'opacity-40',
          )}
        >
          <Ionicons name="link" size={16} color="#6d28d9" />
          <Text className="text-sm font-medium text-violet-800">{SUPERSET_COPY.title}</Text>
        </Pressable>
        <Pressable
          testID={`${testIDBase}-day-menu`}
          accessibilityRole="button"
          accessibilityLabel={`Options for ${day.name}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => setDayMenuOpen(true)}
          className="h-11 w-11 items-center justify-center"
        >
          <RNText className="text-lg font-bold text-muted-foreground">⋯</RNText>
        </Pressable>
      </View>

      <Sheet
        visible={menuKey !== null}
        onClose={() => setMenuKey(null)}
        onExited={runAfterSheetExit}
        title={menuName}
        testID={`${testIDBase}-exercise-menu`}
      >
        <View>
          <MenuRow
            testID={`${testIDBase}-menu-move-up`}
            label="Move up"
            disabled={menuIndex <= 0}
            onPress={() => {
              if (menuExercise) {
                dispatchForDay({
                  type: 'moveExercise',
                  dayKey: '',
                  exerciseKey: menuExercise.key,
                  direction: 'up',
                });
              }
              setMenuKey(null);
            }}
          />
          <MenuRow
            testID={`${testIDBase}-menu-move-down`}
            label="Move down"
            disabled={menuIndex < 0 || menuIndex >= day.exercises.length - 1}
            onPress={() => {
              if (menuExercise) {
                dispatchForDay({
                  type: 'moveExercise',
                  dayKey: '',
                  exerciseKey: menuExercise.key,
                  direction: 'down',
                });
              }
              setMenuKey(null);
            }}
          />
          <MenuRow
            testID={`${testIDBase}-menu-swap`}
            label="Swap exercise"
            onPress={() => {
              const key = menuExercise?.key;
              if (key) afterSheetExit.current = () => onSwapExercise(day.key, key);
              setMenuKey(null);
            }}
          />
          <MenuRow
            testID={`${testIDBase}-menu-remove`}
            label="Remove"
            destructive
            onPress={() => {
              const key = menuExercise?.key;
              setMenuKey(null);
              if (key) removeExercise(key);
            }}
          />
        </View>
      </Sheet>

      <SupersetSheet
        visible={supersetOpen}
        onClose={() => setSupersetOpen(false)}
        testID={`${testIDBase}-superset-sheet`}
        items={day.exercises.map((ex, i) => {
          const slot = supersetSlot(day.exercises, i);
          return {
            key: ex.key,
            name: lookup(ex.exerciseId)?.name ?? 'Exercise',
            detail: slot ? `In superset ${slot.label}` : null,
          };
        })}
        onApply={(exerciseKeys) => {
          dispatch({ type: 'createSuperset', dayKey: day.key, exerciseKeys });
          setSupersetOpen(false);
        }}
      />

      <Sheet
        visible={dayMenuOpen}
        onClose={() => setDayMenuOpen(false)}
        onExited={runAfterSheetExit}
        title={day.name}
        testID={`${testIDBase}-day-menu-sheet`}
      >
        <View>
          <MenuRow
            testID={`${testIDBase}-menu-duplicate`}
            label="Duplicate day"
            disabled={dayCount >= MAX_DAYS}
            onPress={() => {
              dispatch({
                type: 'duplicateDay',
                dayKey: day.key,
                dayId: newId(),
                exerciseIds: day.exercises.map(() => newId()),
              });
              setDayMenuOpen(false);
            }}
          />
          <MenuRow
            testID={`${testIDBase}-menu-delete`}
            label="Delete day"
            destructive
            onPress={() => {
              afterSheetExit.current = () => setDeleteDayOpen(true);
              setDayMenuOpen(false);
            }}
          />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={deleteDayOpen}
        onClose={() => setDeleteDayOpen(false)}
        title="Delete this day?"
        body={`"${day.name}" and its exercises will be removed.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          setDeleteDayOpen(false);
          dispatch({ type: 'deleteDay', dayKey: day.key });
        }}
        testID={`${testIDBase}-delete-confirm`}
      />
    </Card>
  );
}
