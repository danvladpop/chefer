'use client';

import { useState } from 'react';
import { useFlags } from '@/features/flags/use-flags';
import { trpc } from '@/lib/trpc';
import {
  LOGGED_WORKOUT_MAX_DURATION_MIN,
  LOGGED_WORKOUT_MAX_KCAL,
  WORKOUT_NAME_MAX_LENGTH,
  type WorkoutType,
} from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import {
  buildLoggedWorkoutDoc,
  cn,
  EFFORT_CHIP_RPE,
  isNameableWorkoutType,
  loggedWorkoutMinDate,
  loggedWorkoutName,
  userFacingErrorMessage,
  validateLoggedWorkout,
  workoutTypeOptions,
  type LoggedWorkoutInput,
} from '@chefer/utils';
import { showGymToast } from '../shared/gym-toast';
import { typeChipClass, WorkoutTypeChips } from '../shared/workout-type-sheet';
import { localDate } from '../use-gym-bootstrap';
import { newId, nowIso } from '../workout/ids';
import { loggedWorkoutStartAt, saveLoggedWorkout } from './log-workout';

// "Log a workout" (simple training mode §6.2, unifying WP-20) — the web twin
// of the phone's log sheet, one sheet in both training styles. A workout done
// earlier or elsewhere ("45 min yoga", "60 min upper body, 300 kcal"),
// recorded as DONE: pick the type, pick a duration, Save. The strength types
// show only while the `simpleTraining` flag is on. RECORD ONLY: the kcal is
// shown back in history and never changes a food target.

const DURATION_CHIPS = [15, 30, 45, 60, 90] as const;
const EFFORT_OPTIONS = [
  { label: 'Easy', rpe: EFFORT_CHIP_RPE.Easy },
  { label: 'Moderate', rpe: EFFORT_CHIP_RPE.Moderate },
  { label: 'Hard', rpe: EFFORT_CHIP_RPE.Hard },
] as const;

const fieldClass =
  'h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#944a00]/40';

const digitsOnly = (text: string, maxLength: number) =>
  text.replace(/[^0-9]/g, '').slice(0, maxLength);
const numberOrUndefined = (text: string) => (text === '' ? undefined : Number(text));

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="mt-1 text-xs text-red-600" data-testid={id}>
      {message}
    </p>
  ) : null;
}

function LogWorkoutForm({
  initialType,
  onDone,
}: {
  initialType: WorkoutType | null;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const flags = useFlags();
  const options = workoutTypeOptions({ includeStrength: flags.simpleTraining === true });
  const today = localDate();
  const [workoutType, setWorkoutType] = useState<WorkoutType | undefined>(
    initialType && options.some((o) => o.type === initialType) ? initialType : undefined,
  );
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
    const doc = buildLoggedWorkoutDoc({
      input,
      id: newId(),
      newId,
      startAt: loggedWorkoutStartAt(date),
      now: nowIso(),
    });
    setSaving(true);
    try {
      await saveLoggedWorkout(utils, doc);
      showGymToast({ message: `${loggedWorkoutName(input)} logged` });
      onDone();
    } catch (error) {
      showGymToast({ message: userFacingErrorMessage(error), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-5 px-5 pb-5"
      data-testid="log-workout-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave();
      }}
    >
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-gray-900">Workout type</legend>
        <WorkoutTypeChips
          options={options}
          value={workoutType}
          onChange={(type) => type && setWorkoutType(type)}
          testIdPrefix="log-workout-chip"
          describedBy={shown.type ? 'log-workout-type-error' : undefined}
        />
        <FieldError id="log-workout-type-error" message={shown.type} />
      </fieldset>

      {nameable && (
        <div>
          <label
            htmlFor="log-workout-name"
            className="mb-1.5 block text-sm font-medium text-gray-900"
          >
            Name (optional)
          </label>
          <input
            id="log-workout-name"
            data-testid="log-workout-name"
            className={fieldClass}
            value={customName}
            maxLength={WORKOUT_NAME_MAX_LENGTH}
            placeholder="e.g. Rock climbing"
            aria-invalid={shown.name !== undefined}
            aria-describedby={shown.name ? 'log-workout-name-error' : undefined}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <FieldError id="log-workout-name-error" message={shown.name} />
        </div>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-gray-900">How long?</legend>
        <div className="mb-2 flex flex-wrap gap-2" role="group">
          {DURATION_CHIPS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              data-testid={`log-workout-duration-chip-${m}`}
              className={typeChipClass(minutes === m)}
              onClick={() => setMinutesText(minutes === m ? '' : String(m))}
            >
              {m} min
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="log-workout-duration" className="sr-only">
            Duration in minutes
          </label>
          <input
            id="log-workout-duration"
            data-testid="log-workout-duration"
            className={cn(fieldClass, 'w-24 text-center')}
            inputMode="numeric"
            placeholder="Other"
            value={minutesText}
            aria-invalid={shown.duration !== undefined}
            aria-describedby={shown.duration ? 'log-workout-duration-error' : undefined}
            onChange={(e) => setMinutesText(digitsOnly(e.target.value, 3))}
          />
          <span className="text-sm text-gray-500">
            min (up to {LOGGED_WORKOUT_MAX_DURATION_MIN})
          </span>
        </div>
        <FieldError id="log-workout-duration-error" message={shown.duration} />
      </fieldset>

      <div>
        <label
          htmlFor="log-workout-date"
          className="mb-1.5 block text-sm font-medium text-gray-900"
        >
          Date
        </label>
        <input
          id="log-workout-date"
          data-testid="log-workout-date"
          type="date"
          className={fieldClass}
          value={date}
          min={loggedWorkoutMinDate(today)}
          max={today}
          aria-invalid={shown.date !== undefined}
          aria-describedby={shown.date ? 'log-workout-date-error' : undefined}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        <FieldError id="log-workout-date-error" message={shown.date} />
      </div>

      <div>
        <label
          htmlFor="log-workout-kcal"
          className="mb-1.5 block text-sm font-medium text-gray-900"
        >
          Calories from your watch (optional)
        </label>
        <div className="flex items-center gap-2">
          <input
            id="log-workout-kcal"
            data-testid="log-workout-kcal"
            className={cn(fieldClass, 'w-28 text-center')}
            inputMode="numeric"
            placeholder="400"
            value={kcalText}
            aria-invalid={shown.calories !== undefined}
            aria-describedby={
              shown.calories
                ? 'log-workout-kcal-hint log-workout-kcal-error'
                : 'log-workout-kcal-hint'
            }
            onChange={(e) => setKcalText(digitsOnly(e.target.value, 4))}
          />
          <span className="text-sm text-gray-500">kcal (up to {LOGGED_WORKOUT_MAX_KCAL})</span>
        </div>
        <p id="log-workout-kcal-hint" className="mt-1 text-xs text-gray-500">
          Your watch&apos;s number wins over our estimate. It&apos;s only recorded — it never
          changes your food targets.
        </p>
        <FieldError id="log-workout-kcal-error" message={shown.calories} />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-gray-900">Effort (optional)</legend>
        <div className="flex flex-wrap gap-2" role="group">
          {EFFORT_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={effort === o.rpe}
              data-testid={`log-workout-effort-${o.label.toLowerCase()}`}
              className={typeChipClass(effort === o.rpe)}
              onClick={() => setEffort(effort === o.rpe ? undefined : o.rpe)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <Button type="submit" className="w-full" disabled={saving} data-testid="log-workout-save">
        Save workout
      </Button>
    </form>
  );
}

export function LogWorkoutSheet({
  open,
  onClose,
  initialType = null,
}: {
  open: boolean;
  onClose: () => void;
  /** Preselected type, e.g. today's planned one from My week. */
  initialType?: WorkoutType | null;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log a workout"
      description="A workout you did earlier or somewhere else."
      size="sm"
    >
      <LogWorkoutForm key={initialType ?? 'none'} initialType={initialType} onDone={onClose} />
    </Sheet>
  );
}
