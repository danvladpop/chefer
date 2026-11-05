import {
  coachingCheckInRepository,
  trainerProfileRepository,
  weeklyEmailRepository,
  type ICoachingCheckInRepository,
  type ITrainerProfileRepository,
} from '@chefer/database';
import {
  QUIET_LIMITS,
  type SaveTrainerAlertsInput,
  type TrainerAlertsConfigDto,
} from '@chefer/types';
import { quietDaysOf } from '@chefer/utils';
import { trainerToolsOffError } from '../../lib/coaching-errors.js';
import { EmailQuotaError, emailTransport, type IEmailService } from '../../lib/email/index.js';
import { renderQuietDigestEmail } from '../../lib/email/templates.js';
import { unsubscribeUrl, type UnsubscribeScope } from '../../lib/email/tokens.js';
import { env } from '../../lib/env.js';
import { serverToday } from '../gym/mappers.js';
import { coachingLinkService, type CoachingLinkService } from './coaching-link.service.js';

// ─── Trainer coaching: "client went quiet" (lane K4) ──────────────────────────
// The trainer's threshold (N days with nothing logged, default 3) and the
// optional daily digest. The quiet rule itself lives in `quietState`
// (@chefer/utils) and is applied by `CoachingLinkService.listClients`, so the
// Clients list, Today, the badge and the digest all agree.
//
// Digest: daily from QUIET_LIMITS.digestHourUtc (server UTC), to trainers who
// turned it on with a confirmed address, only when someone is quiet; once per
// day via `email_sends` (kind COACHING_QUIET_DIGEST). Names and day counts
// only: never food, weight or check-in answers.

export const QUIET_DIGEST_KIND = 'COACHING_QUIET_DIGEST';
const UNSUBSCRIBE_SCOPE: UnsubscribeScope = 'COACHING_QUIET_DIGEST';

export interface TrainerAlertsDeps {
  trainers: Pick<
    ITrainerProfileRepository,
    'findActive' | 'saveAlertsConfig' | 'markQuietSeen' | 'listDigestRecipients'
  >;
  links: Pick<CoachingLinkService, 'listClients'>;
  /** The `email_sends` claim helpers (shared with the check-in email). */
  claims: Pick<ICoachingCheckInRepository, 'claimEmail' | 'releaseEmail'>;
  email: IEmailService;
  sendBudget: () => Promise<number | null>;
  appUrl: string;
  unsubscribeUrl: (userId: string, scope: UnsubscribeScope) => string;
  now: () => Date;
}

const defaultDeps = (): TrainerAlertsDeps => ({
  trainers: trainerProfileRepository,
  links: coachingLinkService,
  claims: coachingCheckInRepository,
  email: emailTransport,
  // Lazy: the weekly-email module pulls in the shopping list and the AI stack.
  sendBudget: async () => {
    const { defaultSendBudget } = await import('../notifications/weekly-email.service.js');
    return defaultSendBudget(weeklyEmailRepository);
  },
  appUrl: env.APP_URL,
  unsubscribeUrl,
  now: () => new Date(),
});

export interface QuietDigestResult {
  sent: number;
  skipped: number;
  failed: number;
  capped: boolean;
}

export class TrainerAlertsService {
  private readonly deps: TrainerAlertsDeps;

  constructor(deps: Partial<TrainerAlertsDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  /** `trainer.alerts.config`. */
  async config(trainerId: string): Promise<TrainerAlertsConfigDto> {
    const profile = await this.deps.trainers.findActive(trainerId);
    if (!profile) throw trainerToolsOffError();
    return { quietAfterDays: profile.quietAfterDays, digestEmail: profile.quietDigestEmail };
  }

  /** `trainer.alerts.saveConfig`. */
  async saveConfig(
    trainerId: string,
    input: SaveTrainerAlertsInput,
  ): Promise<TrainerAlertsConfigDto> {
    const saved = await this.deps.trainers.saveAlertsConfig(trainerId, {
      quietAfterDays: input.quietAfterDays,
      quietDigestEmail: input.digestEmail,
    });
    if (!saved) throw trainerToolsOffError();
    return { quietAfterDays: saved.quietAfterDays, digestEmail: saved.quietDigestEmail };
  }

  /** `trainer.quiet.markSeen`: the trainer looked at Today; the quiet badge starts over. */
  async markSeen(trainerId: string): Promise<{ ok: true }> {
    await this.deps.trainers.markQuietSeen(trainerId, this.deps.now());
    return { ok: true };
  }

  /** The daily digest sweep (CoachingAlertsWorker). Idempotent per trainer and day. */
  async sendQuietDigests(now: Date = this.deps.now()): Promise<QuietDigestResult> {
    const result: QuietDigestResult = { sent: 0, skipped: 0, failed: 0, capped: false };
    if (now.getUTCHours() < QUIET_LIMITS.digestHourUtc) return result;
    const today = serverToday(now);
    const claimDate = new Date(`${today}T00:00:00.000Z`);
    const recipients = await this.deps.trainers.listDigestRecipients({
      kind: QUIET_DIGEST_KIND,
      claimDate,
    });
    if (recipients.length === 0) return result;
    let budget = await this.deps.sendBudget();
    for (const r of recipients) {
      if (budget !== null && budget <= 0) {
        result.capped = true;
        break;
      }
      try {
        const rows = await this.deps.links.listClients(r.userId, today);
        const quiet = rows
          .filter((row) => row.quiet === true)
          .map((row) => ({ name: row.name, days: quietDaysOf(row) }))
          .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
        if (quiet.length === 0) {
          result.skipped += 1;
          continue;
        }
        if (!(await this.deps.claims.claimEmail(r.userId, QUIET_DIGEST_KIND, claimDate))) {
          result.skipped += 1;
          continue;
        }
        const unsubscribe = this.deps.unsubscribeUrl(r.userId, UNSUBSCRIBE_SCOPE);
        const rendered = renderQuietDigestEmail({
          firstName: r.firstName,
          quietAfterDays: r.quietAfterDays,
          clients: quiet,
          clientsUrl: `${this.deps.appUrl}/trainer/today`,
          unsubscribeUrl: unsubscribe,
        });
        try {
          await this.deps.email.send({
            to: r.email,
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
            headers: { 'List-Unsubscribe': `<${unsubscribe}>` },
          });
        } catch (err) {
          await this.deps.claims.releaseEmail(r.userId, QUIET_DIGEST_KIND, claimDate);
          throw err;
        }
        result.sent += 1;
        if (budget !== null) budget -= 1;
      } catch (err) {
        if (err instanceof EmailQuotaError) {
          result.capped = true;
          break;
        }
        result.failed += 1;
        console.error(`[QuietDigest] failed for trainer ${r.userId}:`, err);
      }
    }
    return result;
  }
}

export const trainerAlertsService = new TrainerAlertsService();
