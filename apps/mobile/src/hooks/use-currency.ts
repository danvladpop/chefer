import type { DisplayCurrency } from '@chefer/types';
import { toDisplayCurrency } from '@chefer/utils';
import { trpc } from '../lib/trpc';

/**
 * Mirror of apps/web/src/hooks/useCurrency.ts — the user's display currency
 * (backlog P2-6). Prices stay EUR estimates in the API; format them with
 * formatMoney(eur, currency). Defaults to EUR while loading / without a profile.
 */
export function useCurrency(): DisplayCurrency {
  const { data } = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  return toDisplayCurrency(data?.chefProfile?.deliveryCurrency);
}
