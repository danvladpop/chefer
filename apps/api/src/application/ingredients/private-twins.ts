import {
  ingredientPriceRepository,
  ingredientRepository,
  type CatalogIngredientRow,
  type IIngredientRepository,
  type IngredientPrice,
} from '@chefer/database';
import { ingredientSlug, normalizeIngredientKey } from '@chefer/utils';

// ─── Pre-catalog custom ingredients → private catalog rows (plan §7 step 2) ───
// A user's custom ingredients from before the catalog live only as private
// `ingredient_prices` rows. Before anything resolves or computes for that user,
// each gets a private `Ingredient` twin (alias = its name key, a `piece`
// portion from gramsPerPiece) and the price row is linked to it. Done lazily
// per user; rows missing a core macro stay unlinked (their lines stay PARTIAL).

function titleCase(name: string): string {
  return name.replace(/(^|[\s-])\w/g, (c) => c.toUpperCase());
}

/** The private twin for one legacy row: the existing one with that slug, or a new one. */
export async function twinForLegacyRow(
  userId: string,
  row: IngredientPrice,
  catalog: IIngredientRepository = ingredientRepository,
): Promise<CatalogIngredientRow | null> {
  const { caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g } = row;
  if (
    caloriesPer100g == null ||
    proteinPer100g == null ||
    carbsPer100g == null ||
    fatPer100g == null
  )
    return null;
  const slug = ingredientSlug(row.ingredientName);
  if (!slug) return null;
  const existing = await catalog.findPrivateBySlug(userId, slug);
  if (existing) return existing;
  return catalog.createPrivate(userId, slug, {
    name: titleCase(row.ingredientName),
    category: 'OTHER',
    kcalPer100g: caloriesPer100g,
    proteinPer100g,
    carbsPer100g,
    fatPer100g,
    fiberPer100g: row.fiberPer100g ?? 0,
    imageUrl: row.imageUrl,
    aliases: [normalizeIngredientKey(row.ingredientName)],
    portions: row.gramsPerPiece ? [{ unit: 'piece', grams: row.gramsPerPiece }] : [],
  });
}

/** Links every unlinked legacy custom row of `userId` to its private twin. */
export async function ensurePrivateTwins(
  userId: string,
  catalog: IIngredientRepository = ingredientRepository,
): Promise<void> {
  const legacy = await ingredientPriceRepository.findUnlinkedPrivate(userId);
  for (const row of legacy) {
    const twin = await twinForLegacyRow(userId, row, catalog);
    if (twin) await ingredientPriceRepository.linkIngredient(row.ingredientName, twin.id);
  }
}
