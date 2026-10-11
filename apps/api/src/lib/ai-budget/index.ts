import { aiUsageRepository } from '@chefer/database';
import { setAiBudgetGates } from '../ai/budget-gate.js';
import { startAiUsageRecording } from '../ai/usage-recorder.js';
import { emailService, transactionalSendLog } from '../email/index.js';
import { env } from '../env.js';
import { AiBudget } from './budget.js';

// ─── AI budget wiring (Phase 2) ───────────────────────────────────────────────
// Production instance of AiBudget (budget.ts) plus startup: the usage
// recorder (one AiUsageEvent per model call) and the budget gates that
// lib/quotas.ts and the background workers consult (lib/ai/budget-gate.ts).

/** Owner address for the 50/80/100% alerts: AI_BUDGET_ALERT_EMAIL, else FEEDBACK_NOTIFY_EMAIL. */
const alertTo = env.AI_BUDGET_ALERT_EMAIL ?? env.FEEDBACK_NOTIFY_EMAIL;

export const aiBudget = new AiBudget(
  {
    enforce: env.AI_BUDGET_ENFORCE,
    userSoftUsd: env.AI_USER_MONTHLY_SOFT_USD,
    userHardUsd: env.AI_USER_MONTHLY_HARD_USD,
    globalDailyUsd: env.AI_GLOBAL_DAILY_USD,
  },
  {
    repo: aiUsageRepository,
    sendAlert: alertTo
      ? async ({ subject, text }) => {
          // EMAIL_DAILY_CAP: an alert is never worth going past the mailbox's
          // daily limit (the line is still logged by AiBudget).
          const cap = env.EMAIL_DAILY_CAP;
          if (cap !== null && transactionalSendLog.countLastDay() >= cap) {
            console.warn(`[ai.budget] alert not mailed — EMAIL_DAILY_CAP=${cap} reached`);
            return;
          }
          await emailService.send({ to: alertTo, subject, text });
        }
      : undefined,
  },
);

let stopRecording: (() => void) | null = null;

/** Starts recording AI usage and installs the budget gates. Idempotent. */
export function startAiBudget(): void {
  if (stopRecording) return;
  stopRecording = startAiUsageRecording({
    write: (event) => aiUsageRepository.create(event),
    onRecorded: (event) => aiBudget.record(event),
  });
  setAiBudgetGates(aiBudget.gates());
  console.info(
    `[ai.budget] enforce=${env.AI_BUDGET_ENFORCE}, per user $${env.AI_USER_MONTHLY_SOFT_USD}/$${env.AI_USER_MONTHLY_HARD_USD} a month (soft/hard), global $${env.AI_GLOBAL_DAILY_USD} a day${alertTo ? '' : ' — no alert address (AI_BUDGET_ALERT_EMAIL / FEEDBACK_NOTIFY_EMAIL)'}`,
  );
}

/** Stops recording and removes the gates (graceful shutdown, tests). */
export function stopAiBudget(): void {
  stopRecording?.();
  stopRecording = null;
  setAiBudgetGates(null);
}

export {
  AI_PAUSED_TODAY_MESSAGE,
  AI_USER_BUDGET_MESSAGE,
  type UserAiBudgetStatus,
} from './budget.js';
