import type { PlanTailoring } from '@chefer/types';

// ─── Live plan tailoring: shared presentation logic (web + mobile) ──────────
// Premium generation returns a curated week instantly; the chef then tailors
// it day by day in the background (MealPlanTailoring on the API). Both Plan
// screens show the same banner, per-day markers and copy — derived here so
// the two platforms can never disagree about what a state means.

export const PLAN_TAILORING_COPY = {
  runningTitle: 'Your chef is tailoring your week',
  runningHint: 'Browse and use your week meanwhile — days update as they are ready.',
  doneTitle: 'Your week is tailored',
  doneDetail: 'Every day is now built around your goals and taste.',
  partialDetail: 'the rest are from our recipe collection.',
  failedTitle: 'Your chef is busy right now',
  failedDetail: 'This week is from our recipe collection for now.',
  resumeLabel: 'Tailor the rest',
  retryLabel: 'Try tailoring again',
  dayUpdated: 'updated by your chef',
} as const;

export type PlanTailoringCopyKey = keyof typeof PLAN_TAILORING_COPY;

/**
 * What a day chip shows:
 * - `tailored` — the chef replaced this day (✓)
 * - `tailoring` — being tailored right now
 * - `waiting` — queued, not reached yet
 * - `kept` — left alone because the user changed or logged it
 * - `collection` — the job stopped before it; the curated day stays
 * - `none` — not part of any tailoring (free plans, past days, no job)
 */
export type TailoringDayState =
  | 'tailored'
  | 'tailoring'
  | 'waiting'
  | 'kept'
  | 'collection'
  | 'none';

type TailoringLike = PlanTailoring | null | undefined;

export function tailoringDayState(tailoring: TailoringLike, dayOfWeek: number): TailoringDayState {
  if (!tailoring || tailoring.status === 'NONE') return 'none';
  if (tailoring.tailoredDays.includes(dayOfWeek)) return 'tailored';
  if (tailoring.keptDays.includes(dayOfWeek)) return 'kept';
  if (tailoring.status === 'RUNNING') {
    if (tailoring.currentDay === dayOfWeek) return 'tailoring';
    if (tailoring.queuedDays.includes(dayOfWeek)) return 'waiting';
    return 'none';
  }
  return tailoring.queuedDays.includes(dayOfWeek) ? 'collection' : 'none';
}

/** Screen-reader suffix for a day chip ("Tuesday, today, tailored by your chef"). */
export function tailoringDayLabel(state: TailoringDayState): string {
  switch (state) {
    case 'tailored':
      return 'tailored by your chef';
    case 'tailoring':
      return 'being tailored now';
    case 'waiting':
      return 'waiting to be tailored';
    case 'kept':
      return 'kept as you changed it';
    case 'collection':
      return 'from our recipe collection';
    default:
      return '';
  }
}

/** Days handled (tailored + kept) out of the days the job set out to do. */
export function tailoringProgress(tailoring: TailoringLike): {
  done: number;
  total: number;
  fraction: number;
} {
  if (!tailoring) return { done: 0, total: 0, fraction: 0 };
  const total = Math.max(0, tailoring.totalDays);
  const done = Math.min(total, tailoring.tailoredDays.length + tailoring.keptDays.length);
  return { done, total, fraction: total > 0 ? done / total : 1 };
}

/** Only a RUNNING job is worth polling for. */
export function isTailoringRunning(tailoring: TailoringLike): boolean {
  return tailoring?.status === 'RUNNING';
}

export interface TailoringBannerText {
  tone: 'running' | 'done' | 'partial' | 'failed';
  title: string;
  detail: string;
  /** Label of the re-queue action, when the API allows one. */
  actionLabel: string | null;
}

/**
 * The Plan banner's words for a tailoring state, or null when there is
 * nothing to say (no job, NONE). DONE is shown briefly by the screens (a
 * confirmation, not a permanent fixture) — see `shouldShowTailoringBanner`.
 */
export function tailoringBannerText(tailoring: TailoringLike): TailoringBannerText | null {
  if (!tailoring) return null;
  const { done, total } = tailoringProgress(tailoring);
  const days = `${total} day${total === 1 ? '' : 's'}`;
  switch (tailoring.status) {
    case 'RUNNING':
      return {
        tone: 'running',
        title: PLAN_TAILORING_COPY.runningTitle,
        detail: `${done} of ${days}`,
        actionLabel: null,
      };
    case 'DONE':
      return {
        tone: 'done',
        title: PLAN_TAILORING_COPY.doneTitle,
        detail: PLAN_TAILORING_COPY.doneDetail,
        actionLabel: null,
      };
    case 'PARTIAL':
      return {
        tone: 'partial',
        title: `Tailored ${done} of ${days}`,
        detail: PLAN_TAILORING_COPY.partialDetail,
        actionLabel: tailoring.canResume ? PLAN_TAILORING_COPY.resumeLabel : null,
      };
    case 'FAILED':
      return {
        tone: 'failed',
        title: PLAN_TAILORING_COPY.failedTitle,
        detail: PLAN_TAILORING_COPY.failedDetail,
        actionLabel: tailoring.canResume ? PLAN_TAILORING_COPY.retryLabel : null,
      };
    default:
      return null;
  }
}

/**
 * Whether the banner belongs on screen: always while RUNNING and for the
 * PARTIAL/FAILED end states (they carry an action); DONE only right after
 * the user watched it finish (`sawRunning`) — a plan that was tailored
 * yesterday doesn't need a banner today.
 */
export function shouldShowTailoringBanner(tailoring: TailoringLike, sawRunning: boolean): boolean {
  const text = tailoringBannerText(tailoring);
  if (!text) return false;
  if (text.tone === 'done') return sawRunning;
  return true;
}

/** Day indexes that newly became tailored between two reads (drives the replace transition). */
export function newlyTailoredDays(previous: TailoringLike, next: TailoringLike): number[] {
  if (!next) return [];
  const before = new Set(previous?.tailoredDays ?? []);
  return next.tailoredDays.filter((d) => !before.has(d));
}
