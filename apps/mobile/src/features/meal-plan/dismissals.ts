import { kv } from '../gym/offline/kv';

// Per-plan banner dismissals for the Plan tab, kept in the same on-device KV
// store the premium nudge cap uses. A failure to read or write just means the
// banner may show again — never a crash.

const PREFIX = 'plan.dismissed.';

export type PlanDismissal = 'replan' | 'premium-changes';

const keyFor = (kind: PlanDismissal, planId: string): string => `${PREFIX}${kind}.${planId}`;

export function isPlanDismissed(kind: PlanDismissal, planId: string): boolean {
  try {
    return kv.getString(keyFor(kind, planId)) === '1';
  } catch {
    return false;
  }
}

export function dismissPlan(kind: PlanDismissal, planId: string): void {
  try {
    kv.setString(keyFor(kind, planId), '1');
  } catch {
    // Storage unavailable: the banner may reappear next visit.
  }
}
