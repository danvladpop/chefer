import { useEffect, useRef } from 'react';
import { getDeviceLocale, setLocaleChoice, useLocaleChoice } from '../../lib/i18n';
import { trpc } from '../../lib/trpc';

/**
 * Renders nothing (ADR 0002). Signed in, the account is the source of truth
 * for the language choice: one made on web or another phone replaces this
 * phone's copy. It also reports the phone's own language when it changes, so
 * emails reach people who never open the setting in their language. Shares
 * the `user.me` cache entry the AI-consent guard already loads.
 */
export function LocaleSyncHost({ signedIn }: { signedIn: boolean }) {
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 30_000, enabled: signedIn });
  const setLocale = trpc.user.setLocale.useMutation({ meta: { silent: true } });
  const choice = useLocaleChoice();
  const reported = useRef<string | null>(null);

  const accountChoice = signedIn ? me?.locale : undefined;
  useEffect(() => {
    if (accountChoice !== undefined && accountChoice !== choice) setLocaleChoice(accountChoice);
    // Only an account change triggers this; the picker updates `me` first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountChoice]);

  const accountDevice = signedIn ? me?.deviceLocale : undefined;
  useEffect(() => {
    if (accountDevice === undefined) return;
    const device = getDeviceLocale();
    if (device === accountDevice || reported.current === device) return;
    reported.current = device;
    setLocale.mutate({ deviceLocale: device });
  }, [accountDevice, setLocale]);

  return null;
}
