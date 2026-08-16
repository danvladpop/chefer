'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { BottomNav } from './bottom-nav';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { SideBar } from './side-bar';
import { TopHeader } from './top-header';

// Map route prefixes to page titles
const TITLE_MAP: Array<[string, string]> = [
  ['/meal-plan', 'Meal Planner'],
  ['/recipes', 'Recipes'],
  ['/ingredients', 'Ingredients'],
  ['/shopping-list', 'Shopping List'],
  ['/tracker', 'Tracker'],
  ['/progress', 'Progress'],
  ['/history', 'History'],
  ['/profile', 'Profile'],
  ['/preferences', 'Preferences'],
  ['/onboarding', 'Get Started'],
  ['/dashboard', 'Dashboard'],
];

function getTitle(pathname: string): string {
  for (const [prefix, label] of TITLE_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return label;
  }
  return 'Chefer';
}

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const title = getTitle(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    // Two layout modes. Below lg the *document* scrolls: that is what lets iOS
    // Safari auto-hide its URL bar, keeps momentum scrolling native, and lets
    // the browser restore scroll position on back-navigation. At lg+ we keep
    // the original fixed shell where only <main> scrolls.
    <div className="flex min-h-dvh bg-gray-50 lg:h-dvh lg:overflow-hidden">
      <SideBar className="hidden lg:flex" />

      {/* min-w-0 is load-bearing: without it a wide child (the meal-plan grid,
          a long recipe name) stretches this flex item past the viewport and
          the whole page scrolls sideways. */}
      <div className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
        <TopHeader title={title} onOpenMenu={() => setDrawerOpen(true)} />

        {/* Bottom padding clears the fixed tab bar + home indicator so the last
            element on every page stays reachable. */}
        <main className="flex-1 pb-nav-safe lg:overflow-y-auto lg:pb-0">{children}</main>
      </div>

      <BottomNav
        className="lg:hidden"
        moreOpen={drawerOpen}
        onOpenMore={() => setDrawerOpen(true)}
      />
      <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
