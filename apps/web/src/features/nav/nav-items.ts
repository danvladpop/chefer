import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Dumbbell,
  House,
  ListChecks,
  Repeat,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Sun,
  Sunrise,
  TrendingUp,
  User,
  UserCog,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { Catalog } from '@chefer/i18n';

// ─── Navigation model ─────────────────────────────────────────────────────────
// Single source of truth shared by the desktop SideBar, the mobile BottomNav,
// and the mobile MobileNavDrawer. Adding a route here surfaces it everywhere.
//
// Two modes (gym_plan.md D3): Food (the original app) and Gym, plus a third,
// Trainer (docs/prd-2026-10/trainer-mode.md §5.3), for an active trainer with
// the `trainerMode` flag on. The shell shows one mode's items at a time;
// `deriveMode` decides which from the pathname and the `chefer_mode` cookie so
// the server renders the right nav with no flash. The functions are pure: the
// caller passes whether trainer mode is available (`NavOptions`).

/** A `nav.items.*` key: messages without placeholders, so `t(key)` needs no params. */
export type NavLabelKey = `nav.items.${keyof Catalog['nav']['items']}`;

export interface NavItem {
  href: string;
  /** Catalog key of the label, translated where the item renders. */
  labelKey: NavLabelKey;
  /** Shorter label for the bottom tab bar, where horizontal space is scarce. */
  shortLabelKey?: NavLabelKey;
  icon: LucideIcon;
  /**
   * Match `href` exactly instead of as a prefix. Gym "Today" lives at `/gym`,
   * which every other gym route starts with.
   */
  exact?: boolean;
  /** Extra route prefixes that also light this item up (e.g. the workout under Today). */
  alsoActiveFor?: readonly string[];
  /** Extra routes no prefix can name (Trainer Clients also lights on `/trainer/<clientId>`). */
  alsoActiveWhen?: (pathname: string) => boolean;
}

// Food IA (audit P2-2 / P2-8, PM review §5): Today · Plan · Shop · Cookbook
// in the tab bar, the rest in More. Today merges Home and the Tracker, Shop
// is the plan's list (FB7-10 retired its "In my kitchen" pantry segment), My
// weeks holds history + saved weeks.
// Old routes keep working: /tracker lights Today, /pantry redirects to
// Shop, /history redirects to My weeks, /ingredients stays
// reachable by URL (FOOD_EXTRA_ROUTES) but leaves the nav.
export const FOOD_NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/dashboard',
    labelKey: 'nav.items.today',
    icon: Sunrise,
    alsoActiveFor: ['/tracker'],
  },
  {
    href: '/meal-plan',
    labelKey: 'nav.items.mealPlanner',
    shortLabelKey: 'nav.items.plan',
    icon: CalendarDays,
  },
  {
    href: '/shopping-list',
    labelKey: 'nav.items.shop',
    icon: ShoppingCart,
    alsoActiveFor: ['/pantry'],
  },
  { href: '/recipes', labelKey: 'nav.items.cookbook', icon: BookOpen },
  { href: '/progress', labelKey: 'nav.items.progress', icon: TrendingUp },
  { href: '/my-weeks', labelKey: 'nav.items.myWeeks', icon: Repeat, alsoActiveFor: ['/history'] },
  { href: '/profile', labelKey: 'nav.items.profile', icon: User },
  { href: '/preferences', labelKey: 'nav.items.preferences', icon: Settings },
] as const;

/**
 * Food routes that are not nav destinations any more but must still render
 * in Food mode (deep links, old bookmarks).
 */
export const FOOD_EXTRA_ROUTES = ['/tracker', '/pantry', '/history', '/ingredients'] as const;

/** Alias of FOOD_NAV_ITEMS, kept for existing consumers (new code: navFor(mode)). */
export const NAV_ITEMS: readonly NavItem[] = FOOD_NAV_ITEMS;

/** Gym mode's tab bar (gym_plan.md D3): Today / Routine / Exercises / Stats. */
export const GYM_NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/gym',
    labelKey: 'nav.items.today',
    icon: Sun,
    exact: true,
    alsoActiveFor: ['/gym/workout', '/gym/summary', '/gym/setup', '/gym/session'],
  },
  { href: '/gym/routine', labelKey: 'nav.items.routine', icon: ListChecks },
  { href: '/gym/exercises', labelKey: 'nav.items.exercises', icon: Dumbbell },
  { href: '/gym/stats', labelKey: 'nav.items.stats', icon: BarChart3 },
] as const;

/** Gym destinations that live in the drawer / below the sidebar's main list. */
export const GYM_SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { href: '/gym/settings', labelKey: 'nav.items.gymSettings', icon: SlidersHorizontal },
] as const;

/**
 * Trainer coaching (WP-18): shown in both modes' secondary list (the sidebar's
 * lower group, the phone's More drawer) only to a user whose trainer tools are
 * on. Not part of any mode's static list, so it never shows by default.
 */
export const TRAINER_NAV_ITEM: NavItem = {
  href: '/trainer',
  labelKey: 'nav.items.clients',
  icon: UsersRound,
};

// ─── Trainer mode (trainer-mode.md §5.3) ──────────────────────────────────────

/** `/trainer/<segment>` routes that are trainer-mode tabs, not a client id. */
export const TRAINER_MODE_SEGMENTS = [
  'today',
  'schedule',
  'clients',
  'workouts',
  'settings',
  // M3: booking detail and the coached workout logger are not client ids.
  'bookings',
  'coach',
] as const;

/** `/trainer/<clientId>` and its sub-routes (client detail, routine editor). */
export function isTrainerClientPath(pathname: string): boolean {
  const segment = /^\/trainer\/([^/]+)/.exec(pathname)?.[1];
  if (segment === undefined) return false;
  return !(TRAINER_MODE_SEGMENTS as readonly string[]).includes(segment);
}

/** Trainer mode in sidebar order: Today first. */
export const TRAINER_MODE_NAV_ITEMS: readonly NavItem[] = [
  { href: '/trainer/today', labelKey: 'nav.items.today', icon: House },
  {
    href: '/trainer/schedule',
    labelKey: 'nav.items.schedule',
    icon: CalendarDays,
    // Booking detail and the coached logger belong to the calendar (M3).
    alsoActiveFor: ['/trainer/bookings', '/trainer/coach'],
  },
  {
    href: '/trainer/clients',
    labelKey: 'nav.items.clients',
    icon: UsersRound,
    alsoActiveWhen: isTrainerClientPath,
  },
  { href: '/trainer/workouts', labelKey: 'nav.items.workouts', icon: Dumbbell },
] as const;

/** The phone tab bar: Today in the middle, as in Food mode and the mobile app (§5.3). */
export const TRAINER_MODE_TAB_BAR_HREFS = [
  '/trainer/schedule',
  '/trainer/clients',
  '/trainer/today',
  '/trainer/workouts',
] as const;

export const TRAINER_MODE_TAB_BAR_ITEMS: readonly NavItem[] = TRAINER_MODE_TAB_BAR_HREFS.map(
  (href) => TRAINER_MODE_NAV_ITEMS.find((item) => item.href === href)!,
);

/** Trainer mode's drawer / lower sidebar group (trainer You on web, §6.8). */
export const TRAINER_MODE_SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { href: '/trainer/settings', labelKey: 'nav.items.trainerSettings', icon: UserCog },
  { href: '/profile', labelKey: 'nav.items.profile', icon: User },
] as const;

/**
 * The four destinations that get a permanent slot in the mobile tab bar. The
 * fifth slot is the "More" button, which opens the drawer holding the rest.
 */
export const PRIMARY_NAV_HREFS = [
  '/dashboard',
  '/meal-plan',
  '/shopping-list',
  '/recipes',
] as const;

export const PRIMARY_NAV_ITEMS: readonly NavItem[] = PRIMARY_NAV_HREFS.map(
  (href) => FOOD_NAV_ITEMS.find((item) => item.href === href)!,
);

/**
 * The same four in the phone tab bar's order: Today in the middle (owner
 * feedback 2026-10-17, F4 — "that is the core of the app, not the Shop"),
 * matching the mobile app. The sidebar keeps PRIMARY_NAV_ITEMS, Today first.
 */
export const TAB_BAR_NAV_HREFS = [
  '/shopping-list',
  '/meal-plan',
  '/dashboard',
  '/recipes',
] as const;

export const TAB_BAR_NAV_ITEMS: readonly NavItem[] = TAB_BAR_NAV_HREFS.map(
  (href) => PRIMARY_NAV_ITEMS.find((item) => item.href === href)!,
);

/** Everything not in the tab bar — rendered inside the mobile drawer. */
export const SECONDARY_NAV_ITEMS: readonly NavItem[] = FOOD_NAV_ITEMS.filter(
  (item) => !PRIMARY_NAV_HREFS.includes(item.href as (typeof PRIMARY_NAV_HREFS)[number]),
);

/** Matches a route and its sub-routes, e.g. /recipes also lights up /recipes/42. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Item-aware active check (honours `exact` and `alsoActiveFor`). */
export function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact ? pathname === item.href : isNavItemActive(pathname, item.href)) {
    return true;
  }
  if (item.alsoActiveWhen?.(pathname)) return true;
  return (item.alsoActiveFor ?? []).some((prefix) => isNavItemActive(pathname, prefix));
}

// ─── Modes ────────────────────────────────────────────────────────────────────

export type AppMode = 'food' | 'gym' | 'trainer';

/**
 * Whether trainer mode is available to the user (flag on + trainer tools
 * active; `isTrainerModeAvailable`). Off, everything behaves as before trainer
 * mode existed: `/trainer*` is neutral and a remembered `trainer` reads as food.
 */
export interface NavOptions {
  trainerMode?: boolean;
}

/** Cookie holding the last mode used (read server-side by the dashboard layout). */
export const MODE_COOKIE = 'chefer_mode';

/** Where each mode's switch lands. */
export const MODE_HOME: Record<AppMode, string> = {
  food: '/dashboard',
  gym: '/gym',
  trainer: '/trainer/today',
};

export function parseMode(value: string | null | undefined): AppMode | null {
  return value === 'food' || value === 'gym' || value === 'trainer' ? value : null;
}

/**
 * The remembered mode, if it may still be used: a `trainer` cookie falls back
 * to none (so food) once trainer mode is gone (§5.1 "Losing trainer status").
 */
export function rememberedMode(
  value: string | null | undefined,
  opts: NavOptions = {},
): AppMode | null {
  const mode = parseMode(value);
  return mode === 'trainer' && !opts.trainerMode ? null : mode;
}

export function isGymPath(pathname: string): boolean {
  return isNavItemActive(pathname, '/gym');
}

/**
 * The mode a page belongs to. `/gym*` is always Gym; a Food destination is
 * always Food; `/trainer*` is Trainer while trainer mode is available; routes
 * that belong to none (profile, preferences, premium, admin …) keep whatever
 * mode the user was last in (the cookie).
 */
export function modeOfPath(pathname: string, opts: NavOptions = {}): AppMode | null {
  if (isGymPath(pathname)) return 'gym';
  if (opts.trainerMode && isNavItemActive(pathname, '/trainer')) return 'trainer';
  // Profile and Preferences are account pages both modes reach from the user
  // menu, so they must not force Food.
  const accountPages = ['/profile', '/preferences'];
  if (accountPages.some((href) => isNavItemActive(pathname, href))) return null;
  if (FOOD_NAV_ITEMS.some((item) => isNavItemActive(pathname, item.href))) return 'food';
  if (FOOD_EXTRA_ROUTES.some((href) => isNavItemActive(pathname, href))) return 'food';
  return null;
}

export function deriveMode(
  pathname: string,
  cookieMode: string | null | undefined,
  opts: NavOptions = {},
): AppMode {
  return modeOfPath(pathname, opts) ?? rememberedMode(cookieMode, opts) ?? 'food';
}

export interface ModeNav {
  /** Every destination of the mode, in sidebar order. */
  all: readonly NavItem[];
  /** The mode's main destinations, in sidebar order. */
  primary: readonly NavItem[];
  /** The same destinations in the phone tab bar's four slots. */
  tabBar: readonly NavItem[];
  /** The drawer's list. */
  secondary: readonly NavItem[];
}

export function navFor(mode: AppMode, opts: { trainer?: boolean } & NavOptions = {}): ModeNav {
  if (mode === 'trainer') {
    return {
      all: [...TRAINER_MODE_NAV_ITEMS, ...TRAINER_MODE_SECONDARY_NAV_ITEMS],
      primary: TRAINER_MODE_NAV_ITEMS,
      tabBar: TRAINER_MODE_TAB_BAR_ITEMS,
      secondary: TRAINER_MODE_SECONDARY_NAV_ITEMS,
    };
  }
  // With trainer mode available the Trainer segment replaces "Clients" (§5.3).
  const extra = opts.trainer && !opts.trainerMode ? [TRAINER_NAV_ITEM] : [];
  if (mode === 'gym') {
    return {
      all: [...GYM_NAV_ITEMS, ...GYM_SECONDARY_NAV_ITEMS, ...extra],
      primary: GYM_NAV_ITEMS,
      tabBar: GYM_NAV_ITEMS,
      secondary: [...GYM_SECONDARY_NAV_ITEMS, ...extra],
    };
  }
  return {
    all: [...FOOD_NAV_ITEMS, ...extra],
    primary: PRIMARY_NAV_ITEMS,
    tabBar: TAB_BAR_NAV_ITEMS,
    secondary: [...SECONDARY_NAV_ITEMS, ...extra],
  };
}

/** `document.cookie` assignment string for the mode (1 year, whole site). */
export function modeCookieString(mode: AppMode): string {
  return `${MODE_COOKIE}=${mode}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/**
 * Task-focused routes that hide the bottom tab bar (and the chat button) on
 * phones: onboarding, whose sticky Continue/Finish sat under the tab bar and
 * the chat button (audit F-ONB-1-2), and cook mode, whose Back/Next landed
 * below the fold (F-REC-6-1).
 */
export function isFocusRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === '/onboarding' || /^\/recipes\/[^/]+\/cook\/?$/.test(pathname);
}
