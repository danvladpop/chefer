'use client';

import Link from 'next/link';
import { ChevronDown, LogOut, Settings, ShieldCheck, User } from 'lucide-react';
import { useMenu } from '@chefer/ui';
import { cn } from '@chefer/utils';

// ─── User menu ────────────────────────────────────────────────────────────────
// Menu-button pattern via `useMenu` from @chefer/ui (F-X-5-2 / F-AUTH-2-5):
// Escape closes and returns focus to the trigger, arrow keys move between
// items, Tab closes, an outside pointerdown closes — no `fixed inset-0` div.

export interface UserMenuProps {
  displayName: string;
  email: string;
  isAdmin: boolean;
  onLogout: () => void;
}

export function UserMenu({ displayName, email, isAdmin, onLogout }: UserMenuProps) {
  const { open, setOpen, rootRef, triggerProps, menuProps } = useMenu();

  const initials = displayName
    .split(' ')
    .map((n) => n[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const itemClass =
    'flex min-h-11 w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50 focus-visible:bg-gray-100';

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        {...triggerProps}
        className={cn(
          'flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-gray-100 sm:px-3',
          open && 'bg-gray-100',
        )}
        aria-label={`Account menu for ${displayName}`}
      >
        <div
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#944a00] text-xs font-semibold text-white"
        >
          {initials}
        </div>
        <span className="hidden font-medium text-gray-700 md:block">{displayName}</span>
        <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden="true" />
      </button>

      {open && (
        <div
          {...menuProps}
          className="absolute right-0 z-40 mt-1 w-52 max-w-[calc(100vw-2rem)] rounded-xl border bg-white py-1.5 shadow-lg"
        >
          <div className="border-b px-4 py-2.5" role="presentation">
            <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
            <p className="truncate text-xs text-gray-600">{email}</p>
          </div>
          <Link
            href="/profile"
            role="menuitem"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <User className="h-4 w-4 text-gray-500" aria-hidden="true" />
            Profile
          </Link>
          <Link
            href="/preferences"
            role="menuitem"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className={cn(itemClass, 'border-b')}
          >
            <Settings className="h-4 w-4 text-gray-500" aria-hidden="true" />
            Preferences
          </Link>
          {isAdmin && (
            <Link
              href="/admin/users"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className={cn(itemClass, 'border-b')}
            >
              <ShieldCheck className="h-4 w-4 text-gray-500" aria-hidden="true" />
              Admin · Users
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className={cn(
              itemClass,
              'text-left text-red-600 hover:bg-red-50 focus-visible:bg-red-50',
            )}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
