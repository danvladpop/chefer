import { shellTabsFor, shellV2PathFor } from '../../src/features/shell/shell-routes';

describe('shellTabsFor', () => {
  it('shows every tab when the jobs question was never answered', () => {
    expect(shellTabsFor([], false)).toEqual({
      home: true,
      plan: true,
      shop: true,
      train: true,
      you: true,
    });
  });

  it('hides Plan and Shop for someone who only trains', () => {
    expect(shellTabsFor(['TRAIN'], true)).toMatchObject({ plan: false, shop: false, train: true });
  });

  it('hides Train for a food-only account without a gym profile', () => {
    expect(shellTabsFor(['PLAN_MEALS', 'TRACK'], false)).toMatchObject({
      plan: true,
      shop: true,
      train: false,
    });
  });

  it('keeps Train for a food-only account that set training up anyway', () => {
    expect(shellTabsFor(['PLAN_MEALS'], true).train).toBe(true);
  });
});

describe('shellV2PathFor', () => {
  it('maps every old tab to its new home', () => {
    expect(shellV2PathFor('/')).toBe('/home');
    expect(shellV2PathFor('/meal-plan')).toBe('/plan');
    expect(shellV2PathFor('/recipes')).toBe('/cookbook');
    expect(shellV2PathFor('/gym-more')).toBe('/you');
    expect(shellV2PathFor('/routine')).toBe('/training/routine');
  });

  it('leaves anything else alone', () => {
    expect(shellV2PathFor('/recipe/abc')).toBeNull();
  });
});
