'use client';

import { useState } from 'react';
import { ACTIVITY_OPTIONS } from '@/features/onboarding/components/step-metrics';
import type { ActivityLevel, BiologicalSex } from '@/features/onboarding/types';
import {
  bodyMetricsAgeError,
  bodyMetricsHeightError,
  bodyMetricsWeightError,
  type BodyUnits,
} from '@chefer/types';
import { pressControl, Sheet } from '@chefer/ui';
import {
  bodyFieldTexts,
  cn,
  heightCmFromText,
  ONBOARDING_V4_COPY,
  parseBodyNumber,
  weightKgFromText,
} from '@chefer/utils';
import { BiscuitHalo, V4Heading } from './ui';

// ─── About you (OnbV4AboutYou) ─────────────────────────────────────────────────
// Sex, age, height, weight in the user's units (typed as text and stored as
// cm / kg with the shared body-input helpers, like the current wizard), the
// training days when Train was picked, and the live daily target. "Change"
// picks the activity level explicitly; otherwise it is inferred from the
// training days (activityFromTrainingDays).

export interface AboutYouValue {
  biologicalSex: BiologicalSex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
}

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** The step's own validation: an out-of-range value blocks Continue until fixed or cleared. */
export function aboutYouErrors(value: AboutYouValue, units: BodyUnits) {
  return {
    age: bodyMetricsAgeError(value.age),
    height: bodyMetricsHeightError(value.heightCm, units),
    weight: bodyMetricsWeightError(value.weightKg, units),
  };
}

const fieldCls =
  'flex min-h-12 items-center gap-1 rounded-control border border-revamp-separator bg-revamp-surface px-3 focus-within:ring-2 focus-within:ring-ring';
const inputCls =
  'w-full min-w-0 flex-1 border-none bg-transparent p-0 text-xl font-semibold text-revamp-label outline-none';
const unitCls = 'text-sm text-revamp-label-tertiary';
const labelCls = 'text-sm font-semibold text-revamp-label-secondary';

export function StepAboutYou({
  units,
  value,
  onChange,
  showTrainingDays,
  weekdays,
  onWeekdaysChange,
  activity,
  onActivityChange,
  targetKcal,
  showTarget,
}: {
  units: BodyUnits;
  value: AboutYouValue;
  onChange: (value: AboutYouValue) => void;
  showTrainingDays: boolean;
  weekdays: number[];
  onWeekdaysChange: (weekdays: number[]) => void;
  /** The effective level (explicit pick, else inferred from training days). */
  activity: ActivityLevel;
  onActivityChange: (activity: ActivityLevel) => void;
  targetKcal: number | null;
  /** "Just good food" shows no numbers. */
  showTarget: boolean;
}) {
  const initial = bodyFieldTexts(value, units);
  const [ageText, setAgeText] = useState(value.age === null ? '' : String(value.age));
  const [heightText, setHeightText] = useState(initial.heightText);
  const [inchesText, setInchesText] = useState(initial.inchesText);
  const [weightText, setWeightText] = useState(initial.weightText);
  const [activityOpen, setActivityOpen] = useState(false);

  const errors = aboutYouErrors(value, units);
  const imperial = units === 'IMPERIAL';

  function setAge(raw: string) {
    setAgeText(raw);
    const n = parseBodyNumber(raw);
    onChange({ ...value, age: n === null ? null : Math.round(n) });
  }
  function setHeight(primary: string, inches: string) {
    setHeightText(primary);
    setInchesText(inches);
    onChange({ ...value, heightCm: heightCmFromText(primary, inches, units) });
  }
  function setWeight(raw: string) {
    setWeightText(raw);
    onChange({ ...value, weightKg: weightKgFromText(raw, units) });
  }

  const describedBy = (field: 'age' | 'height' | 'weight') =>
    errors[field] !== null ? `v4-${field}-error` : undefined;

  return (
    <div className="flex flex-col gap-4">
      <BiscuitHalo loop="scale" size={120} />
      <V4Heading title={ONBOARDING_V4_COPY.aboutTitle} />

      <div
        role="radiogroup"
        aria-label="Sex"
        className="flex rounded-control bg-revamp-surface-sunken p-[3px]"
      >
        {(['FEMALE', 'MALE'] as const).map((sex) => {
          const on = value.biologicalSex === sex;
          return (
            <button
              key={sex}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`v4-sex-${sex}`}
              onClick={() => onChange({ ...value, biologicalSex: sex })}
              className={cn(
                'min-h-11 flex-1 rounded-[10px] text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on
                  ? 'bg-revamp-surface text-revamp-label shadow-e1'
                  : 'text-revamp-label-secondary',
                pressControl,
              )}
            >
              {sex === 'FEMALE' ? 'Female' : 'Male'}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="v4-age" className={labelCls}>
            Age
          </label>
          <div className={fieldCls}>
            <input
              id="v4-age"
              inputMode="numeric"
              autoComplete="off"
              value={ageText}
              onChange={(e) => setAge(e.target.value)}
              aria-invalid={errors.age !== null}
              aria-describedby={describedBy('age')}
              className={inputCls}
            />
            <span className={unitCls} aria-hidden="true">
              yrs
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="v4-height" className={labelCls}>
            Height
          </label>
          {imperial ? (
            <div className="flex gap-1">
              <div className={cn(fieldCls, 'min-w-0 flex-1 px-2')}>
                <input
                  id="v4-height"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Height, feet"
                  value={heightText}
                  onChange={(e) => setHeight(e.target.value, inchesText)}
                  aria-invalid={errors.height !== null}
                  aria-describedby={describedBy('height')}
                  className={inputCls}
                />
                <span className={unitCls} aria-hidden="true">
                  ft
                </span>
              </div>
              <div className={cn(fieldCls, 'min-w-0 flex-1 px-2')}>
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label="Height, inches"
                  value={inchesText}
                  onChange={(e) => setHeight(heightText, e.target.value)}
                  aria-invalid={errors.height !== null}
                  aria-describedby={describedBy('height')}
                  className={inputCls}
                />
                <span className={unitCls} aria-hidden="true">
                  in
                </span>
              </div>
            </div>
          ) : (
            <div className={fieldCls}>
              <input
                id="v4-height"
                inputMode="decimal"
                autoComplete="off"
                value={heightText}
                onChange={(e) => setHeight(e.target.value, '')}
                aria-invalid={errors.height !== null}
                aria-describedby={describedBy('height')}
                className={inputCls}
              />
              <span className={unitCls} aria-hidden="true">
                cm
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="v4-weight" className={labelCls}>
            Weight
          </label>
          <div className={fieldCls}>
            <input
              id="v4-weight"
              inputMode="decimal"
              autoComplete="off"
              value={weightText}
              onChange={(e) => setWeight(e.target.value)}
              aria-invalid={errors.weight !== null}
              aria-describedby={describedBy('weight')}
              className={inputCls}
            />
            <span className={unitCls} aria-hidden="true">
              {imperial ? 'lb' : 'kg'}
            </span>
          </div>
        </div>
      </div>

      {(['age', 'height', 'weight'] as const).map((field) =>
        errors[field] !== null ? (
          <p key={field} id={`v4-${field}-error`} role="alert" className="text-xs text-destructive">
            {errors[field]}
          </p>
        ) : null,
      )}

      {showTrainingDays && (
        <div className="flex flex-col gap-1.5">
          <span id="v4-train-on" className={labelCls}>
            {ONBOARDING_V4_COPY.aboutTrainOn}
          </span>
          <div role="group" aria-labelledby="v4-train-on" className="flex gap-1">
            {WEEKDAY_LETTERS.map((letter, day) => {
              const on = weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  aria-label={WEEKDAY_NAMES[day]}
                  data-testid={`v4-weekday-${day}`}
                  onClick={() =>
                    onWeekdaysChange(
                      on
                        ? weekdays.filter((d) => d !== day)
                        : [...weekdays, day].sort((a, b) => a - b),
                    )
                  }
                  className={cn(
                    'min-h-11 min-w-0 flex-1 rounded-full border text-[0.9375rem] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on
                      ? 'border-revamp-brand bg-revamp-brand text-revamp-on-brand'
                      : 'border-revamp-separator bg-revamp-surface text-revamp-label',
                    pressControl,
                  )}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showTarget && (
        <section
          aria-label={ONBOARDING_V4_COPY.aboutTarget}
          className="flex items-center gap-3 rounded-card bg-revamp-brand-tint p-3.5"
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={labelCls}>{ONBOARDING_V4_COPY.aboutTarget}</span>
            <span
              className="text-[2.125rem] font-bold leading-tight tabular-nums text-revamp-brand"
              data-testid="v4-target-kcal"
            >
              {targetKcal === null ? '—' : targetKcal.toLocaleString('en-GB')}{' '}
              <span className="text-[1.0625rem] font-semibold">kcal</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActivityOpen(true)}
            data-testid="v4-activity-change"
            className={cn(
              'min-h-11 rounded-control bg-revamp-surface px-3 text-[0.9375rem] font-semibold text-revamp-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              pressControl,
            )}
          >
            {ONBOARDING_V4_COPY.aboutTargetChange}
          </button>
        </section>
      )}

      <Sheet
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        title={ONBOARDING_V4_COPY.aboutActivityTitle}
        size="sm"
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">{ONBOARDING_V4_COPY.aboutActivityTitle}</legend>
          {ACTIVITY_OPTIONS.map((option) => {
            const selected = activity === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  'flex min-h-11 cursor-pointer items-start gap-3 rounded-control border-2 px-4 py-3',
                  selected
                    ? 'border-revamp-brand bg-revamp-brand-tint'
                    : 'border-revamp-separator bg-revamp-surface',
                )}
              >
                <input
                  type="radio"
                  name="v4-activity"
                  value={option.value}
                  checked={selected}
                  onChange={() => {
                    onActivityChange(option.value);
                    setActivityOpen(false);
                  }}
                  className="mt-1 accent-revamp-brand"
                  data-testid={`v4-activity-${option.value}`}
                />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </Sheet>
    </div>
  );
}
