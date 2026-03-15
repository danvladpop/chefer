'use client';

import { useState } from 'react';
import type { ActivityLevel, BiologicalSex } from '../types';

// ─── Calorie estimate ─────────────────────────────────────────────────────────

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  VERY_ACTIVE: 1.725,
  ATHLETE: 1.9,
};

/**
 * Mifflin-St Jeor.
 * Male: BMR = 10w + 6.25h - 5a + 5
 * Female: BMR = 10w + 6.25h - 5a - 161
 * Unknown: gender-neutral average constant -78
 */
function estimateCalories(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: ActivityLevel | null,
  biologicalSex: BiologicalSex | null,
): number {
  const sexConstant = biologicalSex === 'MALE' ? 5 : biologicalSex === 'FEMALE' ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant;
  const multiplier = activityLevel ? ACTIVITY_MULTIPLIERS[activityLevel] : 1.55;
  return Math.round(bmr * multiplier);
}

// ─── Activity level options ───────────────────────────────────────────────────

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; description: string }[] = [
  { value: 'SEDENTARY', label: 'Sedentary', description: 'Little or no exercise, desk job' },
  {
    value: 'LIGHTLY_ACTIVE',
    label: 'Lightly Active',
    description: 'Light exercise 1–3 days/week',
  },
  {
    value: 'MODERATELY_ACTIVE',
    label: 'Moderately Active',
    description: 'Moderate exercise 3–5 days/week',
  },
  { value: 'VERY_ACTIVE', label: 'Very Active', description: 'Hard exercise 6–7 days/week' },
  {
    value: 'ATHLETE',
    label: 'Athlete',
    description: 'Very hard exercise or physical job',
  },
];

// ─── Conversion helpers ───────────────────────────────────────────────────────

function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { feet, inches };
}

function ftInToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * 2.54 * 10) / 10;
}

function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

function lbsToKg(lbs: number): number {
  return Math.round((lbs / 2.20462) * 10) / 10;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepMetricsValues {
  biologicalSex: BiologicalSex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
}

interface StepMetricsProps {
  value: StepMetricsValues;
  onChange: (value: StepMetricsValues) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StepMetrics({ value, onChange }: StepMetricsProps) {
  // Unit toggles
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');

  // Local display strings (so inputs don't jump while typing)
  const [localAge, setLocalAge] = useState(value.age?.toString() ?? '');
  const [localHeightCm, setLocalHeightCm] = useState(value.heightCm?.toString() ?? '');
  const [localFeet, setLocalFeet] = useState(() => {
    if (!value.heightCm) return '';
    return cmToFtIn(value.heightCm).feet.toString();
  });
  const [localInches, setLocalInches] = useState(() => {
    if (!value.heightCm) return '';
    return cmToFtIn(value.heightCm).inches.toString();
  });
  const [localWeight, setLocalWeight] = useState(value.weightKg?.toString() ?? '');

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleAgeChange(raw: string) {
    setLocalAge(raw);
    const n = parseInt(raw, 10);
    onChange({ ...value, age: raw === '' || isNaN(n) ? null : n });
  }

  function handleHeightCmChange(raw: string) {
    setLocalHeightCm(raw);
    const n = parseFloat(raw);
    onChange({ ...value, heightCm: raw === '' || isNaN(n) ? null : n });
  }

  function handleFeetChange(raw: string) {
    setLocalFeet(raw);
    const feet = parseInt(raw, 10);
    const inches = parseInt(localInches, 10) || 0;
    if (raw === '' || isNaN(feet)) {
      onChange({ ...value, heightCm: null });
    } else {
      onChange({ ...value, heightCm: ftInToCm(feet, inches) });
    }
  }

  function handleInchesChange(raw: string) {
    setLocalInches(raw);
    const feet = parseInt(localFeet, 10) || 0;
    const inches = parseInt(raw, 10);
    if (raw === '' || isNaN(inches)) {
      onChange({ ...value, heightCm: null });
    } else {
      onChange({ ...value, heightCm: ftInToCm(feet, inches) });
    }
  }

  function handleWeightChange(raw: string) {
    setLocalWeight(raw);
    const n = parseFloat(raw);
    if (raw === '' || isNaN(n)) {
      onChange({ ...value, weightKg: null });
    } else {
      onChange({ ...value, weightKg: weightUnit === 'kg' ? n : lbsToKg(n) });
    }
  }

  function switchHeightUnit(unit: 'cm' | 'ft') {
    if (unit === heightUnit) return;
    if (unit === 'ft' && value.heightCm) {
      const { feet, inches } = cmToFtIn(value.heightCm);
      setLocalFeet(feet.toString());
      setLocalInches(inches.toString());
    } else if (unit === 'cm' && value.heightCm) {
      setLocalHeightCm(Math.round(value.heightCm).toString());
    }
    setHeightUnit(unit);
  }

  function switchWeightUnit(unit: 'kg' | 'lbs') {
    if (unit === weightUnit) return;
    if (value.weightKg) {
      const converted = unit === 'lbs' ? kgToLbs(value.weightKg) : value.weightKg;
      setLocalWeight(converted.toString());
    }
    setWeightUnit(unit);
  }

  // ── Calorie preview ──────────────────────────────────────────────────────────

  const canPreview =
    value.age !== null &&
    value.heightCm !== null &&
    value.weightKg !== null &&
    value.age > 0 &&
    value.heightCm > 0 &&
    value.weightKg > 0;

  const calorieEstimate = canPreview
    ? estimateCalories(
        value.weightKg!,
        value.heightCm!,
        value.age!,
        value.activityLevel,
        value.biologicalSex,
      )
    : null;

  // ── Shared input class ───────────────────────────────────────────────────────

  const inputCls =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

  const toggleBtnCls = (active: boolean) =>
    `px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none ${
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Your body metrics</h1>
        <p className="mt-2 text-muted-foreground">
          Used to calculate your personalised daily calorie target.
        </p>
      </div>

      <div className="space-y-6">
        {/* Biological sex */}
        <fieldset className="space-y-1.5">
          <legend className="block text-sm font-medium">Biological sex</legend>
          <p className="text-xs text-muted-foreground">Used for accurate calorie calculation.</p>
          <div className="mt-2 flex gap-3">
            {(['MALE', 'FEMALE'] as const).map((sex) => {
              const selected = value.biologicalSex === sex;
              return (
                <label
                  key={sex}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors hover:border-primary/50 ${
                    selected ? 'border-primary bg-primary/5' : 'border-border bg-card'
                  }`}
                >
                  <input
                    type="radio"
                    name="biologicalSex"
                    value={sex}
                    checked={selected}
                    onChange={() => onChange({ ...value, biologicalSex: sex })}
                    className="sr-only"
                  />
                  {sex === 'MALE' ? 'Male' : 'Female'}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Age */}
        <div className="space-y-1.5">
          <label htmlFor="age" className="block text-sm font-medium">
            Age
          </label>
          <input
            id="age"
            type="number"
            inputMode="numeric"
            min={10}
            max={110}
            placeholder="e.g. 30"
            value={localAge}
            onChange={(e) => handleAgeChange(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Height */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Height</label>
            <div className="flex overflow-hidden rounded-md border border-input">
              <button
                type="button"
                onClick={() => switchHeightUnit('cm')}
                className={toggleBtnCls(heightUnit === 'cm')}
              >
                cm
              </button>
              <button
                type="button"
                onClick={() => switchHeightUnit('ft')}
                className={toggleBtnCls(heightUnit === 'ft')}
              >
                ft / in
              </button>
            </div>
          </div>

          {heightUnit === 'cm' ? (
            <input
              type="number"
              inputMode="decimal"
              min={50}
              max={280}
              placeholder="e.g. 175"
              value={localHeightCm}
              onChange={(e) => handleHeightCmChange(e.target.value)}
              className={inputCls}
            />
          ) : (
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min={3}
                  max={8}
                  placeholder="ft"
                  value={localFeet}
                  onChange={(e) => handleFeetChange(e.target.value)}
                  className={inputCls}
                />
                <p className="text-xs text-muted-foreground">feet</p>
              </div>
              <div className="flex-1 space-y-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={11}
                  placeholder="in"
                  value={localInches}
                  onChange={(e) => handleInchesChange(e.target.value)}
                  className={inputCls}
                />
                <p className="text-xs text-muted-foreground">inches</p>
              </div>
            </div>
          )}
        </div>

        {/* Weight */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Weight</label>
            <div className="flex overflow-hidden rounded-md border border-input">
              <button
                type="button"
                onClick={() => switchWeightUnit('kg')}
                className={toggleBtnCls(weightUnit === 'kg')}
              >
                kg
              </button>
              <button
                type="button"
                onClick={() => switchWeightUnit('lbs')}
                className={toggleBtnCls(weightUnit === 'lbs')}
              >
                lbs
              </button>
            </div>
          </div>
          <input
            type="number"
            inputMode="decimal"
            min={20}
            max={500}
            placeholder={weightUnit === 'kg' ? 'e.g. 75' : 'e.g. 165'}
            value={localWeight}
            onChange={(e) => handleWeightChange(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Activity level */}
        <fieldset className="space-y-1.5">
          <legend className="block text-sm font-medium">Activity level</legend>
          <div className="mt-2 space-y-2">
            {ACTIVITY_OPTIONS.map(({ value: v, label, description }) => {
              const selected = value.activityLevel === v;
              return (
                <label
                  key={v}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 px-4 py-3 transition-colors hover:border-primary/50 ${
                    selected ? 'border-primary bg-primary/5' : 'border-border bg-card'
                  }`}
                >
                  <input
                    type="radio"
                    name="activityLevel"
                    value={v}
                    checked={selected}
                    onChange={() => onChange({ ...value, activityLevel: v })}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium leading-none">{label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* Live calorie estimate */}
      <div
        className={`rounded-xl border-2 p-5 text-center transition-all ${
          calorieEstimate !== null
            ? 'border-primary/30 bg-primary/5'
            : 'border-dashed border-border'
        }`}
      >
        {calorieEstimate !== null ? (
          <>
            <p className="text-sm font-medium text-muted-foreground">
              Estimated daily calorie target
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums text-primary">
              {calorieEstimate.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              kcal / day · Mifflin-St Jeor estimate
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Fill in your age, height, and weight to see your estimated daily calorie target.
          </p>
        )}
      </div>
    </div>
  );
}
