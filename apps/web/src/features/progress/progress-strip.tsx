'use client';

import { useState } from 'react';
import type { ProgressSummary } from '@chefer/types';
import { pressCard, ProgressBar, ProgressRing } from '@chefer/ui';
import { activeDaysLabel, cn, flameWeeksLabel, levelLabel, PROGRESS_COPY } from '@chefer/utils';
import { PROGRESS_WEB_COPY } from './copy';
import { FlameDots } from './flame-dots';
import { FlameSheet } from './flame-sheet';

// ─── Today strip (mockup 01, lane C1) ─────────────────────────────────────────
// A level ring with the number, the rank, "340 / 500 XP to Chef de Partie" on a
// progress bar, the Flame ("6 wk"), a Mon–Sun dot row and "2 of 3 active days".
// Tapping it opens the Flame sheet. Hidden when the user turned the flame off
// on Today; with "Show XP & levels" off only the flame row remains.
// Motion: ring and bar are the shared MO-06 primitives; press is MO-01.

export function ProgressStrip({ summary }: { summary: ProgressSummary }) {
  const [open, setOpen] = useState(false);
  const { settings, xp, rank, nextRank, flame } = summary;
  if (!settings.showFlameOnToday) return null;

  const week = flame.thisWeek;
  const flameText = flame.current > 0 ? `${flame.current} ${PROGRESS_WEB_COPY.weeksAbbrev}` : null;
  const paused = flame.pausedUntil !== null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${PROGRESS_WEB_COPY.openFlame}: ${flame.current > 0 ? flameWeeksLabel(flame.current) : PROGRESS_COPY.flameZero}`}
        data-testid="progress-strip"
        className={cn(
          'block w-full min-w-0 rounded-card border border-[#944a00]/15 bg-[#fff3e8] p-4 text-left shadow-e1',
          pressCard,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {settings.showXp && (
            <ProgressRing
              progress={xp.xpForLevel > 0 ? xp.xpIntoLevel / xp.xpForLevel : 0}
              size={56}
              strokeWidth={6}
              trackColor="#ffffff"
              label={`${levelLabel(xp.level)}, ${xp.xpIntoLevel} of ${xp.xpForLevel} XP`}
              data-testid="progress-strip-ring"
            >
              <span className="text-lg font-bold text-[#944a00]">{xp.level}</span>
            </ProgressRing>
          )}
          <div className="min-w-0 flex-1">
            {settings.showXp ? (
              <>
                <div className="flex min-w-0 items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-base font-bold text-gray-900">{rank.title}</p>
                  {flameText && (
                    <p className="shrink-0 text-sm font-bold text-orange-600">
                      <span aria-hidden="true">🔥</span> {flameText}
                    </p>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-700">
                  {nextRank ? (
                    <>
                      {xp.xpIntoLevel} / {xp.xpForLevel} {PROGRESS_COPY.xpToRank}{' '}
                      <strong>{nextRank.title}</strong>
                    </>
                  ) : (
                    PROGRESS_COPY.maxRank
                  )}
                </p>
                <ProgressBar
                  progress={xp.xpForLevel > 0 ? xp.xpIntoLevel / xp.xpForLevel : 0}
                  label={`${xp.xpIntoLevel} of ${xp.xpForLevel} XP this level`}
                  color="#d97706"
                  className="mt-2 h-1.5 bg-white"
                />
              </>
            ) : (
              <p className="text-base font-bold text-gray-900">
                <span aria-hidden="true">🔥</span>{' '}
                {flame.current > 0 ? flameWeeksLabel(flame.current) : PROGRESS_COPY.flameZero}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
          <FlameDots days={week.days} className="w-full max-w-[16rem] flex-1" />
          <p className="shrink-0 text-right text-xs text-gray-700">
            {paused ? (
              <>
                {PROGRESS_COPY.pausedUntil}
                <br />
                {flame.pausedUntil}
              </>
            ) : (
              <>
                {Math.min(week.activeDays, week.goal)} of {week.goal}
                <br />
                {PROGRESS_COPY.activeDays}
              </>
            )}
          </p>
        </div>
        <span className="sr-only">{activeDaysLabel(week.activeDays, week.goal)}</span>
      </button>
      <FlameSheet open={open} onClose={() => setOpen(false)} summary={summary} />
    </>
  );
}
