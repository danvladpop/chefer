import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { router } from 'expo-router';
import {
  COACHING_COPY,
  type ExerciseMeta,
  type NextTargetDto,
  type RoutineDto,
  type TrainerRoutineDto,
} from '@chefer/types';
import {
  Badge,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Input,
  KeyboardAwareScrollView,
  Screen,
  Text,
  useSnackbar,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useUnsavedGuard } from '../../../lib/use-unsaved-guard';
import { ExercisePicker } from '../../gym/library/exercise-picker';
import { localDate, newId } from '../../gym/offline/ids';
import { formatStampDate } from '../../gym/routine/attribution';
import {
  extractRoutineConflict,
  keepMineAfterConflict,
  loadTheirsAfterConflict,
} from '../../gym/routine/conflict';
import { RoutineConflictSheet } from '../../gym/routine/conflict-sheet';
import { DayEditor } from '../../gym/routine/day-editor';
import {
  draftsEqual,
  draftToTrainerRoutineDoc,
  trainerRoutineToDraft,
} from '../../gym/routine/mapping';
import { OverrideSheet } from '../../gym/routine/override-sheet';
import { routineDraftReducer, type RoutineDraftAction } from '../../gym/routine/reducer';
import { MAX_DAYS, type RoutineDraft } from '../../gym/routine/types';
import { useIsOnline } from '../../gym/routine/use-online';
import { WEEKDAY_SHORT_LABELS } from '../../gym/routine/weekday';
import { isClientUnavailable, useTrainerClientName } from '../client/use-trainer-client';
import { goBackOrHome, TrainerHeader } from '../components/trainer-header';
import { repRangeText } from '../format';
import { fillDraftFromRoutine, FillFromMineSheet } from './fill-from-mine';
import { NextTargetLine } from './next-target-line';

// ─── The trainer's routine editor for one client (spec §2.5, §6, §9) ─────────
// The client's active routine in the shared mobile editor (`DayEditor`, trainer role): a "Note for Maria"
// field per exercise, "Changed by Maria · 3 Oct" on rows the client changed, the next-session targets
// (the existing D5c override, set through `trainer.client.setNextTarget`) and a curated-only picker.
// Save is version-checked: a stale save opens the shared conflict sheet naming the client (Keep mine /
// Use the other version). Online-only, like the client's own editor. Every call is checked per request.

const EMPTY_DRAFT: RoutineDraft = { id: '', name: '', version: 0, days: [] };
const SCREEN_EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

type PickerState =
  | { dayKey: string; mode: 'add' }
  | { dayKey: string; mode: 'swap'; exerciseKey: string };

/** The saved rows of the loaded routine by id, for the next-session lines and the Adjust sheet. */
function rowsById(routine: TrainerRoutineDto | null | undefined) {
  const rows = new Map<
    string,
    { exerciseId: string; repMin: number; repMax: number; next: NextTargetDto | null }
  >();
  for (const day of routine?.days ?? []) {
    for (const ex of day.exercises) {
      rows.set(ex.id, {
        exerciseId: ex.exerciseId,
        repMin: ex.repMin,
        repMax: ex.repMax,
        next: ex.next,
      });
    }
  }
  return rows;
}

export function TrainerRoutineScreen({ clientId }: { clientId: string }) {
  const isOnline = useIsOnline();
  const utils = trpc.useUtils();
  const { firstName } = useTrainerClientName(clientId);
  const input = useMemo(() => ({ clientId, today: localDate() }), [clientId]);

  const routineQuery = trpc.trainer.client.routine.useQuery(input, { staleTime: 0 });
  const libraryQuery = trpc.gym.library.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const saveMutation = trpc.trainer.client.saveRoutine.useMutation({ meta: { silent: true } });
  const createMutation = trpc.trainer.client.createRoutine.useMutation({ meta: { silent: true } });
  const setTarget = trpc.trainer.client.setNextTarget.useMutation({ meta: { silent: true } });
  const clearTarget = trpc.trainer.client.clearNextTarget.useMutation({ meta: { silent: true } });

  const [draft, setDraft] = useState<RoutineDraft>(EMPTY_DRAFT);
  const [baseline, setBaseline] = useState<RoutineDraft | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [conflict, setConflict] = useState<RoutineDto | null>(null);
  const [adjustRowId, setAdjustRowId] = useState<string | null>(null);
  const [fillOpen, setFillOpen] = useState(false);
  const loadedRef = useRef(false);
  const snackbar = useSnackbar();

  const server = routineQuery.data ?? null;
  const dispatch = (action: RoutineDraftAction) =>
    setDraft((prev) => routineDraftReducer(prev, action));

  const seed = (dto: TrainerRoutineDto) => {
    const initial = trainerRoutineToDraft(dto);
    setDraft(initial);
    setBaseline(initial);
  };

  useEffect(() => {
    // Seed the draft only from data fetched NOW (a cached copy carries an old version and the next save
    // would report a phantom conflict).
    if (loadedRef.current || !routineQuery.data) return;
    if (!routineQuery.isFetchedAfterMount && isOnline) return;
    loadedRef.current = true;
    seed(routineQuery.data);
  }, [routineQuery.data, routineQuery.isFetchedAfterMount, isOnline]);

  const dirty = baseline !== null && !draftsEqual(draft, baseline);
  const guard = useUnsavedGuard(dirty, {
    title: 'Discard changes?',
    message: `Your edits to ${firstName}’s routine have not been saved.`,
  });

  const library = libraryQuery.data ?? [];
  const lookup = useMemo(() => {
    const byId = new Map<string, ExerciseMeta>();
    for (const e of library) byId.set(e.id, e);
    for (const e of server?.exercises ?? []) byId.set(e.id, e);
    return (id: string) => byId.get(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `library` is derived from libraryQuery.data
  }, [libraryQuery.data, server]);
  const rows = useMemo(() => rowsById(server), [server]);

  const patchRoutineCache = (update: (old: TrainerRoutineDto) => TrainerRoutineDto) => {
    utils.trainer.client.routine.setData(input, (old) => (old ? update(old) : old));
  };

  // Copies one of the trainer's own routines into the draft (curated exercises only); Undo restores it.
  const fillFrom = (routineId: string) => {
    setFillOpen(false);
    utils.client.gym.routine.get
      .query({ id: routineId })
      .then((source) => {
        const previous = draft;
        const isCurated = (exerciseId: string) => {
          const meta = library.find((e) => e.id === exerciseId);
          return meta !== undefined && !meta.ownerId;
        };
        const { draft: filled, copied, skipped } = fillDraftFromRoutine(draft, source, isCurated);
        setDraft(filled);
        snackbar.show({
          message:
            skipped > 0
              ? `Copied ${copied} exercises. ${skipped} custom exercises were skipped.`
              : `Copied ${copied} exercises.`,
          actionLabel: 'Undo',
          onAction: () => setDraft(previous),
        });
      })
      .catch((error: unknown) => Alert.alert('Could not copy', userFacingErrorMessage(error)));
  };

  const submitSave = (routine: RoutineDraft) => {
    saveMutation.mutate(
      {
        clientId,
        routine: draftToTrainerRoutineDoc(routine),
        expectedVersion: routine.version,
      },
      {
        onSuccess: (dto) => {
          seed(dto);
          utils.trainer.client.routine.setData(input, dto);
          void utils.trainer.clients.list.invalidate();
        },
        onError: (error) => {
          const current = extractRoutineConflict(error);
          if (current) {
            setConflict(current);
            return;
          }
          Alert.alert('Could not save', userFacingErrorMessage(error));
        },
      },
    );
  };

  const createRoutine = () => {
    createMutation.mutate(
      { clientId, days: 3 },
      {
        onSuccess: (dto) => {
          loadedRef.current = true;
          seed(dto);
          utils.trainer.client.routine.setData(input, dto);
        },
        onError: (error) => Alert.alert('Could not create', userFacingErrorMessage(error)),
      },
    );
  };

  const adjustRow = adjustRowId ? rows.get(adjustRowId) : undefined;
  const adjustMeta = adjustRow ? lookup(adjustRow.exerciseId) : undefined;
  const adjustNext = adjustRow?.next ?? null;

  const applyTarget = (exerciseId: string, dto: NextTargetDto) => {
    patchRoutineCache((old) => ({
      ...old,
      days: old.days.map((d) => ({
        ...d,
        exercises: d.exercises.map((e) =>
          e.exerciseId === exerciseId && e.next?.repBucket === dto.repBucket
            ? { ...e, next: dto }
            : e,
        ),
      })),
    }));
    setAdjustRowId(null);
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

  const header = (right?: ReactNode) => (
    <TrainerHeader
      testID="trainer-routine-header"
      title={`${firstName}’s routine`}
      onBack={goBackOrHome}
      right={right}
    />
  );

  if (routineQuery.isPending && routineQuery.fetchStatus === 'paused') {
    return (
      <Screen edges={SCREEN_EDGES} className="px-0">
        {header()}
        <EmptyState
          testID="trainer-routine-offline"
          title="Needs a connection"
          description="Reconnect to edit this routine."
          action={{
            label: COACHING_COPY.common.tryAgain,
            testID: 'trainer-routine-offline-retry',
            onPress: () => void routineQuery.refetch(),
          }}
        />
      </Screen>
    );
  }
  if (routineQuery.isPending) {
    return (
      <Screen edges={SCREEN_EDGES} className="px-0">
        {header()}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator testID="trainer-routine-loading" />
        </View>
      </Screen>
    );
  }
  if (routineQuery.isError) {
    if (isClientUnavailable(routineQuery.error)) {
      return (
        <Screen edges={SCREEN_EDGES} className="px-0">
          {header()}
          <EmptyState
            testID="trainer-routine-unavailable"
            title={COACHING_COPY.server.clientUnavailable}
            action={{
              label: 'Back to clients',
              testID: 'trainer-routine-unavailable-back',
              onPress: () => router.replace('/trainer'),
            }}
          />
        </Screen>
      );
    }
    return (
      <Screen edges={SCREEN_EDGES} className="px-0">
        {header()}
        <ErrorState testID="trainer-routine-error" onRetry={() => void routineQuery.refetch()} />
      </Screen>
    );
  }
  if (routineQuery.data === null) {
    return (
      <Screen edges={SCREEN_EDGES} className="px-0">
        {header()}
        <EmptyState
          testID="trainer-routine-none"
          title="No active routine yet"
          description={`${firstName} has no active routine. Create a 3-day routine to start.`}
          action={{
            label: 'Create a 3-day routine',
            testID: 'trainer-routine-create',
            onPress: createRoutine,
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={SCREEN_EDGES} className="px-0" testID="trainer-routine">
      {header(
        dirty ? (
          <Badge testID="trainer-routine-dirty" variant="warning">
            Unsaved
          </Badge>
        ) : null,
      )}
      <KeyboardAwareScrollView
        contentContainerClassName="gap-4 px-4 py-4"
        footer={
          <View className="border-t border-border bg-background px-4 pb-2 pt-3">
            <Button
              testID="trainer-routine-save"
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
            testID="trainer-routine-offline-banner"
            className="rounded-lg bg-amber-50 px-3 py-2"
          >
            <Text className="text-sm text-amber-900">
              Editing a client’s routine needs a connection.
            </Text>
          </View>
        ) : null}

        <Input
          testID="trainer-routine-name"
          label="Routine name"
          value={draft.name}
          maxLength={60}
          onChangeText={(name) => dispatch({ type: 'renameRoutine', name })}
          returnKeyType="done"
          placeholder="Routine name"
        />

        {draft.lastEditedByOther ? (
          <Text testID="trainer-routine-changed-by" variant="muted" className="text-xs">
            {COACHING_COPY.trainer.routineChangedByClient(
              draft.lastEditedByOther.name,
              formatStampDate(draft.lastEditedByOther.at),
            )}
          </Text>
        ) : null}

        {dirty ? (
          <Text testID="trainer-routine-save-first" variant="muted" className="text-xs">
            Save your changes to adjust next-session targets.
          </Text>
        ) : null}

        {draft.days.map((day, index) => (
          <View key={day.key} className="gap-2">
            {server?.nextDayId && day.id === server.nextDayId ? (
              <Text
                testID={`trainer-routine-next-day-${day.key}`}
                className="text-sm font-semibold"
              >
                {COACHING_COPY.trainer.nextDay(
                  day.name,
                  day.plannedWeekday === null
                    ? null
                    : (WEEKDAY_SHORT_LABELS[day.plannedWeekday] ?? null),
                )}
              </Text>
            ) : null}
            <DayEditor
              day={day}
              index={index}
              dayCount={draft.days.length}
              lookup={lookup}
              dispatch={dispatch}
              onAddExercise={(dayKey) => setPicker({ dayKey, mode: 'add' })}
              onSwapExercise={(dayKey, exerciseKey) =>
                setPicker({ dayKey, mode: 'swap', exerciseKey })
              }
              coaching={{
                role: 'trainer',
                clientName: firstName,
                renderNext: (exercise) => {
                  const next = exercise.id ? rows.get(exercise.id)?.next : null;
                  if (!exercise.id || !next) return null;
                  return (
                    <NextTargetLine
                      testID={`trainer-routine-next-${exercise.id}`}
                      next={next}
                      meta={lookup(exercise.exerciseId)}
                      adjustDisabled={dirty || !isOnline}
                      onAdjust={() => setAdjustRowId(exercise.id ?? null)}
                    />
                  );
                },
              }}
            />
          </View>
        ))}

        <Button
          testID="trainer-routine-fill"
          variant="outline"
          disabled={!isOnline}
          onPress={() => setFillOpen(true)}
        >
          {COACHING_COPY.trainer.fillFromMine}
        </Button>

        <Button
          testID="trainer-routine-add-day"
          variant="outline"
          disabled={draft.days.length >= MAX_DAYS}
          onPress={() => dispatch({ type: 'addDay', dayId: newId() })}
        >
          Add day
        </Button>
      </KeyboardAwareScrollView>

      <FillFromMineSheet
        visible={fillOpen}
        onClose={() => setFillOpen(false)}
        onPick={(routine) => fillFrom(routine.id)}
      />

      <ExercisePicker
        testID="trainer-routine-picker"
        visible={picker !== null}
        onClose={() => setPicker(null)}
        library={library}
        curatedOnly
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

      {adjustRow && adjustMeta && adjustNext ? (
        <OverrideSheet
          visible
          testID="trainer-routine-override"
          onClose={() => setAdjustRowId(null)}
          exercise={adjustMeta}
          unit="KG"
          repBucket={adjustNext.repBucket}
          progression={{
            suggestion: adjustNext.suggestion,
            override: adjustNext.override
              ? {
                  weightKg: adjustNext.override.weightKg,
                  reps: adjustNext.override.reps,
                  at: adjustNext.override.at,
                }
              : null,
          }}
          title={`Next target: ${adjustMeta.name}`}
          description={COACHING_COPY.trainer.appliesTo(
            firstName,
            adjustMeta.name,
            repRangeText(adjustRow.repMin, adjustRow.repMax),
          )}
          resetLabel={COACHING_COPY.trainer.resetToSuggestion}
          saving={setTarget.isPending || clearTarget.isPending}
          onSave={(payload) =>
            setTarget.mutate(
              { clientId, ...payload },
              {
                onSuccess: (dto) => applyTarget(payload.exerciseId, dto),
                onError: (error) => Alert.alert('Could not save', userFacingErrorMessage(error)),
              },
            )
          }
          onReset={() =>
            clearTarget.mutate(
              {
                clientId,
                exerciseId: adjustMeta.id,
                repBucket: adjustNext.repBucket,
              },
              {
                onSuccess: (dto) => applyTarget(adjustMeta.id, dto),
                onError: (error) => Alert.alert('Could not reset', userFacingErrorMessage(error)),
              },
            )
          }
        />
      ) : null}

      <RoutineConflictSheet
        testID="trainer-routine-conflict"
        current={conflict}
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
          // Refresh the next-session targets and the client's custom exercises for the reloaded rows.
          void utils.trainer.client.routine.invalidate();
        }}
      />

      <ConfirmSheet testID="trainer-routine-discard" {...guard.sheetProps} />
    </Screen>
  );
}
