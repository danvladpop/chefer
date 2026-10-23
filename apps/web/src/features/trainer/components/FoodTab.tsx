'use client';

import { localDate } from '@/features/gym/use-gym-bootstrap';
import { trpc } from '@/lib/trpc';
import { COACHING_DATA_COPY, type ClientSharingDto } from '@chefer/types';
import {
  foodDayParts,
  formatBodyWeight,
  formatDayWithWeekday,
  formatShortDay,
} from '@chefer/utils';
import { useTrainerUnit } from '../use-trainer-unit';

// ─── Client › Food (lane K2) ──────────────────────────────────────────────────
// The client's shared food log (last 7 days) and weigh-ins (last 3 months).
// Each part asks only while its switch is on; mobile's food-tab.tsx is the twin.
// Raw weight: the trend line waits for lane D1.

function WeightSpark({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${40 - ((p - min) / span) * 36 - 2}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-12 w-full" aria-hidden="true">
      <polyline
        points={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function FoodSection({ clientId, firstName }: { clientId: string; firstName: string }) {
  const food = trpc.trainer.client.food.useQuery(
    { clientId, today: localDate(), days: 7 },
    { retry: false },
  );
  if (food.isPending) {
    return <div className="h-40 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />;
  }
  if (food.isError) {
    return <p className="text-sm text-gray-700">{COACHING_DATA_COPY.food.notShared(firstName)}</p>;
  }
  return (
    <section
      aria-labelledby="trainer-food-title"
      data-testid="trainer-food"
      className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm"
    >
      <div>
        <h2 id="trainer-food-title" className="font-semibold text-gray-900">
          {COACHING_DATA_COPY.food.heading}
        </h2>
        <p className="text-xs text-gray-600">
          {COACHING_DATA_COPY.food.sharedSince(formatShortDay(food.data.sharedSince))}
        </p>
        {food.data.numbers === 'NONE' && (
          <p className="text-xs text-gray-600">
            {COACHING_DATA_COPY.week.numbersHidden(firstName)}
          </p>
        )}
      </div>
      <ul className="flex flex-col divide-y">
        {[...food.data.days].reverse().map((day) => (
          <li key={day.date} className="py-2" data-testid={`trainer-food-day-${day.date}`}>
            <p className="text-sm font-semibold text-gray-900">{formatDayWithWeekday(day.date)}</p>
            <p className="text-sm text-gray-600">{foodDayParts(day).join(' · ')}</p>
            {day.entries.map((entry, i) => (
              <p key={`${entry.name}-${i}`} className="min-w-0 break-words text-sm text-gray-800">
                {entry.name}
                {entry.onPlan ? ` · ${COACHING_DATA_COPY.food.onPlan}` : ''}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

function WeightSection({ clientId, firstName }: { clientId: string; firstName: string }) {
  const unit = useTrainerUnit();
  const system = unit === 'LB' ? 'IMPERIAL' : 'METRIC';
  const weight = trpc.trainer.client.weight.useQuery(
    { clientId, today: localDate() },
    { retry: false },
  );
  if (weight.isPending) {
    return <div className="h-28 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />;
  }
  if (weight.isError) {
    return (
      <p className="text-sm text-gray-700">{COACHING_DATA_COPY.weight.notShared(firstName)}</p>
    );
  }
  const entries = weight.data.entries;
  return (
    <section
      aria-labelledby="trainer-weight-title"
      data-testid="trainer-weight"
      className="flex flex-col gap-2 rounded-2xl border bg-white p-4 text-gray-900 shadow-sm"
    >
      <h2 id="trainer-weight-title" className="font-semibold">
        {COACHING_DATA_COPY.weight.heading}
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-600">{COACHING_DATA_COPY.weight.empty}</p>
      ) : (
        <>
          <WeightSpark points={entries.map((e) => e.weightKg)} />
          <ul className="flex flex-col gap-0.5">
            {[...entries]
              .reverse()
              .slice(0, 5)
              .map((e) => (
                <li key={e.date} className="text-sm text-gray-800">
                  {formatDayWithWeekday(e.date)} · {formatBodyWeight(e.weightKg, system)}
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function FoodTab({
  clientId,
  firstName,
  sharing,
}: {
  clientId: string;
  firstName: string;
  sharing: ClientSharingDto;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="trainer-food-tab">
      {sharing.food ? (
        <FoodSection clientId={clientId} firstName={firstName} />
      ) : (
        <p className="text-sm text-gray-700">{COACHING_DATA_COPY.food.notShared(firstName)}</p>
      )}
      {sharing.weight ? (
        <WeightSection clientId={clientId} firstName={firstName} />
      ) : (
        <p className="text-sm text-gray-700">{COACHING_DATA_COPY.weight.notShared(firstName)}</p>
      )}
    </div>
  );
}
