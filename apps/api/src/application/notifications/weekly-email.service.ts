import {
  chefProfileRepository,
  chefReviewRepository,
  MealPlanOrigin,
  mealPlanRepository,
  mealRatingRepository,
  weeklyEmailRepository,
  weightEntryRepository,
  type IChefProfileRepository,
  type IChefReviewRepository,
  type IMealPlanRepository,
  type IMealRatingRepository,
  type IWeeklyEmailRepository,
  type IWeightEntryRepository,
  type WeekLogRow,
  type WeeklyEmailKind,
  type WeeklyEmailRecipient,
} from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { formatBodyWeight, formatMoney, toDisplayCurrency } from '@chefer/utils';
import { emailService, type EmailMessage, type IEmailService } from '../../lib/email/index.js';
import {
  renderWeeklyRecapEmail,
  renderWeekReadyEmail,
  type RenderedEmail,
  type WeekSource,
} from '../../lib/email/templates.js';
import { unsubscribeUrl, type UnsubscribeScope } from '../../lib/email/tokens.js';
import { isPremiumUser } from '../../lib/entitlements.js';
import { env } from '../../lib/env.js';
import { weekStartUtc } from '../coach/coach.service.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';
import { shoppingListService } from '../shopping-list/shopping-list.service.js';

// ─── Weekly emails (audit P2-5, F-PM-14, F-PLAN-4-3) ──────────────────────────
// The outbound retention channel, for BOTH tiers:
// - Monday: "your week is ready" — the week's dinners and the estimated
//   shopping-list total in the user's currency. Free users see their curated
//   Sunday auto-week, premium users their learned one.
// - Sunday: a recap — meals logged, days on target, weight change and gym
//   sessions, plus next week when it's already planned.
//
// Idempotency: a send is claimed in email_sends (@@unique per user, kind and
// week) before it goes out, and recipients who already have a claim for the
// week are never even loaded — restarts and repeated ticks can't double-send.
// A failed send releases its claim so the next tick retries it.

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
/** A logged day counts as "on target" within ±10% of the calorie target. */
const ON_TARGET_TOLERANCE = 0.1;
/** How far back the recap looks for the "before" weigh-in. */
const WEIGHT_LOOKBACK_DAYS = 28;
/** Resend's default rate limit is 2 requests/second. */
const DEFAULT_SEND_DELAY_MS = 600;

// ─── Pure helpers (unit-tested) ───────────────────────────────────────────────

/**
 * Monday 00:00 in SERVER-local time of the week containing `now`, shifted by
 * `offsetWeeks` — the same convention the meal-plan service stores
 * weekStartDate with (getMondayOfWeek).
 */
export function mondayLocal(now: Date, offsetWeeks = 0): Date {
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// A fixed table, not Intl: ICU versions disagree on "Sep" vs "Sept".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthOf = (date: Date): string => MONTHS[date.getUTCMonth()] ?? '';

/** "22–28 Sep", or "29 Sep – 5 Oct" across a month boundary. `monday` is UTC midnight. */
export function weekLabel(monday: Date): string {
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const startMonth = monthOf(monday);
  const endMonth = monthOf(sunday);
  return startMonth === endMonth
    ? `${monday.getUTCDate()}–${sunday.getUTCDate()} ${endMonth}`
    : `${monday.getUTCDate()} ${startMonth} – ${sunday.getUTCDate()} ${endMonth}`;
}

/** "YYYY-MM-DD" of a UTC-midnight date. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type Slot = { type: string; recipeId: string };

/**
 * One row per planned day, Monday first: the day's dinner, or its last meal
 * when the day has no dinner. Days without meals are left out.
 */
export function planDinners(
  days: { dayOfWeek: number; meals: unknown }[],
  recipeNames: Map<string, string>,
): { day: string; name: string }[] {
  return [...days]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .flatMap((d) => {
      const meals = Array.isArray(d.meals) ? (d.meals as Slot[]) : [];
      const slot = meals.find((m) => m.type === 'dinner') ?? meals[meals.length - 1];
      const name = slot ? recipeNames.get(slot.recipeId) : undefined;
      const day = DAY_NAMES[d.dayOfWeek];
      return name && day ? [{ day, name }] : [];
    });
}

export function weekSource(origin: MealPlanOrigin, premium: boolean): WeekSource {
  if (origin === MealPlanOrigin.WEEKLY_AUTO) return premium ? 'chef' : 'curated';
  if (origin === MealPlanOrigin.TEMPLATE) return 'template';
  return 'yours';
}

export function recapCounts(
  logs: WeekLogRow[],
  targetKcal: number,
): { mealsLogged: number; daysLogged: number; daysOnTarget: number } {
  const logged = logs.filter((l) => l.mealCount > 0);
  return {
    mealsLogged: logged.reduce((sum, l) => sum + l.mealCount, 0),
    daysLogged: logged.length,
    daysOnTarget: logged.filter(
      (l) => Math.abs(l.totalKcal - targetKcal) <= targetKcal * ON_TARGET_TOLERANCE,
    ).length,
  };
}

/**
 * "−0.4 kg since your previous weigh-in": the week's last weigh-in against
 * the last one before the week (within 4 weeks). Null without both;
 * "steady" under 0.05 kg.
 */
export function weightChangeLabel(
  entries: { recordedAt: Date; weightKg: number }[],
  weekStart: Date,
  units: 'METRIC' | 'IMPERIAL',
): string | null {
  const sorted = [...entries].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const before = sorted.filter((e) => e.recordedAt < weekStart).at(-1);
  const during = sorted.filter((e) => e.recordedAt >= weekStart).at(-1);
  if (!before || !during) return null;
  const delta = during.weightKg - before.weightKg;
  if (Math.abs(delta) < 0.05) return 'steady since your previous weigh-in';
  const signed = formatBodyWeight(delta, units, { signed: true }).replace('-', '−');
  return `${signed} since your previous weigh-in`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface WeeklyEmailDeps {
  repo: IWeeklyEmailRepository;
  email: IEmailService;
  mealPlans: Pick<IMealPlanRepository, 'findByWeekStart' | 'findRecipesByIds'>;
  profiles: Pick<IChefProfileRepository, 'findByUserId'>;
  ratings: Pick<IMealRatingRepository, 'findSignalsForUser'>;
  weights: Pick<IWeightEntryRepository, 'findInRange'>;
  reviews: Pick<IChefReviewRepository, 'findByUserAndWeek'>;
  /** This week's shopping-list estimate in EUR (what the list page shows). */
  listTotalEur: (user: UserProfile) => Promise<number | null>;
  appUrl: string;
  unsubscribeUrl: (userId: string, scope: UnsubscribeScope) => string;
  sendDelayMs: number;
}

export interface SweepOptions {
  /** Only this account (the manual trigger script). */
  userId?: string;
  /** Render and log, but never claim or send. */
  dryRun?: boolean;
}

export interface SweepResult {
  sent: number;
  skipped: number;
  failed: number;
  /** Rendered emails, only in dry-run mode. */
  previews: EmailMessage[];
}

const SCOPE: Record<WeeklyEmailKind, UnsubscribeScope> = {
  WEEK_READY: 'WEEK_READY',
  WEEKLY_RECAP: 'WEEKLY_RECAP',
};

export class WeeklyEmailService {
  private readonly deps: WeeklyEmailDeps;

  constructor(deps: Partial<WeeklyEmailDeps> = {}) {
    this.deps = {
      repo: weeklyEmailRepository,
      email: emailService,
      mealPlans: mealPlanRepository,
      profiles: chefProfileRepository,
      ratings: mealRatingRepository,
      weights: weightEntryRepository,
      reviews: chefReviewRepository,
      listTotalEur: async (user) =>
        (await shoppingListService.getForWeek(user, 0)).estimatedTotalEur,
      appUrl: env.APP_URL,
      unsubscribeUrl,
      sendDelayMs: DEFAULT_SEND_DELAY_MS,
      ...deps,
    };
  }

  /** Monday: "your week is ready" to every opted-in, confirmed address. */
  sendWeekReady(now: Date = new Date(), options: SweepOptions = {}): Promise<SweepResult> {
    return this.sweep('WEEK_READY', now, options, (user) => this.buildWeekReady(user, now));
  }

  /** Sunday: the week's recap to every opted-in, confirmed address. */
  sendWeeklyRecap(now: Date = new Date(), options: SweepOptions = {}): Promise<SweepResult> {
    return this.sweep('WEEKLY_RECAP', now, options, (user) => this.buildWeeklyRecap(user, now));
  }

  private async sweep(
    kind: WeeklyEmailKind,
    now: Date,
    options: SweepOptions,
    build: (user: WeeklyEmailRecipient) => Promise<RenderedEmail | null>,
  ): Promise<SweepResult> {
    const weekStart = weekStartUtc(now);
    const result: SweepResult = { sent: 0, skipped: 0, failed: 0, previews: [] };
    const recipients = await this.deps.repo.findRecipients(kind, weekStart, options.userId);

    for (const user of recipients) {
      try {
        const rendered = await build(user);
        if (!rendered) {
          result.skipped += 1;
          continue;
        }
        const message = this.toMessage(user, kind, rendered);
        if (options.dryRun) {
          result.previews.push(message);
          continue;
        }
        // Claim first: a concurrent tick (or a second API instance) loses here.
        if (!(await this.deps.repo.claimSend(user.id, kind, weekStart))) {
          result.skipped += 1;
          continue;
        }
        try {
          await this.deps.email.send(message);
          result.sent += 1;
        } catch (err) {
          await this.deps.repo.releaseSend(user.id, kind, weekStart);
          throw err;
        }
        if (this.deps.sendDelayMs > 0) {
          await new Promise((r) => setTimeout(r, this.deps.sendDelayMs));
        }
      } catch (err) {
        // One user's failure must never starve the rest of the sweep.
        result.failed += 1;
        console.error(`[WeeklyEmail] ${kind} failed for user ${user.id}:`, err);
      }
    }
    return result;
  }

  private toMessage(
    user: WeeklyEmailRecipient,
    kind: WeeklyEmailKind,
    rendered: RenderedEmail,
  ): EmailMessage {
    const unsubscribe = this.deps.unsubscribeUrl(user.id, SCOPE[kind]);
    return {
      to: user.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      headers: { 'List-Unsubscribe': `<${unsubscribe}>` },
    };
  }

  private urls(userId: string, kind: WeeklyEmailKind) {
    const app = this.deps.appUrl;
    return {
      planUrl: `${app}/meal-plan`,
      nextWeekUrl: `${app}/meal-plan?week=1`,
      listUrl: `${app}/shopping-list`,
      progressUrl: `${app}/progress`,
      preferencesUrl: `${app}/preferences`,
      unsubscribeUrl: this.deps.unsubscribeUrl(userId, SCOPE[kind]),
    };
  }

  /** Null when there is nothing planned this week — no "ready" email for an empty week. */
  async buildWeekReady(user: WeeklyEmailRecipient, now: Date): Promise<RenderedEmail | null> {
    const plan = await this.deps.mealPlans.findByWeekStart(user.id, mondayLocal(now));
    if (!plan) return null;

    const slots = plan.days.flatMap((d) => (Array.isArray(d.meals) ? (d.meals as Slot[]) : []));
    const recipes = await this.deps.mealPlans.findRecipesByIds([
      ...new Set(slots.map((s) => s.recipeId)),
    ]);
    const dinners = planDinners(plan.days, new Map(recipes.map((r) => [r.id, r.name])));
    if (dinners.length === 0) return null;

    const premium = isPremiumUser(user);
    const source = weekSource(plan.origin, premium);
    const [profile, ratings, totalEur] = await Promise.all([
      this.deps.profiles.findByUserId(user.id),
      source === 'chef' ? this.deps.ratings.findSignalsForUser(user.id, 20) : Promise.resolve([]),
      this.deps.listTotalEur(user).catch(() => null),
    ]);
    const currency = toDisplayCurrency(profile?.deliveryCurrency);
    const urls = this.urls(user.id, 'WEEK_READY');

    return renderWeekReadyEmail({
      firstName: user.firstName,
      tier: premium ? 'PREMIUM' : 'FREE',
      source,
      ratedCount: ratings.length,
      weekLabel: weekLabel(weekStartUtc(now)),
      dinners,
      listTotal: totalEur != null ? `~${formatMoney(totalEur, currency, { decimals: 0 })}` : null,
      planUrl: urls.planUrl,
      listUrl: urls.listUrl,
      preferencesUrl: urls.preferencesUrl,
      unsubscribeUrl: urls.unsubscribeUrl,
    });
  }

  /** Null for a week with nothing to recap (no meals, weigh-ins or workouts). */
  async buildWeeklyRecap(user: WeeklyEmailRecipient, now: Date): Promise<RenderedEmail | null> {
    const weekStart = weekStartUtc(now);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
    const [profile, logs, weights, gymSessions, review, nextPlan] = await Promise.all([
      this.deps.profiles.findByUserId(user.id),
      this.deps.repo.findWeekLogs(user.id, weekStart, weekEnd),
      this.deps.weights.findInRange(
        user.id,
        new Date(weekStart.getTime() - WEIGHT_LOOKBACK_DAYS * DAY_MS),
        weekEnd,
      ),
      this.deps.repo.countCompletedWorkouts(
        user.id,
        isoDate(weekStart),
        isoDate(new Date(weekEnd.getTime() - DAY_MS)),
      ),
      this.deps.reviews.findByUserAndWeek(user.id, weekStart),
      this.deps.mealPlans.findByWeekStart(user.id, mondayLocal(now, 1)),
    ]);

    const targets = resolveDailyTargets(profile ?? null);
    const counts = recapCounts(logs, targets.dailyCalorieTarget);
    const units = profile?.preferredUnits ?? 'METRIC';
    const weightChange = weightChangeLabel(weights, weekStart, units);
    if (counts.mealsLogged === 0 && !weightChange && !gymSessions) return null;

    const nextWeekDinners = nextPlan
      ? nextPlan.days.filter((d) => Array.isArray(d.meals) && d.meals.length > 0).length
      : null;
    const urls = this.urls(user.id, 'WEEKLY_RECAP');

    return renderWeeklyRecapEmail({
      firstName: user.firstName,
      tier: isPremiumUser(user) ? 'PREMIUM' : 'FREE',
      weekLabel: weekLabel(weekStart),
      ...counts,
      weightChange,
      gymSessions,
      nextWeekDinners,
      hasChefReview: review !== null,
      progressUrl: urls.progressUrl,
      planUrl: urls.nextWeekUrl,
      preferencesUrl: urls.preferencesUrl,
      unsubscribeUrl: urls.unsubscribeUrl,
    });
  }
}

export const weeklyEmailService = new WeeklyEmailService();
