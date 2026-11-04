import { TRPCError } from '@trpc/server';
import {
  cookLogRepository,
  parseSkippedSlots,
  type ICookLogRepository,
  type LoggedMealEntry,
} from '@chefer/database';
import {
  achievementIdSchema,
  planSlotMealTypeSchema,
  type AchievementsDto,
  type FinishCookInput,
  type FinishCookResult,
  type FlameInfo,
  type GoalHistoryEntry,
  type PauseRange,
  type ProgressAckInput,
  type ProgressInbox,
  type ProgressMarkSeenInput,
  type ProgressSettings,
  type ProgressSettingsPatch,
  type ProgressSummary,
  type Receipt,
  type TodaysThree,
  type TodaysThreeQuest,
  type WeeklyRecap,
} from '@chefer/types';
import {
  addDaysLocal,
  buildAchievements,
  calorieFloor,
  cookCandidate,
  dateOnlyKey,
  DEFAULT_ACTIVE_DAY_GOAL,
  hiddenAchievements,
  levelForXp,
  lowIntakeSignal,
  nextRank,
  pickTodaysThree,
  questDone,
  rankFor,
  recapWeekFor,
  slotStates,
  todaysThreeCandidate,
  weekStartOf,
  welcomeCandidate,
  XP,
} from '@chefer/utils';
import { planForDate } from '../meal-plan/plan-for-date.js';
import { dayIndexOf, resolvePlanMeals } from './day-facts.js';
import {
  BACKFILL_VERSION,
  progressBackfillService,
  type ProgressBackfillService,
} from './progress-backfill.service.js';
import { toFlameInfo } from './progress-flame.js';
import {
  levelOf,
  levelUpFromTo,
  toReceipt,
  toUnlocks,
  toWorkoutReceipt,
} from './progress-mappers.js';
import { progressRecapService, type ProgressRecapService } from './progress-recap.service.js';
import { progressRecorder, toDayEventFacts, type ProgressRecorder } from './progress-recorder.js';
import {
  parseGoalHistory,
  parsePauses,
  parseQuests,
  parseSettings,
} from './progress-state-json.js';

// ─── ProgressService (docs/gamification-2026-10/tech-plan.md §4) ──────────────
// The reads and settings behind `progress.*`. The ledger is only ever written
// through the recorder; this service decides what to show.

export type ProgressUser = { id: string; email: string };

/** A Monday far in the past: the active-day goal in force before the user first changed it. */
const GOAL_BASELINE_WEEK = '2020-01-06';

const EMPTY_INBOX: ProgressInbox = { receipts: [], unlocks: [], levelUp: null, cursor: null };
const INBOX_LIMIT = 50;
const LOOKBACK_DAYS = 30;

export type ProgressServiceDeps = {
  recorder: Pick<
    ProgressRecorder,
    'deps' | 'record' | 'refresh' | 'counters' | 'flame' | 'userToday'
  >;
  backfill: Pick<ProgressBackfillService, 'backfillUser'>;
  recap: Pick<ProgressRecapService, 'weeklyRecap'>;
  cookLogs: ICookLogRepository;
  /** The name of a recipe the user may see, else null. */
  visibleRecipeName: (userId: string, recipeId: string) => Promise<string | null>;
  /** Is a lift planned or done on this date (Today's three: "finish today's workout")? */
  liftPlanned: (userId: string, localDate: string) => Promise<boolean>;
  isEnabled: (user: ProgressUser) => boolean | Promise<boolean>;
};

export class ProgressService {
  private resolved: ProgressServiceDeps | null = null;

  constructor(private readonly overrides: Partial<ProgressServiceDeps> = {}) {}

  private get deps(): ProgressServiceDeps {
    this.resolved ??= {
      recorder: progressRecorder,
      backfill: progressBackfillService,
      recap: progressRecapService,
      cookLogs: cookLogRepository,
      // The heavier services load on use, so importing this module needs no env.
      visibleRecipeName: async (userId, recipeId) =>
        (await (await import('../recipe/recipe-access.js')).findRecipeVisibleTo(userId, recipeId))
          ?.name ?? null,
      liftPlanned: async (userId, localDate) => {
        const { trainingNutritionService } =
          await import('../training-nutrition/training-nutrition.service.js');
        const day = await trainingNutritionService.trainingDayFor(
          userId,
          localDate,
          dayIndexOf(localDate),
        );
        return day.isTrainingDay && day.kind === 'lift';
      },
      isEnabled: async (user) =>
        (await import('../../lib/progress-flags.js')).isProgressEnabledFor(user),
      ...this.overrides,
    };
    return this.resolved;
  }

  private get repos() {
    return this.deps.recorder.deps;
  }

  // ─── summary ────────────────────────────────────────────────────────────────

  /** First call creates the state, back-dates history (§7) and pays WELCOME. */
  async summary(user: ProgressUser, localDate: string): Promise<ProgressSummary> {
    const d = this.deps;
    const r = this.repos;
    const userId = user.id;

    let state = await r.states.ensure(userId);
    if (state.backfillVersion !== BACKFILL_VERSION) {
      await d.backfill.backfillUser(userId, { today: localDate });
    }
    if (!(await r.events.bySource(userId, 'WELCOME', '1'))) {
      await this.introduce(userId, localDate);
    }
    state = (await r.states.find(userId)) ?? state;

    const info = levelForXp(state.totalXp);
    const profile = await r.profiles.findByUserId(userId);
    const quiet = await this.isQuiet(userId, profile?.biologicalSex);
    const [flame, todaysThree, intro, recap] = await Promise.all([
      d.recorder.flame.read(userId, localDate, info.level, { withTraining: true }),
      this.todaysThree(userId, localDate, profile, quiet),
      state.introducedAt === null ? this.introCard(userId) : Promise.resolve(null),
      this.recapFor(userId, localDate, state.recapSeenWeek),
    ]);

    return {
      xp: info,
      rank: rankFor(info.level),
      nextRank: nextRank(info.level),
      flame: toFlameInfo(flame),
      todaysThree,
      settings: parseSettings(state.settings),
      quiet,
      intro,
      recap,
    };
  }

  /**
   * The endowed start (idea 6): pay WELCOME, set the level and cursor so history
   * never replays as a celebration storm, and mark every earned badge seen. One
   * "Welcome to the kitchen" card shows it instead.
   */
  private async introduce(userId: string, localDate: string): Promise<void> {
    const r = this.repos;
    await this.deps.recorder.record(userId, [welcomeCandidate(localDate)], { today: localDate });
    const welcome = await r.events.bySource(userId, 'WELCOME', '1');
    const at = welcome?.createdAt ?? r.now();
    const total = await r.events.totalXp(userId);
    await r.states.update(userId, {
      lastSeenLevel: levelOf(total),
      seenCursor: at,
    });
    await r.unlocks.markSeen(userId, null, at);
  }

  /** "Your history earned N XP and M badges": everything recorded up to the welcome. */
  private async introCard(userId: string): Promise<ProgressSummary['intro']> {
    const r = this.repos;
    const welcome = await r.events.bySource(userId, 'WELCOME', '1');
    if (!welcome) return null;
    const [events, unlocks] = await Promise.all([r.events.listAll(userId), r.unlocks.list(userId)]);
    return {
      backdatedXp: events
        .filter((e) => e.kind !== 'WELCOME' && e.createdAt <= welcome.createdAt)
        .reduce((n, e) => n + e.xp, 0),
      badges: unlocks.filter(
        (u) => u.achievementId !== 'WELCOME' && u.seenAt !== null && u.seenAt <= welcome.createdAt,
      ).length,
    };
  }

  /** Low-intake guard (idea 59): 3 of the last 7 full days under the calorie floor. */
  private async isQuiet(
    userId: string,
    biologicalSex: string | null | undefined,
  ): Promise<boolean> {
    const r = this.repos;
    const [logs, fullDates] = await Promise.all([
      r.dailyLogs.findLastN(userId, LOOKBACK_DAYS),
      r.events.datesOfKind(userId, 'FULL_DAY'),
    ]);
    const full = new Set(fullDates);
    return lowIntakeSignal(
      logs.map((log) => {
        const localDate = dateOnlyKey(log.date);
        return { localDate, totalKcal: log.totalKcal, full: full.has(localDate) };
      }),
      calorieFloor(biologicalSex),
    );
  }

  private async recapFor(
    userId: string,
    localDate: string,
    seenWeek: string | null,
  ): Promise<ProgressSummary['recap']> {
    const weekStart = recapWeekFor(localDate);
    if (!weekStart || (seenWeek !== null && seenWeek >= weekStart)) return null;
    // A recap of an empty week is not a moment.
    const stats = await this.repos.events.weekStats(userId, weekStart);
    return stats.activeDates.length > 0 || stats.xp > 0 ? { weekStart } : null;
  }

  // ─── Today's three ──────────────────────────────────────────────────────────

  private async todaysThree(
    userId: string,
    localDate: string,
    profile: Awaited<ReturnType<ProgressRecorder['deps']['profiles']['findByUserId']>>,
    quiet: boolean,
  ): Promise<TodaysThree | null> {
    const r = this.repos;
    // The raw column: 'NONE' is the ED-safe "hide numbers" mode (market-review Lane E),
    // so there is no protein quest and no protein progress. NOT effectiveNumbersMode().
    const showProtein = profile?.numbersMode !== 'NONE' && !quiet;

    const dayDate = new Date(`${localDate}T00:00:00.000Z`);
    const [stored, log] = await Promise.all([
      r.questDays.find(userId, localDate),
      r.dailyLogs.findByDate(userId, dayDate),
    ]);
    let quests = parseQuests(stored?.quests);
    if (!stored) {
      quests = await this.pickQuests(userId, localDate, profile, quiet, log);
      if (quests.length > 0) {
        // First writer wins: a parallel call gets the set that was stored first.
        const row = await r.questDays.createIfAbsent(userId, localDate, quests);
        quests = parseQuests(row.quests);
      }
    }

    const shown = quests.filter((q) => q.kind !== 'PROTEIN' || showProtein);
    if (shown.length === 0) return null;
    const facts = toDayEventFacts(await r.events.dayEvents(userId, localDate));
    const withState: TodaysThreeQuest[] = shown.map((q) => ({
      ...q,
      done: questDone(q, facts),
      ...(q.kind === 'PROTEIN' && q.proteinTargetG
        ? { progress: { current: Math.round(log?.totalProtein ?? 0), target: q.proteinTargetG } }
        : {}),
    }));
    const allDone = withState.every((q) => q.done);
    // A set shown for the first time on a day already done: pay the bonus once so
    // the screen and the ledger agree (the key makes a repeat free).
    if (allDone && !facts.some((f) => f.kind === 'TODAYS_THREE')) {
      await this.deps.recorder.record(userId, [todaysThreeCandidate(localDate)], {
        today: localDate,
      });
    }
    return { localDate, quests: withState, bonusXp: XP.TODAYS_THREE, allDone };
  }

  private async pickQuests(
    userId: string,
    localDate: string,
    profile: Awaited<ReturnType<ProgressRecorder['deps']['profiles']['findByUserId']>>,
    quiet: boolean,
    log: Awaited<ReturnType<ProgressRecorder['deps']['dailyLogs']['findByDate']>>,
  ): Promise<TodaysThreeQuest[]> {
    const d = this.deps;
    const r = this.repos;
    const plan = await planForDate(r.plans, userId, localDate);
    const planMeals = await resolvePlanMeals(r.plans, plan?.days, localDate);
    const entries = (log?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [];
    const skipped = parseSkippedSlots(log?.skippedSlots);
    const states = slotStates(
      planMeals.map((m) => ({ type: m.type, recipeId: m.recipeId, slotIndex: m.slotIndex })),
      entries,
      skipped,
    );
    const [proteinTargetG, liftPlanned, shopping] = await Promise.all([
      r.proteinTarget(userId, profile, localDate),
      d.liftPlanned(userId, localDate),
      plan ? r.shopping.progress(userId, plan.id) : Promise.resolve(null),
    ]);
    return pickTodaysThree({
      localDate,
      plannedSlots: planMeals.flatMap((m, i) => {
        const mealType = mealTypeOf(m.type);
        return mealType
          ? [
              {
                mealType,
                slotIndex: m.slotIndex,
                recipeId: m.recipeId,
                recipeName: m.recipeName,
                logged: states[i]?.status !== 'planned',
              },
            ]
          : [];
      }),
      proteinTargetG,
      showProtein: profile?.numbersMode !== 'NONE',
      workoutPlannedToday: liftPlanned,
      shoppingUnchecked: shopping?.unchecked ?? 0,
      quiet,
    });
  }

  // ─── inbox / ack / receipts ─────────────────────────────────────────────────

  async inbox(userId: string): Promise<ProgressInbox> {
    const r = this.repos;
    const [state, welcome] = await Promise.all([
      r.states.find(userId),
      r.events.bySource(userId, 'WELCOME', '1'),
    ]);
    // Before the welcome card there is no moment to show (history is never a storm).
    if (!state || !welcome) return EMPTY_INBOX;

    const [rows, unlocks] = await Promise.all([
      r.events.since(userId, state.seenCursor, INBOX_LIMIT),
      r.unlocks.list(userId),
    ]);
    const level = levelOf(state.totalXp);
    return {
      receipts: rows.map(toReceipt),
      unlocks: toUnlocks(unlocks.filter((u) => u.seenAt === null)),
      levelUp: levelUpFromTo(state.lastSeenLevel, level),
      cursor: rows.at(-1)?.createdAt ?? null,
    };
  }

  async ack(userId: string, input: ProgressAckInput): Promise<{ ok: true }> {
    const r = this.repos;
    if (input.upTo) await r.states.advanceSeenCursor(userId, input.upTo);
    if (input.unlockIds && input.unlockIds.length > 0) {
      await r.unlocks.markSeen(userId, input.unlockIds, r.now());
    }
    if (input.level !== undefined) {
      // Never past the level actually reached.
      const state = await r.states.find(userId);
      await r.states.raiseLastSeenLevel(
        userId,
        Math.min(input.level, levelOf(state?.totalXp ?? 0)),
      );
    }
    return { ok: true };
  }

  async receiptFor(
    userId: string,
    kind: 'WORKOUT' | 'COOK',
    sourceId: string,
  ): Promise<Receipt | null> {
    const r = this.repos;
    if (kind === 'COOK') {
      const row = await r.events.bySource(userId, 'COOK_FINISHED', sourceId);
      return row ? toReceipt(row) : null;
    }
    const [completed, prs] = await Promise.all([
      r.events.bySource(userId, 'WORKOUT_COMPLETED', sourceId),
      r.events.bySource(userId, 'WORKOUT_PRS', sourceId),
    ]);
    return completed ? toWorkoutReceipt(completed, prs) : null;
  }

  // ─── finishCook ─────────────────────────────────────────────────────────────

  /** Always stores the CookLog (D1); the receipt is null when progress is off for the user. */
  async finishCook(user: ProgressUser, input: FinishCookInput): Promise<FinishCookResult> {
    const d = this.deps;
    const userId = user.id;

    // A recipe the user can't see is recorded as "a cook", not rejected: the cook happened.
    const visibleName = input.recipeId ? await d.visibleRecipeName(userId, input.recipeId) : null;
    const { log } = await d.cookLogs.createIfAbsent({
      id: input.id,
      userId,
      recipeId: visibleName !== null ? input.recipeId : null,
      localDate: input.localDate,
      startedAt: input.startedAt ?? null,
      finishedAt: input.finishedAt,
    });
    // An id that already belongs to someone else reads as not found.
    if (log.userId !== userId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cook not found.' });
    }

    const recipeId = log.recipeId;
    const firstTime = recipeId
      ? !(await d.cookLogs.hasEarlierForRecipe(userId, recipeId, log.finishedAt, log.id))
      : false;
    const cookCount = await d.cookLogs.countForUser(userId);
    const base = cookCandidate({
      cookId: log.id,
      localDate: log.localDate,
      recipeId: recipeId ?? '',
      recipeName: visibleName ?? '',
      firstTime,
      cookCount,
    });
    // Without a recipe the meta carries only the count.
    const candidate = recipeId ? base : { ...base, meta: { cookCount } };
    const result = await d.recorder.record(userId, [candidate]);

    if (!(await d.isEnabled(user))) return { receipt: null, unlocks: [], levelUp: null };
    const row =
      result.inserted.find((e) => e.kind === 'COOK_FINISHED') ??
      (await this.repos.events.bySource(userId, 'COOK_FINISHED', log.id));
    return {
      receipt: row ? toReceipt(row) : null,
      unlocks: toUnlocks(result.unlocks),
      levelUp: levelUpFromTo(levelOf(result.totalBefore), levelOf(result.totalAfter)),
    };
  }

  // ─── achievements, recap ────────────────────────────────────────────────────

  async achievements(userId: string): Promise<AchievementsDto> {
    const r = this.repos;
    const today = await this.deps.recorder.userToday(userId);
    const [counters, unlocks, profile] = await Promise.all([
      this.deps.recorder.counters(userId, today),
      r.unlocks.list(userId),
      r.profiles.findByUserId(userId),
    ]);
    return buildAchievements(
      counters,
      unlocks.flatMap((u) => {
        const id = achievementIdSchema.safeParse(u.achievementId);
        return id.success
          ? [
              {
                id: u.id,
                achievementId: id.data,
                tier: u.tier,
                unlockedAt: u.unlockedAt,
                seenAt: u.seenAt,
              },
            ]
          : [];
      }),
      hiddenAchievements(profile?.numbersMode),
    );
  }

  async weeklyRecap(userId: string, weekStart: string): Promise<WeeklyRecap> {
    return this.deps.recap.weeklyRecap(userId, weekStart);
  }

  // ─── settings, goal, pause ──────────────────────────────────────────────────

  async updateSettings(userId: string, patch: ProgressSettingsPatch): Promise<ProgressSettings> {
    const r = this.repos;
    const state = await r.states.ensure(userId);
    const current = parseSettings(state.settings);
    const { reminder, ...rest } = patch;
    const next = parseSettings({
      ...current,
      ...definedOnly(rest),
      reminder: { ...current.reminder, ...definedOnly(reminder ?? {}) },
    });
    await r.states.update(userId, { settings: next });
    return next;
  }

  /** Takes effect from the week of `localDate`; earlier weeks keep the goal they were judged by. */
  async setActiveDayGoal(userId: string, goal: number, localDate: string): Promise<FlameInfo> {
    const r = this.repos;
    const state = await r.states.ensure(userId);
    const history = parseGoalHistory(state.goalHistory);
    const fromWeek = weekStartOf(localDate);
    // The first change keeps the default in force for the weeks before it.
    const base: GoalHistoryEntry[] =
      history.length > 0
        ? history
        : [{ fromWeek: GOAL_BASELINE_WEEK, goal: DEFAULT_ACTIVE_DAY_GOAL }];
    const next = [...base.filter((e) => e.fromWeek !== fromWeek), { fromWeek, goal }].sort((a, b) =>
      a.fromWeek.localeCompare(b.fromWeek),
    );
    await r.states.update(userId, { goalHistory: next });
    // A lower goal can complete this week: pay WEEK_GOAL now (best-effort).
    await this.deps.recorder.refresh(userId, localDate).catch(async (err: unknown) => {
      const { logger } = await import('../../lib/logger.js');
      logger.warn({ err, userId }, 'progress: week goal refresh failed after a goal change');
    });
    return this.flameInfo(userId, localDate);
  }

  async pauseFlame(userId: string, startDate: string, weeks: number): Promise<FlameInfo> {
    const r = this.repos;
    const state = await r.states.ensure(userId);
    const endDate = addDaysLocal(startDate, weeks * 7 - 1);
    // A new pause replaces any it overlaps (one pause at a time, at most 4 weeks).
    const kept = parsePauses(state.pauses).filter(
      (p) => p.endDate < startDate || p.startDate > endDate,
    );
    const next: PauseRange[] = [...kept, { startDate, endDate }].sort((a, b) =>
      a.startDate.localeCompare(b.startDate),
    );
    await r.states.update(userId, { pauses: next });
    return this.flameInfo(userId, startDate);
  }

  /** Ends the pause yesterday (a pause that starts today is removed). */
  async resumeFlame(userId: string, localDate: string): Promise<FlameInfo> {
    const r = this.repos;
    const state = await r.states.ensure(userId);
    const yesterday = addDaysLocal(localDate, -1);
    const next = parsePauses(state.pauses).flatMap((p): PauseRange[] => {
      if (p.startDate > localDate || p.endDate < localDate) return [p];
      return p.startDate > yesterday ? [] : [{ startDate: p.startDate, endDate: yesterday }];
    });
    await r.states.update(userId, { pauses: next });
    return this.flameInfo(userId, localDate);
  }

  async markSeen(userId: string, input: ProgressMarkSeenInput): Promise<{ ok: true }> {
    const r = this.repos;
    const state = await r.states.ensure(userId);
    if (input.intro) {
      await r.states.update(userId, { introducedAt: state.introducedAt ?? r.now() });
    }
    if (input.recapWeek && (state.recapSeenWeek ?? '') < input.recapWeek) {
      await r.states.update(userId, { recapSeenWeek: input.recapWeek });
    }
    if (input.achievements) await r.unlocks.markSeen(userId, null, r.now());
    return { ok: true };
  }

  private async flameInfo(userId: string, today: string): Promise<FlameInfo> {
    const state = await this.repos.states.find(userId);
    const flame = await this.deps.recorder.flame.read(userId, today, levelOf(state?.totalXp ?? 0), {
      withTraining: true,
    });
    return toFlameInfo(flame);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mealTypeOf(value: string) {
  const parsed = planSlotMealTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Drops `undefined` values so a partial patch never overwrites a setting with nothing. */
function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export const progressService = new ProgressService();
