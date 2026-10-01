import {
  ingredientRepository,
  type CatalogIngredientRow,
  type IIngredientRepository,
  type IngredientKeyMatch,
} from '@chefer/database';
import type { LineProblem } from '@chefer/types';
import {
  ingredientBaseKey,
  ingredientLookupKeys,
  lineGrams,
  normalizeRecipeUnit,
  type NutritionIngredient,
} from '@chefer/utils';

// ─── Free text → catalog row (plan-ingredient-catalog §6.1) ───────────────────
// For each line, the name's lookup keys (most specific first, @chefer/utils
// ingredient-name) are tried in order; within one key a global slug wins over a
// global alias, which wins over the owner's private alias. When nothing hits,
// trigram-similar rows come back as CANDIDATES: suggestions for a person or the
// AI repair round, never applied on write. Only rows the owner may see are ever
// considered (I4).

export type ResolveConfidence = 'EXACT' | 'ALIAS' | 'CANDIDATES' | 'NONE';

export interface ResolveInput {
  rawName: string;
  unit?: string | undefined;
}

export interface ResolveResult {
  rawName: string;
  /** Canonical unit (§5.1) and the prep text split off it. */
  unit: string;
  note: string | null;
  confidence: ResolveConfidence;
  /** Set for EXACT / ALIAS. */
  match: CatalogIngredientRow | null;
  /** The lookup key that hit. */
  matchedKey: string | null;
  /** Fuzzy suggestions, best first (CANDIDATES only). */
  candidates: CatalogIngredientRow[];
  /**
   * With a match: why this unit cannot be turned into grams for that row
   * (NO_DENSITY / NO_PORTION / BAD_UNIT). Absent when the unit converts.
   */
  unitProblem?: LineProblem;
}

/** A catalog row as the shared engine (@chefer/utils) consumes it. */
export function toNutritionIngredient(row: CatalogIngredientRow): NutritionIngredient {
  return {
    id: row.id,
    kcalPer100g: row.kcalPer100g,
    proteinPer100g: row.proteinPer100g,
    carbsPer100g: row.carbsPer100g,
    fatPer100g: row.fatPer100g,
    fiberPer100g: row.fiberPer100g,
    densityGPerMl: row.densityGPerMl,
    edibleFraction: row.edibleFraction,
    portions: row.portions,
  };
}

/** Lower is better: global slug, then global alias, then the owner's alias. */
function rank(m: IngredientKeyMatch): number {
  if (m.via === 'slug') return 0;
  return m.ownerId === null ? 1 : 2;
}

export class IngredientResolver {
  constructor(private readonly repo: IIngredientRepository = ingredientRepository) {}

  /**
   * Resolves many lines with one key query (plus one fuzzy query per miss
   * when `candidates` is on). `ownerId` null resolves against globals only.
   */
  async resolveMany(
    inputs: readonly ResolveInput[],
    ownerId: string | null,
    opts: { candidates?: boolean; candidateLimit?: number } = {},
  ): Promise<ResolveResult[]> {
    const withCandidates = opts.candidates ?? true;
    const candidateLimit = opts.candidateLimit ?? 3;
    const keysPerLine = inputs.map((i) => ingredientLookupKeys(i.rawName));
    const matches = await this.repo.findKeyMatches(keysPerLine.flat(), ownerId);

    const best = new Map<string, IngredientKeyMatch>();
    for (const m of matches) {
      const cur = best.get(m.key);
      if (!cur || rank(m) < rank(cur)) best.set(m.key, m);
    }

    const hits = keysPerLine.map((keys) => {
      for (const key of keys) {
        const m = best.get(key);
        if (m) return m;
      }
      return null;
    });

    const fuzzy = await Promise.all(
      inputs.map((input, i) =>
        hits[i] || !withCandidates
          ? Promise.resolve([])
          : this.repo.fuzzyCandidates(ingredientBaseKey(input.rawName), ownerId, candidateLimit),
      ),
    );

    const ids = [
      ...hits.flatMap((h) => (h ? [h.ingredientId] : [])),
      ...fuzzy.flat().map((c) => c.ingredientId),
    ];
    const rows = new Map(
      (await this.repo.findVisibleByIds(ids, ownerId)).map((r) => [r.id, r] as const),
    );

    return inputs.map((input, i): ResolveResult => {
      const { unit, note } = normalizeRecipeUnit(input.unit ?? '');
      const hit = hits[i];
      const match = hit ? (rows.get(hit.ingredientId) ?? null) : null;
      if (hit && match) {
        const { problem } = lineGrams({ quantity: 1, unit }, toNutritionIngredient(match));
        return {
          rawName: input.rawName,
          unit,
          note: note ?? null,
          confidence: hit.via === 'slug' ? 'EXACT' : 'ALIAS',
          match,
          matchedKey: hit.key,
          candidates: [],
          ...(problem ? { unitProblem: problem } : {}),
        };
      }
      const candidates = (fuzzy[i] ?? []).flatMap((c) => {
        const row = rows.get(c.ingredientId);
        return row ? [row] : [];
      });
      return {
        rawName: input.rawName,
        unit,
        note: note ?? null,
        confidence: candidates.length > 0 ? 'CANDIDATES' : 'NONE',
        match: null,
        matchedKey: null,
        candidates,
      };
    });
  }

  async resolve(
    rawName: string,
    unit: string | undefined,
    ownerId: string | null,
  ): Promise<ResolveResult> {
    const [result] = await this.resolveMany([{ rawName, unit }], ownerId);
    if (!result) throw new Error('resolver returned no result');
    return result;
  }
}

export const ingredientResolver = new IngredientResolver();
