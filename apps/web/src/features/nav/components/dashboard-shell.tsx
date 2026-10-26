'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { GymSync } from '@/features/gym/workout/gym-sync';
import { PostUpgradeActivation } from '@/features/premium/components/PostUpgradeActivation';
import { useT } from '@/lib/i18n';
import type { Catalog } from '@chefer/i18n';
import { cn } from '@chefer/utils';
import { ModeProvider } from '../mode-context';
import { isFocusRoute, type AppMode, type NavLabelKey } from '../nav-items';
import { BottomNav } from './bottom-nav';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { SideBar } from './side-bar';
import { TopHeader } from './top-header';

type TitleKey = NavLabelKey | `nav.titles.${keyof Catalog['nav']['titles']}` | 'common.appName';

// Map route prefixes to page title keys (first match wins — specific before general)
const TITLE_MAP: [string, TitleKey][] = [
  ['/gym/workout', 'nav.titles.workout'],
  ['/gym/summary', 'nav.titles.workoutSummary'],
  ['/gym/setup', 'nav.titles.gymSetup'],
  ['/gym/settings', 'nav.items.gymSettings'],
  ['/gym/my-week', 'nav.titles.myWeek'],
  ['/gym/routine', 'nav.items.routine'],
  ['/gym/exercises', 'nav.items.exercises'],
  ['/gym/stats', 'nav.items.stats'],
  ['/gym', 'nav.titles.gym'],
  ['/meal-plan', 'nav.items.mealPlanner'],
  ['/recipes', 'nav.items.cookbook'],
  ['/ingredients', 'nav.titles.ingredients'],
  ['/shopping-list', 'nav.items.shop'],
  ['/pantry', 'nav.items.shop'],
  ['/tracker', 'nav.titles.tracker'],
  ['/progress', 'nav.items.progress'],
  ['/my-weeks', 'nav.items.myWeeks'],
  ['/history', 'nav.items.myWeeks'],
  ['/profile', 'nav.items.profile'],
  ['/preferences', 'nav.items.preferences'],
  ['/premium', 'nav.titles.premium'],
  ['/admin', 'nav.titles.admin'],
  // Trainer mode (trainer-mode.md §5.3); /trainer and a client's pages keep "Chefer".
  ['/trainer/today', 'nav.items.today'],
  ['/trainer/schedule', 'nav.items.schedule'],
  ['/trainer/clients', 'nav.items.clients'],
  ['/trainer/workouts', 'nav.items.workouts'],
  ['/trainer/settings', 'nav.items.trainerSettings'],
  ['/coaching/find', 'nav.titles.findTrainer'],
  ['/coaching/trainers', 'nav.titles.findTrainer'],
  ['/onboarding', 'nav.titles.getStarted'],
  ['/dashboard', 'nav.items.today'],
];

function getTitleKey(pathname: string): TitleKey {
  for (const [prefix, key] of TITLE_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return key;
  }
  return 'common.appName';
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
  const { t } = useT();
  const pathname = usePathname();
  const title = t(getTitleKey(pathname));
  const focus = isFocusRoute(pathname);
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
        {/* id="main" is the skip link's target (root layout). Browser-tab
            titles come from each route segment's `metadata` (F-X-1-1) — a
            client document.title effect here lost to Next's <title> on hard
            loads. */}
        <main
          id="main"
          tabIndex={-1}
          className={cn('flex-1 outline-none lg:overflow-y-auto lg:pb-0', !focus && 'pb-nav-safe')}
        >
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
