import { describe, expect, it } from 'vitest';
import {
  findSafetyTaxonomyEntry,
  safetyPickerEntries,
  safetyTaxonomyEntriesByGroup,
} from './safety-taxonomy';

describe('allergy taxonomy (UX-ACC-06)', () => {
  const allergies = safetyTaxonomyEntriesByGroup('allergy');

  it('covers the EU-14 allergen groups', () => {
    expect(allergies.map((a) => a.id)).toEqual(
      expect.arrayContaining([
        'gluten',
        'crustaceans',
        'egg',
        'fish',
        'peanuts',
        'soy',
        'dairy',
        'tree-nuts',
        'celery',
        'mustard',
        'sesame',
        'sulphites',
        'lupin',
        'molluscs',
      ]),
    );
  });

  it('keeps every id that was already stored (ids and labels are additive-only)', () => {
    for (const [id, label] of [
      ['tree-nuts', 'Tree nuts'],
      ['peanuts', 'Peanuts'],
      ['dairy', 'Dairy'],
      ['egg', 'Eggs'],
      ['gluten', 'Gluten'],
      ['soy', 'Soy'],
      ['fish', 'Fish'],
      ['shellfish', 'Shellfish'],
      ['sesame', 'Sesame'],
    ] as const) {
      expect(findSafetyTaxonomyEntry(id)?.label).toBe(label);
    }
  });

  it('has unique ids, and no label or synonym claimed by two allergies', () => {
    expect(new Set(allergies.map((a) => a.id)).size).toBe(allergies.length);
    const seen = new Map<string, string>();
    for (const a of allergies) {
      for (const term of [a.label.toLowerCase(), ...a.synonyms.map((s) => s.toLowerCase())]) {
        const owner = seen.get(term);
        expect(owner === undefined || owner === a.id, `${term}: ${String(owner)} vs ${a.id}`).toBe(
          true,
        );
        seen.set(term, a.id);
      }
    }
  });
});

describe('safetyPickerEntries: legacy Shellfish is hidden for new picks (UX-ACC-06 follow-up)', () => {
  const ids = (selected: string[]) => safetyPickerEntries('allergy', selected).map((e) => e.id);

  it('keeps Shellfish in the taxonomy (matching and stored ids unchanged) but flags it legacy', () => {
    expect(findSafetyTaxonomyEntry('shellfish')).toMatchObject({
      group: 'allergy',
      label: 'Shellfish',
      hiddenForNewPicks: true,
    });
    expect(safetyTaxonomyEntriesByGroup('allergy').map((a) => a.id)).toContain('shellfish');
    expect(
      safetyTaxonomyEntriesByGroup('allergy')
        .filter((a) => a.hiddenForNewPicks)
        .map((a) => a.id),
    ).toEqual(['shellfish']);
  });

  it('omits Shellfish for a user who has not picked it, and offers Crustaceans and Molluscs', () => {
    expect(ids([])).not.toContain('shellfish');
    expect(ids(['peanuts'])).not.toContain('shellfish');
    expect(ids([])).toEqual(expect.arrayContaining(['crustaceans', 'molluscs']));
  });

  it('keeps Shellfish visible, in place, for a user who already has it', () => {
    const withShellfish = ids(['shellfish']);
    expect(withShellfish).toContain('shellfish');
    expect(withShellfish.length).toBe(ids([]).length + 1);
  });

  it('does not hide the dislike group Shellfish (only the allergy picker changes)', () => {
    expect(safetyPickerEntries('dislike', []).map((e) => e.id)).toContain('shellfish');
  });
});
