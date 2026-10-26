'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n';
import { Menu } from 'lucide-react';
import { pressControl } from '@chefer/ui';
import { cn } from '@chefer/utils';
import { useAppMode } from '../mode-context';
import { isItemActive } from '../nav-items';
import { modeSwapFade, NavCountBadge, NavCountText } from './nav-count-badge';

// ─── Mobile bottom tab bar ────────────────────────────────────────────────────
// The active mode's four primary destinations, in tab-bar order (Food puts
// Today in the middle), plus a "More" button that opens the nav drawer.
// Hidden at lg+, where the SideBar takes over.

interface BottomNavProps {
  onOpenMore: () => void;
  /** True while the drawer is open, so "More" reads as the active tab. */
  moreOpen?: boolean;
  className?: string;
}

export function BottomNav({ onOpenMore, moreOpen = false, className }: BottomNavProps) {
  const { t } = useT();
  const pathname = usePathname();
  const { mode, nav, navBadges, trainerModeAvailable } = useAppMode();

  // "More" also lights up when the current route lives inside the drawer.
  const isSecondaryRoute = nav.secondary.some((item) => isItemActive(pathname, item));
  const moreActive = moreOpen || isSecondaryRoute;

  return (
    <nav
      aria-label={t('nav.primary')}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-white/80',
        className,
      )}
    >
      <ul key={mode} className={cn('flex h-16', modeSwapFade(trainerModeAvailable))}>
        {nav.tabBar.map((item) => {
          const { href, labelKey, shortLabelKey, icon: Icon } = item;
          const active = isItemActive(pathname, item);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1',
                  pressControl,
                  active ? 'text-[#944a00]' : 'text-gray-500',
                )}
              >
                <span className="relative flex">
                  <Icon
                    className={cn('h-[22px] w-[22px]', active && 'stroke-[2.5]')}
                    aria-hidden="true"
                  />
                  <NavCountBadge
                    count={navBadges[href] ?? 0}
                    announce={false}
                    className="absolute -right-2.5 -top-1.5"
                  />
                </span>
                <span className="text-xs font-medium leading-none">
                  {t(shortLabelKey ?? labelKey)}
                </span>
                <NavCountText count={navBadges[href] ?? 0} />
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
              'flex h-full w-full flex-col items-center justify-center gap-1',
              pressControl,
              moreActive ? 'text-[#944a00]' : 'text-gray-500',
            )}
          >
            <Menu
              className={cn('h-[22px] w-[22px]', moreActive && 'stroke-[2.5]')}
              aria-hidden="true"
            />
            <span className="text-xs font-medium leading-none">{t('nav.more')}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
