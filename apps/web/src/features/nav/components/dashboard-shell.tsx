'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GymSync } from '@/features/gym/workout/gym-sync';
import { PostUpgradeActivation } from '@/features/premium/components/PostUpgradeActivation';
import { cn } from '@chefer/utils';
import { ModeProvider } from '../mode-context';
import { isFocusRoute, type AppMode } from '../nav-items';
import { BottomNav } from './bottom-nav';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { SideBar } from './side-bar';
import { TopHeader } from './top-header';

// Map route prefixes to page titles (first match wins — specific before general)
const TITLE_MAP: [string, string][] = [
  ['/gym/workout', 'Workout'],
  ['/gym/summary', 'Workout summary'],
  ['/gym/setup', 'Gym setup'],
  ['/gym/settings', 'Gym settings'],
  ['/gym/routine', 'Routine'],
  ['/gym/exercises', 'Exercises'],
  ['/gym/stats', 'Stats'],
  ['/gym', 'Gym'],
  ['/meal-plan', 'Meal Planner'],
  ['/recipes', 'Recipes'],
  ['/ingredients', 'Ingredients'],
  ['/shopping-list', 'Shopping List'],
  ['/pantry', 'Pantry'],
  ['/tracker', 'Tracker'],
  ['/progress', 'Progress'],
  ['/history', 'History'],
  ['/profile', 'Profile'],
  ['/preferences', 'Preferences'],
  ['/premium', 'Premium'],
  ['/admin', 'Admin'],
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
  /** Mode from the `chefer_mode` cookie (read by the server layout), so SSR renders the right nav. */
  initialMode?: AppMode;
}

export function DashboardShell({ children, initialMode = 'food' }: DashboardShellProps) {
  return (
    <ModeProvider initialMode={initialMode}>
      <ShellFrame>{children}</ShellFrame>
    </ModeProvider>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = getTitle(pathname);
  const focus = isFocusRoute(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Dashboard pages are client components and can't export per-route
  // metadata, so browser-tab titles were a bare "Chefer" on most pages
  // (review F-5). The shell already knows every page's name.
  useEffect(() => {
    document.title = title === 'Chefer' ? 'Chefer' : `${title} | Chefer`;
  }, [title]);

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
        <main className={cn('flex-1 lg:overflow-y-auto lg:pb-0', !focus && 'pb-nav-safe')}>
          {children}
        </main>
      </div>

      {/* Focus routes (onboarding, cook mode) keep the screen for the task. */}
      {!focus && (
        <BottomNav
          className="lg:hidden"
          moreOpen={drawerOpen}
          onOpenMore={() => setDrawerOpen(true)}
        />
      )}
      <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      {/* "3 things to do first" after an upgrade (P-8) — shell-mounted so it
          survives the free-only upgrade button unmounting on tier flip. */}
      <PostUpgradeActivation />
      {/* Gym outbox: uploads finished workouts from any page (online / focus). */}
      <GymSync />
    </div>
  );
}
