'use client';

import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { ChevronDown, LogOut, Menu } from 'lucide-react';
import { cn } from '@chefer/utils';

interface TopHeaderProps {
  title: string;
  /** Opens the mobile nav drawer. Only rendered below lg. */
  onOpenMenu?: () => void;
}

export function TopHeader({ title, onOpenMenu }: TopHeaderProps) {
  const { user, logout, isLoading } = useAuth();
  const [open, setOpen] = useState(false);

  const displayName = user?.name ?? user?.email ?? 'User';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

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

      <h1 className="min-w-0 flex-1 truncate font-serif text-lg font-semibold text-gray-900 sm:text-xl">
        {title}
      </h1>

      {!isLoading && user && (
        <div className="relative shrink-0">
          <button
            onClick={() => setOpen((p) => !p)}
            className={cn(
              'flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-gray-100 sm:px-3',
              open && 'bg-gray-100',
            )}
            aria-label="Open user menu"
            aria-expanded={open}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#944a00] text-xs font-semibold text-white">
              {initials}
            </div>
            <span className="hidden font-medium text-gray-700 md:block">{displayName}</span>
            <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
          </button>

          {open && (
            <>
              <div
                className="fixed inset-0 z-10"
                aria-hidden="true"
                onClick={() => setOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-1 w-52 max-w-[calc(100vw-2rem)] rounded-xl border bg-white py-1.5 shadow-lg">
                <div className="border-b px-4 py-2.5">
                  <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
                  <p className="truncate text-xs text-gray-500">{user.email}</p>
                </div>
                <button
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                  className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}
