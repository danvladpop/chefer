// ─── Trainer coaching: weekly check-in rules (lane K3) ────────────────────────
// Which check-in is open for a client, and whether an answer is complete.
// Shared by the API (the source of truth) and both apps (the prompt card).

import { CHECK_IN_QUESTIONS, type CheckInAnswers, type CheckInQuestion } from '@chefer/types';
import { addDaysLocal } from '../gym/weeks';

/** 0 = Monday … 6 = Sunday for a `YYYY-MM-DD`. */
function weekdayOf(localDate: string): number {
  return (new Date(`${localDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * The check-in open on `today` (client-local): it opened on the latest
 * check-in weekday on or before today, and stays open until the next one
 * opens a week later. Null before the first check-in day after the coaching
 * started (`since`, the coaching's client-local start day): a client who
 * joins on Thursday answers their first check-in on Sunday, not at once.
 */
export function checkInPeriodStart(
  today: string,
  day: number,
  since: string | null,
): string | null {
  const back = (weekdayOf(today) - day + 7) % 7;
  const start = addDaysLocal(today, -back);
  return since !== null && start < since ? null : start;
}

/** Every asked question has a 1–5 answer, and nothing else is answered. */
export function isCompleteCheckIn(
  questions: readonly CheckInQuestion[],
  answers: CheckInAnswers,
): boolean {
  const keys = Object.keys(answers);
  return (
    keys.length === questions.length &&
    questions.every((q) => {
      const v = answers[q];
      return v !== undefined && Number.isInteger(v) && v >= 1 && v <= 5;
    })
  );
}

/** One answered check-in as a line: "Energy 3/5 · Hunger 4/5 · Sleep 2/5". */
export function checkInAnswersLine(
  questions: readonly CheckInQuestion[],
  answers: CheckInAnswers,
): string {
  return questions
    .flatMap((q) => {
      const v = answers[q];
      return v === undefined ? [] : [`${CHECK_IN_QUESTIONS[q].label} ${v}/5`];
    })
    .join(' · ');
}
