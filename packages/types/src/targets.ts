// ─── Targets: one resolver, own overrides, change log (§2.11, T-35.1, T-11.1) ──
// Types only — the resolver (`resolveDailyTargets`) and the change-detection
// logic are wave 1 (T-35.1, T-11.1). Ship the shape now so the `targets`
// router stub (T-00.10) and clients can agree on it early.

import type { NutritionTargets } from './training-nutrition';

export type TargetSource = 'own' | 'suggested';

/** The inputs the explanation sentences (`explain-targets.ts`) name. */
export interface TargetInputs {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  activity: string | null;
  goal: string | null;
  isLifter: boolean;
  proteinGPerKg: number | null;
  /** BMI ≥ 30 uses an adjusted body weight for protein (§2.11). */
  usedAdjustedWeight: boolean;
  rate: string | null;
}

/** `resolveDailyTargets`'s return shape (preferences.service.ts). */
export interface TargetsView {
  effective: NutritionTargets;
  suggested: NutritionTargets;
  source: TargetSource;
  inputs: TargetInputs;
}

export const TARGET_CHANGE_KINDS = ['CHANGED', 'SUGGESTED'] as const;
export type TargetChangeKind = (typeof TARGET_CHANGE_KINDS)[number];

export const TARGET_CHANGE_RESOLUTIONS = ['USE_NEW', 'KEEP_OLD', 'AUTO'] as const;
export type TargetChangeResolution = (typeof TARGET_CHANGE_RESOLUTIONS)[number];

export const TARGET_CHANGE_REASONS = ['GYM_SETUP', 'WEIGHT', 'GOAL', 'DAY_KIND', 'COACH'] as const;
export type TargetChangeReason = (typeof TARGET_CHANGE_REASONS)[number];

export interface TargetChangeField {
  field: string;
  before: number | string | null;
  after: number | string | null;
}

/** Mirrors the `TargetChange` Prisma model (S12). */
export interface TargetChange {
  id: string;
  userId: string;
  kind: TargetChangeKind;
  reason: TargetChangeReason;
  fields: TargetChangeField[];
  createdAt: Date;
  resolvedAt: Date | null;
  resolution: TargetChangeResolution | null;
}
