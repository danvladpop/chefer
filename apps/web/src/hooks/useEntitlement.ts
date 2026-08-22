'use client';

import { PLAN_FEATURES, type FeatureAccess, type PlanFeatureKey } from '@chefer/types';
import { useIsPremium } from './useIsPremium';

export interface Entitlement {
  /** Whether the user's tier has any access to the feature (a limit counts). */
  enabled: boolean;
  /** Daily limit, or null when unlimited. Meaningless while loading. */
  limit: number | null;
  /** Undefined while the user is still loading. */
  isPremium: boolean | undefined;
}

/**
 * Resolves one PLAN_FEATURES entry (launch plan PW-1) against the current
 * user's tier. The web-side twin of the API's lib/entitlements.ts — both read
 * the same matrix, so UI copy and enforcement cannot drift.
 */
export function useEntitlement(key: PlanFeatureKey): Entitlement {
  const isPremium = useIsPremium();
  const feature = PLAN_FEATURES[key];
  // Widen from the matrix's literal types so the access checks below compile.
  const access: FeatureAccess = isPremium ? feature.premium : feature.free;

  return {
    enabled: access !== false && access !== 0,
    limit: typeof access === 'number' ? access : access ? null : 0,
    isPremium,
  };
}
