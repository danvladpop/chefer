import { Prisma, type PackagedProduct, type PackagedProductSource } from '@prisma/client';
import { prisma } from '../client';

// ─── Packaged products (docs/adr/0006-packaged-products.md) ───────────────────
// Shared rows (ownerId null) are the Open Food Facts cache, one per barcode;
// private rows (LABEL / USER) belong to one user and are only ever read back
// for that user. Every read here takes the viewer's id and never returns
// someone else's private row.

/** The product's fields, as every write takes them. */
export interface PackagedProductData {
  barcode: string | null;
  name: string;
  brand: string | null;
  kcalPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
  sugarPer100g: number | null;
  saturatedFatPer100g: number | null;
  saltPer100g: number | null;
  servingSizeG: number | null;
  allergenTags: string[];
  traceTags: string[];
  allergensKnown: boolean;
  imageUrl: string | null;
}

/** What a barcode resolves to for one viewer: their own row, and the shared cache row. */
export interface BarcodeRows {
  own: PackagedProduct | null;
  shared: PackagedProduct | null;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IPackagedProductRepository {
  findByBarcode(barcode: string, viewerId: string): Promise<BarcodeRows>;
  /** A shared row or the viewer's own; null for anyone else's private row. */
  findVisibleById(id: string, viewerId: string): Promise<PackagedProduct | null>;
  /** Writes the shared Open Food Facts row for `data.barcode` (create or refresh). */
  upsertShared(data: PackagedProductData & { barcode: string }): Promise<PackagedProduct>;
  /** Creates the viewer's private row; with a barcode it replaces their earlier row for it. */
  savePrivate(
    ownerId: string,
    source: Extract<PackagedProductSource, 'LABEL' | 'USER'>,
    data: PackagedProductData,
  ): Promise<PackagedProduct>;
  /** Name/brand search over shared rows and the viewer's own (own first). */
  search(query: string, viewerId: string, limit: number): Promise<PackagedProduct[]>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class PackagedProductRepository implements IPackagedProductRepository {
  async findByBarcode(barcode: string, viewerId: string): Promise<BarcodeRows> {
    const rows = await prisma.packagedProduct.findMany({
      where: { barcode, OR: [{ ownerId: null }, { ownerId: viewerId }] },
    });
    return {
      own: rows.find((r) => r.ownerId === viewerId) ?? null,
      shared: rows.find((r) => r.ownerId === null) ?? null,
    };
  }

  async findVisibleById(id: string, viewerId: string): Promise<PackagedProduct | null> {
    return prisma.packagedProduct.findFirst({
      where: { id, OR: [{ ownerId: null }, { ownerId: viewerId }] },
    });
  }

  async upsertShared(data: PackagedProductData & { barcode: string }): Promise<PackagedProduct> {
    // Prisma can't name a compound unique with a null member, so this is
    // find-then-write; a parallel lookup of the same barcode loses the race
    // on the partial unique index (P2002) and re-reads the winner's row.
    const write = { ...data, source: 'OFF' as const, fetchedAt: new Date() };
    const existing = await prisma.packagedProduct.findFirst({
      where: { barcode: data.barcode, ownerId: null },
    });
    if (existing) {
      return prisma.packagedProduct.update({ where: { id: existing.id }, data: write });
    }
    try {
      return await prisma.packagedProduct.create({ data: write });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await prisma.packagedProduct.findFirst({
          where: { barcode: data.barcode, ownerId: null },
        });
        if (winner) return winner;
      }
      throw err;
    }
  }

  async savePrivate(
    ownerId: string,
    source: Extract<PackagedProductSource, 'LABEL' | 'USER'>,
    data: PackagedProductData,
  ): Promise<PackagedProduct> {
    const write = { ...data, source, fetchedAt: new Date() };
    if (data.barcode === null) {
      return prisma.packagedProduct.create({ data: { ...write, ownerId } });
    }
    return prisma.packagedProduct.upsert({
      where: { ownerId_barcode: { ownerId, barcode: data.barcode } },
      create: { ...write, ownerId },
      update: write,
    });
  }

  async search(query: string, viewerId: string, limit: number): Promise<PackagedProduct[]> {
    const term = query.trim();
    if (term.length === 0) return [];
    const rows = await prisma.packagedProduct.findMany({
      where: {
        AND: [
          { OR: [{ ownerId: null }, { ownerId: viewerId }] },
          {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { brand: { contains: term, mode: 'insensitive' } },
              { barcode: term },
            ],
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit * 2,
    });
    // The viewer's own products first: they read the label themselves.
    const own = rows.filter((r) => r.ownerId === viewerId);
    const shared = rows.filter((r) => r.ownerId === null);
    return [...own, ...shared].slice(0, limit);
  }
}

export const packagedProductRepository = new PackagedProductRepository();
