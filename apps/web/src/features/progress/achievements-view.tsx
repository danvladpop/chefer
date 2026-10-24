'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import type { AchievementGroup, AchievementItem } from '@chefer/types';
import { pressCard, pressControl, ProgressBar, Sheet } from '@chefer/ui';
import { cn, PROGRESS_COPY, tierNumeral } from '@chefer/utils';
import { ACHIEVEMENT_GROUP_ICONS, ACHIEVEMENT_GROUP_LABELS, PROGRESS_WEB_COPY } from './copy';
import { ProgressNotAvailable } from './not-available';
import { useProgressEnabled } from './use-progress';

// ─── Achievements (mockup 06, lane C7) ────────────────────────────────────────
// The earned / total pill, group chips, the "Closest next" card and a grid per
// group: an icon tile with a tier numeral badge, grey when nothing is earned.
// A tap opens a small sheet with the description and progress. Opening the
// page marks the shelf as seen (clears the "new" dots).

const TIER_TILE = [
  'bg-gray-100 border-gray-200 grayscale opacity-70',
  'bg-orange-100 border-orange-300',
  'bg-slate-100 border-slate-400',
  'bg-amber-100 border-amber-400',
] as const;

function tileClass(tier: number): string {
  return TIER_TILE[Math.min(tier, TIER_TILE.length - 1)] ?? TIER_TILE[0];
}

function Tile({ item, size = 'lg' }: { item: AchievementItem; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-card border-2',
        size === 'lg' ? 'h-16 w-16 text-3xl' : 'h-12 w-12 text-2xl',
        tileClass(item.tier),
      )}
    >
      {item.icon}
      {item.tier > 0 && (
        <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border bg-white px-1 text-xs font-bold text-[#944a00]">
          {tierNumeral(item.tier)}
        </span>
      )}
      {item.isNew && (
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-orange-500 ring-2 ring-white" />
      )}
    </span>
  );
}

function progressOf(item: AchievementItem): number {
  return item.nextTarget && item.nextTarget > 0 ? item.progress / item.nextTarget : 1;
}

function AchievementSheet({
  item,
  onClose,
}: {
  item: AchievementItem | null;
  onClose: () => void;
}) {
  const [last, setLast] = useState<AchievementItem | null>(item);
  if (item && item !== last) setLast(item);
  const shown = item ?? last;
  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      title={shown?.title ?? PROGRESS_COPY.achievementsTitle}
      size="sm"
    >
      {shown && (
        <div
          className="flex flex-col items-center gap-3 px-5 pb-6 text-center"
          data-testid="achievement-detail"
        >
          <Tile item={shown} />
          <p className="text-sm text-gray-700">{shown.description}</p>
          {shown.nextTarget !== null ? (
            <div className="w-full">
              <ProgressBar
                progress={progressOf(shown)}
                label={`${shown.progress} of ${shown.nextTarget}`}
                className="h-2"
              />
              <p className="mt-1 text-xs text-gray-600">
                {shown.progress} / {shown.nextTarget}
                {shown.tiers.length > 1 &&
                  ` · ${PROGRESS_WEB_COPY.achievementTier} ${Math.min(shown.tier + 1, shown.tiers.length)} / ${shown.tiers.length}`}
              </p>
            </div>
          ) : (
            <p className="text-sm font-semibold text-emerald-700">
              {PROGRESS_WEB_COPY.achievementDone}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function AchievementsView() {
  const { enabled, isLoading: gateLoading } = useProgressEnabled();
  const query = trpc.progress.achievements.useQuery(undefined, { enabled, retry: false });
  const markSeen = trpc.progress.markSeen.useMutation({ meta: { silent: true } });
  const { mutate: sendSeen } = markSeen;
  const [group, setGroup] = useState<AchievementGroup | 'ALL'>('ALL');
  const [open, setOpen] = useState<AchievementItem | null>(null);

  // Opening the shelf clears the "new" dots, once.
  const seenSent = useRef(false);
  useEffect(() => {
    if (!enabled || !query.data || seenSent.current) return;
    seenSent.current = true;
    sendSeen({ achievements: true });
  }, [enabled, query.data, sendSeen]);

  const groups = useMemo(
    () => (query.data?.groups ?? []).filter((g) => group === 'ALL' || g.group === group),
    [query.data, group],
  );

  const data = query.data;
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8" data-testid="achievements-page">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        <h1 className="min-w-0 font-serif text-2xl font-bold text-gray-900">
          {PROGRESS_COPY.achievementsTitle}
        </h1>
        {data && (
          <span
            data-testid="achievements-count"
            className="shrink-0 rounded-full bg-[#fff3e8] px-3 py-1 text-sm font-bold text-[#944a00]"
          >
            {data.earned} / {data.total}
          </span>
        )}
      </div>

      {!gateLoading && !enabled ? (
        <ProgressNotAvailable />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {PROGRESS_WEB_COPY.achievementsLoadError}
        </p>
      ) : !data ? (
        <div className="animate-pulse space-y-3" aria-hidden="true">
          <div className="h-10 rounded-full bg-gray-100" />
          <div className="h-24 rounded-card bg-gray-100" />
          <div className="h-40 rounded-card bg-gray-100" />
        </div>
      ) : (
        <>
          <div
            role="group"
            aria-label={PROGRESS_WEB_COPY.achievementsFilter}
            className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1"
          >
            {(['ALL', ...data.groups.map((g) => g.group)] as const).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                className={cn(
                  'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold',
                  pressControl,
                  group === g
                    ? 'border-[#944a00] bg-[#944a00] text-white'
                    : 'bg-white text-gray-800 hover:bg-gray-50',
                )}
              >
                {g !== 'ALL' && <span aria-hidden="true">{ACHIEVEMENT_GROUP_ICONS[g]}</span>}
                {g === 'ALL' ? PROGRESS_WEB_COPY.achievementsAll : ACHIEVEMENT_GROUP_LABELS[g]}
              </button>
            ))}
          </div>

          {data.closestNext?.nextTarget != null && (
            <button
              type="button"
              data-testid="achievements-closest"
              onClick={() => data.closestNext && setOpen(data.closestNext)}
              className={cn(
                'mb-6 flex w-full min-w-0 items-center gap-3 rounded-card border border-[#944a00]/15 bg-[#fff3e8] p-4 text-left',
                pressCard,
              )}
            >
              <Tile item={data.closestNext} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-baseline justify-between gap-2">
                  <span className="text-base font-bold text-gray-900">
                    {PROGRESS_COPY.closestNext}
                  </span>
                  <span className="shrink-0 text-xs text-gray-700">
                    {Math.max(data.closestNext.nextTarget - data.closestNext.progress, 0)}{' '}
                    {PROGRESS_COPY.toGo}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-gray-700">
                  {data.closestNext.title} {tierNumeral(data.closestNext.tier + 1)} ·{' '}
                  {data.closestNext.description}
                </span>
                <ProgressBar
                  progress={progressOf(data.closestNext)}
                  label={`${data.closestNext.progress} of ${data.closestNext.nextTarget}`}
                  className="mt-2 h-1.5 bg-white"
                />
              </span>
            </button>
          )}

          {groups.length === 0 || groups.every((g) => g.items.length === 0) ? (
            <p className="text-sm text-gray-600">{PROGRESS_WEB_COPY.achievementsEmpty}</p>
          ) : (
            groups.map((g) => (
              <section key={g.group} aria-labelledby={`ach-${g.group}`} className="mb-6">
                <h2
                  id={`ach-${g.group}`}
                  className="mb-3 flex items-center gap-2 text-base font-bold text-gray-900"
                >
                  <span aria-hidden="true">{ACHIEVEMENT_GROUP_ICONS[g.group]}</span>
                  {ACHIEVEMENT_GROUP_LABELS[g.group]}
                </h2>
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {g.items.map((item) => (
                    <li key={item.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setOpen(item)}
                        aria-label={`${item.title}${item.tier > 0 ? `, tier ${tierNumeral(item.tier)}` : ''}${item.isNew ? `, ${PROGRESS_COPY.newBadge}` : ''}`}
                        className={cn(
                          'flex min-h-11 w-full min-w-0 flex-col items-center gap-1.5 rounded-card p-1 text-center hover:bg-gray-50',
                          pressControl,
                        )}
                      >
                        <Tile item={item} />
                        <span className="w-full text-xs font-semibold text-gray-800">
                          {item.title}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
      <AchievementSheet item={open} onClose={() => setOpen(null)} />
    </div>
  );
}
