import type { PlanFeatureKey, UserProfile } from '@chefer/types';
import { PLAN_FEATURES, UPLOAD_LIMITS } from '@chefer/types';

// ─── Entitlements ─────────────────────────────────────────────────────────────
// The one place the API answers "what does this user's tier get" (launch plan
// PW-1). Every premium gate — the premiumProcedure middleware, tier branches,
// and quota checks — resolves through the PLAN_FEATURES matrix via these
// helpers; no other file may compare planTier to 'PREMIUM' directly.

/** Admins keep implicit premium — AI features are enabled for both. */
export function isPremiumUser(user: UserProfile): boolean {
  return user.planTier === 'PREMIUM' || user.role === 'ADMIN';
}

function accessFor(user: UserProfile, key: PlanFeatureKey): boolean | number {
  const feature = PLAN_FEATURES[key];
  return isPremiumUser(user) ? feature.premium : feature.free;
}

/** Whether the user's tier has any access to the feature (a limit counts). */
export function hasFeature(user: UserProfile, key: PlanFeatureKey): boolean {
  const access = accessFor(user, key);
  return access !== false && access !== 0;
}

/**
 * The user's daily limit for the feature, or `null` when unlimited.
 * `0` means no access — check `hasFeature` first when that matters.
 */
export function getLimit(user: UserProfile, key: PlanFeatureKey): number | null {
  const access = accessFor(user, key);
  if (typeof access === 'number') return access;
  return access ? null : 0;
}

/**
 * Total photo storage the user's tier gets, in bytes (Phase 1 guardrails —
 * UPLOAD_LIMITS.storageBytes: free 200 MB, premium 1 GB). A running total,
 * not a daily limit, so it lives beside PLAN_FEATURES rather than in it.
 */
export function uploadStorageQuotaBytes(user: UserProfile): number {
  return isPremiumUser(user) ? UPLOAD_LIMITS.storageBytes.premium : UPLOAD_LIMITS.storageBytes.free;
}
