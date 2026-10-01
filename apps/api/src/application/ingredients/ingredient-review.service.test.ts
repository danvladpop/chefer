import { describe, expect, it, vi } from 'vitest';
import { catalogRow, fakeCatalog } from '../../test-support/fake-catalog.js';
import { IngredientResolver } from './ingredient-resolver.js';
import {
  IngredientReviewService,
  mergeToleranceProblem,
  sanityFlags,
  type ReviewDecisionsFile,
} from './ingredient-review.service.js';

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return { ...mod, prisma: {} };
});

const macros = (kcal: number, p: number, c: number, f: number, fib = 0) => ({
  kcalPer100g: kcal,
  proteinPer100g: p,
  carbsPer100g: c,
  fatPer100g: f,
  fiberPer100g: fib,
});

const SKYR = catalogRow('g-skyr', 'skyr-plain', ['skyr'], {
  name: 'Skyr, plain',
  ...macros(63, 11, 4, 0.2),
});
const FETA = catalogRow('g-feta', 'feta', ['feta'], { name: 'Feta', ...macros(264, 14, 4, 21) });
const priv = (id: string, owner: string, name: string, m: ReturnType<typeof macros>) =>
  catalogRow(id, name.replace(/ /g, '-'), [name], {
    name,
    ownerId: owner,
    nutritionSource: 'USER',
    sourceRef: null,
    ...m,
  });

function setup() {
  const aliceSkyr = priv('p1', 'alice', 'skyr', macros(65, 11, 4, 0.4));
  const bobSkyr = priv('p2', 'bob', 'skyr', macros(60, 10, 4, 0));
  const weird = priv('p3', 'bob', 'protein bar', macros(900, 60, 60, 60));
  const catalog = fakeCatalog([SKYR, FETA, aliceSkyr, bobSkyr, weird]);
  const relinkIngredient = vi.fn((from: string) =>
    Promise.resolve([
      { recipeId: `r-${from}`, outcome: 'written' as const, oldKcal: 200, newKcal: 190 },
    ]),
  );
  const upsert = vi.fn().mockResolvedValue({});
  const service = new IngredientReviewService(
    catalog,
    new IngredientResolver(catalog),
    { relinkIngredient },
    {
      upsert,
      listUnread: vi.fn().mockResolvedValue([]),
      markRead: vi.fn().mockResolvedValue(true),
    },
  );
  return { catalog, service, relinkIngredient, upsert };
}

const file = (decisions: ReviewDecisionsFile['decisions']): ReviewDecisionsFile => ({
  review: '2026-10-08',
  decisions,
});

describe('merge tolerance', () => {
  it('flags kcal beyond 25% and macros beyond 30%, with absolute floors', () => {
    expect(mergeToleranceProblem(macros(65, 11, 4, 0.4), SKYR)).toBeNull();
    expect(mergeToleranceProblem(macros(100, 11, 4, 0.2), SKYR)).toMatch(/kcal/);
    expect(mergeToleranceProblem(macros(264, 20, 4, 21), FETA)).toMatch(/protein/);
    // 0.2 g vs 1.5 g fat is +650% but under the 2 g floor
    expect(mergeToleranceProblem(macros(70, 11, 4, 1.5), SKYR)).toBeNull();
  });

  it('sanity flags implausible user numbers', () => {
    expect(sanityFlags(macros(900, 60, 60, 60))).toEqual(
      expect.arrayContaining([expect.stringMatching(/add up to 180 g/)]),
    );
    expect(sanityFlags(SKYR)).toEqual([]);
  });
});

describe('IngredientReviewService.buildReport', () => {
  it('lists private rows with global candidates, deltas and name clusters', async () => {
    const { service } = setup();
    const report = await service.buildReport(new Date(0));
    expect(report.items.map((i) => i.id)).toEqual(['p1', 'p2', 'p3']);
    const alice = report.items[0];
    expect(alice?.candidates[0]).toMatchObject({ slug: 'skyr-plain', toleranceProblem: null });
    expect(alice?.candidates[0]?.delta.kcal).toBe(3);
    expect(report.items[2]?.sanity.length).toBeGreaterThan(0);
    expect(report.clusters[0]).toMatchObject({ key: 'skyr', users: 2, privateIds: ['p1', 'p2'] });
    expect(JSON.stringify(report)).not.toMatch(/@/);
  });
});

describe('IngredientReviewService.apply', () => {
  it('MAP relinks, marks MERGED and sends one VERIFIED_DATA notice per user', async () => {
    const { service, catalog, relinkIngredient, upsert } = setup();
    const [o] = await service.apply(
      file([{ action: 'MAP', privateIds: ['p1', 'p2'], globalSlug: 'skyr-plain' }]),
      { dryRun: false },
    );
    expect(o?.merged).toEqual(['p1', 'p2']);
    expect(relinkIngredient).toHaveBeenCalledWith('p1', 'g-skyr');
    expect(o?.recipes).toHaveLength(2);
    expect(catalog.rows.find((r) => r.id === 'p1')?.status).toBe('MERGED');
    expect(upsert).toHaveBeenCalledWith('alice', 'VERIFIED_DATA', '2026-10-08', ['skyr']);
    expect(upsert).toHaveBeenCalledTimes(2);

    // idempotent
    relinkIngredient.mockClear();
    const [again] = await service.apply(
      file([{ action: 'MAP', privateIds: ['p1'], globalSlug: 'skyr-plain' }]),
      { dryRun: false },
    );
    expect(again?.merged).toEqual([]);
    expect(again?.skipped).toEqual([{ id: 'p1', why: 'already merged' }]);
    expect(relinkIngredient).not.toHaveBeenCalled();
  });

  it('refuses a merge outside tolerance unless forced', async () => {
    const { service } = setup();
    const [o] = await service.apply(
      file([{ action: 'MAP', privateIds: ['p3'], globalSlug: 'feta' }]),
      { dryRun: false },
    );
    expect(o?.merged).toEqual([]);
    expect(o?.skipped[0]?.why).toMatch(/outside merge tolerance/);
    const [forced] = await service.apply(
      file([
        {
          action: 'MAP',
          privateIds: ['p3'],
          globalSlug: 'feta',
          force: true,
          reason: 'same product',
        },
      ]),
      { dryRun: false },
    );
    expect(forced?.merged).toEqual(['p3']);
  });

  it('PROMOTE waits for the row to be synced; dry run writes nothing', async () => {
    const { service, relinkIngredient, upsert } = setup();
    const [promote, dry] = await service.apply(
      file([
        {
          action: 'PROMOTE',
          privateIds: ['p3'],
          newRow: { slug: 'protein-bar', sourceRef: 'label:x' },
        },
        { action: 'MAP', privateIds: ['p1'], globalSlug: 'skyr-plain' },
      ]),
      { dryRun: true },
    );
    expect(promote?.notes[0]).toMatch(/not synced yet/);
    expect(dry?.merged).toEqual(['p1']);
    expect(relinkIngredient).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('REJECT_DATA notifies the owner; KEEP and global ids do nothing', async () => {
    const { service, upsert, relinkIngredient } = setup();
    const outcomes = await service.apply(
      file([
        { action: 'REJECT_DATA', privateIds: ['p3'], reason: 'macros exceed 100 g' },
        { action: 'KEEP', privateIds: ['p2'], reason: 'brand-specific' },
        { action: 'MAP', privateIds: ['g-feta'], globalSlug: 'feta' },
      ]),
      { dryRun: false },
    );
    expect(upsert).toHaveBeenCalledWith('bob', 'CHECK_DATA', '2026-10-08', ['protein bar']);
    expect(outcomes[2]?.skipped).toEqual([{ id: 'g-feta', why: 'is a global row' }]);
    expect(relinkIngredient).not.toHaveBeenCalled();
  });
});
