'use client';

import { usePathname } from 'next/navigation';
import { SideBar } from './side-bar';
import { TopHeader } from './top-header';

// Map route prefixes to page titles
const TITLE_MAP: Array<[string, string]> = [
  ['/meal-plan', 'Meal Planner'],
  ['/recipes', 'Recipes'],
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

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <SideBar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopHeader title={title} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
