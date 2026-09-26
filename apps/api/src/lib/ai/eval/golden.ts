import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { extractedRecipeSchema } from '../schemas.js';
import type {
  CheferizeInput,
  CoachReviewInput,
  MealPlanInput,
  ShoppingListInput,
  SwapInput,
} from '../types.js';
import type { ImportExpectation, PhotoExpectation } from './scorer.js';

// ─── Golden set (apps/api/eval/golden) ────────────────────────────────────────
// Checked-in inputs + expectations for the eval harness. Everything is local:
// recipe pages are stored as text (no live fetching), photos are committed
// files. Each file is validated on load so a typo fails loudly, not as a
// silently skipped case.

/** apps/api/eval/golden, resolved from this file (src/lib/ai/eval). */
export const GOLDEN_DIR = fileURLToPath(new URL('../../../../eval/golden/', import.meta.url));

const stringList = z.array(z.string());

// Structural check of a stored MealPlanInput (required fields + the optional
// ones the scorer reads); z.custom keeps the declared type exact.
const mealPlanInputCheck = z
  .object({
    userId: z.string(),
    goal: z.string(),
    biologicalSex: z.string(),
    age: z.number(),
    heightCm: z.number(),
    weightKg: z.number(),
    activityLevel: z.string(),
    dailyCalorieTarget: z.number().positive(),
    dietaryRestrictions: stringList,
    allergies: stringList,
    dislikedIngredients: stringList,
    cuisinePreferences: stringList,
    mealsPerDay: z.number().int().min(1).max(6),
    servingSize: z.number().positive(),
    macroTargets: z
      .object({ proteinG: z.number(), carbsG: z.number(), fatG: z.number() })
      .optional(),
    weeklyBudgetEur: z.number().optional(),
    trainingDays: z
      .object({
        days: z.array(
          z.object({ dayOfWeek: z.number(), label: z.string(), workoutName: z.string() }),
        ),
        kcalBonus: z.number(),
        proteinBonus: z.number(),
      })
      .optional(),
  })
  .passthrough();
const mealPlanInputSchema = z.custom<MealPlanInput>(
  (v) => mealPlanInputCheck.safeParse(v).success,
  'not a MealPlanInput',
);

const profilesSchema = z.array(
  z.object({ id: z.string(), note: z.string(), input: mealPlanInputSchema }),
);

const importExpectationSchema = z.custom<ImportExpectation>(
  (v) =>
    z
      .object({
        nameIncludes: stringList.optional(),
        keyIngredients: stringList.optional(),
        kcalPerServing: z.number().optional(),
        servings: z.number().optional(),
        noRecipe: z.boolean().optional(),
      })
      .strict()
      .safeParse(v).success,
  'not an import expectation',
);

const importsSchema = z.array(
  z.object({ id: z.string(), file: z.string(), expected: importExpectationSchema }),
);

const photoExpectationSchema = z.custom<PhotoExpectation>(
  (v) =>
    z
      .object({ kcal: z.number().optional(), dishIncludes: stringList.optional() })
      .strict()
      .safeParse(v).success,
  'not a photo expectation',
);

const photosSchema = z.array(
  z.object({
    id: z.string(),
    file: z.string(),
    mimeType: z.string(),
    source: z.string(),
    licence: z.string(),
    expected: photoExpectationSchema,
  }),
);

const cheferizeInputSchema = z.custom<CheferizeInput>(
  (v) =>
    z
      .object({
        recipe: extractedRecipeSchema,
        targetServings: z.number().positive(),
        preferences: z.object({
          allergies: stringList,
          dietaryRestrictions: stringList,
          dislikedIngredients: stringList,
        }),
      })
      .safeParse(v).success,
  'not a CheferizeInput',
);
const cheferizeSchema = z.array(z.object({ id: z.string(), input: cheferizeInputSchema }));

const pricesSchema = z.object({
  batches: z.array(stringList),
  kcalPer100g: z.record(z.number()),
});

const shoppingInputSchema = z.custom<ShoppingListInput>(
  (v) =>
    z
      .object({
        weekLabel: z.string(),
        ingredients: z.array(
          z.object({ name: z.string(), quantity: z.number(), unit: z.string() }),
        ),
      })
      .safeParse(v).success,
  'not a ShoppingListInput',
);
const shoppingSchema = z.array(z.object({ id: z.string(), input: shoppingInputSchema }));

const reviewInputSchema = z.custom<CoachReviewInput>(
  (v) =>
    z
      .object({
        adherencePct: z.number(),
        loggedDays: z.number(),
        avgDailyKcal: z.number(),
        targetKcal: z.number(),
        weightTrendKg: z.number().nullable(),
        adjustmentKcal: z.number(),
        goal: z.string().nullable(),
        dishNames: stringList,
      })
      .passthrough()
      .safeParse(v).success,
  'not a CoachReviewInput',
);
const reviewsSchema = z.array(z.object({ id: z.string(), input: reviewInputSchema }));

export interface GoldenSet {
  profiles: z.infer<typeof profilesSchema>;
  imports: { id: string; text: string; expected: ImportExpectation }[];
  photos: {
    id: string;
    imageBase64: string;
    mimeType: string;
    source: string;
    expected: PhotoExpectation;
  }[];
  cheferize: z.infer<typeof cheferizeSchema>;
  prices: z.infer<typeof pricesSchema>;
  shopping: z.infer<typeof shoppingSchema>;
  reviews: z.infer<typeof reviewsSchema>;
}

function readJson<T>(dir: string, file: string, schema: z.ZodType<T>): T {
  const raw: unknown = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Golden file ${file} is invalid — ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Loads and validates the whole golden set (text and photo files included). */
export function loadGoldenSet(dir: string = GOLDEN_DIR): GoldenSet {
  const imports = readJson(dir, 'imports.json', importsSchema).map((c) => ({
    id: c.id,
    text: readFileSync(path.join(dir, c.file), 'utf8'),
    expected: c.expected,
  }));
  const photos = readJson(dir, 'photos.json', photosSchema).map((c) => ({
    id: c.id,
    imageBase64: readFileSync(path.join(dir, c.file)).toString('base64'),
    mimeType: c.mimeType,
    source: c.source,
    expected: c.expected,
  }));
  return {
    profiles: readJson(dir, 'profiles.json', profilesSchema),
    imports,
    photos,
    cheferize: readJson(dir, 'cheferize.json', cheferizeSchema),
    prices: readJson(dir, 'prices.json', pricesSchema),
    shopping: readJson(dir, 'shopping.json', shoppingSchema),
    reviews: readJson(dir, 'reviews.json', reviewsSchema),
  };
}

const SWAP_DISHES: { name: string; mealType: SwapInput['mealType'] }[] = [
  { name: 'Scrambled eggs on toast', mealType: 'breakfast' },
  { name: 'Chicken Caesar salad', mealType: 'lunch' },
  { name: 'Beef lasagne', mealType: 'dinner' },
  { name: 'Peanut butter protein balls', mealType: 'snack' },
];

/** One swap case per profile: its safety prefs, a dish from a fixed rotation. */
export function swapCases(golden: GoldenSet): { id: string; input: SwapInput }[] {
  return golden.profiles.map((p, i) => {
    const dish = SWAP_DISHES[i % SWAP_DISHES.length]!;
    return {
      id: p.id,
      input: {
        userId: p.input.userId,
        originalRecipeName: dish.name,
        mealType: dish.mealType,
        preferences: {
          dietaryRestrictions: p.input.dietaryRestrictions,
          allergies: p.input.allergies,
          cuisinePreferences: p.input.cuisinePreferences,
        },
      },
    };
  });
}
