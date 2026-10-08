'use client';

import { useMemo } from 'react';
import { pickedFromRef } from '@/features/ingredients/lib/picked-ingredient';
import { newLineRow, type LineRow } from '@/features/recipes/lib/recipe-lines';
import { trpc } from '@/lib/trpc';
import { normalizeRecipeUnit } from '@chefer/utils';

// ─── A stored recipe's lines, ready to edit (plan-ingredient-catalog §10) ─────
// Shared by Edit and Duplicate (UX-REC-04). Stored catalog lines come back
// linked by their ingredientId. A line without one (legacy, or an old client's
// free text) is resolved: an EXACT/ALIAS match is linked as the server would on
// save, anything else shows "pick a match" with the resolver's suggestions. A
// pre-catalog recipe with no stored lines falls back to the Json ingredients.

type SourceLine = {
  ingredientId: string | null;
  rawName: string;
  quantity: number;
  unit: string;
  note: string | null;
  optional: boolean;
};

type SourceRecipe = {
  lines: SourceLine[];
  /** Prisma Json: the pre-catalog `{ name, quantity, unit }[]`. */
  ingredients: unknown;
};

/**
 * The rows to put in the form, or null until `ready` and the lookups behind
 * them have landed (a failed lookup still lets the user edit).
 */
export function useRecipeFormLines(
  recipe: SourceRecipe | undefined,
  ready: boolean,
): LineRow[] | null {
  const sourceLines = useMemo<SourceLine[] | null>(() => {
    if (!recipe || !ready) return null;
    if (recipe.lines.length > 0) return recipe.lines;
    const legacy = recipe.ingredients as { name: string; quantity: number; unit: string }[];
    return legacy.map((l) => {
      const { unit, note } = normalizeRecipeUnit(l.unit);
      return {
        ingredientId: null,
        rawName: l.name,
        quantity: l.quantity,
        unit: unit || l.unit,
        note: note ?? null,
        optional: false,
      };
    });
  }, [recipe, ready]);
  const linkedIds = useMemo(
    () => [
      ...new Set((sourceLines ?? []).flatMap((l) => (l.ingredientId ? [l.ingredientId] : []))),
    ],
    [sourceLines],
  );
  const unlinked = useMemo(() => (sourceLines ?? []).filter((l) => !l.ingredientId), [sourceLines]);
  const details = trpc.ingredients.getMany.useQuery(
    { ids: linkedIds },
    { enabled: linkedIds.length > 0, staleTime: 5 * 60_000 },
  );
  const resolution = trpc.ingredients.resolve.useQuery(
    { lines: unlinked.slice(0, 100).map((l) => ({ rawName: l.rawName, unit: l.unit })) },
    { enabled: unlinked.length > 0, staleTime: 60_000, retry: false },
  );

  const detailsReady = linkedIds.length === 0 || !details.isLoading;
  const resolutionReady = unlinked.length === 0 || !resolution.isLoading;
  return useMemo(() => {
    if (!sourceLines || !detailsReady || !resolutionReady) return null;
    const byId = new Map((details.data ?? []).map((d) => [d.id, pickedFromRef(d)] as const));
    let u = 0;
    const rows = sourceLines.map((l): LineRow => {
      const base = {
        rawName: l.rawName,
        quantity: String(l.quantity),
        unit: l.unit,
        note: l.note,
        optional: l.optional,
      };
      if (l.ingredientId) {
        const picked = byId.get(l.ingredientId) ?? null;
        return newLineRow({ ...base, ingredient: picked });
      }
      const r = resolution.data?.[u++];
      if (r?.match && (r.confidence === 'EXACT' || r.confidence === 'ALIAS')) {
        return newLineRow({ ...base, ingredient: pickedFromRef(r.match) });
      }
      return newLineRow({ ...base, candidates: (r?.candidates ?? []).map(pickedFromRef) });
    });
    return rows.length > 0 ? rows : [newLineRow()];
  }, [sourceLines, detailsReady, resolutionReady, details.data, resolution.data]);
}
