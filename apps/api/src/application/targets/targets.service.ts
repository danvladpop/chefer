import { TRPCError } from '@trpc/server';
import {
  chefProfileRepository,
  chefReviewRepository,
  targetChangeRepository,
  type ChefProfile,
  type TargetChange,
} from '@chefer/database';
import type {
  NutritionTargets,
  TargetChangeReason,
  TargetInputs,
  TargetsView,
  UserProfile,
} from '@chefer/types';
import { isPremiumUser } from '../../lib/entitlements.js';
import { isFlagEnabled } from '../../lib/flags.js';
import { resolveTargets, type ResolveTargetsProfile } from '../preferences/preferences.service.js';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';

// ─── Targets service (§2.11, T-35.1, T-11.1) ───────────────────────────────────
// The `targets.*` procedures: read the resolved view (and detect + record a
// silent change since the last read), let a user set their own override, and
// resolve a detected/proposed change. One resolver (preferences.service.ts's
// `resolveTargets`) stays the only place that computes numbers; this service
// only reads it, validates the override, and manages the change log.

// Validation bounds (§2.11, T-35.1 AC4).
const KCAL_MIN = 1200;
const KCAL_MAX = 5000;
const PROTEIN_G_MIN = 40;
const PROTEIN_G_MAX = 400;
/** Macro grams must imply calories within this fraction of the stated kcal (4/4/9 rule). */
const MACRO_FIT_TOLERANCE = 0.1;
/** A `suggested` drift below this (for an OWN user) doesn't get a notice. */
const SUGGESTED_DRIFT_THRESHOLD = 0.05;
/** Weight-driven notices are debounced to one per this many days. */
const WEIGHT_DEBOUNCE_DAYS = 7;

export interface SetOwnTargetsInput {
  targetMode: 'OWN' | 'SUGGESTED';
  kcal?: number | undefined;
  proteinG?: number | undefined;
  carbsG?: number | undefined;
  fatG?: number | undefined;
  trainingKcal?: number | undefined;
  trainingProteinG?: number | undefined;
  addTrainingBonus?: boolean | undefined;
}

export interface TargetsGetResult extends TargetsView {
  targetMode: 'OWN' | 'SUGGESTED';
  addTrainingBonus: boolean;
  custom: {
    kcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    trainingKcal: number | null;
    trainingProteinG: number | null;
  };
}

interface StoredSnapshot {
  effective: NutritionTargets;
  suggested: NutritionTargets;
  inputs: TargetInputs;
}

function isStoredSnapshot(value: unknown): value is StoredSnapshot {
  return (
    !!value &&
    typeof value === 'object' &&
    'effective' in value &&
    'suggested' in value &&
    'inputs' in value
  );
}

function fieldsDiff(
  before: NutritionTargets,
  after: NutritionTargets,
): { field: string; before: number; after: number }[] {
  const fields: { field: string; before: number; after: number }[] = [];
  (['dailyCalorieTarget', 'proteinG', 'carbsG', 'fatG'] as const).forEach((key) => {
    if (before[key] !== after[key]) {
      fields.push({ field: key, before: before[key], after: after[key] });
    }
  });
  return fields;
}

function pctDiff(a: number, b: number): number {
  return b === 0 ? 0 : Math.abs(a - b) / b;
}

/** Which input changed since the snapshot, mapped onto the 5 known reasons. */
function inferReason(prev: TargetInputs, next: TargetInputs): TargetChangeReason {
  if (prev.isLifter !== next.isLifter) return 'GYM_SETUP';
  if (prev.weightKg !== next.weightKg) return 'WEIGHT';
  if (prev.goal !== next.goal) return 'GOAL';
  if (prev.heightCm !== next.heightCm || prev.age !== next.age || prev.activity !== next.activity) {
    return 'WEIGHT';
  }
  return 'DAY_KIND';
}

/** Whether a WEIGHT-reason notice fired for this user within the debounce window. */
async function recentWeightNoticeExists(userId: string): Promise<boolean> {
  const all = await targetChangeRepository.findAllByUser(userId);
  const cutoff = Date.now() - WEIGHT_DEBOUNCE_DAYS * 24 * 60 * 60 * 1000;
  return all.some((c) => c.reason === 'WEIGHT' && c.createdAt.getTime() >= cutoff);
}

function macroImpliedKcal(proteinG: number, carbsG: number, fatG: number): number {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

function badRequest(message: string): never {
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

export class TargetsService {
  /**
   * The resolved targets view for `userId`, plus own-target state. As a side
   * effect (§2.11), recomputes against the stored snapshot and — when the
   * numbers moved without the user asking (gym setup, a new weigh-in, a goal
   * edit, or the numbers a SUGGESTED-mode user would get drifting >= 5%) —
   * writes a `TargetChange` row, then moves the snapshot on.
   */
  async get(userId: string): Promise<TargetsGetResult> {
    const profile = await chefProfileRepository.findByUserId(userId);
    const resolved = await this.resolveFor(userId, profile);
    await this.detectAndRecordChange(userId, profile, resolved);
    return {
      ...resolved,
      targetMode: profile?.targetMode === 'OWN' ? 'OWN' : 'SUGGESTED',
      addTrainingBonus: profile?.addTrainingBonus ?? true,
      custom: {
        kcal: profile?.customKcal ?? null,
        proteinG: profile?.customProteinG ?? null,
        carbsG: profile?.customCarbsG ?? null,
        fatG: profile?.customFatG ?? null,
        trainingKcal: profile?.customTrainingKcal ?? null,
        trainingProteinG: profile?.customTrainingProteinG ?? null,
      },
    };
  }

  /** Resolves `resolveTargets` for a profile row, loading the lifter bodyweight. */
  private async resolveFor(
    userId: string,
    profile: ResolveTargetsProfile | null,
  ): Promise<TargetsView> {
    const { lifterBodyweightKg } = await trainingNutritionService.loadLifter(userId, profile);
    return resolveTargets(profile, lifterBodyweightKg);
  }

  /**
   * Sets the user's own target override (or switches back to SUGGESTED).
   * `ownTargetsFree` gates free-tier access (D-2, default on) — free users
   * get FORBIDDEN when it's off, matching the premium `profilePersonalisation`
   * gate on the rest of preferences.
   */
  async set(
    userId: string,
    user: UserProfile,
    input: SetOwnTargetsInput,
  ): Promise<TargetsGetResult> {
    if (!isFlagEnabled('ownTargetsFree') && !isPremiumUser(user)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Setting your own targets requires a premium plan. Upgrade to unlock it.',
      });
    }

    if (input.targetMode === 'SUGGESTED') {
      await chefProfileRepository.upsert(userId, { targetMode: 'SUGGESTED' });
      const profile = await chefProfileRepository.findByUserId(userId);
      // Switching back to the system's numbers is a deliberate user action,
      // not a silent change — move the snapshot without a notice.
      const resolved = await this.resolveFor(userId, profile);
      await this.writeSnapshot(userId, resolved);
      return this.get(userId);
    }

    const kcal = input.kcal;
    const proteinG = input.proteinG;
    const carbsG = input.carbsG ?? 0;
    const fatG = input.fatG ?? 0;

    if (kcal === undefined || proteinG === undefined) {
      badRequest('Set at least calories and protein for your own target.');
    }
    if (kcal < KCAL_MIN || kcal > KCAL_MAX) {
      badRequest(`Calories must be between ${KCAL_MIN} and ${KCAL_MAX}.`);
    }
    if (proteinG < PROTEIN_G_MIN || proteinG > PROTEIN_G_MAX) {
      badRequest(`Protein must be between ${PROTEIN_G_MIN} and ${PROTEIN_G_MAX} g.`);
    }
    if (carbsG < 0 || fatG < 0) {
      badRequest('Carbs and fat cannot be negative.');
    }
    // The macros named must plausibly add up to the stated calories (4/4/9
    // rule, ±10% — tighter than the quick-add sanity check's ±25%, because
    // this number becomes the daily target every screen shows).
    if (input.carbsG !== undefined || input.fatG !== undefined) {
      const implied = macroImpliedKcal(proteinG, carbsG, fatG);
      if (pctDiff(kcal, implied) > MACRO_FIT_TOLERANCE) {
        badRequest(
          `Your macros (${proteinG}g protein, ${carbsG}g carbs, ${fatG}g fat ≈ ${Math.round(implied)} kcal) don't fit ${kcal} kcal within 10%.`,
        );
      }
    }
    if (
      input.trainingKcal !== undefined &&
      (input.trainingKcal < KCAL_MIN || input.trainingKcal > 6000)
    ) {
      badRequest(`A training-day target must be between ${KCAL_MIN} and 6000.`);
    }
    if (
      input.trainingProteinG !== undefined &&
      (input.trainingProteinG < PROTEIN_G_MIN || input.trainingProteinG > 500)
    ) {
      badRequest(`A training-day protein target must be between ${PROTEIN_G_MIN} and 500 g.`);
    }

    await chefProfileRepository.upsert(userId, {
      targetMode: 'OWN',
      customKcal: kcal,
      customProteinG: proteinG,
      customCarbsG: input.carbsG !== undefined ? carbsG : null,
      customFatG: input.fatG !== undefined ? fatG : null,
      ...(input.trainingKcal !== undefined && { customTrainingKcal: input.trainingKcal }),
      ...(input.trainingProteinG !== undefined && {
        customTrainingProteinG: input.trainingProteinG,
      }),
      ...(input.addTrainingBonus !== undefined && { addTrainingBonus: input.addTrainingBonus }),
      // The legacy field every old client reads (§2.11): keep it in step with
      // the new effective value.
      dailyCalorieTarget: kcal,
    });

    const profile = await chefProfileRepository.findByUserId(userId);
    const resolved = await this.resolveFor(userId, profile);
    await this.writeSnapshot(userId, resolved);
    return this.get(userId);
  }

  /** This user's unresolved target changes, newest first. */
  async changes(userId: string): Promise<TargetChange[]> {
    return targetChangeRepository.findUnresolvedByUser(userId);
  }

  /** Back-compat name for the wave-0 `targets.myUnresolvedChanges` alias — not deprecated, still routed. */
  async listMyUnresolvedChanges(userId: string): Promise<TargetChange[]> {
    return this.changes(userId);
  }

  /**
   * Resolves one detected change or proposal. `keep: true` always means "keep
   * what I already have" (a CHANGED row restores the pre-change numbers as an
   * OWN override; a SUGGESTED row — the coach's proposal — is declined, the
   * dial never moves). `keep: false` means "use the new/suggested value" (a
   * CHANGED row's new numbers were already applied, so this just resolves the
   * row; a SUGGESTED row's proposal is applied to the cumulative dial).
   */
  async acknowledgeChange(
    userId: string,
    input: { id: string; keep: boolean },
  ): Promise<{ resolved: true }> {
    const change = await targetChangeRepository.findById(input.id);
    if (change?.userId !== userId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Target change not found.' });
    }
    if (change.resolvedAt) {
      return { resolved: true }; // already resolved — idempotent
    }

    const fields = change.fields as { field: string; before: number | string | null }[];
    const byField = (name: string) => fields.find((f) => f.field === name)?.before;

    if (change.kind === 'CHANGED') {
      if (input.keep) {
        // Restore the pre-change numbers as the user's own — "Keep" (AC1/AC2
        // UX-11): a gym-setup or weight-driven change never silently sticks.
        const kcal = byField('dailyCalorieTarget');
        const proteinG = byField('proteinG');
        const carbsG = byField('carbsG');
        const fatG = byField('fatG');
        await chefProfileRepository.upsert(userId, {
          targetMode: 'OWN',
          ...(typeof kcal === 'number' && { customKcal: kcal, dailyCalorieTarget: kcal }),
          ...(typeof proteinG === 'number' && { customProteinG: proteinG }),
          ...(typeof carbsG === 'number' && { customCarbsG: carbsG }),
          ...(typeof fatG === 'number' && { customFatG: fatG }),
        });
      }
      // keep: false — the new value is already effective; nothing else to do.
      await targetChangeRepository.resolve(input.id, input.keep ? 'KEEP_OLD' : 'USE_NEW');
    } else {
      // SUGGESTED — either an informational "your suggested numbers moved"
      // notice (nothing to apply either way) or a coach proposal.
      if (!input.keep && change.reason === 'COACH') {
        await this.applyCoachProposal(userId);
      }
      await targetChangeRepository.resolve(input.id, input.keep ? 'KEEP_OLD' : 'USE_NEW');
    }

    // Re-resolve and move the snapshot so the next read doesn't immediately
    // re-detect the same change.
    const profile = await chefProfileRepository.findByUserId(userId);
    const resolved = await this.resolveFor(userId, profile);
    await this.writeSnapshot(userId, resolved);
    return { resolved: true };
  }

  /**
   * Applies the coach's most recent unresolved proposal to the cumulative
   * dial (§2.11, T-35.4). `ChefReview.adjustmentKcal` should move from 0 to
   * the applied amount here too, but `IChefReviewRepository` (packages/database,
   * not owned by this lane) only exposes `resolveProposal` (sets
   * `proposalResolvedAt`) — see the handoff note in this lane's final report.
   */
  private async applyCoachProposal(userId: string): Promise<void> {
    const review = await chefReviewRepository.findLatest(userId);
    if (review?.proposedAdjustmentKcal == null || review.proposalResolvedAt) return;
    const profile = await chefProfileRepository.findByUserId(userId);
    await chefProfileRepository.upsert(userId, {
      targetAdjustmentKcal: (profile?.targetAdjustmentKcal ?? 0) + review.proposedAdjustmentKcal,
    });
    await chefReviewRepository.resolveProposal(review.id);
  }

  /**
   * Records the coach's weekly proposal as a SUGGESTED change (§2.11,
   * T-35.4). Called by `coachService.runWeeklyReview` right after it stores
   * `ChefReview.proposedAdjustmentKcal` — the coach itself never writes
   * `targetAdjustmentKcal` any more.
   */
  async proposeCoachAdjustment(
    userId: string,
    currentKcal: number,
    adjustmentKcal: number,
  ): Promise<void> {
    if (adjustmentKcal === 0) return;
    await targetChangeRepository.create({
      userId,
      kind: 'SUGGESTED',
      reason: 'COACH',
      fields: [
        {
          field: 'dailyCalorieTarget',
          before: currentKcal,
          after: currentKcal + adjustmentKcal,
        },
      ],
    });
  }

  /** Writes the baseline snapshot with no notice (first read, or after a resolution). */
  private async writeSnapshot(userId: string, resolved: TargetsView): Promise<void> {
    const snapshot: StoredSnapshot = {
      effective: resolved.effective,
      suggested: resolved.suggested,
      inputs: resolved.inputs,
    };
    // Plain JSON round-trip: `targetSnapshot` is a Prisma `Json?` column, and
    // this lane doesn't import `@prisma/client` directly (CLAUDE.md rule 2) —
    // the round-trip gives the repository a structurally-JSON value without
    // needing Prisma's `InputJsonValue` type here.
    type SnapshotField = Exclude<
      NonNullable<Parameters<typeof chefProfileRepository.upsert>[1]>['targetSnapshot'],
      undefined
    >;
    await chefProfileRepository.upsert(userId, {
      targetSnapshot: JSON.parse(JSON.stringify(snapshot)) as SnapshotField,
    });
  }

  /**
   * "Never change your targets silently" (§2.11), made provable: compares the
   * freshly resolved view against the last snapshot the user saw and writes a
   * `TargetChange` row when it moved without the user asking, then advances
   * the snapshot. Callers: `targets.get`, `tracker.getDay` (this lane); a
   * handoff request covers `dashboard.summary` (owned by L-HOME).
   */
  async detectAndRecordChange(
    userId: string,
    profile: ChefProfile | null,
    resolved: TargetsView,
  ): Promise<void> {
    const prev = profile?.targetSnapshot;
    if (!isStoredSnapshot(prev)) {
      await this.writeSnapshot(userId, resolved);
      return;
    }

    const isOwn = resolved.source === 'own';
    if (!isOwn) {
      const fields = fieldsDiff(prev.effective, resolved.effective);
      if (fields.length > 0) {
        const reason = inferReason(prev.inputs, resolved.inputs);
        const debounced = reason === 'WEIGHT' && (await recentWeightNoticeExists(userId));
        if (!debounced) {
          await targetChangeRepository.create({ userId, kind: 'CHANGED', reason, fields });
        }
      }
    } else {
      const drift = pctDiff(
        resolved.suggested.dailyCalorieTarget,
        prev.suggested.dailyCalorieTarget,
      );
      if (drift >= SUGGESTED_DRIFT_THRESHOLD) {
        const reason = inferReason(prev.inputs, resolved.inputs);
        const fields = fieldsDiff(prev.suggested, resolved.suggested);
        if (fields.length > 0) {
          await targetChangeRepository.create({ userId, kind: 'SUGGESTED', reason, fields });
        }
      }
    }

    await this.writeSnapshot(userId, resolved);
  }
}

export const targetsService = new TargetsService();
