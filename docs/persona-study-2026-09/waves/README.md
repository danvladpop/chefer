# Persona Study 2026-09 — Wave execution guide

This folder condenses `docs/persona-study-2026-09/synthesis/04-technical-plan.md` (rev 2, final — the
implementation plan for 20 "Now" items, 147 tasks `T-xx.n` + `T-BUG-*`, in waves 0–4) plus the relevant acceptance
criteria from `03-ux-design-spec.md` and the owner decisions in `02-business-strategy.md` §9, into one brief per
wave: `W0.md`, `W1.md`, `W2.md`, `W3.md`, `W4.md`, and (owner feedback 2026-09-27) `W5.md`. Each wave brief is meant to be the **only** synthesis document a
fresh Claude Code session needs to read before spinning up lane agents — it should never need the full 4,300 lines
of source docs. Where a `Wn.md` and the synthesis docs disagree, the synthesis docs are correct (something drifted
while condensing) — the pointers in each `Wn.md` §4 tell you exactly where to look.

## How to run a wave

Start a **new** Claude Code session (do not reuse a session that has read the full synthesis docs — that defeats the
token-saving point of these briefs) and paste this, replacing `{N}` with the wave number (0–5; for the W0-D
hotfix lane use `0` and say "run only lane W0-D"):

```
Read only these three files, in this order: docs/persona-study-2026-09/waves/README.md,
docs/persona-study-2026-09/waves/W{N}.md, and CLAUDE.md. Do not read anything else under
docs/persona-study-2026-09/synthesis/ unless a lane's pointer table sends you to a specific heading and line range
for a detail you need — even then, read only that slice, not the whole file.

You are orchestrating wave {N}. The study docs may be untracked (not committed), so lane worktrees won't contain
them: always give lane agents ABSOLUTE paths under /Users/danpop/work/git-projects/chefer/docs/persona-study-2026-09/.
First check W{N}.md §2 ("Blocked-by-owner-decision"). For any item without an owner answer, use the recorded
default and list it in your report; if a default is marked as needing the owner, stop and ask me before
launching that lane.

For each lane listed in W{N}.md §3:
1. Create a git worktree for the lane's branch (see W{N}.md for the branch name; use the repo's
   `../chefer-<lane>` worktree pattern).
2. Launch it as a background agent using the `sonnet` model. Give that agent ONLY: its lane's one-line task
   descriptions, its "Owns" file list, and the exact pointer rows from W{N}.md §4 that apply to it (heading + line
   range in 03/04) — not the whole W{N}.md and never the full synthesis docs. Tell it to read those pointed slices
   itself if it needs the full task rationale.
3. Cap concurrent lane agents at 3 — this machine and the iOS/Android simulators get overloaded past that. If a
   wave has more than 3 lanes, run them in batches, respecting the "depends on" / "can run in parallel" notes in
   W{N}.md §3.
4. Stay on this session (Opus) for orchestration: reviewing each lane's diff, running the verification ladder
   (W{N}.md §7), resolving merge conflicts between lanes on shared files, and deciding when a lane's PR is ready.
   Do not do lane implementation work yourself except to unblock a stuck agent.
5. When every lane's PR passes its own ladder, merge them into the wave's integration branch
   (`integrate/ux-now-w{N}`, cut from `master`), then run the full ladder once more on that branch.
6. Open the PR from `integrate/ux-now-w{N}` into `master`, but do **not** merge it. Merging to `master` deploys to
   production (API deploy, then an OTA auto-publish) — stop here and tell the owner the PR is ready, with the
   ladder results and the acceptance-criteria evidence from W{N}.md §5.

Report back with: which lanes finished, what's in each PR, ladder results, any acceptance criteria you could not
verify (and why), and anything in W{N}.md §2 "Blocked-by-owner-decision" that still needs an answer.
```

Wave 4 is not lane-parallel in the same sense — `W4.md` §3 explains the difference (release engineering, at most
two background agents, several steps the orchestrating session does directly). The prompt above still works; the
session will see that from `W4.md`.

## Token hygiene rules

- **Slices, not whole docs.** Never hand a lane agent the full `03-ux-design-spec.md` or `04-technical-plan.md`.
  Every task in every `Wn.md` has a pointer (heading + approximate line range) — give the agent that pointer and let
  it read only that slice if it needs more than the one-line description and file list already in `Wn.md`.
- **Text over screenshots.** Use `read_page`/`get_page_text`-style text dumps of UI state for verification; reserve
  screenshots for genuine visual checks (VoiceOver/TalkBack contrast, chart label clipping, dark-mode, layout at
  1.8× text) where text can't substitute.
- **No long polling.** Launch lane agents in the background and wait for their completion notifications — don't
  loop checking on them.
- **`/clear` between waves.** Each wave is a fresh session by design (see the brief's own opening line). Don't
  carry wave N's transcript into wave N+1 — the whole point of these briefs is that the next session doesn't need
  wave N's history, only its merged code and this README + the next `Wn.md`.
- **Coordinate shared files explicitly.** Several lanes touch the same file across waves in sequence (e.g.
  `app/preferences.tsx`, `apps/api/src/lib/trpc.ts`, `app/profile.tsx`). The "Owns" / "Read-only" split in each
  `Wn.md` §3 is binding — if a lane needs to touch a file it doesn't own, stop and ask the orchestrating session
  rather than guessing.

## Status table

Fill in as each wave runs. PRs column: integration-branch PR into `master`, plus each lane's PR into the
integration branch if useful to track separately.

| Wave | State                       | Lane PRs                                                                                 | Integration PR → master | Deployed                                                                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Merged to master (8c9de2c)  | #57 kit, #58 hotfix, #59 contracts (merged into `integrate/ux-now-w0`)                   | #60 merged 2026-09-27   | Deploy started 2026-09-27 (API, then OTA)                                                                            | 2026-09-27. Flags all off. Pre-existing: web `/unsubscribe`+`/verify-email` sweep failures; mobile "See full day" → tracker fails in Maestro on master too                                                                                                                                                                                                                                                                                                                                          |
| 1    | Merged to master (798e1bb8) | #66 safe, #64 gym, #67 plan, #69 entry, #70 track, #68 data (into `integrate/ux-now-w1`) | #71 merged 2026-09-28   | 2026-09-28: API + OTA (runtime iOS 8f7da239… / Android cb99e0fb…); iOS release build installed on the owner's iPhone | Ladder: L0/L1 green (3,439 tests), safety suite 0 failures, contract 50 ✓, L2c compat ✓ (master's suite vs new API), export ✓, fingerprint = master, Playwright 179 ✓ (only pre-existing unsubscribe/verify-email). Integration fixes: API-level gates keyed on ≥ 2 (level 1 = wave-0 JS on phones), poolExhausted formatter, one Replace filter, chat X1, toast z-index, tracker recents invalidation. CI contract job rate limit (#72). Maestro: see the PR thread. Android release build pending |
| 2    |                             |                                                                                          |                         |                                                                                                                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 3    |                             |                                                                                          |                         |                                                                                                                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 0-D  | Merged + deployed           | —                                                                                        | #63 merged 2026-09-27   | 2026-09-27 (API, then OTA)                                                                                           | Plus #65 (T-BUG-O1.2 on-device photo resize, native: new runtime). AX5 caption/± overflow fixed in W1 L-GYM                                                                                                                                                                                                                                                                                                                                                                                         |
| 4    |                             |                                                                                          |                         |                                                                                                                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 5    | Not started                 |                                                                                          |                         |                                                                                                                      | Owner feedback 2026-09-27 ("Data foundations"): after W3, beside W4. Blocked in part by D-14, D-16 (+ counsel)                                                                                                                                                                                                                                                                                                                                                                                      |

## Owner feedback 2026-09-27 — what changed in which wave

The owner used the app on his phone and reported 26 items (`synthesis/05-owner-feedback-po.md`, O-01…O-26). The UX
delta is appended to `03-ux-design-spec.md` (§ Owner feedback delta, from L4211; addendum D.11 from L5885) and the
technical delta to `04-technical-plan.md` (§ Owner feedback delta, from L1698). The earlier sections of both files are
untouched, so every existing pointer stays valid. The briefs mark each addition "(owner feedback 2026-09-27)".

| Wave     | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W0-D** | **New hotfix lane** (`W0.md` §3): recipe photo upload shows `[object Object]` (the client stringifies an error object; a > 5 MB body's 413 becomes a 500), and set 2's values render at ~4 pt (unbounded `adjustsFontSizeToFit`). Merge and deploy before W1 is cut                                                                                                                                                                                                                                   |
| **W1**   | **L-GYM +9 tasks:** set row regrouped + remove any set with Undo (JS swipe), no kg / `Aim for 1 s` on timed and custom exercises, keyboard-aware swap sheet, readable routine-editor card, Back Extension + Incline Barbell Bench Press, exercise images (3:2, placeholder, audit), a richer Resume card, a `Recent` list on Gym Today. **L-SAFE +7:** the recipe form you can finish (slice 1), the O-15 recipe-edit fixes, fiber removed on web. **L-PLAN:** one guard (recipes with unknown times) |
| **W2**   | **W2-0** gym mini contracts (only if ⚖ D-20 = b); **L-GYM:** correct or delete a past workout (UX-44), a minimal cardio slice (UX-42, D-20 b; T-36.6 trails or is cut), web parity for the Resume card and Recent list; **new 5th lane L-RECIPE** (mobile ingredient search, private ingredients, computed nutrition); one line each for L-HOME and L-MONEY                                                                                                                                           |
| **W3**   | No change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **W4**   | The native release adds `expo-image-manipulator` (on-device photo resize, the upload root cause) and, only if W1's JS swipe failed QA, `react-native-gesture-handler` as a direct dependency                                                                                                                                                                                                                                                                                                          |
| **W5**   | **New wave** (`W5.md`): W5-0 contracts → L-INGR (curated ingredient catalogue, provenance, private rows, admin review, recipe lines linked by id, safety by lookup) ‖ L-GYMDATA (the rest of cardio, then a governed exercise library: requests, trainer/admin authoring, flag then enforce)                                                                                                                                                                                                          |

Owner decisions added: D-14…D-22 (`05` §5); technical questions Q-22…Q-36 (`04` Δ8). Each has a default in the
brief that needs it.

## Inconsistencies found while condensing

These are places where the source documents disagree with each other, or where the plan itself flags a live
mismatch between shipped copy/behaviour and what the docs claim. The technical plan (`04`) is authoritative in
every case below — noted here so nobody re-introduces the older version while working from a stale copy or memory
of stage 3.

1. **Lane structure changed from the UX packaging.** `03-ux-design-spec.md` §7 "Agent work packaging" (its own
   wave/lane split) is **superseded** by `04-technical-plan.md` §7 (rebuilt execution plan). Concretely: wave 1
   gained a sixth lane, **L-TRACK** (new in rev 2, owns UX-19, UX-35 and the core of UX-11), that the original UX
   packaging didn't have; server "hot files" (`meal-plan.service.ts`, `preferences.router/service`,
   `tracker.service.ts`, `recipe.service.ts`) were given one owner per wave, which the UX packaging (client-only)
   never specified. Full list of deviations: `04-technical-plan.md` §7.1, rows R1–R10 (lines 1377–1396) — already
   folded into `W0.md`–`W3.md`'s lane definitions above.
2. **Native release scope changed.** Stage 3 (`03`, Appendix B) planned **one** wave-4 native release containing
   both the PostHog React Native SDK (for UX-12 analytics) and `expo-file-system` + `expo-sharing` (for UX-39's
   export). `04-technical-plan.md` §2.14 (lines 514–535) changes this to a **pure-JS PostHog transport over OTA in
   wave 1** (no SDK, no native module) and keeps only `expo-sharing` + a pinned `expo-file-system` in the wave-4
   native release. Both source documents' own changelogs note the discrepancy is resolved this way — `W4.md`
   reflects the smaller release.
3. **Bug-id collision with stage-3's "Stop" items.** `04-technical-plan.md` (line 1356) flags that stage 3 used
   `B-31`/`B-32`/`B-33`/`B-34` for its own **backlog "Stop" items**, which are unrelated to stage-1 bugs of the same
   numbers (`T-BUG-31` = spell-check on email fields; `T-BUG-32` = pantry unit defaults; `T-BUG-33` = UTC day
   summary bug; `T-BUG-34` = no edit/undo for logged food). If you see a bare "B-31" etc. outside the `T-BUG-`
   prefix, check which document it came from before assuming it's the same item.
4. **Rev-1 bug-task renumbering.** Rev 1 of the technical plan used `T-BUG-40`…`T-BUG-45` for defects found only
   while reading the source. Rev 2 renumbered these to `T-BUG-X1`…`T-BUG-X6` (adding `T-BUG-X7`) because stage 1's
   final bug list grew to include real bugs `B-40`…`B-45`, which now occupy those numbers instead
   (`04-technical-plan.md` §10 changelog, line 1636). Any older branch, comment or draft referencing "T-BUG-41" as
   a source-found defect is now stale — it means stage-1 bug `B-41` (workout history numbering) instead.
5. **Live copy/behaviour mismatches the plan hasn't fixed yet** (not a doc-vs-doc conflict, but worth flagging since
   they're marketing claims that are false today until their task ships): the paywall copy "Plans from our recipes
   are unlimited and don't count" is false while free curated generation is capped at 3/day (Q-18, fixed by
   `T-10.8` in `W2.md`); "an import counts only after saving" is also not how the quota is enforced today — the
   preview **is** the AI cost (Q-19, same task). Both have defaults recorded in `W2.md` §2 pending the owner's
   answer.
6. **_(owner feedback 2026-09-27)_ `react-native-gesture-handler` is already in the installed binaries.** `04` §1's
   facts table, §2.14 and Q-17, and 03's PAT-16 ("not in the binary") say it is absent. The local release builds
   show `RNGestureHandler (3.2.1)` in `ios/Podfile.lock` and `libgesturehandler.so` in the APK, pulled in
   transitively by `expo-router`. It is not a **direct** dependency, so JS can't import it reliably under pnpm. The
   plan keeps the JS swipe first; the fallback may ship over OTA if the fingerprint check passes (`04` Δ0, Q-29).
7. **_(owner feedback 2026-09-27)_ UX-44 needs no outbox op or schema** (03 D.9.1 planned W2-0 for it). A past-session
   delete is a `status: DISCARDED` upsert through the existing outbox; W2-0 now exists only for cardio (`04` Δ2.3, R11).
8. **_(owner feedback 2026-09-27)_ Ingredients get a new id-keyed `Ingredient` table**, not new columns on
   `IngredientPrice` as 03 UX-41 lists: the name primary key leaks private names across accounts (T-BUG-X8) and can't
   hold a private row next to a same-name catalogue row (`04` Δ2.5, Q-25).
9. **_(owner feedback 2026-09-27)_ Small path and scope corrections to 03:** `app/settings.tsx` is
   `app/settings/index.tsx`; the web recipe **detail** page also shows fiber (`recipes/[id]/page.tsx` L497), which
   03's fiber list missed; the exercise catalogue files are writable by W1 L-GYM for additive rows (03 D.11.1
   supersedes D.9.2's "read-only"); re-cropped exercise photos must get new file names or installed apps keep the old
   crops (`04` Δ2.7).
10. **_(owner feedback 2026-09-27)_ Back Extension's load type.** 03 UX-05 A5 sets `BODYWEIGHT_PLUS` and a cue says
    "hold a plate"; the engine maps that type to the dip-belt model, so the logger shows `BW` unless the user owns a
    belt. W1 must extend T-05.7's `+ Add weight` to held loads (Q-28).
