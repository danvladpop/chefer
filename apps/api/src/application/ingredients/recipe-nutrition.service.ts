import {
  ingredientRepository,
  recipeLineRepository,
  type CatalogIngredientRow,
  type IIngredientRepository,
  type IRecipeLineRepository,
  type RecipeForRecompute,
  type RecipeLineWrite,
} from '@chefer/database';
import type { LineProblem, NutritionFacts, NutritionStatus } from '@chefer/types';
import {
  computeRecipeNutrition,
  normalizeRecipeUnit,
  type NutritionLineInput,
  type RecipeNutritionResult,
} from '@chefer/utils';
import {
  ingredientResolver,
  toNutritionIngredient,
  type IngredientResolver,
} from './ingredient-resolver.js';
import { ensurePrivateTwins } from './private-twins.js';

// ─── Computed recipe nutrition over stored lines (plan §5, §8.1) ──────────────
// Server truth for a recipe's numbers: the shared engine over its
// RecipeIngredient rows and the catalog rows its owner may see. Used when a
// private ingredient is edited (every recipe of that owner using it is
// recomputed) and, from P6 on, by every recipe write path.

/** A line the engine computes and the repository stores. */
export interface ComputableLine {
  ingredientId: string | null;
  rawName: string;
  quantity: number;
  unit: string;
  note?: string | null | undefined;
  optional?: boolean | undefined;
}

/** One line of a recipe save, as clients and importers send it. */
export interface SaveLineInput {
  name: string;
  quantity: number;
  unit: string;
  /** Picked from the catalog (new clients). Without it the name is resolved. */
  ingredientId?: string | undefined;
  note?: string | undefined;
  optional?: boolean | undefined;
}

/** Numbers a client typed (or computed client-side) — kept only under D4. */
export interface TypedNutrition extends NutritionFacts {
  source?: 'manual' | 'computed' | 'none' | undefined;
}

/** Per-line outcome of a save, returned to the client (plan §9). */
export interface SavedLineReport {
  position: number;
  name: string;
  ingredientId: string | null;
  grams: number | null;
  problem?: LineProblem;
}

/** One line of the recipe-detail nutrition breakdown (whole-recipe facts for the line). */
export interface NutritionLineDto {
  position: number;
  rawName: string;
  quantity: number;
  unit: string;
  note: string | null;
  optional: boolean;
  /** Null when the line is unresolved or its row is not visible to the viewer. */
  ingredientId: string | null;
  ingredientName: string | null;
  nutritionSource: CatalogIngredientRow['nutritionSource'] | null;
  grams: number | null;
  /** Rounded facts for this line's grams; null when it cannot be shown. */
  facts: NutritionFacts | null;
}

export interface PreparedSave {
  lines: RecipeLineWrite[];
  nutrition: { status: NutritionStatus; perServing: NutritionFacts; total: NutritionFacts | null };
  report: SavedLineReport[];
}

export class RecipeNutritionService {
  constructor(
    private readonly ingredients: IIngredientRepository = ingredientRepository,
    private readonly lines: IRecipeLineRepository = recipeLineRepository,
    private readonly resolver: IngredientResolver = ingredientResolver,
  ) {}

  /**
   * Turns a save's lines into stored lines + server-computed nutrition
   * (plan §6.2). A line keeps its picked `ingredientId`, otherwise its name is
   * resolved EXACT/ALIAS (never fuzzy). Then:
   *   - every line resolves → COMPUTED; the client's numbers are ignored;
   *   - some line does not, and the client typed its own numbers by hand (an
   *     old client: no ingredientIds, numbers not marked `computed`) → those
   *     numbers are kept as USER_ENTERED (D4);
   *   - otherwise → PARTIAL with the numbers of the lines that did resolve.
   * Stored units are canonical with prep text moved to `note`; the Json mirror
   * keeps exactly what the author typed.
   */
  async prepareSave(
    ownerId: string,
    input: readonly SaveLineInput[],
    servings: number,
    typed?: TypedNutrition,
  ): Promise<PreparedSave> {
    await ensurePrivateTwins(ownerId, this.ingredients);
    const toResolve = input.filter((l) => !l.ingredientId);
    const resolved = await this.resolver.resolveMany(
      toResolve.map((l) => ({ rawName: l.name, unit: l.unit })),
      ownerId,
      { candidates: false },
    );
    const resolvedId = new Map(
      toResolve.map((l, i) => [l, resolved[i]?.match?.id ?? null] as const),
    );

    const computable: ComputableLine[] = input.map((l) => {
      const { unit, note } = normalizeRecipeUnit(l.unit);
      return {
        ingredientId: l.ingredientId ?? resolvedId.get(l) ?? null,
        rawName: l.name,
        quantity: l.quantity,
        unit: unit || l.unit,
        note: l.note ?? note ?? null,
        optional: l.optional,
      };
    });
    const { result } = await this.compute(computable, ownerId, servings);

    const lines: RecipeLineWrite[] = computable.map((l, i) => ({
      ingredientId: l.ingredientId,
      rawName: l.rawName,
      quantity: l.quantity,
      unit: l.unit,
      grams: result.lines[i]?.grams ?? null,
      note: l.note ?? null,
      optional: l.optional ?? false,
      mirrorName: input[i]?.name ?? l.rawName,
      mirrorUnit: input[i]?.unit ?? l.unit,
    }));
    const report: SavedLineReport[] = result.lines.map((r) => ({
      position: r.position,
      name: input[r.position]?.name ?? '',
      ingredientId: computable[r.position]?.ingredientId ?? null,
      grams: r.grams,
      ...(r.problem ? { problem: r.problem } : {}),
    }));

    const oldClient = input.every((l) => !l.ingredientId);
    const handTyped =
      typed !== undefined &&
      typed.source !== 'computed' &&
      typed.source !== 'none' &&
      typed.calories > 0;
    if (result.status === 'PARTIAL' && oldClient && handTyped) {
      const { source: _source, ...facts } = typed;
      return {
        lines,
        report,
        nutrition: { status: 'USER_ENTERED', perServing: facts, total: null },
      };
    }
    return {
      lines,
      report,
      nutrition: { status: result.status, perServing: result.perServing, total: result.total },
    };
  }

  /** Computes `lines` against the rows `ownerId` may see. */
  async compute(
    lines: readonly ComputableLine[],
    ownerId: string | null,
    servings: number,
  ): Promise<{ result: RecipeNutritionResult; rows: Map<string, CatalogIngredientRow> }> {
    const ids = lines.flatMap((l) => (l.ingredientId ? [l.ingredientId] : []));
    const rows = new Map(
      (await this.ingredients.findVisibleByIds(ids, ownerId)).map((r) => [r.id, r] as const),
    );
    const engine = new Map([...rows].map(([id, r]) => [id, toNutritionIngredient(r)] as const));
    const input: NutritionLineInput[] = lines.map((l) => ({
      ingredientId: l.ingredientId,
      quantity: l.quantity,
      unit: l.unit,
      optional: l.optional ?? undefined,
    }));
    return { result: computeRecipeNutrition(input, engine, servings), rows };
  }

  /**
   * Recomputes one stored recipe and rewrites its lines, mirror and nutrition.
   * A USER_ENTERED recipe whose lines still do not all resolve keeps its typed
   * numbers (D4), so it is left untouched.
   */
  async recompute(recipe: RecipeForRecompute): Promise<'written' | 'kept-user-entered'> {
    const { result } = await this.compute(recipe.lines, recipe.creatorId, recipe.servings);
    if (recipe.nutritionStatus === 'USER_ENTERED' && result.status !== 'COMPUTED') {
      return 'kept-user-entered';
    }
    const mirror = Array.isArray(recipe.ingredients)
      ? (recipe.ingredients as { name?: unknown; unit?: unknown }[])
      : [];
    const writes: RecipeLineWrite[] = recipe.lines.map((l, i) => {
      const mirrorName = mirror[i]?.name;
      const mirrorUnit = mirror[i]?.unit;
      return {
        ingredientId: l.ingredientId,
        rawName: l.rawName,
        quantity: l.quantity,
        unit: l.unit,
        grams: result.lines[i]?.grams ?? null,
        note: l.note,
        optional: l.optional,
        ...(typeof mirrorName === 'string' ? { mirrorName } : {}),
        ...(typeof mirrorUnit === 'string' ? { mirrorUnit } : {}),
      };
    });
    await this.lines.writeLines(recipe.id, writes, {
      status: result.status,
      perServing: result.perServing,
      total: result.total,
    });
    return 'written';
  }

  /**
   * Gives a fresh "Add to my week" copy the source recipe's lines, recomputed
   * for the viewer (plan §6.2, I3/I4): a line on a row the viewer cannot see —
   * the source author's private ingredient — loses its link and its numbers,
   * so another user's private data never feeds the copy. A USER_ENTERED source
   * whose lines still don't all resolve keeps its typed numbers (D4).
   * No-op for a source without lines (pre-migration).
   */
  async copyLinesForViewer(
    source: { id: string; nutritionStatus: NutritionStatus; nutritionInfo: unknown },
    copy: { id: string; servings: number; ingredients: unknown },
    viewerId: string,
  ): Promise<void> {
    const sourceLines = await this.lines.findByRecipeIds([source.id]);
    if (sourceLines.length === 0) return;
    const { result, rows } = await this.compute(sourceLines, viewerId, copy.servings);
    const mirror = Array.isArray(copy.ingredients)
      ? (copy.ingredients as { name?: unknown; unit?: unknown }[])
      : [];
    const writes: RecipeLineWrite[] = sourceLines.map((l, i) => {
      const mirrorName = mirror[i]?.name;
      const mirrorUnit = mirror[i]?.unit;
      return {
        ingredientId: l.ingredientId && rows.has(l.ingredientId) ? l.ingredientId : null,
        rawName: l.rawName,
        quantity: l.quantity,
        unit: l.unit,
        grams: result.lines[i]?.grams ?? null,
        note: l.note,
        optional: l.optional,
        ...(typeof mirrorName === 'string' ? { mirrorName } : {}),
        ...(typeof mirrorUnit === 'string' ? { mirrorUnit } : {}),
      };
    });
    const keepTyped = source.nutritionStatus === 'USER_ENTERED' && result.status !== 'COMPUTED';
    await this.lines.writeLines(
      copy.id,
      writes,
      keepTyped
        ? {
            status: 'USER_ENTERED',
            perServing: source.nutritionInfo as NutritionFacts,
            total: null,
          }
        : { status: result.status, perServing: result.perServing, total: result.total },
    );
  }

  /**
   * The per-line breakdown the recipe detail shows ("computed from N
   * ingredients", plan §10). Facts come from the rows the VIEWER may see: a
   * line on someone else's private ingredient keeps its grams but no name or
   * numbers, so a private row's macros never reach another user (I4).
   * Empty for a recipe without lines (pre-migration).
   */
  async breakdown(recipeId: string, viewerId: string): Promise<NutritionLineDto[]> {
    const stored = await this.lines.findByRecipeIds([recipeId]);
    if (stored.length === 0) return [];
    const { result, rows } = await this.compute(stored, viewerId, 1);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return stored.map((l, i): NutritionLineDto => {
      const row = l.ingredientId ? rows.get(l.ingredientId) : undefined;
      const facts = row ? result.lines[i]?.facts : undefined;
      return {
        position: l.position,
        rawName: l.rawName,
        quantity: l.quantity,
        unit: l.unit,
        note: l.note,
        optional: l.optional,
        ingredientId: row ? row.id : null,
        ingredientName: row ? row.name : null,
        nutritionSource: row ? row.nutritionSource : null,
        grams: l.grams,
        facts: facts
          ? {
              calories: Math.round(facts.calories),
              protein: r1(facts.protein),
              carbs: r1(facts.carbs),
              fat: r1(facts.fat),
              fiber: r1(facts.fiber),
            }
          : null,
      };
    });
  }

  /** Recomputes every recipe that uses `ingredientId` (after a private-ingredient edit). */
  async recomputeRecipesUsing(ingredientId: string): Promise<{ written: number; kept: number }> {
    const recipes = await this.lines.findRecipesUsingIngredient(ingredientId);
    let written = 0;
    let kept = 0;
    for (const recipe of recipes) {
      if ((await this.recompute(recipe)) === 'written') written += 1;
      else kept += 1;
    }
    return { written, kept };
  }
}

export const recipeNutritionService = new RecipeNutritionService();
