import { PLAN_FEATURES, type FeatureAccess, type PlanFeatureKey } from '@chefer/types';
import { useIsPremium } from './use-is-premium';

// Mirror of apps/web/src/hooks/useEntitlement.ts — same PLAN_FEATURES matrix
// as the API's enforcement, so copy and gating cannot drift.

export interface Entitlement {
  enabled: boolean;
  limit: number | null;
  isPremium: boolean | undefined;
}

export function useEntitlement(key: PlanFeatureKey): Entitlement {
  const isPremium = useIsPremium();
  const feature = PLAN_FEATURES[key];
  const access: FeatureAccess = isPremium ? feature.premium : feature.free;

  return {
    enabled: access !== false && access !== 0,
    limit: typeof access === 'number' ? access : access ? null : 0,
    isPremium,
  };
}
