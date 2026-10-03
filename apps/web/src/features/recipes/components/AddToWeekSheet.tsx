'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { FRIENDS_COPY } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import {
  addToWeekSlotRows,
  canPickNextWeek,
  cn,
  dayOfMonth,
  defaultDay,
  isPastDay,
  readAddToWeekFailure,
  weekdayLongName,
  weekdayShortName,
  type AddToWeekFailure,
  type AddToWeekSlotRow,
} from '@chefer/utils';

// ─── Add to my week (UX-REC-08 on web; the twin of the phone's sheet) ─────────
// A day + meal picker over the viewer's own week (`mealPlan.getForWeek` +
// `mealPlan.getShape`) that adds the recipe through `recipe.addToWeek`. An empty
// slot adds directly; a filled slot asks "Replace {meal}?" first, in the same
// dialog. A clash with the viewer's table shows the conflict line and `Use
// anyway`. No plan for that week → `Make a plan`. The page shows the
// "Added to Tue lunch" toast with Undo (`recipe.undoAddToWeek`) from
// `onAdded`, so it outlives this sheet.

export type AddToWeekResult = RouterOutputs['recipe']['addToWeek'];

export function AddToWeekSheet({
  open,
  onClose,
  recipe,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  recipe: { id: string; name: string; kcal: number };
  onAdded: (result: AddToWeekResult) => void;
}) {
  const utils = trpc.useUtils();
  const nextWeekAllowed = canPickNextWeek();
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);
  const [day, setDay] = useState(() => defaultDay(0));
  const [selected, setSelected] = useState<AddToWeekSlotRow | null>(null);
  const [failure, setFailure] = useState<AddToWeekFailure | null>(null);
  const [confirming, setConfirming] = useState(false);

  const week = trpc.mealPlan.getForWeek.useQuery({ weekOffset }, { retry: false, enabled: open });
  const shape = trpc.mealPlan.getShape.useQuery(undefined, { staleTime: 60_000, enabled: open });
  const add = trpc.recipe.addToWeek.useMutation({ meta: { silent: true } });

  const plan = week.data;
  const rows = plan ? addToWeekSlotRows(plan, day, shape.data?.slots ?? []) : [];
  const dayLabel = weekdayShortName(day);
  const noPlan = failure?.kind === 'noPlan' || (!week.isLoading && !week.isError && plan === null);

  const switchWeek = (next: 0 | 1) => {
    setWeekOffset(next);
    setDay(defaultDay(next));
    setSelected(null);
    setFailure(null);
    setConfirming(false);
  };
  const pickDay = (d: number) => {
    setDay(d);
    setSelected(null);
    setFailure(null);
    setConfirming(false);
  };

  const submit = async (acknowledgeConflict: boolean) => {
    if (!selected) return;
    setFailure(null);
    try {
      const result = await add.mutateAsync({
        recipeId: recipe.id,
        weekOffset,
        dayOfWeek: day,
        mealType: selected.mealType,
        mode: selected.mode,
        ...(selected.slotIndex !== null ? { slotIndex: selected.slotIndex } : {}),
        ...(acknowledgeConflict ? { acknowledgeConflict: true } : {}),
      });
      void utils.mealPlan.getForWeek.invalidate();
      void utils.recipe.list.invalidate();
      void utils.dashboard.summary.invalidate();
      setConfirming(false);
      onAdded(result);
      onClose();
    } catch (error) {
      setConfirming(false);
      setFailure(readAddToWeekFailure(error));
    }
  };

  const onCta = () => {
    if (!selected || add.isPending) return;
    if (selected.mode === 'replace') setConfirming(true);
    else void submit(false);
  };

  const ctaLabel = selected
    ? FRIENDS_COPY.addToWeek.cta(dayLabel, selected.mealType)
    : FRIENDS_COPY.addToWeek.title;

  const footer = noPlan ? null : confirming && selected ? (
    <div className="flex flex-col gap-2 px-5 pb-5 pt-3" data-testid="add-to-week-confirm">
      <p className="text-sm font-semibold text-gray-900">
        {FRIENDS_COPY.addToWeek.replaceTitle(selected.currentName ?? selected.mealType)}
      </p>
      <p className="text-sm text-gray-600">
        {FRIENDS_COPY.addToWeek.replaceBody(recipe.name, dayLabel, selected.mealType)}
      </p>
      <Button
        type="button"
        data-testid="add-to-week-replace"
        loading={add.isPending}
        onClick={() => void submit(false)}
      >
        {FRIENDS_COPY.addToWeek.replace}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={add.isPending}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </div>
  ) : (
    <div className="px-5 pb-5 pt-3">
      <Button
        type="button"
        size="lg"
        className="w-full"
        data-testid="add-to-week-cta"
        disabled={!selected}
        loading={add.isPending}
        onClick={onCta}
      >
        {ctaLabel}
      </Button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!add.isPending) onClose();
      }}
      title={FRIENDS_COPY.addToWeek.title}
      description={FRIENDS_COPY.addToWeek.eyebrow(recipe.name, Math.round(recipe.kcal))}
      size="md"
      footer={footer}
    >
      <div className="flex flex-col gap-4 px-5 pb-4 pt-1" data-testid="add-to-week-sheet">
        {nextWeekAllowed && (
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {([0, 1] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={weekOffset === w}
                data-testid={w === 0 ? 'add-to-week-this-week' : 'add-to-week-next-week'}
                onClick={() => switchWeek(w)}
                className={cn(
                  'min-h-11 flex-1 rounded-md text-sm font-medium',
                  weekOffset === w ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600',
                )}
              >
                {w === 0 ? FRIENDS_COPY.addToWeek.thisWeek : FRIENDS_COPY.addToWeek.nextWeek}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-between gap-1">
          {Array.from({ length: 7 }, (_, d) => {
            const past = isPastDay(weekOffset, d);
            const isSelected = d === day;
            return (
              <button
                key={d}
                type="button"
                data-testid={`add-to-week-day-${d}`}
                aria-label={weekdayLongName(d)}
                aria-pressed={isSelected}
                disabled={past}
                onClick={() => pickDay(d)}
                className={cn(
                  'flex h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-xl text-xs',
                  isSelected ? 'bg-[#944a00] text-white' : 'bg-gray-50 text-gray-700',
                  past && 'opacity-40',
                )}
              >
                <span className="font-semibold">{weekdayShortName(d)}</span>
                <span className={isSelected ? 'text-white' : 'text-gray-500'}>
                  {dayOfMonth(weekOffset, d)}
                </span>
              </button>
            );
          })}
        </div>

        {week.isLoading ? (
          <div data-testid="add-to-week-loading" className="flex animate-pulse flex-col gap-2">
            <div className="h-12 rounded-xl bg-gray-100" />
            <div className="h-12 rounded-xl bg-gray-100" />
            <div className="h-12 rounded-xl bg-gray-100" />
          </div>
        ) : noPlan ? (
          <div data-testid="add-to-week-no-plan" className="flex flex-col items-start gap-3 py-2">
            <p className="text-sm text-gray-800">{FRIENDS_COPY.addToWeek.noPlan}</p>
            <Button asChild variant="outline">
              <Link href="/meal-plan">{FRIENDS_COPY.addToWeek.makePlan}</Link>
            </Button>
          </div>
        ) : week.isError ? (
          <p data-testid="add-to-week-load-error" role="alert" className="text-sm text-red-600">
            {FRIENDS_COPY.relation.error}
          </p>
        ) : (
          <div role="radiogroup" aria-label="Meal slot" className="flex flex-col gap-2">
            {rows.map((row) => {
              const isSelected = selected?.key === row.key;
              const action =
                row.mode === 'add'
                  ? FRIENDS_COPY.addToWeek.addHere
                  : FRIENDS_COPY.addToWeek.replace;
              return (
                <button
                  key={row.key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  data-testid={`add-to-week-slot-${row.key}`}
                  onClick={() => {
                    setSelected(row);
                    setFailure(null);
                    setConfirming(false);
                  }}
                  className={cn(
                    'flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left',
                    isSelected ? 'border-[#944a00] bg-[#fff3e8]' : 'border-gray-200',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase text-gray-500">
                      {row.mealType}
                    </span>
                    {row.currentName && (
                      <span className="block truncate text-sm text-gray-900">
                        {row.currentName}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-[#944a00]">{action}</span>
                </button>
              );
            })}
          </div>
        )}

        {failure?.kind === 'conflict' ? (
          <div
            data-testid="add-to-week-conflict"
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2"
          >
            <p role="alert" className="text-sm text-red-700">
              {failure.message}
            </p>
            {failure.canAcknowledge && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                data-testid="add-to-week-use-anyway"
                disabled={add.isPending}
                onClick={() => void submit(true)}
              >
                {FRIENDS_COPY.addToWeek.useAnyway}
              </Button>
            )}
          </div>
        ) : failure?.kind === 'error' ? (
          <p data-testid="add-to-week-error" role="alert" className="text-sm text-red-600">
            {FRIENDS_COPY.relation.error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
