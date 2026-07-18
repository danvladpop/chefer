'use client';

import { trpc } from '@/lib/trpc';

/**
 * Returns the current user's premium status (admins count as premium — AI
 * features are enabled for both). `undefined` while the user is loading.
 */
export function useIsPremium(): boolean | undefined {
  const { data: user } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  if (!user) return undefined;
  return user.planTier === 'PREMIUM' || user.role === 'ADMIN';
}
