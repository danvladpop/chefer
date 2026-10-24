import {
  findSafetyTaxonomyEntry,
  PACKAGED_PRODUCT_COPY,
  PACKAGED_PRODUCT_LIMITS,
  packagedProductDraftSchema,
  PRODUCT_ALLERGEN_IDS,
  type NutritionLabelDraft,
  type PackagedProductDraft,
  type PackagedProductView,
  type ProductAllergenWarning,
  type ProductAmount,
} from '@chefer/types';
import { formatNumber } from './format';

// ─── Packaged products (ADR 0005) ─────────────────────────────────────────────
// The arithmetic and copy every surface shares: the API scales a logged
// amount with the same functions the product card previews it with, so the
// number on the button is the number that gets logged.

type Per100g = PackagedProductView['per100g'];
const ONE_DP = { maximumFractionDigits: 1 };

/** Grams for an amount; null when servings are asked for but the product has no serving size. */
export function productAmountGrams(
  amount: ProductAmount,
  servingSizeG: number | null,
): number | null {
  if (amount.unit === 'g') return amount.grams;
  if (servingSizeG === null || servingSizeG <= 0) return null;
  return Math.round(amount.servings * servingSizeG * 10) / 10;
}

export interface ScaledProduct {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Macros the product doesn't state: logged as 0 g and flagged (UX-FOOD-11). */
  unknownMacros: ('protein' | 'carbs' | 'fat')[];
}

/** Nutrition for `grams` of a product, rounded as the tracker stores it. Null without calories. */
export function scaleProduct(per100g: Per100g, grams: number): ScaledProduct | null {
  if (per100g.kcal === null) return null;
  const factor = grams / 100;
  const unknownMacros: ScaledProduct['unknownMacros'] = [];
  const macro = (key: 'protein' | 'carbs' | 'fat'): number => {
    const value = per100g[key];
    if (value === null) {
      unknownMacros.push(key);
      return 0;
    }
    return Math.round(value * factor * 10) / 10;
  };
  return {
    kcal: Math.round(per100g.kcal * factor),
    protein: macro('protein'),
    carbs: macro('carbs'),
    fat: macro('fat'),
    unknownMacros,
  };
}

/** The most a single entry may hold of this product, in grams (5 kg, or 5,000 kcal). */
export function productMaxGrams(per100g: Per100g): number {
  const byKcal =
    per100g.kcal && per100g.kcal > 0 ? Math.floor((5000 / per100g.kcal) * 100) : Infinity;
  return Math.min(PACKAGED_PRODUCT_LIMITS.amountGramsMax, byKcal);
}

/** "Oatly Oat Drink" — brand first unless the name already starts with it. */
export function productDisplayName(product: Pick<PackagedProductView, 'name' | 'brand'>): string {
  const brand = product.brand?.trim();
  if (!brand || product.name.toLowerCase().startsWith(brand.toLowerCase())) return product.name;
  return `${brand} ${product.name}`;
}

/** The logged entry's name: "Oatly Oat Drink, 250 g" or "…, 2 servings (60 g)". */
export function productEntryName(
  product: Pick<PackagedProductView, 'name' | 'brand'>,
  amount: ProductAmount,
  grams: number,
): string {
  const base = productDisplayName(product).slice(0, 170);
  if (amount.unit === 'g') return `${base}, ${formatNumber(grams, ONE_DP)} g`;
  const servings = formatNumber(amount.servings, ONE_DP);
  const noun = amount.servings === 1 ? 'serving' : 'servings';
  return `${base}, ${servings} ${noun} (${formatNumber(grams, ONE_DP)} g)`;
}

/** "Contains dairy: you and Maria avoid it." / "May contain sesame: Luca avoids it." */
export function productAllergenWarningText(warning: ProductAllergenWarning): string {
  const who = warning.who.length > 0 ? warning.who : ['you'];
  const last = who.at(-1) ?? 'you';
  const whoText = who.length === 1 ? last : `${who.slice(0, -1).join(', ')} and ${last}`;
  const verb = who.length === 1 && who[0] !== 'you' ? 'avoids' : 'avoid';
  const lead = warning.kind === 'contains' ? 'Contains' : 'May contain';
  return `${lead} ${warning.label.toLowerCase()}: ${whoText} ${verb} it.`;
}

/** The allergen line under a product: what it contains, or an honest "unknown". */
export function productAllergenLine(allergens: PackagedProductView['allergens']): string {
  if (allergens.status === 'unknown') return PACKAGED_PRODUCT_COPY.allergensUnknown;
  if (allergens.status === 'none-listed') return PACKAGED_PRODUCT_COPY.allergensNoneListed;
  const contains = allergens.contains.map((a) => a.label).join(', ');
  const traces = allergens.mayContain.map((a) => a.label).join(', ');
  return [contains && `Contains: ${contains}.`, traces && `May contain: ${traces}.`]
    .filter(Boolean)
    .join(' ');
}

/** A typed barcode as the user enters it: digits only, at most 14. */
export function cleanBarcodeInput(text: string): string {
  return text.replace(/\D/g, '').slice(0, 14);
}

// ─── The product form (manual entry and label-scan review) ───────────────────

export type ProductFormNumbers = Record<keyof PackagedProductDraft['per100g'], string>;

export interface ProductFormInput {
  barcode: string | null;
  name: string;
  brand: string;
  numbers: ProductFormNumbers;
  serving: string;
  contains: string[];
  noneListed: boolean;
}

/** "" = not on the pack (null); anything unreadable is NaN so the schema refuses it. */
function parseFormNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** The form's text fields → a valid draft, or the one sentence that says what to fix. */
export function parseProductForm(
  input: ProductFormInput,
): { ok: true; draft: PackagedProductDraft } | { ok: false; error: string } {
  const per100g = Object.fromEntries(
    Object.entries(input.numbers).map(([key, text]) => [key, parseFormNumber(text)]),
  ) as Record<keyof ProductFormNumbers, number | null>;
  if (per100g.kcal === null)
    return { ok: false, error: 'Enter the calories per 100 g from the pack.' };
  const parsed = packagedProductDraftSchema.safeParse({
    barcode: input.barcode,
    name: input.name,
    brand: input.brand.trim() === '' ? null : input.brand,
    per100g,
    servingSizeG: parseFormNumber(input.serving),
    allergens: { known: input.noneListed || input.contains.length > 0, contains: input.contains },
  });
  if (parsed.success) return { ok: true, draft: parsed.data };
  const field = parsed.error.issues[0]?.path.join('.') ?? '';
  return {
    ok: false,
    error:
      field === 'name'
        ? 'Give the product a name.'
        : field.startsWith('per100g') || field === 'servingSizeG'
          ? 'Check the numbers: each is per 100 g, and 100 g can’t hold more than 100 g of anything.'
          : 'Check the product details.',
  };
}

/** Number fields in label order, shared by both platforms' forms. */
export const PRODUCT_FORM_FIELDS: {
  key: keyof ProductFormNumbers;
  label: string;
  unit: string;
  required?: true;
}[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', required: true },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'fiber', label: 'Fibre', unit: 'g' },
  { key: 'sugar', label: 'of which sugars', unit: 'g' },
  { key: 'saturatedFat', label: 'of which saturates', unit: 'g' },
  { key: 'salt', label: 'Salt', unit: 'g' },
];

/** Allergens offered as new picks: legacy Shellfish stays out (Crustaceans + Molluscs cover it). */
export const PRODUCT_ALLERGEN_PICKS: { id: string; label: string }[] = PRODUCT_ALLERGEN_IDS.flatMap(
  (id) => {
    const entry = findSafetyTaxonomyEntry(id);
    return entry && !entry.hiddenForNewPicks ? [{ id, label: entry.label }] : [];
  },
);

/** The form's starting text from a draft (label scan, incomplete product or blank). */
export function productFormFromDraft(draft: NutritionLabelDraft['draft']): ProductFormInput {
  const numbers = Object.fromEntries(
    PRODUCT_FORM_FIELDS.map(({ key }) => [
      key,
      draft.per100g[key] === null ? '' : String(draft.per100g[key]),
    ]),
  ) as ProductFormNumbers;
  return {
    barcode: draft.barcode,
    name: draft.name,
    brand: draft.brand ?? '',
    numbers,
    serving: draft.servingSizeG === null ? '' : String(draft.servingSizeG),
    contains: draft.allergens.contains,
    noneListed: draft.allergens.known && draft.allergens.contains.length === 0,
  };
}

/** A blank draft for "Enter it yourself", keeping the scanned barcode. */
export function blankProductDraft(barcode: string | null): NutritionLabelDraft['draft'] {
  return {
    barcode,
    name: '',
    brand: null,
    per100g: {
      kcal: null,
      protein: null,
      carbs: null,
      fat: null,
      fiber: null,
      sugar: null,
      saturatedFat: null,
      salt: null,
    },
    servingSizeG: null,
    allergens: { known: false, contains: [] },
  };
}

/** An incomplete product's known fields, as the user's own copy to finish. */
export function draftFromProduct(product: PackagedProductView): NutritionLabelDraft['draft'] {
  return {
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    per100g: product.per100g,
    servingSizeG: product.servingSizeG,
    allergens: {
      known: product.allergens.status !== 'unknown',
      contains: product.allergens.contains.map((a) => a.id),
    },
  };
}
