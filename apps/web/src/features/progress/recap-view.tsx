'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { X } from 'lucide-react';
import { localDateSchema, type WeeklyRecap } from '@chefer/types';
import { Biscuit, CountUp, pressControl, useReducedMotion } from '@chefer/ui';
import {
  biscuitLine,
  cn,
  flameWeeksLabel,
  levelLabel,
  PROGRESS_COPY,
  xpLabel,
} from '@chefer/utils';
import { PROGRESS_WEB_COPY } from './copy';
import { ProgressNotAvailable } from './not-available';
import { useProgressEnabled, useProgressSummary } from './use-progress';

// ─── Weekly recap (mockup 10, lane C9) ────────────────────────────────────────
// A short sequence of cards with a segment bar on top: the week in four tiles,
// the dish of the week, Flame / XP / level, and Biscuit's take with "Plan next
// week". ←/→ move between cards (and Back / Next buttons do, for touch). No
// Share on this release. Opening it marks the recap as seen (clears Today's
// banner).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(date: string): { day: number; month: string } {
  const [, m, d] = date.split('-').map(Number);
  return { day: d ?? 0, month: MONTHS[(m ?? 1) - 1] ?? '' };
}

/** "13–19 Oct", or "29 Sep – 5 Oct" across a month. */
export function weekRangeLabel(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  return a.month === b.month
    ? `${a.day}–${b.day} ${b.month}`
    : `${a.day} ${a.month} – ${b.day} ${b.month}`;
}

type Card = 'week' | 'dish' | 'progress' | 'biscuit';

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 rounded-card bg-white/15 p-4">
      <p className="text-4xl font-bold">
        <CountUp value={value} />
      </p>
      <p className="mt-1 text-sm text-white/90">{label}</p>
    </div>
  );
}

function CardBody({
  card,
  recap,
  showXp,
  biscuitText,
}: {
  card: Card;
  recap: WeeklyRecap;
  showXp: boolean;
  biscuitText: string | null;
}) {
  switch (card) {
    case 'week':
      return (
        <>
          <h2 className="text-3xl font-bold leading-tight">
            {recap.cooked + recap.workouts > 0
              ? PROGRESS_WEB_COPY.recapHeadline
              : PROGRESS_WEB_COPY.recapHeadlineQuiet}
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Tile value={recap.cooked} label={PROGRESS_WEB_COPY.recapCooked} />
            <Tile
              value={recap.workouts}
              label={
                recap.workoutGoal !== null && recap.workouts >= recap.workoutGoal
                  ? PROGRESS_WEB_COPY.recapWorkoutsGoalMet
                  : PROGRESS_WEB_COPY.recapWorkouts
              }
            />
            <Tile value={recap.prs} label={PROGRESS_WEB_COPY.recapPrs} />
            <Tile value={recap.newRecipes} label={PROGRESS_WEB_COPY.recapNewRecipes} />
          </div>
        </>
      );
    case 'dish': {
      const dish = recap.dishOfWeek;
      if (!dish) return null;
      return (
        <>
          <h2 className="text-3xl font-bold leading-tight">{PROGRESS_WEB_COPY.recapDish}</h2>
          <div className="mt-5 flex min-w-0 items-center gap-4 rounded-card bg-white p-4 text-gray-900">
            {dish.imageUrl ? (
              // Remote recipe photo of unknown size; the card's own box sizes it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dish.imageUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-inner object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-inner bg-[#fff3e8] text-3xl"
              >
                🍽️
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{dish.name}</p>
              <p className="text-sm text-gray-600">
                {dish.rating !== null && (
                  <>
                    <span aria-label={`${dish.rating} out of 5 stars`}>
                      {'★'.repeat(dish.rating)}
                    </span>
                    {' · '}
                  </>
                )}
                {dish.timesCooked === 1 ? 'cooked once' : `cooked ${dish.timesCooked} times`}
              </p>
            </div>
          </div>
        </>
      );
    }
    case 'progress':
      return (
        <div className="flex flex-col gap-3 rounded-card bg-white/15 p-5 text-lg">
          <p className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">
              <span aria-hidden="true">🔥</span> {PROGRESS_WEB_COPY.recapFlame}
            </span>
            <span>
              {recap.flame.from} → <strong>{flameWeeksLabel(recap.flame.to)}</strong>
            </span>
          </p>
          {showXp && (
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">
                <span aria-hidden="true">⭐</span> {PROGRESS_WEB_COPY.recapXp}
              </span>
              <span>
                <strong>{xpLabel(recap.xp)}</strong> · {levelLabel(recap.level.from)} →{' '}
                {recap.level.to}
              </span>
            </p>
          )}
        </div>
      );
    case 'biscuit':
      return (
        <div className="flex flex-col items-center gap-3 text-center">
          {biscuitText && (
            <>
              <Biscuit loop="allSet" size={120} label={null} />
              <p className="text-sm font-semibold uppercase tracking-widest text-white/80">
                {PROGRESS_WEB_COPY.recapBiscuit}
              </p>
              <p className="text-2xl font-bold">“{biscuitText}”</p>
            </>
          )}
        </div>
      );
  }
}

export function RecapView({ week }: { week: string }) {
  const validWeek = localDateSchema.safeParse(week).success;
  const { enabled, isLoading: gateLoading } = useProgressEnabled();
  const { summary } = useProgressSummary();
  const query = trpc.progress.weeklyRecap.useQuery(
    { weekStart: week },
    { enabled: enabled && validWeek, retry: false },
  );
  const markSeen = trpc.progress.markSeen.useMutation({ meta: { silent: true } });
  const { mutate: sendSeen } = markSeen;
  const utils = trpc.useUtils();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  const recap = query.data;
  const showXp = summary?.settings.showXp ?? true;
  const biscuitText =
    summary && summary.settings.biscuit && !summary.quiet && summary.settings.celebrations !== 'OFF'
      ? biscuitLine('recap', week)
      : null;
  const cards: Card[] = recap
    ? [
        'week',
        ...(recap.dishOfWeek ? (['dish'] as const) : []),
        'progress',
        ...(biscuitText ? (['biscuit'] as const) : []),
      ]
    : [];
  const last = cards.length - 1;
  const current = Math.min(index, Math.max(last, 0));
  const card = cards[current];
  const isLast = current === last;

  // Opening the recap clears Today's banner, once.
  const seenSent = useRef(false);
  useEffect(() => {
    if (!enabled || !recap || seenSent.current) return;
    seenSent.current = true;
    sendSeen({ recapWeek: week }, { onSuccess: () => void utils.progress.summary.invalidate() });
    capture('kitchen_recap_opened', { source: 'banner' });
  }, [enabled, recap, week, sendSeen, utils]);

  useEffect(() => {
    if (!recap) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, last));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [recap, last]);

  let body: React.ReactNode;
  if (!validWeek) {
    body = <p className="text-sm text-gray-600">{PROGRESS_WEB_COPY.recapBadWeek}</p>;
  } else if (!gateLoading && !enabled) {
    body = <ProgressNotAvailable />;
  } else if (query.isError) {
    body = (
      <p role="alert" className="text-sm text-red-700">
        {PROGRESS_WEB_COPY.recapLoadError}
      </p>
    );
  } else if (!recap || !card) {
    body = <div className="h-[28rem] animate-pulse rounded-sheet bg-gray-100" aria-hidden="true" />;
  } else {
    body = (
      <div
        data-testid="recap-card"
        className="flex min-h-[28rem] flex-col rounded-sheet bg-gradient-to-b from-[#944a00] to-[#4a1d08] p-5 text-white shadow-e3"
      >
        <ol className="flex gap-1.5" aria-label={PROGRESS_WEB_COPY.recapSteps}>
          {cards.map((c, i) => (
            <li
              key={c}
              aria-current={i === current ? 'step' : undefined}
              className={cn('h-1 flex-1 rounded-full', i <= current ? 'bg-white' : 'bg-white/30')}
            />
          ))}
        </ol>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs font-semibold uppercase tracking-widest text-white/80">
            {PROGRESS_WEB_COPY.recapEyebrow} · {weekRangeLabel(recap.weekStart, recap.weekEnd)}
          </p>
          <Link
            href="/dashboard"
            aria-label={PROGRESS_WEB_COPY.recapClose}
            className={cn(
              '-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/15',
              pressControl,
            )}
          >
            <X className="h-5 w-5" />
          </Link>
        </div>

        {/* MO-02: each card fades in; reduced motion gets the global flatten. */}
        <div
          key={card}
          aria-live="polite"
          className={cn(
            'mt-4 flex flex-1 flex-col justify-center',
            !reduced && 'animate-in fade-in-0 duration-base ease-enter',
          )}
        >
          <CardBody card={card} recap={recap} showXp={showXp} biscuitText={biscuitText} />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIndex(Math.max(current - 1, 0))}
            disabled={current === 0}
            className={cn(
              'flex min-h-11 items-center justify-center rounded-control bg-white/15 px-5 text-sm font-semibold disabled:opacity-40',
              pressControl,
            )}
          >
            {PROGRESS_WEB_COPY.recapBack}
          </button>
          {isLast ? (
            <Link
              href="/meal-plan"
              className={cn(
                'flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-control bg-white px-5 text-sm font-semibold text-[#944a00]',
                pressControl,
              )}
            >
              {PROGRESS_COPY.recapPlanNext}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setIndex(current + 1)}
              className={cn(
                'flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-control bg-white px-5 text-sm font-semibold text-[#944a00]',
                pressControl,
              )}
            >
              {PROGRESS_WEB_COPY.recapNext}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 sm:py-8" data-testid="recap-page">
      <h1 className="sr-only">{PROGRESS_WEB_COPY.recapTitle}</h1>
      {body}
    </div>
  );
}
