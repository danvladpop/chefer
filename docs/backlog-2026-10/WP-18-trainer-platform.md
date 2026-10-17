# WP-18 · Trainer platform

> **Superseded scope (2026-10-04).** The owner replaced the group / "publish the week" model below with 1:1 coaching.
> The current design and build plan are [`docs/trainer-platform/spec.md`](../trainer-platform/spec.md) and
> [`phase-1-plan.md`](../trainer-platform/phase-1-plan.md); Phase 1 runs on `feat/trainer-coaching`. This file is
> kept for the Phase 0 history.

|                       |                                                                                                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave / priority       | **Phase B, first among new features** (owner decision D-7, 2026-10-02)                                                                                                                                                                              |
| Size                  | XL overall. Phase 0 (discovery + design, docs only): about 1 day. Phase 1 (MVP): about 3–5 days                                                                                                                                                     |
| Branch / worktree     | Phase 0 `docs/trainer-platform-design` / `../chefer-wp18`. Phase 1 `feat/trainer-platform` (fresh worktree)                                                                                                                                         |
| DB / ports            | `chefer_wp18` / 3218, 3318, 8118 (Phase 1 only; Phase 0 needs none)                                                                                                                                                                                 |
| Depends on            | **Phase 0:** nothing. It is docs only, so it may run any time a session slot is free, in its own worktree. **Phase 1:** Phase A merged (WP-01..04, WP-09..14), plus the owner's sign-off of the Phase 0 design                                      |
| Relationship to WP-05 | The member side of the trainer platform reuses WP-05's class-session model (check-in, effort, focus, watch kcal). Phase 0 decides the order: WP-05 first on its own (class-goers without a trainer on Chefer still need it), or merged into Phase 1 |

## Why

From `docs/product/nice-to-have.md`: trainers create routines for their clients, update their weekly meals and prepare
the next sessions. One trainer brings a whole group, and trainers have asked for small-group tools for years.

The research (Full analysis, G8) describes the model:

- a trainer publishes this week's sessions to a group;
- members log against them;
- the trainer sees attendance and loads.

That is how TrueCoach, Trainerize and Ladder work. It is also a distribution channel.

**The evidence is still thin.** The tester's trainer didn't answer the interview. Phase 0 must therefore produce a design
that is cheap to validate, and the questions to ask trainers.

## Phase 0: discovery and design (docs only, no app code)

The orchestrator runs up to 3 Sonnet research lanes:

| Lane                     | Output                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A, market                | A teardown of TrueCoach, Trainerize, Everfit, PT Distinction, Hevy Coach, Ladder and Strong/Hevy sharing. For each: trainer workflow, client workflow, group/class support, nutrition features, pricing (who pays), onboarding of clients. Note what Romanian trainers use today (WhatsApp, Instagram, spreadsheets) where sources exist. Sources cited                                                          |
| B, code reconnaissance   | What Chefer can reuse, with file pointers: <br>• the Following graph, requests and per-section privacy toggles (`docs/friends/prd.md`, `docs/friends/dpia.md`, the friends services);<br>• `UserRole` (`schema.prisma:20`);<br>• routines and templates;<br>• workout sessions and WP-05's class model;<br>• meal plans and "My weeks";<br>• household;<br>• web app structure (trainers will plan on a desktop) |
| C, trainer interview kit | A 20-minute trainer interview guide, a 5-question survey, and a clickable-mock brief (what to show a trainer). The existing guide is in `user-needs-research-2026-10.md` §"Her trainer"                                                                                                                                                                                                                          |

The orchestrator then writes `docs/trainer-platform/spec.md` covering:

1. **Personas and jobs:** a small-group trainer (the tester's case), a 1:1 PT, and a class member.
2. **MVP slice.** The smallest thing a trainer would use weekly. A likely shape to test:
   - invite clients by link or code;
   - a group;
   - publish "this week's sessions" (from a routine template or a class-style list of exercises);
   - members see "This week from <trainer>" on gym Today and log with the class check-in or full logging;
   - a trainer web dashboard with attendance, effort and the last loads per client.
3. **Later slices:**
   - trainer edits a client's routine;
   - trainer-suggested weekly meals or targets (the food side);
   - messaging;
   - payments.
4. **Data model draft** (additive), roles and permissions, and **health-data consent.**
   - A trainer seeing a client's sessions, weight or food is special-category data: explicit, revocable consent per data
     section.
   - Reuse the Following privacy-toggle pattern and extend the DPIA.
5. **Platforms:** the trainer side is web-first; the client side is mobile plus web. Old 1.0.1 clients must be
   unaffected: gate by API level.
6. **Business model questions for the owner:**
   - who pays (trainer seat, client Premium, free during beta);
   - the impact on the "Premium = heavy AI only" principle.
7. **Phase 1 lanes, acceptance and test plan**, in the style of WP-05.
8. **Validation plan:** which 2–3 trainers to talk to, what to show them, and what result would change the MVP.

**Phase 0 deliverable:** a docs-only PR (`docs/trainer-platform/*` plus an updated Phase 1 section in this file). Because
it touches only docs, the deploy ignores it. **Stop for owner sign-off** before Phase 1.

## Phase 1: MVP build

This is defined by the signed-off spec ([`docs/trainer-platform/spec.md`](../trainer-platform/spec.md), Phase 0 output,
2026-10-03). Follow the operating rules: Sonnet lanes (max 3), additive schema and API with an API-level claim, web +
mobile, tests, the full ladder, iOS + one Android emulator, one PR (or one per slice, if the spec says so).

**Proposed Phase 1 (pending owner sign-off, spec §9):**

- **Order:** WP-05 (class check-in) ships first, on its own. Phase 1 lane A starts once WP-05's schema is merged.
- **Before building:** the 4-week manual trial with the tester's trainer (spec §8), or building in parallel with it.
- **MVP:** trainer tools turned on in web Settings; groups with an invite link and a consent screen; publish the week
  (from a routine day or as a class-style list, with "Copy last week"); a "This week from <trainer>" card on gym Today
  (check in, or start a copy); and a web dashboard with attendance, effort and last loads, showing only what the member
  shares.
- **Data:** additive tables `TrainerProfile`, `CoachingGroup`, `CoachingMember`, `PublishedSession`; nullable
  `publishedSessionId` on `WorkoutSession` and `ClassCheckIn`; `ConsentKind.COACHING_SHARING`; API level 6, claimed in
  the coordination file when Phase 1 starts.
- **Lanes:** A data + API; B trainer web (`/coach`); C member mobile + web. Acceptance and tests are in spec §7.
- **Not in the MVP:** food or targets from the trainer, messaging, payments, push, trainer-defined exercises, a trainer
  directory, and AI.

## Kickoff prompt (Phase 0)

```
You are the orchestrator for WP-18 Phase 0 "Trainer platform: discovery and design" (docs only, no app code).
Read, from origin/master:
1. docs/backlog-2026-10/00-operating-rules.md (roles, worktree, delivery, token hygiene; skip DB/devices)
2. docs/backlog-2026-10/WP-18-trainer-platform.md
3. docs/backlog-2026-10/feedback-2026-10-02.md
4. docs/product/user-needs-research-2026-10.md (Summary + G8) and docs/product/nice-to-have.md
5. CLAUDE.md
Create the worktree ../chefer-wp18 on branch docs/trainer-platform-design from origin/master. Run up to 3 Sonnet
research lanes (A market, B code reconnaissance, C trainer interview kit). Cite sources, and keep web research to
public pages. Write docs/trainer-platform/{research.md,spec.md,interview-kit.md}, and update WP-18's Phase 1 section.
Run pnpm format:check. Open ONE docs-only PR to master, and don't merge it. Update the live coordination file. Stop and
give me the spec summary, the MVP proposal and the owner questions to sign off.
```
