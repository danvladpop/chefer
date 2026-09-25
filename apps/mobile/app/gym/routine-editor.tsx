import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View, type TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { TEMPLATE_BY_KEY, type RoutineDto } from '@chefer/types';
import {
  Badge,
  Button,
  ConfirmSheet,
  Input,
  KeyboardAwareScrollView,
  Screen,
  Sheet,
  Text,
  useScrollFieldIntoView,
} from '@chefer/ui-mobile';
import { validateRoutine, volumeByGroup } from '@chefer/utils';
import { ExercisePicker } from '../../src/features/gym/library/exercise-picker';
import { newId } from '../../src/features/gym/offline/ids';
import {
  extractRoutineConflict,
  keepMineAfterConflict,
  loadTheirsAfterConflict,
} from '../../src/features/gym/routine/conflict';
import { DayEditor } from '../../src/features/gym/routine/day-editor';
import {
  draftsEqual,
  draftToRoutineDoc,
  routineDtoToDraft,
} from '../../src/features/gym/routine/mapping';
import {
  routineDraftReducer,
  type RoutineDraftAction,
} from '../../src/features/gym/routine/reducer';
import { MAX_DAYS, type RoutineDraft } from '../../src/features/gym/routine/types';
import { useIsOnline } from '../../src/features/gym/routine/use-online';
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

export default function GymRoutineEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routineId = typeof id === 'string' ? id : '';
  const navigation = useNavigation();
  const isOnline = useIsOnline();
  const utils = trpc.useUtils();
  const bootstrap = useGymBootstrap();

  const routineQuery = trpc.gym.routine.get.useQuery(
    { id: routineId },
    { enabled: routineId !== '', staleTime: 0 },
  );
  const saveMutation = trpc.gym.routine.save.useMutation();

  const [draft, setDraft] = useState<RoutineDraft>(EMPTY_DRAFT);
  const [baseline, setBaseline] = useState<RoutineDraft | null>(null);
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [removing, setRemoving] = useState<{ dayKey: string; exerciseKey: string } | null>(null);
  const loadedRef = useRef(false);
  const nameRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();

  const dispatch = (action: RoutineDraftAction) =>
    setDraft((prev) => routineDraftReducer(prev, action));

  useEffect(() => {
    // Only seed the draft from data fetched NOW (or the cache when offline):
    // a cached pre-save copy carries an old version and the next save would
    // report a phantom "changed on another device" conflict.
    if (loadedRef.current || !routineQuery.data) return;
    if (!routineQuery.isFetchedAfterMount && isOnline) return;
    loadedRef.current = true;
    const initial = routineDtoToDraft(routineQuery.data);
    setDraft(initial);
    setBaseline(initial);
    setTemplateKey(routineQuery.data.templateKey);
  }, [routineQuery.data, routineQuery.isFetchedAfterMount, isOnline]);

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
          utils.gym.routine.get.setData({ id: dto.id }, dto);
          void utils.gym.routine.list.invalidate();
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
  const removingExercise = removing
    ? draft.days
        .find((d) => d.key === removing.dayKey)
        ?.exercises.find((e) => e.key === removing.exerciseKey)
    : undefined;
  const removingName = removingExercise
    ? (lookup(removingExercise.exerciseId)?.name ?? 'this exercise')
    : 'this exercise';
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
      <KeyboardAwareScrollView
        contentContainerClassName="gap-4 px-4 py-4"
        footer={
          // Primary action in thumb reach (and clear of the top-right corner) —
          // inside the same KeyboardAvoidingView so it rises with the keyboard
          // instead of staying pinned behind it (dogfood #2).
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
        }
      >
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
          ref={nameRef}
          testID="gym-routine-editor-name"
          value={draft.name}
          maxLength={60}
          onChangeText={(name) => dispatch({ type: 'renameRoutine', name })}
          onFocus={() => scrollFieldIntoView(nameRef.current)}
          returnKeyType="done"
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
            onRemoveExercise={(dayKey, exerciseKey) => setRemoving({ dayKey, exerciseKey })}
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
      </KeyboardAwareScrollView>

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

      <ConfirmSheet
        visible={removing !== null}
        onClose={() => setRemoving(null)}
        testID="gym-routine-editor-remove"
        title={`Remove ${removingName}?`}
        body="It leaves this day when you save. Its history stays."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          if (removing) dispatch({ type: 'removeExercise', ...removing });
          setRemoving(null);
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
