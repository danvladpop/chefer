import { z } from 'zod';

// ─── Typed "I ate…" logging (lane A4) ─────────────────────────────────────────
// The user types what they ate ("2 eggs, toast with butter, coffee with
// milk"); the AI splits it into items, the server matches each one to
// something Chefer knows, and the user confirms (and edits amounts) before
// anything is logged. Free with a daily cap, unlimited on premium; AI consent
// first. Voice is the OS keyboard's dictation, no native module.

export const FOOD_TEXT_LIMITS = {
  maxChars: 300,
  /** Items one parse may return. */
  maxItems: 12,
} as const;

export const foodTextSchema = z.string().trim().min(2).max(FOOD_TEXT_LIMITS.maxChars);

/** Where an item's numbers come from, most trusted first. */
export const FOOD_TEXT_SOURCES = ['recent', 'product', 'ingredient', 'estimate'] as const;
export type FoodTextSource = (typeof FOOD_TEXT_SOURCES)[number];

export interface FoodTextPer100g {
  kcal: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface FoodTextNumbers {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** One parsed item, ready for the review list. */
export type ParsedFoodItem = {
  key: string;
  /** The words it came from ("2 eggs"). */
  text: string;
  /** Display name ("Egg", "Oatly Oat Drink", your recent "Protein shake"). */
  name: string;
  source: FoodTextSource;
  /** Set for a packaged product, so the entry keeps its product ref. */
  productId?: string;
} & (
  | { unit: 'g'; grams: number; per100g: FoodTextPer100g }
  | { unit: 'serving'; servings: number; perServing: FoodTextNumbers }
);

/** One entry the review list logs (numbers already scaled to the chosen amount). */
export const foodTextLogItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  estimatedBy: z.enum(['vision', 'manual']),
  kcal: z.number().finite().min(0).max(5000),
  protein: z.number().finite().min(0).max(500),
  carbs: z.number().finite().min(0).max(1000),
  fat: z.number().finite().min(0).max(500),
  unknownMacros: z
    .array(z.enum(['protein', 'carbs', 'fat']))
    .max(3)
    .optional(),
  product: z.object({ id: z.string().min(1).max(40), grams: z.number().positive() }).optional(),
});
export type FoodTextLogItem = z.infer<typeof foodTextLogItemSchema>;

export const FOOD_TEXT_COPY = {
  entry: 'Type what you ate',
  placeholder: 'e.g. 2 eggs, toast with butter, coffee with milk',
  hint: 'Tip: use your keyboard’s microphone to say it instead.',
  read: 'Read it',
  reviewHint: 'Check the amounts, then log. Estimates are marked.',
  nothingFound: 'We couldn’t find any food in that. Try naming each thing you ate.',
  sourceLabel: {
    recent: 'From your recent logs',
    product: 'Packaged product',
    ingredient: 'Chefer’s catalogue',
    estimate: 'Estimate',
  },
} as const;
