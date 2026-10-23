'use client';

import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { firstSupportedLocale } from '@chefer/i18n';
import { useLocaleSetting } from './i18n-provider';

/**
 * ADR 0002, signed-in pages only. The account is the source of truth for the
 * language choice: a choice made on the phone (or another browser) replaces
 * this browser's cookie. It also reports the browser's language once per
 * change, so emails reach people who never open the setting in their language.
 */
export function LocaleSync() {
  const { choice, applyChoice } = useLocaleSetting();
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const setLocale = trpc.user.setLocale.useMutation();
  const reported = useRef<string | null>(null);

  const accountChoice = me?.locale;
  useEffect(() => {
    if (accountChoice !== undefined && accountChoice !== choice) applyChoice(accountChoice);
    // Only an account change triggers this; the picker updates `me` first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountChoice]);

  const deviceLocale = me?.deviceLocale;
  useEffect(() => {
    if (deviceLocale === undefined) return;
    const browser = firstSupportedLocale(navigator.languages);
    if (!browser || browser === deviceLocale || reported.current === browser) return;
    reported.current = browser;
    setLocale.mutate({ deviceLocale: browser });
  }, [deviceLocale, setLocale]);

  return null;
}
