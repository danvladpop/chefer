'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  ACTIVITY_MAX_DURATION_MIN,
  ACTIVITY_MAX_KCAL,
  ACTIVITY_NAME_MAX_LENGTH,
  ACTIVITY_PRESETS,
} from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import {
  activityMinDate,
  activitySessionName,
  buildActivityLogDoc,
  cn,
  EFFORT_CHIP_RPE,
  userFacingErrorMessage,
  validateActivityLog,
} from '@chefer/utils';
import { showGymToast } from '../shared/gym-toast';
import { localDate } from '../use-gym-bootstrap';
import { newId, nowIso } from '../workout/ids';
import { activityStartAt, saveActivityLog } from './log-activity';

// "Log an activity" (WP-20, owner decision 2026-10-04) — the web twin of
// apps/mobile/src/features/gym/today/log-activity-sheet.tsx. A class done
// elsewhere ("45 min cycling class, 400 kcal"), recorded as DONE: pick the
// activity, pick a duration, Save. RECORD ONLY: the kcal is shown back in
// history and never changes a food target.

const DURATION_CHIPS = [15, 30, 45, 60, 90] as const;
const EFFORT_OPTIONS = [
  { label: 'Easy', rpe: EFFORT_CHIP_RPE.Easy },
  { label: 'Moderate', rpe: EFFORT_CHIP_RPE.Moderate },
  { label: 'Hard', rpe: EFFORT_CHIP_RPE.Hard },
] as const;

const chip = (selected: boolean) =>
  cn(
    'inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium transition-colors',
    selected
      ? 'border-[#944a00] bg-[#944a00] text-white'
      : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50',
  );

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

function ActivityForm({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const today = localDate();
  const [presetKey, setPresetKey] = useState<string | undefined>(undefined);
  const [customName, setCustomName] = useState('');
  const [date, setDate] = useState(today);
  const [minutesText, setMinutesText] = useState('');
  const [kcalText, setKcalText] = useState('');
  const [effort, setEffort] = useState<number | undefined>(undefined);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  const minutes = numberOrUndefined(minutesText);
  const kcal = numberOrUndefined(kcalText);
  const errors = validateActivityLog({
    ...(presetKey !== undefined && { presetKey }),
    customName,
    localDate: date,
    ...(minutes !== undefined && { durationMin: minutes }),
    ...(kcal !== undefined && { caloriesKcal: kcal }),
    ...(effort !== undefined && { effort }),
    today,
  });
  const shown = attempted ? errors : {};

  const onSave = async () => {
    if (saving) return;
    if (Object.keys(errors).length > 0 || !presetKey || minutes === undefined) {
      setAttempted(true);
      return;
    }
    const input = {
      presetKey,
      customName,
      localDate: date,
      durationMin: minutes,
      ...(kcal !== undefined && { caloriesKcal: kcal }),
      ...(effort !== undefined && { effort }),
    };
    const doc = buildActivityLogDoc({
      input,
      id: newId(),
      newId,
      startAt: activityStartAt(date),
      now: nowIso(),
    });
    setSaving(true);
    try {
      await saveActivityLog(utils, doc);
      showGymToast({ message: `${activitySessionName(input)} logged` });
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
      data-testid="log-activity-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave();
      }}
    >
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-gray-900">What did you do?</legend>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-describedby="log-activity-activity-error"
        >
          {ACTIVITY_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={presetKey === p.key}
              data-testid={`log-activity-chip-${p.key}`}
              className={chip(presetKey === p.key)}
              onClick={() => setPresetKey(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <FieldError id="log-activity-activity-error" message={shown.activity} />
      </fieldset>

      {presetKey === 'other' && (
        <div>
          <label
            htmlFor="log-activity-name"
            className="mb-1.5 block text-sm font-medium text-gray-900"
          >
            Activity name
          </label>
          <input
            id="log-activity-name"
            data-testid="log-activity-name"
            className={fieldClass}
            value={customName}
            maxLength={ACTIVITY_NAME_MAX_LENGTH}
            placeholder="e.g. Rock climbing"
            aria-invalid={shown.name !== undefined}
            aria-describedby={shown.name ? 'log-activity-name-error' : undefined}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <FieldError id="log-activity-name-error" message={shown.name} />
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
              data-testid={`log-activity-duration-chip-${m}`}
              className={chip(minutes === m)}
              onClick={() => setMinutesText(minutes === m ? '' : String(m))}
            >
              {m} min
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="log-activity-duration" className="sr-only">
            Duration in minutes
          </label>
          <input
            id="log-activity-duration"
            data-testid="log-activity-duration"
            className={cn(fieldClass, 'w-24 text-center')}
            inputMode="numeric"
            placeholder="Other"
            value={minutesText}
            aria-invalid={shown.duration !== undefined}
            aria-describedby={shown.duration ? 'log-activity-duration-error' : undefined}
            onChange={(e) => setMinutesText(digitsOnly(e.target.value, 3))}
          />
          <span className="text-sm text-gray-500">min (up to {ACTIVITY_MAX_DURATION_MIN})</span>
        </div>
        <FieldError id="log-activity-duration-error" message={shown.duration} />
      </fieldset>

      <div>
        <label
          htmlFor="log-activity-date"
          className="mb-1.5 block text-sm font-medium text-gray-900"
        >
          Date
        </label>
        <input
          id="log-activity-date"
          data-testid="log-activity-date"
          type="date"
          className={fieldClass}
          value={date}
          min={activityMinDate(today)}
          max={today}
          aria-invalid={shown.date !== undefined}
          aria-describedby={shown.date ? 'log-activity-date-error' : undefined}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        <FieldError id="log-activity-date-error" message={shown.date} />
      </div>

      <div>
        <label
          htmlFor="log-activity-kcal"
          className="mb-1.5 block text-sm font-medium text-gray-900"
        >
          Calories burnt (optional)
        </label>
        <div className="flex items-center gap-2">
          <input
            id="log-activity-kcal"
            data-testid="log-activity-kcal"
            className={cn(fieldClass, 'w-28 text-center')}
            inputMode="numeric"
            placeholder="400"
            value={kcalText}
            aria-invalid={shown.calories !== undefined}
            aria-describedby="log-activity-kcal-hint"
            onChange={(e) => setKcalText(digitsOnly(e.target.value, 4))}
          />
          <span className="text-sm text-gray-500">kcal (up to {ACTIVITY_MAX_KCAL})</span>
        </div>
        <p id="log-activity-kcal-hint" className="mt-1 text-xs text-gray-500">
          From your watch or the machine. It&apos;s only recorded — it never changes your food
          targets.
        </p>
        <FieldError id="log-activity-kcal-error" message={shown.calories} />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-gray-900">Effort (optional)</legend>
        <div className="flex flex-wrap gap-2" role="group">
          {EFFORT_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={effort === o.rpe}
              data-testid={`log-activity-effort-${o.label.toLowerCase()}`}
              className={chip(effort === o.rpe)}
              onClick={() => setEffort(effort === o.rpe ? undefined : o.rpe)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <Button type="submit" className="w-full" disabled={saving} data-testid="log-activity-save">
        Save activity
      </Button>
    </form>
  );
}

export function LogActivitySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log an activity"
      description="A class or session you did somewhere else."
      size="sm"
    >
      <ActivityForm onDone={onClose} />
    </Sheet>
  );
}
