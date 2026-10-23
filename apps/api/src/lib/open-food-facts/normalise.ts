import type { PackagedProductData } from '@chefer/database';

// ─── Open Food Facts → PackagedProductData (ADR 0002) ─────────────────────────
// OFF is crowd-sourced: any field may be missing, a string, or nonsense. The
// rule is honesty — a value we can't read is null (shown as "not stated"),
// never 0 and never guessed. Only calories may be derived, from kJ, because
// that's arithmetic on the label's own number.

/** OFF `allergens_tags` / `traces_tags` → Chefer allergy taxonomy ids (EU-14). */
export const OFF_ALLERGEN_TO_TAXONOMY: Readonly<Record<string, string>> = {
  'en:milk': 'dairy',
  'en:gluten': 'gluten',
  'en:wheat': 'gluten',
  'en:nuts': 'tree-nuts',
  'en:peanuts': 'peanuts',
  'en:eggs': 'egg',
  'en:soybeans': 'soy',
  'en:fish': 'fish',
  'en:crustaceans': 'crustaceans',
  'en:molluscs': 'molluscs',
  'en:celery': 'celery',
  'en:mustard': 'mustard',
  'en:sesame-seeds': 'sesame',
  'en:sulphur-dioxide-and-sulphites': 'sulphites',
  'en:lupin': 'lupin',
};

/** Maps OFF tags to distinct taxonomy ids; tags OFF invents beyond the EU-14 are dropped. */
export function mapOffAllergenTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const ids = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const id = OFF_ALLERGEN_TO_TAXONOMY[tag.trim().toLowerCase()];
    if (id) ids.add(id);
  }
  return [...ids];
}

/** A finite, non-negative number from OFF's number-or-string fields; null otherwise. */
function readNumber(value: unknown, max: number): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
}

function readText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text.slice(0, max) : null;
}

const KJ_PER_KCAL = 4.184;

function readKcal(nutriments: Record<string, unknown>): number | null {
  const kcal = readNumber(nutriments['energy-kcal_100g'], 900);
  if (kcal !== null) return Math.round(kcal);
  const kj = readNumber(nutriments['energy-kj_100g'] ?? nutriments['energy_100g'], 3800);
  return kj === null ? null : Math.round(kj / KJ_PER_KCAL);
}

/** Serving size in grams; ml counts as grams because OFF's nutriments are then per 100 ml too. */
function readServingSize(product: Record<string, unknown>): number | null {
  const unit = readText(product['serving_quantity_unit'], 10)?.toLowerCase();
  if (unit && unit !== 'g' && unit !== 'ml') return null;
  const grams = readNumber(product['serving_quantity'], 2000);
  return grams === 0 ? null : grams;
}

/**
 * `allergensKnown`: OFF either lists allergens, or has a completed
 * ingredient list it found none in. With neither, it simply doesn't know.
 */
function allergensKnown(product: Record<string, unknown>, contains: string[]): boolean {
  if (contains.length > 0) return true;
  const states = Array.isArray(product['states_tags']) ? product['states_tags'] : [];
  return (
    states.includes('en:ingredients-completed') || readText(product['ingredients_text'], 5) !== null
  );
}

/** The fields Chefer stores, read from one OFF v2 `product` object. */
export function normaliseOffProduct(
  barcode: string,
  raw: unknown,
): PackagedProductData & { barcode: string } {
  const product = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const nutriments = (
    product['nutriments'] && typeof product['nutriments'] === 'object' ? product['nutriments'] : {}
  ) as Record<string, unknown>;
  const contains = mapOffAllergenTags(product['allergens_tags']);
  const traces = mapOffAllergenTags(product['traces_tags']).filter((id) => !contains.includes(id));
  const firstBrand = readText(product['brands'], 200)?.split(',')[0]?.trim().slice(0, 80);
  const brand = firstBrand && firstBrand.length > 0 ? firstBrand : null;
  const name =
    readText(product['product_name'], 120) ??
    readText(product['product_name_en'], 120) ??
    readText(product['generic_name'], 120) ??
    `Product ${barcode}`;
  const imageUrl = readText(product['image_front_small_url'], 500);
  return {
    barcode,
    name,
    brand,
    kcalPer100g: readKcal(nutriments),
    proteinPer100g: readNumber(nutriments['proteins_100g'], 100),
    carbsPer100g: readNumber(nutriments['carbohydrates_100g'], 100),
    fatPer100g: readNumber(nutriments['fat_100g'], 100),
    fiberPer100g: readNumber(nutriments['fiber_100g'], 100),
    sugarPer100g: readNumber(nutriments['sugars_100g'], 100),
    saturatedFatPer100g: readNumber(nutriments['saturated-fat_100g'], 100),
    saltPer100g: readNumber(nutriments['salt_100g'], 100),
    servingSizeG: readServingSize(product),
    allergenTags: contains,
    traceTags: traces,
    allergensKnown: allergensKnown(product, contains),
    imageUrl: imageUrl?.startsWith('https://') ? imageUrl : null,
  };
}
