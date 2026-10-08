import { describe, expect, it } from 'vitest';
import { EXERCISE_CATALOG, LIBRARY_FILTER_GROUPS, MUSCLES } from '@chefer/types';
import { exerciseMatchesFilterGroup, LIBRARY_FILTER_GROUP_LABELS } from './volume';

describe('library muscle filters (plan-library-supersets L2)', () => {
  it('cover every muscle, so no exercise is unreachable by muscle', () => {
    const covered = new Set<string>(Object.values(LIBRARY_FILTER_GROUPS).flat());
    expect(MUSCLES.filter((m) => !covered.has(m))).toEqual([]);
  });

  it('put every curated strength exercise under at least one filter', () => {
    const groups = Object.keys(LIBRARY_FILTER_GROUPS) as (keyof typeof LIBRARY_FILTER_GROUPS)[];
    const orphans = EXERCISE_CATALOG.filter(
      (e) => e.primaryMuscles.length > 0 && !groups.some((g) => exerciseMatchesFilterGroup(e, g)),
    ).map((e) => e.id);
    expect(orphans).toEqual([]);
  });

  it('match primary muscles only', () => {
    const shrug = { primaryMuscles: ['traps' as const] };
    expect(exerciseMatchesFilterGroup(shrug, 'traps')).toBe(true);
    expect(exerciseMatchesFilterGroup({ primaryMuscles: ['chest' as const] }, 'triceps')).toBe(
      false,
    );
    expect(LIBRARY_FILTER_GROUP_LABELS['inner-outer-thighs']).toBe('Inner & outer thighs');
  });
});
