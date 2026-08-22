'use client';

import type { Goal } from '../types';

const GOALS: {
  value: Goal;
  label: string;
  icon: string;
  description: string;
  /** How the goal changes the daily calorie target — shown on the card so the
      adjustment is visible at the moment of choosing, not just in the preview. */
  calorieEffect: string;
}[] = [
  {
    value: 'LOSE_WEIGHT',
    label: 'Lose Weight',
    icon: '⚖️',
    description: 'Reduce body fat and reach a healthier weight',
    calorieEffect: '−500 kcal/day deficit',
  },
  {
    value: 'MAINTAIN',
    label: 'Maintain Weight',
    icon: '🎯',
    description: 'Keep your current weight while eating well',
    calorieEffect: 'Maintenance calories',
  },
  {
    value: 'GAIN_MUSCLE',
    label: 'Gain Muscle',
    icon: '💪',
    description: 'Build strength and increase lean muscle mass',
    calorieEffect: '+300 kcal/day surplus',
  },
  {
    value: 'EAT_HEALTHIER',
    label: 'Eat Healthier',
    icon: '🥗',
    description: 'Improve overall nutrition and eating habits',
    calorieEffect: 'Maintenance calories, better macros',
  },
];

interface StepGoalProps {
  value: Goal | null;
  onChange: (goal: Goal) => void;
}

export function StepGoal({ value, onChange }: StepGoalProps) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          What&apos;s your main goal?
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your meal plan will be optimised to support this goal.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GOALS.map(({ value: v, label, icon, description, calorieEffect }) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={selected}
              className={`flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card'
              }`}
            >
              <span className="text-4xl" aria-hidden="true">
                {icon}
              </span>
              <div>
                <p className="font-semibold">{label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                <span
                  className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {calorieEffect}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
