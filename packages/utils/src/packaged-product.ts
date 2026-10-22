import {
  PACKAGED_PRODUCT_COPY,
  PACKAGED_PRODUCT_LIMITS,
  type PackagedProductView,
  type ProductAllergenWarning,
  type ProductAmount,
} from '@chefer/types';
import { formatNumber } from './format';

// ─── Packaged products (ADR 0002) ─────────────────────────────────────────────
// The arithmetic and copy every surface shares: the API scales a logged
// amount with the same functions the product card previews it with, so the
// number on the button is the number that gets logged.

type Per100g = PackagedProductView['per100g'];
const ONE_DP = { maximumFractionDigits: 1 };

/** Grams for an amount; null when servings are asked for but the product has no serving size. */
export function productAmountGrams(amount: ProductAmount, servingSizeG: number | null): number | null {
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
  const whoText = who.length === 1 ? who[0]! : `${who.slice(0, -1).join(', ')} and ${who.at(-1)}`;
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
