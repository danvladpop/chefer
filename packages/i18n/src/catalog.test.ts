import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@chefer/types';
import { catalogs } from './catalog';
import { en } from './catalog/en';
import { PLURAL_CATEGORIES } from './plural';
import { roReviewStatus } from './review-status';

// ─── Catalog check (CI) ──────────────────────────────────────────────────────
// TypeScript already rejects a locale that misses or adds a key. This test is
// the runtime half: placeholders match, plural forms are complete, and the
// Romanian text uses the correct diacritics.

type Leaf = { path: string; value: string | Record<string, string> };

function leaves(node: unknown, prefix = ''): Leaf[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  const obj = node as Record<string, unknown>;
  if ('other' in obj) return [{ path: prefix, value: obj as Record<string, string> }];
  return Object.entries(obj).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const sourceLeaves = leaves(en);

describe.each(SUPPORTED_LOCALES.filter((l) => l !== 'en'))('%s catalog', (locale) => {
  const target = new Map(leaves(catalogs[locale]).map((l) => [l.path, l.value]));

  it('has every English key and no others', () => {
    expect([...target.keys()].sort()).toEqual(sourceLeaves.map((l) => l.path).sort());
  });

  it.each(sourceLeaves.map((l) => [l.path, l.value] as const))(
    '%s keeps the English placeholders',
    (path, source) => {
      const translated = target.get(path);
      expect(translated).toBeDefined();
      const sourceForms = typeof source === 'string' ? [source] : Object.values(source);
      const targetForms =
        typeof translated === 'string' ? [translated] : Object.values(translated ?? {});
      const expected = [...new Set(sourceForms.flatMap(placeholders))].sort();
      for (const form of targetForms) {
        // A plural form may drop {count} ("one" can spell the number out),
        // but may never invent a placeholder the caller does not pass.
        for (const p of placeholders(form)) expect(expected).toContain(p);
      }
      const used = [...new Set(targetForms.flatMap(placeholders))].sort();
      expect(used).toEqual(expected.filter((p) => p !== 'count' || used.includes('count')));
    },
  );
});

describe.each(SUPPORTED_LOCALES)('%s plural forms', (locale: SupportedLocale) => {
  it('spells out every plural category the language uses, and no others', () => {
    for (const leaf of leaves(catalogs[locale])) {
      if (typeof leaf.value === 'string') continue;
      expect(Object.keys(leaf.value).sort(), leaf.path).toEqual(
        [...PLURAL_CATEGORIES[locale]].sort(),
      );
    }
  });

  it('has no empty messages', () => {
    for (const leaf of leaves(catalogs[locale])) {
      const forms = typeof leaf.value === 'string' ? [leaf.value] : Object.values(leaf.value);
      for (const form of forms) expect(form.trim(), leaf.path).not.toBe('');
    }
  });
});

describe('Romanian text', () => {
  it('uses ș and ț with a comma below, never the cedilla look-alikes ş ţ', () => {
    for (const leaf of leaves(catalogs.ro)) {
      const forms = typeof leaf.value === 'string' ? [leaf.value] : Object.values(leaf.value);
      for (const form of forms) expect(form, leaf.path).not.toMatch(/[şţŞŢ]/);
    }
  });

  it('uses Romanian quotation marks „…”', () => {
    for (const leaf of leaves(catalogs.ro)) {
      const forms = typeof leaf.value === 'string' ? [leaf.value] : Object.values(leaf.value);
      for (const form of forms) expect(form, leaf.path).not.toMatch(/"/);
    }
  });

  it('every namespace has a review status', () => {
    expect(Object.keys(roReviewStatus).sort()).toEqual(Object.keys(en).sort());
  });
});
