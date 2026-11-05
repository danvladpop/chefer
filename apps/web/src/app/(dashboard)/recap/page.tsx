'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ShareCardButton } from '@/features/share/share-card-button';
import { capture } from '@/lib/analytics';
import { useT } from '@/lib/i18n';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Translator } from '@chefer/i18n';
import { ErrorState, Switch } from '@chefer/ui';
import { addDaysLocal, lastCompletedWeekStart, localDateStr } from '@chefer/utils';

// ─── Your week in review (market review 2026-10, lane E2) ─────────────────────
// The web twin of the mobile recap screen, and where the Monday email's "Look
// back at last week" lands. Only what happened is shown; a quiet week says so
// kindly. The share card's contents are the user's pick (protein days opt-in).

const CARD = 'rounded-2xl border bg-white p-4 shadow-sm sm:p-5';

type Recap = RouterOutputs['recap']['week'];

/** The food lines: only non-zero facts (as recapFoodLines in @chefer/utils). */
function recapFoodLinesT(food: Recap['food'], t: Translator['t']): string[] {
  const lines: string[] = [];
  if (food.cookedFromPlan > 0) {
    lines.push(t('today.recap.food.cookedFromPlan', { count: food.cookedFromPlan }));
  }
  if (food.newRecipesTried > 0) {
    lines.push(t('today.recap.food.newRecipesTried', { count: food.newRecipesTried }));
  }
  if (food.proteinDays && food.proteinDays.hit > 0) {
    lines.push(
      t('today.recap.food.proteinDays', {
        count: food.proteinDays.logged,
        hit: food.proteinDays.hit,
      }),
    );
  }
  return lines;
}

/** The training lines: only non-zero facts (as recapGymLines in @chefer/utils). */
function recapGymLinesT(gym: NonNullable<Recap['gym']>, t: Translator['t']): string[] {
  const lines: string[] = [];
  if (gym.sessions > 0) lines.push(t('today.recap.gym.sessions', { count: gym.sessions }));
  if (gym.prCount > 0) lines.push(t('today.recap.gym.prCount', { count: gym.prCount }));
  if (gym.streakWeeks > 0) {
    lines.push(t('today.recap.gym.streakWeeks', { count: gym.streakWeeks }));
  }
  return lines;
}

function RecapContent() {
  const { t } = useT();
  const params = useSearchParams();
  const [weekStart, setWeekStart] = useState<string | undefined>(params.get('week') ?? undefined);
  const today = localDateStr();
  const newest = lastCompletedWeekStart(today);
  const query = trpc.recap.week.useQuery({ weekStart, localDate: today });
  const [include, setInclude] = useState({ cooking: true, protein: false, training: true });
  const recap = query.data;
  const loaded = recap !== undefined;
  useEffect(() => {
    if (!recap) return;
    capture('weekly_recap_viewed', {
      from: params.get('from') === 'email' ? 'link' : 'menu',
      empty: recap.empty,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opened page
  }, [loaded]);

  const foodLines = recap ? recapFoodLinesT(recap.food, t) : [];
  const gymLines = recap?.gym ? recapGymLinesT(recap.gym, t) : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight">{t('today.recap.title')}</h1>

      {query.isError && (
        <ErrorState
          className="mt-6"
          onRetry={() => void query.refetch()}
          retrying={query.isRefetching}
        />
      )}

      {recap && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex min-h-11 items-center justify-between">
            <button
              type="button"
              aria-label={t('today.recap.previousWeek')}
              onClick={() => setWeekStart(addDaysLocal(recap.weekStart, -7))}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-primary/5"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <p data-testid="recap-week" className="font-semibold text-gray-900">
              {recap.label}
            </p>
            <button
              type="button"
              aria-label={t('today.recap.nextWeek')}
              disabled={recap.weekStart >= newest}
              onClick={() => setWeekStart(addDaysLocal(recap.weekStart, 7))}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-primary/5 disabled:opacity-40"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {recap.empty ? (
            <section data-testid="recap-quiet" className={CARD}>
              <h2 className="font-semibold text-gray-900">{t('today.recap.quietTitle')}</h2>
              <p className="mt-1 text-sm text-gray-600">{t('today.recap.quietBody')}</p>
            </section>
          ) : (
            <>
              <section aria-labelledby="recap-food" className={CARD}>
                <h2 id="recap-food" className="font-semibold text-gray-900">
                  {t('today.recap.foodHeading')}
                </h2>
                {foodLines.length > 0 ? (
                  <ul className="mt-2 grid gap-1 text-sm text-gray-900">
                    {foodLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-gray-600">{t('today.recap.foodQuiet')}</p>
                )}
                {recap.food.newRecipes.length > 0 && (
                  <>
                    <h3 className="mt-3 text-sm font-semibold text-gray-600">
                      {t('today.recap.newRecipesHeading')}
                    </h3>
                    <ul className="mt-1 grid gap-1 text-sm text-gray-900">
                      {recap.food.newRecipes.map((r) => (
                        <li key={r.id} className="min-w-0 truncate">
                          {r.name}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              {recap.gym && gymLines.length > 0 && (
                <section aria-labelledby="recap-gym" className={CARD}>
                  <h2 id="recap-gym" className="font-semibold text-gray-900">
                    {t('today.recap.gymHeading')}
                  </h2>
                  <ul className="mt-2 grid gap-1 text-sm text-gray-900">
                    {gymLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    {recap.gym.prs.map((pr) => (
                      <li key={pr.exerciseName} className="text-gray-600">
                        {t('today.engagement.recapScreen.pr', {
                          exercise: pr.exerciseName,
                          value: pr.label,
                        })}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="recap-share" className={CARD}>
                <h2 id="recap-share" className="font-semibold text-gray-900">
                  {t('today.recap.shareSheetTitle')}
                </h2>
                <ul className="mt-2 divide-y">
                  {(
                    [
                      ['cooking', t('today.recap.shareCooking'), true],
                      ['protein', t('today.recap.shareProtein'), recap.food.proteinDays !== null],
                      ['training', t('today.recap.shareTraining'), recap.gym !== null],
                    ] as const
                  )
                    .filter(([, , available]) => available)
                    .map(([key, label]) => (
                      <li
                        key={key}
                        className="flex min-h-11 items-center justify-between gap-4 py-1"
                      >
                        <span id={`recap-pick-${key}`} className="text-sm text-gray-900">
                          {label}
                        </span>
                        <Switch
                          checked={include[key]}
                          onCheckedChange={(on) => setInclude((i) => ({ ...i, [key]: on }))}
                          aria-labelledby={`recap-pick-${key}`}
                        />
                      </li>
                    ))}
                </ul>
                <p className="mt-2 text-xs text-gray-500">{t('today.recap.shareNote')}</p>
                <ShareCardButton
                  className="mt-3"
                  testId="recap-share-button"
                  label={t('today.recap.share')}
                  input={{ kind: 'recap', weekStart: recap.weekStart, localDate: today, include }}
                  message={t('today.recap.shareMessage', { label: recap.label })}
                />
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 15 static rendering).
export default function RecapPage() {
  return (
    <Suspense>
      <RecapContent />
    </Suspense>
  );
}
