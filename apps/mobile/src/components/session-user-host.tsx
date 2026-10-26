import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { setCurrentUserId } from '../lib/analytics';
import { noteAppStateForOpens, trackLaunchOpen } from '../lib/app-open-tracking';
import { setCrashReportingUser } from '../lib/crash-reporting';
import { trpc } from '../lib/trpc';

/**
 * How long a launch waits for `user.me` before `app_opened` goes out anyway.
 * Offline, the query pauses instead of failing, and the open must still count.
 */
const IDENTITY_WAIT_MS = 5_000;

/**
 * Renders nothing. Tells crash reporting (M1-6) and usage analytics who is
 * signed in: the account's id, never the name or email. The id is null when
 * nobody is signed in, so sign-in, sign-out and switching accounts all reach
 * both through this one place. Analytics links events to the id only while
 * "Link usage to my account" is on. It shares the `user.me` cache entry the
 * AI-consent guard already loads, so it adds no request. It also fires the
 * launch's `app_opened` once the identity is settled, and the `resume` opens.
 */
export function SessionUserHost({ signedIn }: { signedIn: boolean }) {
  const me = trpc.user.me.useQuery(undefined, { staleTime: 30_000, enabled: signedIn });
  const userId = signedIn ? (me.data?.id ?? null) : null;
  const [waitedEnough, setWaitedEnough] = useState(false);
  const identitySettled = !signedIn || me.data !== undefined || me.isError || waitedEnough;

  useEffect(() => {
    setCrashReportingUser(userId);
    setCurrentUserId(userId);
  }, [userId]);

  // Declared after the effect above, so on the render where `user.me` arrives
  // the id is set before the launch event is tracked.
  useEffect(() => {
    if (identitySettled) trackLaunchOpen();
  }, [identitySettled]);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedEnough(true), IDENTITY_WAIT_MS);
    const subscription = AppState.addEventListener('change', (status) =>
      noteAppStateForOpens(status),
    );
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return null;
}
