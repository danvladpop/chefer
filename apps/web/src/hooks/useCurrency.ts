'use client';

import { trpc } from '@/lib/trpc';
import type { DisplayCurrency } from '@chefer/types';
import { toDisplayCurrency } from '@chefer/utils';

/**
 * The user's display currency (Preferences → Units & currency, free on every
 * tier). Prices stay EUR estimates in the API; format them with
 * formatMoney(eur, currency). Defaults to EUR while loading / without a profile.
 */
export function useCurrency(): DisplayCurrency {
  const { data } = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  return toDisplayCurrency(data?.chefProfile?.deliveryCurrency);
}
