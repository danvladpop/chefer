'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FeedbackNavButton } from '@/features/feedback/components/FeedbackDialog';
import { PlanFooterCard } from '@/features/premium/components/PlanFooterCard';
import { cn } from '@chefer/utils';
import { useAppMode } from '../mode-context';
import { isItemActive } from '../nav-items';
import { ModeSwitch } from './mode-switch';

// ─── Component ────────────────────────────────────────────────────────────────
// Desktop-only (lg+) full navigation rail. Below lg the BottomNav and
// MobileNavDrawer cover the same destinations — all three read the active
// mode's items (navFor), and each carries the Food | Gym switch.

interface SideBarProps {
  className?: string;
}

export function SideBar({ className }: SideBarProps) {
  const pathname = usePathname();
  const { nav } = useAppMode();

  return (
    <aside className={cn('flex h-dvh w-56 shrink-0 flex-col border-r bg-white', className)}>
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <span className="text-xl" aria-hidden="true">
          🍽️
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-[#944a00]">Chefer</span>
      </div>

      {/* Food | Gym (gym_plan.md D3) */}
      <div className="border-b px-3 py-3">
        <ModeSwitch />
      </div>

      {/* Nav links */}
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {nav.all.map((item) => {
            const { href, label, icon: Icon } = item;
            const isActive = isItemActive(pathname, item);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-[#fff3e8] text-[#944a00]'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0',
                      isActive ? 'text-[#944a00]' : 'text-gray-500',
                    )}
                    aria-hidden="true"
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Beta feedback — every tester needs a way to tell us things */}
      <div className="border-t px-3 py-2">
        <FeedbackNavButton />
      </div>

      {/* Plan footer — dismissible upgrade card for free users, badge for premium */}
      <div className="border-t px-3 py-3">
        <PlanFooterCard source="sidebar" />
      </div>
    </aside>
  );
}
