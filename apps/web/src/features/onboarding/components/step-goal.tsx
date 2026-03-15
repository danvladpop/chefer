'use client';

import type { Goal } from '../types';

const GOALS: {
  value: Goal;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    value: 'LOSE_WEIGHT',
    label: 'Lose Weight',
    icon: '⚖️',
    description: 'Reduce body fat and reach a healthier weight',
  },
  {
    value: 'MAINTAIN',
    label: 'Maintain Weight',
    icon: '🎯',
    description: 'Keep your current weight while eating well',
  },
  {
    value: 'GAIN_MUSCLE',
    label: 'Gain Muscle',
    icon: '💪',
    description: 'Build strength and increase lean muscle mass',
  },
  {
    value: 'EAT_HEALTHIER',
    label: 'Eat Healthier',
    icon: '🥗',
    description: 'Improve overall nutrition and eating habits',
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
        <h1 className="text-3xl font-bold tracking-tight">What&apos;s your main goal?</h1>
        <p className="mt-2 text-muted-foreground">
          Your meal plan will be optimised to support this goal.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GOALS.map(({ value: v, label, icon, description }) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={selected}
              className={`flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                selected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border bg-card'
              }`}
            >
              <span className="text-4xl" aria-hidden="true">
                {icon}
              </span>
              <div>
                <p className="font-semibold">{label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
