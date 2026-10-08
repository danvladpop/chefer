import {
  ingredientRepository,
  recipeLineRepository,
  type IIngredientRepository,
  type IRecipeLineRepository,
  type RecipeLineWrite,
  type StoredRecipeLineRow,
} from '@chefer/database';
import type { NutritionStatus } from '@chefer/types';
import { normalizeRecipeUnit } from '@chefer/utils';
import { aiService } from '../../lib/ai/index.js';
import type { IAIService, RecipeLineRepairRequest } from '../../lib/ai/types.js';
import { catalogSlugList } from '../meal-plan/ai-recipe-catalog.js';
import { ingredientResolver, type IngredientResolver } from './ingredient-resolver.js';
import { mappingFor } from './legacy-line-policy.js';
import { recipeNutritionService, type RecipeNutritionService } from './recipe-nutrition.service.js';
import { catalogRepairRows, repairRejection, type RepairTargetRow } from './repair-guard.js';

// ─── Regenerating incomplete legacy AI recipes (owner decision 2026-10-02) ────
// After the §7 migration some old AI recipes stay PARTIAL because of a line
// the catalog can't weigh ("1 block tofu", "1 head broccoli"). Their bad LINES
// get the §6.3 repair round. The model names a catalog slug and an amount,
// never a nutrition number, and the server recomputes. The dish itself (name,
// instructions, other lines) is kept, because these recipes sit in users' plans.
//
// Safety, after a first dry run on prod produced copied counts ("1 head
// broccoli → 1 g") and look-alike foods ("curry paste → dry pasta"):
//   - scope: lines the owner-reviewed legacy mapping left PARTIAL on purpose
//     (dishes, leftovers, far-off proxies) and "leftover …" lines are never
//     regenerated;
//   - every proposal passes `repairRejection` (repair-guard.ts);
//   - `propose` only proposes. A person reviews the proposals file, and
//     `applyFixes` writes exactly the reviewed fixes, re-checked, with no
//     second AI call.

export interface LegacyRecipe {
  id: string;
  name: string;
  creatorId: string | null;
  servings: number;
  /** The Json mirror, so unchanged lines keep their display name and unit. */
  ingredients: unknown;
  nutritionInfo: unknown;
  lines: StoredRecipeLineRow[];
}

/** One proposed (or reviewed) line fix. */
export interface LineFix {
  recipeId: string;
  position: number;
  slug: string;
  quantity: number;
  unit: string;
  /** "firm tofu (1 block) → tofu-firm 400 g", for the reviewer. */
  change: string;
}

export interface RegenerateOutcome {
  recipeId: string;
  name: string;
  status: NutritionStatus;
  oldKcal: number | null;
  newKcal: number;
  fixes: LineFix[];
  /** Proposals the guard refused, with the reason. */
  rejected: string[];
  /** Lines left out of regeneration on purpose (legacy mapping / leftovers). */
  skipped: string[];
  /** Lines that still don't compute. */
  remaining: string[];
}

const BATCH = 40;

/** Why a problem line is not offered to the model at all, or null. */
export function regenerationScopeReason(line: { rawName: string; unit: string }): string | null {
  const m = mappingFor(line.rawName);
  if (m && 'partial' in m) return `left PARTIAL on purpose: ${m.reason}`;
  if (/^\s*left\s*overs?\b/i.test(line.rawName)) return 'a leftover of another dish';
  return null;
}

export class LegacyRecipeRegenerator {
  constructor(
    private readonly ai: Pick<IAIService, 'repairRecipeLines'> = aiService,
    private readonly resolver: Pick<IngredientResolver, 'resolveMany'> = ingredientResolver,
    private readonly catalog: Pick<
      IIngredientRepository,
      'findGlobalIdsBySlugs'
    > = ingredientRepository,
    private readonly nutrition: Pick<RecipeNutritionService, 'compute'> = recipeNutritionService,
    private readonly lines: Pick<IRecipeLineRepository, 'writeLines'> = recipeLineRepository,
    private readonly rows: ReadonlyMap<string, RepairTargetRow> = catalogRepairRows(),
  ) {}

  /**
   * Asks the model for fixes and returns them for review. Nothing is written.
   * Up to `rounds` rounds: a line whose proposal was rejected is asked again.
   */
  async propose(
    recipes: readonly LegacyRecipe[],
    opts: { rounds?: number; catalogSlugs?: string } = {},
  ): Promise<RegenerateOutcome[]> {
    const catalogSlugs = opts.catalogSlugs ?? catalogSlugList(null);
    const fixes = new Map<string, LineFix>();
    const rejected = new Map<string, string[]>();
    const skipped = new Map<string, string[]>();
    const key = (recipeId: string, position: number) => `${recipeId}::${position}`;

    for (let round = 0; round < (opts.rounds ?? 2); round++) {
      const asks: {
        recipe: LegacyRecipe;
        line: StoredRecipeLineRow;
        slug: string | undefined;
        problem: string;
      }[] = [];
      for (const r of recipes) {
        const { result, rows } = await this.nutrition.compute(r.lines, r.creatorId, r.servings);
        for (const l of result.lines) {
          const line = r.lines[l.position];
          if (!l.problem || l.optional || !line || fixes.has(key(r.id, line.position))) continue;
          const reason = regenerationScopeReason(line);
          if (reason) {
            if (round === 0)
              push(skipped, r.id, `${line.rawName} (${line.quantity} ${line.unit}): ${reason}`);
            continue;
          }
          const slug = line.ingredientId ? rows.get(line.ingredientId)?.slug : undefined;
          asks.push({ recipe: r, line, slug, problem: l.problem });
        }
      }
      if (asks.length === 0) break;

      for (let i = 0; i < asks.length; i += BATCH) {
        const batch = asks.slice(i, i + BATCH);
        const resolved = await this.resolver.resolveMany(
          batch.map((a) => ({ rawName: a.line.rawName })),
          null,
          { candidateLimit: 3 },
        );
        const candidates = batch.map((_, k) =>
          [
            ...(resolved[k]?.match ? [resolved[k].match.slug] : []),
            ...(resolved[k]?.candidates ?? []).map((c) => c.slug),
          ].slice(0, 3),
        );
        const request: RecipeLineRepairRequest = {
          catalogSlugs,
          lines: batch.map((a, k) => ({
            id: key(a.recipe.id, a.line.position),
            recipeName: a.recipe.name,
            rawName: a.line.rawName,
            slug: a.slug,
            quantity: a.line.quantity,
            unit: a.line.unit,
            problem: a.problem,
            candidates: candidates[k] ?? [],
          })),
        };
        let answers: Awaited<ReturnType<IAIService['repairRecipeLines']>> = [];
        try {
          answers = await this.ai.repairRecipeLines(request);
        } catch (err) {
          console.warn('[legacy-regenerate] repair call failed:', err);
          continue;
        }
        const byId = new Map(answers.map((f) => [f.id, f]));
        batch.forEach((a, k) => {
          const f = byId.get(key(a.recipe.id, a.line.position));
          if (!f) return;
          const unit = normalizeRecipeUnit(f.unit).unit || f.unit;
          const change = `${a.line.rawName} (${a.line.quantity} ${a.line.unit}) → ${f.slug} ${f.quantity} ${unit}`;
          const why = repairRejection(
            { ...a.line, slug: a.slug, candidates: candidates[k] ?? [] },
            { slug: f.slug, quantity: f.quantity, unit },
            this.rows.get(f.slug),
          );
          if (why) push(rejected, a.recipe.id, `${change}: ${why}`);
          else
            fixes.set(key(a.recipe.id, a.line.position), {
              recipeId: a.recipe.id,
              position: a.line.position,
              slug: f.slug,
              quantity: f.quantity,
              unit,
              change,
            });
        });
      }
    }

    const proposed = await this.applyFixes(recipes, [...fixes.values()], { dryRun: true });
    const byRecipe = new Map(proposed.map((o) => [o.recipeId, o]));
    const out: RegenerateOutcome[] = [];
    for (const r of recipes) {
      const o = byRecipe.get(r.id);
      const extra = { rejected: rejected.get(r.id) ?? [], skipped: skipped.get(r.id) ?? [] };
      if (o) out.push({ ...o, ...extra });
      else {
        const { result } = await this.nutrition.compute(r.lines, r.creatorId, r.servings);
        out.push({
          recipeId: r.id,
          name: r.name,
          status: result.status,
          oldKcal: kcalOf(r.nutritionInfo),
          newKcal: result.perServing.calories,
          fixes: [],
          ...extra,
          remaining: problemLines(result.lines, r.lines),
        });
      }
    }
    return out;
  }

  /**
   * Applies reviewed fixes (no AI call): each is re-checked by the guard,
   * the recipe is recomputed, and, unless `dryRun`, its lines are written.
   * Recipes without an applicable fix are left untouched.
   */
  async applyFixes(
    recipes: readonly LegacyRecipe[],
    fixes: readonly LineFix[],
    opts: { dryRun: boolean },
  ): Promise<RegenerateOutcome[]> {
    const ids = await this.catalog.findGlobalIdsBySlugs([...new Set(fixes.map((f) => f.slug))]);
    const out: RegenerateOutcome[] = [];
    for (const r of recipes) {
      const mine = fixes.filter((f) => f.recipeId === r.id);
      if (mine.length === 0) continue;
      const { rows } = await this.nutrition.compute(r.lines, r.creatorId, r.servings);
      const rejected: string[] = [];
      const applied: LineFix[] = [];
      const lines = r.lines.map((l) => {
        const f = mine.find((x) => x.position === l.position);
        if (!f) return l;
        const ingredientId = ids.get(f.slug);
        const why = ingredientId
          ? repairRejection(
              {
                ...l,
                slug: l.ingredientId ? rows.get(l.ingredientId)?.slug : undefined,
                // A reviewed fix: the person accepted the food, the amount is still checked.
                candidates: [f.slug],
              },
              f,
              this.rows.get(f.slug),
            )
          : `"${f.slug}" is not in this database`;
        if (why || !ingredientId) {
          rejected.push(`${f.change}: ${why ?? 'not applicable'}`);
          return l;
        }
        applied.push(f);
        return { ...l, ingredientId, quantity: f.quantity, unit: f.unit };
      });
      const { result } = await this.nutrition.compute(lines, r.creatorId, r.servings);
      out.push({
        recipeId: r.id,
        name: r.name,
        status: result.status,
        oldKcal: kcalOf(r.nutritionInfo),
        newKcal: result.perServing.calories,
        fixes: applied,
        rejected,
        skipped: [],
        remaining: problemLines(result.lines, lines),
      });
      if (opts.dryRun || applied.length === 0) continue;
      const mirror = Array.isArray(r.ingredients)
        ? (r.ingredients as { name?: unknown; unit?: unknown }[])
        : [];
      const writes: RecipeLineWrite[] = lines.map((l, i) => {
        const fix = applied.find((f) => f.position === l.position);
        const mirrorName = mirror[i]?.name;
        const mirrorUnit = mirror[i]?.unit;
        return {
          ingredientId: l.ingredientId,
          rawName: l.rawName,
          quantity: l.quantity,
          unit: l.unit,
          grams: result.lines[i]?.grams ?? null,
          note: fix
            ? [l.note, `regenerated 2026-10-02 (was ${fix.change.split(' → ')[0]})`]
                .filter(Boolean)
                .join('; ')
            : l.note,
          optional: l.optional,
          ...(typeof mirrorName === 'string' ? { mirrorName } : {}),
          // A regenerated line shows its new amount; others keep the author's unit.
          ...(!fix && typeof mirrorUnit === 'string' ? { mirrorUnit } : {}),
        };
      });
      await this.lines.writeLines(r.id, writes, {
        status: result.status,
        perServing: result.perServing,
        total: result.total,
      });
    }
    return out;
  }
}

function problemLines(
  results: readonly { position: number; problem?: string | null; optional?: boolean }[],
  lines: readonly StoredRecipeLineRow[],
): string[] {
  return results.flatMap((l) =>
    l.problem && !l.optional ? [`${lines[l.position]?.rawName ?? '?'}: ${l.problem}`] : [],
  );
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}

function kcalOf(info: unknown): number | null {
  const v = (info as { calories?: unknown } | null)?.calories;
  return typeof v === 'number' ? v : null;
}

export const legacyRecipeRegenerator = new LegacyRecipeRegenerator();
