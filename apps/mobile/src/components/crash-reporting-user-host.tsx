import { useEffect } from 'react';
import { setCrashReportingUser } from '../lib/crash-reporting';
import { trpc } from '../lib/trpc';

/**
 * Renders nothing; tags crash reports with the signed-in account's id (never
 * the name or email) and clears it on sign-out (M1-6). Shares the `user.me`
 * cache entry the AI-consent guard already loads, so it adds no request.
 * A no-op when crash reporting is off.
 */
export function CrashReportingUserHost({ signedIn }: { signedIn: boolean }) {
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 30_000, enabled: signedIn });
  const userId = signedIn ? (me?.id ?? null) : null;
  useEffect(() => {
    setCrashReportingUser(userId);
  }, [userId]);
  return null;
}
