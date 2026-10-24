import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPackagedProductRepository, PackagedProduct } from '@chefer/database';
import type { TableSafety, UserProfile } from '@chefer/types';
import { OffUnavailableError } from '../../lib/open-food-facts/client.js';
import {
  labelReadingToDraft,
  productAllergenWarnings,
  ProductsService,
} from './products.service.js';

// ADR 0006: own product > fresh cache > Open Food Facts; OFF down falls back
// to the cache; allergen clashes warn for everyone at the table.

const quota = vi.hoisted(() => ({ release: vi.fn() }));
vi.mock('../../lib/quotas.js', () => ({
  reserveMealScan: vi.fn().mockResolvedValue(quota),
}));
vi.mock('../../lib/ai/index.js', () => ({ aiService: {} }));
vi.mock('../../lib/env.js', () => ({
  env: { OFF_BASE_URL: 'https://off.test', OFF_USER_AGENT: 'x' },
}));
vi.mock('../../lib/open-food-facts/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/open-food-facts/client.js')>()),
  openFoodFacts: {},
}));
vi.mock('../safety/safety.service.js', () => ({ safetyService: {} }));

const NOW = new Date('2026-10-22T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function row(overrides: Partial<PackagedProduct> = {}): PackagedProduct {
  return {
    id: 'p1',
    barcode: '3017620422003',
    name: 'Nutella',
    brand: 'Ferrero',
    kcalPer100g: 539,
    proteinPer100g: 6.3,
    carbsPer100g: 57.5,
    fatPer100g: 30.9,
    fiberPer100g: null,
    sugarPer100g: 56.3,
    saturatedFatPer100g: 10.6,
    saltPer100g: 0.11,
    servingSizeG: 15,
    allergenTags: ['dairy', 'tree-nuts'],
    traceTags: [],
    allergensKnown: true,
    imageUrl: null,
    source: 'OFF',
    fetchedAt: new Date(NOW - DAY),
    ownerId: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  };
}

const EMPTY_TABLE: TableSafety = { people: [], hasRules: false, needsReview: false };
const TABLE: TableSafety = {
  hasRules: true,
  needsReview: false,
  people: [
    {
      who: 'you',
      isOwner: true,
      items: [{ id: 'dairy', label: 'Dairy', kind: 'allergy' }],
      notes: [],
    },
    {
      who: 'Luca',
      isOwner: false,
      items: [
        { id: 'tree-nuts', label: 'Tree nuts', kind: 'allergy' },
        { id: 'shellfish', label: 'Shellfish', kind: 'allergy' },
      ],
      notes: [],
    },
    {
      who: 'Maria',
      isOwner: false,
      items: [{ id: 'vegan', label: 'Vegan', kind: 'diet' }],
      notes: [],
    },
  ],
};

function setup(rows: { own?: PackagedProduct | null; shared?: PackagedProduct | null } = {}) {
  const repo = {
    findByBarcode: vi
      .fn()
      .mockResolvedValue({ own: rows.own ?? null, shared: rows.shared ?? null }),
    findVisibleById: vi.fn(),
    upsertShared: vi.fn(async (data) => row({ ...data, fetchedAt: new Date(NOW) })),
    savePrivate: vi.fn(async (ownerId, source, data) =>
      row({ ...data, ownerId, source, id: 'own1' }),
    ),
    search: vi.fn().mockResolvedValue([]),
  } satisfies IPackagedProductRepository;
  const off = { lookup: vi.fn() };
  const ai = { readNutritionLabel: vi.fn() };
  const service = new ProductsService(
    repo,
    off,
    ai,
    async () => TABLE,
    () => NOW,
  );
  return { repo, off, ai, service };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProductsService.lookupBarcode', () => {
  it("prefers the user's own product and never calls OFF", async () => {
    const { off, service } = setup({ own: row({ ownerId: 'u1', source: 'LABEL', id: 'own' }) });
    const result = await service.lookupBarcode('u1', '3017620422003');
    expect(result).toMatchObject({
      status: 'found',
      origin: 'own',
      product: { id: 'own', isOwn: true },
    });
    expect(off.lookup).not.toHaveBeenCalled();
  });

  it('serves a fresh cached row without calling OFF', async () => {
    const { off, service } = setup({ shared: row() });
    expect(await service.lookupBarcode('u1', '3017620422003')).toMatchObject({
      origin: 'cache',
      stale: false,
    });
    expect(off.lookup).not.toHaveBeenCalled();
  });

  it('refreshes a cache row older than 30 days from OFF', async () => {
    const { off, repo, service } = setup({ shared: row({ fetchedAt: new Date(NOW - 31 * DAY) }) });
    off.lookup.mockResolvedValue({ found: true, product: { ...row(), barcode: '3017620422003' } });
    expect(await service.lookupBarcode('u1', '3017620422003')).toMatchObject({ origin: 'off' });
    expect(repo.upsertShared).toHaveBeenCalledTimes(1);
  });

  it('pads a UPC-A to EAN-13 before looking anything up', async () => {
    const { off, repo, service } = setup();
    off.lookup.mockResolvedValue({ found: false });
    expect(await service.lookupBarcode('u1', '036000291452')).toEqual({
      status: 'not_found',
      barcode: '0036000291452',
    });
    expect(repo.findByBarcode).toHaveBeenCalledWith('0036000291452', 'u1');
  });

  it('falls back to a stale cache row when OFF is down, and says so', async () => {
    const { off, service } = setup({ shared: row({ fetchedAt: new Date(NOW - 90 * DAY) }) });
    off.lookup.mockRejectedValue(new OffUnavailableError('HTTP 503'));
    expect(await service.lookupBarcode('u1', '3017620422003')).toMatchObject({
      status: 'found',
      stale: true,
    });
  });

  it('answers SERVICE_UNAVAILABLE when OFF is down and nothing is cached', async () => {
    const { off, service } = setup();
    off.lookup.mockRejectedValue(new OffUnavailableError('timeout'));
    await expect(service.lookupBarcode('u1', '3017620422003')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('attaches allergen warnings for the whole table', async () => {
    const { service } = setup({ shared: row() });
    const result = await service.lookupBarcode('u1', '3017620422003');
    expect(result.status === 'found' && result.warnings).toEqual([
      { allergenId: 'dairy', label: 'Dairy', kind: 'contains', who: ['you', 'Maria'] },
      { allergenId: 'tree-nuts', label: 'Tree nuts', kind: 'contains', who: ['Luca'] },
    ]);
  });
});

describe('productAllergenWarnings', () => {
  it('a legacy Shellfish allergy covers crustaceans and molluscs; traces warn as may-contain', () => {
    expect(
      productAllergenWarnings({ allergenTags: ['crustaceans'], traceTags: ['molluscs'] }, TABLE),
    ).toEqual([
      { allergenId: 'crustaceans', label: 'Crustaceans', kind: 'contains', who: ['Luca', 'Maria'] },
      { allergenId: 'molluscs', label: 'Molluscs', kind: 'may-contain', who: ['Luca', 'Maria'] },
    ]);
  });

  it('nobody at the table → no warnings', () => {
    expect(
      productAllergenWarnings({ allergenTags: ['dairy'], traceTags: [] }, EMPTY_TABLE),
    ).toEqual([]);
  });
});

describe('labelReadingToDraft', () => {
  const reading = {
    productName: 'Oat Biscuits',
    brand: 'Mock Bakery',
    basis: 'perServing' as const,
    servingSizeG: 25,
    kcal: 118,
    protein: 1.8,
    carbs: 16.5,
    fat: 4.9,
    fiber: null,
    sugar: 6,
    saturatedFat: 2.1,
    salt: 0.12,
    allergens: ['wheat', 'oats', 'milk'],
    confidence: 'high' as const,
  };

  it('converts per-serving values to per 100 g and says so', () => {
    const { draft, notes } = labelReadingToDraft(reading, '96385074');
    expect(draft.per100g).toEqual({
      kcal: 472,
      protein: 7.2,
      carbs: 66,
      fat: 19.6,
      fiber: null,
      sugar: 24,
      saturatedFat: 8.4,
      salt: 0.5,
    });
    expect(draft.barcode).toBe('96385074');
    expect(notes[0]).toMatch(/per serving \(25 g\)/);
  });

  it('maps allergen words to taxonomy ids; an empty list stays "unknown"', () => {
    expect(labelReadingToDraft(reading, null).draft.allergens).toEqual({
      known: true,
      contains: ['gluten', 'dairy'],
    });
    expect(labelReadingToDraft({ ...reading, allergens: [] }, null).draft.allergens).toEqual({
      known: false,
      contains: [],
    });
  });

  it('per serving without a size, or not a label: numbers stay empty with a note', () => {
    const noSize = labelReadingToDraft({ ...reading, servingSizeG: null }, null);
    expect(noSize.draft.per100g.kcal).toBeNull();
    expect(noSize.notes[0]).toMatch(/no serving size/);
    const none = labelReadingToDraft({ ...reading, basis: 'none' }, null);
    expect(none.draft.per100g.kcal).toBeNull();
    expect(none.notes[0]).toMatch(/doesn’t look like a nutrition label/);
  });
});

describe('ProductsService.scanLabel', () => {
  const user = { id: 'u1', planTier: 'PREMIUM' } as UserProfile;

  it('returns the reviewed-draft shape and keeps the quota on success', async () => {
    const { ai, service } = setup();
    ai.readNutritionLabel.mockResolvedValue({
      productName: null,
      brand: null,
      basis: 'per100g',
      servingSizeG: null,
      kcal: 400,
      protein: 10,
      carbs: 60,
      fat: 12,
      fiber: null,
      sugar: null,
      saturatedFat: null,
      salt: null,
      allergens: [],
      confidence: 'med',
    });
    const result = await service.scanLabel(user, 'aGk=', 'image/jpeg', '036000291452');
    expect(result.draft).toMatchObject({
      barcode: '0036000291452',
      name: '',
      per100g: { kcal: 400 },
    });
    expect(quota.release).not.toHaveBeenCalled();
  });

  it('refunds the scan when every provider is over capacity', async () => {
    const { ai, service } = setup();
    ai.readNutritionLabel.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));
    await expect(service.scanLabel(user, 'aGk=', 'image/jpeg', null)).rejects.toBeDefined();
    expect(quota.release).toHaveBeenCalledTimes(1);
  });
});

describe('ProductsService.create', () => {
  it('saves a private row, canonical barcode, and empty brand as null', async () => {
    const { repo, service } = setup();
    const result = await service.create(
      'u1',
      {
        barcode: '036000291452',
        name: 'Granola',
        brand: '',
        per100g: {
          kcal: 450,
          protein: null,
          carbs: null,
          fat: null,
          fiber: null,
          sugar: null,
          saturatedFat: null,
          salt: null,
        },
        servingSizeG: 45,
        allergens: { known: false, contains: ['tree-nuts'] },
      },
      'USER',
    );
    const [ownerId, source, data] = repo.savePrivate.mock.calls[0]!;
    expect([ownerId, source]).toEqual(['u1', 'USER']);
    expect(data).toMatchObject({ barcode: '0036000291452', brand: null, allergensKnown: true });
    expect(result.product).toMatchObject({ isOwn: true, allergens: { status: 'listed' } });
    expect(result.warnings).toEqual([
      { allergenId: 'tree-nuts', label: 'Tree nuts', kind: 'contains', who: ['Luca'] },
    ]);
  });
});
