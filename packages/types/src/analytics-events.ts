import type { PremiumJobId, PremiumSource } from './plan-features';
import type { PlanSlot } from './plan-shape';

// ─── Shared analytics EventMap (T-12.1) ────────────────────────────────────────
// A type-level guard: every event's properties are restricted to primitives
// or literal unions/arrays, never a bare `string` — no free-text health or
// safety data ever reaches an event property (PAT-13: no food text, no
// weights, no exercise names). See analytics-events.test-d.ts for the
// compile-time test that fails the build if a bare `string` sneaks in.
//
// An opaque identifier (a cuid, not free text) is not "free text", but it IS
// a `string` — the guard can't tell the two apart by type alone. The
// convention here is to wrap an id in a one-element readonly tuple
// (`readonly [string]`), which IS an array and so satisfies
// `AnalyticsPrimitive` literally, while still making "this is an opaque id,
// not prose" visible at the call site. Anything that could instead be a
// bounded literal union (a mode, a source screen, a status) uses that union
// instead of the tuple trick.
//
// This map is intentionally a SEPARATE namespace from the pre-existing,
// per-app `GymEventMap` (`apps/{web,mobile}/src/features/gym/analytics.ts`,
// wave 0) and from web's existing funnel events captured directly through
// `apps/web/src/lib/analytics.ts`'s `capture()` (e.g. `plan_shown`,
// `upgrade_prompt_shown`). Those events predate this map and some of their
// property shapes (a bare `string` `kind`/`reason`/`source`) would fail the
// health-data guard as literally typed; `capture()`'s overload (see
// `lib/analytics.ts`) keeps them compiling against the old permissive
// signature until each lane migrates its own call sites onto this map —
// this task ships the map and the typed wrapper, not those migrations.
// `plan_generated` and `meal_logged` below are deliberately the NEW,
// richer-shaped versions of two names that already exist as looser funnel
// events; the old call sites keep compiling through that same fallback until
// L-PLAN / L-TRACK adopt the new shape.

/**
 * Allowed property value for any analytics event property (health-data
 * guard): a number, a boolean, an array, or a string-literal union (e.g.
 * `'today' | 'plan' | 'shop'`) — never the general, unconstrained `string`
 * type, which is how free-text health/safety/food data would sneak in.
 * `EventMapIsGuarded` (below) is the actual compile-time check —
 * `analytics-events.test-d.ts` fails the build if any event violates it.
 */
export type AnalyticsPrimitive = number | boolean | readonly (string | number)[];

/**
 * `true` iff `T` is EXACTLY the general `string` type (not a narrower
 * literal or literal union) — the classic two-way `extends` trick: a literal
 * type extends `string` but `string` does not extend it back, so only the
 * unconstrained type satisfies both directions.
 */
type IsBareString<T> = T extends string ? (string extends T ? true : false) : false;

/** `true` iff a single property's type passes the health-data guard. */
type IsGuardedProp<T> = T extends AnalyticsPrimitive
  ? true
  : IsBareString<T> extends true
    ? false
    : T extends string // a string-literal type/union that isn't bare `string`
      ? true
      : false;

/** `true` iff every property of one event's shape passes the guard. */
type EventIsGuarded<E> =
  E extends Record<string, never> ? true : { [K in keyof E]: IsGuardedProp<E[K]> }[keyof E];

/**
 * `true` iff every event in a map passes the guard; `boolean` (never a
 * literal `true`) as soon as one event fails — see the type test.
 */
export type EventMapIsGuarded<M> = {
  [K in keyof M]: EventIsGuarded<M[K]> extends true ? true : false;
}[keyof M];

/** An opaque, non-prose identifier (a cuid, a route name) — see the header note. */
type OpaqueId = readonly [string];

export interface EventMap {
  // ─── Gym (T-12.4, new emitters other wave-1 branches add) ──────────────────
  exercise_image_failed: { exerciseId: OpaqueId };
  workout_set_removed: { via: 'menu' | 'long_press' };
  workout_set_restored: Record<string, never>;

  // ─── Plan (L-PLAN, wave 1) ───────────────────────────────────────────────────
  plan_configured: { slots: number; nights: readonly number[]; timeCap: number; servings: number };
  /** Richer replacement for the wave-0 funnel `plan_generated { tier, weekOffset }`. */
  plan_generated: { slotsCount: number; keptPicks: number };
  regenerate_confirmed: { keptPicksCount: number };
  regenerate_undone: Record<string, never>;
  swap_undone: Record<string, never>;
  replace_undone: Record<string, never>;
  premium_changes_viewed: Record<string, never>;

  // ─── Premium (L-MONEY, wave 2, UX-10) ────────────────────────────────────────
  upgrade_prompt_shown: { source: PremiumSource; job: PremiumJobId };
  upgrade_clicked: { source: PremiumSource; job: PremiumJobId };
  upgrade_completed: { source: PremiumSource; job: PremiumJobId };
  downgrade_completed: { daysSinceUpgrade: number };
  /** The once-a-day nudge cap swallowed a nudge (§2.7). */
  nudge_suppressed: { source: PremiumSource };

  // ─── Safety (L-SAFE, wave 1) ─────────────────────────────────────────────────
  safety_readback_viewed: Record<string, never>;
  safety_conflict_shown: Record<string, never>;
  safety_issue_reported: Record<string, never>;
  safety_migration_resolved: Record<string, never>;

  // ─── Recipe form (L-RECIPE / mobile, wave 1) ────────────────────────────────
  recipe_form_opened: { mode: 'create' | 'edit'; from: OpaqueId };
  recipe_form_blocked_tap: { missingCount: number };
  recipe_form_submitted: {
    mode: 'create' | 'edit';
    ingredientCount: number;
    stepCount: number;
    hasPhoto: boolean;
    nutritionMode: 'auto' | 'manual';
  };
  recipe_form_abandoned: { mode: 'create' | 'edit'; missingCount: number };
  upload_failed: {
    status: number;
    where: 'recipe-photo' | 'meal-scan' | 'ingredient-photo' | 'avatar' | 'other';
  };

  // ─── L-DATA's own events (T-12.4) ────────────────────────────────────────────
  app_opened: Record<string, never>;
  analytics_consent_changed: { anonymous: boolean; linked: boolean };
  /** Richer replacement for the wave-0 funnel `meal_logged { source: 'today', mealType: string }`. */
  meal_logged: { source: 'today' | 'plan' | 'log'; mealType: PlanSlot };
}
