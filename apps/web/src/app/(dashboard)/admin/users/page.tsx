'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Search, ShieldAlert } from 'lucide-react';

// ─── Admin: user & tier management (PW-2) ─────────────────────────────────────
// The soft paywall's "DB flag that can be changed" without SSH-ing into prod
// psql: search users, flip their tier, see today's AI usage. Every mutation
// here is adminProcedure-gated server-side — the client check below is UX,
// not security.

export default function AdminUsersPage() {
  const { data: me } = trpc.user.me.useQuery();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  const isAdmin = me?.role === 'ADMIN';

  const { data, isLoading } = trpc.user.list.useQuery(
    { page: 1, limit: 50, search: debounced || undefined },
    { enabled: isAdmin },
  );

  const userIds = data?.users.map((u) => u.id) ?? [];
  const { data: aiCalls } = trpc.user.aiCallsToday.useQuery(
    { userIds },
    { enabled: isAdmin && userIds.length > 0 },
  );

  const utils = trpc.useUtils();
  const setTier = trpc.user.setPlanTier.useMutation({
    onSuccess: () => void utils.user.list.invalidate(),
  });

  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout((window as unknown as { _at?: ReturnType<typeof setTimeout> })._at);
    (window as unknown as { _at?: ReturnType<typeof setTimeout> })._at = setTimeout(
      () => setDebounced(value),
      300,
    );
  };

  if (me && !isAdmin) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-gray-300" />
        <p className="font-medium text-gray-700">Admins only</p>
        <p className="text-sm text-gray-500">This page manages user plan tiers.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Admin</p>
        <h1 className="font-serif text-2xl font-bold text-gray-900">Users</h1>
        <p className="mt-1 text-sm text-gray-500">
          Flip plan tiers during the soft-paywall phase and keep an eye on AI usage.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="w-full rounded-xl border bg-white py-2.5 pl-9 pr-4 text-sm focus:border-[#944a00] focus:outline-none"
        />
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="divide-y rounded-2xl border bg-white shadow-sm">
          {data?.users.map((u) => (
            <div
              key={u.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{u.email}</p>
                <p className="text-xs text-gray-500">
                  {u.name ?? [u.firstName, u.lastName].filter(Boolean).join(' ') ?? '—'} · {u.role}{' '}
                  · {aiCalls?.[u.id] ?? 0} AI calls today
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    u.planTier === 'PREMIUM'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {u.planTier}
                </span>
                <button
                  onClick={() =>
                    setTier.mutate({
                      userId: u.id,
                      planTier: u.planTier === 'PREMIUM' ? 'FREE' : 'PREMIUM',
                    })
                  }
                  disabled={setTier.isPending}
                  className="min-h-11 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:border-[#944a00]/40 hover:text-[#944a00] disabled:opacity-50 sm:min-h-0 sm:py-1.5"
                >
                  {u.planTier === 'PREMIUM' ? 'Downgrade' : 'Upgrade'}
                </button>
              </div>
            </div>
          ))}
          {data?.users.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-500">No users match that search.</p>
          )}
        </div>
      )}
      {setTier.isError && <p className="mt-3 text-sm text-red-600">{setTier.error.message}</p>}
    </div>
  );
}
