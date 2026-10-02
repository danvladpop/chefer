# Plan: a fuller exercise library + easy supersets

Status: **in progress (2026-10-02)** · Owner: Dan · Branch `feat/gym-library-supersets`
(on top of `feat/gym-cable-biceps-curl`). Research: [`research.md`](./research.md);
candidate rows: [`proposals.json`](./proposals.json).

The owner asked for two things:

1. A more complete exercise dataset built from authoritative sources, the way the
   ingredient catalog was built from USDA.
2. An easy way to superset 2–3 exercises (e.g. one set of curls, one set of
   pushdowns, one set of lateral raises, then rest).

## 0. What exists today (verified 2026-10-02)

**Library.** 92 curated entries (80 strength + 12 cardio) in
`packages/types/src/gym/exercise-catalog.ts` + `exercise-content.ts`, upserted at
API boot by `apps/api/src/lib/exercise-library/ensure.ts` (by slug, never deletes,
`contentVersion` bump reaches installed clients through `librarySince`). The
equipment enum already has SMITH, KETTLEBELL and BAND, and the muscle vocabulary
already has adductors and obliques, but no curated row uses them. Users can create
up to 200 private custom exercises.

**Supersets already work** (gym_plan G4-B, 2026-09-25), but they are hard to reach:

- `RoutineExercise.supersetGroup` is stored; a superset is a run of adjacent
  exercises with the same letter (`packages/utils/src/gym/supersets.ts`).
- In a workout, ticking a set of A1 jumps to A2 with no rest; the rest starts
  after the round, using the last member's rest (`setTickOutcome`).
- **Creating one** needs: open the exercise → "More" → "Superset with next", and
  repeat for each pair. Mobile hides it under "More"; web has the same toggle.
- **A workout cannot create or break up a superset.** Grouping is derived from
  the routine through `routineExerciseId`, so an exercise added mid-workout can
  never join one, and the session has nowhere to store a one-off superset.
- The server does not normalise letters; the duration estimate ignores supersets
  (a superset day is over-estimated).

## 1. Decisions

| #    | Decision                                                                                                                                                                                                                              | Status                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| L-D1 | **Exercise photos.** The free-exercise-db photos have unknown provenance (research §3). Options: keep, replace with CC-BY-SA (wger/Everkinetic, credited), commission/generate original art, or hide photos and rely on cues + video. | **⏸ owner** — blocks phase L3 only |
| L-D2 | Rows are authored by us (names, muscles, equipment, patterns are facts; cues/mistakes/blurbs in Chefer's own words). Each new row records its cross-references (free-exercise-db id, wger id) in `sources.json`, never copied text.   | decided (Claude, 2026-10-02)       |
| L-D3 | Add the 37 P1 staples and the P2 rows **except** power-clean, push-press, kettlebell-clean and turkish-get-up: Olympic/complex lifts fit neither the rep-progression engine nor self-coached safety. ≈ 91 new rows.                   | decided (Claude)                   |
| L-D4 | No new enum values. Trap bar = BARBELL with alias "Hex Bar Deadlift"; rotator-cuff work uses `rear-delts` (no new muscle). Old binaries never see an unknown value.                                                                   | decided (Claude)                   |
| L-D5 | New rows ship with `freeExerciseDbId: null` and `videoId: null` until L-D1 is answered and videos are oEmbed-verified (existing "content gaps" process). The detail screen shows the icon placeholder plus cues.                      | decided (Claude)                   |
| S-D1 | A superset is still "adjacent exercises sharing a letter". Creating one from a pick of 2–4 exercises **moves them together** at the first pick's position. Max 4 members.                                                             | decided (Claude)                   |
| S-D2 | Supersets made in a workout belong to **that session only** until the user taps "Update routine", same as swaps today (D5 "editable at every level").                                                                                 | decided (Claude)                   |
| S-D3 | The session stores its own `supersetGroup` (additive optional field + nullable column). Sessions without it (old binaries, old docs) keep today's derivation from the routine.                                                        | decided (Claude)                   |

## 2. Phases

### S1 — Superset contracts and engine (shared, API) · Claude

- `supersets.ts`: `createSuperset(items, keys)` (reorders the picks to be
  adjacent at the first pick's position, assigns a fresh letter, normalises) and
  `ungroupSuperset(items, label)`. Pure, generic over `{ supersetGroup }` items,
  tested.
- `sessionExerciseDocSchema.supersetGroup: z.string().max(20).nullable().optional()`;
  `SessionExercise.supersetGroup String?`; repository write + `toSessionDoc` read.
  `schemaVersion` stays 1.
- Session start copies the routine letter into the session doc
  (`workout-reducer.ts` start from `NextWorkoutDto.supersetGroup`).
- `sessionSupersets` prefers the session's own `supersetGroup` when the field is
  present on **any** exercise of the doc; otherwise the routine lookup (old docs).
- Workout reducer actions `createSuperset` / `ungroupSuperset`; an exercise added
  mid-session gets `supersetGroup: null`; `moveExercise` re-normalises.
- "Update routine" writes the session's supersets back into the routine day.
- Server: `routine.service.save` normalises letters (`normalizeSupersets`).
- `estimateMinutes`: a superset round costs Σ members' work + one rest.
- Docs: `business_flow.md` Supersets section, `infrastructure.md` §6.

### S2 — Mobile superset UI · agent

- Routine day editor: a visible **"Superset"** button on each day header (not
  under "More") opens a Sheet listing the day's exercises with checkboxes
  (2–4) → "Group as superset". Each superset header gets an **"Ungroup"**
  action. The per-exercise "Superset with next" toggle stays.
- Active workout: the same "Superset" action in the workout's overflow menu,
  and "Ungroup" on the "Superset A" heading. Exercises added mid-workout are
  pickable. Focus and rest follow the new grouping immediately.
- Jest for reducers/hooks; typecheck; Maestro flow `gym-superset-create`.

### S3 — Web superset UI · agent

Same behaviour as S2 on web (`Sheet` from `@chefer/ui`, routine editor phone
list + desktop board, workout view). Vitest + Playwright (mobile + desktop).

### L1 — Library rows and content · agent

- ≈ 91 rows from `proposals.json` (L-D3) into `exercise-catalog.ts`, grouped by
  muscle with the existing ones; coaching content (3 cues ≤ 12 words, 2 mistakes,
  blurb) in Chefer's own words; aliases deduplicated (move "Pec Deck",
  "Cable Crossover", "T-Bar Row", "Rope Pushdown", "Hanging Leg Raise" from their
  current owners to the new rows).
- `sources.json`: per new slug, `{ freeExerciseDb, wger }` cross-references.
- New movement patterns (`front-raise`, `upright-row`,
  `shoulder-external-rotation`, `wrist-flexion`, `hip-adduction`,
  `anti-lateral-flexion`, `rotation`) and swap groups (`front-raise`,
  `rotator-cuff`, `forearm`, `hip-adduction`).
- Engine fallout: catalog/template tests (count, alias uniqueness, home-variant
  invariants, `closestAccessibleAlternative` expectations); start weights for
  the new patterns if the engine needs them.

### L2 — Library filters · Claude

`LIBRARY_FILTER_GROUPS` in `@chefer/types` = the volume groups plus Forearms,
Traps, Lower back, Hips (adductors + abductors), used by every picker and the
Exercises tab on both platforms (primary muscles only, so web stops differing
from mobile). Volume stats keep `VOLUME_GROUPS`.

### L3 — Photos · ⏸ blocked on L-D1

Depends on the owner's answer. Also fixes the wrong photos listed in research §4.

## 3. Verification

`pnpm typecheck`, `pnpm lint`, `pnpm test`; API gym + exercise-library tests;
mobile Jest + `expo export`; web Playwright gym project + mobile sweep; a
superset workout walked through on the iOS simulator and the web.

## 4. Backward compatibility

Additive only: one optional session field, one nullable column, new catalog
rows (old binaries receive them through `librarySince`; every enum value they
use already ships). No procedure is renamed or removed.

## 5. Progress

| Phase | State                                                                      |
| ----- | -------------------------------------------------------------------------- |
| S1    | ✅ 2026-10-02                                                              |
| S2    | ☐                                                                          |
| S3    | ☐                                                                          |
| L1    | ✅ 2026-10-02 — 91 rows added (catalog 92 → 183), content + `sources.json` |
| L2    | ✅ 2026-10-02                                                              |
| L3    | ⏸                                                                          |
