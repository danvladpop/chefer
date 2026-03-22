'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  ShoppingCart,
  Activity,
  TrendingUp,
  Clock,
  User,
  Settings,
} from 'lucide-react';
import { cn } from '@chefer/utils';

// ─── Navigation Items ─────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/meal-plan', label: 'Meal Planner', icon: CalendarDays },
  { href: '/recipes', label: 'Recipes', icon: BookOpen },
  { href: '/shopping-list', label: 'Shopping List', icon: ShoppingCart },
  { href: '/tracker', label: 'Tracker', icon: Activity },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/history', label: 'History', icon: Clock },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/preferences', label: 'Preferences', icon: Settings },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function SideBar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <span className="text-xl" aria-hidden="true">🍽️</span>
        <span className="text-[15px] font-semibold tracking-tight text-[#944a00]">Chefer</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-[#fff3e8] text-[#944a00]'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Icon
                    className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-[#944a00]' : 'text-gray-400')}
                    aria-hidden="true"
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer spacer */}
      <div className="h-4" />
    </aside>
  );
}
