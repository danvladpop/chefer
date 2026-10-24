'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { ChevronRight } from 'lucide-react';
import { pressCard, ProgressRing } from '@chefer/ui';
import { flameWeeksLabel, levelLabel, PROGRESS_COPY } from '@chefer/utils';
import { useProgressSummary } from './use-progress';

// ─── Chef card (mockup 09, lane C8) ───────────────────────────────────────────
// Top of /profile: the level ring around the user's initial, "Line Cook · Lv 7",
// the XP and flame line, and the way to the achievements shelf (with the badge
// count). Hidden when "Show XP & levels" is off, and while the gate is off.

export function ChefCard({ name }: { name: string }) {
  const { enabled, summary } = useProgressSummary();
  const achievements = trpc.progress.achievements.useQuery(undefined, {
    enabled: enabled && summary?.settings.showXp === true,
    retry: false,
    staleTime: 60_000,
  });
  if (!enabled || !summary?.settings.showXp) return null;
  const { xp, rank, flame } = summary;

  return (
    <section
      aria-label={PROGRESS_COPY.stripTitleFallback}
      data-testid="chef-card"
      className="mb-6 overflow-hidden rounded-2xl border bg-white shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-4 bg-[#fff3e8] p-4 sm:p-5">
        <ProgressRing
          progress={xp.xpForLevel > 0 ? xp.xpIntoLevel / xp.xpForLevel : 0}
          size={64}
          strokeWidth={6}
          trackColor="#ffffff"
          label={`${levelLabel(xp.level)}, ${xp.xpIntoLevel} of ${xp.xpForLevel} XP`}
        >
          <span className="text-xl font-bold text-[#944a00]">{name.charAt(0).toUpperCase()}</span>
        </ProgressRing>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#944a00]">
            {rank.title} · {levelLabel(xp.level)}
          </p>
          <p className="mt-0.5 text-sm text-gray-700">
            {xp.xpIntoLevel} / {xp.xpForLevel} XP
            {flame.current > 0 && (
              <>
                {' · '}
                <span aria-hidden="true">🔥</span> {flameWeeksLabel(flame.current)}
              </>
            )}
          </p>
        </div>
      </div>
      <Link
        href="/achievements"
        data-testid="chef-card-achievements"
        className={`flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 sm:px-5 ${pressCard}`}
      >
        <span className="min-w-0">
          <span aria-hidden="true">🏆</span> {PROGRESS_COPY.achievementsTitle}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-gray-600">
          {achievements.data && (
            <span>
              {achievements.data.earned} / {achievements.data.total}
            </span>
          )}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </Link>
    </section>
  );
}
