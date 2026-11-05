'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { BarChart3, ChevronRight, Link2, Loader2 } from 'lucide-react';
import { cn, pressControl } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';
import { QUEUE_TABS, STATUS_CLASS, STATUS_LABEL } from '../lib/status';

// ─── Admin: curated recipe ingest queue (market review F1) ────────────────────
// Paste a recipe-video or web link; the extractor reads it in the background
// and the draft lands under "Needs review". Nothing here reaches users until
// an admin approves it on the review screen.

const POLL_MS = 4000;

export function IngestQueue() {
  const [url, setUrl] = useState('');
  const [tab, setTab] = useState(QUEUE_TABS[0]!.id);
  const urlId = useId();
  const errorId = useId();
  const statuses = QUEUE_TABS.find((t) => t.id === tab)?.statuses ?? [];

  const utils = trpc.useUtils();
  const budget = trpc.curatedAdmin.budget.useQuery();
  const list = trpc.curatedAdmin.list.useQuery(
    { statuses },
    {
      // Poll while anything is still being read.
      refetchInterval: (q) => ((q.state.data?.counts.EXTRACTING ?? 0) > 0 ? POLL_MS : false),
    },
  );
  const ingest = trpc.curatedAdmin.ingest.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setUrl('');
      void utils.curatedAdmin.list.invalidate();
      void utils.curatedAdmin.budget.invalidate();
    },
  });

  const counts = list.data?.counts ?? {};
  const capReached = budget.data ? budget.data.remaining <= 0 : false;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Admin</p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Curated recipes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Paste a cooking video or recipe page. We extract the facts, rewrite the words in
            Chefer&apos;s voice and keep the link as attribution. You approve every recipe before it
            reaches the free pool.
          </p>
        </div>
        <Link
          href="/admin/recipes/coverage"
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:border-[#944a00]/40 hover:text-[#944a00]',
            pressControl,
          )}
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Pool coverage
        </Link>
      </div>

      <form
        className="rounded-2xl border bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) ingest.mutate({ url: url.trim() });
        }}
      >
        <label htmlFor={urlId} className="mb-1.5 block text-sm font-medium text-gray-800">
          Recipe link
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Link2
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            />
            <input
              id={urlId}
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/shorts/… or a recipe page"
              aria-invalid={ingest.isError || undefined}
              aria-describedby={ingest.isError ? errorId : undefined}
              className="min-h-11 w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-sm focus:border-[#944a00] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={ingest.isPending || !url.trim() || capReached}
            className={cn(
              'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white disabled:opacity-50',
              pressControl,
            )}
          >
            {ingest.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Add to queue
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {budget.data
            ? `${budget.data.used} of ${budget.data.cap} extractions used today (resets at midnight UTC).`
            : ' '}
        </p>
        {ingest.isError && (
          <p id={errorId} role="alert" className="mt-2 text-sm text-red-600">
            {userFacingErrorMessage(ingest.error)}
          </p>
        )}
      </form>

      <div
        role="group"
        aria-label="Filter the queue"
        className="scroll-rail -mx-4 mt-6 gap-2 px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {QUEUE_TABS.map((t) => {
          const n = t.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'min-h-11 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-medium',
                tab === t.id
                  ? 'border-[#944a00] bg-[#fff3e8] text-[#944a00]'
                  : 'border-gray-200 text-gray-700',
                pressControl,
              )}
            >
              {t.label}
              {t.statuses.length > 0 && <span className="ml-1 text-gray-500">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {list.isLoading ? (
          <div className="space-y-2" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : list.data?.drafts.length ? (
          <ul className="divide-y rounded-2xl border bg-white shadow-sm">
            {list.data.drafts.map((d) => {
              const name =
                [(d.draft as { name?: string } | null)?.name, d.sourceTitle].find((s) =>
                  s?.trim(),
                ) ?? d.sourceUrl;
              return (
                <li key={d.id}>
                  <Link
                    href={`/admin/recipes/${d.id}`}
                    className="flex min-h-11 items-center gap-3 p-4 hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {d.platform ?? d.via} · {d.sourceUrl}
                      </p>
                      {d.status === 'FAILED' && d.error && (
                        <p className="mt-1 text-xs text-red-700">{d.error}</p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                        STATUS_CLASS[d.status],
                      )}
                    >
                      {d.status === 'EXTRACTING' && (
                        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden="true" />
                      )}
                      {STATUS_LABEL[d.status]}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-gray-500">
            Nothing here yet.
          </p>
        )}
      </div>
    </div>
  );
}
