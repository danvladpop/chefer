import { useTier } from './use-tier';

/**
 * Mirror of apps/web/src/hooks/useIsPremium.ts (admins count as premium).
 * `undefined` while the user is loading. Uses auth.me — the query the app
 * already keeps warm — instead of web's user.me; both return UserProfile.
 */
export function useIsPremium(): boolean | undefined {
  const tier = useTier();
  return tier === undefined ? undefined : tier !== 'free';
}
