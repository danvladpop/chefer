import { Prisma, type SavedMeal } from '@prisma/client';
import { prisma } from '../client';

// ─── Saved meals (lane A2) ────────────────────────────────────────────────────
// Every call is scoped by userId: another user's id answers like a missing row.

export class SavedMealNameTakenError extends Error {
  constructor() {
    super('A saved meal with that name already exists');
    this.name = 'SavedMealNameTakenError';
  }
}

export interface ISavedMealRepository {
  /** Most recently logged first, then newest. */
  listByUser(userId: string): Promise<SavedMeal[]>;
  findById(userId: string, id: string): Promise<SavedMeal | null>;
  countByUser(userId: string): Promise<number>;
  /** Throws SavedMealNameTakenError when the user already has that name. */
  create(userId: string, name: string, items: Prisma.InputJsonValue): Promise<SavedMeal>;
  /** True when a row was deleted. */
  delete(userId: string, id: string): Promise<boolean>;
  markLogged(userId: string, id: string): Promise<void>;
}

export class SavedMealRepository implements ISavedMealRepository {
  async listByUser(userId: string): Promise<SavedMeal[]> {
    return prisma.savedMeal.findMany({
      where: { userId },
      orderBy: [{ lastLoggedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
  }

  async findById(userId: string, id: string): Promise<SavedMeal | null> {
    return prisma.savedMeal.findFirst({ where: { id, userId } });
  }

  async countByUser(userId: string): Promise<number> {
    return prisma.savedMeal.count({ where: { userId } });
  }

  async create(userId: string, name: string, items: Prisma.InputJsonValue): Promise<SavedMeal> {
    try {
      return await prisma.savedMeal.create({ data: { userId, name, items } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new SavedMealNameTakenError();
      }
      throw err;
    }
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.savedMeal.deleteMany({ where: { id, userId } });
    return count > 0;
  }

  async markLogged(userId: string, id: string): Promise<void> {
    await prisma.savedMeal.updateMany({
      where: { id, userId },
      data: { lastLoggedAt: new Date() },
    });
  }
}

export const savedMealRepository = new SavedMealRepository();
