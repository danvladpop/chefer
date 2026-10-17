'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { trpc } from '@/lib/trpc';
import { keepPreviousData } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import { COACHING_COPY, FRIENDS_LIMITS, type TrainerSummaryDto } from '@chefer/types';
import { Button, pressCard } from '@chefer/ui';
import { cn, userFacingErrorMessage } from '@chefer/utils';
import { TrainerNameBlock } from './TrainerBadge';

// ─── /coaching/find (PRD 2026-10 §4.1) ────────────────────────────────────────
// Trainers only, by name only; needs no Following. Each result opens the
// trainer's profile, where "Ask to coach me" lives.

const MIN_CHARS = FRIENDS_LIMITS.searchMinChars;
const DEBOUNCE_MS = 300;

function TrainerResult({ trainer }: { trainer: TrainerSummaryDto }) {
  return (
    <li>
      <Link
        href={`/coaching/trainers/${encodeURIComponent(trainer.trainerId)}`}
        className={cn(
          'flex min-h-11 min-w-0 items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm hover:bg-neutral-50',
          pressCard,
        )}
        data-testid="find-trainer-result"
      >
        <span className="min-w-0 flex-1">
          <TrainerNameBlock name={trainer.name} gymLine={trainer.gymLine} />
          {!trainer.acceptingClients && (
            <span className="mt-1 block text-sm font-medium text-gray-700">
              {COACHING_COPY.find.notTaking}
            </span>
          )}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function FindTrainer() {
  const copy = COACHING_COPY.find;
  const inputId = useId();
  const hintId = useId();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const searching = debounced.length >= MIN_CHARS;

  const results = trpc.coaching.findTrainers.useInfiniteQuery(
    { query: debounced },
    {
      enabled: searching,
      retry: false,
      staleTime: 30_000,
      placeholderData: keepPreviousData,
      getNextPageParam: (last) => last.nextCursor,
    },
  );
  const trainers = searching ? (results.data?.pages.flatMap((p) => p.items) ?? []) : [];
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_CHARS;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="font-serif text-2xl font-bold text-gray-900">{copy.title}</h1>
        <p className="mt-1 text-sm text-gray-600">{copy.entryHint}</p>
      </div>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {copy.searchLabel}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.searchPlaceholder}
            autoComplete="off"
            maxLength={FRIENDS_LIMITS.searchMaxChars}
            aria-describedby={tooShort ? hintId : undefined}
            className="h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
          />
        </div>
        {tooShort && (
          <p id={hintId} className="text-xs text-gray-500">
            {copy.tooShort}
          </p>
        )}
      </form>

      <div aria-live="polite" className="flex flex-col gap-3">
        {searching && results.isError ? (
          <p role="alert" className="text-sm text-red-700">
            {userFacingErrorMessage(results.error)}
          </p>
        ) : searching && results.isLoading ? (
          <div className="h-20 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
        ) : searching && trainers.length === 0 && results.isSuccess ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
            {copy.empty}
          </p>
        ) : trainers.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label={copy.title}>
            {trainers.map((t) => (
              <TrainerResult key={t.trainerId} trainer={t} />
            ))}
          </ul>
        ) : null}
        {searching && results.hasNextPage && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 self-start"
            loading={results.isFetchingNextPage}
            onClick={() => void results.fetchNextPage()}
          >
            Show more
          </Button>
        )}
      </div>
    </div>
  );
}
