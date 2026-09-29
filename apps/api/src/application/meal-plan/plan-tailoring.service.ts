import {
  mealPlanRepository,
  mealPlanTailoringRepository,
  MealPlanTailoringStatus,
  stableSlotsJson,
  type IMealPlanRepository,
  type IMealPlanTailoringRepository,
  type MealPlanTailoring,
  type PlanMealSlotJson,
  type TailoringProgressPatch,
  type TailoringSnapshots,
} from '@chefer/database';
import { isAiCapacityFailure } from '../../lib/ai/friendly-error.js';
import { mealPlanService, type MealPlanService } from './meal-plan.service.js';
import {
  TAILORING_CAPACITY_BACKOFF_MS,
  TAILORING_DAY_BUDGET_MS,
  TAILORING_LEASE_MS,
  TAILORING_MAX_STRIKES,
  TailoringTimeoutError,
} from './plan-tailoring.js';

// ─── Live tailoring runner ────────────────────────────────────────────────────
// One call = one step of one job: claim the next due MealPlanTailoring job
// (lease), advance it by (at most) one AI day, write progress, release. The
// worker loops this; every decision is persisted after each day, so a
// restart simply resumes from the queue.
//
// State machine (MealPlanTailoring.status):
//   RUNNING ──day tailored / kept / failed──▶ RUNNING (next day)
//   RUNNING ──queue empty, nothing failed──▶ DONE
//   RUNNING ──queue empty with failures, or MAX_STRIKES, or shopping
//             started, or tier/consent gone──▶ PARTIAL (≥1 day tailored)
//                                             or FAILED (none)
//   RUNNING ──plan archived/deleted, newer generation──▶ CANCELLED
//   PARTIAL/FAILED ──mealPlan.resumeTailoring──▶ RUNNING (untailored days only)
//
// "Never make things worse": the curated day is only replaced by a
// compare-and-set write against the day as generated, so any change by the
// user (Replace, swap, pin, portions, Plan this day) wins; a day with a
// logged meal is left alone; a capacity error keeps the curated day and
// backs off.

type Plan = NonNullable<Awaited<ReturnType<IMealPlanRepository['findByIdForUser']>>>;

interface JobState {
  queued: number[];
  tailored: number[];
  kept: number[];
  failed: number[];
  strikes: number;
}

type StopReason = 'shopping' | 'strikes' | 'gate';

export class PlanTailoringService {
  constructor(
    private readonly repo: IMealPlanTailoringRepository = mealPlanTailoringRepository,
    private readonly planRepo: IMealPlanRepository = mealPlanRepository,
    private readonly tailor: Pick<MealPlanService, 'tailorDay'> = mealPlanService,
    private readonly clock: () => number = Date.now,
    private readonly dayBudgetMs: number = TAILORING_DAY_BUDGET_MS,
  ) {}

  /** Advances the next due job by one day. False when nothing was due. */
  async runNext(): Promise<boolean> {
    const job = await this.repo.claimNextDue(new Date(this.clock()), TAILORING_LEASE_MS);
    if (!job) return false;
    try {
      await this.step(job);
    } catch (err) {
      // Infrastructure trouble (DB), not an AI verdict: release the lease and
      // try again later rather than spin on the same job.
      console.error(`[tailoring] step failed for plan ${job.planId}:`, err);
      await this.repo
        .saveProgress(job.id, {
          nextRunAt: new Date(this.clock() + TAILORING_CAPACITY_BACKOFF_MS),
          lastError: errorText(err),
        })
        .catch((e: unknown) => console.error('[tailoring] could not release job:', e));
    }
    return true;
  }

  /** Earliest time a RUNNING job becomes due (the worker's next wake-up). */
  nextDueAt(): Promise<Date | null> {
    return this.repo.nextDueAt();
  }

  private async step(job: MealPlanTailoring): Promise<void> {
    const state: JobState = {
      queued: [...job.queuedDays],
      tailored: [...job.tailoredDays],
      kept: [...job.keptDays],
      failed: [...job.failedDays],
      strikes: job.strikes,
    };

    let plan = await this.currentPlan(job);
    if (!plan) {
      await this.cancel(job);
      return;
    }
    if (!(await this.gateOpen(job.userId))) {
      await this.finish(job, state, 'gate');
      return;
    }
    if (await this.shoppingStarted(job)) {
      await this.finish(job, state, 'shopping');
      return;
    }

    // Days the user changed (or logged) since generation are theirs — skip
    // them without spending an AI call.
    for (
      let next = state.queued[0];
      next !== undefined && (await this.isTouched(job, plan, next));
      next = state.queued[0]
    ) {
      state.queued.shift();
      state.kept.push(next);
    }
    const day = state.queued[0];
    if (day === undefined) {
      await this.finish(job, state);
      return;
    }

    // Visible to the Plan screens while the AI works on it.
    await this.repo.saveProgress(
      job.id,
      { queuedDays: state.queued, keptDays: state.kept, currentDay: day },
      { keepLease: true },
    );

    const patch: TailoringProgressPatch = {};
    try {
      const result = await this.tailor.tailorDay({
        userId: job.userId,
        plan,
        dayOfWeek: day,
        slotTypes: job.slotTypes,
        deadline: this.clock() + this.dayBudgetMs,
      });
      state.queued.shift();
      state.strikes = 0;
      if ('skip' in result) {
        state.kept.push(day);
      } else {
        // The AI took a while — re-check everything before writing.
        plan = await this.currentPlan(job);
        if (!plan) {
          await this.cancel(job);
          return;
        }
        if (await this.shoppingStarted(job)) {
          state.queued.unshift(day);
          await this.finish(job, state, 'shopping');
          return;
        }
        const expected = snapshotOf(job.snapshots, day);
        const wrote =
          !(await this.isTouched(job, plan, day)) &&
          (await this.repo.replaceDayIfUnchanged(job.planId, day, expected, result.meals));
        if (wrote) {
          state.tailored.push(day);
          console.info(
            `[tailoring] plan ${job.planId}: day ${day} tailored (${state.tailored.length}/${job.totalDays})`,
          );
        } else {
          state.kept.push(day);
        }
      }
      patch.lastError = null;
      patch.nextRunAt = new Date(this.clock());
    } catch (err) {
      state.strikes += 1;
      patch.lastError = errorText(err);
      const capacity = isAiCapacityFailure(err) && !(err instanceof TailoringTimeoutError);
      if (capacity) {
        // The provider chain is out of capacity: keep the curated day for
        // now, back off, and retry the same day (30 s, 60 s, …).
        patch.nextRunAt = new Date(
          this.clock() + TAILORING_CAPACITY_BACKOFF_MS * 2 ** (state.strikes - 1),
        );
        console.warn(
          `[tailoring] plan ${job.planId}: capacity error on day ${day} (strike ${state.strikes}) — backing off`,
        );
      } else {
        // A bad or late day: the curated day stays; move on.
        state.queued.shift();
        state.failed.push(day);
        patch.nextRunAt = new Date(this.clock());
        console.warn(`[tailoring] plan ${job.planId}: day ${day} kept curated —`, patch.lastError);
      }
      if (state.strikes >= TAILORING_MAX_STRIKES) {
        await this.finish(job, state, 'strikes', patch);
        return;
      }
    }

    if (state.queued.length === 0) {
      await this.finish(job, state, undefined, patch);
      return;
    }
    await this.repo.saveProgress(job.id, {
      ...patch,
      queuedDays: state.queued,
      tailoredDays: state.tailored,
      keptDays: state.kept,
      failedDays: state.failed,
      strikes: state.strikes,
      currentDay: state.queued[0] ?? null,
    });
  }

  /** The job's plan while it is still the user's current plan for its week. */
  private async currentPlan(job: MealPlanTailoring): Promise<Plan | null> {
    const plan = await this.planRepo.findByIdForUser(job.userId, job.planId);
    return plan?.status === 'ACTIVE' && !plan.isTemplate ? plan : null;
  }

  /** Premium (or admin) with AI data consent — re-checked every step. */
  private async gateOpen(userId: string): Promise<boolean> {
    const gate = await this.repo.findUserGate(userId);
    if (!gate?.aiDataConsentAt) return false;
    return gate.planTier === 'PREMIUM' || gate.role === 'ADMIN';
  }

  /** A shopping tick added after generation: the list being shopped must stay true. */
  private async shoppingStarted(job: MealPlanTailoring): Promise<boolean> {
    const baseline = new Set(job.baselineCheckedKeys);
    const ticks = await this.repo.findCheckedKeys(job.planId);
    return ticks.some((key) => !baseline.has(key));
  }

  /**
   * Changed since generation (any slot edit — Replace, swap, pin, portions)
   * or a meal of it already logged (today and earlier only).
   */
  private async isTouched(job: MealPlanTailoring, plan: Plan, day: number): Promise<boolean> {
    const current = (plan.days.find((d) => d.dayOfWeek === day)?.meals ??
      []) as unknown as PlanMealSlotJson[];
    if (stableSlotsJson(current) !== stableSlotsJson(snapshotOf(job.snapshots, day))) return true;
    const date = calendarDateOf(plan.weekStartDate, day);
    if (date.getTime() > todayUtcDate(this.clock()).getTime()) return false;
    const logged = new Set(await this.repo.findLoggedRecipeIds(job.userId, date));
    return current.some((m) => logged.has(m.recipeId));
  }

  private async cancel(job: MealPlanTailoring): Promise<void> {
    await this.repo.saveProgress(job.id, {
      status: MealPlanTailoringStatus.CANCELLED,
      currentDay: null,
      finishedAt: new Date(this.clock()),
    });
  }

  /** Ends the job: DONE when nothing is left undone, else PARTIAL / FAILED. */
  private async finish(
    job: MealPlanTailoring,
    state: JobState,
    reason?: StopReason,
    patch: TailoringProgressPatch = {},
  ): Promise<void> {
    const undone = state.queued.length + state.failed.length;
    const status =
      undone === 0
        ? MealPlanTailoringStatus.DONE
        : state.tailored.length > 0
          ? MealPlanTailoringStatus.PARTIAL
          : MealPlanTailoringStatus.FAILED;
    if (reason) {
      console.info(`[tailoring] plan ${job.planId}: stopped (${reason}) as ${status}`);
    }
    await this.repo.saveProgress(job.id, {
      ...patch,
      status,
      queuedDays: state.queued,
      tailoredDays: state.tailored,
      keptDays: state.kept,
      failedDays: state.failed,
      strikes: state.strikes,
      currentDay: null,
      finishedAt: new Date(this.clock()),
      ...(reason && reason !== 'strikes' && { lastError: `stopped: ${reason}` }),
    });
  }
}

function snapshotOf(snapshots: unknown, day: number): PlanMealSlotJson[] {
  return (snapshots as TailoringSnapshots | null)?.[String(day)] ?? [];
}

/** The plan day's calendar date as the tracker stores it (UTC midnight of the local date). */
function calendarDateOf(weekStartDate: Date, day: number): Date {
  const local = new Date(weekStartDate);
  local.setDate(local.getDate() + day);
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

function todayUtcDate(now: number): Date {
  const local = new Date(now);
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

export const planTailoringService = new PlanTailoringService();
