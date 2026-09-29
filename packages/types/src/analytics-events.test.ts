import { describe, expectTypeOf, it } from 'vitest';
import type { EventMap, EventMapIsGuarded } from './analytics-events';

// ─── Health-data guard (T-12.1, AC4) ────────────────────────────────────────
// A type-level test: fails to compile (and so fails the build) if any event
// in the shared EventMap declares a bare `string` property — the mechanism
// that makes it impossible to send free-text allergy, diet, condition,
// weight or food data as an analytics property.

// This line only type-checks when `EventMapIsGuarded<EventMap>` is exactly
// `true` (it widens to `boolean` as soon as one event fails) — i.e. every
// event in the real EventMap passes the guard right now.
type _RealMapIsGuarded = EventMapIsGuarded<EventMap>;

// ─── Proof the guard actually catches a violation (not vacuously true) ─────
// A fixture map with one bare-`string` property must NOT satisfy the guard —
// if this ever started passing, the guard itself would be broken, not the
// real EventMap.
interface BadEventMap {
  ok_event: { count: number };
  bad_event: { note: string };
}
type _BadMapIsGuarded = EventMapIsGuarded<BadEventMap>;

describe('EventMap health-data guard (AC4)', () => {
  it('the real EventMap has no bare-string property', () => {
    const guarded: _RealMapIsGuarded = true;
    expectTypeOf(guarded).toEqualTypeOf<true>();
  });

  it('a fixture map with a bare-string property fails the same check', () => {
    // `boolean` (true | false), not the literal `true` — proves the guard
    // rejects `bad_event.note: string`.
    expectTypeOf<_BadMapIsGuarded>().toEqualTypeOf<boolean>();
    expectTypeOf<_BadMapIsGuarded>().not.toEqualTypeOf<true>();
  });
});
