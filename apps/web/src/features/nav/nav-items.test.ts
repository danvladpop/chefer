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
  isTrainerClientPath,
  MODE_HOME,
  modeCookieString,
  modeOfPath,
  NAV_ITEMS,
  navFor,
  parseMode,
  PRIMARY_NAV_HREFS,
  PRIMARY_NAV_ITEMS,
  rememberedMode,
  SECONDARY_NAV_ITEMS,
  TRAINER_MODE_NAV_ITEMS,
  TRAINER_NAV_ITEM,
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

  it('the sidebar lists Today · Plan · Shop · Cookbook first', () => {
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

describe('trainer nav item (WP-18)', () => {
  it('is absent by default in both modes', () => {
    for (const mode of ['food', 'gym'] as const) {
      expect(navFor(mode).all).not.toContain(TRAINER_NAV_ITEM);
      expect(navFor(mode).secondary).not.toContain(TRAINER_NAV_ITEM);
    }
  });

  it('joins the secondary list (sidebar lower group, phone More) for an active trainer, never the tab bar', () => {
    for (const mode of ['food', 'gym'] as const) {
      const nav = navFor(mode, { trainer: true });
      expect(nav.secondary.at(-1)).toBe(TRAINER_NAV_ITEM);
      expect(nav.all).toContain(TRAINER_NAV_ITEM);
      expect(nav.primary).not.toContain(TRAINER_NAV_ITEM);
    }
    expect(TRAINER_NAV_ITEM).toMatchObject({ href: '/trainer', label: 'Clients' });
  });

  it('does not change which mode a trainer route belongs to', () => {
    expect(deriveMode('/trainer/abc', 'gym')).toBe('gym');
    expect(deriveMode('/trainer', 'food')).toBe('food');
  });
});

describe('trainer mode (trainer-mode.md §5.3)', () => {
  const on = { trainerMode: true };
  const labels = (items: readonly { label: string }[]) => items.map((i) => i.label);

  it('the sidebar lists Today · Schedule · Clients · Workouts, then Trainer settings and Profile', () => {
    const nav = navFor('trainer', { trainer: true, ...on });
    expect(nav.primary.map((i) => i.href)).toEqual([
      '/trainer/today',
      '/trainer/schedule',
      '/trainer/clients',
      '/trainer/workouts',
    ]);
    expect(nav.secondary.map((i) => i.href)).toEqual(['/trainer/settings', '/profile']);
    expect(labels(nav.secondary)).toEqual(['Trainer settings', 'Profile']);
    expect(nav.all).not.toContain(TRAINER_NAV_ITEM);
  });

  it('the phone tab bar puts Today in the middle: Schedule · Clients · Today · Workouts', () => {
    expect(labels(navFor('trainer', on).tabBar)).toEqual([
      'Schedule',
      'Clients',
      'Today',
      'Workouts',
    ]);
  });

  it('lands on Trainer Today', () => {
    expect(MODE_HOME.trainer).toBe('/trainer/today');
  });

  it('Clients also lights up on a client and their routine, not on the other tabs', () => {
    const clients = TRAINER_MODE_NAV_ITEMS.find((i) => i.href === '/trainer/clients')!;
    expect(isItemActive('/trainer/clients', clients)).toBe(true);
    expect(isItemActive('/trainer/c1', clients)).toBe(true);
    expect(isItemActive('/trainer/c1/routine', clients)).toBe(true);
    expect(isItemActive('/trainer/today', clients)).toBe(false);
    expect(isItemActive('/trainer', clients)).toBe(false);
    expect(isTrainerClientPath('/trainer/settings')).toBe(false);
    expect(isTrainerClientPath('/trainers/x')).toBe(false);
  });

  it('booking detail and the coached logger light up Schedule, not Clients (M3)', () => {
    const clients = TRAINER_MODE_NAV_ITEMS.find((i) => i.href === '/trainer/clients')!;
    const schedule = TRAINER_MODE_NAV_ITEMS.find((i) => i.href === '/trainer/schedule')!;
    for (const path of ['/trainer/bookings/b1', '/trainer/coach/b1']) {
      expect(isItemActive(path, clients)).toBe(false);
      expect(isItemActive(path, schedule)).toBe(true);
    }
  });

  it('replaces "Clients" in the Food and Gym secondary lists', () => {
    for (const mode of ['food', 'gym'] as const) {
      expect(navFor(mode, { trainer: true, ...on }).secondary).not.toContain(TRAINER_NAV_ITEM);
      expect(navFor(mode, { trainer: true, ...on }).all).not.toContain(TRAINER_NAV_ITEM);
    }
  });

  it('every /trainer route is Trainer while trainer mode is available', () => {
    for (const path of ['/trainer', '/trainer/today', '/trainer/clients', '/trainer/c1/routine']) {
      expect(modeOfPath(path, on)).toBe('trainer');
      expect(deriveMode(path, 'gym', on)).toBe('trainer');
    }
    expect(modeOfPath('/trainers', on)).toBeNull();
    expect(deriveMode('/gym', 'trainer', on)).toBe('gym');
    expect(deriveMode('/dashboard', 'trainer', on)).toBe('food');
  });

  it('neutral pages keep a remembered trainer mode', () => {
    expect(deriveMode('/profile', 'trainer', on)).toBe('trainer');
    expect(deriveMode('/premium', 'trainer', on)).toBe('trainer');
  });

  it('without trainer mode, /trainer stays neutral and a trainer cookie falls back to food (§5.1)', () => {
    expect(modeOfPath('/trainer/today')).toBeNull();
    expect(deriveMode('/trainer/today', 'gym')).toBe('gym');
    expect(deriveMode('/profile', 'trainer')).toBe('food');
    expect(deriveMode('/trainer', 'trainer', { trainerMode: false })).toBe('food');
    expect(rememberedMode('trainer')).toBeNull();
    expect(rememberedMode('trainer', on)).toBe('trainer');
    expect(rememberedMode('gym')).toBe('gym');
  });

  it('parses and writes a trainer cookie', () => {
    expect(parseMode('trainer')).toBe('trainer');
    expect(modeCookieString('trainer')).toMatch(/^chefer_mode=trainer; Path=\/;/);
  });
});
