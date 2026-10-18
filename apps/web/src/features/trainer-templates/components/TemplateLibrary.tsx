'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { QueryError } from '@/features/trainer-mode/components/QueryError';
import { trpc } from '@/lib/trpc';
import { ChevronRight, Dumbbell, Plus, Search } from 'lucide-react';
import { TEMPLATE_COPY, type WorkoutTemplateSummaryDto } from '@chefer/types';
import { buttonVariants, pressCard } from '@chefer/ui';
import {
  cn,
  filterTemplates,
  formatShortDay,
  templateSummaryLine,
  templateWorkoutTypes,
  workoutTypeLabel,
  type TemplateTypeFilter,
} from '@chefer/utils';
import { NEW_TEMPLATE_ID } from '../template-draft';

// ─── Workouts: the template library (trainer-mode.md §6.6, M2) ────────────────
// The trainer's templates, most recently edited first: name, workout type,
// size, estimated minutes, who has it and when it was last edited. Search and
// a workout type filter; "New template" opens the editor on /new (the template
// is created on its first save).

const copy = TEMPLATE_COPY.library;
const NEW_HREF = `/trainer/workouts/${NEW_TEMPLATE_ID}`;

function TemplateRow({ template }: { template: WorkoutTemplateSummaryDto }) {
  return (
    <li>
      <Link
        href={`/trainer/workouts/${encodeURIComponent(template.id)}`}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm hover:bg-neutral-50',
          // MO-01 card press.
          pressCard,
        )}
        data-testid="template-row"
      >
        <span className="min-w-0 flex-1">
          <span className="block min-w-0 break-words font-semibold text-gray-900">
            {template.name}
          </span>
          <span className="block min-w-0 break-words text-sm text-gray-600">
            {templateSummaryLine(template)}
          </span>
          <span className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
            <span data-testid="template-row-assigned">{copy.assigned(template.assignedCount)}</span>
            <span>{copy.edited(formatShortDay(template.updatedAt))}</span>
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
      </Link>
    </li>
  );
}

function EmptyLibrary() {
  return (
    <section
      aria-labelledby="template-library-empty"
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center sm:p-8"
      data-testid="template-library-empty"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff3e8] text-[#944a00]">
        <Dumbbell className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 id="template-library-empty" className="font-semibold text-gray-900">
        {copy.emptyTitle}
      </h2>
      <p className="max-w-sm text-sm text-gray-600">{copy.emptyBody}</p>
      <Link href={NEW_HREF} className={cn(buttonVariants(), 'min-h-11')}>
        <Plus className="h-4 w-4" aria-hidden="true" /> {copy.newTemplate}
      </Link>
    </section>
  );
}

export function TemplateLibrary() {
  const searchId = useId();
  const typeId = useId();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TemplateTypeFilter>('ALL');
  const list = trpc.trainer.templates.list.useQuery(undefined, { retry: false, staleTime: 15_000 });

  const rows = list.data ?? [];
  // Only the types the trainer actually used, so the filter never offers an empty result.
  const usedTypes = templateWorkoutTypes(rows);
  // A filter on a type no template uses any more shows everything.
  const activeType = type !== 'ALL' && usedTypes.includes(type) ? type : 'ALL';
  const shown = filterTemplates(rows, query, activeType);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 font-serif text-2xl font-bold text-gray-900">{copy.title}</h1>
        {rows.length > 0 && (
          <Link href={NEW_HREF} className={cn(buttonVariants(), 'min-h-11')}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {copy.newTemplate}
          </Link>
        )}
      </div>

      {list.isLoading ? (
        <div
          className="h-32 animate-pulse rounded-2xl bg-gray-100"
          aria-hidden="true"
          data-testid="template-library-loading"
        />
      ) : list.isError ? (
        <QueryError error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="relative min-w-0 flex-1">
              <label htmlFor={searchId} className="sr-only">
                {copy.search}
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <input
                id={searchId}
                type="search"
                value={query}
                placeholder={copy.search}
                autoComplete="off"
                enterKeyHint="search"
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
              />
            </div>
            {usedTypes.length > 0 && (
              <div className="flex min-w-0 shrink-0 items-center gap-2">
                <label htmlFor={typeId} className="text-sm font-medium text-gray-700">
                  {TEMPLATE_COPY.editor.workoutType}
                </label>
                <select
                  id={typeId}
                  value={activeType}
                  onChange={(e) => setType(e.target.value as TemplateTypeFilter)}
                  className="h-11 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
                >
                  <option value="ALL">{copy.filterAll}</option>
                  {usedTypes.map((t) => (
                    <option key={t} value={t}>
                      {workoutTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {shown.length === 0 ? (
            <p
              role="status"
              className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600"
            >
              {query.trim() ? copy.searchEmpty(query.trim()) : copy.emptyTitle}
            </p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label={copy.title}>
              {shown.map((template) => (
                <TemplateRow key={template.id} template={template} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
