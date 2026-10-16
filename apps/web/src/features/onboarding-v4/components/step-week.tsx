'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { ShoppingBasket } from 'lucide-react';
import { duration } from '@chefer/tokens';
import { ONBOARDING_V4_COPY, planMealMacros } from '@chefer/utils';
import { BiscuitHalo, PrimaryButton, TextButton, TickLine, V4Heading } from './ui';

// ─── Building your week… / Your week is ready (OnbV4Building, OnbV4Ready) ─────

/** MO-15 long-wait staged progress: stages tick on a schedule, the last one holds until the response. */
const STAGE_STEP_MS = duration.deliberate * 2;

export type BuildStatus = 'running' | 'failed';

export function StepBuilding({
  kcal,
  status,
  onRetry,
  onSkip,
}: {
  kcal: number | null;
  status: BuildStatus;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const [ticked, setTicked] = useState(0);
  useEffect(() => {
    if (status !== 'running') return;
    setTicked(0);
    const timers = [1, 2].map((n) => window.setTimeout(() => setTicked(n), STAGE_STEP_MS * n));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [status]);

  if (status === 'failed') {
    return (
      <div className="flex flex-1 flex-col justify-center gap-5" data-testid="v4-building-failed">
        <BiscuitHalo loop="loaf" size={180} />
        <V4Heading title={ONBOARDING_V4_COPY.buildingFailed} />
        <div className="flex flex-col gap-1.5">
          <PrimaryButton onClick={onRetry} testId="v4-building-retry">
            {ONBOARDING_V4_COPY.buildingRetry}
          </PrimaryButton>
          <TextButton onClick={onSkip} testId="v4-building-skip">
            {ONBOARDING_V4_COPY.buildingSkip}
          </TextButton>
        </div>
      </div>
    );
  }

  const lines = [
    ONBOARDING_V4_COPY.buildingMeals(kcal),
    ONBOARDING_V4_COPY.buildingDiet,
    ONBOARDING_V4_COPY.buildingList,
  ];
  return (
    <div className="flex flex-1 flex-col justify-center gap-6" data-testid="v4-building">
      <BiscuitHalo loop="cooking" size={240} />
      <V4Heading title={ONBOARDING_V4_COPY.buildingTitle} />
      <ul aria-live="polite" className="mx-auto flex flex-col gap-3">
        {lines.map((line, i) => (
          <TickLine key={line} done={i < ticked}>
            {line}
          </TickLine>
        ))}
      </ul>
    </div>
  );
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** One row per planned day: its dinner, else the day's last meal. */
export function dinnerRows(
  plan:
    | {
        days: {
          dayOfWeek: number;
          meals: {
            type: string;
            portion?: number | null;
            recipe: { name: string; nutritionInfo: { calories?: number } };
          }[];
        }[];
      }
    | null
    | undefined,
): { day: string; name: string; kcal: number }[] {
  if (!plan) return [];
  return [...plan.days]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .flatMap((d) => {
      const meal = d.meals.find((m) => m.type === 'dinner') ?? d.meals[d.meals.length - 1];
      if (!meal) return [];
      return [
        {
          day: DAY_SHORT[d.dayOfWeek] ?? '',
          name: meal.recipe.name,
          kcal: planMealMacros(meal.recipe.nutritionInfo, meal.portion).kcal,
        },
      ];
    });
}

export function StepReady({ onContinue }: { onContinue: () => void }) {
  const plan = trpc.mealPlan.getForWeek.useQuery({ weekOffset: 0 });
  const list = trpc.shoppingList.getForWeek.useQuery({ weekOffset: 0 });
  const rows = dinnerRows(plan.data);
  const itemCount = list.data?.items.length ?? null;

  return (
    <div className="flex flex-col gap-3.5" data-testid="v4-ready">
      <BiscuitHalo loop="ready" size={150} />
      <V4Heading title={ONBOARDING_V4_COPY.readyTitle} lede={ONBOARDING_V4_COPY.readyLede} />
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li
            key={row.day}
            className="flex min-h-[3.25rem] items-center gap-3 rounded-control border border-revamp-separator bg-revamp-surface px-3"
          >
            <span className="w-12 shrink-0 whitespace-nowrap text-sm font-bold uppercase tracking-wide text-revamp-brand">
              {row.day}
            </span>
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-revamp-label">
              {row.name}
            </span>
            <span className="shrink-0 text-sm text-revamp-label-tertiary">{row.kcal} kcal</span>
          </li>
        ))}
      </ul>
      {itemCount !== null && itemCount > 0 && (
        <p
          className="flex min-h-12 items-center gap-2.5 rounded-control bg-revamp-brand-tint px-3.5 text-base font-semibold text-revamp-brand"
          data-testid="v4-ready-list"
        >
          <ShoppingBasket className="h-5 w-5 shrink-0" aria-hidden="true" />
          {ONBOARDING_V4_COPY.readyList(itemCount)}
        </p>
      )}
      <div className="mt-2 flex flex-col gap-1.5">
        <PrimaryButton onClick={onContinue} testId="v4-ready-continue">
          {ONBOARDING_V4_COPY.readyContinue}
        </PrimaryButton>
        <TextButton onClick={onContinue}>{ONBOARDING_V4_COPY.readyLater}</TextButton>
      </div>
    </div>
  );
}
