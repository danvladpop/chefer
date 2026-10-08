import { LIBRARY_FILTER_GROUPS } from '@chefer/types';
import { MUSCLE_GROUP_FILTERS } from '../../src/features/gym/library-screens/exercise-filters';

// R-21: the "back" chip was the raw key, lowercase beside "Chest", "Quads"…
describe('exercise library muscle-group chips', () => {
  it('labels every group capitalised, including Back', () => {
    const labels = MUSCLE_GROUP_FILTERS.map((f) => f.label);
    expect(labels).toContain('Back');
    expect(labels).not.toContain('back');
    expect(labels).toHaveLength(Object.keys(LIBRARY_FILTER_GROUPS).length);
    for (const label of labels) {
      expect(label[0]).toBe(label[0]?.toUpperCase());
    }
  });
});
