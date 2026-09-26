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
  /**
   * Count + insert in ONE serializable transaction, so concurrent adds can't
   * slip past the cap (audit F-ONB-3-1: 8 parallel adds created 8 of 5).
   * Returns null when the user is already at `cap` (null cap = unlimited).
   */
  createWithinCap(
    userId: string,
    data: CreateHouseholdMemberData,
    cap: number | null,
  ): Promise<HouseholdMember | null>;
  /**
   * One people model (backlog P2-3, audit F-PM-8): converts a legacy
   * DietaryPreferences.servingSize > 1 into placeholder members — only when
   * the user has none — and resets servingSize to 1 in the same
   * transaction. Idempotent and race-safe: the conditional reset is the
   * claim, so a second concurrent call finds nothing to convert. Returns the
   * number of placeholders created.
   */
  migrateLegacyServingSize(
    userId: string,
    placeholders: (servingSize: number) => CreateHouseholdMemberData[],
  ): Promise<number>;
  /** Users still carrying a legacy servingSize > 1 (startup backfill). */
  findUserIdsWithLegacyServingSize(limit: number): Promise<string[]>;
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

  async createWithinCap(
    userId: string,
    data: CreateHouseholdMemberData,
    cap: number | null,
  ): Promise<HouseholdMember | null> {
    if (cap === null) return this.create(userId, data);
    // SERIALIZABLE: two transactions that both count 4 and both insert
    // conflict on the predicate read, and Postgres aborts one (P2034). The
    // loser retries on top of the winner's row and sees the real count.
    for (let attempt = 0; ; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const count = await tx.householdMember.count({ where: { userId } });
            if (count >= cap) return null;
            return tx.householdMember.create({ data: { userId, ...data } });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (err) {
        const conflict =
          typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2034';
        if (!conflict || attempt >= 5) throw err;
      }
    }
  }

  async migrateLegacyServingSize(
    userId: string,
    placeholders: (servingSize: number) => CreateHouseholdMemberData[],
  ): Promise<number> {
    // Cheap pre-check outside a transaction — the common case is "nothing
    // to do", and this runs on reads.
    const prefs = await prisma.dietaryPreferences.findUnique({
      where: { userId },
      select: { servingSize: true },
    });
    if (!prefs || prefs.servingSize <= 1) return 0;
    const legacy = prefs.servingSize;

    return prisma.$transaction(async (tx) => {
      // The claim: only one caller flips THIS value back to 1. A concurrent
      // caller's UPDATE waits for the row lock, re-checks the WHERE and
      // touches 0 rows.
      const claimed = await tx.dietaryPreferences.updateMany({
        where: { userId, servingSize: legacy },
        data: { servingSize: 1 },
      });
      if (claimed.count === 0) return 0;
      // Someone who already set up a household keeps it untouched.
      const existing = await tx.householdMember.count({ where: { userId } });
      if (existing > 0) return 0;
      const rows = placeholders(legacy);
      if (rows.length === 0) return 0;
      await tx.householdMember.createMany({ data: rows.map((row) => ({ userId, ...row })) });
      return rows.length;
    });
  }

  async findUserIdsWithLegacyServingSize(limit: number): Promise<string[]> {
    const rows = await prisma.dietaryPreferences.findMany({
      where: { servingSize: { gt: 1 } },
      select: { userId: true },
      take: limit,
    });
    return rows.map((r) => r.userId);
  }
}

export const householdMemberRepository = new HouseholdMemberRepository();
