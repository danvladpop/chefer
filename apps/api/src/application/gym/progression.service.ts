import { TRPCError } from '@trpc/server';
import {
  exerciseProgressionRepository,
  exerciseRepository,
  gymProfileRepository,
  workoutSessionRepository,
  type ExerciseProgression,
  type IExerciseProgressionRepository,
  type IExerciseRepository,
  type IGymProfileRepository,
  type IWorkoutSessionRepository,
  type ProgressionStateWrite,
} from '@chefer/database';
import type {
  ExerciseMeta,
  Exposure,
  GymOfferKind,
  ProgressionDto,
  ProgressionOverride,
} from '@chefer/types';
import {
  addDaysLocal,
  ENGINE_VERSION,
  exposuresFromSession,
  foldHistory,
  prescribe,
  repBucket,
} from '@chefer/utils';
import {
  gymContextLoader,
  isDeloadActive,
  resolveSlot,
  type GymContextLoader,
  type GymUserContext,
} from './gym-context.js';
import {
  lookupFromRows,
  readOverride,
  readProgressionState,
  serverToday,
  toJson,
  toSessionDoc,
  type GymOfferState,
} from './mappers.js';

// ─── ProgressionService (gym_plan.md §2.1 / §4.1) ────────────────────────────
// ExerciseProgression is a DERIVED CACHE: recompute() folds the engine over
// every completed exposure of an exercise (grouped by rep bucket) and
// overwrites `state`. Overrides (D5c) are stored next to the state, applied by
// the engine's prescribe(), and consumed once an exposure newer than the
// override has been logged. No progression logic lives here — only loading,
// grouping and persisting around the pure engine.

const MAX_DISMISSED_OFFERS = 100;

interface BucketGroup {
  exerciseId: string;
  bucket: string;
  exposures: Exposure[];
}

export class ProgressionService {
  constructor(
    private readonly progressionRepo: IExerciseProgressionRepository = exerciseProgressionRepository,
    private readonly sessionRepo: IWorkoutSessionRepository = workoutSessionRepository,
    private readonly exerciseRepo: IExerciseRepository = exerciseRepository,
    private readonly profileRepo: IGymProfileRepository = gymProfileRepository,
    private readonly contextLoader: Pick<GymContextLoader, 'load'> = gymContextLoader,
  ) {}

  /** Re-folds the engine for every rep bucket of the given exercises and persists the states. */
  async recompute(userId: string, exerciseIds: string[]): Promise<void> {
    const ids = [...new Set(exerciseIds)];
    if (ids.length === 0) return;

    const [ctx, exerciseRows, sessions, existing] = await Promise.all([
      this.contextLoader.load(userId),
      this.exerciseRepo.findVisibleByIds(userId, ids),
      this.sessionRepo.findCompleted(userId, { exerciseIds: ids }),
      this.progressionRepo.findForUser(userId, ids),
    ]);
    const { metas } = lookupFromRows(exerciseRows);
    const idSet = new Set(ids);

    const groups = new Map<string, BucketGroup>();
    const group = (exerciseId: string, bucket: string): BucketGroup => {
      const key = `${exerciseId}|${bucket}`;
      let g = groups.get(key);
      if (!g) {
        g = { exerciseId, bucket, exposures: [] };
        groups.set(key, g);
      }
      return g;
    };

    for (const session of sessions) {
      for (const { exerciseId, exposure } of exposuresFromSession(toSessionDoc(session))) {
        if (!idSet.has(exerciseId)) continue;
        group(exerciseId, repBucket(exposure.repMin, exposure.repMax)).exposures.push(exposure);
      }
    }
    // Buckets that lost all their exposures (a deleted/edited session) fold
    // back to the starting state instead of keeping a stale one.
    for (const row of existing) group(row.exerciseId, row.repBucket);

    const writes: ProgressionStateWrite[] = [];
    for (const g of groups.values()) {
      const meta = metas.get(g.exerciseId);
      if (!meta) continue;
      writes.push({
        exerciseId: g.exerciseId,
        repBucket: g.bucket,
        state: toJson(this.fold(ctx, meta, g.bucket, g.exposures)),
        engineVersion: ENGINE_VERSION,
      });
    }
    await this.progressionRepo.upsertStates(userId, writes);

    // Overrides apply once: clear the ones an exposure has since consumed.
    for (const row of existing) {
      const override = readOverride(row.override);
      if (!override) continue;
      const exposures = groups.get(`${row.exerciseId}|${row.repBucket}`)?.exposures ?? [];
      if (exposures.some((e) => e.performedAt > override.at)) {
        await this.progressionRepo.setOverride(userId, row.exerciseId, row.repBucket, null);
      }
    }
  }

  /**
   * Current state + next prescription for each exercise. Exercises without a
   * stored progression (e.g. just swapped in) get an unpersisted starting
   * state for their routine bucket(s), or their default range.
   */
  async forExercises(
    userId: string,
    exerciseIds: string[],
    today: string = serverToday(),
  ): Promise<ProgressionDto[]> {
    const ids = [...new Set(exerciseIds)];
    if (ids.length === 0) return [];
    const [ctx, exerciseRows, rows] = await Promise.all([
      this.contextLoader.load(userId),
      this.exerciseRepo.findVisibleByIds(userId, ids),
      this.progressionRepo.findForUser(userId, ids),
    ]);
    const { metas } = lookupFromRows(exerciseRows);
    const out = this.toDtos(ctx, rows, metas, today);

    const covered = new Set(rows.map((r) => r.exerciseId));
    for (const id of ids) {
      const meta = metas.get(id);
      if (!meta || covered.has(id)) continue;
      const buckets = new Set(
        ctx.activeRoutine?.days
          .flatMap((d) => d.exercises)
          .filter((e) => e.exerciseId === id)
          .map((e) => repBucket(e.repMin, e.repMax)),
      );
      if (buckets.size === 0) buckets.add(repBucket(meta.repMin, meta.repMax));
      for (const bucket of buckets) {
        const state = this.fold(ctx, meta, bucket, []);
        const slot = resolveSlot(meta, bucket, ctx.activeRoutine);
        out.push({
          exerciseId: id,
          repBucket: bucket,
          state,
          override: null,
          suggestion: prescribe({
            slot,
            state,
            override: null,
            profile: ctx.equipment,
            facts: ctx.facts,
            today,
            deload: isDeloadActive(ctx.offerState, today),
          }),
        });
      }
    }
    return out;
  }

  /** Stored rows → DTOs with the engine's prescription for `today`. Shared with bootstrap. */
  toDtos(
    ctx: GymUserContext,
    rows: ExerciseProgression[],
    metas: ReadonlyMap<string, ExerciseMeta>,
    today: string,
  ): ProgressionDto[] {
    const deload = isDeloadActive(ctx.offerState, today);
    const out: ProgressionDto[] = [];
    for (const row of rows) {
      const meta = metas.get(row.exerciseId);
      if (!meta) continue;
      const state = readProgressionState(row.state);
      const override = readOverride(row.override);
      const slot = resolveSlot(meta, row.repBucket, ctx.activeRoutine);
      out.push({
        exerciseId: row.exerciseId,
        repBucket: row.repBucket,
        state,
        override,
        suggestion: prescribe({
          slot,
          state,
          override,
          profile: ctx.equipment,
          facts: ctx.facts,
          today,
          deload,
        }),
      });
    }
    return out;
  }

  async setOverride(
    userId: string,
    input: { exerciseId: string; repBucket: string; weightKg: number; reps: number[] },
  ): Promise<ProgressionDto> {
    await this.ensureRow(userId, input.exerciseId, input.repBucket);
    const override: ProgressionOverride = {
      weightKg: input.weightKg,
      reps: input.reps,
      at: new Date().toISOString(),
    };
    await this.progressionRepo.setOverride(
      userId,
      input.exerciseId,
      input.repBucket,
      toJson(override),
    );
    return this.one(userId, input.exerciseId, input.repBucket);
  }

  async clearOverride(
    userId: string,
    input: { exerciseId: string; repBucket: string },
  ): Promise<ProgressionDto> {
    const row = await this.progressionRepo.find(userId, input.exerciseId, input.repBucket);
    if (!row)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No progression for that exercise.' });
    await this.progressionRepo.setOverride(userId, input.exerciseId, input.repBucket, null);
    return this.one(userId, input.exerciseId, input.repBucket);
  }

  /** User accepted a deload: every prescription for the next 7 days is a deload (research §1.6). */
  async startDeload(userId: string, today: string = serverToday()): Promise<{ ok: true }> {
    await this.updateOfferState(userId, (s) => ({
      ...s,
      deload: { startDate: today, endDate: addDaysLocal(today, 6) },
    }));
    return { ok: true };
  }

  /** Remembers a dismissed offer by its stable key so bootstrap stops offering it. */
  async dismissOffer(userId: string, kind: GymOfferKind, key: string): Promise<{ ok: true }> {
    await this.updateOfferState(userId, (s) => {
      const dismissed = { ...(s.dismissed ?? {}), [key]: new Date().toISOString() };
      const entries = Object.entries(dismissed).sort((a, b) => a[1].localeCompare(b[1]));
      const kept = Object.fromEntries(entries.slice(-MAX_DISMISSED_OFFERS));
      // Dismissing the deload offer also ends a deload the user started.
      return kind === 'deload'
        ? { ...s, dismissed: kept, deload: null }
        : { ...s, dismissed: kept };
    });
    return { ok: true };
  }

  // ─── internals ───────────────────────────────────────────────────────────

  private fold(ctx: GymUserContext, meta: ExerciseMeta, bucket: string, exposures: Exposure[]) {
    const latest = exposures.reduce<Exposure | null>(
      (acc, e) => (!acc || e.performedAt > acc.performedAt ? e : acc),
      null,
    );
    return foldHistory({
      slot: resolveSlot(meta, bucket, ctx.activeRoutine, latest),
      exposures,
      profile: ctx.equipment,
      experience: ctx.experience,
      knownWeightKg: ctx.offerState.knownWeightsKg?.[meta.id] ?? null,
    });
  }

  private async ensureRow(userId: string, exerciseId: string, bucket: string): Promise<void> {
    if (await this.progressionRepo.find(userId, exerciseId, bucket)) return;
    const [meta] = await this.exerciseRepo.findVisibleByIds(userId, [exerciseId]);
    if (!meta) throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found.' });
    // Fold the full history for this exercise so the new bucket row is real.
    await this.recompute(userId, [exerciseId]);
    if (await this.progressionRepo.find(userId, exerciseId, bucket)) return;
    const ctx = await this.contextLoader.load(userId);
    const { metas } = lookupFromRows([meta]);
    const m = metas.get(exerciseId);
    if (!m) throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found.' });
    await this.progressionRepo.upsertStates(userId, [
      {
        exerciseId,
        repBucket: bucket,
        state: toJson(this.fold(ctx, m, bucket, [])),
        engineVersion: ENGINE_VERSION,
      },
    ]);
  }

  private async one(userId: string, exerciseId: string, bucket: string): Promise<ProgressionDto> {
    const [ctx, exerciseRows, row] = await Promise.all([
      this.contextLoader.load(userId),
      this.exerciseRepo.findVisibleByIds(userId, [exerciseId]),
      this.progressionRepo.find(userId, exerciseId, bucket),
    ]);
    const { metas } = lookupFromRows(exerciseRows);
    const [dto] = row ? this.toDtos(ctx, [row], metas, serverToday()) : [];
    if (!dto)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No progression for that exercise.' });
    return dto;
  }

  private async updateOfferState(
    userId: string,
    update: (s: GymOfferState) => GymOfferState,
  ): Promise<void> {
    const ctx = await this.contextLoader.load(userId);
    if (!ctx.profileRow) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Finish gym setup first.' });
    }
    await this.profileRepo.update(userId, { offerState: toJson(update(ctx.offerState)) });
  }
}

export const progressionService = new ProgressionService();
