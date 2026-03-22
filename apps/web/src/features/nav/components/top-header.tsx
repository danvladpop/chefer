'use client';

import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { ChevronDown, LogOut } from 'lucide-react';
import { cn } from '@chefer/utils';

interface TopHeaderProps {
  title: string;
}

export function TopHeader({ title }: TopHeaderProps) {
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
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-6">
      <h1 className="font-serif text-xl font-semibold text-gray-900">{title}</h1>

      {!isLoading && user && (
        <div className="relative">
          <button
            onClick={() => setOpen((p) => !p)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-gray-100',
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
              <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border bg-white py-1.5 shadow-lg">
                <div className="border-b px-4 py-2.5">
                  <p className="text-sm font-medium text-gray-900">{displayName}</p>
                  <p className="truncate text-xs text-gray-500">{user.email}</p>
                </div>
                <button
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
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
