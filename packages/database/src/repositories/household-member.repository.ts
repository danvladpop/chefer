import type { HouseholdMember, Prisma } from '@prisma/client';
import { prisma } from '../client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateHouseholdMemberData {
  name: string;
  /** 0.5 kid … 1.5 big eater. Defaults to 1 in the schema. */
  portionFactor?: number;
  isKid?: boolean;
  allergies?: string[];
  dietaryRestrictions?: string[];
  dislikedIngredients?: string[];
}

/**
 * Explicit `| undefined` (exactOptionalPropertyTypes): partial router inputs
 * carry undefined for untouched fields; `update` strips them before Prisma.
 */
export type UpdateHouseholdMemberData = {
  [K in keyof CreateHouseholdMemberData]?: CreateHouseholdMemberData[K] | undefined;
};

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IHouseholdMemberRepository {
  findByUserId(userId: string): Promise<HouseholdMember[]>;
  countByUserId(userId: string): Promise<number>;
  create(userId: string, data: CreateHouseholdMemberData): Promise<HouseholdMember>;
  /** Ownership-scoped — returns null when the row is not the user's. */
  update(
    userId: string,
    memberId: string,
    data: UpdateHouseholdMemberData,
  ): Promise<HouseholdMember | null>;
  /** Ownership-scoped — returns false when nothing was deleted. */
  delete(userId: string, memberId: string): Promise<boolean>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class HouseholdMemberRepository implements IHouseholdMemberRepository {
  async findByUserId(userId: string): Promise<HouseholdMember[]> {
    return prisma.householdMember.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async countByUserId(userId: string): Promise<number> {
    return prisma.householdMember.count({ where: { userId } });
  }

  async create(userId: string, data: CreateHouseholdMemberData): Promise<HouseholdMember> {
    return prisma.householdMember.create({ data: { userId, ...data } });
  }

  async update(
    userId: string,
    memberId: string,
    data: UpdateHouseholdMemberData,
  ): Promise<HouseholdMember | null> {
    // updateMany so the WHERE can include userId (ownership without a
    // separate read); 0 rows touched = not this user's member. Undefined
    // fields are stripped — "not sent" must mean "unchanged".
    const payload: Prisma.HouseholdMemberUpdateManyMutationInput = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        (payload as Record<string, unknown>)[key] = value;
      }
    }
    const result = await prisma.householdMember.updateMany({
      where: { id: memberId, userId },
      data: payload,
    });
    if (result.count === 0) return null;
    return prisma.householdMember.findUnique({ where: { id: memberId } });
  }

  async delete(userId: string, memberId: string): Promise<boolean> {
    const result = await prisma.householdMember.deleteMany({
      where: { id: memberId, userId },
    });
    return result.count > 0;
  }
}

export const householdMemberRepository = new HouseholdMemberRepository();
