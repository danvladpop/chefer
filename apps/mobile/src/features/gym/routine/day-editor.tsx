import { useRef, useState } from 'react';
import { Alert, Pressable, Text as RNText, View, type TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExerciseMeta } from '@chefer/types';
import { Button, Card, Input, Stepper, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { cn, isSupersetWithNext, supersetRuns, supersetSlot } from '@chefer/utils';
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

// One day of the routine editor (gym_plan.md §5.4). Exercise rows are
// collapsed to a one-line summary ("Bench Press · 4 × 6–8 · 180 s") and expand
// on tap to show the steppers, the "Superset with next" toggle, Swap and a
// quiet Remove (confirmed by the screen). Supersets (G4-B) are bracketed in
// violet with an "A1 / A2" chip and a "Superset A" heading.

/** "4 × 6–8 · 180 s" */
export function exerciseSummary(ex: RoutineExerciseDraft): string {
  const range = ex.repMin === ex.repMax ? `${ex.repMin}` : `${ex.repMin}–${ex.repMax}`;
  return `${ex.sets} × ${range} · ${ex.restSec} s`;
}

function MoveButton({
  testID,
  label,
  icon,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  icon: 'chevron-up' | 'chevron-down';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-md bg-muted disabled:opacity-30"
    >
      <Ionicons name={icon} size={18} color="#374151" />
    </Pressable>
  );
}

export function ExerciseRow({
  exercise,
  meta,
  index,
  count,
  superset,
  linkedToNext,
  onDispatch,
  onSwap,
  onRemove,
  testIDBase,
}: {
  exercise: RoutineExerciseDraft;
  meta: ExerciseMeta | undefined;
  index: number;
  count: number;
  /** Place in a superset ("A", 0-based position), when in one. */
  superset: { label: string; position: number } | null;
  linkedToNext: boolean;
  /** Row actions carry `dayKey: ''`; DayEditor fills it in. */
  onDispatch: (action: RoutineDraftAction) => void;
  onSwap: () => void;
  onRemove: () => void;
  testIDBase: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const name = meta?.name ?? exercise.exerciseId;
  const summary = exerciseSummary(exercise);
  const isLast = index === count - 1;
  const set = onDispatch;

  return (
    <View
      testID={testIDBase}
      className={cn(
        'rounded-lg border border-border',
        superset && 'border-l-4 border-l-violet-500',
      )}
    >
      <View className="flex-row items-center gap-1 pr-1">
        <Pressable
          testID={`${testIDBase}-toggle`}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${name} · ${summary}`}
          accessibilityHint={expanded ? 'Hides the settings' : 'Shows sets, reps and rest'}
          onPress={() => setExpanded((v) => !v)}
          className="min-h-11 min-w-0 flex-1 flex-row items-center gap-2 py-2 pl-3"
        >
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
          <Text className="min-w-0 flex-1 font-medium" numberOfLines={1}>
            {name}
          </Text>
          <Text testID={`${testIDBase}-summary`} variant="muted" className="shrink-0 text-sm">
            · {summary}
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#6b7280" />
        </Pressable>
        <MoveButton
          testID={`${testIDBase}-up`}
          label="Move exercise up"
          icon="chevron-up"
          disabled={index === 0}
          onPress={() =>
            set({ type: 'moveExercise', dayKey: '', exerciseKey: exercise.key, direction: 'up' })
          }
        />
        <MoveButton
          testID={`${testIDBase}-down`}
          label="Move exercise down"
          icon="chevron-down"
          disabled={isLast}
          onPress={() =>
            set({
              type: 'moveExercise',
              dayKey: '',
              exerciseKey: exercise.key,
              direction: 'down',
            })
          }
        />
      </View>

      {expanded ? (
        <View testID={`${testIDBase}-details`} className="gap-3 px-3 pb-3">
          <View className="flex-row flex-wrap gap-4">
            <Stepper
              testID={`${testIDBase}-sets`}
              accessibilityLabel="Sets"
              label="sets"
              value={exercise.sets}
              min={MIN_SETS}
              max={MAX_SETS}
              onChange={(sets) =>
                set({ type: 'setSets', dayKey: '', exerciseKey: exercise.key, sets })
              }
            />
            <Stepper
              testID={`${testIDBase}-rep-min`}
              accessibilityLabel="Minimum reps"
              label="min reps"
              value={exercise.repMin}
              min={1}
              max={200}
              onChange={(repMin) =>
                set({ type: 'setRepMin', dayKey: '', exerciseKey: exercise.key, repMin })
              }
            />
            <Stepper
              testID={`${testIDBase}-rep-max`}
              accessibilityLabel="Maximum reps"
              label="max reps"
              value={exercise.repMax}
              min={1}
              max={200}
              onChange={(repMax) =>
                set({ type: 'setRepMax', dayKey: '', exerciseKey: exercise.key, repMax })
              }
            />
            <Stepper
              testID={`${testIDBase}-rest`}
              accessibilityLabel="Rest seconds"
              label="rest (s)"
              value={exercise.restSec}
              step={REST_STEP_SEC}
              min={MIN_REST_SEC}
              max={MAX_REST_SEC}
              onChange={(restSec) =>
                set({ type: 'setRestSec', dayKey: '', exerciseKey: exercise.key, restSec })
              }
            />
            <Stepper
              testID={`${testIDBase}-rir`}
              accessibilityLabel="Target RIR"
              label="target RIR"
              value={exercise.targetRir}
              min={MIN_TARGET_RIR}
              max={MAX_TARGET_RIR}
              onChange={(targetRir) =>
                set({ type: 'setTargetRir', dayKey: '', exerciseKey: exercise.key, targetRir })
              }
            />
          </View>

          {!isLast ? (
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
              className="min-h-11 flex-row items-center justify-between rounded-md bg-muted px-3"
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

          <View className="flex-row items-center gap-2">
            <Button
              testID={`${testIDBase}-swap`}
              variant="outline"
              size="sm"
              className="flex-1"
              onPress={onSwap}
            >
              Swap
            </Button>
            <Pressable
              testID={`${testIDBase}-remove`}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${name}`}
              onPress={onRemove}
              className="min-h-11 justify-center px-3"
            >
              <Text className="text-sm font-medium text-destructive">Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
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
  onRemoveExercise,
}: {
  day: RoutineDayDraft;
  index: number;
  dayCount: number;
  lookup: (id: string) => ExerciseMeta | undefined;
  dispatch: (action: RoutineDraftAction) => void;
  onAddExercise: (dayKey: string) => void;
  onSwapExercise: (dayKey: string, exerciseKey: string) => void;
  /** Ask before removing (the screen owns the confirmation sheet). */
  onRemoveExercise: (dayKey: string, exerciseKey: string) => void;
}) {
  const testIDBase = `routine-editor-day-${day.key}`;
  // ExerciseRow dispatches with dayKey: '' — patch it in here, one place, so
  // every row action stays a plain object the reducer can match on dayKey.
  const dispatchForDay = (action: RoutineDraftAction) =>
    dispatch('dayKey' in action ? { ...action, dayKey: day.key } : action);
  const runs = supersetRuns(day.exercises);
  const nameRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();

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
          returnKeyType="done"
          placeholder="Day name"
        />
        <MoveButton
          testID={`${testIDBase}-up`}
          label="Move day up"
          icon="chevron-up"
          disabled={index === 0}
          onPress={() => dispatch({ type: 'moveDay', dayKey: day.key, direction: 'up' })}
        />
        <MoveButton
          testID={`${testIDBase}-down`}
          label="Move day down"
          icon="chevron-down"
          disabled={index === dayCount - 1}
          onPress={() => dispatch({ type: 'moveDay', dayKey: day.key, direction: 'down' })}
        />
      </View>

      <View className="mt-3 gap-1">
        <Text variant="label">Planned weekday</Text>
        <WeekdayPicker
          testID={`${testIDBase}-weekday`}
          value={day.plannedWeekday}
          onChange={(weekday) => dispatch({ type: 'setPlannedWeekday', dayKey: day.key, weekday })}
        />
      </View>

      <View className="mt-3 gap-2">
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
                </View>
              ) : null}
              <ExerciseRow
                exercise={ex}
                meta={lookup(ex.exerciseId)}
                index={i}
                count={day.exercises.length}
                superset={slot ? { label: slot.label, position: slot.position } : null}
                linkedToNext={isSupersetWithNext(day.exercises, i)}
                onDispatch={dispatchForDay}
                onSwap={() => onSwapExercise(day.key, ex.key)}
                onRemove={() => onRemoveExercise(day.key, ex.key)}
                testIDBase={`${testIDBase}-exercise-${ex.key}`}
              />
            </View>
          );
        })}
      </View>

      <View className="mt-3 flex-row gap-2">
        <Button
          testID={`${testIDBase}-add-exercise`}
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={day.exercises.length >= MAX_EXERCISES_PER_DAY}
          onPress={() => onAddExercise(day.key)}
        >
          Add exercise
        </Button>
        <Button
          testID={`${testIDBase}-duplicate`}
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={dayCount >= MAX_DAYS}
          onPress={() =>
            dispatch({
              type: 'duplicateDay',
              dayKey: day.key,
              dayId: newId(),
              exerciseIds: day.exercises.map(() => newId()),
            })
          }
        >
          Duplicate
        </Button>
        <Button
          testID={`${testIDBase}-delete`}
          variant="destructive"
          size="sm"
          className="flex-1"
          onPress={() =>
            Alert.alert('Delete this day?', `"${day.name}" and its exercises will be removed.`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => dispatch({ type: 'deleteDay', dayKey: day.key }),
              },
            ])
          }
        >
          Delete
        </Button>
      </View>
    </Card>
  );
}
