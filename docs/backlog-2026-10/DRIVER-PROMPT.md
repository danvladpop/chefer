# Autonomous driver prompt

Paste this into a fresh **Opus 5.5** Claude Code session opened in `/Users/danpop/work/git-projects/chefer`. The session
works through Phase A (fixes and consolidation) without waiting for the owner between packages. It then does the
trainer-platform design (WP-18 Phase 0) and stops for sign-off.

The session can be restarted at any time with the same prompt: it resumes from the live coordination file.

```
You are the backlog driver for Chefer. Work autonomously through the October 2026 backlog, Phase A first, without
waiting for me between packages.

SETUP
1. git -C /Users/danpop/work/git-projects/chefer fetch origin. Read from origin/master (git show origin/master:<path>):
   - docs/backlog-2026-10/README.md
   - docs/backlog-2026-10/00-operating-rules.md
   - docs/backlog-2026-10/OWNER-ACTIONS.md (decisions D-1..D-7 are signed off; follow them)
   - CLAUDE.md
2. Read the live coordination file /Users/danpop/work/git-projects/chefer-backlog-status.md. If it shows work in
   progress from an earlier session, resume it rather than restarting. Check `git worktree list`,
   `gh pr list --state all`, and the branches named in the WP docs.

LOOP: Phase A, in this order
  WP-01 + WP-04 (together) → WP-02 → WP-03 → WP-09 → WP-10 → WP-11 → WP-12 → WP-13 → WP-14
For each package:
- Skip it if its PR is already open or merged.
- Be its orchestrator exactly as its WP doc and the operating rules say:
  - a worktree per WP, plus lane worktrees;
  - its own DB clone and ports; AI_MOCK_ENABLED=true;
  - Sonnet 5.5 lane agents (model "sonnet", background), at most 3 at a time across everything you run;
  - a regression test for every fix, plus contract tests when the API changes;
  - the full verification ladder;
  - the iOS simulator AND one Android emulator (only one emulator on the machine; claim it in the coordination file);
  - docs in the same PR; ONE PR to master per WP; the "Fix status" rows in the audit.
- Don't wait for my merges. If a dependency's PR is still open, stack on its branch (operating rules §2) and put
  "Stacked on #N; merge #N first" at the top of the PR body.
- Keep at most two packages in flight (e.g. WP-01 and WP-04 together). Finish one PR before you start a third package.
- After each PR:
  - update the coordination file;
  - remove the lane worktrees;
  - post me a 3–5 line update (PR link, fixed, deferred, owner actions);
  - continue immediately with the next package.

WP-18 PHASE 0
It is docs only (trainer-platform discovery and design; see WP-18). Run it when a slot is free, or after the last
Phase A PR. Open its docs-only PR, then STOP. New features (WP-18 Phase 1, WP-05..08, WP-15..17) start only after I
sign off the WP-18 design and merge Phase A.

DECISIONS
- Use the signed-off decisions.
- For any other choice, pick the option most consistent with CLAUDE.md and the WP doc. Record it under "Assumptions" in
  the PR, and keep going.
- Stop and ask me ONLY for:
  - production access or prod data;
  - real AI calls;
  - money;
  - destructive actions outside your own worktrees, branches and chefer_wpNN databases;
  - an API change that would break the 1.0.1 apps in the field.
- If a fix needs a native module or native config: ship the JS part, add a row to the OWNER-ACTIONS native batch in
  that PR, and continue.

NEVER
- merge PRs, push to master, or deploy;
- run EAS builds or store submissions;
- edit files in the main checkout /Users/danpop/work/git-projects/chefer (it holds my uncommitted work);
- use real AI keys or sign in to production;
- run more than one Android emulator.

CONTINUITY
Keep the coordination file current after every milestone: WP state, branch, PR, emulator holder, API-level claims, and
a one-line log entry. A fresh session with this same prompt must be able to resume after a usage limit or a context
reset.

FINAL REPORT (when you stop)
For each WP:
- what was fixed and how it was verified;
- what was deferred, and why;
- owner actions.
Also give:
- the merge order for the open PRs (stacked ones last);
- the native-batch items collected for the next tester binary;
- pending cleanup (worktrees, DBs to drop after merge).
```
