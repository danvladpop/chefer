import { TRPCError } from '@trpc/server';
import {
  chefProfileRepository,
  exerciseProgressionRepository,
  gymProfileRepository,
  type GymProfileUpdateData,
  type IChefProfileRepository,
  type IExerciseProgressionRepository,
  type IGymProfileRepository,
  type InitialProgressionData,
} from '@chefer/database';
import {
  DEFAULT_DUMBBELLS_KG,
  DEFAULT_DUMBBELLS_LB,
  DEFAULT_PLATE_PAIRS_KG,
  DEFAULT_PLATE_PAIRS_LB,
  LB_PER_KG,
  TEMPLATE_BY_KEY,
  type CompleteSetupInput,
  type EquipmentProfile,
  type GoalHistoryEntry,
  type GymBootstrap,
  type GymProfileDto,
  type RecommendInput,
  type RecommendResultDto,
  type SaveGymProfileInput,
  type TemplateSummaryDto,
  type WeightUnit,
} from '@chefer/types';
import {
  ENGINE_VERSION,
  estimateDurationMin,
  initialState,
  instantiateTemplate,
  recommendTemplate,
  repBucket,
  systemForWeightUnit,
  validateRoutine,
  volumeByGroup,
  weekStartOf,
  weightUnitForSystem,
} from '@chefer/utils';
import { ensureExerciseLibrary } from '../../lib/exercise-library/ensure.js';
import { gymBootstrapService, type GymBootstrapService } from './gym-bootstrap.service.js';
import { resolveSlot } from './gym-context.js';
import { readGoalHistory, readOfferState, serverToday, toJson, toProfileDto } from './mappers.js';
import { progressionService, type ProgressionService } from './progression.service.js';
import { catalogLookup, templateSummary, templateToDays } from './routine.service.js';

// ─── GymProfileService (gym_plan.md §4.1, D4/D10) ────────────────────────────
// Setup + the equipment inventory. completeSetup writes the profile, the new
// active routine (rotation pointer = its first day) and the initial
// progressions in ONE transaction, then returns a fresh bootstrap.

const round2 = (kg: number) => Math.round(kg * 100) / 100;
const lbToKg = (lb: number) => round2(lb / LB_PER_KG);

/**
 * Unit-appropriate starting inventory (research §1.2; gym_plan.md §6.1). LB
 * users get NATIVE pound plates/dumbbells (45/35/25… lb) stored as kg at
 * 0.01 precision — not converted kilogram plates.
 */
/** True when the stored rack is exactly `unit`'s stock inventory (never customised). */
function isStockInventory(
  row: {
    barWeightKg: number;
    platePairsKg: number[];
    dumbbellsKg: number[];
    machineStepKg: number;
    cableStepKg: number;
  },
  unit: WeightUnit,
): boolean {
  const stock = defaultInventory(unit);
  const same = (a: number[], b: number[]) =>
    a.length === b.length && a.every((v, i) => Math.abs(v - (b[i] ?? NaN)) < 0.01);
  return (
    Math.abs(row.barWeightKg - stock.barWeightKg) < 0.01 &&
    same(row.platePairsKg, stock.platePairsKg) &&
    same(row.dumbbellsKg, stock.dumbbellsKg) &&
    Math.abs(row.machineStepKg - stock.machineStepKg) < 0.01 &&
    Math.abs(row.cableStepKg - stock.cableStepKg) < 0.01
  );
}

export function defaultInventory(unit: WeightUnit): EquipmentProfile {
  if (unit === 'LB') {
    return {
      unit,
      barWeightKg: lbToKg(45),
      platePairsKg: DEFAULT_PLATE_PAIRS_LB.map(lbToKg),
      dumbbellsKg: DEFAULT_DUMBBELLS_LB.map(lbToKg),
      machineStepKg: lbToKg(10),
      cableStepKg: lbToKg(5),
      hasDipBelt: false,
      microPlates: false,
    };
  }
  return {
    unit,
    barWeightKg: 20,
    platePairsKg: [...DEFAULT_PLATE_PAIRS_KG],
    dumbbellsKg: [...DEFAULT_DUMBBELLS_KG],
    machineStepKg: 5,
    cableStepKg: 2.5,
    hasDipBelt: false,
    microPlates: false,
  };
}

export class GymProfileService {
  constructor(
    private readonly repo: IGymProfileRepository = gymProfileRepository,
    private readonly bootstrap: Pick<GymBootstrapService, 'get'> = gymBootstrapService,
    private readonly ensure: () => Promise<void> = ensureExerciseLibrary,
    private readonly progressions: Pick<ProgressionService, 'recompute'> = progressionService,
    private readonly progressionRepo: Pick<
      IExerciseProgressionRepository,
      'findForUser'
    > = exerciseProgressionRepository,
    private readonly chefProfiles: Pick<IChefProfileRepository, 'upsert'> = chefProfileRepository,
  ) {}

  /**
   * Food → Gym half of the one-unit-preference sync (backlog P2-6): a global
   * unit change moves the gym unit through save(), so the stock rack swaps
   * and progressions re-fold exactly as if the user had changed it in gym
   * settings. No gym profile yet → nothing to do (setup picks the unit).
   */
  async syncFromPreferredUnits(userId: string, units: 'METRIC' | 'IMPERIAL'): Promise<void> {
    const row = await this.repo.findByUserId(userId);
    const unit = weightUnitForSystem(units);
    if (!row || row.unit === unit) return;
    await this.save(userId, { unit }, serverToday(), { syncPreferences: false });
  }

  /** Gym → Food half: a gym unit choice becomes the global preference. */
  private async syncPreferredUnits(userId: string, unit: WeightUnit): Promise<void> {
    try {
      await this.chefProfiles.upsert(userId, { preferredUnits: systemForWeightUnit(unit) });
    } catch (error) {
      // Best effort — the gym change itself has already been saved.
      console.error('GymProfileService: preferredUnits sync failed', error);
    }
  }

  async get(userId: string): Promise<GymProfileDto | null> {
    const row = await this.repo.findByUserId(userId);
    return row ? toProfileDto(row) : null;
  }

  /**
   * Partial update of an existing profile. A weekly-goal change is recorded
   * in goalHistory from the current week on, so past weeks keep being judged
   * by the goal that was in force.
   */
  async save(
    userId: string,
    input: SaveGymProfileInput,
    today: string = serverToday(),
    options: { syncPreferences?: boolean } = {},
  ): Promise<GymProfileDto> {
    const row = await this.repo.findByUserId(userId);
    if (!row) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Finish gym setup first.' });
    }
    const data: GymProfileUpdateData = {};
    if (input.unit !== undefined) data.unit = input.unit;
    // Switching units with the stock inventory swaps in the new unit's stock
    // inventory (45/35/25 lb plates, 5-lb dumbbells) — a kg rack under an lb
    // label kept prescribing 30.9 lb dumbbells (audit F-GYM-11-2). A
    // customised inventory is the user's and stays; explicit fields win.
    if (input.unit !== undefined && input.unit !== row.unit && isStockInventory(row, row.unit)) {
      const stock = defaultInventory(input.unit);
      data.barWeightKg = stock.barWeightKg;
      data.platePairsKg = stock.platePairsKg;
      data.dumbbellsKg = stock.dumbbellsKg;
      data.machineStepKg = stock.machineStepKg;
      data.cableStepKg = stock.cableStepKg;
    }
    if (input.experience !== undefined) data.experience = input.experience;
    if (input.equipmentAccess !== undefined) data.equipmentAccess = input.equipmentAccess;
    if (input.weeklyGoal !== undefined) data.weeklyGoal = input.weeklyGoal;
    if (input.barWeightKg !== undefined) data.barWeightKg = round2(input.barWeightKg);
    if (input.platePairsKg !== undefined) data.platePairsKg = input.platePairsKg.map(round2);
    if (input.dumbbellsKg !== undefined) data.dumbbellsKg = input.dumbbellsKg.map(round2);
    if (input.machineStepKg !== undefined) data.machineStepKg = round2(input.machineStepKg);
    if (input.cableStepKg !== undefined) data.cableStepKg = round2(input.cableStepKg);
    if (input.hasDipBelt !== undefined) data.hasDipBelt = input.hasDipBelt;
    if (input.microPlates !== undefined) data.microPlates = input.microPlates;
    if (input.reminderEnabled !== undefined) data.reminderEnabled = input.reminderEnabled;
    if (input.reminderTime !== undefined) {
      data.reminderTime = input.reminderTime;
      // Clearing the time without saying otherwise turns the reminder off.
      if (input.reminderEnabled === undefined && input.reminderTime === null) {
        data.reminderEnabled = false;
      }
    }
    if (input.weeklyGoal !== undefined && input.weeklyGoal !== row.weeklyGoal) {
      const fromWeek = weekStartOf(today);
      const history = readGoalHistory(row.goalHistory).filter((g) => g.fromWeek !== fromWeek);
      data.goalHistory = toJson([...history, { fromWeek, goal: input.weeklyGoal }]);
    }
    const saved = toProfileDto(await this.repo.update(userId, data));

    // A unit or inventory change leaves every stored target snapped to the
    // OLD inventory — switching to lb showed 176.4 lb bench and 30.9 lb
    // dumbbells (audit F-GYM-11-2). Re-fold every progression against the
    // new inventory so next targets are loads the user can actually make.
    const inventoryChanged =
      (input.unit !== undefined && input.unit !== row.unit) ||
      input.barWeightKg !== undefined ||
      input.platePairsKg !== undefined ||
      input.dumbbellsKg !== undefined ||
      input.machineStepKg !== undefined ||
      input.cableStepKg !== undefined ||
      input.microPlates !== undefined;
    if (inventoryChanged) {
      const rows = await this.progressionRepo.findForUser(userId);
      await this.progressions.recompute(
        userId,
        rows.map((r) => r.exerciseId),
      );
    }
    // One unit preference across Food and Gym (P2-6): an lb gym means
    // imperial recipes and body weight too. Skipped when the change came
    // FROM the global preference, so the two never ping-pong.
    if (input.unit !== undefined && input.unit !== row.unit && options.syncPreferences !== false) {
      await this.syncPreferredUnits(userId, input.unit);
    }
    return saved;
  }

  /** Pure engine — powers the setup preview; no database access. */
  recommend(input: RecommendInput): RecommendResultDto {
    const rec = recommendTemplate(input);
    const template = TEMPLATE_BY_KEY.get(rec.key);
    const draft = instantiateTemplate(rec.key, input.equipmentAccess, catalogLookup);
    const routineLike = {
      days: draft.days.map((d) => ({
        name: d.name,
        exercises: d.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          restSec: e.restSec,
        })),
      })),
    };
    return {
      recommendedKey: rec.key,
      reason: rec.reason,
      alternatives: rec.alternatives
        .map(templateSummary)
        .filter((t): t is TemplateSummaryDto => t !== null),
      preview: {
        key: rec.key,
        name: draft.name,
        days: routineLike.days.map((d) => ({
          name: d.name,
          estimatedMin: estimateDurationMin(d, catalogLookup),
          exercises: d.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            sets: e.sets,
            repMin: e.repMin,
            repMax: e.repMax,
          })),
        })),
      },
      volume: volumeByGroup(routineLike, catalogLookup, input.experience),
      hints: validateRoutine(routineLike, catalogLookup, input.experience, {
        suppressLowVolume: template?.suppressLowVolumeHints ?? false,
      }),
    };
  }

  async completeSetup(
    userId: string,
    input: CompleteSetupInput,
    today: string = serverToday(),
  ): Promise<GymBootstrap> {
    await this.ensure();
    const draft = templateToDays(input.templateKey, input.equipmentAccess);

    // plannedWeekdays[i] → day i (research templates carry defaults otherwise).
    const days = draft.days.map((d, i) => ({
      ...d,
      plannedWeekday: input.plannedWeekdays[i] ?? d.plannedWeekday,
    }));

    const existing = await this.repo.findByUserId(userId);
    const inventory = existing
      ? {
          ...defaultInventory(input.unit),
          // Re-running setup keeps a customised inventory unless the unit changed.
          ...(existing.unit === input.unit && {
            barWeightKg: existing.barWeightKg,
            platePairsKg: existing.platePairsKg,
            dumbbellsKg: existing.dumbbellsKg,
            machineStepKg: existing.machineStepKg,
            cableStepKg: existing.cableStepKg,
            hasDipBelt: existing.hasDipBelt,
            microPlates: existing.microPlates,
          }),
        }
      : defaultInventory(input.unit);

    const fromWeek = weekStartOf(today);
    const goalHistory: GoalHistoryEntry[] = [
      ...readGoalHistory(existing?.goalHistory ?? []).filter((g) => g.fromWeek < fromWeek),
      { fromWeek, goal: draft.weeklyGoal },
    ];
    const knownWeightsKg = Object.fromEntries(
      Object.entries(input.knownWeightsKg ?? {}).map(([id, kg]) => [id, round2(kg)]),
    );
    const offerState = readOfferState(existing?.offerState);

    // Initial progression per (exercise, rep bucket) of the new routine.
    const progressions = new Map<string, InitialProgressionData>();
    for (const day of days) {
      for (const e of day.exercises) {
        const bucket = repBucket(e.repMin, e.repMax);
        const key = `${e.exerciseId}|${bucket}`;
        const meta = catalogLookup(e.exerciseId);
        if (!meta || progressions.has(key)) continue;
        const slot = resolveSlot(meta, bucket, null, e);
        progressions.set(key, {
          exerciseId: e.exerciseId,
          repBucket: bucket,
          state: toJson(
            initialState({
              slot: { ...slot, restSec: e.restSec },
              profile: inventory,
              experience: input.experience,
              knownWeightKg: knownWeightsKg[e.exerciseId] ?? null,
            }),
          ),
          engineVersion: ENGINE_VERSION,
        });
      }
    }

    await this.repo.completeSetup(userId, {
      profile: {
        experience: input.experience,
        equipmentAccess: input.equipmentAccess,
        unit: input.unit,
        weeklyGoal: draft.weeklyGoal,
        goalHistory: toJson(goalHistory),
        barWeightKg: inventory.barWeightKg,
        platePairsKg: inventory.platePairsKg,
        dumbbellsKg: inventory.dumbbellsKg,
        machineStepKg: inventory.machineStepKg,
        cableStepKg: inventory.cableStepKg,
        hasDipBelt: inventory.hasDipBelt,
        microPlates: inventory.microPlates,
        reminderEnabled: input.reminderTime !== null,
        reminderTime: input.reminderTime,
        offerState: toJson({
          ...offerState,
          knownWeightsKg: { ...(offerState.knownWeightsKg ?? {}), ...knownWeightsKg },
        }),
      },
      routine: {
        name: draft.name,
        templateKey: input.templateKey,
        isActive: true,
        days,
      },
      progressions: [...progressions.values()],
    });

    // The unit picked in setup becomes the global preference (P2-6).
    if (existing?.unit !== input.unit) await this.syncPreferredUnits(userId, input.unit);

    return this.bootstrap.get(userId, { today });
  }
}

export const gymProfileService = new GymProfileService();
