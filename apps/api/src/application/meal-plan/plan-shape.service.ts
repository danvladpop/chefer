import { dietaryPreferencesRepository, type IDietaryPreferencesRepository } from '@chefer/database';
import { LEGACY_PLAN_DAYS, LEGACY_PLAN_SLOTS, type PlanShape } from '@chefer/types';

// ─── Plan shape service (§2.3, T-07.1) ─────────────────────────────────────────
// Reads/writes the "how you cook" settings shared by onboarding, Settings and
// the Plan's own settings sheet (HowYouCookForm, T-07.5). Stored on
// DietaryPreferences (S1, additive columns from wave 0). `[]` on
// planSlots/planDays is the legacy sentinel: an existing user who never opens
// the form gets today's week (breakfast/lunch/dinner, every day, no cap) —
// AC7. `leftovers` (bug B-27) lives on the same row and round-trips here too.

export interface PlanShapeWithLeftovers extends PlanShape {
  leftovers: boolean;
}

const LEGACY_SHAPE: PlanShapeWithLeftovers = {
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
    if (!prefs?.planSlots || prefs.planSlots.length === 0) {
      // `[]` stored planDays (or no row at all) is the same legacy sentinel —
      // both must be empty together (the form always writes both at once).
      return LEGACY_SHAPE;
    }
    return {
      slots: prefs.planSlots as PlanShape['slots'],
      days: prefs.planDays ?? [],
      timeCapMins: prefs.timeCapMins as PlanShape['timeCapMins'],
      weekendNoLimit: prefs.weekendNoLimit,
      cookingFor: prefs.cookingFor as PlanShape['cookingFor'],
      leftovers: prefs.leftovers,
    };
  }

  /** Persists a new shape (upsert — a user's first save creates the row). */
  async setShape(userId: string, shape: PlanShapeWithLeftovers): Promise<PlanShapeWithLeftovers> {
    await this.repo.upsert(userId, {
      planSlots: shape.slots,
      planDays: shape.days,
      timeCapMins: shape.timeCapMins,
      weekendNoLimit: shape.weekendNoLimit,
      cookingFor: shape.cookingFor,
      leftovers: shape.leftovers,
    });
    return shape;
  }
}

export const planShapeService = new PlanShapeService();
