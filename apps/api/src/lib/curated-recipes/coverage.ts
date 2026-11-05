import type { MealType, RecipeData } from '../ai/types.js';
import {
  CURATED_ALLERGY_ENTRIES,
  CURATED_DIET_ENTRIES,
  curatedSafetyProfile,
} from './safety-profile.js';
import { filterSafeRecipes, type SafetyPrefs } from './safety.js';

// ─── Curated pool coverage (market review F2, 2026-10-22) ─────────────────────
// Where the free pool is thin. Every number is computed the way users are
// served (the strict curated filter), so "12 nut-free dinners" means a
// nut-free household really draws from 12. A meal type is eaten once a day,
// so a pool of N recipes repeats within N / 7 weeks.

export const COVERAGE_MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export type MealTypeCounts = Record<MealType, number>;

export const PREP_TIME_BANDS = [
  { id: 'upTo15', label: '≤ 15 min', maxMins: 15 },
  { id: 'upTo30', label: '16–30 min', maxMins: 30 },
  { id: 'upTo45', label: '31–45 min', maxMins: 45 },
  { id: 'upTo60', label: '46–60 min', maxMins: 60 },
  { id: 'over60', label: '> 60 min', maxMins: Number.POSITIVE_INFINITY },
] as const;

const NONE: SafetyPrefs = { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] };

/** Households we expect to be common, as the preferences they store. */
export const COVERAGE_PROFILES: { id: string; label: string; prefs: SafetyPrefs }[] = [
  { id: 'none', label: 'No restrictions', prefs: NONE },
  {
    id: 'vegetarian',
    label: 'Vegetarian',
    prefs: { ...NONE, dietaryRestrictions: ['vegetarian'] },
  },
  { id: 'vegan', label: 'Vegan', prefs: { ...NONE, dietaryRestrictions: ['vegan'] } },
  {
    id: 'pescatarian',
    label: 'Pescatarian',
    prefs: { ...NONE, dietaryRestrictions: ['pescatarian'] },
  },
  {
    id: 'gluten-free',
    label: 'Gluten-free',
    prefs: { ...NONE, dietaryRestrictions: ['gluten-free'] },
  },
  {
    id: 'dairy-free',
    label: 'Dairy-free',
    prefs: { ...NONE, dietaryRestrictions: ['dairy-free'] },
  },
  {
    id: 'nut-free',
    label: 'Nut-free (tree nuts + peanuts)',
    prefs: { ...NONE, allergies: ['Tree nuts', 'Peanuts'] },
  },
  { id: 'egg-free', label: 'Egg allergy', prefs: { ...NONE, allergies: ['Eggs'] } },
  {
    id: 'fish-shellfish-free',
    label: 'Fish + shellfish allergy',
    prefs: { ...NONE, allergies: ['Fish', 'Crustaceans', 'Molluscs'] },
  },
  {
    id: 'nut-free+dairy-free',
    label: 'Nut-free + dairy-free',
    prefs: { ...NONE, allergies: ['Tree nuts', 'Peanuts', 'Dairy'] },
  },
  {
    id: 'vegetarian+gluten-free',
    label: 'Vegetarian + gluten-free',
    prefs: { ...NONE, dietaryRestrictions: ['vegetarian', 'gluten-free'] },
  },
  {
    id: 'vegan+nut-free',
    label: 'Vegan + nut-free',
    prefs: { ...NONE, dietaryRestrictions: ['vegan'], allergies: ['Tree nuts', 'Peanuts'] },
  },
  {
    id: 'gluten-free+dairy-free',
    label: 'Gluten-free + dairy-free',
    prefs: { ...NONE, dietaryRestrictions: ['gluten-free', 'dairy-free'] },
  },
  {
    id: 'dairy-free+egg-free',
    label: 'Dairy + egg allergy (toddler classic)',
    prefs: { ...NONE, allergies: ['Dairy', 'Eggs'] },
  },
  { id: 'keto', label: 'Keto', prefs: { ...NONE, dietaryRestrictions: ['keto'] } },
];

export interface CoverageRow {
  id: string;
  label: string;
  counts: MealTypeCounts;
}

export interface ProfileCoverage extends CoverageRow {
  /** Weeks of daily meals before a recipe must repeat, per meal type. */
  weeksBeforeRepeat: Record<MealType, number>;
}

export interface ThinSpot {
  profileId: string;
  profileLabel: string;
  mealType: MealType;
  poolSize: number;
  weeksBeforeRepeat: number;
  severity: 'repeats within 2 weeks' | 'repeats within 4 weeks';
}

export interface CoverageReport {
  total: number;
  ingested: number;
  byMealType: MealTypeCounts;
  byDiet: CoverageRow[];
  byAllergenFree: CoverageRow[];
  byPrepTime: CoverageRow[];
  byCuisine: (CoverageRow & { total: number })[];
  profiles: ProfileCoverage[];
  /** Profile × meal type cells that repeat within 4 weeks, worst first. */
  thinSpots: ThinSpot[];
}

function zero(): MealTypeCounts {
  return { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
}

function countBy(
  pools: Record<MealType, RecipeData[]>,
  test: (recipe: RecipeData) => boolean,
): MealTypeCounts {
  const counts = zero();
  for (const type of COVERAGE_MEAL_TYPES) counts[type] = pools[type].filter(test).length;
  return counts;
}

/** Weeks before a daily meal repeats, to one decimal. */
export function weeksBeforeRepeat(poolSize: number): number {
  return Math.round((poolSize / 7) * 10) / 10;
}

export function buildCoverageReport(
  pools: Record<MealType, RecipeData[]>,
  ingestedIds: ReadonlySet<string> = new Set(),
): CoverageReport {
  const profiles = new Map<string, ReturnType<typeof curatedSafetyProfile>>();
  const profileOf = (r: RecipeData) => {
    let p = profiles.get(r.id);
    if (!p) {
      p = curatedSafetyProfile(r);
      profiles.set(r.id, p);
    }
    return p;
  };

  const all = new Map(COVERAGE_MEAL_TYPES.flatMap((t) => pools[t].map((r) => [r.id, r] as const)));

  const cuisines = new Map<string, MealTypeCounts>();
  for (const type of COVERAGE_MEAL_TYPES) {
    for (const r of pools[type]) {
      const key = r.cuisineType.trim() || 'Unknown';
      const counts = cuisines.get(key) ?? zero();
      counts[type] += 1;
      cuisines.set(key, counts);
    }
  }

  const profileRows: ProfileCoverage[] = COVERAGE_PROFILES.map((profile) => {
    const counts = zero();
    const weeks = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 } as Record<MealType, number>;
    for (const type of COVERAGE_MEAL_TYPES) {
      counts[type] = filterSafeRecipes(pools[type], profile.prefs).length;
      weeks[type] = weeksBeforeRepeat(counts[type]);
    }
    return { id: profile.id, label: profile.label, counts, weeksBeforeRepeat: weeks };
  });

  const thinSpots: ThinSpot[] = profileRows
    .flatMap((p) =>
      COVERAGE_MEAL_TYPES.map((mealType) => ({
        profileId: p.id,
        profileLabel: p.label,
        mealType,
        poolSize: p.counts[mealType],
        weeksBeforeRepeat: p.weeksBeforeRepeat[mealType],
      })),
    )
    .filter((c) => c.poolSize < 28)
    .map((c) => ({
      ...c,
      severity:
        c.poolSize < 14 ? ('repeats within 2 weeks' as const) : ('repeats within 4 weeks' as const),
    }))
    .sort((a, b) => a.poolSize - b.poolSize || a.profileId.localeCompare(b.profileId));

  return {
    total: all.size,
    ingested: [...all.keys()].filter((id) => ingestedIds.has(id)).length,
    byMealType: countBy(pools, () => true),
    byDiet: CURATED_DIET_ENTRIES.map((e) => ({
      id: e.id,
      label: e.label,
      counts: countBy(pools, (r) => profileOf(r).diets.includes(e.id)),
    })),
    byAllergenFree: CURATED_ALLERGY_ENTRIES.map((e) => ({
      id: e.id,
      label: `${e.label}-free`,
      counts: countBy(pools, (r) => profileOf(r).freeFrom.includes(e.id)),
    })),
    byPrepTime: PREP_TIME_BANDS.map((band, i) => {
      const min = i === 0 ? -1 : PREP_TIME_BANDS[i - 1]!.maxMins;
      return {
        id: band.id,
        label: band.label,
        counts: countBy(pools, (r) => {
          const mins = r.prepTimeMins + r.cookTimeMins;
          return mins > min && mins <= band.maxMins;
        }),
      };
    }),
    byCuisine: [...cuisines.entries()]
      .map(([cuisine, counts]) => ({
        id: cuisine,
        label: cuisine,
        counts,
        total: COVERAGE_MEAL_TYPES.reduce((n, t) => n + counts[t], 0),
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    profiles: profileRows,
    thinSpots,
  };
}
