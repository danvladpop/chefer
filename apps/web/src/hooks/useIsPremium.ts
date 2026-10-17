'use client';

import { useTier } from '@/hooks/useTier';

/**
 * Returns the current user's premium status (admins count as premium — AI
 * features are enabled for both). `undefined` while the user is loading.
 */
export function useIsPremium(): boolean | undefined {
  const tier = useTier();
  return tier === undefined ? undefined : tier !== 'free';
}
