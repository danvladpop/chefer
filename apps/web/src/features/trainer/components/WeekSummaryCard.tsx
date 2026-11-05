'use client';

import { localDate } from '@/features/gym/use-gym-bootstrap';
import { trpc } from '@/lib/trpc';
import { COACHING_DATA_COPY } from '@chefer/types';
import { formatBodyWeight, formatDayWithWeekday, weekSummaryLines } from '@chefer/utils';
import { useTrainerUnit } from '../use-trainer-unit';

// ─── Client › "Last 7 days" (lane K2) ─────────────────────────────────────────
// Workouts against the goal always; the food log and weight only while the
// client shares them (the API sends neither otherwise). The words come from
// `weekSummaryLines`, the same lines mobile renders. Weights in the trainer's
// own gym unit.

function Section({ title, lines, testId }: { title: string; lines: string[]; testId: string }) {
  return (
    <div data-testid={testId}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      {lines.map((line) => (
        <p key={line} className="text-sm text-gray-800">
          {line}
        </p>
      ))}
    </div>
  );
}

export function WeekSummaryCard({ clientId, firstName }: { clientId: string; firstName: string }) {
  const unit = useTrainerUnit();
  const week = trpc.trainer.client.weekSummary.useQuery(
    { clientId, today: localDate() },
    { retry: false, staleTime: 30_000 },
  );
  if (week.isPending) {
    return <div className="h-28 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />;
  }
  if (week.isError) return null;
  const system = unit === 'LB' ? 'IMPERIAL' : 'METRIC';
  const lines = weekSummaryLines(week.data, firstName, {
    weightKg: (kg, signed) => formatBodyWeight(kg, system, signed ? { signed: true } : {}),
    date: formatDayWithWeekday,
  });
  return (
    <section
      aria-labelledby="trainer-week-title"
      data-testid="trainer-week"
      className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm"
    >
      <h2 id="trainer-week-title" className="font-semibold text-gray-900">
        {COACHING_DATA_COPY.week.title}
      </h2>
      <p className="text-sm text-gray-800" data-testid="trainer-week-workouts">
        {lines.workouts}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {lines.food && (
          <Section
            testId="trainer-week-food"
            title={COACHING_DATA_COPY.food.heading}
            lines={lines.food}
          />
        )}
        {lines.weight && (
          <Section
            testId="trainer-week-weight"
            title={COACHING_DATA_COPY.weight.heading}
            lines={lines.weight}
          />
        )}
      </div>
      {lines.notShared && (
        <div data-testid="trainer-week-not-shared">
          <p className="text-sm text-gray-700">{lines.notShared.title}</p>
          <p className="text-xs text-gray-600">{lines.notShared.hint}</p>
        </div>
      )}
    </section>
  );
}
