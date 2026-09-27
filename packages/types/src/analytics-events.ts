// ─── Shared analytics EventMap (T-12.1 scaffold) ───────────────────────────────
// A type-level guard: every event's properties are restricted to primitives
// or literal unions/arrays, never a bare `string` — no free-text health or
// safety data ever reaches an event property. T-12.1 (wave 1, owned by
// L-DATA) fills in the real event names + the existing gym `GymEventMap` and
// web funnel events; this wave ships the guard type and an empty map so
// `capture<E extends keyof EventMap>` can be typed from day one.

/**
 * Allowed property value for any analytics event property (health-data
 * guard). Per-event property types are literal unions/arrays of these, e.g.
 * `{ surface: 'today' | 'plan' | 'shop' }` — never a bare `string`. A
 * `tsd`-style Vitest (`expectTypeOf`) added in T-12.1 fails the build if one
 * sneaks in.
 */
export type AnalyticsPrimitive = number | boolean | readonly (string | number)[];

/**
 * The shared event map, filled event-by-event in wave 1 (T-12.1). Each key is
 * an event name; each value is a record of that event's properties
 * (restricted to `AnalyticsPrimitive` plus per-event literal string unions).
 * Empty for now — nothing downstream depends on a specific event key yet.
 */
export type EventMap = Record<string, Record<string, unknown>>;
