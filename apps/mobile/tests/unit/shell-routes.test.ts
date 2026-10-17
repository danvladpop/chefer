import { isShellV2TabPath, shellV2PathFor } from '../../src/features/shell/shell-routes';

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

describe('isShellV2TabPath', () => {
  it('knows the new tabs and nothing else', () => {
    expect(isShellV2TabPath('/you')).toBe(true);
    expect(isShellV2TabPath('/home')).toBe(true);
    expect(isShellV2TabPath('/settings')).toBe(false);
    expect(isShellV2TabPath('/more')).toBe(false);
  });
});
