import { TRPCError } from '@trpc/server';
import {
  coachingCheckInRepository,
  coachingLinkRepository,
  trainerProfileRepository,
  weeklyEmailRepository,
  type CoachingCheckIn,
  type ICoachingCheckInRepository,
  type ICoachingLinkRepository,
  type ITrainerProfileRepository,
  type TrainerProfile,
} from '@chefer/database';
import {
  CHECK_IN_COPY,
  CHECK_IN_LIMITS,
  checkInQuestionSchema,
  DEFAULT_CHECK_IN_QUESTIONS,
  FALLBACK_TRAINER_NAME,
  type CheckInAnswers,
  type CheckInConfigDto,
  type CheckInQuestion,
  type ClientCheckInDto,
  type ClientCheckInsDto,
  type CurrentCheckInDto,
  type SaveCheckInConfigInput,
  type SubmitCheckInInput,
} from '@chefer/types';
import { checkInPeriodStart, isCompleteCheckIn } from '@chefer/utils';
import { trainerToolsOffError } from '../../lib/coaching-errors.js';
import { EmailQuotaError, emailTransport, type IEmailService } from '../../lib/email/index.js';
import { renderCheckInEmail } from '../../lib/email/templates.js';
import { unsubscribeUrl, type UnsubscribeScope } from '../../lib/email/tokens.js';
import { env } from '../../lib/env.js';
import { serverToday } from '../gym/mappers.js';
import type { CoachingAccess } from './coaching-access.service.js';
import { linkStartDay } from './coaching-dto.mappers.js';

// ─── Trainer coaching: weekly check-ins (lane K3) ─────────────────────────────
// The trainer turns a weekly check-in on (a day and up to 6 questions from the
// catalogue). Each ACTIVE client sees it open on that weekday, in their own
// calendar, from the first such day after the coaching started; it stays open
// (answers can be changed) until the next one opens a week later. The trainer
// reads the answers only through `requireCoachingAccess('read')`: an ACTIVE
// coaching. The client's note is opaque text: never sent to AI or analytics.
//
// Email: an hourly sweep on each check-in weekday from CHECK_IN_LIMITS.emailHourUtc
// (server UTC, like the weekly emails: Chefer stores no time zone per user)
// emails each client once per period (`email_sends`, kind COACHING_CHECK_IN),
// within the daily email budget shared with the weekly emails.

export const CHECK_IN_EMAIL_KIND = 'COACHING_CHECK_IN';
const UNSUBSCRIBE_SCOPE: UnsubscribeScope = 'COACHING_CHECK_IN';

export interface CoachingCheckInDeps {
  checkIns: ICoachingCheckInRepository;
  links: Pick<ICoachingLinkRepository, 'findActiveForClient'>;
  trainers: Pick<ITrainerProfileRepository, 'find' | 'findActive' | 'saveCheckInConfig'>;
  email: IEmailService;
  /** How many more bulk emails may go out now (the budget shared with the weekly emails), null = no cap. */
  sendBudget: () => Promise<number | null>;
  appUrl: string;
  unsubscribeUrl: (userId: string, scope: UnsubscribeScope) => string;
  now: () => Date;
}

const defaultDeps = (): CoachingCheckInDeps => ({
  checkIns: coachingCheckInRepository,
  links: coachingLinkRepository,
  trainers: trainerProfileRepository,
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

/** The trainer's questions, valid catalogue keys only (an unknown stored key is dropped). */
function questionsOf(profile: Pick<TrainerProfile, 'checkInQuestions'>): CheckInQuestion[] {
  const valid = profile.checkInQuestions.flatMap((q) => {
    const parsed = checkInQuestionSchema.safeParse(q);
    return parsed.success ? [parsed.data] : [];
  });
  return valid.length > 0 ? valid : [...DEFAULT_CHECK_IN_QUESTIONS];
}

function configOf(profile: TrainerProfile): CheckInConfigDto {
  return {
    enabled: profile.checkInEnabled,
    day: profile.checkInDay,
    questions: questionsOf(profile),
  };
}

function answersOf(row: Pick<CoachingCheckIn, 'answers'>): CheckInAnswers {
  const raw = (row.answers ?? {}) as Record<string, unknown>;
  const out: CheckInAnswers = {};
  for (const [key, value] of Object.entries(raw)) {
    const q = checkInQuestionSchema.safeParse(key);
    if (q.success && typeof value === 'number') out[q.data] = value;
  }
  return out;
}

function toClientCheckInDto(row: CoachingCheckIn): ClientCheckInDto {
  return {
    periodStart: row.periodStart,
    submittedAt: row.submittedAt.toISOString(),
    questions: row.questions.flatMap((q) => {
      const parsed = checkInQuestionSchema.safeParse(q);
      return parsed.success ? [parsed.data] : [];
    }),
    answers: answersOf(row),
    note: row.note,
  };
}

function noCheckIn(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: CHECK_IN_COPY.server.noCheckIn });
}

export interface CheckInEmailResult {
  sent: number;
  skipped: number;
  failed: number;
  capped: boolean;
}

export class CoachingCheckInService {
  private readonly deps: CoachingCheckInDeps;

  constructor(deps: Partial<CoachingCheckInDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  // ─── Trainer ────────────────────────────────────────────────────────────────

  /** `trainer.checkIns.config`: off with the default questions until saved. */
  async config(trainerId: string): Promise<CheckInConfigDto> {
    const profile = await this.deps.trainers.findActive(trainerId);
    if (!profile) throw trainerToolsOffError();
    return configOf(profile);
  }

  /** `trainer.checkIns.saveConfig`. */
  async saveConfig(trainerId: string, input: SaveCheckInConfigInput): Promise<CheckInConfigDto> {
    const saved = await this.deps.trainers.saveCheckInConfig(trainerId, {
      enabled: input.enabled,
      day: input.day,
      questions: [...input.questions],
    });
    if (!saved) throw trainerToolsOffError();
    return configOf(saved);
  }

  /** `trainer.client.checkIns`: the pair's answered check-ins, newest first, and this week's state. */
  async forClient(access: CoachingAccess, today: string): Promise<ClientCheckInsDto> {
    const link = access.link;
    const [profile, rows] = await Promise.all([
      this.deps.trainers.find(access.trainerId),
      this.deps.checkIns.listForPair(
        access.trainerId,
        access.clientId,
        CHECK_IN_LIMITS.historyItems,
      ),
    ]);
    const enabled = profile?.checkInEnabled === true;
    const period =
      enabled && profile && link
        ? checkInPeriodStart(today, profile.checkInDay, linkStartDay(link))
        : null;
    return {
      enabled,
      current: period
        ? { periodStart: period, answered: rows.some((r) => r.periodStart === period) }
        : null,
      items: rows.map(toClientCheckInDto),
    };
  }

  // ─── Client ─────────────────────────────────────────────────────────────────

  /** `coaching.checkIn.current`: the open check-in, or null (no trainer, check-ins off, not open yet). */
  async current(clientId: string, today: string): Promise<CurrentCheckInDto | null> {
    const link = await this.deps.links.findActiveForClient(clientId);
    if (!link) return null;
    const profile = await this.deps.trainers.findActive(link.trainerId);
    if (!profile?.checkInEnabled) return null;
    const periodStart = checkInPeriodStart(today, profile.checkInDay, linkStartDay(link));
    if (!periodStart) return null;
    const existing = await this.deps.checkIns.find(link.trainerId, clientId, periodStart);
    return {
      periodStart,
      trainerName: profile.displayName || FALLBACK_TRAINER_NAME,
      // An answered check-in keeps the questions it was answered with.
      questions: existing ? toClientCheckInDto(existing).questions : questionsOf(profile),
      answered: existing
        ? {
            submittedAt: existing.submittedAt.toISOString(),
            answers: answersOf(existing),
            note: existing.note,
          }
        : null,
    };
  }

  /**
   * `coaching.checkIn.submit`: answers the OPEN check-in (its `periodStart`),
   * every question 1–5. Answering again changes the answers until the next one opens.
   */
  async submit(
    clientId: string,
    input: SubmitCheckInInput,
  ): Promise<{ checkIn: CurrentCheckInDto; edit: boolean }> {
    const open = await this.current(clientId, input.today);
    if (open?.periodStart !== input.periodStart) throw noCheckIn();
    if (!isCompleteCheckIn(open.questions, input.answers)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: CHECK_IN_COPY.client.needsAll });
    }
    const link = await this.deps.links.findActiveForClient(clientId);
    if (!link) throw noCheckIn();
    const note = input.note?.trim() ? input.note.trim() : null;
    const { checkIn, created } = await this.deps.checkIns.upsert({
      trainerId: link.trainerId,
      clientId,
      periodStart: open.periodStart,
      questions: open.questions,
      answers: Object.fromEntries(open.questions.map((q) => [q, input.answers[q] ?? 0])),
      note,
      now: this.deps.now(),
    });
    return {
      checkIn: {
        ...open,
        answered: {
          submittedAt: checkIn.submittedAt.toISOString(),
          answers: answersOf(checkIn),
          note: checkIn.note,
        },
      },
      edit: !created,
    };
  }

  // ─── Email sweep ────────────────────────────────────────────────────────────

  /**
   * Emails every client whose trainer's check-in opens today (server UTC date)
   * once per period. Idempotent per (client, period) through `email_sends`.
   */
  async sendCheckInEmails(now: Date = this.deps.now()): Promise<CheckInEmailResult> {
    const result: CheckInEmailResult = { sent: 0, skipped: 0, failed: 0, capped: false };
    if (now.getUTCHours() < CHECK_IN_LIMITS.emailHourUtc) return result;
    const today = serverToday(now);
    const day = (now.getUTCDay() + 6) % 7;
    const claimDate = new Date(`${today}T00:00:00.000Z`);
    const recipients = await this.deps.checkIns.findEmailRecipients({
      day,
      kind: CHECK_IN_EMAIL_KIND,
      claimDate,
    });
    if (recipients.length === 0) return result;
    let budget = await this.deps.sendBudget();
    for (const r of recipients) {
      if (budget !== null && budget <= 0) {
        result.capped = true;
        break;
      }
      if (!(await this.deps.checkIns.claimEmail(r.clientId, CHECK_IN_EMAIL_KIND, claimDate))) {
        result.skipped += 1;
        continue;
      }
      const unsubscribe = this.deps.unsubscribeUrl(r.clientId, UNSUBSCRIBE_SCOPE);
      const rendered = renderCheckInEmail({
        firstName: r.firstName,
        trainerName: r.trainerName,
        answerUrl: `${this.deps.appUrl}/coaching/check-in`,
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
        result.sent += 1;
        if (budget !== null) budget -= 1;
      } catch (err) {
        await this.deps.checkIns.releaseEmail(r.clientId, CHECK_IN_EMAIL_KIND, claimDate);
        if (err instanceof EmailQuotaError) {
          result.capped = true;
          break;
        }
        result.failed += 1;
        console.error(`[CheckInEmail] failed for user ${r.clientId}:`, err);
      }
    }
    return result;
  }
}

export const coachingCheckInService = new CoachingCheckInService();
