'use client';

import { AlertTriangle, Calculator, Loader2 } from 'lucide-react';
import { CountUp } from '@chefer/ui';
import { nutritionComputedCopy, nutritionIncompleteCopy } from '@chefer/utils';
import type { LiveNutrition } from '../hooks/useLiveNutrition';

// ─── Live nutrition card (plan-ingredient-catalog §10) ────────────────────────
// Per serving, computed in the browser with the shared engine; the server
// computes the same numbers on save. Counting up is MO-06 (CountUp honours
// reduced motion). PARTIAL says so instead of passing incomplete numbers off.

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString();

export function NutritionPreview({
  live,
  note,
}: {
  live: LiveNutrition;
  note?: string | undefined;
}) {
  const n = live.perServing;
  return (
    <div className="rounded-xl border bg-gray-50 p-4" data-testid="nutrition-preview">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Calories"
          value={n.calories}
          unit="kcal"
          format={(v) => String(Math.round(v))}
        />
        <Stat label="Protein" value={n.protein} unit="g" format={fmt1} />
        <Stat label="Carbs" value={n.carbs} unit="g" format={fmt1} />
        <Stat label="Fat" value={n.fat} unit="g" format={fmt1} />
      </div>
      <p role="status" className="mt-3 flex items-start gap-1.5 text-xs">
        {live.status === 'EMPTY' ? (
          <span className="text-gray-600">
            Add ingredients with amounts — nutrition is computed from them.
          </span>
        ) : live.loading ? (
          <>
            <Loader2
              className="mt-px h-3.5 w-3.5 shrink-0 animate-spin text-gray-500"
              aria-hidden="true"
            />
            <span className="text-gray-600">Computing from your ingredients…</span>
          </>
        ) : live.status === 'PARTIAL' ? (
          <>
            <AlertTriangle
              className="mt-px h-3.5 w-3.5 shrink-0 text-amber-700"
              aria-hidden="true"
            />
            <span className="min-w-0 font-medium text-amber-900">
              {nutritionIncompleteCopy(live.missingCount)}. The numbers above leave{' '}
              {live.missingCount === 1 ? 'it' : 'them'} out.
            </span>
          </>
        ) : (
          <>
            <Calculator className="mt-px h-3.5 w-3.5 shrink-0 text-green-700" aria-hidden="true" />
            <span className="min-w-0 text-gray-700">
              {nutritionComputedCopy(live.lineCount)}, per serving.
            </span>
          </>
        )}
      </p>
      {note && <p className="mt-1 text-xs text-gray-600">{note}</p>}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  format,
}: {
  label: string;
  value: number;
  unit: string;
  format: (v: number) => string;
}) {
  return (
    <div className="text-center">
      <p className="text-sm font-bold text-gray-900">
        <CountUp value={value} format={format} /> {unit}
      </p>
      <p className="text-xs text-gray-600">{label}</p>
    </div>
  );
}
