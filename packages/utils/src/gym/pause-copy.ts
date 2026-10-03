import { addDaysLocal, weekdayDateLabel, weekdayOf } from './weeks';

// "Pause training" copy and date rules shared by mobile and web (UX-GYM-16):
// a start choice (the trip may begin tomorrow or next Monday, not only today),
// one sentence on what pausing does, human dates (never "2026-10-08") and a
// reason label (never the raw enum). A pause range is inclusive on both ends,
// so its end date is the LAST paused day — "Paused through …", never the
// contradictory "Paused until X" / "Resumes X" pair.

export type PauseStartChoice = 'today' | 'tomorrow' | 'monday';

export const PAUSE_START_CHOICES: readonly { value: PauseStartChoice; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'monday', label: 'Next Monday' },
];

/** What a pause does, in one line (shown above the controls and in the confirm). */
export const PAUSE_EXPLAINER =
  'Paused weeks don’t break your streak, reminders stay quiet, and weights ease back in when you return.';

export const PAUSE_REASON_LABELS: Readonly<Record<string, string>> = {
  vacation: 'Vacation',
  illness: 'Illness',
  injury: 'Injury',
  other: 'Other',
};

/** A stored reason as a label ("vacation" → "Vacation"); unknown text is capitalised, null stays null. */
export function pauseReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const known = PAUSE_REASON_LABELS[reason.toLowerCase()];
  if (known) return known;
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

/** The first paused day for a start choice, from the device-local `today`. */
export function pauseStartDate(choice: PauseStartChoice, today: string): string {
  if (choice === 'today') return today;
  if (choice === 'tomorrow') return addDaysLocal(today, 1);
  // "Next Monday": the coming Monday, a full week out when today is Monday.
  return addDaysLocal(today, 7 - weekdayOf(today));
}

/** The last paused day of a pause of `weeks` whole weeks starting on `startDate`. */
export function pauseEndDate(startDate: string, weeks: number): string {
  return addDaysLocal(startDate, weeks * 7 - 1);
}

/**
 * "Paused through Thu 8 Oct · Vacation" while it runs, "Starts Sat 10 Oct, through
 * Fri 16 Oct · Vacation" before it begins. Dates are the app's `weekdayDateLabel`.
 */
export function pauseSummaryLine(
  pause: { startDate: string; endDate: string; reason: string | null },
  today: string,
): string {
  const reason = pauseReasonLabel(pause.reason);
  const dates =
    pause.startDate > today
      ? `Starts ${weekdayDateLabel(pause.startDate)}, through ${weekdayDateLabel(pause.endDate)}`
      : `Paused through ${weekdayDateLabel(pause.endDate)}`;
  return reason ? `${dates} · ${reason}` : dates;
}
