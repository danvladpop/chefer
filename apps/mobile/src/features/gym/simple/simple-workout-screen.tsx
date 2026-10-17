import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, ScrollView, View } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect } from 'expo-router';
import type { ExerciseDto } from '@chefer/types';
import {
  ConfirmSheet,
  haptics,
  IconButton,
  PressableScale,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { cn, workoutTypeLabel } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useFlags } from '../../../hooks/use-flags';
import { TrainButton } from '../../shell/train/train-button';
import { captureGymEvent } from '../analytics';
import { openCreateExercise } from '../library/create-exercise-href';
import { ExercisePicker } from '../library/exercise-picker';
import { localDate, newId, nowIso } from '../offline/ids';
import { dispatchWorkout, getResumableSession, useActiveWorkout } from '../use-active-workout';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { EXERCISE_CAP_REASON, isAtExerciseCap } from '../workout/caps';
import { rememberFinished } from '../workout/finished-store';
import { ElapsedTime } from '../workout/rest-timer-bar';
import {
  byPosition,
  defaultSlotParams,
  equipmentOf,
  fallbackMeta,
  isFirstForPattern,
  prescribeFor,
} from '../workout/workout-model';
import { isExerciseTicked, liveKcalSoFar } from './simple-helpers';

// "Keep it simple" live workout (simple training mode §6.4): the workout type
// and a running clock, "~kcal so far", and an OPTIONAL exercise list with one
// Done tick each (`tickExercise` — ticked as planned, so progression never
// learns from it). Finish works with zero exercises: one tap to start, one to
// finish. No sets grid, RIR, warm-ups, rest timer, plate maths, supersets or
// progression messages in phase 1.

const KEEP_AWAKE_TAG = 'gym-workout';
/** The kcal line refreshes on this beat (the clock ticks on its own). */
const KCAL_REFRESH_MS = 30_000;

function leaveWorkout(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/today');
}

export function SimpleWorkoutScreen() {
  const colors = useThemeColors();
  const { session, finish, discard } = useActiveWorkout();
  const { data: bootstrap } = useGymBootstrap();
  const { cardioLogging } = useFlags();
  const [finishing, setFinishing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [now, setNow] = useState(() => nowIso());
  const isActive = session !== null;

  useEffect(() => {
    if (!isActive) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    const id = setInterval(() => setNow(nowIso()), KCAL_REFRESH_MS);
    return () => {
      clearInterval(id);
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [isActive]);

  // Android back: the workout keeps running (Resume from Train / Today).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!getResumableSession()) return false;
        leaveWorkout();
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  const lookup = useMemo(() => {
    const byId = new Map<string, ExerciseDto>((bootstrap?.library ?? []).map((e) => [e.id, e]));
    return (id: string): ExerciseDto => byId.get(id) ?? fallbackMeta(id);
  }, [bootstrap?.library]);

  if (!session) {
    // Finished or discarded: the summary (or the previous screen) is on its way.
    return <Screen className="bg-canvas" testID="simple-workout-closing" />;
  }

  const typeLabel = session.workoutType ? workoutTypeLabel(session.workoutType) : session.name;
  const exercises = byPosition(session.exercises);
  const kcal = liveKcalSoFar(session, now, bootstrap?.bodyweightKg);
  const atCap = isAtExerciseCap(exercises.length);

  const onFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const doc = await finish();
      if (doc) {
        haptics.success();
        captureGymEvent('workout_finished', {
          durationMin: Math.round(
            (Date.parse(doc.finishedAt ?? doc.startedAt) - Date.parse(doc.startedAt)) / 60000,
          ),
          sets: doc.exercises.reduce(
            (n, se) => n + (se.skipped ? 0 : se.sets.filter((s) => s.completedAt).length),
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
  };

  const onPick = (picked: ExerciseDto) => {
    setPickerOpen(false);
    const doc = getResumableSession();
    if (!doc) return;
    const params = defaultSlotParams(picked);
    const position = doc.exercises.length;
    const { prescription } = prescribeFor({
      meta: picked,
      params,
      bootstrap,
      profile: equipmentOf(bootstrap),
      today: localDate(),
      isDeload: doc.isDeload,
      isFirstForPattern: isFirstForPattern(doc, picked, position, lookup),
    });
    // No warm-ups in simple mode: the exercise is one Done tick.
    dispatchWorkout({
      type: 'addExercise',
      newSeId: newId(),
      exerciseId: picked.id,
      repMin: params.repMin,
      repMax: params.repMax,
      targetRir: params.targetRir,
      restSec: params.restSec,
      prescription,
      warmups: [],
      newSetIds: Array.from({ length: prescription.sets }, () => newId()),
    });
  };

  return (
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      <View className="flex-row items-center gap-2 px-4 pt-2">
        <IconButton
          testID="simple-workout-minimise"
          accessibilityLabel="Minimise workout"
          accessibilityHint="Your workout keeps running. Resume it from Train."
          icon={<Icon name="chevronDown" color={colors.brand} size={26} />}
          onPress={leaveWorkout}
          className="-ml-2"
        />
        <View className="min-w-0 flex-1">
          <Text
            testID="simple-workout-title"
            accessibilityRole="header"
            numberOfLines={1}
            className="text-title2 font-bold text-label"
          >
            {typeLabel}
          </Text>
          <View className="flex-row items-center gap-2">
            <ElapsedTime startedAt={session.startedAt} testID="simple-workout-elapsed" />
            {kcal !== null ? (
              <Text testID="simple-workout-kcal" className="text-subhead text-label-secondary">
                {`· ~${kcal} kcal so far`}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView testID="simple-workout-scroll" contentContainerClassName="gap-4 px-4 pb-8 pt-4">
        {session.name !== typeLabel ? (
          <Text className="text-subhead text-label-secondary">{session.name}</Text>
        ) : null}

        <View className="gap-2" testID="simple-workout-exercises">
          <Text accessibilityRole="header" className="text-headline font-semibold text-label">
            Exercises (optional)
          </Text>
          {exercises.length === 0 ? (
            <Text className="text-subhead text-label-secondary">
              Add what you do as you go, or just finish when you’re done.
            </Text>
          ) : null}
          {exercises.map((se) => {
            const name = lookup(se.exerciseId).name;
            const done = isExerciseTicked(se);
            return (
              <View
                key={se.id}
                testID={`simple-workout-exercise-${se.id}`}
                className="min-h-14 flex-row items-center gap-2 rounded-card border border-separator bg-surface pl-1 pr-2"
              >
                {/* MO-01 press feedback; the whole 44pt square is the target. */}
                <PressableScale
                  testID={`simple-workout-tick-${se.id}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={`${name} done`}
                  onPress={() => {
                    haptics.selection();
                    dispatchWorkout({ type: 'tickExercise', seId: se.id, done: !done });
                  }}
                  className="h-11 w-11 items-center justify-center"
                >
                  <View
                    className={cn(
                      'h-7 w-7 items-center justify-center rounded-full',
                      done ? 'bg-brand' : 'border-2 border-separator bg-surface',
                    )}
                  >
                    {done ? <Icon name="checkmark" color={colors.onBrand} size={18} /> : null}
                  </View>
                </PressableScale>
                <Text
                  numberOfLines={2}
                  className={cn(
                    'min-w-0 flex-1 text-body',
                    done ? 'text-label-secondary' : 'text-label',
                  )}
                >
                  {name}
                </Text>
                <IconButton
                  testID={`simple-workout-remove-${se.id}`}
                  accessibilityLabel={`Remove ${name}`}
                  icon={<Icon name="close" color={colors.labelSecondary} size={20} />}
                  onPress={() => dispatchWorkout({ type: 'removeExercise', seId: se.id })}
                />
              </View>
            );
          })}
          <TrainButton
            testID="simple-workout-add-exercise"
            label="Add exercise"
            icon="add"
            variant="outline"
            disabled={atCap}
            onPress={() => setPickerOpen(true)}
          />
          {atCap ? (
            <Text className="text-center text-subhead text-label-secondary">
              {EXERCISE_CAP_REASON}
            </Text>
          ) : null}
        </View>

        <View className="gap-2 pt-2">
          <TrainButton
            testID="simple-workout-finish"
            label="Finish workout"
            icon="checkmark"
            size="lg"
            loading={finishing}
            onPress={() => void onFinish()}
          />
          <TrainButton
            testID="simple-workout-discard"
            label="Discard workout"
            variant="danger"
            onPress={() => setDiscardOpen(true)}
          />
        </View>
      </ScrollView>

      <ExercisePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onPick}
        library={bootstrap?.library ?? []}
        title="Add exercise"
        excludeIds={exercises.map((e) => e.exerciseId)}
        showCardioFilter={cardioLogging}
        onCreateFromSearch={openCreateExercise}
        testID="simple-workout-picker"
      />
      <ConfirmSheet
        visible={discardOpen}
        onClose={() => setDiscardOpen(false)}
        testID="simple-workout-discard-sheet"
        title="Discard this workout?"
        body="It won’t be saved or count toward your week. This can’t be undone."
        confirmLabel="Discard workout"
        cancelLabel="Keep going"
        destructive
        onConfirm={() => {
          setDiscardOpen(false);
          setFinishing(true);
          discard();
          leaveWorkout();
        }}
      />
    </Screen>
  );
}
