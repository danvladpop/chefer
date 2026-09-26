import { TRPCError } from '@trpc/server';
import {
  householdMemberRepository,
  type CreateHouseholdMemberData,
  type HouseholdMember,
  type IHouseholdMemberRepository,
  type UpdateHouseholdMemberData,
} from '@chefer/database';
import { PLAN_FEATURES, type UserProfile } from '@chefer/types';
import { householdPortionSum } from '@chefer/utils';
import type { MealPlanInput } from '../../lib/ai/types.js';
import type { SafetyPrefs } from '../../lib/curated-recipes/index.js';
import { getLimit, hasFeature } from '../../lib/entitlements.js';

// ─── Household service (F2 "Feed the Whole Table", backlog P2-3) ──────────────
// CRUD for the user's extra eaters plus the PURE merge helpers the meal-plan
// generation path uses. Since P2-3 members are FREE on every tier (cap
// `householdMembers`): their allergies/restrictions are unioned into every
// plan's safety filter, allergen warning and cook-mode banner — safety is
// never premium. Portion SCALING (servings, list quantities, week cost) is
// the premium part (matrix key `householdPlans`).
//
// One people model (audit F-PM-8): the household is the only answer to "who
// am I cooking for". A legacy DietaryPreferences.servingSize > 1 becomes
// placeholder members once (migrateLegacyServingSize) — at startup, on
// writes from older app builds, and as a read-time safety net.

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export type HouseholdContext = NonNullable<MealPlanInput['householdContext']>;

/** The safety-relevant slice of a HouseholdMember (kept minimal for tests). */
export interface HouseholdMemberSafety {
  name: string;
  portionFactor: number;
  allergies: string[];
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
}

/** Case-insensitive union that keeps each term's first-seen casing. */
function unionTerms(...lists: string[][]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const term of list) {
      const key = term.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, term.trim());
    }
  }
  return [...seen.values()];
}

/**
 * Merged SafetyPrefs for recipe filtering: allergies and dietary restrictions
 * are the HARD union of the owner's and every member's; dislikes stay the
 * owner's only (member dislikes are soft prompt notes, and filtering the
 * small curated pool by everyone's dislikes would starve it).
 */
export function mergeHouseholdSafety(
  owner: SafetyPrefs,
  members: Pick<HouseholdMemberSafety, 'allergies' | 'dietaryRestrictions'>[],
): SafetyPrefs {
  if (members.length === 0) return owner;
  return {
    allergies: unionTerms(owner.allergies, ...members.map((m) => m.allergies)),
    dietaryRestrictions: unionTerms(
      owner.dietaryRestrictions,
      ...members.map((m) => m.dietaryRestrictions),
    ),
    dislikedIngredients: owner.dislikedIngredients,
  };
}

/**
 * Builds MealPlanInput.householdContext (the wave-0 seam):
 * - portionSum = ceil(1 owner portion + Σ member portionFactor) — drives
 *   every recipe's servings and ingredient quantities,
 * - mergedSafety = the hard union (see mergeHouseholdSafety),
 * - dislikeNotes = soft per-member lines ("avoid mushrooms for Maria").
 * Returns undefined when there are no members, so the seam stays absent and
 * the prompt is byte-identical to a single-eater generation.
 */
export function computeHouseholdContext(
  members: HouseholdMemberSafety[],
  owner: SafetyPrefs,
): HouseholdContext | undefined {
  if (members.length === 0) return undefined;
  const merged = mergeHouseholdSafety(owner, members);
  const portionSum = householdPortionSum(members);
  const dislikeNotes = members
    .filter((m) => m.dislikedIngredients.length > 0)
    .map((m) => `avoid ${m.dislikedIngredients.join(', ')} for ${m.name}`);
  return {
    memberCount: members.length,
    portionSum,
    mergedSafety: {
      allergies: merged.allergies,
      dietaryRestrictions: merged.dietaryRestrictions,
    },
    dislikeNotes,
  };
}

/** Number of people at the table (owner + members) — display sizing. */
export function householdSize(memberCount: number): number {
  return memberCount + 1;
}

/** Name prefix of the members a legacy "cooking for N" turns into. */
export const PLACEHOLDER_MEMBER_PREFIX = 'Person';

/**
 * The members a legacy servingSize of N stands for: N − 1 standard-portion
 * "Person 2…N" rows (the owner is person 1), capped at the member limit.
 * Deterministic — the same N always yields the same rows.
 */
export function legacyServingSizePlaceholders(
  servingSize: number,
  cap: number = maxMemberCap(),
): CreateHouseholdMemberData[] {
  const count = Math.max(0, Math.min(Math.floor(servingSize) - 1, cap));
  return Array.from({ length: count }, (_, i) => ({
    name: `${PLACEHOLDER_MEMBER_PREFIX} ${i + 2}`,
    portionFactor: 1,
    isKid: false,
  }));
}

/** The larger of the tiers' member caps — placeholders never exceed it. */
function maxMemberCap(): number {
  const { free, premium } = PLAN_FEATURES.householdMembers;
  const caps: unknown[] = [free, premium];
  const numeric = caps.filter((c): c is number => typeof c === 'number');
  return numeric.length > 0 ? Math.max(...numeric) : 5;
}

/**
 * Legacy servingSize for app builds already in the stores (they read
 * `dietaryPreferences.servingSize` and offer 1–6): the table's portion sum.
 */
export function derivedServingSize(members: readonly { portionFactor: number }[]): number {
  return Math.min(6, householdPortionSum(members));
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class HouseholdService {
  constructor(private readonly repo: IHouseholdMemberRepository = householdMemberRepository) {}

  /** The user's members, after converting any legacy servingSize. */
  async list(userId: string): Promise<HouseholdMember[]> {
    await this.migrateLegacyServingSize(userId);
    return this.repo.findByUserId(userId);
  }

  /**
   * Portions the plan's list and cost are scaled to, or null when there is
   * nothing to scale: scaling is premium (`householdPlans`) and needs at
   * least one member. Free households keep single-portion lists — their
   * members' SAFETY still applies everywhere.
   */
  async scalingPortions(user: UserProfile): Promise<number | null> {
    if (!hasFeature(user, 'householdPlans')) return null;
    const members = await this.list(user.id);
    return members.length > 0 ? householdPortionSum(members) : null;
  }

  /** Creates a member, enforcing the matrix cap (`householdMembers`) race-free. */
  async add(user: UserProfile, data: CreateHouseholdMemberData): Promise<HouseholdMember> {
    const limit = getLimit(user, 'householdMembers');
    if (limit === 0) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Household members are not available on your plan.',
      });
    }
    const created = await this.repo.createWithinCap(user.id, data, limit);
    if (!created) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Your plan supports up to ${limit} household members.`,
      });
    }
    return created;
  }

  async update(
    userId: string,
    memberId: string,
    data: UpdateHouseholdMemberData,
  ): Promise<HouseholdMember> {
    const updated = await this.repo.update(userId, memberId, data);
    if (!updated) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Household member not found.' });
    }
    return updated;
  }

  async remove(userId: string, memberId: string): Promise<{ success: true }> {
    const deleted = await this.repo.delete(userId, memberId);
    if (!deleted) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Household member not found.' });
    }
    return { success: true };
  }

  /**
   * Converts a legacy servingSize > 1 into placeholder members (idempotent,
   * see the repository). Best effort: a failure is logged and never breaks
   * the read or write that triggered it.
   */
  async migrateLegacyServingSize(userId: string): Promise<number> {
    try {
      return await this.repo.migrateLegacyServingSize(userId, (servingSize) =>
        legacyServingSizePlaceholders(servingSize),
      );
    } catch (err) {
      console.error('[household] legacy servingSize migration failed', { userId, err });
      return 0;
    }
  }

  /**
   * Startup backfill: every user still carrying a legacy servingSize > 1.
   * Each user's conversion resets their value, so the loop always ends.
   */
  async backfillLegacyServingSizes(batchSize = 200): Promise<{ users: number; members: number }> {
    let users = 0;
    let members = 0;
    const seen = new Set<string>();
    for (;;) {
      const ids = (await this.repo.findUserIdsWithLegacyServingSize(batchSize)).filter(
        (id) => !seen.has(id),
      );
      if (ids.length === 0) break;
      for (const id of ids) {
        seen.add(id);
        users += 1;
        members += await this.migrateLegacyServingSize(id);
      }
    }
    return { users, members };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const householdService = new HouseholdService();
