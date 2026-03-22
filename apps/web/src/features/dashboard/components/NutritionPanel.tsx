'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';

interface MacroBarProps {
  label: string;
  value: number;
  total: number;
  color: string;
}

function MacroBar({ label, value, total, color }: MacroBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span className="font-medium">{value}g</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function NutritionPanel() {
  const { data: plan, isLoading } = trpc.mealPlan.getActive.useQuery(undefined, {
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="h-3 w-full rounded bg-gray-200" />
          <div className="h-3 w-full rounded bg-gray-200" />
          <div className="h-3 w-full rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-serif text-base font-semibold text-gray-900">
          Today&apos;s Nutrition
        </h3>
        <p className="text-sm text-gray-500">
          No active meal plan.{' '}
          <Link href="/meal-plan" className="text-[#944a00] hover:underline">
            Generate one →
          </Link>
        </p>
      </div>
    );
  }

  // Use today's plan (day 0 = Monday … 6 = Sunday). JS getDay() returns 0=Sun.
  const jsDay = new Date().getDay();
  const todayIndex = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0
  const todayPlan = plan.days.find((d) => d.dayOfWeek === todayIndex) ?? plan.days[0];

  if (!todayPlan) {
    return null;
  }

  const totals = todayPlan.meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.recipe.nutritionInfo.calories,
      protein: acc.protein + m.recipe.nutritionInfo.protein,
      carbs: acc.carbs + m.recipe.nutritionInfo.carbs,
      fat: acc.fat + m.recipe.nutritionInfo.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-base font-semibold text-gray-900">Today&apos;s Nutrition</h3>
        <Link href="/meal-plan" className="text-xs text-[#944a00] hover:underline">
          View plan →
        </Link>
      </div>

      {/* Calorie ring (simple text version) */}
      <div className="mb-4 text-center">
        <p className="text-3xl font-bold text-[#944a00]">{totals.calories}</p>
        <p className="text-xs text-gray-400">kcal today</p>
      </div>

      {/* Macro bars */}
      <div className="space-y-3">
        <MacroBar
          label="Protein"
          value={totals.protein}
          total={totals.protein + totals.carbs + totals.fat}
          color="bg-blue-500"
        />
        <MacroBar
          label="Carbs"
          value={totals.carbs}
          total={totals.protein + totals.carbs + totals.fat}
          color="bg-amber-400"
        />
        <MacroBar
          label="Fat"
          value={totals.fat}
          total={totals.protein + totals.carbs + totals.fat}
          color="bg-rose-400"
        />
      </div>

      {/* Today's meals list */}
      <div className="mt-4 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Today&apos;s meals
        </p>
        {todayPlan.meals.map((m) => (
          <Link
            key={m.type}
            href={`/recipes/${m.recipe.id}?planId=${plan.planId}&day=${todayPlan.dayOfWeek}&meal=${m.type}`}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50"
          >
            <span className="capitalize text-gray-700">{m.type}</span>
            <span className="text-xs text-gray-400">{m.recipe.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
