import type { PackagedProduct } from '@chefer/database';
import {
  findSafetyTaxonomyEntry,
  type PackagedProductView,
  type ProductAllergenRef,
} from '@chefer/types';

// A stored packaged product → the shape every client renders (ADR 0005).
// Pure and dependency-light, so the tracker can log a product without
// loading the lookup's AI and Open Food Facts clients.

export function allergenLabel(id: string): string {
  return findSafetyTaxonomyEntry(id)?.label ?? id;
}

function allergenRef(id: string): ProductAllergenRef {
  return { id, label: allergenLabel(id) };
}

export function toProductView(row: PackagedProduct, viewerId: string): PackagedProductView {
  const status =
    row.allergenTags.length > 0 ? 'listed' : row.allergensKnown ? 'none-listed' : 'unknown';
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    per100g: {
      kcal: row.kcalPer100g,
      protein: row.proteinPer100g,
      carbs: row.carbsPer100g,
      fat: row.fatPer100g,
      fiber: row.fiberPer100g,
      sugar: row.sugarPer100g,
      saturatedFat: row.saturatedFatPer100g,
      salt: row.saltPer100g,
    },
    servingSizeG: row.servingSizeG,
    allergens: {
      status,
      contains: row.allergenTags.map(allergenRef),
      mayContain: row.traceTags.map(allergenRef),
    },
    source: row.source,
    isOwn: row.ownerId === viewerId,
    imageUrl: row.imageUrl,
  };
}
