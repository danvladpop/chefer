# Wave 4: next, after more interviews or beta data

These three packages are **specified less tightly on purpose**. Their shape depends on what WP-05 and WP-08 teach the
beta. Before starting one, the orchestrator must:

1. read the beta signal (WP-13 events, tester feedback, the interview notes);
2. write a short **design note** as the first commit, covering data, flows, API level and lanes, in the style of
   WP-05;
3. ask the owner to confirm the design note before spawning lanes.

The operating rules apply in full. Use worktree `../chefer-wpNN`, DB `chefer_wpNN`, and ports `32NN`, `33NN`, `81NN`.

---

## WP-15 · Progress for varied training (research Gym 3)

- **Prerequisites:**
  - WP-05 merged;
  - 2–3 more class-goer interviews or 2 weeks of WP-05 check-ins;
  - the trainer conversation, if possible.
- **Scope (from the research Summary + G5):**
  - classes a week against the goal, with a streak that survives a missed week ("come back" mechanics, not a breaking
    streak);
  - an **effort trend** (effort × minutes as a weekly load bar);
  - **focus and pattern coverage** this week (legs, upper, core, cardio from check-ins; movement patterns from any logged
    exercises);
  - **"last time" weights** surfaced when an exercise reappears after weeks ("Walking lunges: 8 kg last time").
- **Rule (G9):** don't run the overload engine on class sessions. Show "last time"; don't prescribe.
- **Size:** M. Branch `feat/varied-training-progress`.

## WP-16 · "How do you eat?" levels (research Food 4)

- **Prerequisites:** WP-08 merged (`numbersMode`), plus beta data on how many testers use protein-only or ate-something-else.
- **Scope:**
  - Ask "How do you eat?" in onboarding and Preferences, with four levels:
    - **Full plan:** today's behaviour.
    - **Plan what I cook:** the existing plan-shape, selected slots only (B-07).
    - **Just guide me:** no plan; protein target plus ordering tips.
    - **No numbers:** `numbersMode = NONE`, with plate or hand portions.
  - The setting maps to plan-shape + `numbersMode`. It doesn't need a third storage concept.
  - The Adaptive Chef weekly review works on partial data (weight trend plus whatever was logged).
  - Offer "No numbers" as an equal option. This is the guardrail against disordered eating for a gym audience.
- **Size:** M–L. Branch `feat/how-do-you-eat`.

## WP-17 · Cardio, W5 (research Gym 4)

- **Prerequisites:** WP-05 merged. Re-read the specs, which are untracked and in the main checkout only:
  - `/Users/danpop/work/git-projects/chefer/docs/persona-study-2026-09/synthesis/04-technical-plan.md`: Δ2.1/Δ2.2,
    roughly lines 1882–1915, plus the W5 / T-42.x rows, roughly lines 1729–1746;
  - `/Users/danpop/work/git-projects/chefer/docs/persona-study-2026-09/synthesis/06-cardio-research.md`: §5 data model,
    §6 catalogue.
- **Already built:** the W2 slice, behind the `cardioLogging` flag:
  - the schema cardio fields on `SessionSet`, and `trackingType` with DURATION / DURATION_DISTANCE / DISTANCE / INTERVALS;
  - `cardio-catalog.ts`, `utils/gym/cardio.ts`, mobile `cardio-entry.tsx` / `cardio-timer.ts` / `effort-chips.tsx`;
  - API-level gating in `apps/api/src/application/gym/client-level.ts` (distance ≥ 3, INTERVALS ≥ 5).
  - Web only renders cardio.
- **Scope (W5):**
  - INTERVALS logging;
  - routine cardio slots (`RoutineExercise` has no cardio fields yet);
  - calorie estimates (shown, never added to food targets, per the 2 Oct decision);
  - a standalone cardio session that never touches the strength UI;
  - a WHO-minutes ring (150–300 min);
  - web logging parity;
  - a plan for turning on the `cardioLogging` flag (owner).
- **Size:** L. Branch `feat/cardio-w5`.

## Kickoff prompt (replace NN and the title)

```
You are the orchestrator for WP-NN "<title>". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. The WP-NN section of docs/backlog-2026-10/WP-15-17-next.md
3. CLAUDE.md
4. The research Summary in docs/product/user-needs-research-2026-10.md
Check the prerequisites. Write the design note as the first commit and present it to the owner. Wait for confirmation,
then execute under the operating rules:
- Sonnet lanes, at most 3 at a time; additive API with an API-level claim; OTA-safe; tests; the full ladder;
- iOS plus ONE Android emulator; web parity;
- ONE PR to master, never merged.
```
