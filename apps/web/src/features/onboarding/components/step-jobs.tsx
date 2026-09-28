'use client';

import {
  BookOpen,
  Calendar,
  Dumbbell,
  PieChart,
  ShoppingBasket,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { OnboardingJob } from '@chefer/types';
import { cn } from '@chefer/utils';

// ─── Step 1: "What should Chefer help with?" (§2.4, T-03.1/T-03.6, rev 2) ─────
// Web parity of mobile's jobs-step.tsx — replaces StepIntent's single-choice
// "What brings you here?" with a multi-select. AC1: Continue is disabled at
// 0 selections; a selected card deselects on a second click.

export const JOB_OPTIONS: {
  value: OnboardingJob;
  title: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  {
    value: 'TRAIN',
    title: 'Train',
    detail: 'Workouts that tell you what to lift next. Free.',
    icon: Dumbbell,
  },
  {
    value: 'PLAN_MEALS',
    title: 'Plan my meals',
    detail: 'A week of meals that fits your time and taste, with one shopping list.',
    icon: Calendar,
  },
  {
    value: 'HOUSEHOLD',
    title: 'Feed my household',
    detail: 'One plan for everyone at my table, allergies included.',
    icon: Users,
  },
  {
    value: 'USE_WHAT_I_HAVE',
    title: 'Use what I have',
    detail: 'Keep track of what’s in my kitchen and use it first.',
    icon: ShoppingBasket,
  },
  {
    value: 'SAVED_RECIPES',
    title: 'Cook my saved recipes',
    detail: 'Keep recipes from links and videos, and plan with them.',
    icon: BookOpen,
  },
  {
    value: 'TRACK',
    title: 'Track what I eat',
    detail: 'Log meals fast against my own calorie and protein targets.',
    icon: PieChart,
  },
];

export function StepJobs({
  value,
  onChange,
}: {
  value: OnboardingJob[];
  onChange: (jobs: OnboardingJob[]) => void;
}) {
  function toggle(job: OnboardingJob) {
    onChange(value.includes(job) ? value.filter((j) => j !== job) : [...value, job]);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">What should Chefer help with?</h1>
        <p className="text-sm text-muted-foreground">
          Pick all that fit. You can change this any time in Settings.
        </p>
      </div>

      <div className="grid gap-3">
        {JOB_OPTIONS.map(({ value: option, title, detail, icon: Icon }) => {
          const selected = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              role="checkbox"
              aria-checked={selected}
              data-testid={`onboarding-job-${option}`}
              onClick={() => toggle(option)}
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
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">{title}</span>
                <span className="block text-sm text-muted-foreground">{detail}</span>
              </span>
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                  selected ? 'border-primary bg-primary' : 'border-input bg-background',
                )}
                aria-hidden="true"
              >
                {selected && (
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-primary-foreground">
                    <path d="M6.3 11.3 3 8l1.4-1.4 1.9 1.9 5.3-5.3L13 4.6z" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
