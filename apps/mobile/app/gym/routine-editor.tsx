import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View, type TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { FALLBACK_TRAINER_NAME, TEMPLATE_BY_KEY, type RoutineDto } from '@chefer/types';
import {
  Badge,
  Button,
  ConfirmSheet,
  EmptyState,
  Input,
  KeyboardAwareScrollView,
  Screen,
  Text,
  useScrollFieldIntoView,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage, validateRoutine, volumeByGroup } from '@chefer/utils';
import { openCreateExercise } from '../../src/features/gym/library/create-exercise-href';
import { ExercisePicker } from '../../src/features/gym/library/exercise-picker';
import { newId } from '../../src/features/gym/offline/ids';
import { ChangedByLine } from '../../src/features/gym/routine/attribution';
import {
  extractRoutineConflict,
  keepMineAfterConflict,
  loadTheirsAfterConflict,
} from '../../src/features/gym/routine/conflict';
import { RoutineConflictSheet } from '../../src/features/gym/routine/conflict-sheet';
import { DayEditor } from '../../src/features/gym/routine/day-editor';
import {
  draftsEqual,
  draftToRoutineDoc,
  removedTrainerNoteIds,
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
import { useUnsavedGuard } from '../../src/lib/use-unsaved-guard';

// Routine editor (gym_plan.md §5.4, D5a): a local draft copied from the
// RoutineDto. Save is explicit and carries `expectedVersion`; a stale version
// opens the conflict sheet. Leaving with unsaved edits — by the back button,
// the header back arrow, or an iOS swipe — is confirmed through the shared
// `useUnsavedGuard` (React Navigation's `usePreventRemove`), which covers all
// three and Android's hardware back button.

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
  const isOnline = useIsOnline();
  const utils = trpc.useUtils();
  const bootstrap = useGymBootstrap();

  const routineQuery = trpc.gym.routine.get.useQuery(
    { id: routineId },
    { enabled: routineId !== '', staleTime: 0 },
  );
  // The editor shows a failed save itself (conflict sheet / alert) — no default snackbar.
  const saveMutation = trpc.gym.routine.save.useMutation({ meta: { silent: true } });

  const [draft, setDraft] = useState<RoutineDraft>(EMPTY_DRAFT);
  const [baseline, setBaseline] = useState<RoutineDraft | null>(null);
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
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

  // Unsaved edits are confirmed on the header back, Android BACK and the iOS
  // swipe alike; `usePreventRemove` also disables the native swipe while
  // dirty (UX-X-01 — a `beforeRemove` listener could not stop a completed swipe).
  const guard = useUnsavedGuard(dirty, {
    title: 'Discard changes?',
    message: 'Your edits to this routine have not been saved.',
  });

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
    // Trainer coaching: a removed trainer note is cleared explicitly; the save never rewrites one.
    const clearTrainerNoteIds = baseline ? removedTrainerNoteIds(baseline, routine) : [];
    saveMutation.mutate(
      {
        routine: draftToRoutineDoc(routine),
        expectedVersion: routine.version,
        ...(clearTrainerNoteIds.length > 0 ? { clearTrainerNoteIds } : {}),
      },
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
          Alert.alert('Could not save', userFacingErrorMessage(error));
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

  // UX-GYM-24: offline with nothing cached is "needs a connection", a failed load
  // has Retry — neither is an endless spinner.
  if (routineQuery.isPending && routineQuery.fetchStatus === 'paused') {
    return (
      <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <EmptyState
            testID="gym-routine-editor-offline"
            title="Needs a connection"
            description="Reconnect to edit this routine."
            action={{
              label: 'Try again',
              onPress: () => void routineQuery.refetch(),
              testID: 'gym-routine-editor-offline-retry',
            }}
          />
          <Button testID="gym-routine-editor-back" variant="outline" onPress={() => router.back()}>
            Back
          </Button>
        </View>
      </Screen>
    );
  }

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
            {userFacingErrorMessage(routineQuery.error)}
          </Text>
          <Button testID="gym-routine-editor-retry" onPress={() => void routineQuery.refetch()}>
            Try again
          </Button>
          <Button testID="gym-routine-editor-back" variant="outline" onPress={() => router.back()}>
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

        {draft.lastEditedByOther ? (
          <ChangedByLine
            routine
            testID="gym-routine-editor-changed-by"
            stamp={draft.lastEditedByOther}
          />
        ) : null}

        {draft.days.map((day, index) => (
          <DayEditor
            key={day.key}
            day={day}
            index={index}
            dayCount={draft.days.length}
            lookup={lookup}
            dispatch={dispatch}
            coaching={{
              role: 'client',
              trainerName: bootstrap.data?.coaching?.trainerName ?? FALLBACK_TRAINER_NAME,
            }}
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
      </KeyboardAwareScrollView>

      <ExercisePicker
        testID="gym-routine-editor-picker"
        onCreateFromSearch={openCreateExercise}
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

      <RoutineConflictSheet
        current={conflict?.current ?? null}
        onClose={() => setConflict(null)}
        onKeepMine={(current) => {
          const bumped = keepMineAfterConflict(draft, current);
          setDraft(bumped);
          setConflict(null);
          submitSave(bumped);
        }}
        onUseTheirs={(current) => {
          const next = loadTheirsAfterConflict(current);
          setDraft(next);
          setBaseline(next);
          setConflict(null);
        }}
      />

      <ConfirmSheet testID="gym-routine-editor-discard" {...guard.sheetProps} />
    </Screen>
  );
}
