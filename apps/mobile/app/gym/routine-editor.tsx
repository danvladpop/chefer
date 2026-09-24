import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { TEMPLATE_BY_KEY, type ExerciseMeta, type RoutineDto } from '@chefer/types';
import { Badge, Button, Card, Input, Screen, Sheet, Stepper, Text } from '@chefer/ui-mobile';
import { validateRoutine, volumeByGroup } from '@chefer/utils';
import { ExercisePicker } from '../../src/features/gym/library/exercise-picker';
import { newId } from '../../src/features/gym/offline/ids';
import {
  extractRoutineConflict,
  keepMineAfterConflict,
  loadTheirsAfterConflict,
} from '../../src/features/gym/routine/conflict';
import {
  draftsEqual,
  draftToRoutineDoc,
  routineDtoToDraft,
} from '../../src/features/gym/routine/mapping';
import {
  routineDraftReducer,
  type RoutineDraftAction,
} from '../../src/features/gym/routine/reducer';
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
  type RoutineDraft,
  type RoutineExerciseDraft,
} from '../../src/features/gym/routine/types';
import { useIsOnline } from '../../src/features/gym/routine/use-online';
import { WeekdayPicker } from '../../src/features/gym/routine/weekday-picker';
import { WeeklyBalanceCard } from '../../src/features/gym/routine/weekly-balance';
import { libraryLookup, useGymBootstrap } from '../../src/features/gym/use-gym-bootstrap';
import { trpc } from '../../src/lib/trpc';

// Routine editor (gym_plan.md §5.4, D5a): a local draft copied from the
// RoutineDto. Save is explicit and carries `expectedVersion`; a stale version
// opens the conflict sheet. Leaving with unsaved edits — by the back button,
// the header back arrow, or an iOS swipe — is confirmed via the navigator's
// `beforeRemove` event, which fires for all three (and for Android's hardware
// back button inside a stack navigator), so one listener covers them all.

const EMPTY_DRAFT: RoutineDraft = { id: '', name: '', version: 0, days: [] };

interface ConflictState {
  current: RoutineDto;
}

type PickerState =
  | { dayKey: string; mode: 'add' }
  | { dayKey: string; mode: 'swap'; exerciseKey: string };

function ExerciseRow({
  exercise,
  meta,
  index,
  count,
  onDispatch,
  onSwap,
  testIDBase,
}: {
  exercise: RoutineExerciseDraft;
  meta: ExerciseMeta | undefined;
  index: number;
  count: number;
  onDispatch: (action: RoutineDraftAction) => void;
  onSwap: () => void;
  testIDBase: string;
}) {
  return (
    <View testID={testIDBase} className="gap-2 rounded-lg border border-border p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="min-w-0 flex-1 font-medium" numberOfLines={1}>
          {meta?.name ?? exercise.exerciseId}
        </Text>
        <View className="flex-row gap-1">
          <Pressable
            testID={`${testIDBase}-up`}
            accessibilityRole="button"
            accessibilityLabel="Move exercise up"
            disabled={index === 0}
            onPress={() =>
              onDispatch({
                type: 'moveExercise',
                dayKey: '',
                exerciseKey: exercise.key,
                direction: 'up',
              })
            }
            className="h-11 w-11 items-center justify-center rounded-md bg-muted disabled:opacity-30"
          >
            <Ionicons name="chevron-up" size={18} color="#374151" />
          </Pressable>
          <Pressable
            testID={`${testIDBase}-down`}
            accessibilityRole="button"
            accessibilityLabel="Move exercise down"
            disabled={index === count - 1}
            onPress={() =>
              onDispatch({
                type: 'moveExercise',
                dayKey: '',
                exerciseKey: exercise.key,
                direction: 'down',
              })
            }
            className="h-11 w-11 items-center justify-center rounded-md bg-muted disabled:opacity-30"
          >
            <Ionicons name="chevron-down" size={18} color="#374151" />
          </Pressable>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-4">
        <Stepper
          testID={`${testIDBase}-sets`}
          accessibilityLabel="Sets"
          label="sets"
          value={exercise.sets}
          min={MIN_SETS}
          max={MAX_SETS}
          onChange={(sets) =>
            onDispatch({ type: 'setSets', dayKey: '', exerciseKey: exercise.key, sets })
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
            onDispatch({ type: 'setRepMin', dayKey: '', exerciseKey: exercise.key, repMin })
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
            onDispatch({ type: 'setRepMax', dayKey: '', exerciseKey: exercise.key, repMax })
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
            onDispatch({ type: 'setRestSec', dayKey: '', exerciseKey: exercise.key, restSec })
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
            onDispatch({ type: 'setTargetRir', dayKey: '', exerciseKey: exercise.key, targetRir })
          }
        />
      </View>

      <View className="flex-row gap-2">
        <Button
          testID={`${testIDBase}-swap`}
          variant="outline"
          size="sm"
          className="flex-1"
          onPress={onSwap}
        >
          Swap
        </Button>
        <Button
          testID={`${testIDBase}-remove`}
          variant="destructive"
          size="sm"
          className="flex-1"
          onPress={() =>
            onDispatch({ type: 'removeExercise', dayKey: '', exerciseKey: exercise.key })
          }
        >
          Remove
        </Button>
      </View>
    </View>
  );
}

function DayEditor({
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

  return (
    <Card testID={testIDBase}>
      <View className="flex-row items-center gap-2">
        <Input
          testID={`${testIDBase}-name`}
          className="flex-1"
          value={day.name}
          maxLength={40}
          onChangeText={(name) => dispatch({ type: 'renameDay', dayKey: day.key, name })}
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
        {day.exercises.map((ex, i) => (
          <ExerciseRow
            key={ex.key}
            exercise={ex}
            meta={lookup(ex.exerciseId)}
            index={i}
            count={day.exercises.length}
            onDispatch={dispatchForDay}
            onSwap={() => onSwapExercise(day.key, ex.key)}
            testIDBase={`${testIDBase}-exercise-${ex.key}`}
          />
        ))}
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

export default function GymRoutineEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routineId = typeof id === 'string' ? id : '';
  const navigation = useNavigation();
  const isOnline = useIsOnline();
  const utils = trpc.useUtils();
  const bootstrap = useGymBootstrap();

  const routineQuery = trpc.gym.routine.get.useQuery(
    { id: routineId },
    { enabled: routineId !== '' },
  );
  const saveMutation = trpc.gym.routine.save.useMutation();

  const [draft, setDraft] = useState<RoutineDraft>(EMPTY_DRAFT);
  const [baseline, setBaseline] = useState<RoutineDraft | null>(null);
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const loadedRef = useRef(false);

  const dispatch = (action: RoutineDraftAction) =>
    setDraft((prev) => routineDraftReducer(prev, action));

  useEffect(() => {
    if (loadedRef.current || !routineQuery.data) return;
    loadedRef.current = true;
    const initial = routineDtoToDraft(routineQuery.data);
    setDraft(initial);
    setBaseline(initial);
    setTemplateKey(routineQuery.data.templateKey);
  }, [routineQuery.data]);

  const dirty = baseline !== null && !draftsEqual(draft, baseline);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!dirty) return;
      e.preventDefault();
      Alert.alert('Discard changes?', 'Your edits to this routine have not been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
      ]);
    });
    return unsubscribe;
  }, [navigation, dirty]);

  const library = bootstrap.data?.library ?? [];
  const lookup = useMemo(
    () => (bootstrap.data ? libraryLookup(bootstrap.data) : () => undefined),
    [bootstrap.data],
  );

  const { volume, hints } = useMemo(() => {
    if (!bootstrap.data?.profile || draft.days.length === 0) return { volume: [], hints: [] };
    const template = templateKey ? TEMPLATE_BY_KEY.get(templateKey) : undefined;
    return {
      volume: volumeByGroup(draft, lookup, bootstrap.data.profile.experience),
      hints: validateRoutine(draft, lookup, bootstrap.data.profile.experience, {
        suppressLowVolume: template?.suppressLowVolumeHints ?? false,
      }),
    };
  }, [draft, bootstrap.data, lookup, templateKey]);

  const submitSave = (routine: RoutineDraft) => {
    saveMutation.mutate(
      { routine: draftToRoutineDoc(routine), expectedVersion: routine.version },
      {
        onSuccess: (dto) => {
          const next = routineDtoToDraft(dto);
          setDraft(next);
          setBaseline(next);
          void utils.gym.bootstrap.invalidate();
        },
        onError: (error) => {
          const current = extractRoutineConflict(error);
          if (current) {
            setConflict({ current });
            return;
          }
          Alert.alert('Could not save', error.message);
        },
      },
    );
  };

  const activePickerDay = picker ? draft.days.find((d) => d.key === picker.dayKey) : undefined;
  const excludeIds = activePickerDay?.exercises.map((e) => e.exerciseId) ?? [];
  const swapExercise =
    picker?.mode === 'swap'
      ? activePickerDay?.exercises.find((e) => e.key === picker.exerciseKey)
      : undefined;
  const preferSwapGroup = swapExercise
    ? (lookup(swapExercise.exerciseId)?.swapGroup ?? null)
    : null;

  if (routineQuery.isPending) {
    return (
      <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator testID="gym-routine-editor-loading" />
        </View>
      </Screen>
    );
  }

  if (routineQuery.isError) {
    return (
      <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text testID="gym-routine-editor-title" variant="title">
            Edit routine
          </Text>
          <Text variant="muted" className="text-center">
            {routineQuery.error.message}
          </Text>
          <Button testID="gym-routine-editor-back" onPress={() => router.back()}>
            Back
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
      {/* Sticky header: Back stays reachable however far the draft scrolls. */}
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable
          testID="gym-routine-editor-title-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
        >
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </Pressable>
        <Text testID="gym-routine-editor-title" variant="title" className="min-w-0 flex-1">
          Edit routine
        </Text>
        {dirty ? (
          <Badge testID="gym-routine-editor-dirty" variant="warning">
            Unsaved
          </Badge>
        ) : null}
      </View>
      <ScrollView contentContainerClassName="gap-4 px-4 py-4">
        {!isOnline ? (
          <View
            testID="gym-routine-editor-offline-banner"
            className="rounded-lg bg-amber-50 px-3 py-2"
          >
            <Text className="text-sm text-amber-900">
              Editing routines needs a connection. Logging works offline.
            </Text>
          </View>
        ) : null}

        <Input
          testID="gym-routine-editor-name"
          value={draft.name}
          maxLength={60}
          onChangeText={(name) => dispatch({ type: 'renameRoutine', name })}
          placeholder="Routine name"
        />

        {draft.days.map((day, index) => (
          <DayEditor
            key={day.key}
            day={day}
            index={index}
            dayCount={draft.days.length}
            lookup={lookup}
            dispatch={dispatch}
            onAddExercise={(dayKey) => setPicker({ dayKey, mode: 'add' })}
            onSwapExercise={(dayKey, exerciseKey) =>
              setPicker({ dayKey, mode: 'swap', exerciseKey })
            }
          />
        ))}

        <Button
          testID="gym-routine-editor-add-day"
          variant="outline"
          disabled={draft.days.length >= MAX_DAYS}
          onPress={() => dispatch({ type: 'addDay', dayId: newId() })}
        >
          Add day
        </Button>

        <WeeklyBalanceCard testID="gym-routine-editor-balance" volume={volume} hints={hints} />
      </ScrollView>

      {/* Primary action in thumb reach (and clear of the top-right corner). */}
      <View className="border-t border-border bg-background px-4 pb-2 pt-3">
        <Button
          testID="gym-routine-editor-save"
          loading={saveMutation.isPending}
          disabled={!isOnline || !dirty}
          onPress={() => submitSave(draft)}
        >
          {dirty ? 'Save changes' : 'No changes'}
        </Button>
      </View>

      <ExercisePicker
        testID="gym-routine-editor-picker"
        visible={picker !== null}
        onClose={() => setPicker(null)}
        library={library}
        excludeIds={excludeIds}
        preferSwapGroup={preferSwapGroup}
        title={picker?.mode === 'swap' ? 'Swap exercise' : 'Add exercise'}
        onPick={(exercise) => {
          if (!picker) return;
          if (picker.mode === 'add') {
            dispatch({
              type: 'addExercise',
              dayKey: picker.dayKey,
              newExerciseKey: newId(),
              exercise,
            });
          } else {
            dispatch({
              type: 'swapExercise',
              dayKey: picker.dayKey,
              exerciseKey: picker.exerciseKey,
              exercise,
            });
          }
          setPicker(null);
        }}
      />

      <Sheet
        visible={conflict !== null}
        onClose={() => setConflict(null)}
        title="Changed on another device"
        testID="gym-routine-editor-conflict"
        footer={
          <View className="gap-2">
            <Button
              testID="gym-routine-editor-conflict-keep-mine"
              onPress={() => {
                if (!conflict) return;
                const bumped = keepMineAfterConflict(draft, conflict.current);
                setDraft(bumped);
                setConflict(null);
                submitSave(bumped);
              }}
            >
              Keep mine
            </Button>
            <Button
              testID="gym-routine-editor-conflict-use-theirs"
              variant="outline"
              onPress={() => {
                if (!conflict) return;
                const next = loadTheirsAfterConflict(conflict.current);
                setDraft(next);
                setBaseline(next);
                setConflict(null);
              }}
            >
              Use the other version
            </Button>
          </View>
        }
      >
        <Text variant="muted">
          This routine changed on another device. Keep mine re-saves your edits with the newer
          version; use the other version reloads it and discards your edits here.
        </Text>
        {conflict ? (
          <Badge testID="gym-routine-editor-conflict-version" variant="secondary">
            Server version {conflict.current.version}
          </Badge>
        ) : null}
      </Sheet>
    </Screen>
  );
}
