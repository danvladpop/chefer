/**
 * `pnpm --filter @chefer/api ingredients:verify`
 *
 * plan-ingredient-catalog invariants I1 and I3: every COMPUTED recipe's
 * stored `nutritionInfo` must equal what the shared engine computes from its
 * RecipeIngredient rows right now, and every line of a COMPUTED recipe must
 * reference an ACTIVE row that is global or the recipe owner's own.
 * Read-only. Exits non-zero when any recipe differs (lists the first 50).
 */
import { prisma, recipeLineRepository } from '@chefer/database';
import { recipeNutritionService } from '../application/ingredients/recipe-nutrition.service.js';

const FIELDS = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const;

async function main(): Promise<void> {
  const recipes = await prisma.recipe.findMany({
    where: { nutritionStatus: 'COMPUTED' },
    select: { id: true, name: true, creatorId: true, servings: true, nutritionInfo: true },
  });
  const diffs: string[] = [];
  for (const r of recipes) {
    const lines = await recipeLineRepository.findByRecipeIds([r.id]);
    const { result, rows } = await recipeNutritionService.compute(lines, r.creatorId, r.servings);
    const stored = (r.nutritionInfo ?? {}) as Record<string, unknown>;
    const bad = FIELDS.filter((f) => stored[f] !== result.perServing[f]);
    const foreign = lines.filter((l) => {
      if (!l.ingredientId || l.optional) return false;
      const row = rows.get(l.ingredientId);
      return row?.status !== 'ACTIVE' || (row.ownerId !== null && row.ownerId !== r.creatorId);
    });
    if (result.status !== 'COMPUTED')
      diffs.push(`${r.id} ${r.name}: marked COMPUTED but computes ${result.status}`);
    else if (bad.length)
      diffs.push(
        `${r.id} ${r.name}: ${bad.map((f) => `${f} ${String(stored[f])}≠${result.perServing[f]}`).join(', ')}`,
      );
    if (foreign.length)
      diffs.push(
        `${r.id} ${r.name}: ${foreign.length} line(s) on a missing/inactive/foreign row (I3)`,
      );
  }
  console.log(
    `[ingredients:verify] ${recipes.length} COMPUTED recipes checked, ${diffs.length} problem(s)`,
  );
  for (const d of diffs.slice(0, 50)) console.log(`  ${d}`);
  if (diffs.length > 0) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error('[ingredients:verify] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
