import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect } from 'expo-router';
import type { ExerciseDto, Rir } from '@chefer/types';
import { Button, ConfirmSheet, EmptyState, Screen, Text } from '@chefer/ui-mobile';
import { sameKg } from '@chefer/utils';
import { ExercisePicker } from '../library/exercise-picker';
import { localDate, newId } from '../offline/ids';
import { dispatchWorkout, getResumableSession, useActiveWorkout } from '../use-active-workout';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { ExerciseCard, type WorkoutContext, type WorkoutSheetRequest } from './exercise-card';
import { rememberFinished } from './finished-store';
import { hapticPr, hapticTick } from './haptics';
import { NumberSheet } from './number-sheet';
import { ElapsedTime, RestTimerBar } from './rest-timer-bar';
import type { SetRowHandlers } from './set-row';
import { useIsOnline } from './use-is-online';
import { ROUTINE_SWAP_NOTICE, useRoutineSwap } from './use-routine-swap';
import {
  byPosition,
  currentExerciseId,
  defaultSlotParams,
  equipmentOf,
  exerciseHistory,
  fallbackMeta,
  isFirstForPattern,
  livePr,
  prescribeFor,
  priorSessions,
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
  | { kind: 'minimise' };

/** iOS can't present a Modal while another is still dismissing. */
const SHEET_SWAP_DELAY_MS = 380;
const SCROLL_SETTLE_MS = 120;
const NOTICE_MS = 5000;
const KEEP_AWAKE_TAG = 'gym-workout';

function leaveWorkout(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/today');
}

export function WorkoutScreen() {
  const { session, finish, discard } = useActiveWorkout();
  const { data: bootstrap } = useGymBootstrap();
  const online = useIsOnline();
  const swapRoutine = useRoutineSwap();
  const [finishing, setFinishing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const isActive = session !== null;
  const sessionId = session?.id ?? null;

  // ── Keep the screen on while a workout runs ────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [isActive]);

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
  const live = useRef({ prior, lookup, profile, bootstrap });
  useEffect(() => {
    live.current = { prior, lookup, profile, bootstrap };
  }, [prior, lookup, profile, bootstrap]);

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
        const before = set.isWarmup ? null : livePr(se, live.current.prior);
        const next = dispatchWorkout({
          type: 'completeSet',
          seId,
          setId,
          weightKg: set.weightKg,
          reps: set.reps,
        });
        const after = next?.exercises.find((e) => e.id === seId);
        const finishedExercise =
          after !== undefined &&
          !set.isWarmup &&
          after.lastSetRir === null &&
          workingSets(after).every((s) => s.completedAt !== null);
        setRirPendingId((prev) => (finishedExercise ? seId : prev === seId ? prev : null));
        const pr = after && !set.isWarmup ? livePr(after, live.current.prior) : null;
        if (pr?.setId === setId && before?.kind !== pr.kind) hapticPr();
        else hapticTick();
      },
      onWeight: (seId, setId, kg) => {
        const se = getResumableSession()?.exercises.find((e) => e.id === seId);
        const set = se?.sets.find((s) => s.id === setId);
        if (!se || !set) return;
        const old = set.weightKg;
        dispatchWorkout({ type: 'editSet', seId, setId, weightKg: kg });
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
      onReps: (seId, setId, reps) => {
        dispatchWorkout({ type: 'editSet', seId, setId, reps });
      },
      onOpenWeight: (seId, setId) => openSheet({ kind: 'weight', seId, setId }),
      onOpenReps: (seId, setId) => openSheet({ kind: 'reps', seId, setId }),
    }),
    [openSheet],
  );

  // ── Expansion + auto-scroll to the current exercise ────────────────────────
  const currentId = session ? currentExerciseId(session) : null;
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
    if (rirPendingRef.current !== null) return;
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

  const ctx = useMemo<WorkoutContext>(
    () => ({
      unit,
      profile,
      lookup,
      prior,
      handlers,
      onSheet: openSheet,
      onToggle: (seId) =>
        setExpandOverride((prev) => ({
          ...prev,
          [seId]: !(
            prev[seId] ??
            (seId === currentIdRef.current || seId === rirPendingRef.current)
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
    }),
    [unit, profile, lookup, prior, handlers, openSheet, scheduleScroll],
  );

  // ── Finish / discard / minimise ────────────────────────────────────────────
  const doFinish = useCallback(async () => {
    closeSheet();
    setFinishing(true);
    try {
      const doc = await finish();
      if (doc) {
        rememberFinished(doc);
        router.replace({ pathname: '/gym/summary/[id]', params: { id: doc.id } });
        return;
      }
    } catch {
      // The doc is enqueued before anything that can throw; fall through.
    }
    setFinishing(false);
  }, [closeSheet, finish]);

  const onFinishPress = useCallback(() => {
    const doc = getResumableSession();
    if (!doc) return;
    const { done, planned } = workoutProgress(doc);
    if (done < planned || done === 0) openSheet({ kind: 'finish' });
    else void doFinish();
  }, [doFinish, openSheet]);

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
  const unticked = planned - done;

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
          <Text testID="workout-title" numberOfLines={1} className="text-base font-semibold">
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
        <Button testID="workout-finish" onPress={onFinishPress} loading={finishing}>
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
        contentContainerStyle={{ paddingBottom: 160 }}
      >
        {exercises.length === 0 ? (
          <Text variant="muted" className="px-2 py-6 text-center">
            Add your first exercise to get going.
          </Text>
        ) : null}
        {exercises.map((se, index) => (
          <ExerciseCard
            key={se.id}
            exercise={se}
            index={index}
            isCurrent={se.id === currentId}
            expanded={
              !se.skipped &&
              (expandOverride[se.id] ?? (se.id === currentId || se.id === rirPendingId))
            }
            ctx={ctx}
          />
        ))}
        <Button
          testID="workout-add-exercise"
          variant="outline"
          size="lg"
          onPress={() => openSheet({ kind: 'picker', mode: 'add', seId: null, scope: 'today' })}
        >
          + Add exercise
        </Button>
        <Button
          testID="workout-discard"
          variant="ghost"
          onPress={() => openSheet({ kind: 'discard' })}
        >
          <Text className="text-sm font-medium text-destructive">Discard workout</Text>
        </Button>
      </ScrollView>

      <RestTimerBar />

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
        history={contentSe ? exerciseHistory(contentSe.exerciseId, prior, 5) : []}
        unit={unit}
        loadType={contentMeta?.loadType ?? 'WEIGHTED'}
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
        onAddSet={() => {
          if (contentSe) dispatchWorkout({ type: 'addSet', seId: contentSe.id, newSetId: newId() });
          closeSheet();
        }}
        onRemoveSet={() => {
          const target = contentSe
            ? [...byPosition(contentSe.sets)]
                .reverse()
                .find((s) => s.completedAt === null && !s.isWarmup)
            : undefined;
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
          profile={profile}
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
        testID="workout-picker"
      />
      <ConfirmSheet
        visible={active?.kind === 'finish'}
        onClose={closeSheet}
        testID="workout-finish-sheet"
        title="Finish workout?"
        body={
          done === 0
            ? 'You haven’t logged any sets yet. Only ticked sets count.'
            : `${unticked} ${unticked === 1 ? 'set isn’t' : 'sets aren’t'} ticked. Only ticked sets count.`
        }
        confirmLabel="Finish anyway"
        cancelLabel="Keep going"
        onConfirm={() => void doFinish()}
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
