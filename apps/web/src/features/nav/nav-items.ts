import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  Carrot,
  Clock,
  Dumbbell,
  LayoutDashboard,
  ListChecks,
  Refrigerator,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  User,
  type LucideIcon,
} from 'lucide-react';

// ─── Navigation model ─────────────────────────────────────────────────────────
// Single source of truth shared by the desktop SideBar, the mobile BottomNav,
// and the mobile MobileNavDrawer. Adding a route here surfaces it everywhere.
//
// Two modes (gym_plan.md D3): Food (the original app) and Gym. The shell shows
// one mode's items at a time; `deriveMode` decides which from the pathname and
// the `chefer_mode` cookie so the server renders the right nav with no flash.

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the bottom tab bar, where horizontal space is scarce. */
  shortLabel?: string;
  icon: LucideIcon;
  /**
   * Match `href` exactly instead of as a prefix. Gym "Today" lives at `/gym`,
   * which every other gym route starts with.
   */
  exact?: boolean;
  /** Extra route prefixes that also light this item up (e.g. the workout under Today). */
  alsoActiveFor?: readonly string[];
}

export const FOOD_NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { href: '/meal-plan', label: 'Meal Planner', shortLabel: 'Plan', icon: CalendarDays },
  { href: '/recipes', label: 'Recipes', icon: BookOpen },
  { href: '/ingredients', label: 'Ingredients', icon: Carrot },
  { href: '/shopping-list', label: 'Shopping List', shortLabel: 'Shop', icon: ShoppingCart },
  { href: '/pantry', label: 'Pantry', icon: Refrigerator },
  { href: '/tracker', label: 'Tracker', icon: Activity },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/history', label: 'History', icon: Clock },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/preferences', label: 'Preferences', icon: Settings },
] as const;

/** Alias of FOOD_NAV_ITEMS, kept for existing consumers (new code: navFor(mode)). */
export const NAV_ITEMS: readonly NavItem[] = FOOD_NAV_ITEMS;

/** Gym mode's tab bar (gym_plan.md D3): Today / Routine / Exercises / Stats. */
export const GYM_NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/gym',
    label: 'Today',
    icon: Sun,
    exact: true,
    alsoActiveFor: ['/gym/workout', '/gym/summary', '/gym/setup', '/gym/session'],
  },
  { href: '/gym/routine', label: 'Routine', icon: ListChecks },
  { href: '/gym/exercises', label: 'Exercises', icon: Dumbbell },
  { href: '/gym/stats', label: 'Stats', icon: BarChart3 },
] as const;

/** Gym destinations that live in the drawer / below the sidebar's main list. */
export const GYM_SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { href: '/gym/settings', label: 'Gym settings', icon: SlidersHorizontal },
] as const;

/**
 * The four destinations that get a permanent slot in the mobile tab bar. The
 * fifth slot is the "More" button, which opens the drawer holding the rest.
 */
export const PRIMARY_NAV_HREFS = [
  '/dashboard',
  '/meal-plan',
  '/recipes',
  '/shopping-list',
] as const;

export const PRIMARY_NAV_ITEMS: readonly NavItem[] = PRIMARY_NAV_HREFS.map(
  (href) => FOOD_NAV_ITEMS.find((item) => item.href === href)!,
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
  return (item.alsoActiveFor ?? []).some((prefix) => isNavItemActive(pathname, prefix));
}

// ─── Modes ────────────────────────────────────────────────────────────────────

export type AppMode = 'food' | 'gym';

/** Cookie holding the last mode used (read server-side by the dashboard layout). */
export const MODE_COOKIE = 'chefer_mode';

/** Where each mode's switch lands. */
export const MODE_HOME: Record<AppMode, string> = { food: '/dashboard', gym: '/gym' };

export function parseMode(value: string | null | undefined): AppMode | null {
  return value === 'food' || value === 'gym' ? value : null;
}

export function isGymPath(pathname: string): boolean {
  return isNavItemActive(pathname, '/gym');
}

/**
 * The mode a page belongs to. `/gym*` is always Gym; a Food destination is
 * always Food; routes that belong to neither (profile, preferences, premium,
 * admin …) keep whatever mode the user was last in (the cookie).
 */
export function modeOfPath(pathname: string): AppMode | null {
  if (isGymPath(pathname)) return 'gym';
  // Profile and Preferences are account pages both modes reach from the user
  // menu, so they must not force Food.
  const accountPages = ['/profile', '/preferences'];
  if (accountPages.some((href) => isNavItemActive(pathname, href))) return null;
  if (FOOD_NAV_ITEMS.some((item) => isNavItemActive(pathname, item.href))) return 'food';
  return null;
}

export function deriveMode(pathname: string, cookieMode: string | null | undefined): AppMode {
  return modeOfPath(pathname) ?? parseMode(cookieMode) ?? 'food';
}

export interface ModeNav {
  /** Every destination of the mode, in sidebar order. */
  all: readonly NavItem[];
  /** The tab bar's four slots. */
  primary: readonly NavItem[];
  /** The drawer's list. */
  secondary: readonly NavItem[];
}

export function navFor(mode: AppMode): ModeNav {
  if (mode === 'gym') {
    return {
      all: [...GYM_NAV_ITEMS, ...GYM_SECONDARY_NAV_ITEMS],
      primary: GYM_NAV_ITEMS,
      secondary: GYM_SECONDARY_NAV_ITEMS,
    };
  }
  return { all: FOOD_NAV_ITEMS, primary: PRIMARY_NAV_ITEMS, secondary: SECONDARY_NAV_ITEMS };
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
