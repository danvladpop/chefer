// Test support: an in-memory ingredient catalog behind the `trpc.ingredients`
// hooks the recipe forms use (search, catalogList, getMany, resolve and the
// private-ingredient mutations), so form tests exercise the real picker,
// editor and live nutrition with the shared engine.
import type { RouterOutputs } from '@/lib/trpc';
import { vi } from 'vitest';

type Detail = RouterOutputs['ingredients']['getMany'][number];
type ResolvedLine = RouterOutputs['ingredients']['resolve'][number];

function detail(
  id: string,
  name: string,
  per100g: { calories: number; protein: number; carbs: number; fat: number; fiber: number },
  extra: Partial<Detail> = {},
): Detail {
  return {
    id,
    slug: id,
    name,
    category: 'OTHER',
    owner: 'global',
    portions: [],
    hasDensity: false,
    nutritionSource: 'USDA_FDC',
    status: 'ACTIVE',
    per100g: { ...per100g, sugar: null, satFat: null, sodiumMg: null },
    densityGPerMl: null,
    edibleFraction: 1,
    sourceRef: 'fdc:1',
    ...extra,
  };
}

export const CATALOG: Detail[] = [
  detail(
    'basil',
    'Basil, fresh',
    { calories: 23, protein: 3.2, carbs: 1.1, fat: 0.6, fiber: 1.6 },
    {
      category: 'HERB_FRESH',
      portions: [{ unit: 'leaf', grams: 0.5 }],
    },
  ),
  detail(
    'chicken',
    'Chicken breast, raw',
    { calories: 120, protein: 22.5, carbs: 0, fat: 2.6, fiber: 0 },
    { category: 'POULTRY', portions: [{ unit: 'breast', grams: 174 }] },
  ),
  detail(
    'noodles',
    'Egg noodles, dry',
    { calories: 384, protein: 14.2, carbs: 68.8, fat: 4.4, fiber: 3.3 },
    { category: 'PASTA_NOODLE' },
  ),
  detail(
    'oil',
    'Olive oil',
    { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 },
    { category: 'OIL_FAT', hasDensity: true, densityGPerMl: 0.913 },
  ),
];

export const catalogState = {
  /** Resolver answers by raw name; unknown names come back NONE. */
  resolve: new Map<string, Pick<ResolvedLine, 'confidence' | 'match' | 'candidates'>>(),
  createCustom: vi.fn(),
};

const idleMutation = (mutate: (...args: unknown[]) => void = vi.fn()) => ({
  mutate,
  isPending: false,
  isError: false,
  isSuccess: false,
  data: undefined,
  error: null,
  reset: vi.fn(),
});

function toSearchRow(d: Detail): RouterOutputs['ingredients']['search'][number] {
  return {
    name: d.name.toLowerCase(),
    displayName: d.name,
    imageUrl: '',
    hasMacros: true,
    isCustom: d.owner === 'mine',
    per100g: d.per100g,
    id: d.id,
    slug: d.slug,
    category: d.category,
    owner: d.owner,
    portions: d.portions,
    hasDensity: d.hasDensity,
    nutritionSource: d.nutritionSource,
  };
}

export function catalogIngredientsMock() {
  return {
    search: {
      useQuery: (input: { query: string }, opts?: { enabled?: boolean }) => ({
        data:
          opts?.enabled === false
            ? undefined
            : CATALOG.filter((d) => d.name.toLowerCase().includes(input.query.toLowerCase())).map(
                toSearchRow,
              ),
        isFetching: false,
      }),
    },
    catalogList: {
      useQuery: () => ({
        data: { items: [], hasMore: false, nextCursor: null },
        isLoading: false,
      }),
    },
    getMany: {
      useQuery: (input: { ids: string[] }) => ({
        data: CATALOG.filter((d) => input.ids.includes(d.id)),
        isFetching: false,
        isLoading: false,
      }),
    },
    resolve: {
      useQuery: (input: { lines: { rawName: string; unit?: string }[] }) => ({
        data: input.lines.map(
          (l): ResolvedLine => ({
            rawName: l.rawName,
            unit: l.unit ?? 'g',
            note: null,
            confidence: 'NONE',
            match: null,
            candidates: [],
            ...catalogState.resolve.get(l.rawName),
          }),
        ),
        isLoading: false,
      }),
    },
    createCustom: { useMutation: () => idleMutation(catalogState.createCustom) },
    update: { useMutation: () => idleMutation() },
    estimateNutrition: { useMutation: () => idleMutation() },
  };
}

/** `useUtils().ingredients` for the private-ingredient sheet's CONFLICT lookup. */
export function catalogUtilsMock() {
  return { ingredients: { resolve: { fetch: vi.fn().mockResolvedValue([]) } } };
}

/** A catalog row as search/resolve references it. */
export function catalogRef(id: string): NonNullable<ResolvedLine['match']> {
  const d = CATALOG.find((c) => c.id === id);
  if (!d) throw new Error(`no catalog row ${id}`);
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    category: d.category,
    owner: d.owner,
    portions: d.portions,
    hasDensity: d.hasDensity,
    nutritionSource: d.nutritionSource,
  };
}
