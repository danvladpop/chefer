import { TRPCError } from '@trpc/server';
import {
  packagedProductRepository,
  type IPackagedProductRepository,
  type PackagedProduct,
  type PackagedProductData,
} from '@chefer/database';
import type {
  BarcodeLookupResult,
  NutritionLabelDraft,
  PackagedProductDraft,
  PackagedProductView,
  ProductAllergenWarning,
  TableSafety,
  UserProfile,
} from '@chefer/types';
import { recogniseSafetyTerm } from '@chefer/utils';
import { isAiCapacityFailure, toFriendlyAiError } from '../../lib/ai/friendly-error.js';
import { aiService } from '../../lib/ai/index.js';
import type { IAIService, NutritionLabelReading } from '../../lib/ai/types.js';
import { canonicalGtin, decodeBarcodePhoto } from '../../lib/barcode/decode.js';
import {
  OffUnavailableError,
  openFoodFacts,
  type OpenFoodFactsClient,
} from '../../lib/open-food-facts/client.js';
import { reserveMealScan } from '../../lib/quotas.js';
import { safetyService } from '../safety/safety.service.js';
import { allergenLabel, toProductView } from './product-view.js';

// ─── Packaged products (ADR 0005) ─────────────────────────────────────────────
// Barcode → the user's own product, else Chefer's cached Open Food Facts row,
// else Open Food Facts itself. Lookup and logging are free; reading a label
// photo is premium AI (Snap-to-Log quota, AI consent at the router). Allergen
// clashes with anyone at the user's table are WARNINGS: the product is still
// loggable, because the user may be logging it for someone else.

/** A cached OFF row older than this is refreshed on the next lookup. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SEARCH_LIMIT_MAX = 20;

/** Diets that rule out an allergen category outright, for the clash check. */
const DIET_EXCLUDES: Readonly<Record<string, readonly string[]>> = {
  'dairy-free': ['dairy'],
  'egg-free': ['egg'],
  'gluten-free': ['gluten'],
  'gluten-free-coeliac': ['gluten'],
  vegan: ['dairy', 'egg', 'fish', 'crustaceans', 'molluscs'],
  vegetarian: ['fish', 'crustaceans', 'molluscs'],
  'vegetarian-no-eggs': ['egg', 'fish', 'crustaceans', 'molluscs'],
};

/** A person's allergy id → the product allergen ids it covers ("Shellfish" covers both kinds). */
function coveredBy(allergyId: string): readonly string[] {
  return allergyId === 'shellfish' ? ['shellfish', 'crustaceans', 'molluscs'] : [allergyId];
}

export const PRODUCT_LOOKUP_UNAVAILABLE =
  'Couldn’t reach the product database just now. Try again in a minute, or enter the product yourself.';
const LABEL_SCAN_FAILED =
  'We couldn’t read that label. Try again with the table flat and in focus.';

/** Who at the table can't have each allergen: person label → covered product allergen ids. */
export function productAllergenWarnings(
  product: Pick<PackagedProduct, 'allergenTags' | 'traceTags'>,
  table: TableSafety,
): ProductAllergenWarning[] {
  const warnings: ProductAllergenWarning[] = [];
  const check = (ids: string[], kind: ProductAllergenWarning['kind']) => {
    for (const allergenId of ids) {
      const who = table.people
        .filter((person) =>
          person.items.some(
            (item) =>
              (item.kind === 'allergy' && coveredBy(item.id).includes(allergenId)) ||
              (item.kind === 'diet' && (DIET_EXCLUDES[item.id] ?? []).includes(allergenId)),
          ),
        )
        .map((person) => person.who);
      if (who.length > 0)
        warnings.push({ allergenId, label: allergenLabel(allergenId), kind, who });
    }
  };
  check(product.allergenTags, 'contains');
  check(product.traceTags, 'may-contain');
  return warnings;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A label reading → the draft the user reviews: per 100 g, allergens mapped to the taxonomy. */
export function labelReadingToDraft(
  reading: NutritionLabelReading,
  barcode: string | null,
): NutritionLabelDraft {
  const notes: string[] = [];
  let factor: number | null = 1;
  if (reading.basis === 'none') {
    notes.push(
      'That doesn’t look like a nutrition label. Retake the photo, or type the numbers in.',
    );
    factor = null;
  } else if (reading.basis === 'perServing') {
    if (reading.servingSizeG && reading.servingSizeG > 0) {
      factor = 100 / reading.servingSizeG;
      notes.push(
        `The label shows values per serving (${round1(reading.servingSizeG)} g); we converted them to per 100 g.`,
      );
    } else {
      factor = null;
      notes.push(
        'The label shows values per serving but no serving size. Enter the values per 100 g.',
      );
    }
  }
  const scale = (value: number | null, max: number): number | null =>
    value === null || factor === null ? null : Math.min(max, round1(value * factor));

  const contains = new Set<string>();
  for (const word of reading.allergens) {
    const recognised = recogniseSafetyTerm(word);
    if (recognised.kind === 'allergy') contains.add(recognised.id);
  }
  const kcal = scale(reading.kcal, 900);
  return {
    draft: {
      barcode,
      name: reading.productName?.slice(0, 120) ?? '',
      brand: reading.brand?.slice(0, 80) ?? null,
      per100g: {
        kcal: kcal === null ? null : Math.round(kcal),
        protein: scale(reading.protein, 100),
        carbs: scale(reading.carbs, 100),
        fat: scale(reading.fat, 100),
        fiber: scale(reading.fiber, 100),
        sugar: scale(reading.sugar, 100),
        saturatedFat: scale(reading.saturatedFat, 100),
        salt: scale(reading.salt, 100),
      },
      servingSizeG: reading.servingSizeG,
      // An empty list from a photo proves nothing: the user confirms "none".
      allergens: { known: contains.size > 0, contains: [...contains] },
    },
    notes,
    confidence: reading.confidence,
  };
}

function draftToData(draft: PackagedProductDraft): PackagedProductData {
  const barcode = draft.barcode === null ? null : canonicalGtin(draft.barcode);
  return {
    barcode,
    name: draft.name,
    brand: draft.brand && draft.brand.length > 0 ? draft.brand : null,
    kcalPer100g: draft.per100g.kcal,
    proteinPer100g: draft.per100g.protein,
    carbsPer100g: draft.per100g.carbs,
    fatPer100g: draft.per100g.fat,
    fiberPer100g: draft.per100g.fiber,
    sugarPer100g: draft.per100g.sugar,
    saturatedFatPer100g: draft.per100g.saturatedFat,
    saltPer100g: draft.per100g.salt,
    servingSizeG: draft.servingSizeG,
    allergenTags: [...new Set(draft.allergens.contains)],
    traceTags: [],
    allergensKnown: draft.allergens.known || draft.allergens.contains.length > 0,
    imageUrl: null,
  };
}

export class ProductsService {
  constructor(
    private readonly repo: IPackagedProductRepository = packagedProductRepository,
    private readonly off: Pick<OpenFoodFactsClient, 'lookup'> = openFoodFacts,
    private readonly ai: Pick<IAIService, 'readNutritionLabel'> = aiService,
    private readonly loadTable: (userId: string) => Promise<TableSafety> = (userId) =>
      safetyService.getTable(userId),
    private readonly now: () => number = Date.now,
  ) {}

  private async found(
    row: PackagedProduct,
    userId: string,
    origin: 'own' | 'cache' | 'off',
    stale = false,
  ): Promise<BarcodeLookupResult> {
    const table = await this.loadTable(userId);
    return {
      status: 'found',
      product: toProductView(row, userId),
      origin,
      warnings: productAllergenWarnings(row, table),
      stale,
    };
  }

  /**
   * The one lookup every entry point ends in (typed number, barcode photo,
   * and later lane C's live scanner). `barcode` is already schema-valid.
   */
  async lookupBarcode(userId: string, barcode: string): Promise<BarcodeLookupResult> {
    const code = canonicalGtin(barcode);
    const { own, shared } = await this.repo.findByBarcode(code, userId);
    if (own) return this.found(own, userId, 'own');
    if (shared && this.now() - shared.fetchedAt.getTime() < CACHE_TTL_MS) {
      return this.found(shared, userId, 'cache');
    }
    try {
      const result = await this.off.lookup(code);
      if (!result.found) {
        // OFF dropped a product we cached: the old copy beats nothing.
        return shared
          ? await this.found(shared, userId, 'cache')
          : { status: 'not_found', barcode: code };
      }
      const row = await this.repo.upsertShared(result.product);
      return await this.found(row, userId, 'off');
    } catch (err) {
      if (!(err instanceof OffUnavailableError)) throw err;
      console.warn('[products] Open Food Facts lookup failed:', err.message);
      if (shared) return this.found(shared, userId, 'cache', true);
      throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: PRODUCT_LOOKUP_UNAVAILABLE });
    }
  }

  /** Barcode photo (free, no AI): decode server-side, then the same lookup. */
  async lookupBarcodePhoto(
    userId: string,
    imageBase64: string,
    mimeType: string,
  ): Promise<BarcodeLookupResult> {
    const codes = await decodeBarcodePhoto(Buffer.from(imageBase64, 'base64'), mimeType);
    if (codes.length === 0) return { status: 'unreadable' };
    let first: BarcodeLookupResult | null = null;
    for (const code of codes) {
      const result = await this.lookupBarcode(userId, code);
      if (result.status === 'found') return result;
      first ??= result;
    }
    return first ?? { status: 'unreadable' };
  }

  /**
   * Premium label scan: the Snap-to-Log quota and gate (FORBIDDEN on free,
   * TOO_MANY_REQUESTS past the daily limit), then the vision call. Nothing is
   * saved — the user reviews the draft and saves it with `create`.
   */
  async scanLabel(
    user: UserProfile,
    imageBase64: string,
    mimeType: string,
    barcode: string | null,
  ): Promise<NutritionLabelDraft> {
    const reservation = await reserveMealScan(user);
    try {
      const reading = await this.ai.readNutritionLabel(imageBase64, mimeType);
      return labelReadingToDraft(reading, barcode === null ? null : canonicalGtin(barcode));
    } catch (err) {
      if (isAiCapacityFailure(err)) await reservation.release();
      throw toFriendlyAiError(err, 'readNutritionLabel', LABEL_SCAN_FAILED);
    }
  }

  /** Saves the user's own product (a reviewed label scan, or typed in). */
  async create(
    userId: string,
    draft: PackagedProductDraft,
    source: 'LABEL' | 'USER',
  ): Promise<{ product: PackagedProductView; warnings: ProductAllergenWarning[] }> {
    const row = await this.repo.savePrivate(userId, source, draftToData(draft));
    const table = await this.loadTable(userId);
    return { product: toProductView(row, userId), warnings: productAllergenWarnings(row, table) };
  }

  /** The Log sheet's "Packaged products" group: cached and own rows, with warnings. */
  async search(
    userId: string,
    query: string,
    limit: number,
  ): Promise<{ product: PackagedProductView; warnings: ProductAllergenWarning[] }[]> {
    const rows = await this.repo.search(query, userId, Math.min(limit, SEARCH_LIMIT_MAX));
    if (rows.length === 0) return [];
    const table = await this.loadTable(userId);
    return rows.map((row) => ({
      product: toProductView(row, userId),
      warnings: productAllergenWarnings(row, table),
    }));
  }
}

export const productsService = new ProductsService();
