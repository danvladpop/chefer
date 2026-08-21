'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { useIsPremium } from '@/hooks/useIsPremium';
import { Sparkles, X } from 'lucide-react';
import { Drawer } from '@chefer/ui';
import { cn } from '@chefer/utils';
import { isNavItemActive, SECONDARY_NAV_ITEMS } from '../nav-items';

// ─── Mobile navigation drawer ─────────────────────────────────────────────────
// Holds the six destinations that don't fit in the bottom tab bar, plus the
// plan/upgrade footer that lives in the desktop sidebar.

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const isPremium = useIsPremium();

  // Navigating from inside the drawer should dismiss it. Keyed on pathname so
  // it fires after the route actually changes, not on click.
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close on route change only
  }, [pathname]);

  return (
    <Drawer open={open} onClose={onClose} label="More navigation">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">
            🍽️
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-[#944a00]">Chefer</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Secondary nav links */}
      <nav aria-label="More" className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        <ul className="space-y-0.5">
          {SECONDARY_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isNavItemActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  // Close immediately on tap. The pathname effect above is the
                  // safety net for programmatic navigation; this handles the
                  // case where the tapped route *is* the current route, where
                  // pathname never changes and the effect never fires.
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-[#fff3e8] text-[#944a00]'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Icon
                    className={cn('h-5 w-5 shrink-0', active ? 'text-[#944a00]' : 'text-gray-500')}
                    aria-hidden="true"
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Plan footer — mirrors the desktop sidebar */}
      <div className="shrink-0 border-t px-3 py-3 pb-safe">
        {isPremium === false && (
          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-3">
            <p className="text-xs font-semibold text-gray-800">Free plan</p>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
              Generic recipes only. Go premium for your personal AI chef.
            </p>
            <UpgradeButton className="mt-2 w-full" />
          </div>
        )}
        {isPremium === true && (
          <div className="flex items-center gap-2 rounded-xl bg-[#fff3e8] px-3 py-2">
            <Sparkles className="h-4 w-4 text-[#944a00]" />
            <span className="text-xs font-semibold text-[#944a00]">Premium plan</span>
          </div>
        )}
      </div>
    </Drawer>
  );
}
