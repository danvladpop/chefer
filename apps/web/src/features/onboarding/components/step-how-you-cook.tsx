'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  DISPLAY_CURRENCIES,
  type DisplayCurrency,
  type PlanShape,
  type PlanSlot,
} from '@chefer/types';
import { cn, defaultsForRegion, detectRegion, planShapeSummary } from '@chefer/utils';

// ─── Step: How you cook (UX-07 §1, T-03.6) ─────────────────────────────────────
// Web parity of mobile's how-you-cook-step.tsx. Reuses the same fieldsets as
// PlanSettingsSheet (mealPlan.getShape/setShape), plus currency/units
// (pre-selected from the device region, CI-24) and the once-only "Plan my
// next week automatically every Sunday?" switch (T-03.9, default off).

export type DraftShape = PlanShape & { leftovers: boolean };

export interface HowYouCookStepValue {
  shape: DraftShape | null;
  currency: DisplayCurrency;
  units: 'METRIC' | 'IMPERIAL';
  autoPlanWeekly: boolean;
}

const SLOT_OPTIONS: { value: PlanSlot; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snacks' },
];
const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_CAP_OPTIONS: { value: '15' | '30' | '45' | 'none'; label: string }[] = [
  { value: '15', label: '≤ 15 min' },
  { value: '30', label: '≤ 30 min' },
  { value: '45', label: '≤ 45 min' },
  { value: 'none', label: 'No limit' },
];
const UNITS_OPTIONS: { value: 'METRIC' | 'IMPERIAL'; label: string }[] = [
  { value: 'METRIC', label: 'Metric (g, kg)' },
  { value: 'IMPERIAL', label: 'Imperial (oz, lb)' },
];

function Chip({
  selected,
  onClick,
  children,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors',
        selected
          ? 'border-[#944a00] bg-[#944a00] text-white'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
      )}
    >
      {children}
    </button>
  );
}

export function StepHowYouCook({
  value,
  onChange,
  isPremium,
}: {
  value: HowYouCookStepValue;
  onChange: (
    value: HowYouCookStepValue | ((prev: HowYouCookStepValue) => HowYouCookStepValue),
  ) => void;
  isPremium: boolean;
}) {
  const { data } = trpc.mealPlan.getShape.useQuery();
  const [regionApplied, setRegionApplied] = useState(false);

  useEffect(() => {
    if (!data) return;
    onChange((prev) => (prev.shape ? prev : { ...prev, shape: data }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once
  }, [data]);

  useEffect(() => {
    if (regionApplied) return;
    setRegionApplied(true);
    const { preferredUnits, currency } = defaultsForRegion(detectRegion());
    onChange((prev) => ({ ...prev, units: preferredUnits, currency }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once
  }, []);

  if (!value.shape) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-[#944a00]/20 border-t-[#944a00]" />
      </div>
    );
  }
  const shape = value.shape;
  const timeCapValue = shape.timeCapMins == null ? 'none' : String(shape.timeCapMins);

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">How you cook</h1>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Which meals should we plan?
        </legend>
        <div className="flex flex-wrap gap-2">
          {SLOT_OPTIONS.map(({ value: opt, label }) => {
            const selected = shape.slots.includes(opt);
            return (
              <Chip
                key={opt}
                testId={`how-you-cook-slot-${opt}`}
                selected={selected}
                onClick={() => {
                  const slots = selected
                    ? shape.slots.filter((s) => s !== opt)
                    : [...shape.slots, opt];
                  if (slots.length === 0) return;
                  onChange((prev) => ({ ...prev, shape: { ...shape, slots } }));
                }}
              >
                {label}
              </Chip>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          On which days?
        </legend>
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((label, day) => {
            const selected = shape.days.includes(day);
            return (
              <Chip
                key={day}
                testId={`how-you-cook-day-${day}`}
                selected={selected}
                onClick={() => {
                  const days = selected
                    ? shape.days.filter((d) => d !== day)
                    : [...shape.days, day].sort((a, b) => a - b);
                  if (days.length === 0) return;
                  onChange((prev) => ({ ...prev, shape: { ...shape, days } }));
                }}
              >
                {label}
              </Chip>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          How long can you cook on those days?
        </legend>
        <div
          role="radiogroup"
          aria-label="How long can you cook on those days?"
          className="flex flex-wrap gap-2"
        >
          {TIME_CAP_OPTIONS.map(({ value: opt, label }) => (
            <Chip
              key={opt}
              testId={`how-you-cook-time-${opt}`}
              selected={timeCapValue === opt}
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  shape: {
                    ...shape,
                    timeCapMins: opt === 'none' ? null : (Number(opt) as 15 | 30 | 45),
                  },
                }))
              }
            >
              {label}
            </Chip>
          ))}
        </div>
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-gray-700">
          Weekends can take longer
          <input
            type="checkbox"
            data-testid="how-you-cook-weekend-no-limit"
            checked={shape.weekendNoLimit}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                shape: { ...shape, weekendNoLimit: e.target.checked },
              }))
            }
            className="h-5 w-5 rounded border-gray-300 text-[#944a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00]"
          />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Cooking for
        </legend>
        <div role="radiogroup" aria-label="Cooking for" className="flex flex-wrap gap-2">
          <Chip
            testId="how-you-cook-for-1"
            selected={shape.cookingFor == null || shape.cookingFor === 1}
            onClick={() => onChange((prev) => ({ ...prev, shape: { ...shape, cookingFor: 1 } }))}
          >
            Just me
          </Chip>
          <Chip
            testId="how-you-cook-for-2"
            selected={shape.cookingFor === 2}
            onClick={() => onChange((prev) => ({ ...prev, shape: { ...shape, cookingFor: 2 } }))}
          >
            Two of us
          </Chip>
        </div>
        <Link
          href="/preferences#household"
          data-testid="how-you-cook-household-link"
          className="text-xs font-semibold text-[#944a00] hover:underline"
        >
          Household of 3+? Set up your table ›
        </Link>
      </fieldset>

      {isPremium && (
        <fieldset className="flex flex-col gap-2 border-t border-gray-200 pt-4">
          <legend className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Options
          </legend>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-gray-700">
            Cook once, eat twice (leftover lunches)
            <input
              type="checkbox"
              data-testid="how-you-cook-leftovers"
              checked={shape.leftovers}
              onChange={(e) =>
                onChange((prev) => ({ ...prev, shape: { ...shape, leftovers: e.target.checked } }))
              }
              className="h-5 w-5 rounded border-gray-300 text-[#944a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00]"
            />
          </label>
        </fieldset>
      )}

      <div aria-live="polite" className="rounded-xl bg-gray-50 px-3 py-2.5">
        <p data-testid="how-you-cook-summary" className="text-sm text-gray-700">
          {planShapeSummary(shape)}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2 border-t border-gray-200 pt-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Prices in
        </legend>
        <div className="flex flex-wrap gap-2">
          {DISPLAY_CURRENCIES.map((c) => (
            <Chip
              key={c}
              testId={`how-you-cook-currency-${c}`}
              selected={value.currency === c}
              onClick={() => onChange((prev) => ({ ...prev, currency: c }))}
            >
              {c}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          We guessed from your phone&apos;s region — change it if it&apos;s wrong.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Units
        </legend>
        <div role="radiogroup" aria-label="Units" className="flex flex-wrap gap-2">
          {UNITS_OPTIONS.map(({ value: opt, label }) => (
            <Chip
              key={opt}
              testId={`how-you-cook-units-${opt.toLowerCase()}`}
              selected={value.units === opt}
              onClick={() => onChange((prev) => ({ ...prev, units: opt }))}
            >
              {label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1 border-t border-gray-200 pt-4">
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-gray-700">
          Plan my next week automatically every Sunday?
          <input
            type="checkbox"
            data-testid="how-you-cook-auto-plan"
            checked={value.autoPlanWeekly}
            onChange={(e) => onChange((prev) => ({ ...prev, autoPlanWeekly: e.target.checked }))}
            className="h-5 w-5 rounded border-gray-300 text-[#944a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00]"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          We&apos;ll have next week ready on Monday. You can change this any time.
        </p>
      </div>
    </div>
  );
}
