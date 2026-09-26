'use client';

import { Dumbbell, Salad, Users, type LucideIcon } from 'lucide-react';
import type { OnboardingIntent } from '@chefer/types';
import { cn } from '@chefer/utils';

// ─── Step 0: "What brings you here?" (backlog P2-3, audit F-PM-6) ─────────────
// Routes each audience to its first screen: households to "Who's at your
// table?", gym-goers to gym setup (food later), everyone else to the food
// wizard they always had.

export const INTENT_OPTIONS: {
  value: OnboardingIntent;
  title: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  {
    value: 'EAT_BETTER',
    title: 'Eat better',
    detail: 'Plan my week, shop and cook — for me.',
    icon: Salad,
  },
  {
    value: 'HOUSEHOLD',
    title: 'Feed my household',
    detail: 'One safe plan for everyone at my table, allergies included.',
    icon: Users,
  },
  {
    value: 'TRAIN',
    title: 'Train',
    detail: 'Workouts that progress every week. I’ll set up food later.',
    icon: Dumbbell,
  },
];

export function StepIntent({
  value,
  onChange,
  onSkip,
}: {
  value: OnboardingIntent | null;
  onChange: (intent: OnboardingIntent) => void;
  /** "Skip this question" — carry on with the solo flow. */
  onSkip: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">What brings you here?</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ll start where it matters to you. You can use everything either way.
        </p>
      </div>

      <div role="radiogroup" aria-label="What brings you here?" className="grid gap-3">
        {INTENT_OPTIONS.map(({ value: option, title, detail, icon: Icon }) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option)}
              className={cn(
                'flex min-h-11 w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected
                  ? 'border-primary bg-primary/5'
                  : 'border-input bg-background hover:border-primary/40',
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                  selected ? 'bg-primary text-primary-foreground' : 'bg-[#fff3e8] text-[#944a00]',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{title}</span>
                <span className="block text-sm text-muted-foreground">{detail}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="min-h-11 px-4 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Skip this question
        </button>
      </div>
    </div>
  );
}
