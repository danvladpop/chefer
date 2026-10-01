import { describe, expect, it } from 'vitest';
import { ENERGY_ALLOW_LIST } from './energy-allow-list';
import {
  energyCheck,
  normalizeAlias,
  summarizeIssues,
  validateCatalog,
  validateEntry,
  type CatalogEntry,
  type ValidationRule,
} from './validate';

/** A valid row (olive-oil-like numbers chosen to pass the energy check). */
function entry(over: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    slug: 'test-food',
    name: 'Test food',
    category: 'OTHER',
    aliases: [{ alias: 'test food', locale: 'en' }],
    kcalPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 10,
    fatPer100g: 2,
    fiberPer100g: 1,
    nutritionSource: 'USDA_FDC',
    sourceRef: 'fdc:123456',
    portions: [],
    ...over,
  };
}

const rules = (issues: { rule: ValidationRule }[]) => issues.map((i) => i.rule);
const errorRules = (issues: { rule: ValidationRule; severity: string }[]) =>
  issues.filter((i) => i.severity === 'error').map((i) => i.rule);

describe('normalizeAlias', () => {
  it('lowercases, strips diacritics (incl. Romanian comma-below) and collapses spacing', () => {
    expect(normalizeAlias('  Mărar ')).toBe('marar');
    expect(normalizeAlias('Brânză de VACI')).toBe('branza de vaci');
    expect(normalizeAlias('Ștevie  ȚELINĂ')).toBe('stevie telina');
    expect(normalizeAlias('Jalapeño')).toBe('jalapeno');
  });
  it('drops apostrophes and folds punctuation to single spaces, keeping %', () => {
    expect(normalizeAlias("Shepherd's pie")).toBe('shepherds pie');
    expect(normalizeAlias('whole-wheat, flour')).toBe('whole wheat flour');
    expect(normalizeAlias('Dark chocolate 70%')).toBe('dark chocolate 70%');
  });
});

describe('validateEntry', () => {
  it('accepts a valid row', () => {
    expect(validateEntry(entry())).toEqual([]);
  });

  it('missing-nutrient: flags a core value the source did not publish', () => {
    expect(errorRules(validateEntry(entry({ fiberPer100g: null })))).toContain('missing-nutrient');
    expect(errorRules(validateEntry(entry({ kcalPer100g: Number.NaN })))).toContain(
      'missing-nutrient',
    );
  });

  describe('range', () => {
    it('kcal must be 0–900', () => {
      expect(
        errorRules(
          validateEntry(
            entry({
              kcalPer100g: 901,
              fatPer100g: 100,
              proteinPer100g: 0,
              carbsPer100g: 0,
              fiberPer100g: 0,
            }),
          ),
        ),
      ).toContain('range');
      expect(errorRules(validateEntry(entry({ kcalPer100g: -1 })))).toContain('range');
    });
    it('each macro must be 0–100 g', () => {
      expect(errorRules(validateEntry(entry({ proteinPer100g: -0.1 })))).toContain('range');
      expect(errorRules(validateEntry(entry({ sugarPer100g: 101 })))).toContain('range');
    });
    it('protein + carbs + fat + fiber ≤ 100.5', () => {
      const e = entry({
        kcalPer100g: 520,
        proteinPer100g: 40,
        carbsPer100g: 40,
        fatPer100g: 20,
        fiberPer100g: 1,
      });
      expect(validateEntry(e).find((i) => i.rule === 'range')?.message).toMatch(
        /101\.0 g > 100\.5/,
      );
      expect(errorRules(validateEntry({ ...e, fiberPer100g: 0.5 }))).not.toContain('range');
    });
    it('sodium must be 0–40000 mg', () => {
      expect(errorRules(validateEntry(entry({ sodiumMgPer100g: 40001 })))).toContain('range');
      expect(errorRules(validateEntry(entry({ sodiumMgPer100g: 38758 })))).not.toContain('range');
    });
    it('saturated fat cannot exceed fat (error); sugar above carbs is a warning', () => {
      expect(errorRules(validateEntry(entry({ satFatPer100g: 5 })))).toContain('range');
      const sugar = validateEntry(entry({ sugarPer100g: 12 }));
      expect(sugar).toEqual([expect.objectContaining({ rule: 'range', severity: 'warning' })]);
    });
  });

  describe('energy', () => {
    it('passes within 15 kcal even when the relative gap is large', () => {
      // 4·1 + 4·2 + 9·0 + 2·1 = 14 → published 25 is Δ 11
      expect(
        rules(
          validateEntry(
            entry({
              kcalPer100g: 25,
              proteinPer100g: 1,
              carbsPer100g: 2,
              fatPer100g: 0,
              fiberPer100g: 1,
            }),
          ),
        ),
      ).not.toContain('energy');
    });
    it('passes within 15 % when the absolute gap is large', () => {
      // computed 4·10 + 4·50 + 9·20 + 2·5 = 430; published 490 is Δ 60 = 12.2 %
      expect(
        rules(
          validateEntry(
            entry({
              kcalPer100g: 490,
              proteinPer100g: 10,
              carbsPer100g: 50,
              fatPer100g: 20,
              fiberPer100g: 5,
            }),
          ),
        ),
      ).not.toContain('energy');
    });
    it('fails beyond both tolerances', () => {
      const issues = validateEntry(entry({ kcalPer100g: 200 }));
      expect(issues).toEqual([expect.objectContaining({ rule: 'energy', severity: 'error' })]);
    });
    it('downgrades an allow-listed row to info and shows the reason', () => {
      const issues = validateEntry(
        entry({
          slug: 'wine-red',
          kcalPer100g: 85,
          proteinPer100g: 0.1,
          carbsPer100g: 2.6,
          fatPer100g: 0,
          fiberPer100g: 0,
        }),
        {
          energyAllowList: { 'wine-red': 'contains ~10 g alcohol (7 kcal/g)' },
        },
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ rule: 'energy', severity: 'info' });
      expect(issues[0]?.message).toContain('alcohol');
    });
    it('energyCheck returns null when a core value is missing', () => {
      expect(energyCheck(entry({ fatPer100g: null }))).toBeNull();
    });
    it('every default allow-list entry carries a reason', () => {
      for (const [slug, reason] of Object.entries(ENERGY_ALLOW_LIST)) {
        expect(slug).toMatch(/^[a-z0-9-]+$/);
        expect(reason.length).toBeGreaterThan(10);
      }
    });
  });

  describe('source-ref', () => {
    it('requires a sourceRef matching the nutrition source', () => {
      expect(errorRules(validateEntry(entry({ sourceRef: '' })))).toContain('source-ref');
      expect(errorRules(validateEntry(entry({ sourceRef: 'ciqual:12345' })))).toContain(
        'source-ref',
      );
      expect(
        errorRules(validateEntry(entry({ nutritionSource: 'CIQUAL', sourceRef: 'ciqual:12345' }))),
      ).toEqual([]);
      expect(
        errorRules(
          validateEntry(
            entry({ nutritionSource: 'LABEL', sourceRef: 'label:https://example.org/p' }),
          ),
        ),
      ).toEqual([]);
    });
    it('rejects sources that are not allowed for global rows', () => {
      expect(errorRules(validateEntry(entry({ nutritionSource: 'AI_ESTIMATE' })))).toContain(
        'source-ref',
      );
    });
  });

  it('slug-format, name and category', () => {
    expect(errorRules(validateEntry(entry({ slug: 'Chicken_Breast' })))).toContain('slug-format');
    expect(errorRules(validateEntry(entry({ slug: 'a--b' })))).toContain('slug-format');
    expect(errorRules(validateEntry(entry({ name: ' padded' })))).toContain('name');
    expect(errorRules(validateEntry(entry({ category: 'MEAT' })))).toContain('category');
  });

  describe('aliases (row-local)', () => {
    it('needs at least one English alias', () => {
      expect(
        errorRules(validateEntry(entry({ aliases: [{ alias: 'marar', locale: 'ro' }] }))),
      ).toContain('alias-english');
    });
    it('aliases must already be normalized and use en|ro', () => {
      expect(
        errorRules(validateEntry(entry({ aliases: [{ alias: 'Mărar', locale: 'en' }] }))),
      ).toContain('alias-format');
      expect(
        errorRules(validateEntry(entry({ aliases: [{ alias: 'test food', locale: 'fr' }] }))),
      ).toContain('alias-format');
    });
    it('a duplicate alias on the same row is a warning', () => {
      const issues = validateEntry(
        entry({
          aliases: [
            { alias: 'x', locale: 'en' },
            { alias: 'x', locale: 'en' },
          ],
        }),
      );
      expect(issues).toEqual([
        expect.objectContaining({ rule: 'alias-duplicate', severity: 'warning' }),
      ]);
    });
  });

  describe('portion', () => {
    it('grams must be > 0 and < 2000', () => {
      expect(
        errorRules(
          validateEntry(
            entry({ portions: [{ unit: 'piece', grams: 0, source: 'fdc-portion:1' }] }),
          ),
        ),
      ).toContain('portion');
      expect(
        errorRules(
          validateEntry(
            entry({ portions: [{ unit: 'head', grams: 2000, source: 'fdc-portion:1' }] }),
          ),
        ),
      ).toContain('portion');
      expect(
        errorRules(
          validateEntry(
            entry({ portions: [{ unit: 'head', grams: 1999, source: 'fdc-portion:1' }] }),
          ),
        ),
      ).toEqual([]);
    });
    it('rejects volume units, duplicate units and missing sources', () => {
      expect(
        errorRules(
          validateEntry(
            entry({ portions: [{ unit: 'cup', grams: 125, source: 'fdc-portion:1' }] }),
          ),
        ),
      ).toContain('portion');
      const dup = [
        { unit: 'slice', grams: 25, source: 'fdc-portion:1' },
        { unit: 'slice', grams: 30, source: 'fdc-portion:2' },
      ];
      expect(errorRules(validateEntry(entry({ portions: dup })))).toContain('portion');
      expect(
        errorRules(validateEntry(entry({ portions: [{ unit: 'slice', grams: 25, source: '' }] }))),
      ).toContain('portion');
    });
  });

  describe('count-portion', () => {
    it('warns for VEGETABLE/FRUIT/EGG/BREAD_BAKERY rows without a count portion', () => {
      for (const category of ['VEGETABLE', 'FRUIT', 'EGG', 'BREAD_BAKERY']) {
        expect(validateEntry(entry({ category }))).toEqual([
          expect.objectContaining({ rule: 'count-portion', severity: 'warning' }),
        ]);
      }
    });
    it('is satisfied by any canonical count unit and ignored for other categories', () => {
      expect(
        validateEntry(
          entry({
            category: 'FRUIT',
            portions: [{ unit: 'medium', grams: 118, source: 'fdc-portion:1' }],
          }),
        ),
      ).toEqual([]);
      expect(validateEntry(entry({ category: 'BEEF' }))).toEqual([]);
    });
  });

  describe('density', () => {
    it('warns when a volume-measured category has no density', () => {
      expect(validateEntry(entry({ category: 'OIL_FAT' }))).toEqual([
        expect.objectContaining({ rule: 'density', severity: 'warning' }),
      ]);
      expect(validateEntry(entry({ category: 'OIL_FAT', densityGPerMl: 0.913 }))).toEqual([]);
    });
    it('applies to grated/shredded cheese by slug', () => {
      expect(
        rules(validateEntry(entry({ category: 'DAIRY_CHEESE', slug: 'parmesan-grated' }))),
      ).toContain('density');
      expect(
        rules(validateEntry(entry({ category: 'DAIRY_CHEESE', slug: 'parmesan' }))),
      ).not.toContain('density');
    });
    it('density-range rejects implausible values', () => {
      expect(errorRules(validateEntry(entry({ densityGPerMl: 3 })))).toContain('density-range');
      expect(errorRules(validateEntry(entry({ densityGPerMl: 0.01 })))).toContain('density-range');
    });
  });

  it('edible-fraction must be in (0, 1]', () => {
    expect(errorRules(validateEntry(entry({ edibleFraction: 0 })))).toContain('edible-fraction');
    expect(errorRules(validateEntry(entry({ edibleFraction: 1.2 })))).toContain('edible-fraction');
    expect(validateEntry(entry({ edibleFraction: 0.68 }))).toEqual([]);
  });
});

describe('validateCatalog (cross-row)', () => {
  it('slug-unique', () => {
    const issues = validateCatalog([
      entry(),
      entry({ aliases: [{ alias: 'other', locale: 'en' }] }),
    ]);
    expect(errorRules(issues)).toContain('slug-unique');
  });

  it('alias-duplicate: an alias must map to exactly one row', () => {
    const issues = validateCatalog([entry({ slug: 'a' }), entry({ slug: 'b' })]);
    const dup = issues.filter((i) => i.rule === 'alias-duplicate');
    expect(dup.map((i) => i.slug)).toEqual(['a', 'b']);
    expect(dup[0]?.message).toContain('a, b');
  });

  it('alias-slug-collision: no alias equals another row’s slug (verbatim or hyphens as spaces)', () => {
    const issues = validateCatalog([
      entry({ slug: 'olive-oil', aliases: [{ alias: 'olive oil', locale: 'en' }] }),
      entry({ slug: 'salt', aliases: [{ alias: 'table salt', locale: 'en' }] }),
      entry({
        slug: 'olive-oil-extra-virgin',
        aliases: [
          { alias: 'salt', locale: 'en' },
          { alias: 'olive oil', locale: 'en' },
        ],
      }),
    ]);
    const collisions = issues.filter((i) => i.rule === 'alias-slug-collision');
    expect(collisions.map((i) => i.message)).toEqual([
      'alias "salt" equals the slug of "salt"',
      'alias "olive oil" equals the slug of "olive-oil"',
    ]);
  });

  it('an alias equal to its own slug is fine', () => {
    expect(
      validateCatalog([entry({ slug: 'salt', aliases: [{ alias: 'salt', locale: 'en' }] })]),
    ).toEqual([]);
  });

  it('summarizeIssues counts by severity and rule', () => {
    const s = summarizeIssues(validateCatalog([entry({ kcalPer100g: 300, category: 'FRUIT' })]));
    expect(s).toEqual({
      errors: 1,
      warnings: 1,
      infos: 0,
      byRule: {
        energy: { error: 1, warning: 0, info: 0 },
        'count-portion': { error: 0, warning: 1, info: 0 },
      },
    });
  });
});
