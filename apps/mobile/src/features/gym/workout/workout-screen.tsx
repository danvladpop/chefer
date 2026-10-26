import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  formatLoad,
  livePrLine,
  profileDistanceUnit,
  routineWithoutSuperset,
  routineWithSuperset,
  sameKg,
  sessionSupersetKey,
  unstartedExercises,
  type SessionSupersetSlot,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useFlags } from '../../../hooks/use-flags';
import { useT } from '../../../lib/i18n';
import { buildTrainerLines } from '../../coaching/logger-lines';
import { LivePrBanner, useLivePrBanner } from '../../progress/live-pr-banner';
import { useProgressEnabled } from '../../progress/use-progress';
import { noteWorkoutCompleted } from '../../review/review-store';
import { useShellV2 } from '../../shell/shell-store';
import { WorkoutActions } from '../../shell/train/workout-actions';
import { WorkoutHeader } from '../../shell/train/workout-header';
import { captureGymEvent } from '../analytics';
import { SUPERSET_COPY, SupersetSheet } from '../components/superset-sheet';
import { openCreateExercise } from '../library/create-exercise-href';
import { ExercisePicker } from '../library/exercise-picker';
import { localDate, newId } from '../offline/ids';
import { exerciseCapReason, isAtExerciseCap } from './caps';
import { ExerciseCard, type WorkoutContext, type WorkoutSheetRequest } from './exercise-card';
import { rememberFinished } from './finished-store';
import { NumberSheet } from './number-sheet';
import { ElapsedTime, RestTimerBar } from './rest-timer-bar';
import type { SetRowHandlers } from './set-row';
import { useIsOnline } from './use-is-online';
import { routineNotice, useRoutineEdit, useRoutineSwap } from './use-routine-swap';
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
import { useWorkoutSource } from './workout-source';

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
  const { t } = useT();
  const ROUTINE_OFFLINE_REASON = t('gym.workout.logger.screen.routineOffline');
  const COACHED_ROUTINE_REASON = t('gym.workout.logger.screen.coachedRoutine');
  // Trainer mode M3: the same logger runs a coached client's workout (workout-source.tsx).
  const {
    session,
    finish,
    discard,
    saveForLater,
    resume,
    bootstrap,
    pausedAt,
    coached,
    get: getDoc,
    dispatch,
  } = useWorkoutSource();
  const isCoached = coached !== null;
  const leave = coached?.onLeave ?? leaveWorkout;
  const { cardioLogging } = useFlags();
  const online = useIsOnline();
  const swapRoutine = useRoutineSwap();
  const editRoutine = useRoutineEdit();
  const [ungroupAlsoRoutine, setUngroupAlsoRoutine] = useState(false);
  const snackbar = useSnackbar();
  // Kitchen progress (mockup 03): a live PR also gets a 3 s banner, when the feature is on.
  const progressOn = useProgressEnabled();
  const livePrBanner = useLivePrBanner();
  const showLivePr = livePrBanner.show;
  const insets = useSafeAreaInsets();
  const [finishing, setFinishing] = useState(false);
  const [restBarHeight, setRestBarHeight] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [moveUnstarted, setMoveUnstarted] = useState(true);
  const isActive = session !== null;
  const sessionId = session?.id ?? null;
  // 10 Oct redesign: the new shell draws the brand header and list foot.
  const shellV2 = useShellV2();
  const colors = useThemeColors();

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
  // Read by the stable set handlers, like `live`.
  const liveProgress = useRef(progressOn);
  useEffect(() => {
    liveProgress.current = progressOn;
  }, [progressOn]);

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
        const se = getDoc()?.exercises.find((e) => e.id === seId);
        const set = se?.sets.find((s) => s.id === setId);
        if (!se || !set) return;
        if (set.completedAt !== null) {
          dispatch({ type: 'uncompleteSet', seId, setId });
          setRirPendingId((prev) => (prev === seId ? null : prev));
          return;
        }
        const olderBest = live.current.bootstrap?.olderBests?.[se.exerciseId];
        const before = set.isWarmup ? null : livePr(se, live.current.prior, olderBest);
        const next = dispatch(
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
        const pr =
          after && !set.isWarmup && !isCoached
            ? livePr(after, live.current.prior, olderBest)
            : null;
        if (pr?.setId === setId && before?.kind !== pr.kind) {
          haptics.success();
          if (liveProgress.current) {
            const meta = live.current.lookup(se.exerciseId);
            const unitNow = unitOf(live.current.bootstrap);
            // MO-14 pop: "New best · Bench press 80 kg × 5".
            showLivePr(
              livePrLine(
                meta.name,
                formatLoad(set.weightKg, unitNow, meta.loadType, { each: meta.perHand }),
                set.reps,
              ),
            );
          }
        } else haptics.tick();
      },
      onWeight: (seId, setId, kg) => {
        const se = getDoc()?.exercises.find((e) => e.id === seId);
        const set = se?.sets.find((s) => s.id === setId);
        if (!se || !set) return;
        const old = set.weightKg;
        dispatch({ type: 'editSet', seId, setId, weightKg: kg });
        // A coached workout never offers to change the TRAINER's own gym settings.
        if (!isCoached) offerWeighted(lookup(se.exerciseId), profile, kg);
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
            dispatch({ type: 'editSet', seId, setId: later.id, weightKg: kg });
          }
        }
      },
      // T-05.7 (bug B-20): typed/stepped reps carry to later unticked sets
      // that still matched the old value, exactly like weight above — a
      // reps change on set 1 almost always means the rest too.
      onReps: (seId, setId, reps) => {
        const se = getDoc()?.exercises.find((e) => e.id === seId);
        const set = se?.sets.find((s) => s.id === setId);
        if (!se || !set) return;
        const old = set.reps;
        dispatch({ type: 'editSet', seId, setId, reps });
        if (set.isWarmup) return;
        for (const later of se.sets) {
          if (
            !later.isWarmup &&
            later.position > set.position &&
            later.completedAt === null &&
            later.reps === old
          ) {
            dispatch({ type: 'editSet', seId, setId: later.id, reps });
          }
        }
      },
      onOpenWeight: (seId, setId) => openSheet({ kind: 'weight', seId, setId }),
      onOpenReps: (seId, setId) => openSheet({ kind: 'reps', seId, setId }),
      // UX-05 A1 (T-05.A1.2, PAT-16): any set, logged or not, is removed with
      // no confirm — the ⋯ and long-press both land here — and restored by
      // Undo, in place, with its values and tick.
      onLongPress: (seId, setId) => {
        const se = getDoc()?.exercises.find((e) => e.id === seId);
        const index = se?.sets.findIndex((s) => s.id === setId) ?? -1;
        const set = se && index >= 0 ? se.sets[index] : undefined;
        const label = se ? setLabelOf(se, setId) : null;
        if (!se || !set) return;
        dispatch({ type: 'removeSet', seId, setId });
        haptics.warning();
        snackbar.show({
          message: t('gym.workout.view.removedSet', {
            label: label?.toLowerCase() ?? t('gym.workout.view.setFallback'),
          }),
          actionLabel: t('gym.workout.view.undo'),
          durationMs: 8000,
          onAction: () => {
            dispatch({ type: 'restoreSet', seId, set, index });
          },
        });
      },
    }),
    [openSheet, snackbar, offerWeighted, lookup, profile, getDoc, dispatch, isCoached, t],
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
      distanceUnit: profileDistanceUnit(bootstrap?.profile),
      profile,
      trainer: trainerLines,
      lookup,
      prior,
      olderBests,
      // A coached workout only knows the client's last exposure: no live PR badge from that.
      ...(isCoached && { noLivePr: true }),
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
        dispatch({ type: 'setRir', seId, rir });
        if (rir !== null) setRirPendingId((prev) => (prev === seId ? null : prev));
      },
      onRirDismiss: (seId) => setRirPendingId((prev) => (prev === seId ? null : prev)),
      onSkip: (seId, skipped) => dispatch({ type: 'skipExercise', seId, skipped }),
      onAddSet: (seId) => dispatch({ type: 'addSet', seId, newSetId: newId() }),
      onLayoutY: (seId, y) => {
        layoutY.current.set(seId, y);
        if (pendingScrollId.current === seId) scheduleScroll();
      },
      // T-42.3: "Log it" on a cardio entry — one completeSet carrying the
      // cardio fields instead of weightKg/reps (weightKg/reps stay 0/0).
      onLogCardio: (seId, setId, fields) =>
        dispatch({ type: 'completeSet', seId, setId, weightKg: 0, reps: 0, ...fields }),
    }),
    [
      unit,
      bootstrap?.profile,
      profile,
      trainerLines,
      lookup,
      prior,
      olderBests,
      handlers,
      openSheet,
      scheduleScroll,
      dispatch,
      isCoached,
    ],
  );

  // ── Finish / discard / minimise ────────────────────────────────────────────
  const doFinish = useCallback(
    async (carryOverExerciseIds?: string[]) => {
      closeSheet();
      setFinishing(true);
      try {
        const doc = await finish(carryOverExerciseIds);
        if (doc && coached) {
          // Stays "finishing" (no empty-state flash) while the coached screen moves on.
          coached.onFinished(doc);
          return;
        }
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
          noteWorkoutCompleted(); // store rating prompt: the 3rd workout is a trigger
          router.replace({ pathname: '/gym/summary/[id]', params: { id: doc.id } });
          return;
        }
      } catch {
        // The doc is enqueued before anything that can throw; fall through.
      }
      setFinishing(false);
    },
    [closeSheet, finish, coached],
  );

  // The names shown in the finish sheet's "N exercises not started" body and
  // carried through to `finish()` when the switch stays on (UX-36 (3)).
  const unstarted = useMemo(() => (session ? unstartedExercises(session) : []), [session]);

  const onFinishPress = useCallback(() => {
    if (coached?.onFinishPress) {
      coached.onFinishPress();
      return;
    }
    const doc = getDoc();
    if (!doc) return;
    const { done, planned } = workoutProgress(doc);
    if (done < planned || done === 0) {
      setMoveUnstarted(true);
      openSheet({ kind: 'finish' });
    } else void doFinish();
  }, [doFinish, openSheet, coached, getDoc]);

  const onFinishConfirm = useCallback(() => {
    const ids =
      moveUnstarted && session?.routineDayId ? unstarted.map((e) => e.exerciseId) : undefined;
    void doFinish(ids);
  }, [doFinish, moveUnstarted, session?.routineDayId, unstarted]);

  const onSaveForLater = useCallback(() => {
    closeSheet();
    saveForLater();
    leave();
  }, [closeSheet, saveForLater, leave]);

  const onDiscardConfirm = useCallback(() => {
    closeSheet();
    setFinishing(true);
    discard();
    leave();
  }, [closeSheet, discard, leave]);

  // Android hardware back: never drop out of a running workout by accident.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!getDoc()) return false;
        openSheet({ kind: 'minimise' });
        return true;
      });
      return () => sub.remove();
    }, [openSheet, getDoc]),
  );

  // ── Picker (swap / add) ────────────────────────────────────────────────────
  const onPick = useCallback(
    (picked: ExerciseDto) => {
      const request = sheetRef.current;
      closeSheet();
      const doc = getDoc();
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
      dispatch({
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
        setNotice(t('gym.workout.logger.routineNotice.updating'));
        void swapRoutine(se.routineExerciseId, picked.id, params).then((result) =>
          setNotice(routineNotice('swap', result)),
        );
      }
    },
    [closeSheet, swapRoutine, getDoc, dispatch, t],
  );

  // ── Supersets made in the workout (plan-library-supersets S2) ─────────────
  // Session-only by default (S-D2); "Also change my routine" saves the same
  // grouping to the routine through the swap's save path (online only).
  const onGroupSuperset = useCallback(
    (seIds: string[], alsoRoutine: boolean) => {
      closeSheet();
      const doc = getDoc();
      if (!doc) return;
      const { supersets: groups, bootstrap: cached } = live.current;
      const slotIds = alsoRoutine ? routineSlotsOf(doc, seIds, cached?.activeRoutine) : null;
      const derived = derivedSupersetGroups(doc, groups);
      dispatch({
        type: 'createSuperset',
        seIds,
        ...(derived ? { derivedGroups: derived } : {}),
      });
      haptics.success();
      if (slotIds) {
        setNotice(t('gym.workout.logger.routineNotice.updating'));
        void editRoutine((base) => routineWithSuperset(base, slotIds)).then((result) =>
          setNotice(routineNotice('superset', result)),
        );
      }
    },
    [closeSheet, editRoutine, getDoc, dispatch, t],
  );

  const applyUngroup = useCallback(
    (seId: string, alsoRoutine: boolean) => {
      closeSheet();
      const doc = getDoc();
      if (!doc) return;
      const { supersets: groups, bootstrap: cached } = live.current;
      const slot = groups.get(seId);
      const slotIds =
        alsoRoutine && slot ? routineSlotsOf(doc, slot.memberIds, cached?.activeRoutine) : null;
      const derived = derivedSupersetGroups(doc, groups);
      dispatch({
        type: 'ungroupSuperset',
        seId,
        ...(derived ? { derivedGroups: derived } : {}),
      });
      haptics.tick();
      const anchor = slotIds?.[0];
      if (anchor) {
        setNotice(t('gym.workout.logger.routineNotice.updating'));
        void editRoutine((base) => routineWithoutSuperset(base, anchor)).then((result) =>
          setNotice(routineNotice('ungroup', result)),
        );
      }
    },
    [closeSheet, editRoutine, getDoc, dispatch, t],
  );

  // Ungroup is immediate unless the routine has the same superset — then a
  // small sheet asks whether to change the routine too.
  const onUngroupPress = useCallback(
    (seId: string) => {
      const doc = getDoc();
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
    [applyUngroup, openSheet, getDoc],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        {finishing ? null : (
          <EmptyState
            testID="workout-empty"
            title={t('gym.workout.logger.screen.emptyTitle')}
            description={t('gym.workout.logger.screen.emptyBody')}
            action={{
              label: t('gym.workout.view.backToToday'),
              onPress: leave,
              testID: 'workout-empty-back',
            }}
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
  // Trainer mode M3: a coached swap is the client's today only — their routine is edited from client detail.
  const routineBlockedReason = isCoached
    ? COACHED_ROUTINE_REASON
    : !contentSe?.routineExerciseId
      ? t('gym.workout.logger.screen.notInRoutine')
      : !bootstrap?.activeRoutine
        ? t('gym.workout.logger.screen.noRoutine')
        : !online
          ? t('gym.workout.logger.screen.swapOffline')
          : null;
  // WP-04: a freestyle session (no routine) or an exercise outside the routine
  // has no "routine" to change, so Swap skips the scope page ("Just today").
  const swapAsksScope =
    !isCoached && session.routineId !== null && Boolean(contentSe?.routineExerciseId);
  const title = coached?.title ?? session.name;
  const unticked = planned - done;
  // Skipped exercises can't join a superset; ones added mid-workout can.
  const pickable = exercises.filter((se) => !se.skipped);

  return (
    <Screen
      className={shellV2 ? 'bg-canvas px-0' : 'px-0'}
      edges={shellV2 ? ['left', 'right'] : ['top', 'left', 'right']}
    >
      {shellV2 ? (
        <WorkoutHeader
          name={title}
          startedAt={session.startedAt}
          done={done}
          planned={planned}
          finishing={finishing}
          onMinimise={leave}
          onFinish={onFinishPress}
        />
      ) : (
        <View className="flex-row items-center gap-2 border-b border-separator px-2 pb-2 pt-1">
          <Pressable
            testID="workout-minimise"
            accessibilityRole="button"
            accessibilityLabel={t('gym.workout.logger.screen.minimiseA11y')}
            onPress={leave}
            className="h-11 w-11 items-center justify-center rounded-full bg-surface-sunken"
          >
            <Icon name="chevronDown" color={colors.label} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text
              testID="workout-title"
              numberOfLines={2}
              className="text-headline font-semibold text-label"
            >
              {title}
            </Text>
            <View className="flex-row items-center gap-2">
              <ElapsedTime startedAt={session.startedAt} testID="workout-elapsed" />
              <Text
                testID="workout-progress"
                accessibilityLabel={t('gym.workout.view.setsDoneAria', { done, planned })}
                className="text-subhead text-label-secondary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                · {t('gym.workout.exerciseCard.progress', { done, total: planned })}
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
            {t('gym.workout.view.finish')}
          </Button>
        </View>
      )}

      {coached?.accessory ?? null}

      {notice ? (
        <View className="bg-brand-tint px-4 py-2">
          <Text testID="workout-notice" className="text-subhead text-label">
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
          <Text className="px-2 py-6 text-center text-callout text-label-secondary">
            {t('gym.workout.logger.screen.emptyList')}
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
              <View className="h-4 w-1 rounded-full bg-brand" />
              <Text className="text-subhead font-semibold text-brand">
                {t('gym.workout.view.supersetHeading', { label: slot.label })}
              </Text>
              <Text className="min-w-0 flex-1 text-caption text-label-secondary" numberOfLines={2}>
                {t('gym.workout.view.supersetRest', { sec: restSec })}
              </Text>
              <Pressable
                testID={`superset-${slot.label}-ungroup`}
                accessibilityRole="button"
                accessibilityLabel={t('gym.workout.view.ungroupAria', { label: slot.label })}
                onPress={() => onUngroupPress(se.id)}
                className="min-h-11 justify-center px-2"
              >
                <Text className="text-subhead font-semibold text-brand">
                  {SUPERSET_COPY.ungroup}
                </Text>
              </Pressable>
            </View>,
            card,
          ];
        })}
        {shellV2 ? (
          <WorkoutActions
            addDisabled={isAtExerciseCap(exercises.length)}
            addReason={isAtExerciseCap(exercises.length) ? exerciseCapReason() : null}
            supersetDisabled={pickable.length < 2}
            supersetTitle={SUPERSET_COPY.title}
            onAdd={() => openSheet({ kind: 'picker', mode: 'add', seId: null, scope: 'today' })}
            onSuperset={() => openSheet({ kind: 'superset', seId: null })}
            onSaveForLater={onSaveForLater}
            onDiscard={() => openSheet({ kind: 'discard' })}
          />
        ) : (
          <>
            <Button
              testID="workout-add-exercise"
              variant="outline"
              size="lg"
              disabled={isAtExerciseCap(exercises.length)}
              onPress={() => openSheet({ kind: 'picker', mode: 'add', seId: null, scope: 'today' })}
            >
              {t('gym.workout.logger.screen.addExercisePlus')}
            </Button>
            {isAtExerciseCap(exercises.length) ? (
              <Text
                testID="workout-add-exercise-reason"
                className="text-center text-subhead text-label-secondary"
              >
                {exerciseCapReason()}
              </Text>
            ) : null}
            <Button
              testID="workout-superset"
              variant="outline"
              disabled={pickable.length < 2}
              accessibilityLabel={t('gym.shared.superset.title')}
              accessibilityHint={t('gym.workout.logger.screen.supersetA11yHint')}
              onPress={() => openSheet({ kind: 'superset', seId: null })}
            >
              <View className="flex-row items-center gap-1">
                <Icon name="link" size={18} color={colors.brand} />
                <Text className="text-callout font-semibold text-brand">{SUPERSET_COPY.title}</Text>
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
              {t('gym.workout.logger.screen.finishWorkout')}
            </Button>
            {/* UX-36 (3), T-36.3: bottom actions become Finish · Save for later ·
                Discard — a cut-short workout is never just finish-or-bin (CI-49). */}
            <Button testID="workout-save-for-later" variant="outline" onPress={onSaveForLater}>
              {t('gym.workout.logger.screen.saveForLater')}
            </Button>
            <Button
              testID="workout-discard"
              variant="ghost"
              onPress={() => openSheet({ kind: 'discard' })}
            >
              <Text className="text-callout font-semibold text-danger">
                {t('gym.workout.view.discardWorkout')}
              </Text>
            </Button>
          </>
        )}
      </ScrollView>

      <RestTimerBar onHeightChange={setRestBarHeight} />
      <LivePrBanner
        banner={livePrBanner.banner}
        bottom={restBarHeight + Math.max(insets.bottom, 12) + 8}
      />

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
            dispatch({
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
            dispatch({ type: 'removeExercise', seId: exercise.id });
            haptics.warning();
            snackbar.show({
              message: t('gym.workout.view.removedExercise', {
                name: contentMeta?.name ?? t('gym.workout.view.removedExerciseFallback'),
              }),
              actionLabel: t('gym.workout.view.undo'),
              durationMs: 8000,
              onAction: () => {
                dispatch({ type: 'restoreExercise', exercise, index: contentIndex });
              },
            });
          }
          closeSheet();
        }}
        onAddSet={() => {
          if (contentSe) dispatch({ type: 'addSet', seId: contentSe.id, newSetId: newId() });
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
            detail: slot ? t('gym.shared.superset.inSuperset', { label: slot.label }) : null,
          };
        })}
        initialKeys={content?.kind === 'superset' && content.seId ? [content.seId] : []}
        routineOption={{
          available: (keys) =>
            !isCoached && routineSlotsOf(session, keys, bootstrap?.activeRoutine) !== null,
          blockedReason: online ? null : ROUTINE_OFFLINE_REASON,
        }}
        onApply={onGroupSuperset}
      />
      <ConfirmSheet
        visible={active?.kind === 'ungroup'}
        onClose={closeSheet}
        testID="workout-ungroup-sheet"
        title={t('gym.workout.view.ungroupAria', {
          label: content?.kind === 'ungroup' ? content.label : '',
        })}
        body={
          online
            ? t('gym.workout.logger.screen.ungroupBody')
            : t('gym.workout.logger.screen.ungroupBodyOffline', {
                reason: ROUTINE_OFFLINE_REASON,
              })
        }
        options={
          online
            ? [
                {
                  label: SUPERSET_COPY.alsoRoutine,
                  detail: t('gym.workout.logger.screen.ungroupDetail'),
                  value: ungroupAlsoRoutine,
                  onChange: setUngroupAlsoRoutine,
                },
              ]
            : undefined
        }
        confirmLabel={SUPERSET_COPY.ungroup}
        cancelLabel={t('gym.workout.logger.screen.keepSuperset')}
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
          title={`${contentMeta.name} · ${
            content?.kind === 'reps'
              ? contentMeta.isTimed
                ? t('gym.workout.logger.setRow.stepperSeconds')
                : t('gym.workout.logger.setRow.stepperReps')
              : t('gym.workout.logger.setRow.stepperWeight')
          }`}
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
        title={
          content?.kind === 'picker' && content.mode === 'add'
            ? t('gym.workout.view.addExercise')
            : t('gym.workout.logger.screen.pickerSwap')
        }
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
            ? t('gym.workout.logger.screen.notStarted', { count: unstarted.length })
            : t('gym.workout.view.finishTitle')
        }
        body={
          unstarted.length > 0 && session.routineDayId
            ? unstarted.map((e) => lookup(e.exerciseId).name).join(', ')
            : done === 0
              ? t('gym.workout.logger.screen.noneLogged')
              : t('gym.workout.logger.screen.unticked', { count: unticked })
        }
        // UX-36 (3): "Move them to your next session" (T-36.3) — only offered
        // when whole exercises were never started AND it's a routine day
        // (freestyle sessions have no "next session" to carry into).
        options={
          unstarted.length > 0 && session.routineDayId
            ? [
                {
                  label: t('gym.workout.logger.screen.moveUnstarted'),
                  detail: t('gym.workout.logger.screen.moveUnstartedDetail'),
                  value: moveUnstarted,
                  onChange: setMoveUnstarted,
                },
              ]
            : undefined
        }
        confirmLabel={
          unstarted.length > 0 && session.routineDayId
            ? t('gym.workout.logger.screen.finishWorkout')
            : t('gym.workout.view.finishAnyway')
        }
        cancelLabel={t('gym.workout.view.keepGoing')}
        onConfirm={onFinishConfirm}
      />
      <ConfirmSheet
        visible={active?.kind === 'discard'}
        onClose={closeSheet}
        testID="workout-discard-sheet"
        title={t('gym.workout.view.discardTitle')}
        body={t('gym.workout.logger.screen.discardBody')}
        confirmLabel={t('gym.workout.view.discardWorkout')}
        cancelLabel={t('gym.workout.view.keepGoing')}
        destructive
        onConfirm={onDiscardConfirm}
      />
      <ConfirmSheet
        visible={active?.kind === 'minimise'}
        onClose={closeSheet}
        testID="workout-minimise-sheet"
        title={t('gym.workout.logger.screen.minimiseTitle')}
        body={t('gym.workout.logger.screen.minimiseBody')}
        confirmLabel={t('gym.workout.logger.screen.minimise')}
        cancelLabel={t('gym.workout.view.keepGoing')}
        onConfirm={() => {
          closeSheet();
          leave();
        }}
      />
    </Screen>
  );
}
