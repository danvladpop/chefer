'use client';

import type { Goal } from '@/features/onboarding/types';
import type { OnboardingJob } from '@chefer/types';
import {
  ONBOARDING_V4_COPY,
  ONBOARDING_V4_GOAL_TILES,
  ONBOARDING_V4_JOB_TILES,
} from '@chefer/utils';
import { BiscuitHalo, ChoiceTile, V4Heading } from './ui';

// ─── What brings you here? / What's your goal? (OnbV4Jobs, OnbV4Goal) ─────────

export function StepJobsV4({
  value,
  onChange,
}: {
  value: OnboardingJob[];
  onChange: (jobs: OnboardingJob[]) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <BiscuitHalo loop="curious" size={170} />
      <V4Heading title={ONBOARDING_V4_COPY.jobsTitle} lede={ONBOARDING_V4_COPY.jobsLede} />
      <div className="grid grid-cols-2 gap-2.5">
        {ONBOARDING_V4_JOB_TILES.map((tile) => {
          const selected = value.includes(tile.job);
          return (
            <ChoiceTile
              key={tile.job}
              icon={tile.icon}
              label={tile.label}
              selected={selected}
              testId={`v4-job-${tile.job}`}
              onClick={() =>
                onChange(selected ? value.filter((j) => j !== tile.job) : [...value, tile.job])
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/** `undefined` = nothing picked yet; `null` = "Just good food" (no goal). */
export type GoalChoice = Goal | null | undefined;

export function StepGoalV4({
  value,
  onChange,
}: {
  value: GoalChoice;
  onChange: (goal: Goal | null) => void;
}) {
  // Biscuit follows the selected tile's loop (curious until one is picked).
  const selectedTile =
    value === undefined ? undefined : ONBOARDING_V4_GOAL_TILES.find((t) => t.goal === value);
  return (
    <div className="flex flex-col gap-5">
      <BiscuitHalo loop={selectedTile?.loop ?? 'curious'} size={170} />
      <V4Heading title={ONBOARDING_V4_COPY.goalTitle} />
      <div className="grid grid-cols-2 gap-2.5">
        {ONBOARDING_V4_GOAL_TILES.map((tile) => (
          <ChoiceTile
            key={tile.label}
            icon={tile.icon}
            label={tile.label}
            selected={selectedTile === tile}
            testId={`v4-goal-${tile.goal ?? 'GOOD_FOOD'}`}
            onClick={() => onChange(tile.goal)}
          />
        ))}
      </div>
    </div>
  );
}
