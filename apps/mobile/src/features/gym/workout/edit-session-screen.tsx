import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ExerciseDto, Rir } from '@chefer/types';
import {
  Button,
  ConfirmSheet,
  EmptyState,
  haptics,
  Screen,
  Text,
  useSnackbar,
} from '@chefer/ui-mobile';
import {
  hasLoggableSet,
  nothingTicked,
  sameKg,
  sessionDurationMin,
  toSessionSummary,
} from '@chefer/utils';
import { useFlags } from '../../../hooks/use-flags';
import { useUnsavedGuard } from '../../../lib/use-unsaved-guard';
import { captureGymEvent } from '../analytics';
import { openCreateExercise } from '../library/create-exercise-href';
import { ExercisePicker } from '../library/exercise-picker';
import { newId } from '../offline/ids';
import { deleteSessionWithUndo, saveEditedSession } from '../offline/session-corrections';
import { saveLoggedSession } from '../use-active-workout';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { EXERCISE_CAP_REASON, isAtExerciseCap } from './caps';
import { EditSessionHeader } from './edit-session-header';
import { ExerciseCard, type WorkoutContext, type WorkoutSheetRequest } from './exercise-card';
import { NumberSheet } from './number-sheet';
import type { SetRowHandlers } from './set-row';
import { useEditSession, type EditSession } from './use-edit-session';
import { useLogSession, type LogSessionParams } from './use-log-session';
import { useWeightedBodyweightOffer } from './use-weighted-offer';
import {
  byPosition,
  defaultSlotParams,
  equipmentOf,
  exerciseHistory,
  fallbackMeta,
  isCardioMeta,
  isFirstForPattern,
  loggingProfile,
  prescribeFor,
  priorSessions,
  setLabelOf,
  unitOf,
  weightModeOf,
} from './workout-model';
import { ExerciseMenuSheet, TechniqueSheet } from './workout-sheets';

// Edit mode (UX-44, T-44.3): the workout logger over a PAST session. It is a
// separate screen state over a draft (`use-edit-session.ts`) — the live
// logger, its crash-safe store, the rest timer and auto-advance are not
// involved (AC3). No clock, no rest timer, no Why?/Next-time banners. Save
// re-sends the corrected doc through the offline outbox; Replace changes this
// workout only and never offers the routine (AC5); the date can never move
// into the future (AC6).
//
// Log mode (owner dogfood 2026-09-30): the same screen over a NEW past
// workout (`use-log-session.ts`) — "Log a workout you already did" used to
// start a live, timed workout. You set the date, the duration, the exercises
// and each set's numbers, then Save: every listed set counts (no ✓ to tick).

type SheetState =
  | WorkoutSheetRequest
  | { kind: 'picker'; mode: 'replace' | 'add'; seId: string | null }
  | { kind: 'nothing' };

/** iOS can't present a Modal while another is still dismissing. */
const SHEET_SWAP_DELAY_MS = 380;
const NO_ROUTINE_REASON = 'Edit mode never changes your routine.';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/today');
}

export function EditSessionScreen({ sessionId }: { sessionId: string }) {
  const edit = useEditSession(sessionId);
  return <SessionEditor edit={edit} mode="edit" />;
}

export function LogSessionScreen(params: LogSessionParams) {
  const edit = useLogSession(params);
  return <SessionEditor edit={edit} mode="log" />;
}

function SessionEditor({ edit, mode }: { edit: EditSession; mode: 'edit' | 'log' }) {
  const logging = mode === 'log';
  const { data: bootstrap } = useGymBootstrap();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { cardioLogging } = useFlags();
  const [saving, setSaving] = useState(false);

  const ready = edit.state.status === 'ready' ? edit.state : null;
  const draft = ready?.draft ?? null;
  const dirty = ready?.dirty ?? false;
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // UX-GYM-26: leaving with unsaved work asks first — Cancel, the iOS swipe and
  // Android BACK all go through this one guard (the swipe is disabled while
  // dirty). The draft itself is kept on disk (`session-draft-store.ts`), so a
  // crash or a "Discard" is the only way it is lost.
  const guard = useUnsavedGuard(dirty, {
    title: logging ? 'Discard this workout?' : 'Discard your edits?',
    message: logging ? 'Nothing will be saved.' : 'Your workout stays as it was.',
    discardLabel: logging ? 'Discard' : 'Discard edits',
    keepLabel: 'Keep editing',
  });
  const { release: releaseGuard } = guard;
  const { discardDraft } = edit;
  /** A deliberate exit (saved, deleted, discarded): forget the draft, lift the guard, go. */
  const exit = useCallback(() => {
    discardDraft();
    releaseGuard();
    leave();
  }, [discardDraft, releaseGuard]);

  // A draft from an earlier, unsaved visit was brought back: say so once.
  const restored = ready?.restored ?? false;
  const showSnackbar = snackbar.show;
  useEffect(() => {
    if (restored) showSnackbar({ message: 'Restored your unsaved changes.' });
  }, [restored, showSnackbar]);

  // ── Derived, memoised context ──────────────────────────────────────────────
  const unit = unitOf(bootstrap);
  const profile = useMemo(() => equipmentOf(bootstrap), [bootstrap]);
  const lookup = useMemo(() => {
    const byId = new Map<string, ExerciseDto>((bootstrap?.library ?? []).map((e) => [e.id, e]));
    const fallbacks = new Map<string, ExerciseDto>();
    return (id: string): ExerciseDto => {
      const hit = byId.get(id);
      if (hit) return hit;
      let fb = fallbacks.get(id);
      if (!fb) {
        fb = fallbackMeta(id);
        fallbacks.set(id, fb);
      }
      return fb;
    };
  }, [bootstrap?.library]);
  // "Last time" for an edited session means the sessions before IT.
  const startedAt = draft?.startedAt ?? null;
  const sessionId = draft?.id ?? '';
  const prior = useMemo(
    () =>
      priorSessions(bootstrap?.recentSessions ?? [], sessionId).filter(
        (s) => startedAt === null || s.startedAt < startedAt,
      ),
    [bootstrap?.recentSessions, sessionId, startedAt],
  );

  // ── Sheets (one at a time; swaps wait for the previous Modal to leave) ────
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [lastSheet, setLastSheet] = useState<SheetState | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const sheetRef = useRef<SheetState | null>(null);
  const pendingSheet = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((next: SheetState | null) => {
    sheetRef.current = next;
    setSheet(next);
    if (next) {
      setLastSheet(next);
      setSheetKey((k) => k + 1);
    }
  }, []);
  const openSheet = useCallback(
    (next: SheetState) => {
      if (pendingSheet.current) clearTimeout(pendingSheet.current);
      if (sheetRef.current === null) {
        show(next);
        return;
      }
      show(null);
      pendingSheet.current = setTimeout(() => show(next), SHEET_SWAP_DELAY_MS);
    },
    [show],
  );
  const closeSheet = useCallback(() => {
    if (pendingSheet.current) clearTimeout(pendingSheet.current);
    show(null);
  }, [show]);
  useEffect(
    () => () => {
      if (pendingSheet.current) clearTimeout(pendingSheet.current);
    },
    [],
  );

  // ── Set handlers (stable; read the live draft) ─────────────────────────────
  const { dispatch, getDraft, replaceExercise, retime } = edit;
  /** Ticks inside a past session are stamped with that session's own time, not "now". */
  const tickAt = useCallback(() => {
    const doc = getDraft();
    return doc ? (doc.finishedAt ?? doc.startedAt) : undefined;
  }, [getDraft]);

  const offerWeighted = useWeightedBodyweightOffer();
  const handlers = useMemo<SetRowHandlers>(
    () => ({
      onTick: (seId, setId) => {
        const set = getDraft()
          ?.exercises.find((e) => e.id === seId)
          ?.sets.find((s) => s.id === setId);
        if (!set) return;
        if (set.completedAt !== null) {
          dispatch({ type: 'uncompleteSet', seId, setId });
        } else {
          dispatch(
            { type: 'completeSet', seId, setId, weightKg: set.weightKg, reps: set.reps },
            { at: tickAt() },
          );
        }
        haptics.tick();
      },
      // Unlike the live logger, a change never carries to the later sets: this is
      // history, and each set is what it was.
      // Edit mode: each past set is what it was — a change stays on that set.
      // Log mode (a NEW workout): like the live logger, a change carries to
      // the later sets that still had the old value (owner dogfood
      // 2026-09-30) — setting set 1 almost always means the rest too.
      onWeight: (seId, setId, kg) => {
        const se = getDraft()?.exercises.find((e) => e.id === seId);
        const set = se?.sets.find((s) => s.id === setId);
        dispatch({ type: 'editSet', seId, setId, weightKg: kg });
        if (!se || !set) return;
        offerWeighted(lookup(se.exerciseId), profile, kg);
        if (!logging || set.isWarmup) return;
        for (const later of se.sets) {
          if (
            !later.isWarmup &&
            later.position > set.position &&
            later.completedAt === null &&
            sameKg(later.weightKg, set.weightKg)
          ) {
            dispatch({ type: 'editSet', seId, setId: later.id, weightKg: kg });
          }
        }
      },
      onReps: (seId, setId, reps) => {
        const se = getDraft()?.exercises.find((e) => e.id === seId);
        const set = se?.sets.find((s) => s.id === setId);
        dispatch({ type: 'editSet', seId, setId, reps });
        if (!logging || !se || !set || set.isWarmup) return;
        for (const later of se.sets) {
          if (
            !later.isWarmup &&
            later.position > set.position &&
            later.completedAt === null &&
            later.reps === set.reps
          ) {
            dispatch({ type: 'editSet', seId, setId: later.id, reps });
          }
        }
      },
      onOpenWeight: (seId, setId) => openSheet({ kind: 'weight', seId, setId }),
      onOpenReps: (seId, setId) => openSheet({ kind: 'reps', seId, setId }),
      // UX-05 A1 rows: remove any set with no confirm, restored by Undo.
      onLongPress: (seId, setId) => {
        const se = getDraft()?.exercises.find((e) => e.id === seId);
        const index = se?.sets.findIndex((s) => s.id === setId) ?? -1;
        const set = se && index >= 0 ? se.sets[index] : undefined;
        const label = se ? setLabelOf(se, setId) : null;
        if (!se || !set) return;
        dispatch({ type: 'removeSet', seId, setId });
        haptics.warning();
        snackbar.show({
          message: `Removed ${label?.toLowerCase() ?? 'set'}`,
          actionLabel: 'Undo',
          durationMs: 8000,
          onAction: () => dispatch({ type: 'restoreSet', seId, set, index }),
        });
      },
    }),
    [dispatch, getDraft, logging, lookup, offerWeighted, openSheet, profile, snackbar, tickAt],
  );

  const [expandOverride, setExpandOverride] = useState<Record<string, boolean>>({});
  const ctx = useMemo<WorkoutContext>(
    () => ({
      mode,
      unit,
      profile,
      lookup,
      prior,
      olderBests: bootstrap?.olderBests,
      handlers,
      onSheet: openSheet,
      onToggle: (seId) => setExpandOverride((prev) => ({ ...prev, [seId]: !(prev[seId] ?? true) })),
      onRir: (seId, rir: Rir | null) => dispatch({ type: 'setRir', seId, rir }),
      onRirDismiss: () => undefined,
      onSkip: (seId, skipped) => dispatch({ type: 'skipExercise', seId, skipped }),
      onAddSet: (seId) => dispatch({ type: 'addSet', seId, newSetId: newId() }),
      onLayoutY: () => undefined,
      onLogCardio: (seId, setId, fields) =>
        dispatch(
          { type: 'completeSet', seId, setId, weightKg: 0, reps: 0, ...fields },
          { at: tickAt() },
        ),
    }),
    [
      mode,
      unit,
      profile,
      lookup,
      prior,
      bootstrap?.olderBests,
      handlers,
      openSheet,
      dispatch,
      tickAt,
    ],
  );

  // ── Save / cancel / delete ─────────────────────────────────────────────────
  const isCardio = useCallback((id: string) => isCardioMeta(lookup(id)), [lookup]);

  const onSave = useCallback(async () => {
    const doc = getDraft();
    if (!doc || !ready) return;
    if (logging) {
      if (!hasLoggableSet(doc, isCardio)) {
        snackbar.show({ message: 'Add at least one exercise with a set to save.' });
        return;
      }
      setSaving(true);
      try {
        await saveLoggedSession(queryClient, doc, isCardio);
        haptics.success();
        snackbar.show({ message: 'Workout logged', tone: 'success' });
        exit();
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!dirtyRef.current) {
      leave();
      return;
    }
    if (nothingTicked(doc)) {
      openSheet({ kind: 'nothing' });
      return;
    }
    setSaving(true);
    try {
      await saveEditedSession({ queryClient, original: ready.original, draft: doc });
      haptics.success();
      snackbar.show({ message: 'Workout updated', tone: 'success' });
      exit();
    } finally {
      setSaving(false);
    }
  }, [exit, getDraft, isCardio, logging, openSheet, queryClient, ready, snackbar]);

  // Cancel just leaves: while there are unsaved edits the guard holds the
  // navigation and opens its confirm (`guard.sheetProps`, rendered below).
  const onCancel = useCallback(() => leave(), []);

  const onConfirmDiscard = useCallback(() => {
    if (!logging) captureGymEvent('session_edit_discarded', {});
    discardDraft();
    guard.sheetProps.onConfirm();
  }, [discardDraft, guard.sheetProps, logging]);

  const onDeleteInstead = useCallback(() => {
    closeSheet();
    if (!ready) return;
    haptics.warning();
    void deleteSessionWithUndo({
      queryClient,
      session: toSessionSummary(ready.original),
      source: 'detail',
      show: snackbar.show,
    });
    exit();
  }, [closeSheet, exit, queryClient, ready, snackbar.show]);

  // ── Picker (Replace / Add) ─────────────────────────────────────────────────
  const onPick = useCallback(
    (picked: ExerciseDto) => {
      const request = sheetRef.current;
      closeSheet();
      const doc = getDraft();
      if (!doc || request?.kind !== 'picker') return;

      if (request.mode === 'replace') {
        // This workout only — the routine is never touched (AC5).
        if (request.seId) replaceExercise(request.seId, picked.id);
        return;
      }
      const params = defaultSlotParams(picked);
      const position = doc.exercises.length;
      const planned = prescribeFor({
        meta: picked,
        params,
        bootstrap,
        profile,
        today: doc.localDate,
        isDeload: doc.isDeload,
        isFirstForPattern: isFirstForPattern(doc, picked, position, lookup),
      });
      const { prescription } = planned;
      // A log records work sets only (no warm-ups), like its starting draft.
      const warmups = logging ? [] : planned.warmups;
      dispatch({
        type: 'addExercise',
        newSeId: newId(),
        exerciseId: picked.id,
        repMin: params.repMin,
        repMax: params.repMax,
        targetRir: params.targetRir,
        restSec: params.restSec,
        prescription,
        warmups,
        newSetIds: Array.from({ length: warmups.length + prescription.sets }, () => newId()),
      });
    },
    [bootstrap, closeSheet, dispatch, getDraft, logging, lookup, profile, replaceExercise],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!draft || !ready) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        {edit.state.status === 'loading' ? (
          <View className="flex-1 items-center justify-center">
            <Text testID="edit-session-loading" variant="muted">
              Loading…
            </Text>
          </View>
        ) : (
          <EmptyState
            testID="edit-session-unavailable"
            title={
              edit.state.status === 'unavailable' && edit.state.offline
                ? 'Needs a connection'
                : 'Workout not found'
            }
            description={
              edit.state.status === 'unavailable' && edit.state.offline
                ? 'Connect to load older workouts.'
                : 'It may have been deleted.'
            }
            action={{ label: 'Back', onPress: leave, testID: 'edit-session-unavailable-back' }}
          />
        )}
      </Screen>
    );
  }

  const exercises = byPosition(draft.exercises);
  const active = sheet;
  const content = sheet ?? lastSheet;
  const contentSe =
    content && 'seId' in content && content.seId
      ? (draft.exercises.find((e) => e.id === content.seId) ?? null)
      : null;
  const contentMeta = contentSe ? lookup(contentSe.exerciseId) : null;
  const contentIndex = contentSe ? exercises.findIndex((e) => e.id === contentSe.id) : -1;
  const contentSet =
    content && (content.kind === 'weight' || content.kind === 'reps')
      ? (contentSe?.sets.find((s) => s.id === content.setId) ?? null)
      : null;

  // Replace stays in the same family (strength ↔ strength, cardio ↔ cardio, timed ↔ timed):
  // the logged numbers carry over, so they must still mean the same thing.
  const replacing = content?.kind === 'picker' && content.mode === 'replace';
  const pickerLibrary = (bootstrap?.library ?? []).filter(
    (e) =>
      !replacing ||
      !contentMeta ||
      (isCardioMeta(e) === isCardioMeta(contentMeta) && e.isTimed === contentMeta.isTimed),
  );

  return (
    <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
      <EditSessionHeader
        mode={mode}
        name={draft.name}
        localDate={draft.localDate}
        durationMin={sessionDurationMin(draft)}
        saving={saving}
        onCancel={onCancel}
        onSave={() => void onSave()}
        onChangeWhen={retime}
      />

      <ScrollView
        testID="edit-session-list"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-3 px-2 pt-3"
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        {exercises.length === 0 ? (
          <Text variant="muted" className="px-2 py-6 text-center">
            {logging
              ? 'Add the exercises you did, with their sets and weights.'
              : 'No exercises left. Add one, or delete this workout from its menu.'}
          </Text>
        ) : null}
        {exercises.map((se, index) => (
          <ExerciseCard
            key={se.id}
            exercise={se}
            index={index}
            isCurrent={false}
            expanded={!se.skipped && (expandOverride[se.id] ?? true)}
            ctx={ctx}
          />
        ))}
        <Button
          testID="edit-session-add-exercise"
          variant="outline"
          size="lg"
          disabled={isAtExerciseCap(exercises.length)}
          onPress={() => openSheet({ kind: 'picker', mode: 'add', seId: null })}
        >
          + Add exercise
        </Button>
        {isAtExerciseCap(exercises.length) ? (
          <Text
            testID="edit-session-add-exercise-reason"
            variant="muted"
            className="text-center text-sm"
          >
            {EXERCISE_CAP_REASON}
          </Text>
        ) : null}
      </ScrollView>

      {/* ── Sheets ── */}
      <ExerciseMenuSheet
        key={`menu-${sheetKey}`}
        visible={active?.kind === 'menu'}
        onClose={closeSheet}
        exercise={contentSe}
        name={contentMeta?.name ?? ''}
        isFirst={contentIndex === 0}
        isLast={contentIndex === exercises.length - 1}
        routineBlockedReason={NO_ROUTINE_REASON}
        history={contentSe ? exerciseHistory(contentSe.exerciseId, prior, 5) : []}
        unit={unit}
        loadType={contentMeta?.loadType ?? 'WEIGHTED'}
        mode={mode}
        onSwap={() => {
          if (contentSe) openSheet({ kind: 'picker', mode: 'replace', seId: contentSe.id });
        }}
        onSkip={closeSheet}
        onRemoveExercise={() => {
          if (contentSe) dispatch({ type: 'removeExercise', seId: contentSe.id });
          haptics.warning();
          closeSheet();
        }}
        onAddSet={() => {
          if (contentSe) dispatch({ type: 'addSet', seId: contentSe.id, newSetId: newId() });
          closeSheet();
        }}
        onRemoveSet={() => {
          const working = contentSe
            ? [...byPosition(contentSe.sets)].reverse().filter((s) => !s.isWarmup)
            : [];
          const target = working.find((s) => s.completedAt === null) ?? working[0];
          if (contentSe && target) {
            dispatch({ type: 'removeSet', seId: contentSe.id, setId: target.id });
          }
          closeSheet();
        }}
        onMove={(direction) => {
          if (contentSe) dispatch({ type: 'moveExercise', seId: contentSe.id, direction });
          closeSheet();
        }}
        onSaveNote={(note) => {
          if (contentSe) dispatch({ type: 'setNote', seId: contentSe.id, notes: note });
          closeSheet();
        }}
      />
      <TechniqueSheet
        visible={active?.kind === 'technique'}
        onClose={closeSheet}
        exercise={contentMeta}
      />
      {contentSet && contentSe && contentMeta ? (
        <NumberSheet
          key={`num-${sheetKey}`}
          visible={active?.kind === 'weight' || active?.kind === 'reps'}
          onClose={closeSheet}
          kind={content?.kind === 'reps' ? 'reps' : 'weight'}
          value={content?.kind === 'reps' ? contentSet.reps : contentSet.weightKg}
          title={`${contentMeta.name} · ${content?.kind === 'reps' ? (contentMeta.isTimed ? 'Seconds' : 'Reps') : 'Weight'}`}
          unit={unit}
          meta={contentMeta}
          profile={loggingProfile(contentMeta, profile)}
          showPlates={weightModeOf(contentMeta, profile) === 'plates'}
          timed={contentMeta.isTimed}
          onSubmit={(value) => {
            if (content?.kind === 'reps') handlers.onReps(contentSe.id, contentSet.id, value);
            else handlers.onWeight(contentSe.id, contentSet.id, value);
            closeSheet();
          }}
        />
      ) : null}
      <ExercisePicker
        key={`picker-${sheetKey}`}
        visible={active?.kind === 'picker'}
        onClose={closeSheet}
        onPick={onPick}
        library={pickerLibrary}
        title={replacing ? 'Replace with' : 'Add exercise'}
        preferSwapGroup={replacing ? contentMeta?.swapGroup : null}
        excludeIds={replacing && contentSe ? [contentSe.exerciseId] : undefined}
        showCardioFilter={cardioLogging && !replacing}
        onCreateFromSearch={openCreateExercise}
        testID="edit-session-picker"
      />
      <ConfirmSheet
        testID="edit-session-discard-sheet"
        {...guard.sheetProps}
        onConfirm={onConfirmDiscard}
      />
      <ConfirmSheet
        visible={active?.kind === 'nothing'}
        onClose={closeSheet}
        testID="edit-session-nothing-sheet"
        title="Nothing is ticked. Delete this workout?"
        body="A workout with no ticked sets can’t be saved. Deleting it works your targets out again."
        confirmLabel="Delete workout"
        cancelLabel="Keep editing"
        destructive
        onConfirm={onDeleteInstead}
      />
    </Screen>
  );
}
