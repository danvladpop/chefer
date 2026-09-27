# Persona Study 2026-09 — Wave execution guide

This folder condenses `docs/persona-study-2026-09/synthesis/04-technical-plan.md` (rev 2, final — the
implementation plan for 20 "Now" items, 147 tasks `T-xx.n` + `T-BUG-*`, in waves 0–4) plus the relevant acceptance
criteria from `03-ux-design-spec.md` and the owner decisions in `02-business-strategy.md` §9, into one brief per
wave: `W0.md`, `W1.md`, `W2.md`, `W3.md`, `W4.md`. Each wave brief is meant to be the **only** synthesis document a
fresh Claude Code session needs to read before spinning up lane agents — it should never need the full 4,300 lines
of source docs. Where a `Wn.md` and the synthesis docs disagree, the synthesis docs are correct (something drifted
while condensing) — the pointers in each `Wn.md` §4 tell you exactly where to look.

## How to run a wave

Start a **new** Claude Code session (do not reuse a session that has read the full synthesis docs — that defeats the
token-saving point of these briefs) and paste this, replacing `{N}` with the wave number (0–4):

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

| Wave | State | Lane PRs | Integration PR → master | Deployed | Notes |
| ---- | ----- | -------- | ----------------------- | -------- | ----- |
| 0    |       |          |                         |          |       |
| 1    |       |          |                         |          |       |
| 2    |       |          |                         |          |       |
| 3    |       |          |                         |          |       |
| 4    |       |          |                         |          |       |

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
