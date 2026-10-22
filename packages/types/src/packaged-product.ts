import { z } from 'zod';
import { safetyTaxonomyEntriesByGroup } from './safety-taxonomy';

// ─── Packaged products (docs/adr/0002-packaged-products.md) ───────────────────
// A branded, barcoded food: looked up on Open Food Facts, read off a label
// photo (premium), or typed in. Kept apart from the reviewed ingredient
// catalog. These are the wire shapes and limits every platform shares; the
// API owns the lookup, the allergen mapping and the conflict check.

/** Where a product's numbers came from. */
export const PACKAGED_PRODUCT_SOURCES = ['OFF', 'LABEL', 'USER'] as const;
export type PackagedProductSourceId = (typeof PACKAGED_PRODUCT_SOURCES)[number];

export const PACKAGED_PRODUCT_LIMITS = {
  nameMaxLength: 120,
  brandMaxLength: 80,
  /** kcal per 100 g: pure fat is ~900. */
  kcalPer100gMax: 900,
  /** g per 100 g for any macro, salt included. */
  gramsPer100gMax: 100,
  servingSizeGMax: 2000,
  /** One entry: up to 5 kg or 20 servings. */
  amountGramsMax: 5000,
  amountServingsMax: 20,
} as const;

/** GTIN check digit (EAN-8, UPC-A, EAN-13, GTIN-14): weights 3,1,3,1… from the right. */
export function isValidGtin(digits: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const n = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

export const BARCODE_INVALID_MESSAGE =
  'That barcode doesn’t look right. Check the digits under the bars.';

/** A typed or decoded barcode: spaces and dashes dropped, 8/12/13/14 digits with a valid check digit. */
export const barcodeSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine(isValidGtin, BARCODE_INVALID_MESSAGE);

/** The allergy ids a product can carry (the EU-14 plus legacy Shellfish). */
export const PRODUCT_ALLERGEN_IDS = safetyTaxonomyEntriesByGroup('allergy').map((e) => e.id);

const allergenIdSchema = z.string().refine((id) => PRODUCT_ALLERGEN_IDS.includes(id), {
  message: 'Unknown allergen',
});

const per100g = (max: number) => z.number().finite().min(0).max(max);

/** Per-100 g nutrition. `null` = the source doesn't say (never 0 by default). */
export const productNutritionSchema = z.object({
  kcal: per100g(PACKAGED_PRODUCT_LIMITS.kcalPer100gMax),
  protein: per100g(PACKAGED_PRODUCT_LIMITS.gramsPer100gMax).nullable(),
  carbs: per100g(PACKAGED_PRODUCT_LIMITS.gramsPer100gMax).nullable(),
  fat: per100g(PACKAGED_PRODUCT_LIMITS.gramsPer100gMax).nullable(),
  fiber: per100g(PACKAGED_PRODUCT_LIMITS.gramsPer100gMax).nullable(),
  sugar: per100g(PACKAGED_PRODUCT_LIMITS.gramsPer100gMax).nullable(),
  saturatedFat: per100g(PACKAGED_PRODUCT_LIMITS.gramsPer100gMax).nullable(),
  salt: per100g(PACKAGED_PRODUCT_LIMITS.gramsPer100gMax).nullable(),
});

/**
 * A product the user saves themselves: reviewed from a label scan (`LABEL`)
 * or typed in (`USER`). Calories are required, everything else may be unknown.
 */
export const packagedProductDraftSchema = z.object({
  barcode: barcodeSchema.nullable(),
  name: z.string().trim().min(1).max(PACKAGED_PRODUCT_LIMITS.nameMaxLength),
  brand: z.string().trim().max(PACKAGED_PRODUCT_LIMITS.brandMaxLength).nullable(),
  per100g: productNutritionSchema,
  servingSizeG: z.number().finite().positive().max(PACKAGED_PRODUCT_LIMITS.servingSizeGMax).nullable(),
  allergens: z.object({
    /** `false` = the user doesn't know (shown as "allergens unknown"). */
    known: z.boolean(),
    contains: z.array(allergenIdSchema).max(20),
  }),
});
export type PackagedProductDraft = z.infer<typeof packagedProductDraftSchema>;

/** How much was eaten: grams, or servings of the product's serving size. */
export const productAmountSchema = z.discriminatedUnion('unit', [
  z.object({
    unit: z.literal('g'),
    grams: z.number().finite().positive().max(PACKAGED_PRODUCT_LIMITS.amountGramsMax),
  }),
  z.object({
    unit: z.literal('serving'),
    servings: z.number().finite().positive().max(PACKAGED_PRODUCT_LIMITS.amountServingsMax),
  }),
]);
export type ProductAmount = z.infer<typeof productAmountSchema>;

export interface ProductAllergenRef {
  id: string;
  label: string;
}

/**
 * `listed`: the source names allergens. `none-listed`: it says there are none
 * (the user still checks the pack). `unknown`: it says nothing either way.
 */
export type ProductAllergenStatus = 'listed' | 'none-listed' | 'unknown';

/** A product as every client renders it. */
export interface PackagedProductView {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  /** kcal is null only for an incomplete Open Food Facts row (it can't be logged as is). */
  per100g: {
    kcal: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fiber: number | null;
    sugar: number | null;
    saturatedFat: number | null;
    salt: number | null;
  };
  servingSizeG: number | null;
  allergens: {
    status: ProductAllergenStatus;
    contains: ProductAllergenRef[];
    mayContain: ProductAllergenRef[];
  };
  source: PackagedProductSourceId;
  /** The viewer's own LABEL / USER product. */
  isOwn: boolean;
  imageUrl: string | null;
}

/** One clash between the product and someone at the user's table. Never blocks logging. */
export interface ProductAllergenWarning {
  allergenId: string;
  label: string;
  kind: 'contains' | 'may-contain';
  /** "you" and/or household member names. */
  who: string[];
}

export type BarcodeLookupResult =
  | {
      status: 'found';
      product: PackagedProductView;
      /** `own`: the user's own product; `cache`: Chefer's saved OFF copy; `off`: fetched just now. */
      origin: 'own' | 'cache' | 'off';
      warnings: ProductAllergenWarning[];
      /** Served from the cache because Open Food Facts could not be reached. */
      stale: boolean;
    }
  | { status: 'not_found'; barcode: string }
  /** The barcode photo held no readable barcode. */
  | { status: 'unreadable' };

/** A label scan's draft: reviewed and edited by the user before `products.create`. */
export interface NutritionLabelDraft {
  draft: Omit<PackagedProductDraft, 'per100g'> & {
    per100g: Omit<PackagedProductDraft['per100g'], 'kcal'> & { kcal: number | null };
  };
  /** "Values were per serving (30 g), converted to per 100 g." etc. */
  notes: string[];
  confidence: 'low' | 'med' | 'high';
}

export const PACKAGED_PRODUCT_COPY = {
  scanBarcode: 'Scan barcode',
  scanBarcodeHint: 'Take a photo of the barcode, close up and in focus.',
  typeBarcode: 'Type the barcode number',
  findProduct: 'Find product',
  attribution: 'Data from Open Food Facts',
  attributionLicence: 'Open Database License (ODbL)',
  attributionUrl: 'https://world.openfoodfacts.org',
  notFoundTitle: 'We couldn’t find that product',
  notFoundBody: 'Add it once and it shows up in your searches from then on.',
  unreadable: 'We couldn’t read a barcode in that photo. Try again closer, or type the number.',
  photographLabel: 'Photograph the label',
  enterProduct: 'Enter it yourself',
  incomplete: 'Open Food Facts has no calories for this product yet. Add them from the pack.',
  allergensUnknown: 'Allergens unknown — check the pack.',
  allergensNoneListed: 'No allergens listed — check the pack.',
  labelDraftHint: 'Check every number against the label before you save.',
  stale: 'Couldn’t reach Open Food Facts just now — showing the saved copy.',
  packagedGroup: 'Packaged products',
} as const;
