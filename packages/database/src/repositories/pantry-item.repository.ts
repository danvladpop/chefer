import type { PantryItem } from '@prisma/client';
import { prisma } from '../client';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Quantity convention (F3, no schema change): `quantity > 0` is a real amount
 * in `unit`; `quantity === 0` means "some" — the user still has the ingredient
 * but the amount is unknown (weekly confirms decay stale quantities to it).
 */
export interface UpsertPantryItemData {
  userId: string;
  /** Normalized (lowercase, trimmed, single-spaced) — callers normalize. */
  ingredientName: string;
  /** Amount in `unit`; 0 = the "some" state (amount unknown). */
  quantity: number;
  unit: string;
  /** PURCHASE = shopping-list check-off; MANUAL = added by hand. */
  source: 'PURCHASE' | 'MANUAL';
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IPantryItemRepository {
  /** All items for the user, OLDEST `updatedAt` first (use-first ordering). */
  findByUser(userId: string): Promise<PantryItem[]>;
  findByIds(userId: string, ids: string[]): Promise<PantryItem[]>;
  countByUser(userId: string): Promise<number>;
  /** Idempotent on @@unique([userId, ingredientName, unit]) — re-buying refreshes quantity + updatedAt. */
  upsert(data: UpsertPantryItemData): Promise<PantryItem>;
  upsertMany(items: UpsertPantryItemData[]): Promise<void>;
  deleteById(userId: string, id: string): Promise<void>;
  deleteByIds(userId: string, ids: string[]): Promise<void>;
  /** Removes every row for the (normalized) ingredient name, any unit — "I'm out of it". */
  deleteByIngredientName(userId: string, ingredientName: string): Promise<number>;
  /**
   * Decays the given rows to the "some" state (quantity 0) while PRESERVING
   * each row's `updatedAt` — decay is not a purchase, so it must not push the
   * item to the back of the use-first queue.
   */
  decayToSome(userId: string, ids: string[]): Promise<void>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class PantryItemRepository implements IPantryItemRepository {
  async findByUser(userId: string): Promise<PantryItem[]> {
    return prisma.pantryItem.findMany({
      where: { userId },
      orderBy: { updatedAt: 'asc' },
    });
  }

  async findByIds(userId: string, ids: string[]): Promise<PantryItem[]> {
    if (ids.length === 0) return [];
    return prisma.pantryItem.findMany({ where: { userId, id: { in: ids } } });
  }

  async countByUser(userId: string): Promise<number> {
    return prisma.pantryItem.count({ where: { userId } });
  }

  async upsert(data: UpsertPantryItemData): Promise<PantryItem> {
    const { userId, ingredientName, unit, quantity, source } = data;
    return prisma.pantryItem.upsert({
      where: { userId_ingredientName_unit: { userId, ingredientName, unit } },
      create: { userId, ingredientName, unit, quantity, source },
      update: { quantity, source },
    });
  }

  async upsertMany(items: UpsertPantryItemData[]): Promise<void> {
    if (items.length === 0) return;
    await prisma.$transaction(
      items.map(({ userId, ingredientName, unit, quantity, source }) =>
        prisma.pantryItem.upsert({
          where: { userId_ingredientName_unit: { userId, ingredientName, unit } },
          create: { userId, ingredientName, unit, quantity, source },
          update: { quantity, source },
        }),
      ),
    );
  }

  async deleteById(userId: string, id: string): Promise<void> {
    await prisma.pantryItem.deleteMany({ where: { userId, id } });
  }

  async deleteByIds(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await prisma.pantryItem.deleteMany({ where: { userId, id: { in: ids } } });
  }

  async deleteByIngredientName(userId: string, ingredientName: string): Promise<number> {
    const result = await prisma.pantryItem.deleteMany({ where: { userId, ingredientName } });
    return result.count;
  }

  async decayToSome(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    // Per-row updates so each row's original updatedAt can be re-asserted —
    // an explicitly provided value wins over the @updatedAt auto-stamp.
    const rows = await prisma.pantryItem.findMany({ where: { userId, id: { in: ids } } });
    await prisma.$transaction(
      rows
        .filter((row) => row.quantity !== 0)
        .map((row) =>
          prisma.pantryItem.update({
            where: { id: row.id },
            data: { quantity: 0, updatedAt: row.updatedAt },
          }),
        ),
    );
  }
}

export const pantryItemRepository = new PantryItemRepository();
