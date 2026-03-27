'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { getRecipeImageProps } from '@/lib/recipe-image';
import { trpc } from '@/lib/trpc';
import { addDays, format } from 'date-fns';
import { ChevronLeft, ChevronRight, Flame, Save } from 'lucide-react';

type PortionKey = 0.5 | 1 | 1.5 | 2;
const PORTION_LABELS: Record<PortionKey, string> = { 0.5: '½×', 1: '1×', 1.5: '1½×', 2: '2×' };
const PORTION_OPTIONS: PortionKey[] = [0.5, 1, 1.5, 2];

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

const MEAL_COLOURS: Record<string, string> = {
  breakfast: 'bg-emerald-100 text-emerald-700',
  lunch: 'bg-orange-100 text-orange-700',
  dinner: 'bg-indigo-100 text-indigo-700',
  snack: 'bg-purple-100 text-purple-700',
};

export default function TrackerPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = toDateStr(selectedDate);
  const todayStr = toDateStr(new Date());
  const isToday = todayStr === dateStr;
  const isFuture = selectedDate > new Date() && !isToday;

  const { data, isLoading, refetch } = trpc.tracker.getDay.useQuery(
    { date: dateStr },
    { enabled: !isFuture, staleTime: 30_000 },
  );

  // checkedMeals: map recipeId+mealType → { checked, portion }
  const [checkedMeals, setCheckedMeals] = useState<
    Record<string, { checked: boolean; portion: PortionKey }>
  >({});
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [initialised, setInitialised] = useState<string | null>(null); // tracks which dateStr we initialised for

  const getKey = (recipeId: string, mealType: string) => `${recipeId}:${mealType}`;

  // When data loads, pre-populate from existing log (only once per dateStr)
  useEffect(() => {
    if (!data || initialised === dateStr) return;
    if (data.log) {
      const init: Record<string, { checked: boolean; portion: PortionKey }> = {};
      for (const m of data.log.loggedMeals) {
        init[getKey(m.recipeId, m.mealType)] = {
          checked: true,
          portion: m.portionMultiplier as PortionKey,
        };
      }
      setCheckedMeals(init);
    } else {
      setCheckedMeals({});
    }
    setInitialised(dateStr);
  }, [data, dateStr, initialised]);

  const upsertMutation = trpc.tracker.upsertDay.useMutation({
    onSuccess: () => {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      void refetch();
    },
  });

  const toggleMeal = (recipeId: string, mealType: string) => {
    const k = getKey(recipeId, mealType);
    setCheckedMeals((prev) => ({
      ...prev,
      [k]: { checked: !(prev[k]?.checked ?? false), portion: prev[k]?.portion ?? 1 },
    }));
    setSavedSuccess(false);
  };

  const setPortion = (recipeId: string, mealType: string, portion: PortionKey) => {
    const k = getKey(recipeId, mealType);
    setCheckedMeals((prev) => ({ ...prev, [k]: { ...prev[k], checked: true, portion } }));
    setSavedSuccess(false);
  };

  const handleSave = () => {
    if (!data) return;
    const loggedMeals = data.plannedMeals
      .filter((m) => checkedMeals[getKey(m.recipeId, m.mealType)]?.checked)
      .map((m) => {
        const portion = checkedMeals[getKey(m.recipeId, m.mealType)]?.portion ?? 1;
        return {
          recipeId: m.recipeId,
          mealType: m.mealType,
          portionMultiplier: portion,
          kcal: Math.round(m.kcal * portion),
          protein: Math.round(m.protein * portion * 10) / 10,
          carbs: Math.round(m.carbs * portion * 10) / 10,
          fat: Math.round(m.fat * portion * 10) / 10,
        };
      });
    if (loggedMeals.length === 0) return;
    upsertMutation.mutate({ date: dateStr, loggedMeals });
  };

  const changeDate = (delta: number) => {
    setSelectedDate((d) => addDays(d, delta));
    setCheckedMeals({});
    setSavedSuccess(false);
    setInitialised(null);
  };

  // Compute logged totals from current UI state
  const loggedMeals =
    data?.plannedMeals.filter((m) => checkedMeals[getKey(m.recipeId, m.mealType)]?.checked) ?? [];
  const loggedKcal = loggedMeals.reduce(
    (s, m) => s + Math.round(m.kcal * (checkedMeals[getKey(m.recipeId, m.mealType)]?.portion ?? 1)),
    0,
  );
  const loggedProtein = loggedMeals.reduce(
    (s, m) => s + m.protein * (checkedMeals[getKey(m.recipeId, m.mealType)]?.portion ?? 1),
    0,
  );
  const loggedCarbs = loggedMeals.reduce(
    (s, m) => s + m.carbs * (checkedMeals[getKey(m.recipeId, m.mealType)]?.portion ?? 1),
    0,
  );
  const loggedFat = loggedMeals.reduce(
    (s, m) => s + m.fat * (checkedMeals[getKey(m.recipeId, m.mealType)]?.portion ?? 1),
    0,
  );
  const target = data?.targets.dailyCalorieTarget ?? 2000;
  const pct = (v: number, t: number) => Math.min(Math.round((v / (t || 1)) * 100), 100);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          DAILY LOG
        </p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">Tracker</h1>
      </div>

      {/* Date selector */}
      <div className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => changeDate(-1)}
          className="rounded-xl p-1.5 hover:bg-neutral-100"
        >
          <ChevronLeft className="h-5 w-5 text-neutral-500" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-neutral-800">
            {isToday ? 'Today' : format(selectedDate, 'EEEE')}
          </p>
          <p className="text-xs text-neutral-400">{format(selectedDate, 'dd MMMM yyyy')}</p>
        </div>
        <button
          type="button"
          onClick={() => changeDate(1)}
          disabled={isToday}
          className="rounded-xl p-1.5 hover:bg-neutral-100 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5 text-neutral-500" />
        </button>
      </div>

      {isFuture && (
        <div className="rounded-2xl border border-dashed py-10 text-center text-sm text-neutral-400">
          Can&apos;t log future meals.
        </div>
      )}

      {!isFuture && isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      )}

      {!isFuture && !isLoading && data && (
        <>
          {/* Macro summary */}
          <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                {isToday ? "Today's Progress" : 'Day Progress'}
              </p>
              <span className="flex items-center gap-1 text-sm font-bold text-neutral-700">
                <Flame className="h-4 w-4 text-[#944a00]" />
                {loggedKcal.toLocaleString()} / {target.toLocaleString()} kcal
              </span>
            </div>
            {[
              { label: 'Calories', v: loggedKcal, t: target, unit: 'kcal', colour: 'bg-[#944a00]' },
              { label: 'Protein', v: loggedProtein, t: 150, unit: 'g', colour: 'bg-blue-500' },
              { label: 'Carbs', v: loggedCarbs, t: 250, unit: 'g', colour: 'bg-emerald-500' },
              { label: 'Fat', v: loggedFat, t: 70, unit: 'g', colour: 'bg-amber-400' },
            ].map(({ label, v, t, unit, colour }) => (
              <div key={label} className="mb-2">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-neutral-600">{label}</span>
                  <span className="text-neutral-400">
                    {Math.round(v)}
                    {unit} / {t}
                    {unit}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${colour} transition-all`}
                    style={{ width: `${pct(v, t)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Meal list */}
          {data.plannedMeals.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-10 text-center text-sm text-neutral-400">
              No meals planned for this day.{' '}
              <a href="/meal-plan" className="text-[#944a00] hover:underline">
                Go to Meal Planner →
              </a>
            </div>
          ) : (
            <div className="mb-6 space-y-3">
              {data.plannedMeals.map((meal) => {
                const k = getKey(meal.recipeId, meal.mealType);
                const isChecked = checkedMeals[k]?.checked ?? false;
                const portion = checkedMeals[k]?.portion ?? 1;
                const scaledKcal = Math.round(meal.kcal * portion);

                return (
                  <div
                    key={k}
                    className={`flex gap-3 rounded-2xl border p-3 transition-all ${isChecked ? 'border-[#944a00]/30 bg-[#fff8f0]' : 'border-neutral-200 bg-white'}`}
                  >
                    {/* Image */}
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                      <Image
                        {...getRecipeImageProps(meal.imageUrl)}
                        alt={meal.recipeName}
                        fill
                        sizes="56px"
                        className={`object-cover transition-opacity ${isChecked ? 'opacity-100' : 'opacity-60'}`}
                      />
                    </div>

                    {/* Details */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${MEAL_COLOURS[meal.mealType] ?? 'bg-gray-100 text-gray-600'}`}
                          >
                            {meal.mealType}
                          </span>
                          <p className="mt-0.5 text-sm font-medium text-neutral-800">
                            {meal.recipeName}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleMeal(meal.recipeId, meal.mealType)}
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${isChecked ? 'border-[#944a00] bg-[#944a00] text-white' : 'border-neutral-300 text-transparent hover:border-[#944a00]/50'}`}
                          aria-label={`${isChecked ? 'Uncheck' : 'Check'} ${meal.recipeName}`}
                        >
                          {isChecked && <span className="text-[10px] font-bold">✓</span>}
                        </button>
                      </div>

                      {/* Portion + kcal */}
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {PORTION_OPTIONS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setPortion(meal.recipeId, meal.mealType, p)}
                              className={`rounded-lg px-2 py-0.5 text-xs font-medium transition-all ${portion === p && isChecked ? 'bg-[#944a00] text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                            >
                              {PORTION_LABELS[p]}
                            </button>
                          ))}
                        </div>
                        <span className="text-xs text-neutral-400">{scaledKcal} kcal</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Save button */}
          {data.plannedMeals.length > 0 && (
            <button
              type="button"
              onClick={handleSave}
              disabled={loggedMeals.length === 0 || upsertMutation.isPending || savedSuccess}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#944a00] py-3 text-sm font-semibold text-white transition hover:bg-[#7a3d00] disabled:opacity-50"
            >
              {upsertMutation.isPending ? (
                'Saving…'
              ) : savedSuccess ? (
                '✓ Saved!'
              ) : (
                <>
                  <Save className="h-4 w-4" /> Log {loggedMeals.length} meal
                  {loggedMeals.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
