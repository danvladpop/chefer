import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View, type TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FALLBACK_TRAINER_NAME, TEMPLATE_BY_KEY, type RoutineDto } from '@chefer/types';
import {
  ConfirmSheet,
  DONE_FIELD_PROPS,
  IconButton,
  Input,
  KeyboardAwareScrollView,
  Screen,
  Text,
  useScrollFieldIntoView,
  useThemeColors,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage, validateRoutine, volumeByGroup } from '@chefer/utils';
import { Icon } from '../../src/components/icon';
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
import { TrainButton } from '../../src/features/shell/train/train-button';
import { TrainCard } from '../../src/features/shell/train/train-cards';
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

/**
 * The page's top bar in the shell's look (ShellTopBar: brand chevron Back +
 * title1, 10 Oct redesign). Drawn here rather than through ShellChromeProvider
 * so Back and the title keep the testIDs the Maestro flows tap, and so the
 * "Unsaved" pill can sit beside the title.
 */
function EditorTopBar({ dirty = false }: { dirty?: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="min-h-11 flex-row items-center gap-1">
      <IconButton
        testID="gym-routine-editor-title-back"
        accessibilityLabel="Back"
        icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
        onPress={() => router.back()}
        className="-ml-2"
      />
      <Text
        testID="gym-routine-editor-title"
        accessibilityRole="header"
        numberOfLines={1}
        className="min-w-0 flex-1 text-title1 font-bold text-label"
      >
        Edit routine
      </Text>
      {dirty ? (
        <Text
          testID="gym-routine-editor-dirty"
          className="rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand"
        >
          Unsaved
        </Text>
      ) : null}
    </View>
  );
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
      <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="gap-4 px-4 pt-2">
          <EditorTopBar />
          <TrainCard testID="gym-routine-editor-offline">
            <Text accessibilityRole="header" className="text-title3 font-bold text-label">
              Needs a connection
            </Text>
            <Text className="text-subhead text-label-secondary">
              Reconnect to edit this routine.
            </Text>
            <View className="flex-row gap-2">
              <TrainButton
                testID="gym-routine-editor-offline-retry"
                label="Try again"
                icon="refresh"
                className="flex-1"
                onPress={() => void routineQuery.refetch()}
              />
              <TrainButton
                testID="gym-routine-editor-back"
                label="Back"
                variant="outline"
                className="flex-1"
                onPress={() => router.back()}
              />
            </View>
          </TrainCard>
        </View>
      </Screen>
    );
  }

  if (routineQuery.isPending) {
    return (
      <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator testID="gym-routine-editor-loading" />
        </View>
      </Screen>
    );
  }

  if (routineQuery.isError) {
    return (
      <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="gap-4 px-4 pt-2">
          <EditorTopBar />
          <TrainCard testID="gym-routine-editor-error">
            <Text accessibilityRole="header" className="text-title3 font-bold text-label">
              Couldn’t load this routine
            </Text>
            <Text className="text-subhead text-label-secondary">
              {userFacingErrorMessage(routineQuery.error)}
            </Text>
            <View className="flex-row gap-2">
              <TrainButton
                testID="gym-routine-editor-retry"
                label="Try again"
                icon="refresh"
                className="flex-1"
                onPress={() => void routineQuery.refetch()}
              />
              <TrainButton
                testID="gym-routine-editor-back"
                label="Back"
                variant="outline"
                className="flex-1"
                onPress={() => router.back()}
              />
            </View>
          </TrainCard>
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      {/* Sticky header: Back stays reachable however far the draft scrolls. */}
      <View className="border-b border-separator bg-canvas px-4 pb-2 pt-2">
        <EditorTopBar dirty={dirty} />
      </View>
      <KeyboardAwareScrollView
        contentContainerClassName="gap-4 px-4 pb-8 pt-3"
        footer={
          // Primary action in thumb reach (and clear of the top-right corner) —
          // inside the same KeyboardAvoidingView so it rises with the keyboard
          // instead of staying pinned behind it (dogfood #2).
          <View className="border-t border-separator bg-canvas px-4 pb-2 pt-3">
            <TrainButton
              testID="gym-routine-editor-save"
              label={dirty ? 'Save changes' : 'No changes'}
              size="lg"
              loading={saveMutation.isPending}
              disabled={!isOnline || !dirty}
              onPress={() => submitSave(draft)}
            />
          </View>
        }
      >
        {!isOnline ? (
          <Text
            testID="gym-routine-editor-offline-banner"
            className="rounded-control bg-surface-sunken px-3 py-2 text-subhead text-label-secondary"
          >
            Editing routines needs a connection. Logging works offline.
          </Text>
        ) : null}

        <Input
          ref={nameRef}
          testID="gym-routine-editor-name"
          value={draft.name}
          maxLength={60}
          onChangeText={(name) => dispatch({ type: 'renameRoutine', name })}
          onFocus={() => scrollFieldIntoView(nameRef.current)}
          {...DONE_FIELD_PROPS}
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

        <TrainButton
          testID="gym-routine-editor-add-day"
          label="Add day"
          icon="add"
          variant="tinted"
          disabled={draft.days.length >= MAX_DAYS}
          onPress={() => dispatch({ type: 'addDay', dayId: newId() })}
        />

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
