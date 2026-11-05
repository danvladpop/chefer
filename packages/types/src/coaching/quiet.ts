// ─── Trainer coaching: "client went quiet" (lane K4) ──────────────────────────
// Owner decision 2026-10-22: when a client hasn't logged food or training for
// N days (the trainer sets N, default 3), the trainer sees it in Today and
// Clients, with an in-app badge and an optional daily digest email.
//
// Food counts only while the client shares their food log: a client who
// doesn't share it never tells the trainer, even indirectly, when they log
// food. Without sharing, "quiet" means "no workout".

import { z } from 'zod';
import { localDateSchema } from '../gym/schemas';

export const QUIET_LIMITS = {
  defaultDays: 3,
  minDays: 1,
  maxDays: 14,
  /** The choices offered in settings. */
  dayChoices: [1, 2, 3, 5, 7, 14] as readonly number[],
  /** The digest goes out daily from this hour (UTC). */
  digestHourUtc: 7,
  /** Names listed in a digest; the rest are counted. */
  digestMaxNames: 20,
  /** How far back a food log counts as the last activity. */
  activityWindowDays: 60,
} as const;

/** `trainer.alerts.saveConfig`. */
export const saveTrainerAlertsInputSchema = z.object({
  quietAfterDays: z.number().int().min(QUIET_LIMITS.minDays).max(QUIET_LIMITS.maxDays),
  digestEmail: z.boolean(),
});
export type SaveTrainerAlertsInput = z.infer<typeof saveTrainerAlertsInputSchema>;

/** `trainer.badges` (additive input): the trainer's device-local date; older clients send none. */
export const trainerBadgesInputSchema = z.object({ today: localDateSchema }).optional();

export interface TrainerAlertsConfigDto {
  quietAfterDays: number;
  digestEmail: boolean;
}

export const QUIET_COPY = {
  settingsTitle: 'Client alerts',
  quietLabel: 'Tell me when a client goes quiet after',
  days: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
  quietHint:
    'Quiet = no workout logged, and no food logged for clients who share their food log with you.',
  digest: 'Email me a daily summary',
  digestHint: 'Once a day, only when someone is quiet.',
  save: 'Save',
  saved: 'Alerts saved',
  /** Today / Clients: replaces "N days without a workout" when food counts too. */
  row: (days: number) => `Nothing logged for ${days} ${days === 1 ? 'day' : 'days'}`,
  statHint: (days: number) => `${days}+ days with nothing logged`,
  email: {
    subject: (n: number) => (n === 1 ? '1 client went quiet' : `${n} clients went quiet`),
    preheader: 'Who hasn’t logged anything lately.',
    intro: (days: number) =>
      `These clients haven’t logged a workout (or food, if they share it with you) for ${days}+ days:`,
    line: (name: string, days: number) => `${name}: nothing logged for ${days} days`,
    more: (n: number) => `and ${n} more`,
    cta: 'Open your clients',
    unsubscribe: 'Stop these emails',
  },
} as const;
