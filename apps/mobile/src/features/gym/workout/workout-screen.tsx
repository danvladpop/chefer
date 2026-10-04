import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect } from 'expo-router';
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
  routineWithoutSuperset,
  routineWithSuperset,
  sameKg,
  sessionSupersetKey,
  unstartedExercises,
  type SessionSupersetSlot,
} from '@chefer/utils';
import { useFlags } from '../../../hooks/use-flags';
import { buildTrainerLines } from '../../coaching/logger-lines';
import { captureGymEvent } from '../analytics';
import { SUPERSET_COPY, SupersetSheet } from '../components/superset-sheet';
import { openCreateExercise } from '../library/create-exercise-href';
import { ExercisePicker } from '../library/exercise-picker';
import { useActiveSessionPausedAt } from '../offline/active-session-store';
import { localDate, newId } from '../offline/ids';
import { dispatchWorkout, getResumableSession, useActiveWorkout } from '../use-active-workout';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { EXERCISE_CAP_REASON, isAtExerciseCap } from './caps';
import { ExerciseCard, type WorkoutContext, type WorkoutSheetRequest } from './exercise-card';
import { rememberFinished } from './finished-store';
import { NumberSheet } from './number-sheet';
import { ElapsedTime, RestTimerBar } from './rest-timer-bar';
import type { SetRowHandlers } from './set-row';
import { useIsOnline } from './use-is-online';
import {
  ROUTINE_SUPERSET_NOTICE,
  ROUTINE_SWAP_NOTICE,
  ROUTINE_UNGROUP_NOTICE,
  useRoutineEdit,
  useRoutineSwap,
} from './use-routine-swap';
import { useWeightedBodyweightOffer } from './use-weighted-offer';
import {
  byPosition,
  currentFocus,
  defaultSlotParams,
  derivedSupersetGroups,
  equipmentOf,
  exerciseHistory,
  fallbackMeta,
  isFirstForPattern,
  livePr,
  loggingProfile,
  prescribeFor,
  priorSessions,
  routineSlotsOf,
  setLabelOf,
  supersetsOf,
  swapSlotParams,
  unitOf,
  weightModeOf,
  workingSets,
  workoutProgress,
} from './workout-model';
import { ExerciseMenuSheet, TechniqueSheet, WhySheet, type SwapScope } from './workout-sheets';

// Active workout (gym_plan.md §1.3 / §5.3). Rendering rules that keep a tick
// cheap: cards and set rows are memoised; the reducer preserves the identity
// of every untouched exercise and set; every handler is stable and reads the
// live doc from the store (getResumableSession) instead of closing over it;
// the elapsed clock and rest countdown tick inside their own components.

type SheetState =
  | WorkoutSheetRequest
  | { kind: 'picker'; mode: 'swap' | 'add'; seId: string | null; scope: SwapScope }
  | { kind: 'finish' }
  | { kind: 'discard' }
  | { kind: 'minimise' }
  // plan-library-supersets S2: the "Superset" pick sheet (`seId` = ticked on
  // open) and the Ungroup confirmation (only when the routine could change too).
  | { kind: 'superset'; seId: string | null }
  | { kind: 'ungroup'; seId: string; label: string };

const ROUTINE_OFFLINE_REASON =
  'Changing your routine needs a connection. This applies to today only.';

/** iOS can't present a Modal while another is still dismissing. */
const SHEET_SWAP_DELAY_MS = 380;
const SCROLL_SETTLE_MS = 120;
const NOTICE_MS = 5000;
const KEEP_AWAKE_TAG = 'gym-workout';
const NO_SUPERSETS: ReadonlyMap<string, SessionSupersetSlot> = new Map();

/** Two exercises in the same superset (or the same exercise). */
function sameGroup(
  supersets: ReadonlyMap<string, SessionSupersetSlot>,
  a: string | null,
  b: string | null,
): boolean {
  if (a === null || b === null) return false;
  if (a === b) return true;
  return supersets.get(a)?.memberIds.includes(b) ?? false;
}

function leaveWorkout(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/today');
}

export function WorkoutScreen() {
  const { session, finish, discard, saveForLater, resume } = useActiveWorkout();
  const { data: bootstrap } = useGymBootstrap();
  const { cardioLogging } = useFlags();
  const online = useIsOnline();
  const swapRoutine = useRoutineSwap();
  const editRoutine = useRoutineEdit();
  const [ungroupAlsoRoutine, setUngroupAlsoRoutine] = useState(false);
  const snackbar = useSnackbar();
  const [finishing, setFinishing] = useState(false);
  const [restBarHeight, setRestBarHeight] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [moveUnstarted, setMoveUnstarted] = useState(true);
  const isActive = session !== null;
  const sessionId = session?.id ?? null;
  const pausedAt = useActiveSessionPausedAt();

  // ── Keep the screen on while a workout runs ────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [isActive]);

  // Opening the workout screen on a "saved for later" session resumes it
  // (UX-36 (3)) — the Resume card's job was only to get the user back here.
  useEffect(() => {
    if (pausedAt !== null) resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once, not on every pausedAt read
  }, []);

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
  const prior = useMemo(
    () => priorSessions(bootstrap?.recentSessions ?? [], sessionId),
    [bootstrap?.recentSessions, sessionId],
  );
  // Supersets: the session's own letters (S-D3), or — for an older doc without
  // them — derived from the cached routine. Re-derived per render but kept
  // referentially stable while the grouping itself is unchanged (the key holds
  // every member's id, letter and place, so a regroup in the workout shows at
  // once), so memoised cards don't re-render per tick.
  const derivedSupersets = session ? supersetsOf(session, bootstrap) : NO_SUPERSETS;
  const supersetKey = sessionSupersetKey(derivedSupersets);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the grouping, not the doc
  const supersets = useMemo(() => derivedSupersets, [supersetKey]);

  const live = useRef({ prior, lookup, profile, bootstrap, supersets });
  const olderBests = bootstrap?.olderBests;
  useEffect(() => {
    live.current = { prior, lookup, profile, bootstrap, supersets };
  }, [prior, lookup, profile, bootstrap, supersets]);

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

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  // The exercise whose last set was just ticked stays open until its optional
  // RIR question is answered, dismissed, or the user moves on (ticks elsewhere);
  // the auto-scroll to the next exercise waits for it.
  const [rirPendingId, setRirPendingId] = useState<string | null>(null);
  const rirPendingRef = useRef<string | null>(null);

  // ── Set handlers (stable; read the live doc) ───────────────────────────────
  const offerWeighted = useWeightedBodyweightOffer();
  const handlers = useMemo<SetRowHandlers>(
    () => ({
      onTick: (seId, setId) => {
        const se = getResumableSession()?.exercises.find((e) => e.id === seId);
        const set = se?.sets.find((s) => s.id === setId);
        if (!se || !set) return;
        if (set.completedAt !== null) {
          dispatchWorkout({ type: 'uncompleteSet', seId, setId });
          setRirPendingId((prev) => (prev === seId ? null : prev));
          return;
        }
        const olderBest = live.current.bootstrap?.olderBests?.[se.exerciseId];
        const before = set.isWarmup ? null : livePr(se, live.current.prior, olderBest);
        const next = dispatchWorkout(
          {
            type: 'completeSet',
            seId,
            setId,
            weightKg: set.weightKg,
            reps: set.reps,
          },
          { supersets: live.current.supersets },
        );
        const after = next?.exercises.find((e) => e.id === seId);
        const finishedExercise =
          after !== undefined &&
          !set.isWarmup &&
          after.lastSetRir === null &&
          workingSets(after).every((s) => s.completedAt !== null);
        setRirPendingId((prev) => (finishedExercise ? seId : prev === seId ? prev : null));
        const pr = after && !set.isWarmup ? livePr(after, live.current.prior, olderBest) : null;
        if (pr?.setId === setId && before?.kind !== pr.kind) haptics.success();
        else haptics.tick();
      },
      onWeight: (seId, setId, kg) => {
        const se = getResumableSession()?.exercises.find((e) => e.id === seId);
        const set = se?.sets.find((s) => s.id === setId);
        if (!se || !set) return;
        const old = set.weightKg;
        dispatchWorkout({ type: 'editSet', seId, setId, weightKg: kg });
        offerWeighted(lookup(se.exerciseId), profile, kg);
        if (set.isWarmup) return;
        // Carry a weight change to the later unticked sets that still had the
        // old weight — changing set 1 almost always means the rest too.
        for (const later of se.sets) {
          if (
            !later.isWarmup &&
            later.position > set.position &&
            later.completedAt === null &&
            sameKg(later.weightKg, old)
          ) {
            dispatchWorkout({ type: 'editSet', seId, setId: later.id, weightKg: kg });
          }
        }
      },
      // T-05.7 (bug B-20): typed/stepped reps carry to later unticked sets
      // that still matched the old value, exactly like weight above — a
      // reps change on set 1 almost always means the rest too.
      onReps: (seId, setId, reps) => {
        const se = getResumableSession()?.exercises.find((e) => e.id === seId);
        const set = se?.sets.find((s) => s.id === setId);
        if (!se || !set) return;
        const old = set.reps;
        dispatchWorkout({ type: 'editSet', seId, setId, reps });
        if (set.isWarmup) return;
        for (const later of se.sets) {
          if (
            !later.isWarmup &&
            later.position > set.position &&
            later.completedAt === null &&
            later.reps === old
          ) {
            dispatchWorkout({ type: 'editSet', seId, setId: later.id, reps });
          }
        }
      },
      onOpenWeight: (seId, setId) => openSheet({ kind: 'weight', seId, setId }),
      onOpenReps: (seId, setId) => openSheet({ kind: 'reps', seId, setId }),
      // UX-05 A1 (T-05.A1.2, PAT-16): any set, logged or not, is removed with
      // no confirm — the ⋯ and long-press both land here — and restored by
      // Undo, in place, with its values and tick.
      onLongPress: (seId, setId) => {
        const se = getResumableSession()?.exercises.find((e) => e.id === seId);
        const index = se?.sets.findIndex((s) => s.id === setId) ?? -1;
        const set = se && index >= 0 ? se.sets[index] : undefined;
        const label = se ? setLabelOf(se, setId) : null;
        if (!se || !set) return;
        dispatchWorkout({ type: 'removeSet', seId, setId });
        haptics.warning();
        snackbar.show({
          message: `Removed ${label?.toLowerCase() ?? 'set'}`,
          actionLabel: 'Undo',
          durationMs: 8000,
          onAction: () => {
            dispatchWorkout({ type: 'restoreSet', seId, set, index });
          },
        });
      },
    }),
    [openSheet, snackbar, offerWeighted, lookup, profile],
  );

  // ── Expansion + auto-scroll to the current exercise ────────────────────────
  const focus = session ? currentFocus(session, supersets) : null;
  const currentId = focus?.seId ?? null;
  const [expandOverride, setExpandOverride] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<ScrollView>(null);
  const layoutY = useRef(new Map<string, number>());
  const pendingScrollId = useRef<string | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIdRef = useRef(currentId);
  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  const scheduleScroll = useCallback(() => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    // A pending RIR question holds the scroll — unless focus only moved to the
    // next exercise of the same superset (both cards stay open).
    const pending = rirPendingRef.current;
    if (pending !== null && !sameGroup(live.current.supersets, pending, pendingScrollId.current)) {
      return;
    }
    scrollTimer.current = setTimeout(() => {
      const id = pendingScrollId.current;
      const y = id ? layoutY.current.get(id) : undefined;
      if (id && y !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
        pendingScrollId.current = null;
      }
    }, SCROLL_SETTLE_MS);
  }, []);

  useEffect(() => {
    if (!currentId) return;
    pendingScrollId.current = currentId;
    setExpandOverride((prev) => {
      if (!(currentId in prev)) return prev;
      return Object.fromEntries(Object.entries(prev).filter(([key]) => key !== currentId));
    });
    scheduleScroll();
  }, [currentId, scheduleScroll]);

  useEffect(() => {
    rirPendingRef.current = rirPendingId;
    if (rirPendingId === null && pendingScrollId.current !== null) scheduleScroll();
  }, [rirPendingId, scheduleScroll]);

  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    [],
  );

  // WP-18: the trainer's cue and "Set by Ana", read from the cached bootstrap (null when uncoached).
  const trainerLines = useMemo(
    () => buildTrainerLines(bootstrap, session?.routineDayId ?? null),
    [bootstrap, session?.routineDayId],
  );

  const ctx = useMemo<WorkoutContext>(
    () => ({
      unit,
      profile,
      trainer: trainerLines,
      lookup,
      prior,
      olderBests,
      handlers,
      onSheet: openSheet,
      onToggle: (seId) =>
        setExpandOverride((prev) => ({
          ...prev,
          [seId]: !(
            prev[seId] ??
            (sameGroup(live.current.supersets, seId, currentIdRef.current) ||
              seId === rirPendingRef.current)
          ),
        })),
      onRir: (seId, rir: Rir | null) => {
        dispatchWorkout({ type: 'setRir', seId, rir });
        if (rir !== null) setRirPendingId((prev) => (prev === seId ? null : prev));
      },
      onRirDismiss: (seId) => setRirPendingId((prev) => (prev === seId ? null : prev)),
      onSkip: (seId, skipped) => dispatchWorkout({ type: 'skipExercise', seId, skipped }),
      onAddSet: (seId) => dispatchWorkout({ type: 'addSet', seId, newSetId: newId() }),
      onLayoutY: (seId, y) => {
        layoutY.current.set(seId, y);
        if (pendingScrollId.current === seId) scheduleScroll();
      },
      // T-42.3: "Log it" on a cardio entry — one completeSet carrying the
      // cardio fields instead of weightKg/reps (weightKg/reps stay 0/0).
      onLogCardio: (seId, setId, fields) =>
        dispatchWorkout({ type: 'completeSet', seId, setId, weightKg: 0, reps: 0, ...fields }),
    }),
    [unit, profile, trainerLines, lookup, prior, olderBests, handlers, openSheet, scheduleScroll],
  );

  // ── Finish / discard / minimise ────────────────────────────────────────────
  const doFinish = useCallback(
    async (carryOverExerciseIds?: string[]) => {
      closeSheet();
      setFinishing(true);
      try {
        const doc = await finish(carryOverExerciseIds);
        if (doc) {
          captureGymEvent('workout_finished', {
            durationMin: Math.round(
              (Date.parse(doc.finishedAt ?? doc.startedAt) - Date.parse(doc.startedAt)) / 60000,
            ),
            sets: doc.exercises.reduce(
              (n, se) =>
                n + (se.skipped ? 0 : se.sets.filter((s) => !s.isWarmup && s.completedAt).length),
              0,
            ),
            kind: doc.routineDayId ? 'planned' : 'freestyle',
          });
          rememberFinished(doc);
          router.replace({ pathname: '/gym/summary/[id]', params: { id: doc.id } });
          return;
        }
      } catch {
        // The doc is enqueued before anything that can throw; fall through.
      }
      setFinishing(false);
    },
    [closeSheet, finish],
  );

  // The names shown in the finish sheet's "N exercises not started" body and
  // carried through to `finish()` when the switch stays on (UX-36 (3)).
  const unstarted = useMemo(() => (session ? unstartedExercises(session) : []), [session]);

  const onFinishPress = useCallback(() => {
    const doc = getResumableSession();
    if (!doc) return;
    const { done, planned } = workoutProgress(doc);
    if (done < planned || done === 0) {
      setMoveUnstarted(true);
      openSheet({ kind: 'finish' });
    } else void doFinish();
  }, [doFinish, openSheet]);

  const onFinishConfirm = useCallback(() => {
    const ids =
      moveUnstarted && session?.routineDayId ? unstarted.map((e) => e.exerciseId) : undefined;
    void doFinish(ids);
  }, [doFinish, moveUnstarted, session?.routineDayId, unstarted]);

  const onSaveForLater = useCallback(() => {
    closeSheet();
    saveForLater();
    leaveWorkout();
  }, [closeSheet, saveForLater]);

  const onDiscardConfirm = useCallback(() => {
    closeSheet();
    setFinishing(true);
    discard();
    leaveWorkout();
  }, [closeSheet, discard]);

  // Android hardware back: never drop out of a running workout by accident.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!getResumableSession()) return false;
        openSheet({ kind: 'minimise' });
        return true;
      });
      return () => sub.remove();
    }, [openSheet]),
  );

  // ── Picker (swap / add) ────────────────────────────────────────────────────
  const onPick = useCallback(
    (picked: ExerciseDto) => {
      const request = sheetRef.current;
      closeSheet();
      const doc = getResumableSession();
      if (!doc || request?.kind !== 'picker') return;
      const { lookup: find, profile: equipment, bootstrap: cached } = live.current;
      const today = localDate();

      if (request.mode === 'add') {
        const params = defaultSlotParams(picked);
        const position = doc.exercises.length;
        const { prescription, warmups } = prescribeFor({
          meta: picked,
          params,
          bootstrap: cached,
          profile: equipment,
          today,
          isDeload: doc.isDeload,
          isFirstForPattern: isFirstForPattern(doc, picked, position, find),
        });
        dispatchWorkout({
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
        return;
      }

      const se = doc.exercises.find((e) => e.id === request.seId);
      if (!se) return;
      const params = swapSlotParams(se, find(se.exerciseId), picked);
      const { prescription, warmups } = prescribeFor({
        meta: picked,
        params,
        bootstrap: cached,
        profile: equipment,
        today,
        isDeload: doc.isDeload,
        isFirstForPattern: isFirstForPattern(doc, picked, se.position, find),
      });
      dispatchWorkout({
        type: 'swapExercise',
        seId: se.id,
        exerciseId: picked.id,
        repMin: params.repMin,
        repMax: params.repMax,
        targetRir: params.targetRir,
        restSec: params.restSec,
        prescription,
        warmups,
        newSetIds: Array.from({ length: warmups.length + prescription.sets }, () => newId()),
      });
      if (request.scope === 'routine' && se.routineExerciseId) {
        setNotice('Updating your routine…');
        void swapRoutine(se.routineExerciseId, picked.id, params).then((result) =>
          setNotice(ROUTINE_SWAP_NOTICE[result]),
        );
      }
    },
    [closeSheet, swapRoutine],
  );

  // ── Supersets made in the workout (plan-library-supersets S2) ─────────────
  // Session-only by default (S-D2); "Also change my routine" saves the same
  // grouping to the routine through the swap's save path (online only).
  const onGroupSuperset = useCallback(
    (seIds: string[], alsoRoutine: boolean) => {
      closeSheet();
      const doc = getResumableSession();
      if (!doc) return;
      const { supersets: groups, bootstrap: cached } = live.current;
      const slotIds = alsoRoutine ? routineSlotsOf(doc, seIds, cached?.activeRoutine) : null;
      const derived = derivedSupersetGroups(doc, groups);
      dispatchWorkout({
        type: 'createSuperset',
        seIds,
        ...(derived ? { derivedGroups: derived } : {}),
      });
      haptics.success();
      if (slotIds) {
        setNotice('Updating your routine…');
        void editRoutine((base) => routineWithSuperset(base, slotIds)).then((result) =>
          setNotice(ROUTINE_SUPERSET_NOTICE[result]),
        );
      }
    },
    [closeSheet, editRoutine],
  );

  const applyUngroup = useCallback(
    (seId: string, alsoRoutine: boolean) => {
      closeSheet();
      const doc = getResumableSession();
      if (!doc) return;
      const { supersets: groups, bootstrap: cached } = live.current;
      const slot = groups.get(seId);
      const slotIds =
        alsoRoutine && slot ? routineSlotsOf(doc, slot.memberIds, cached?.activeRoutine) : null;
      const derived = derivedSupersetGroups(doc, groups);
      dispatchWorkout({
        type: 'ungroupSuperset',
        seId,
        ...(derived ? { derivedGroups: derived } : {}),
      });
      haptics.tick();
      const anchor = slotIds?.[0];
      if (anchor) {
        setNotice('Updating your routine…');
        void editRoutine((base) => routineWithoutSuperset(base, anchor)).then((result) =>
          setNotice(ROUTINE_UNGROUP_NOTICE[result]),
        );
      }
    },
    [closeSheet, editRoutine],
  );

  // Ungroup is immediate unless the routine has the same superset — then a
  // small sheet asks whether to change the routine too.
  const onUngroupPress = useCallback(
    (seId: string) => {
      const doc = getResumableSession();
      const { supersets: groups, bootstrap: cached } = live.current;
      const slot = groups.get(seId);
      if (!doc || !slot) return;
      const routine = cached?.activeRoutine;
      const slotIds = routineSlotsOf(doc, slot.memberIds, routine);
      const inRoutineSuperset =
        slotIds?.every(
          (id) =>
            routine?.days.some((d) =>
              d.exercises.some((e) => e.id === id && e.supersetGroup !== null),
            ) ?? false,
        ) ?? false;
      if (!inRoutineSuperset) {
        applyUngroup(seId, false);
        return;
      }
      setUngroupAlsoRoutine(false);
      openSheet({ kind: 'ungroup', seId, label: slot.label });
    },
    [applyUngroup, openSheet],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        {finishing ? null : (
          <EmptyState
            testID="workout-empty"
            title="No workout in progress"
            description="Start one from Today."
            action={{ label: 'Back to Today', onPress: leaveWorkout, testID: 'workout-empty-back' }}
          />
        )}
      </Screen>
    );
  }

  const exercises = byPosition(session.exercises);
  const { done, planned } = workoutProgress(session);
  const active = sheet;
  const content = sheet ?? lastSheet;
  const contentSe =
    content && 'seId' in content && content.seId
      ? (session.exercises.find((e) => e.id === content.seId) ?? null)
      : null;
  const contentMeta = contentSe ? lookup(contentSe.exerciseId) : null;
  const contentIndex = contentSe ? exercises.findIndex((e) => e.id === contentSe.id) : -1;
  const contentSet =
    content && (content.kind === 'weight' || content.kind === 'reps')
      ? (contentSe?.sets.find((s) => s.id === content.setId) ?? null)
      : null;
  const routineBlockedReason = !contentSe?.routineExerciseId
    ? 'This exercise isn’t in your routine, so a swap applies to today only.'
    : !bootstrap?.activeRoutine
      ? 'No active routine to update. This swap applies to today only.'
      : !online
        ? 'Changing your routine needs a connection. This swap applies to today only.'
        : null;
  // WP-04: a freestyle session (no routine) or an exercise outside the routine
  // has no "routine" to change, so Swap skips the scope page ("Just today").
  const swapAsksScope = session.routineId !== null && Boolean(contentSe?.routineExerciseId);
  const unticked = planned - done;
  // Skipped exercises can't join a superset; ones added mid-workout can.
  const pickable = exercises.filter((se) => !se.skipped);

  return (
    <Screen className="px-0" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center gap-2 border-b border-border px-2 pb-2 pt-1">
        <Pressable
          testID="workout-minimise"
          accessibilityRole="button"
          accessibilityLabel="Minimise workout"
          onPress={leaveWorkout}
          className="h-11 w-11 items-center justify-center rounded-full bg-muted"
        >
          <Ionicons name="chevron-down" size={22} color="#374151" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text testID="workout-title" numberOfLines={2} className="text-lg font-semibold">
            {session.name}
          </Text>
          <View className="flex-row items-center gap-2">
            <ElapsedTime startedAt={session.startedAt} testID="workout-elapsed" />
            <Text
              testID="workout-progress"
              accessibilityLabel={`${done} of ${planned} sets done`}
              className="text-sm text-muted-foreground"
            >
              · {done}/{planned} sets
            </Text>
          </View>
        </View>
        {/* WP-04: one size up (lg) — pressed with sweaty hands; px-5 keeps the header slim. */}
        <Button
          testID="workout-finish"
          size="lg"
          className="px-5"
          onPress={onFinishPress}
          loading={finishing}
        >
          Finish
        </Button>
      </View>

      {notice ? (
        <View className="bg-accent px-4 py-2">
          <Text testID="workout-notice" className="text-sm">
            {notice}
          </Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        testID="workout-list"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-3 px-2 pt-3"
        // UX-GYM-34: pad by the rest bar's real height, not a guess.
        contentContainerStyle={{ paddingBottom: 32 + restBarHeight }}
      >
        {exercises.length === 0 ? (
          <Text variant="muted" className="px-2 py-6 text-center">
            Add your first exercise to get going.
          </Text>
        ) : null}
        {exercises.map((se, index) => {
          const slot = supersets.get(se.id);
          const card = (
            <ExerciseCard
              key={se.id}
              exercise={se}
              index={index}
              isCurrent={se.id === currentId}
              expanded={
                !se.skipped &&
                (expandOverride[se.id] ??
                  (sameGroup(supersets, se.id, currentId) || se.id === rirPendingId))
              }
              supersetLabel={slot?.label ?? null}
              supersetIndex={slot?.index ?? 0}
              focusSetId={focus?.seId === se.id ? focus.setId : null}
              ctx={ctx}
            />
          );
          if (slot?.index !== 0) return card;
          // The superset's heading sits above its first card; the cards carry the bracket.
          const lastId = slot.memberIds[slot.memberIds.length - 1];
          const restSec = session.exercises.find((e) => e.id === lastId)?.restSec ?? se.restSec;
          return [
            <View
              key={`superset-${slot.label}`}
              testID={`superset-${slot.label}`}
              className="-mb-1 flex-row items-center gap-2 px-2"
            >
              <View className="h-4 w-1 rounded-full bg-violet-500" />
              <Text className="text-sm font-semibold text-violet-800">Superset {slot.label}</Text>
              <Text variant="muted" className="min-w-0 flex-1 text-xs" numberOfLines={2}>
                {restSec} s rest after each round
              </Text>
              <Pressable
                testID={`superset-${slot.label}-ungroup`}
                accessibilityRole="button"
                accessibilityLabel={`Ungroup superset ${slot.label}`}
                onPress={() => onUngroupPress(se.id)}
                className="min-h-11 justify-center px-2"
              >
                <Text className="text-sm font-medium text-primary">{SUPERSET_COPY.ungroup}</Text>
              </Pressable>
            </View>,
            card,
          ];
        })}
        <Button
          testID="workout-add-exercise"
          variant="outline"
          size="lg"
          disabled={isAtExerciseCap(exercises.length)}
          onPress={() => openSheet({ kind: 'picker', mode: 'add', seId: null, scope: 'today' })}
        >
          + Add exercise
        </Button>
        {isAtExerciseCap(exercises.length) ? (
          <Text
            testID="workout-add-exercise-reason"
            variant="muted"
            className="text-center text-sm"
          >
            {EXERCISE_CAP_REASON}
          </Text>
        ) : null}
        <Button
          testID="workout-superset"
          variant="outline"
          disabled={pickable.length < 2}
          accessibilityLabel="Superset"
          accessibilityHint="Pick exercises to do back to back"
          onPress={() => openSheet({ kind: 'superset', seId: null })}
        >
          <View className="flex-row items-center gap-1">
            <Ionicons name="link" size={16} color="#6d28d9" />
            <Text className="font-medium text-violet-800">{SUPERSET_COPY.title}</Text>
          </View>
        </Button>
        {/* Finish again at the end of the list: in reach right after the last
            exercise (the header copy sits in the hard-to-reach top corner). */}
        <Button
          testID="workout-finish-bottom"
          size="lg"
          loading={finishing}
          onPress={onFinishPress}
        >
          Finish workout
        </Button>
        {/* UX-36 (3), T-36.3: bottom actions become Finish · Save for later ·
            Discard — a cut-short workout is never just finish-or-bin (CI-49). */}
        <Button testID="workout-save-for-later" variant="outline" onPress={onSaveForLater}>
          Save for later
        </Button>
        <Button
          testID="workout-discard"
          variant="ghost"
          onPress={() => openSheet({ kind: 'discard' })}
        >
          <Text className="text-sm font-medium text-destructive">Discard workout</Text>
        </Button>
      </ScrollView>

      <RestTimerBar onHeightChange={setRestBarHeight} />

      {/* ── Sheets ── */}
      <ExerciseMenuSheet
        key={`menu-${sheetKey}`}
        visible={active?.kind === 'menu'}
        onClose={closeSheet}
        exercise={contentSe}
        name={contentMeta?.name ?? ''}
        isFirst={contentIndex === 0}
        isLast={contentIndex === exercises.length - 1}
        routineBlockedReason={routineBlockedReason}
        swapAsksScope={swapAsksScope}
        history={contentSe ? exerciseHistory(contentSe.exerciseId, prior, 5) : []}
        unit={unit}
        loadType={contentMeta?.loadType ?? 'WEIGHTED'}
        perHand={contentMeta?.perHand ?? false}
        onSwap={(scope) => {
          if (contentSe) openSheet({ kind: 'picker', mode: 'swap', seId: contentSe.id, scope });
        }}
        onSkip={() => {
          if (contentSe) {
            dispatchWorkout({
              type: 'skipExercise',
              seId: contentSe.id,
              skipped: !contentSe.skipped,
            });
          }
          closeSheet();
        }}
        onRemoveExercise={() => {
          // No confirm: Undo puts it back in place with its sets and ticks.
          if (contentSe) {
            const exercise = contentSe;
            dispatchWorkout({ type: 'removeExercise', seId: exercise.id });
            haptics.warning();
            snackbar.show({
              message: `Removed ${contentMeta?.name ?? 'exercise'}`,
              actionLabel: 'Undo',
              durationMs: 8000,
              onAction: () => {
                dispatchWorkout({ type: 'restoreExercise', exercise, index: contentIndex });
              },
            });
          }
          closeSheet();
        }}
        onAddSet={() => {
          if (contentSe) dispatchWorkout({ type: 'addSet', seId: contentSe.id, newSetId: newId() });
          closeSheet();
        }}
        onRemoveSet={() => {
          // "Remove last set" (renamed, T-05.A1.2): the last unlogged
          // working set, or — once every set is logged — the last working
          // set outright.
          const working = contentSe
            ? [...byPosition(contentSe.sets)].reverse().filter((s) => !s.isWarmup)
            : [];
          const target = working.find((s) => s.completedAt === null) ?? working[0];
          if (contentSe && target) {
            dispatchWorkout({ type: 'removeSet', seId: contentSe.id, setId: target.id });
          }
          closeSheet();
        }}
        onMove={(direction) => {
          if (contentSe) dispatchWorkout({ type: 'moveExercise', seId: contentSe.id, direction });
          closeSheet();
        }}
        onSaveNote={(note) => {
          if (contentSe) dispatchWorkout({ type: 'setNote', seId: contentSe.id, notes: note });
          closeSheet();
        }}
        {...(contentSe && !contentSe.skipped && pickable.length >= 2
          ? { onSuperset: () => openSheet({ kind: 'superset', seId: contentSe.id }) }
          : {})}
      />
      <SupersetSheet
        key={`superset-${sheetKey}`}
        visible={active?.kind === 'superset'}
        onClose={closeSheet}
        testID="workout-superset-sheet"
        items={pickable.map((se) => {
          const slot = supersets.get(se.id);
          return {
            key: se.id,
            name: lookup(se.exerciseId).name,
            detail: slot ? `In superset ${slot.label}` : null,
          };
        })}
        initialKeys={content?.kind === 'superset' && content.seId ? [content.seId] : []}
        routineOption={{
          available: (keys) => routineSlotsOf(session, keys, bootstrap?.activeRoutine) !== null,
          blockedReason: online ? null : ROUTINE_OFFLINE_REASON,
        }}
        onApply={onGroupSuperset}
      />
      <ConfirmSheet
        visible={active?.kind === 'ungroup'}
        onClose={closeSheet}
        testID="workout-ungroup-sheet"
        title={`Ungroup superset ${content?.kind === 'ungroup' ? content.label : ''}`}
        body={
          online
            ? 'You’ll rest after each set again.'
            : `You’ll rest after each set again. ${ROUTINE_OFFLINE_REASON}`
        }
        options={
          online
            ? [
                {
                  label: SUPERSET_COPY.alsoRoutine,
                  detail: 'Next time these are separate too.',
                  value: ungroupAlsoRoutine,
                  onChange: setUngroupAlsoRoutine,
                },
              ]
            : undefined
        }
        confirmLabel={SUPERSET_COPY.ungroup}
        cancelLabel="Keep superset"
        onConfirm={() => {
          if (content?.kind === 'ungroup') {
            applyUngroup(content.seId, online && ungroupAlsoRoutine);
          }
        }}
      />
      <TechniqueSheet
        visible={active?.kind === 'technique'}
        onClose={closeSheet}
        exercise={contentMeta}
      />
      <WhySheet
        visible={active?.kind === 'why'}
        onClose={closeSheet}
        exercise={contentSe}
        name={contentMeta?.name ?? ''}
        unit={unit}
        setBy={contentSe ? (trainerLines?.setByFor(contentSe) ?? null) : null}
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
        library={bootstrap?.library ?? []}
        title={content?.kind === 'picker' && content.mode === 'add' ? 'Add exercise' : 'Swap for'}
        preferSwapGroup={
          content?.kind === 'picker' && content.mode === 'swap' ? contentMeta?.swapGroup : null
        }
        excludeIds={contentSe && content?.kind === 'picker' ? [contentSe.exerciseId] : undefined}
        showCardioFilter={cardioLogging}
        onCreateFromSearch={openCreateExercise}
        testID="workout-picker"
      />
      <ConfirmSheet
        visible={active?.kind === 'finish'}
        onClose={closeSheet}
        testID="workout-finish-sheet"
        title={
          unstarted.length > 0 && session.routineDayId
            ? `${unstarted.length} ${unstarted.length === 1 ? 'exercise' : 'exercises'} not started`
            : 'Finish workout?'
        }
        body={
          unstarted.length > 0 && session.routineDayId
            ? unstarted.map((e) => lookup(e.exerciseId).name).join(', ')
            : done === 0
              ? 'You haven’t logged any sets yet. Only ticked sets count.'
              : `${unticked} ${unticked === 1 ? 'set isn’t' : 'sets aren’t'} ticked. Only ticked sets count.`
        }
        // UX-36 (3): "Move them to your next session" (T-36.3) — only offered
        // when whole exercises were never started AND it's a routine day
        // (freestyle sessions have no "next session" to carry into).
        options={
          unstarted.length > 0 && session.routineDayId
            ? [
                {
                  label: 'Move them to your next session',
                  detail: 'Turn off to finish now and skip them this time.',
                  value: moveUnstarted,
                  onChange: setMoveUnstarted,
                },
              ]
            : undefined
        }
        confirmLabel={
          unstarted.length > 0 && session.routineDayId ? 'Finish workout' : 'Finish anyway'
        }
        cancelLabel="Keep going"
        onConfirm={onFinishConfirm}
      />
      <ConfirmSheet
        visible={active?.kind === 'discard'}
        onClose={closeSheet}
        testID="workout-discard-sheet"
        title="Discard this workout?"
        body="The sets you logged today won’t be saved. This can’t be undone."
        confirmLabel="Discard workout"
        cancelLabel="Keep going"
        destructive
        onConfirm={onDiscardConfirm}
      />
      <ConfirmSheet
        visible={active?.kind === 'minimise'}
        onClose={closeSheet}
        testID="workout-minimise-sheet"
        title="Minimise workout?"
        body="Your workout keeps running. Resume it from Today."
        confirmLabel="Minimise"
        cancelLabel="Keep going"
        onConfirm={() => {
          closeSheet();
          leaveWorkout();
        }}
      />
    </Screen>
  );
}
