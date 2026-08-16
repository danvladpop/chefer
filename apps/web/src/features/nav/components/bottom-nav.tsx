'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { cn } from '@chefer/utils';
import { isNavItemActive, PRIMARY_NAV_ITEMS, SECONDARY_NAV_ITEMS } from '../nav-items';

// ─── Mobile bottom tab bar ────────────────────────────────────────────────────
// Four primary destinations plus a "More" button that opens the nav drawer.
// Hidden at lg+, where the SideBar takes over.

interface BottomNavProps {
  onOpenMore: () => void;
  /** True while the drawer is open, so "More" reads as the active tab. */
  moreOpen?: boolean;
  className?: string;
}

export function BottomNav({ onOpenMore, moreOpen = false, className }: BottomNavProps) {
  const pathname = usePathname();

  // "More" also lights up when the current route lives inside the drawer.
  const isSecondaryRoute = SECONDARY_NAV_ITEMS.some((item) => isNavItemActive(pathname, item.href));
  const moreActive = moreOpen || isSecondaryRoute;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-white/80',
        className,
      )}
    >
      <ul className="flex h-16">
        {PRIMARY_NAV_ITEMS.map(({ href, label, shortLabel, icon: Icon }) => {
          const active = isNavItemActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 transition-colors',
                  active ? 'text-[#944a00]' : 'text-gray-500',
                )}
              >
                <Icon
                  className={cn('h-[22px] w-[22px]', active && 'stroke-[2.5]')}
                  aria-hidden="true"
                />
                <span className="text-[11px] font-medium leading-none">{shortLabel ?? label}</span>
              </Link>
            </li>
          );
        })}

        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenMore}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={cn(
              'flex h-full w-full flex-col items-center justify-center gap-1 transition-colors',
              moreActive ? 'text-[#944a00]' : 'text-gray-500',
            )}
          >
            <Menu
              className={cn('h-[22px] w-[22px]', moreActive && 'stroke-[2.5]')}
              aria-hidden="true"
            />
            <span className="text-[11px] font-medium leading-none">More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
