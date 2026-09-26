'use client';

import { useAuth } from '@/features/auth/hooks/use-auth';
import { Menu } from 'lucide-react';
import { ModeSwitch } from './mode-switch';
import { UserMenu } from './user-menu';

interface TopHeaderProps {
  title: string;
  /** Opens the mobile nav drawer. Only rendered below lg. */
  onOpenMenu?: () => void;
}

export function TopHeader({ title, onOpenMenu }: TopHeaderProps) {
  const { user, logout, isLoading } = useAuth();

  const displayName = user?.name ?? user?.email ?? 'User';

  return (
    // Sticky rather than static: below lg the whole document scrolls, so a
    // static header would scroll away with the content.
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4 sm:px-6">
      {onOpenMenu && (
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Not a heading: every page renders its own <h1> inside <main>, and a
          second one here gave each route two (F-X-5-3). */}
      <p className="min-w-0 flex-1 truncate font-serif text-lg font-semibold text-gray-900 sm:text-xl">
        {title}
      </p>

      {/* Food | Gym below lg — the SideBar carries it at lg+. */}
      <ModeSwitch compact className="lg:hidden" />

      {!isLoading && user && (
        <UserMenu
          displayName={displayName}
          email={user.email}
          isAdmin={user.role === 'ADMIN'}
          onLogout={logout}
        />
      )}
    </header>
  );
}
