import { describe, expect, it } from 'vitest';
import {
  isNavItemActive,
  NAV_ITEMS,
  PRIMARY_NAV_HREFS,
  PRIMARY_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
} from './nav-items';

describe('isNavItemActive', () => {
  it('matches the exact route', () => {
    expect(isNavItemActive('/recipes', '/recipes')).toBe(true);
  });

  it('matches sub-routes', () => {
    expect(isNavItemActive('/recipes/42', '/recipes')).toBe(true);
    expect(isNavItemActive('/recipes/42/edit', '/recipes')).toBe(true);
  });

  it('does not match sibling routes sharing a prefix', () => {
    // '/recipes-archive' starts with '/recipes' as a string but is a
    // different route — the check must be segment-aware.
    expect(isNavItemActive('/recipes-archive', '/recipes')).toBe(false);
  });

  it('does not match unrelated routes', () => {
    expect(isNavItemActive('/dashboard', '/recipes')).toBe(false);
  });
});

describe('nav item partitions', () => {
  it('primary items resolve, in tab-bar order', () => {
    expect(PRIMARY_NAV_ITEMS.map((i) => i.href)).toEqual([...PRIMARY_NAV_HREFS]);
  });

  it('primary and secondary partition NAV_ITEMS with no overlap', () => {
    const primary = new Set(PRIMARY_NAV_ITEMS.map((i) => i.href));
    for (const item of SECONDARY_NAV_ITEMS) {
      expect(primary.has(item.href)).toBe(false);
    }
    expect(PRIMARY_NAV_ITEMS.length + SECONDARY_NAV_ITEMS.length).toBe(NAV_ITEMS.length);
  });

  it('every item has a label and an icon', () => {
    for (const item of NAV_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon).toBeDefined();
    }
  });
});
