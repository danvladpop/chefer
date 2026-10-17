import { useId, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  LOGGED_WORKOUT_EXERCISE_IDS,
  LOGGED_WORKOUT_MAX_DURATION_MIN,
  LOGGED_WORKOUT_MAX_KCAL,
  WORKOUT_NAME_MAX_LENGTH,
  type GymBootstrap,
  type WorkoutType,
} from '@chefer/types';
import {
  Button,
  ChipGroup,
  DONE_FIELD_PROPS,
  FormField,
  haptics,
  Input,
  NumericReturnBar,
  Sheet,
  Text,
  useSnackbar,
} from '@chefer/ui-mobile';
import {
  buildLoggedWorkoutDoc,
  isNameableWorkoutType,
  loggedWorkoutMinDate,
  loggedWorkoutName,
  userFacingErrorMessage,
  validateLoggedWorkout,
  type LoggedWorkoutInput,
} from '@chefer/utils';
import { useFlags } from '../../../hooks/use-flags';
import { localDate, newId, nowIso } from '../offline/ids';
import { localInstant } from '../reminders/schedule';
import { WorkoutTypeChips } from '../simple/workout-type-chips';
import { saveLoggedSession } from '../use-active-workout';
import { libraryLookup } from '../use-gym-bootstrap';
import { EffortChips } from '../workout/effort-chips';
import { DateStepper } from '../workout/session-when-fields';
import { isCardioMeta } from '../workout/workout-model';

// "Log a workout" (simple training mode §6.2; was WP-20 "Log an activity"):
// a workout done earlier or elsewhere — "45 min yoga", "60 min upper body,
// 300 kcal" — recorded as DONE, in both training styles. One short form:
// which workout type, how long, (optionally) which day / name / watch kcal /
// effort. The common case is three taps: a type chip, a duration chip, Save.
// The strength focuses only show with the simple training flag on.
//
// It stores a finished gym session with one DURATION entry (+ `workoutType`)
// through the same offline outbox as any workout (`saveLoggedSession`), so it
// works offline and syncs like one. RECORD ONLY: the kcal is shown back in
// history and never reaches a food target, the planner or a rebalance.

/** Quick duration chips (minutes); the field next to them takes anything else. */
const DURATION_CHIPS = [15, 30, 45, 60, 90] as const;

/** A logged workout starts at this local time on its day (like a past-workout log). */
const LOGGED_WORKOUT_START_TIME = '18:00';

const DURATION_OPTIONS = DURATION_CHIPS.map((m) => ({
  value: m,
  label: `${m} min`,
  testID: `log-workout-duration-chip-${m}`,
}));

function digitsOnly(text: string, maxLength: number): string {
  return text.replace(/[^0-9]/g, '').slice(0, maxLength);
}

function numberOrUndefined(text: string): number | undefined {
  return text === '' ? undefined : Number(text);
}

export function LoggedWorkoutForm({
  bootstrap,
  onDone,
  initialType,
}: {
  bootstrap: GymBootstrap;
  onDone: () => void;
  /** Preselects a workout type (the chooser chip tapped, or today's planned type). */
  initialType?: WorkoutType | undefined;
}) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { simpleTraining } = useFlags();
  const barId = `log-workout-numeric-bar-${useId()}`;
  const today = localDate();

  const [workoutType, setWorkoutType] = useState<WorkoutType | undefined>(initialType);
  const [customName, setCustomName] = useState('');
  const [date, setDate] = useState(today);
  const [minutesText, setMinutesText] = useState('');
  const [kcalText, setKcalText] = useState('');
  const [effort, setEffort] = useState<number | undefined>(undefined);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  const minutes = numberOrUndefined(minutesText);
  const kcal = numberOrUndefined(kcalText);
  const nameable = workoutType !== undefined && isNameableWorkoutType(workoutType);
  const errors = validateLoggedWorkout({
    ...(workoutType !== undefined && { workoutType }),
    ...(nameable && { customName }),
    localDate: date,
    ...(minutes !== undefined && { durationMin: minutes }),
    ...(kcal !== undefined && { caloriesKcal: kcal }),
    ...(effort !== undefined && { effort }),
    today,
  });
  const shown = attempted ? errors : {};

  const onSave = async () => {
    if (saving) return;
    if (Object.keys(errors).length > 0 || !workoutType || minutes === undefined) {
      setAttempted(true);
      haptics.warning();
      return;
    }
    const input: LoggedWorkoutInput = {
      workoutType,
      ...(nameable && { customName }),
      localDate: date,
      durationMin: minutes,
      ...(kcal !== undefined && { caloriesKcal: kcal }),
      ...(effort !== undefined && { effort }),
    };
    const lookup = libraryLookup(bootstrap);
    const doc = buildLoggedWorkoutDoc({
      input,
      id: newId(),
      newId,
      startAt: localInstant(date, LOGGED_WORKOUT_START_TIME),
      now: nowIso(),
    });
    Keyboard.dismiss();
    setSaving(true);
    try {
      await saveLoggedSession(queryClient, doc, (id) => {
        const meta = lookup(id);
        return LOGGED_WORKOUT_EXERCISE_IDS.has(id) || (meta !== undefined && isCardioMeta(meta));
      });
      haptics.success();
      snackbar.show({ message: `${loggedWorkoutName(input)} logged`, tone: 'success' });
      onDone();
    } catch (error) {
      snackbar.show({ message: userFacingErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="gap-4" testID="log-workout-form">
      <FormField label="Workout type" required {...(shown.type && { error: shown.type })}>
        <WorkoutTypeChips
          testID="log-workout-type"
          value={workoutType}
          includeStrength={simpleTraining}
          onChange={(next) => {
            if (next) setWorkoutType(next);
          }}
        />
      </FormField>

      {nameable ? (
        <FormField label="Name (optional)" {...(shown.name && { error: shown.name })}>
          <Input
            testID="log-workout-name"
            accessibilityLabel="Workout name, optional"
            aria-invalid={shown.name !== undefined}
            value={customName}
            onChangeText={(text) => setCustomName(text.slice(0, WORKOUT_NAME_MAX_LENGTH))}
            placeholder="e.g. Rock climbing"
            {...DONE_FIELD_PROPS}
          />
        </FormField>
      ) : null}

      <FormField label="How long?" required {...(shown.duration && { error: shown.duration })}>
        <View className="gap-2">
          <ChipGroup
            testID="log-workout-duration-chips"
            options={DURATION_OPTIONS}
            value={minutes !== undefined ? [minutes] : []}
            allowEmpty
            onChange={(next) => setMinutesText(next[0] !== undefined ? String(next[0]) : '')}
          />
          <View className="flex-row items-center gap-2">
            <Input
              testID="log-workout-duration"
              accessibilityLabel="Duration in minutes"
              aria-invalid={shown.duration !== undefined}
              keyboardType="number-pad"
              inputAccessoryViewID={barId}
              {...DONE_FIELD_PROPS}
              value={minutesText}
              onChangeText={(text) => setMinutesText(digitsOnly(text, 3))}
              placeholder="Other"
              selectTextOnFocus
              className="w-24 text-center"
            />
            <Text variant="muted">{`min (up to ${LOGGED_WORKOUT_MAX_DURATION_MIN})`}</Text>
          </View>
        </View>
      </FormField>

      <DateStepper
        testID="log-workout"
        localDate={date}
        minDate={loggedWorkoutMinDate(today)}
        today={today}
        onChangeDate={setDate}
      />
      {shown.date ? <Text className="text-xs text-red-600">{shown.date}</Text> : null}

      <FormField
        label="Calories from your watch (optional)"
        hint="It's only recorded — it never changes your food targets."
        {...(shown.calories && { error: shown.calories })}
      >
        <View className="flex-row items-center gap-2">
          <Input
            testID="log-workout-kcal"
            accessibilityLabel="Calories from your watch, optional"
            aria-invalid={shown.calories !== undefined}
            keyboardType="number-pad"
            inputAccessoryViewID={barId}
            {...DONE_FIELD_PROPS}
            value={kcalText}
            onChangeText={(text) => setKcalText(digitsOnly(text, 4))}
            placeholder="400"
            selectTextOnFocus
            className="w-28 text-center"
          />
          <Text variant="muted">{`kcal (up to ${LOGGED_WORKOUT_MAX_KCAL})`}</Text>
        </View>
      </FormField>
      <NumericReturnBar
        nativeID={barId}
        testID="log-workout-numeric-bar"
        label="Done"
        onPress={() => Keyboard.dismiss()}
      />

      <FormField label="Effort (optional)" {...(shown.effort && { error: shown.effort })}>
        <EffortChips testID="log-workout-effort" value={effort} onChange={setEffort} />
      </FormField>

      <Button testID="log-workout-save" loading={saving} onPress={() => void onSave()}>
        Save workout
      </Button>
    </View>
  );
}

/** The "Log a workout" sheet on its own (old shell Gym Today, history header). */
export function LogWorkoutFormSheet({
  bootstrap,
  visible,
  onClose,
  initialType,
  openCount,
}: {
  bootstrap: GymBootstrap;
  visible: boolean;
  onClose: () => void;
  initialType?: WorkoutType | undefined;
  /** Bumped per opening: a fresh form every time, nothing from the last log lingers. */
  openCount: number;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Log a workout"
      eyebrow="Done elsewhere or earlier"
      testID="log-workout-form-sheet"
    >
      <LoggedWorkoutForm
        key={openCount}
        bootstrap={bootstrap}
        initialType={initialType}
        onDone={onClose}
      />
    </Sheet>
  );
}

/** The "Log a workout" link + its sheet (old shell Gym Today, history header). */
export function LogWorkoutAction({
  bootstrap,
  testID = 'gym-today-log-workout',
}: {
  bootstrap: GymBootstrap;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={() => {
          setOpenCount((n) => n + 1);
          setOpen(true);
        }}
        className="min-h-11 justify-center"
      >
        <Text className="text-sm font-medium text-primary">Log a workout</Text>
      </Pressable>
      <LogWorkoutFormSheet
        bootstrap={bootstrap}
        visible={open}
        onClose={() => setOpen(false)}
        openCount={openCount}
      />
    </>
  );
}
