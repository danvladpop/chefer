// ─── Beta feedback limits (audit F-PROF-2-2) ──────────────────────────────────
// Shared by web's FeedbackDialog and mobile's feedback card so both stop at
// the same cap and show the same counter. Mirrors the API's `feedback.submit`
// message limit (z.string().max(2000)).

/** The API's `feedback.submit` message limit. */
export const FEEDBACK_MAX_LENGTH = 2000;

/** Within this many characters of the cap the counter turns amber and is announced. */
export const FEEDBACK_NEAR_LIMIT = 100;

export type FeedbackCounterTone = 'normal' | 'near' | 'limit';

export interface FeedbackCounter {
  /** "123 / 2,000", or "Limit reached: 2,000 characters". */
  label: string;
  tone: FeedbackCounterTone;
  remaining: number;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

/** The live counter under the feedback textarea. */
export function feedbackCounter(length: number): FeedbackCounter {
  const remaining = Math.max(0, FEEDBACK_MAX_LENGTH - length);
  if (remaining === 0) {
    return {
      label: `Limit reached: ${fmt(FEEDBACK_MAX_LENGTH)} characters`,
      tone: 'limit',
      remaining,
    };
  }
  return {
    label: `${fmt(length)} / ${fmt(FEEDBACK_MAX_LENGTH)}`,
    tone: remaining <= FEEDBACK_NEAR_LIMIT ? 'near' : 'normal',
    remaining,
  };
}
