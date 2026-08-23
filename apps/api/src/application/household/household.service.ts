import { TRPCError } from '@trpc/server';
import {
  householdMemberRepository,
  type CreateHouseholdMemberData,
  type HouseholdMember,
  type IHouseholdMemberRepository,
  type UpdateHouseholdMemberData,
} from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import type { MealPlanInput } from '../../lib/ai/types.js';
import type { SafetyPrefs } from '../../lib/curated-recipes/index.js';
import { getLimit } from '../../lib/entitlements.js';

// ─── Household service (F2 "Feed the Whole Table") ────────────────────────────
// CRUD for the user's extra eaters plus the PURE merge helpers the meal-plan
// generation path uses. The member-management UI is premium (matrix key
// `householdPlans`, cap `householdMembers`), but SAFETY IS NEVER PREMIUM:
// once members exist, their allergies/restrictions are unioned into every
// plan's safety filter on every tier — a downgrade must never un-protect a
// family member (premium_plan.md §5 W2-D).

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
  const portionSum = Math.ceil(members.reduce((sum, m) => sum + Math.max(0, m.portionFactor), 1));
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

// ─── Service ──────────────────────────────────────────────────────────────────

export class HouseholdService {
  constructor(private readonly repo: IHouseholdMemberRepository = householdMemberRepository) {}

  async list(userId: string): Promise<HouseholdMember[]> {
    return this.repo.findByUserId(userId);
  }

  /** Creates a member, enforcing the matrix cap (`householdMembers`). */
  async add(user: UserProfile, data: CreateHouseholdMemberData): Promise<HouseholdMember> {
    const limit = getLimit(user, 'householdMembers');
    if (limit === 0) {
      // Router-level premiumProcedure already blocks this; kept as the
      // matrix-derived source of truth (defense in depth, PW-1).
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Household members are a premium feature.',
      });
    }
    if (limit !== null) {
      const count = await this.repo.countByUserId(user.id);
      if (count >= limit) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Your plan supports up to ${limit} household members.`,
        });
      }
    }
    return this.repo.create(user.id, data);
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
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const householdService = new HouseholdService();
