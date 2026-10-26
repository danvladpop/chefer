'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ShareCardButton } from '@/features/share/share-card-button';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ErrorState, Switch } from '@chefer/ui';
import {
  addDaysLocal,
  lastCompletedWeekStart,
  localDateStr,
  RECAP_COPY,
  recapFoodLines,
  recapGymLines,
  recapShareMessage,
} from '@chefer/utils';

// ─── Your week in review (market review 2026-10, lane E2) ─────────────────────
// The web twin of the mobile recap screen, and where the Monday email's "Look
// back at last week" lands. Only what happened is shown; a quiet week says so
// kindly. The share card's contents are the user's pick (protein days opt-in).

const CARD = 'rounded-2xl border bg-white p-4 shadow-sm sm:p-5';

function RecapContent() {
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

  const foodLines = recap ? recapFoodLines(recap.food) : [];
  const gymLines = recap?.gym ? recapGymLines(recap.gym) : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight">{RECAP_COPY.title}</h1>

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
              aria-label={RECAP_COPY.previousWeek}
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
              aria-label={RECAP_COPY.nextWeek}
              disabled={recap.weekStart >= newest}
              onClick={() => setWeekStart(addDaysLocal(recap.weekStart, 7))}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-primary/5 disabled:opacity-40"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {recap.empty ? (
            <section data-testid="recap-quiet" className={CARD}>
              <h2 className="font-semibold text-gray-900">{RECAP_COPY.quietTitle}</h2>
              <p className="mt-1 text-sm text-gray-600">{RECAP_COPY.quietBody}</p>
            </section>
          ) : (
            <>
              <section aria-labelledby="recap-food" className={CARD}>
                <h2 id="recap-food" className="font-semibold text-gray-900">
                  {RECAP_COPY.foodHeading}
                </h2>
                {foodLines.length > 0 ? (
                  <ul className="mt-2 grid gap-1 text-sm text-gray-900">
                    {foodLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-gray-600">{RECAP_COPY.foodQuiet}</p>
                )}
                {recap.food.newRecipes.length > 0 && (
                  <>
                    <h3 className="mt-3 text-sm font-semibold text-gray-600">
                      {RECAP_COPY.newRecipesHeading}
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
                    {RECAP_COPY.gymHeading}
                  </h2>
                  <ul className="mt-2 grid gap-1 text-sm text-gray-900">
                    {gymLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    {recap.gym.prs.map((pr) => (
                      <li key={pr.exerciseName} className="text-gray-600">
                        {pr.exerciseName}: {pr.label}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="recap-share" className={CARD}>
                <h2 id="recap-share" className="font-semibold text-gray-900">
                  {RECAP_COPY.shareSheetTitle}
                </h2>
                <ul className="mt-2 divide-y">
                  {(
                    [
                      ['cooking', RECAP_COPY.shareCooking, true],
                      ['protein', RECAP_COPY.shareProtein, recap.food.proteinDays !== null],
                      ['training', RECAP_COPY.shareTraining, recap.gym !== null],
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
                <p className="mt-2 text-xs text-gray-500">{RECAP_COPY.shareNote}</p>
                <ShareCardButton
                  className="mt-3"
                  testId="recap-share-button"
                  label={RECAP_COPY.share}
                  input={{ kind: 'recap', weekStart: recap.weekStart, localDate: today, include }}
                  message={recapShareMessage(recap.label)}
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
