import {
  Activity,
  BookOpen,
  CalendarDays,
  Carrot,
  Clock,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  TrendingUp,
  User,
  type LucideIcon,
} from 'lucide-react';

// ─── Navigation model ─────────────────────────────────────────────────────────
// Single source of truth shared by the desktop SideBar, the mobile BottomNav,
// and the mobile MobileNavDrawer. Adding a route here surfaces it everywhere.

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the bottom tab bar, where horizontal space is scarce. */
  shortLabel?: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { href: '/meal-plan', label: 'Meal Planner', shortLabel: 'Plan', icon: CalendarDays },
  { href: '/recipes', label: 'Recipes', icon: BookOpen },
  { href: '/ingredients', label: 'Ingredients', icon: Carrot },
  { href: '/shopping-list', label: 'Shopping List', shortLabel: 'Shop', icon: ShoppingCart },
  { href: '/tracker', label: 'Tracker', icon: Activity },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/history', label: 'History', icon: Clock },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/preferences', label: 'Preferences', icon: Settings },
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
  (href) => NAV_ITEMS.find((item) => item.href === href)!,
);

/** Everything not in the tab bar — rendered inside the mobile drawer. */
export const SECONDARY_NAV_ITEMS: readonly NavItem[] = NAV_ITEMS.filter(
  (item) => !PRIMARY_NAV_HREFS.includes(item.href as (typeof PRIMARY_NAV_HREFS)[number]),
);

/** Matches a route and its sub-routes, e.g. /recipes also lights up /recipes/42. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
