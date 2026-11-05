'use client';

import { useT } from '@/lib/i18n';
import { Check } from 'lucide-react';
import { WELLNESS_COPY } from '@chefer/utils';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import type { Goal } from '../types';

// Label, description and calorie effect: `today.settings.goal.goals.<GOAL>.*`.
// The effect shows how the goal changes the daily calorie target, on the card,
// so the adjustment is visible at the moment of choosing.
const GOALS: {
  value: Goal;
  icon: string;
}[] = [
  {
    value: 'LOSE_WEIGHT',
    icon: '⚖️',
  },
  {
    value: 'MAINTAIN',
    icon: '🎯',
  },
  {
    value: 'GAIN_MUSCLE',
    icon: '💪',
  },
  {
    value: 'EAT_HEALTHIER',
    icon: '🥗',
  },
  {
    value: 'RECOMP',
    icon: '🔄',
  },
  {
    value: 'PERFORMANCE',
    icon: '🏃',
  },
];

interface StepGoalProps {
  value: Goal | null;
  onChange: (goal: Goal) => void;
  /**
   * T-22.3: the goal/metrics disclaimer. Defaults to shown (the standalone
   * onboarding wizard step has no metrics screen visible alongside it) —
   * targets-section.tsx (Settings) turns it off here since its StepMetrics
   * right below already carries the same line (shown once per screen).
   */
  showDisclaimer?: boolean;
  /** T-03.6 (AC6): adds a first "Just good food" card — no calorie target, ever. */
  showGoodFood?: boolean;
  /** Whether "Just good food" is the current pick — mutually exclusive with `value`. */
  goodFood?: boolean;
  /** Called instead of `onChange` when "Just good food" is clicked. */
  onGoodFood?: () => void;
}

export function StepGoal({
  value,
  onChange,
  showDisclaimer = true,
  showGoodFood = false,
  goodFood = false,
  onGoodFood,
}: StepGoalProps) {
  // Lane E3: the goal's kcal effect is a nutrition figure; protein-only and
  // "Hide numbers" users see the goal without it.
  const { show } = useNumbersMode();
  const { t } = useT();
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t('today.settings.goal.title')}
        </h1>
        <p className="mt-2 text-muted-foreground">{t('today.settings.goal.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {showGoodFood && (
          <button
            type="button"
            data-testid="goal-good-food"
            onClick={() => onGoodFood?.()}
            aria-pressed={goodFood}
            aria-label={t('today.settings.goal.goodFood.title')}
            className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              goodFood ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card'
            }`}
          >
            {goodFood && (
              <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" aria-hidden="true" />
              </span>
            )}
            <span className="text-4xl" aria-hidden="true">
              🍽️
            </span>
            <div>
              <p className="font-semibold">{t('today.settings.goal.goodFood.title')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('today.settings.goal.goodFood.detail')}
              </p>
            </div>
          </button>
        )}
        {GOALS.map(({ value: v, icon }) => {
          const selected = !goodFood && value === v;
          const label = t(`today.settings.goal.goals.${v}.label`);
          const description = t(`today.settings.goal.goals.${v}.description`);
          const calorieEffect = t(`today.settings.goal.goals.${v}.effect.kcal`);
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={selected}
              aria-label={label}
              className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card'
              }`}
            >
              {/* Explicit selected marker (review PR-4): the focus ring and the
                  selected border share the brand colour, so keyboard users saw
                  two "selected" cards — the check disambiguates. */}
              {selected && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
              <span className="text-4xl" aria-hidden="true">
                {icon}
              </span>
              <div>
                <p className="font-semibold">{label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                {show.kcal && (
                  <span
                    className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {calorieEffect}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* T-22.3: a calculator, not a doctor — visible at 1.8x text (AC5), never truncated. */}
      {showDisclaimer && (
        <p className="text-center text-xs text-muted-foreground">
          {WELLNESS_COPY.goalMetricsDisclaimer}
        </p>
      )}
    </div>
  );
}
