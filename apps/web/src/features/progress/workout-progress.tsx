'use client';

import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Trophy } from 'lucide-react';
import type { PrKind, WeightUnit, WorkoutSessionDoc } from '@chefer/types';
import { formatLoad, type ExerciseLookup } from '@chefer/utils';
import { PROGRESS_WEB_COPY } from './copy';
import { KitchenReceipt } from './kitchen-receipt';
import { useProgressSummary } from './use-progress';

// ─── Workouts → Kitchen progress (mockup 03, lane C4) ─────────────────────────
// The receipt on the finished-workout summary, and the live "New best" banner
// on the workout logger. Both are gated like everything else; the receipt shows
// nothing until the workout has synced (the server scores it then, and
// `GymSync` refetches `progress.*` on the ack).

export function WorkoutReceipt({ doc }: { doc: Pick<WorkoutSessionDoc, 'id' | 'status'> }) {
  const { enabled, summary } = useProgressSummary();
  const { data: receipt } = trpc.progress.receiptFor.useQuery(
    { kind: 'WORKOUT', sourceId: doc.id },
    { enabled: enabled && doc.status === 'COMPLETED', retry: false, staleTime: 30_000 },
  );
  if (!enabled || !summary || !summary.settings.showXp || !receipt) return null;
  return <KitchenReceipt receipt={receipt} level={summary.xp} />;
}

// ── Live PR banner ────────────────────────────────────────────────────────────

const BANNER_MS = 3000;

type LivePr = { setId: string; kind: PrKind };

export type NewPr = { key: string; text: string };

/**
 * The PRs in `prs` that weren't there on the previous pass, as banner text
 * ("New best · Bench press 80 kg × 5"). `seen` is updated in place.
 */
export function newLivePrs(
  prs: ReadonlyMap<string, LivePr>,
  doc: Pick<WorkoutSessionDoc, 'exercises'>,
  lookup: ExerciseLookup,
  unit: WeightUnit,
  seen: Set<string>,
): NewPr[] {
  const fresh: NewPr[] = [];
  for (const [seId, pr] of prs) {
    const key = `${seId}:${pr.setId}:${pr.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const se = doc.exercises.find((e) => e.id === seId);
    const set = se?.sets.find((s) => s.id === pr.setId);
    if (!se || !set) continue;
    const meta = lookup(se.exerciseId);
    const load = formatLoad(set.weightKg, unit, meta?.loadType, { each: meta?.perHand });
    fresh.push({
      key,
      text: `${PROGRESS_WEB_COPY.newBest} · ${meta?.name ?? 'Exercise'} ${load} × ${set.reps}`,
    });
  }
  return fresh;
}

/**
 * A non-blocking banner when a set ticked on this screen sets a new best. PRs
 * already on the session when it opens (a resumed workout) don't count as new.
 * Pop-in on the bouncy spring (MO-14); gone after 3 s; never takes focus.
 */
export function LivePrBanner({
  prs,
  doc,
  lookup,
  unit,
  ready,
}: {
  prs: ReadonlyMap<string, LivePr>;
  doc: Pick<WorkoutSessionDoc, 'exercises'> | null;
  lookup: ExerciseLookup;
  unit: WeightUnit;
  /** True once the gym bootstrap (the PR history) has loaded: before it `prs` is empty, not "no PRs". */
  ready: boolean;
}) {
  const { enabled, summary } = useProgressSummary();
  const celebrate = enabled && summary !== undefined && summary.settings.celebrations !== 'OFF';
  const seen = useRef<Set<string> | null>(null);
  const [banner, setBanner] = useState<NewPr | null>(null);

  useEffect(() => {
    if (!doc || !ready) return;
    if (seen.current === null) {
      // First pass: whatever is already a PR is the baseline, not news.
      seen.current = new Set();
      newLivePrs(prs, doc, lookup, unit, seen.current);
      return;
    }
    const fresh = newLivePrs(prs, doc, lookup, unit, seen.current);
    const latest = fresh[fresh.length - 1];
    if (latest && celebrate) setBanner(latest);
  }, [prs, doc, lookup, unit, celebrate, ready]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  if (!banner) return null;
  return (
    <div
      key={banner.key}
      role="status"
      aria-live="polite"
      data-testid="live-pr-banner"
      className="pointer-events-none fixed inset-x-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-[60] mx-auto flex max-w-sm animate-in items-center gap-2 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 shadow-e3 duration-base ease-spring-bouncy zoom-in-95 fade-in-0"
    >
      <Trophy className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <span className="min-w-0">{banner.text}</span>
    </div>
  );
}
