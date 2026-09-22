import { trpc } from '../lib/trpc';

/**
 * Mirror of apps/web/src/hooks/useIsPremium.ts (admins count as premium).
 * `undefined` while the user is loading. Uses auth.me — the query the app
 * already keeps warm — instead of web's user.me; both return UserProfile.
 */
export function useIsPremium(): boolean | undefined {
  const { data: user } = trpc.auth.me.useQuery(undefined, { staleTime: 30_000 });
  if (!user) {
    return undefined;
  }
  return user.planTier === 'PREMIUM' || user.role === 'ADMIN';
}
