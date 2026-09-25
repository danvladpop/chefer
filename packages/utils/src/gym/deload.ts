// Deload offers — research §1.6 (reactive for everyone, proactive after 6
// met weeks for intermediates; offered, never forced). The deload prescription
// itself lives in progression.ts (deloadPrescription) next to prescribe().
import type {
  ProgressionState,
  SessionSummaryDto,
  TrainingExperience,
  WeekSummary,
} from '@chefer/types';
import { daysBetweenLocal } from './weeks';

/** Reasons that count as "struggling" for the reactive trigger. */
const STRUGGLE_CODES = new Set(['MISSED_TWICE', 'STALL_RESET']);
const REACTIVE_WINDOW_DAYS = 7;
const PROACTIVE_MET_WEEKS = 6;
const BEGINNER_GRACE_WEEKS = 12;

export function shouldOfferDeload(input: {
  states: ProgressionState[];
  weeks: WeekSummary[];
  experience: TrainingExperience;
  today: string;
  /** Monday of the week the user finished setup. */
  firstWeek: string;
}): { offer: boolean; reason: 'reactive' | 'proactive' | null } {
  const { states, weeks, experience, today } = input;

  // Reactive: ≥ 3 exercises or ≥ 30 % of them (whichever is larger) struggled in the last 7 days.
  const struggling = states.filter((s) => {
    if (!STRUGGLE_CODES.has(s.next.reasonCode) || s.lastExposureDate === null) {
      return false;
    }
    const age = daysBetweenLocal(s.lastExposureDate, today);
    return age >= 0 && age < REACTIVE_WINDOW_DAYS;
  }).length;
  const threshold = Math.max(3, Math.ceil(0.3 * states.length));
  if (struggling >= threshold) {
    return { offer: true, reason: 'reactive' };
  }

  // Proactive: after every 6 consecutive met weeks (intermediates; beginners only
  // once their first 12 weeks are behind them). Offered for the following week.
  const weeksIn = Math.floor(daysBetweenLocal(input.firstWeek, today) / 7);
  const eligible = experience === 'INTERMEDIATE' || weeksIn >= BEGINNER_GRACE_WEEKS;
  if (eligible) {
    const settled = weeks.filter((w) => w.status !== 'current');
    let run = 0;
    for (let i = settled.length - 1; i >= 0 && settled[i]?.status === 'met'; i--) {
      run += 1;
    }
    const lastSettled = settled[settled.length - 1];
    const currentIsNext =
      lastSettled !== undefined && daysBetweenLocal(lastSettled.weekStart, today) < 14;
    if (run > 0 && run % PROACTIVE_MET_WEEKS === 0 && currentIsNext) {
      return { offer: true, reason: 'proactive' };
    }
  }
  return { offer: false, reason: null };
}

/**
 * A deload week is the next N sessions, N = the routine's days per week
 * (research §1.6). True while fewer than N deload sessions have been logged
 * in a row (newest first), i.e. the next session should still be a deload.
 */
export function deloadContinues(recentSessions: SessionSummaryDto[], daysPerWeek: number): boolean {
  const ordered = recentSessions
    .filter((s) => s.status === 'COMPLETED')
    .sort(
      (a, b) =>
        b.localDate.localeCompare(a.localDate) ||
        b.startedAt.localeCompare(a.startedAt) ||
        b.id.localeCompare(a.id),
    );
  let run = 0;
  for (const s of ordered) {
    if (!s.isDeload) {
      break;
    }
    run += 1;
  }
  return run < Math.max(1, daysPerWeek);
}
