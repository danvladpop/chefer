# Prompt: apply the 10 Oct UI/UX feedback — design first, then code

Paste everything below the line into a new Claude Code session started in `/Users/danpop/work/git-projects/chefer`.

---

You are redesigning parts of the Chefer mobile app (Expo, `apps/mobile`) from today's UI/UX review, **design first on our design canvas, then in code**. Work in two phases with a hard stop between them.

## Inputs (read all before planning)

1. **The feedback, verbatim:** `/Users/danpop/work/git-projects/chefer/docs/design/feedback/2026-10-10/feedback.md` (untracked in the main checkout — use this absolute path; copy the whole folder into your branch in Phase B). Read every bullet. Also open the six reference screenshots in that folder (`ref-1…ref-6`) and look at them. They are **layout inspiration only**.
2. **The design canvas** (a claude.ai Design artifact, private to the owner): https://claude.ai/artifact/SBQUh2dcY14U3p4gcnJ4xj. It has 72 boards across 8 pages: Foundations, Auth & onboarding, Today, Plan & Shop, Recipes & cooking, Train, You & settings, Following.
   - Each board is one screen or sheet, drawn as the app renders today on `master`, in the revamp shell (`mobileShellV2` on), light theme.
   - Read it with your Artifact tool (`action: "read"`), never with a web fetch. Read the canvas's `SKILL.md` and `artifact-type/reference/format.md` for the board format and publishing rules.
   - To change boards, edit the files and publish them to that same URL. Send `project/canvas.json` only when you add, remove or move boards. Never create a new canvas.
3. **The repo snapshot of the canvas:** `docs/design/mobile/`. Its README has the board → route map.
4. **Board-drawing conventions and tools:** `/Users/danpop/work/git-projects/chefer/docs/design/feedback/2026-10-10/board-tools/`
   - `conventions-v2.md` holds the tokens and chrome. `conventions-v1-base.md` holds the file skeleton, hard rules and sheet pattern. `icons.md` is the inline-SVG icon set.
   - `check.sh <folder>` renders boards headlessly and flags any that are clipped, or have more than 60px of empty space. Run it on every board you write.
5. **The revamp plan:** `docs/mobile-ux-revamp/plan.md` (phases, guardrails, the flag). Also read `CLAUDE.md`, `mobile_native_plan.md` §4 (the mobile test ladder) and `mobile_parity_backlog.md`.
6. **Code:** work from the latest `origin/master` in a fresh worktree/branch. Never work from the currently checked-out branch: it is far behind `master`.

## Decisions already made by the owner (do not re-ask)

- **Rename the Plan tab to "Meals".** The tab bar becomes Today · Meals · Shop · Train · You. Keep the `/plan` route; change the label, a11y label, titles and copy.
- **Keep Chefer's brand.** Borrow layouts from the references (half-ring calorie gauge, macro rows with emojis, stat tiles, workout cards, a completed-workout summary) but render them in the existing colour roles from `packages/tokens/src/color.ts`. Do not import the references' navy/lime or berry palettes.
  - Macro emojis are welcome (e.g. 🍖 protein, 🍞 carbs, 🥑 fat — choose clear ones). They must sit next to the text label and never replace it.
- **Scope = the revamp shell only.**
  - Every behaviour or layout change goes behind `mobileShellV2`: inside `app/(main)` or `useShellV2()` branches. Users on the shipped Food|Gym shell must see no change until the owner flips the flag.
  - Don't change the flag or the `FEATURE_FLAGS` env.
  - Light theme only for now; dark mode is phase 4.
- **Hard checkpoint after Phase A.** Do not touch `apps/mobile` until the owner approves the redesigned boards.
- **After Phase B:** open the PR and **merge it yourself once CI is fully green**.

## Phase A — redesign on the canvas, then STOP

1. Read the feedback and images, then the current boards for:
   - Today: `Home`, `AddSheet`, `Tracker`
   - Meals: `Plan`, `PlanSettingsSheet`, `WeekOptionsSheet`, `Cookbook`
   - `Shop`
   - Train: `Train`, `TrainingRoutine`, `Workout`, `Summary`, `GymSettings`
   - You: `You`, `Settings`, `Progress`
   - plus `Main` (Foundations)
2. Write a short design plan first: a table of each feedback bullet → the board(s) that answer it → what changes. Keep it in your reply, not on the canvas.
3. **Before changing anything,** duplicate each board you will modify onto a new canvas page "Before — 10 Oct", with the suffix `Before` (e.g. `HomeBefore.dc.html`), so the owner can compare. Then redesign the originals in place. Add new boards where needed, e.g.:
   - a Stats screen reached from Today
   - a Meals settings section under You
   - a "Log a workout" sheet
   - a redesigned workout-complete Summary
4. What the feedback asks for, per area. Interpret with judgement and keep text to the minimum the user needs:
   - **Everywhere**
     - Much less text.
     - One shared **tile/grid component** for recipes (Meals day view, Cookbook) and workouts (Train past workouts, routine days), so they look and behave alike: framed image or illustration, title, one meta line, one action.
     - Make **Cookbook** (under Meals) and **Routines** (under Train) equally prominent entry points for adding a recipe or a routine.
     - **Ask Chef** becomes a global AI assistant button in the top bar of every tab (Today, Meals, Shop, Train, You). It helps with meals _and_ workout routines.
     - Add the new shared components to **Foundations** (`Main.dc.html`).
   - **Today**
     - A calorie gauge diagram: consumed, remaining and target, with three macro rows that have emojis and bars.
     - The next meal, with Eaten / Cook now / Swap / Skip.
     - Today's training: what's planned, or once logged, a stats card (duration, kcal burned, exercises).
     - A "Log a workout" action alongside "Cook now".
     - Weight entry that turns into a small progress widget once today's weight is logged.
     - A friendlier replacement for "See full day".
     - A **Stats** button leading to eating trends, weight change and training streaks. Reuse or reshape `Progress` rather than inventing data the API doesn't have.
   - **Meals** (was Plan)
     - Remove everything training-related.
     - Day strip at the top, a This week / Next week toggle, and the selected day's meals in the shared grid with well-framed images.
     - Change a meal; change/regenerate the week.
     - Big, readable day totals (kcal + macros).
     - Move plan settings to **You**.
     - Strip the banners, pills and explanatory copy down to what's essential.
   - **Train**
     - Calmer layout: this week's progress, any ongoing workout, the next routine (with edit, start, and log a freestyle workout), and past workouts in the shared grid.
     - Move every settings entry to **You**.
     - Take cues from refs 4–6 for the live workout header and the completed summary.
   - **Shop**
     - Minimal text.
     - Search and add-item.
     - A compact cost estimate (one line or chip).
     - Checkbox list grouped by type (Fruit & veg, Dairy, …).
     - Checked items move to the bottom of their group.
   - **You** becomes the single home for all settings: account, Meals/plan settings, training/gym settings, notifications.
5. Stay inside what the API can actually provide.
   - Check the tRPC routers and types for every number you show: kcal burned, streaks, weight trend, cost.
   - When a design needs data or behaviour that doesn't exist, keep it in the design but list it in your reply as "needs API work" rather than faking it later.
6. Follow the board conventions exactly: real copy, 390pt boards, `check.sh` clean, links between boards working, no real personal data.
7. Publish to the canvas URL.
8. **STOP and report:** the canvas link, a before→after list per screen, the feedback-to-board mapping, open questions, and the "needs API work" list. Wait for the owner's approval or comments on the boards. If they comment on the canvas, read the comments with your ArtifactComments tool and iterate.

## Phase B — implement the approved boards (only after the owner says go)

1. Branch from the latest `origin/master` in a worktree.
2. Implement the approved boards in `apps/mobile`, all behind `mobileShellV2`:
   - Build the shared tile/grid, gauge, macro row and stat tile as reusable primitives in `@chefer/ui-mobile` (shared-first, per CLAUDE.md).
   - Use colour roles and named text styles only; the design-drift guard test ratchets raw colours.
   - Follow CLAUDE.md's motion rules (`PressableScale`, tokens, reduced motion, MO-xx comments) and a11y rules: 44pt targets, labels, emojis never the only signal.
3. Moving settings into You:
   - Keep existing routes working: deep links, notifications, old URLs.
   - Any API change must be additive and backward-compatible. Shipped app-store binaries can't be broken.
4. Docs, same PR:
   - `infrastructure.md` and `business_flow.md` for route/flow changes.
   - The revamp plan's status table.
   - Re-export the changed boards into `docs/design/mobile/`, then run `pnpm exec prettier --write "docs/design/mobile/*.{json,md}"`.
   - Commit this feedback folder too.
5. Platform parity:
   - The revamp shell is mobile-only (web ignores the flag).
   - For each user-facing change that should also reach web (e.g. Shop checked-items-to-bottom and grouping, settings consolidation), add an entry to `mobile_parity_backlog.md`, or apply it to `apps/web` if it is a shared behaviour change.
   - Say in the PR which you chose.
6. Verify with the mobile ladder from `mobile_native_plan.md` §4: typecheck → Jest (incl. design-drift and colour-sync) → contract tests → `expo export`. Then show the screens running:
   - Use the iOS simulator with the "New design" preview switch on (You → Preview), plus Android `Pixel_8` for layout-heavy screens.
   - Attach before/after screenshots to the PR.
   - **Never start an EAS/native build or store submission.** The owner builds manually. OTA publishes automatically on merge.
7. Open the PR:
   - Conventional commits.
   - The PR body maps each feedback bullet to its change and lists the "needs API work" items.
   - Watch CI with the app's PR tools (bind the PR, turn on auto-fix).
   - Fix failures; never skip or weaken tests.
   - When every check is green, merge with a merge commit.
   - Report what shipped behind the flag and how the owner can preview it.

## Ground rules

- If something in the feedback conflicts with Apple/Android guidelines or the revamp plan, decide and note it, or ask if it's a product call. Examples: tab-bar actions, "settings only under You" vs in-context shortcuts.
- Don't invent features or numbers the backend can't provide.
- Ask the owner before anything destructive or outward-facing beyond the PR described here.
