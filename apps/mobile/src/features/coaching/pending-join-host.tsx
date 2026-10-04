import { useEffect } from 'react';
import { router, usePathname } from 'expo-router';
import { usePendingOnboarding } from '../auth/pending-onboarding';
import { getReturnAfterSignIn, joinHref, setReturnAfterSignIn } from './pending-join';

/**
 * Renders nothing. A visitor who opened an invite link while signed out signs in (or registers and goes
 * through onboarding) and is brought back to the invite (spec §2.3 step 1). Mounted once in the root
 * layout; inert while signed out and while onboarding is up.
 */
export function PendingJoinHost({ signedIn }: { signedIn: boolean }) {
  const onboarding = usePendingOnboarding();
  const pathname = usePathname();

  useEffect(() => {
    if (!signedIn || onboarding) return;
    const code = getReturnAfterSignIn();
    if (code === null) return;
    if (pathname.startsWith('/onboarding')) return;
    // The invite is already on screen (it re-rendered signed in): nothing to return to.
    if (pathname.startsWith('/coaching/join')) {
      setReturnAfterSignIn(null);
      return;
    }
    setReturnAfterSignIn(null);
    try {
      router.push(joinHref(code));
    } catch {
      // Navigator not mounted yet: the persisted pending code still offers "Carry on joining".
    }
  }, [signedIn, onboarding, pathname]);

  return null;
}
