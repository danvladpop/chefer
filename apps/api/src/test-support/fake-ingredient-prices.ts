// Test support: an in-memory stand-in for `prisma.ingredientPrice.findMany`
// that honours the where shapes the vocabulary loads use (`ingredientName.in`,
// `creatorId`, `OR`) and `select`. Lets privacy tests (F6) assert behaviour —
// which rows a user's numbers were built from — instead of query shapes.

export type FakeIngredientPriceRow = {
  ingredientName: string;
  creatorId: string | null;
  pricePer100gEur?: number | null;
  pricePer100mlEur?: number | null;
  pricePerPieceEur?: number | null;
  caloriesPer100g?: number | null;
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatPer100g?: number | null;
  fiberPer100g?: number | null;
  gramsPerPiece?: number | null;
};

type Where = {
  ingredientName?: string | { in?: string[] };
  creatorId?: string | null;
  OR?: Where[];
  AND?: Where[];
};

function matches(row: FakeIngredientPriceRow, where: Where | undefined): boolean {
  if (!where) return true;
  if (where.ingredientName !== undefined) {
    const f = where.ingredientName;
    if (typeof f === 'string' ? row.ingredientName !== f : !f.in?.includes(row.ingredientName))
      return false;
  }
  if ('creatorId' in where && row.creatorId !== where.creatorId) return false;
  if (where.OR && !where.OR.some((w) => matches(row, w))) return false;
  if (where.AND && !where.AND.every((w) => matches(row, w))) return false;
  return true;
}

const COLUMNS = [
  'pricePer100gEur',
  'pricePer100mlEur',
  'pricePerPieceEur',
  'caloriesPer100g',
  'proteinPer100g',
  'carbsPer100g',
  'fatPer100g',
  'fiberPer100g',
  'gramsPerPiece',
] as const;

export function fakeIngredientPriceFindMany(rows: FakeIngredientPriceRow[]) {
  return async (args?: { where?: Where; select?: Record<string, boolean> }) =>
    rows
      .filter((row) => matches(row, args?.where))
      .map((row) => {
        const full: Record<string, unknown> = { ...row };
        for (const c of COLUMNS) full[c] = row[c] ?? null;
        if (!args?.select) return full;
        return Object.fromEntries(Object.keys(args.select).map((k) => [k, full[k]]));
      });
}
