'use client';

import { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import type { GymBootstrap, WorkoutSessionDoc } from '@chefer/types';
import { Button, ProgressBar } from '@chefer/ui';
import { resumeSummary, weekdayDateLabel, type ResumeSummary } from '@chefer/utils';
import { lookupWithCatalog } from '../shared/use-gym-data';
import { useRestRemaining } from '../workout/rest-timer';
import { formatClock, supersetsOf } from '../workout/workout-model';

// UX-36 amendment A1 (T-36.A1.3, O-09) on the web: the Resume banner shows the
// elapsed time, `{e} of {E} exercises · {s} of {S} sets` and the current
// exercise — built on the same pure `resumeSummary()` the phone's Resume card
// and the logger use, so they never disagree. The web has no "Save for later"
// (a web session simply stays open in this browser), so `paused` never occurs.

function focusLine(summary: ResumeSummary): string | null {
  if (!summary.focus) return null;
  if (summary.focus.isTimer) return `Now: ${summary.focus.name}`;
  return `Now: ${summary.focus.name} · set ${summary.focus.setIndex} of ${summary.focus.setCount}`;
}

/** The one-sentence accessible label for the informational block. */
function accessibleSentence(summary: ResumeSummary): string {
  const parts = [
    'Workout in progress',
    summary.name,
    summary.state === 'backfill' ? '' : formatClock(summary.elapsedSec),
    `${summary.exercisesDone} of ${summary.exercisesTotal} exercises done`,
    summary.focus
      ? `now ${summary.focus.name}${summary.focus.isTimer ? '' : ` set ${summary.focus.setIndex} of ${summary.focus.setCount}`}`
      : summary.state === 'allLogged'
        ? 'all sets logged'
        : '',
  ].filter(Boolean);
  return `${parts.join(', ')}.`;
}

/**
 * UX-GYM-09: the running rest, so leaving the logger never hides it. Ticks in its
 * own component and is not a live region (a screen reader reads it on focus).
 */
function RestCountdown() {
  const { remainingSec, state } = useRestRemaining();
  if (!state || remainingSec <= 0) return null;
  return (
    <p
      className="text-xs font-semibold tabular-nums text-[#944a00]"
      data-testid="gym-resume-rest"
      aria-label={`Resting, ${remainingSec} seconds left`}
    >
      Rest {formatClock(remainingSec)}
    </p>
  );
}

export function ResumeBanner({
  session,
  bootstrap,
  today,
  onResume,
}: {
  session: WorkoutSessionDoc;
  bootstrap: GymBootstrap | undefined;
  today: string;
  onResume: () => void;
}) {
  // Tick the elapsed time once a second (not a live region: it must not chatter).
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(id);
  }, []);

  const lookup = useMemo(() => lookupWithCatalog(bootstrap), [bootstrap]);
  const summary = resumeSummary(session, {
    now,
    isBackfill: session.localDate !== today,
    supersets: supersetsOf(session, bootstrap),
    lookup,
  });

  const eyebrow =
    summary.state === 'backfill'
      ? `LOGGING ${weekdayDateLabel(session.localDate).toUpperCase()}`
      : 'WORKOUT IN PROGRESS';
  const focus = focusLine(summary);
  const progress = summary.setsTotal > 0 ? summary.setsDone / summary.setsTotal : 0;
  const primaryLabel = summary.state === 'allLogged' ? 'Finish workout' : 'Resume';

  return (
    <div
      className="sticky top-16 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#944a00]/30 bg-[#fff8f0] p-3 shadow-sm lg:top-0"
      data-testid="gym-resume-banner"
    >
      <div
        className="min-w-0 flex-1 space-y-1"
        aria-label={accessibleSentence(summary)}
        role="group"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold tracking-wide text-[#944a00]">{eyebrow}</p>
          {summary.state === 'active' || summary.state === 'allLogged' ? (
            <p className="text-sm tabular-nums text-gray-700" data-testid="gym-resume-elapsed">
              {formatClock(summary.elapsedSec)}
            </p>
          ) : null}
        </div>
        <p className="truncate text-sm font-semibold text-gray-900">{summary.name}</p>
        <RestCountdown />
        {summary.state === 'allLogged' ? (
          <p className="text-xs text-gray-600">All sets logged · Finish when you’re ready.</p>
        ) : (
          <>
            <ProgressBar
              progress={progress}
              className="h-1.5 bg-[#944a00]/15"
              label={`${summary.setsDone} of ${summary.setsTotal} sets`}
            />
            <p className="text-xs text-gray-600" data-testid="gym-resume-counts">
              {summary.exercisesDone} of {summary.exercisesTotal} exercises · {summary.setsDone} of{' '}
              {summary.setsTotal} sets
            </p>
            {focus ? <p className="truncate text-xs text-gray-600">{focus}</p> : null}
          </>
        )}
      </div>
      <Button onClick={onResume} className="shrink-0 bg-[#944a00] hover:bg-[#7a3d00]">
        <Play aria-hidden="true" />
        {primaryLabel}
      </Button>
    </div>
  );
}
