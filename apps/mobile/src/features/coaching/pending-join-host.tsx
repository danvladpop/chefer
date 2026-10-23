import { useEffect } from 'react';
import { router, usePathname } from 'expo-router';
import { usePendingOnboarding } from '../auth/pending-onboarding';
import {
  clearPendingHouseholdJoin,
  householdJoinHref,
  readPendingHouseholdJoin,
} from '../household/sharing/pending-household-join';
import {
  getReturnTarget,
  joinHref,
  setReturnAfterSignIn,
  type ReturnAfterSignIn,
} from './pending-join';

/**
 * Renders nothing. A visitor who opened an invite link while signed out signs in (or registers and goes
 * through onboarding) and is brought back to the invite (spec §2.3 step 1). Mounted once in the root
 * layout; inert while signed out and while onboarding is up. Handles both invite kinds: a coaching
 * invite (WP-18) and a household invite (ADR 0002 — whose code is also kept on disk, so a cold start
 * between opening the link and signing in still comes back).
 */
export function PendingJoinHost({ signedIn }: { signedIn: boolean }) {
  const onboarding = usePendingOnboarding();
  const pathname = usePathname();

  useEffect(() => {
    if (!signedIn || onboarding) return;
    const persistedHousehold = readPendingHouseholdJoin();
    const target: ReturnAfterSignIn | null =
      getReturnTarget() ??
      (persistedHousehold !== null ? { kind: 'household', code: persistedHousehold } : null);
    if (target === null) return;
    if (pathname.startsWith('/onboarding')) return;
    const forget = () => {
      setReturnAfterSignIn(null);
      if (target.kind === 'household') clearPendingHouseholdJoin();
    };
    // The invite is already on screen (it re-rendered signed in): nothing to return to.
    if (pathname.startsWith(target.kind === 'household' ? '/household/join' : '/coaching/join')) {
      forget();
      return;
    }
    forget();
    try {
      router.push(
        target.kind === 'household' ? householdJoinHref(target.code) : joinHref(target.code),
      );
    } catch {
      // Navigator not mounted yet: coaching's persisted pending code still offers "Carry on joining".
    }
  }, [signedIn, onboarding, pathname]);

  return null;
}
