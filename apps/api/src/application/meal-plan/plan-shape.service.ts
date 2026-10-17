import { dietaryPreferencesRepository, type IDietaryPreferencesRepository } from '@chefer/database';
import {
  LEGACY_PLAN_DAYS,
  LEGACY_PLAN_SLOTS,
  type PlanSettingsInput,
  type PlanShape,
} from '@chefer/types';

// ─── Plan shape service (§2.3, T-07.1) ─────────────────────────────────────────
// Reads/writes the "how you cook" settings shared by onboarding, Settings and
// the Plan's own settings sheet (HowYouCookForm, T-07.5). Stored on
// DietaryPreferences (S1, additive columns from wave 0). `[]` on
// planSlots/planDays is the legacy sentinel: an existing user who never opens
// the form gets today's week (breakfast/lunch/dinner, every day, no cap) —
// AC7. `leftovers` (bug B-27) lives on the same row and round-trips here too,
// and so does the saved `Fit meals to training days` choice (T-06.7
// follow-up): null = never chosen. It is OPTIONAL on `setShape` — a client
// that predates it (shipped binaries, onboarding/Settings forms) omits it and
// the stored value stays as it is.

export interface PlanShapeWithLeftovers extends PlanShape {
  leftovers: boolean;
  /** Saved `Fit meals to training days`; null = not chosen (the default: on). */
  fitTrainingDays: boolean | null;
}

const LEGACY_SHAPE: Omit<PlanShapeWithLeftovers, 'fitTrainingDays'> = {
  slots: LEGACY_PLAN_SLOTS as PlanShape['slots'],
  days: LEGACY_PLAN_DAYS as PlanShape['days'],
  timeCapMins: null,
  weekendNoLimit: false,
  cookingFor: null,
  leftovers: false,
};

export class PlanShapeService {
  constructor(
    private readonly repo: IDietaryPreferencesRepository = dietaryPreferencesRepository,
  ) {}

  /** The user's plan shape, or the legacy defaults when they never set one. */
  async getShape(userId: string): Promise<PlanShapeWithLeftovers> {
    const prefs = await this.repo.findByUserId(userId);
    // Stored independently of the shape: a legacy-shape user may still have
    // made the training-days choice.
    const fitTrainingDays = prefs?.fitTrainingDays ?? null;
    if (!prefs?.planSlots || prefs.planSlots.length === 0) {
      // `[]` stored planDays (or no row at all) is the same legacy sentinel —
      // both must be empty together (the form always writes both at once).
      return { ...LEGACY_SHAPE, fitTrainingDays };
    }
    return {
      slots: prefs.planSlots as PlanShape['slots'],
      days: prefs.planDays ?? [],
      timeCapMins: prefs.timeCapMins as PlanShape['timeCapMins'],
      weekendNoLimit: prefs.weekendNoLimit,
      cookingFor: prefs.cookingFor as PlanShape['cookingFor'],
      leftovers: prefs.leftovers,
      fitTrainingDays,
    };
  }

  /**
   * Persists a new shape (upsert — a user's first save creates the row).
   * `fitTrainingDays` is written only when sent; the response carries the
   * stored value either way.
   */
  async setShape(userId: string, input: PlanSettingsInput): Promise<PlanShapeWithLeftovers> {
    const row = await this.repo.upsert(userId, {
      planSlots: input.slots,
      planDays: input.days,
      timeCapMins: input.timeCapMins,
      weekendNoLimit: input.weekendNoLimit,
      cookingFor: input.cookingFor,
      leftovers: input.leftovers,
      ...(input.fitTrainingDays !== undefined && { fitTrainingDays: input.fitTrainingDays }),
    });
    return {
      slots: input.slots,
      days: input.days,
      timeCapMins: input.timeCapMins,
      weekendNoLimit: input.weekendNoLimit,
      cookingFor: input.cookingFor,
      leftovers: input.leftovers,
      fitTrainingDays: row.fitTrainingDays ?? null,
    };
  }

  /** The saved `Fit meals to training days` choice; null = never chosen. */
  async getFitTrainingDays(userId: string): Promise<boolean | null> {
    const prefs = await this.repo.findByUserId(userId);
    return prefs?.fitTrainingDays ?? null;
  }
}

export const planShapeService = new PlanShapeService();
