import { describe, expect, it } from 'vitest';
import {
  deriveMode,
  FOOD_EXTRA_ROUTES,
  FOOD_NAV_ITEMS,
  GYM_NAV_ITEMS,
  isFocusRoute,
  isGymPath,
  isItemActive,
  isNavItemActive,
  modeCookieString,
  NAV_ITEMS,
  navFor,
  parseMode,
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
    for (const item of [...NAV_ITEMS, ...GYM_NAV_ITEMS]) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon).toBeDefined();
    }
  });
});

describe('food IA (P2-2 / P2-8)', () => {
  const item = (href: string) => FOOD_NAV_ITEMS.find((i) => i.href === href)!;

  it('tab bar reads Today · Plan · Shop · Cookbook', () => {
    expect(PRIMARY_NAV_ITEMS.map((i) => i.shortLabel ?? i.label)).toEqual([
      'Today',
      'Plan',
      'Shop',
      'Cookbook',
    ]);
  });

  it('More holds Progress, My weeks, Profile and Preferences only', () => {
    expect(SECONDARY_NAV_ITEMS.map((i) => i.href)).toEqual([
      '/progress',
      '/my-weeks',
      '/profile',
      '/preferences',
    ]);
  });

  it('Tracker, Pantry, History and Ingredients left the nav', () => {
    for (const href of FOOD_EXTRA_ROUTES) {
      expect(FOOD_NAV_ITEMS.some((i) => i.href === href)).toBe(false);
    }
  });

  it('old routes light the tab that absorbed them', () => {
    expect(isItemActive('/tracker', item('/dashboard'))).toBe(true);
    expect(isItemActive('/pantry', item('/shopping-list'))).toBe(true);
    expect(isItemActive('/history/p1', item('/my-weeks'))).toBe(true);
    expect(isItemActive('/recipes/r1', item('/dashboard'))).toBe(false);
  });

  it('old routes still render in Food mode', () => {
    for (const href of FOOD_EXTRA_ROUTES) expect(deriveMode(href, 'gym')).toBe('food');
    expect(deriveMode('/my-weeks', 'gym')).toBe('food');
  });
});

describe('gym nav items', () => {
  it('has the four gym tabs in order', () => {
    expect(GYM_NAV_ITEMS.map((i) => i.href)).toEqual([
      '/gym',
      '/gym/routine',
      '/gym/exercises',
      '/gym/stats',
    ]);
  });

  it('keeps NAV_ITEMS as the food list for existing consumers', () => {
    expect(NAV_ITEMS).toBe(FOOD_NAV_ITEMS);
  });

  it('lights Today only on /gym and its workout loop, not on sibling tabs', () => {
    const today = GYM_NAV_ITEMS[0]!;
    expect(isItemActive('/gym', today)).toBe(true);
    expect(isItemActive('/gym/workout', today)).toBe(true);
    expect(isItemActive('/gym/summary/abc', today)).toBe(true);
    expect(isItemActive('/gym/routine', today)).toBe(false);
    expect(isItemActive('/gym/stats', today)).toBe(false);
  });

  it("navFor returns each mode's sets", () => {
    expect(navFor('food').primary).toBe(PRIMARY_NAV_ITEMS);
    expect(navFor('gym').primary).toBe(GYM_NAV_ITEMS);
    expect(navFor('gym').all.map((i) => i.href)).toContain('/gym/settings');
  });
});

describe('deriveMode', () => {
  it('treats every /gym route as gym, whatever the cookie says', () => {
    expect(deriveMode('/gym', 'food')).toBe('gym');
    expect(deriveMode('/gym/workout', null)).toBe('gym');
  });

  it('does not treat a /gym-prefixed sibling as gym', () => {
    expect(isGymPath('/gymnastics')).toBe(false);
  });

  it('treats food destinations as food, whatever the cookie says', () => {
    expect(deriveMode('/dashboard', 'gym')).toBe('food');
    expect(deriveMode('/recipes/42', 'gym')).toBe('food');
  });

  it('keeps the cookie mode on neutral pages (account, premium, admin)', () => {
    expect(deriveMode('/profile', 'gym')).toBe('gym');
    expect(deriveMode('/preferences', 'gym')).toBe('gym');
    expect(deriveMode('/premium', 'gym')).toBe('gym');
    expect(deriveMode('/profile', 'food')).toBe('food');
  });

  it('defaults to food with no or a garbage cookie', () => {
    expect(deriveMode('/premium', undefined)).toBe('food');
    expect(deriveMode('/premium', 'lol')).toBe('food');
    expect(parseMode('gym')).toBe('gym');
    expect(parseMode('GYM')).toBeNull();
  });

  it('builds a site-wide, long-lived cookie', () => {
    expect(modeCookieString('gym')).toMatch(/^chefer_mode=gym; Path=\/;/);
  });
});

describe('isFocusRoute', () => {
  it('covers onboarding and cook mode only', () => {
    expect(isFocusRoute('/onboarding')).toBe(true);
    expect(isFocusRoute('/recipes/r1/cook')).toBe(true);
    expect(isFocusRoute('/recipes/r1')).toBe(false);
    expect(isFocusRoute('/recipes')).toBe(false);
    expect(isFocusRoute(null)).toBe(false);
  });
});
