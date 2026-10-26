'use client';

import Link from 'next/link';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@chefer/ui';

// ─── Admin: curated pool coverage (market review F2) ──────────────────────────
// Where the free pool is thin, counted the way users are served. A meal type
// is eaten once a day, so a pool of N repeats within N ÷ 7 weeks: red cells
// repeat within 2 weeks, amber within 4.

type Report = RouterOutputs['curatedAdmin']['coverage'];
type Row = Report['byDiet'][number];

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

function cellClass(n: number, heat: boolean): string {
  if (!heat) return '';
  if (n < 14) return 'bg-red-50 text-red-800 font-semibold';
  if (n < 28) return 'bg-amber-50 text-amber-900';
  return '';
}

function CountTable({
  title,
  rows,
  heat = false,
  total = false,
}: {
  title: string;
  rows: (Row & { total?: number })[];
  heat?: boolean;
  total?: boolean;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-base font-semibold text-gray-900">{title}</h2>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="w-full min-w-[28rem] text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {title}
              </th>
              {MEALS.map((m) => (
                <th key={m} scope="col" className="px-3 py-2 text-right font-medium capitalize">
                  {m}
                </th>
              ))}
              {total && (
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Total
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="px-3 py-2 text-left font-normal text-gray-800">
                  {r.label}
                </th>
                {MEALS.map((m) => (
                  <td
                    key={m}
                    className={cn(
                      'px-3 py-2 text-right tabular-nums',
                      cellClass(r.counts[m], heat),
                    )}
                  >
                    {r.counts[m]}
                  </td>
                ))}
                {total && <td className="px-3 py-2 text-right tabular-nums">{r.total}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CoverageReport() {
  const { data, isLoading } = trpc.curatedAdmin.coverage.useQuery();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/admin/recipes"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-gray-600 hover:text-[#944a00]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Queue
      </Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Admin</p>
      <h1 className="font-serif text-2xl font-bold text-gray-900">Pool coverage</h1>
      {isLoading || !data ? (
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-500">
            {data.total} recipes in the free pool ({data.ingested} ingested). A meal type is eaten
            once a day, so a pool of N repeats within N ÷ 7 weeks.{' '}
            <span className="rounded bg-red-50 px-1 text-red-800">Red</span> repeats within 2 weeks,{' '}
            <span className="rounded bg-amber-50 px-1 text-amber-900">amber</span> within 4.
          </p>
          <CountTable
            title="Meal type"
            rows={[{ id: 'all', label: 'All recipes', counts: data.byMealType }]}
            heat
          />
          <CountTable title="Household profile" rows={data.profiles} heat />
          <CountTable title="Diet (as served)" rows={data.byDiet} heat />
          <CountTable title="Allergen-free" rows={data.byAllergenFree} heat />
          <CountTable title="Prep + cook time" rows={data.byPrepTime} />
          <CountTable title="Cuisine" rows={data.byCuisine} total />
        </>
      )}
    </div>
  );
}
