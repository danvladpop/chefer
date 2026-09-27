# Persona Study 2026-09 — Stage 3: UX/UI design spec

**Status: final (rev 2), built on the final n/10 synthesis** ([`01-research-synthesis.md`](./01-research-synthesis.md)
v3, CI-01…CI-54) **and the final strategy** ([`02-business-strategy.md`](./02-business-strategy.md) rev 3, B-01…B-39).
**`UX-xx` IDs are stable and equal the `B-xx` numbers**; nothing is ever renumbered. Every change since the interim
draft is listed in the [UX changelog](#appendix-b--ux-changelog) (Appendix B), which stage 4 updates its tasks from.
The **Now** set here equals stage 2's Now set exactly: UX-01, 02, 03, 04, 05, 06, 07, 08, 10, 11, 12, 13, 19, 21, 22,
25, 26, 35, 36, 39.

Role: principal product designer, native mobile (iOS HIG + Material aware), writing for implementation agents.
Date: 2026-09-27. Build read: `master` @ `f8f7f74`.

> **Caveat (carried from stages 1–2).** The users are synthetic: an LLM method-acting each persona on the real app.
> Every spec below is a strong hypothesis, not a validated design. Counts ("4/10") are indicative. Where a spec rests
> on a load-bearing assumption, its **Validate** line names the real-user test from stage 2 §8.1 (V1–V11). Premium was
> free in the build, so nothing here is evidence of conversion.

**Who this is for.** Implementation agents (stage 4 turns each spec into `T-xx.n` tasks). Everything an agent needs to
build the UI is here: flow, states, exact copy, components, files, a11y, analytics, acceptance criteria. API shape,
migrations and task sizing are stage 4's job; where a spec needs data the API does not return today, it says
**"needs (additive)"** and describes the field, never a breaking change (CLAUDE.md "Never break shipped mobile
clients").

**Conventions**

- Copy in `code quotes` or in a Copy table is **exact**: ship it word for word (British spelling, sentence case,
  curly apostrophes `’` in UI strings, `…` not `...`). `{braces}` are variables.
- "Mobile" = `apps/mobile` (one Expo codebase, iOS + Android). "Web" = `apps/web`. Kit = `@chefer/ui-mobile`
  (`packages/ui-mobile`). Tokens = `@chefer/tokens` (motion, radius, elevation) + the colour tokens in
  `apps/mobile/global.css` mirrored in `packages/ui-mobile/src/components/theme.ts`.
- **⚖** marks an owner decision left open by stage 2 §9. The spec designs the **recommended** option and describes
  the alternative in one paragraph, so either can ship without a redesign.
- Evidence links are relative to this folder (`../screenshots/P04/049-parfait-detail.png`). Moment IDs (`P04-M13`)
  point to the session files; `CI-xx`, `D-x`, `J-x` to stage 1; bugs are written **bug B-nn** (stage 1 §7) to avoid a
  clash with backlog IDs.
- Every spec has the same skeleton: Problem & evidence · User story · Flow & states · Copy · Components & files ·
  Interaction & motion · Accessibility · Analytics · Acceptance criteria · Edge cases · Web parity · Dependencies.
  Next items use a lighter skeleton but keep acceptance criteria and the web-parity note.

Contents: [0 How the app looks today](#0-what-the-app-looks-like-today-baseline) ·
[1 Principles](#1-cross-cutting-design-principles) · [2 Patterns & shared components](#2-shared-patterns-and-components) ·
[3 Now specs](#3-now-specs) · [4 Next specs](#4-next-specs) · [5 Later](#5-later) ·
[6 Don't and Stop](#6-dont-and-stop) · [7 Agent work packaging](#7-agent-work-packaging) ·
[Appendix A: copy deck index](#appendix-a--copy-deck-and-string-tables) ·
[Appendix B: UX changelog](#appendix-b--ux-changelog)

---

## 0. What the app looks like today (baseline)

Designing against the real build, not an idealised one. Read from the screenshots and the source at `f8f7f74`.

| Area                 | Today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Screens / files                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Visual language      | Light-only, warm off-white surfaces, brand brown `#944a00` (`--primary`), white cards with 1 px `border-border`, 12–16 pt radius, uppercase tracked eyebrows ("TODAY", "WEEKLY OUTLOOK"), 24 pt bold titles, 44 pt controls. Emerald chips for "good" (cost, "PLAN ON TRACK"), amber for premium/over-target, red for allergen conflicts.                                                                                                                                                        | [Food Today](../screenshots/P04/031-after-onboarding.png), [Plan week sheet](../screenshots/P02/058-week-menu.png), `packages/ui-mobile/src/components/theme.ts`                     |
| Navigation           | Two tab groups behind a `Food \| Gym` segmented control at the top-left of every tab root, avatar top-right. Food: Today · Plan · Shop · Cookbook · More. Gym: Today · Routine · Exercises · Stats. The persisted mode decides where "/" opens.                                                                                                                                                                                                                                                  | `apps/mobile/app/(food)/_layout.tsx`, `(gym)/_layout.tsx`, `src/features/gym/components/mode-switch.tsx`, `src/features/gym/mode-store.ts`                                           |
| First launch         | "Welcome back / Sign in" with no logo or value statement; "Create one" is a small link. Register says "Meal planning that fits your goals".                                                                                                                                                                                                                                                                                                                                                      | [first launch](../screenshots/P03/001-first-launch.png), `app/(auth)/index.tsx`, `login.tsx`, `register.tsx`                                                                         |
| Onboarding           | Single-choice "What brings you here?" (3 cards). Food steps: free-text chip editors for restrictions / allergies / dislikes; optional goal and metrics. Train exits to the 7-step gym wizard (strongest onboarding in the app, D3).                                                                                                                                                                                                                                                              | [intent](../screenshots/P02/008-onb-step1-select.png), `src/features/onboarding/*`, `src/features/preferences/components/safety-step.tsx`, `src/features/gym/setup/setup-wizard.tsx` |
| Food Today           | A calorie ring card, Quick add, Snap to log, next-meal hero, "Later today", Weekly outlook, weight card, workout card, favourites. Same layout for every job.                                                                                                                                                                                                                                                                                                                                    | `app/(food)/index.tsx`, `src/features/dashboard/components/*`                                                                                                                        |
| Plan                 | Week navigator (± 1 week), day chips, meal cards with a swap button; week-level actions hidden in a sheet behind the week label chevron.                                                                                                                                                                                                                                                                                                                                                         | [week sheet](../screenshots/P02/058-week-menu.png), `app/(food)/meal-plan.tsx`, `src/features/meal-plan/*`                                                                           |
| Shop                 | "To buy / In my kitchen" segments, collapsed aisle groups, natural-language add, cost chips. No share.                                                                                                                                                                                                                                                                                                                                                                                           | [Shop](../screenshots/P08/032-tobuy.png), `app/(food)/shopping-list.tsx`, `src/features/pantry/*`                                                                                    |
| Premium              | "Go Premium" card on Profile ("AI meal plans… nutrition profile"), "Upgrade — free for now", instant downgrade; a source-aware post-upgrade sheet whose "Regenerate this week" only navigates.                                                                                                                                                                                                                                                                                                   | [Profile](../screenshots/P04/053-see-premium.png), [post-upgrade](../screenshots/P02/055-upgrade.png), `app/profile.tsx`, `src/features/premium/post-upgrade-sheet.tsx`              |
| Gym                  | Today (week strip, ring, next workout, start), logger with Why?/Next time (D1–D2), stats, routine editor; settings only reachable from the sync banner.                                                                                                                                                                                                                                                                                                                                          | [Gym Today](../screenshots/P03/057-after-done.png), [summary](../screenshots/P01/087-workout-summary.png), `src/features/gym/*`                                                      |
| Kit                  | `Badge`, `Button` (all sizes ≥ 44 pt), `Card`, `Chip`/`ChipGroup` (single/multi), `ConfirmSheet`, `EmptyState`, `ErrorState`, `Input`, `KeyboardAwareScrollView`, `NumericReturnBar`, `PasswordInput`, `ProgressBar`, `ProgressRing`, `Screen`, `SegmentedControl`, `Sheet`, `Stepper`, `ValueStepper`, `Text` (max font scale 1.8, dense 1.3), charts, motion (`PressableScale`, `haptics`, `CountUp`, `useReducedMotion`). **No toast/snackbar, no time picker, no explain sheet** in the kit. | `packages/ui-mobile/src/index.ts`                                                                                                                                                    |
| Platform constraints | No analytics SDK, no clipboard module, no date/time picker module. RN core `Share.share` is available (used by data export and gym CSV). Anything that adds a native module needs a native rebuild (runtime fingerprint changes); everything else ships over OTA.                                                                                                                                                                                                                                | `apps/mobile/package.json`                                                                                                                                                           |

---

## 1. Cross-cutting design principles

Derived from the five cross-cutting themes of stage 1 and the delights to protect (D1–D19). Each principle names the
evidence and the rule an implementer must follow. Specs cite them as **P1…P13**.

### P1 — Start from the job, not from a diet frame

_Evidence:_ CI-01 (8/10 landed on a calorie ring), CI-03 (8/10), CI-04 (8/10); P05: "I didn't ask to be counted."
The counter-case proves the rule: for the tracker (P07) the ring _is_ the right home (D20).
_Rule:_ what a user sees first is decided by the **jobs** they chose (UX-03) and the **moment** (UX-04), never by a
default. Calories, weight and body metrics appear only for users who chose "Track what I eat" or set a goal (B-31); for
trackers they stay first. A skipped
step means "don't show me this", not "use the default".

### P2 — Show your work (the "Why?" pattern everywhere)

_Evidence:_ D2 is the most-praised pattern in the study; CI-06, CI-05, CI-19 are its absence on the food side.
_Rule:_ every number, safety claim and automatic decision is tappable and explains itself in plain words through one
shared sheet (**PAT-1 Explain sheet**). The explanation names its inputs ("because you train 4× a week"), not the
algorithm. If a number cannot be explained, do not show it.

### P3 — The safety floor is visible and never over-claims

_Evidence:_ CI-10, CI-19, CI-26, CI-38 (the only Sev-4 moments); P04: "I typed two words into a box. Does it know
that means walnuts?"
_Rule:_ a restriction is entered from a structured list, **read back** in full at entry, and **echoed** wherever food
is proposed (plan, recipe, swap, list, chat) with the words **"Checked for"**. Never write "safe", "allergen-free",
"suitable for" or a green tick that implies a guarantee. A failed or impossible check is shown, never silent (PAT-2).
Wording is final only after counsel (UX-26) and V1.

### P4 — Lock after value, and name the job

_Evidence:_ CI-02 (7/10 hit a lock on their core job at first touch), CI-12 (9/10), D15 (the AI Chef lock that works).
_Rule:_ a lock never replaces a whole screen and never accepts input it won't save. It says which job premium does
("Keep portions for your table of 4"), offers the free way to do the job now, and opens a source-aware premium sheet
(PAT-3). At most one upgrade nudge a day across the app (port of web `nudge-cap.ts`).

### P5 — Never lose the user's work

_Evidence:_ CI-18 (Regenerate wiped picks), CI-34 (AI swap with no undo), bug B-23 (ticks lost on date change),
bug B-10 (budget silently discarded).
_Rule:_ anything that replaces user-chosen content asks first and offers "keep my changes"; anything instant offers
**Undo** for 6 s (PAT-4 Snackbar); every input either saves (with visible confirmation) or is visibly disabled.

### P6 — Weekly rhythm, no shame

_Evidence:_ D3 ("Missing a session changes nothing"), CI-35, P03's delete trigger "if it guilt-trips me with the
streak", stage 2 §4.3.
_Rule:_ goals are weekly; there are no red days, no "you missed", no percentage from a partial day. Done is
celebrated once and then gets out of the way ("Done today · next session Tue").

### P7 — Plain words first, jargon on tap

_Evidence:_ CI-32 ("What's a goblet squat? What's 3 × 8-12?"), CI-36 ("Relative strength", e1RM unlabelled), CI-40
("Save Day", "Extras"), CI-09 ("Welcome back?").
_Rule:_ write for the beginner, let the expert tap for detail. Domain terms are spelled out on first use and wrapped in
a **GlossaryTerm** (PAT-7). See the copy system in §2.7.

### P8 — One place for each setting, reachable in two taps

_Evidence:_ CI-23 (gym settings unreachable), CI-24 (currency 4 levels deep), CI-11 (meals-per-day only in premium
onboarding).
_Rule:_ every setting has one home listed in the settings map (§2.9) and a "Settings" entry from both modes. A setting
asked in onboarding is editable later in the same words.

### P9 — Honest numbers, never changed silently

_Evidence:_ CI-05 (prices nobody believed), CI-06 (7/10: −79 %; protein moved 128 → 93 g after gym setup without a
word, bug B-48), CI-13 (totals that don't say which days), B-33. P10's "ONE thing": "Make every number tappable."
_Rule:_ estimates carry "about" / "~" and a range or a "rough estimate" label with an Explain sheet; totals say what
they cover ("Mon–Sun · 1 portion"); savings are itemised or not shown; no percentage from less than 3 logged days.
**A number the user relies on (a target, a plan, a streak) never changes without a notice that says what changed and
why, and offers to keep the old value** (UX-11). A user's own number (UX-35) is never overwritten by a computation.

### P10 — Respect the thumb, the keyboard and large text

_Evidence:_ CI-14 (keyboard hides buttons, 7/10, both OSes), CI-43 (truncation at XXL), CI-27 (10 taps for a time), D3 (XXL
works well where layouts stack).
_Rule:_ primary actions sit in a sticky footer or a Sheet `footer`; numeric inputs always get `NumericReturnBar`;
nothing below 44 × 44 pt; every new layout is checked at the largest Dynamic Type size the `Text` cap allows (1.8×)
and dense rows at 1.3× (`DENSE_MAX_FONT_SCALE`) — wrap, don't truncate, anything a user must read to decide.

### P11 — Protect what already works

_Evidence:_ D1–D4 (gym logger, Why?/Next time, setup wizard, exercise detail), D6 (consent sheet), D7 (video draft),
D8 (household setup), D9 (list in store), D10 (cook mode), D15 (AI Chef lock), D18 (skippable goal), D20 (tracker home
for a tracker), D21 (snap speed), D22 (kindness that keeps its word), D23 (planned-meal ticking), D24 (privacy by
default), D25 (import safety fail-safe).
_Rule:_ every spec lists the delights it touches under **Protect**; an agent may not change their layout, copy or
timing unless the spec says so. Regression = failed acceptance.

### P12 — Build ready for dark mode and Romanian

_Evidence:_ CI-46 (no dark mode, on both OSes: P02 iOS, P07 Android), CI-24, B-23 (dark mode, now Next), B-24 (RO UI, Later).
_Rule:_ new UI uses semantic NativeWind classes backed by the CSS variables (`bg-card`, `text-foreground`,
`text-muted-foreground`, `border-border`, `bg-accent`, `text-primary`) — **no new hex literals, no `text-gray-*` /
`bg-white`** in new or touched components (existing ones are migrated by UX-23, now Next). New user-facing strings live
in a feature `copy.ts` module (shared ones in `@chefer/utils`), never inline in JSX, so B-24 is a translation, not a
refactor.

### P13 — Privacy by default is part of the product

_Evidence:_ D24 (no analytics SDK, no tracking prompt, AI consent off until asked: "no dark patterns so far", P10); D6
(8/10 praised the AI consent sheet); CI-54 (implied Terms consent, opt-out emails, no consent record).
_Rule:_ nothing that processes personal or health data is on by default unless the feature the user just chose needs
it; every consent is explicit, separate, recorded with its time, visible in Profile › Privacy & data and revocable
there, with honest copy about what happens to data already sent; no advertising identifiers or tracking prompts, ever
(UX-12, UX-26, UX-39).

---

## 2. Shared patterns and components

Patterns are built once (wave 0, §7) and reused by the specs. Each has an ID (`PAT-n`), the file it lives in, its API
in prose, and its rules. Kit components go in `packages/ui-mobile/src/components/` and are exported from
`packages/ui-mobile/src/index.ts`; components that need the router, tRPC or app state go in
`apps/mobile/src/features/<area>/`.

### 2.1 PAT-1 — Explain sheet (the food-side "Why?")

Generalises the gym `WhySheet` (`apps/mobile/src/features/gym/workout/workout-sheets.tsx` L97–140), which users
praised (D2), into a kit component so food numbers, prices, safety checks and training-day targets explain themselves
the same way.

- **New:** `packages/ui-mobile/src/components/explain-sheet.tsx` → `ExplainSheet`. Props: `visible`, `onClose`,
  `eyebrow` (e.g. `Why this target`), `title`, `sentence` (one plain-English paragraph, the answer), `rows`
  (`{ label, value }[]`, the inputs), `footnote?` (muted, e.g. how to change it), `action?` (`{ label, onPress }`,
  rendered in the Sheet footer as an outline button), `testID`.
- **Refactor:** gym `WhySheet` renders through `ExplainSheet` with identical copy, layout and testIDs (`why-sheet`,
  `why-sheet-sentence`). **Protect D2:** a visual diff of the gym Why? sheet before/after must be empty.
- **Trigger affordance ("explainable number"):** the number stays the primary text; next to it an
  `information-circle-outline` icon (16 pt, `text-muted-foreground`) inside a 44 × 44 pt hit area, or a `Why?` text
  link where the gym already uses one. The whole number + icon is one pressable with
  `accessibilityRole="button"` and `accessibilityHint="Explains where this number comes from"`.
- **Rules:** the `sentence` names the user's own inputs; no formula symbols; units in the user's system; one sheet per
  number (don't chain sheets); the `action` changes the input ("Change your goal"), never upsells.

### 2.2 PAT-2 — Safety states ("Checked for…", conflict, couldn't check)

One vocabulary for safety across every food surface. Lives in a new feature folder
`apps/mobile/src/features/safety/`:

| State                                                                                                                | Component                                                                                                                                                               | Look                                                                                                                                             | Copy pattern                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Checked** (all rules pass)                                                                                         | `CheckedForLine` (full, recipe detail / cook mode) · `CheckedForChip` (compact, cards and rows)                                                                         | `shield-checkmark-outline` icon, `text-muted-foreground` text on no fill (full) or `bg-muted` pill (chip). **Not green**: green reads as "safe". | Full: `Checked for {rules}` e.g. `Checked for tree nuts (Luca) · fish (Ana) · vegetarian (you)`. Chip: `Checked for {n}` with a11y label spelling the rules. |
| **Conflict**                                                                                                         | existing `AllergenWarningBanner` / `AllergenWarningChip` (`src/features/recipes/allergen-warning.tsx`), moved into `features/safety/` and re-exported from the old path | red, `warning` icon, `accessibilityRole="alert"`                                                                                                 | unchanged: `Contains {list}.` …                                                                                                                              |
| **Couldn't check** (an entry the matcher does not understand, or a condition)                                        | `UncheckedNotice`                                                                                                                                                       | amber `bg-amber-50` / `text-amber-800`, `help-circle-outline`                                                                                    | `Chefer can’t check for “{term}”, so plans don’t change for it.` + one next step                                                                             |
| **Dislike present** (soft, only where a disliked item is deliberately shown, e.g. search)                            | `DislikeChip`                                                                                                                                                           | `bg-muted`, `thumbs-down-outline`                                                                                                                | `{Name} doesn’t eat {item}`                                                                                                                                  |
| **Filtered for** (any list the filter shortened: Discover, Replace, cookbook search, AI Chef ideas)                  | `FilteredForLine`                                                                                                                                                       | one muted line with `funnel-outline` at the top of the list, tappable                                                                            | `Filtered for vegan + gluten-free · {n} hidden` (P10 had to probe the filter, CI-19)                                                                         |
| **Label caveat** (the risk sits in a bought product: stock, oats, soy sauce, curry powder, baking powder, chocolate) | `LabelCaveat`                                                                                                                                                           | amber `alert-circle-outline` inline on the ingredient line (recipe, cook mode, list) + one line under the Checked line                           | ingredient: `Buy certified gluten-free` · recipe: `Check the label: certified GF stock and oats` (P10: "'gluten-free' is a label, not a promise")            |

- **Where rules come from:** the union of the account owner's and household members' structured safety items
  (UX-01). The per-recipe list is computed server-side — **needs (additive):** a `safetyChecks` field on recipe, plan
  meal, picker row and list line payloads: `{ checked: { label, who }[], conflicts: string[], unchecked: string[] }`.
  Old clients ignore it.
- **Tap:** every Checked element opens the **"What we check" sheet** (`WhatWeCheckSheet`, an `ExplainSheet`
  instance): per person, the rules and what each keeps out, plus the limits paragraph (copy in UX-02).
- **Never:** show Checked for a surface that was not run through the one filter (UX-01); show a Checked state when
  `unchecked` is non-empty without the UncheckedNotice next to it.

### 2.3 PAT-3 — Lock with a taste, and the source-aware premium sheet

Replaces "cliff" locks and the Profile "Go Premium" card (CI-02, CI-12). Modelled on the AI Chef lock (D15,
`src/features/chat/locked-chat-preview.tsx`).

- **New:** `apps/mobile/src/features/premium/locked-feature-card.tsx` → `LockedFeatureCard`. Props: `source` (the
  existing upgrade source string, e.g. `household`), `job` (a key into the copy table in UX-10), `freeAction?`
  (`{ label, onPress }` — what you can do now for free), `compact?`. Layout: eyebrow `PREMIUM`, title = the job,
  one-line body = what premium does for that job, a primary text button `See what Premium adds` (opens the sheet), and
  the free action as a secondary button. `lock-closed-outline` 14 pt next to the eyebrow, never a padlock over content.
- **New:** `apps/mobile/src/features/premium/premium-sheet.tsx` → `PremiumSheet` (a `Sheet`, `maxHeight 90%`). Opened
  by every lock, nudge and the Profile plan card with a `source`. Content (copy in UX-10): the job headline, three
  job-specific bullets, "Also included" (collapsed), the plain-language beta terms, primary `Turn on Premium`, and
  `Not now`. On success it hands over to the post-upgrade sheet, which **does** the job (UX-08/UX-10).
- **Nudge cap:** new `apps/mobile/src/features/premium/nudge-cap.ts` on the gym KV store, same rules as web
  `apps/web/src/features/premium/lib/nudge-cap.ts` (one nudge per day across sources, 7-day cooldown per dismissed
  source). The pure rule moves to `@chefer/utils` so both platforms share it (stage 4 decides the exact split).
- **Rules:** a locked input is visibly read-only (`editable={false}`, muted fill, lock icon) or absent — never
  editable-and-discarded (bug B-10). Locks sit on the _second_ step of a job (the optimisation), not the first
  (the entry). One lock per screen.

### 2.4 PAT-4 — Snackbar with Undo

- **New:** `packages/ui-mobile/src/components/snackbar.tsx` → `Snackbar` + a tiny store/hook
  `useSnackbar().show({ message, actionLabel?, onAction?, durationMs? })`, mounted once in
  `apps/mobile/app/_layout.tsx` above the tab bar (bottom inset + tab bar height + 8 pt). JS only (Reanimated), so
  OTA-safe.
- Look: `bg-foreground` pill, `text-background` 15 pt text, action in `text-primary-foreground` semibold, 44 pt tall
  minimum, max width 560 pt, 16 pt side gutter. One at a time; a new one replaces the old.
- Motion: slide up 12 pt + fade over `duration.base` with `springs.gentle`; reduced motion = fade only. Default
  6 s; with an action 8 s; pauses while a screen reader is running (duration ×2).
- A11y: on show, `AccessibilityInfo.announceForAccessibility(message + ", " + actionLabel)`; the action is a real
  button reachable by swipe; the bar has `accessibilityLiveRegion="polite"` on Android.
- Haptics: `haptics.success` for confirmations, none for info.
- Used by: Regenerate (UX-08), AI swap and Replace (UX-08), list share done (UX-13), routine saved (UX-05), safety
  report sent (UX-01), meal logged from chat (UX-21).

### 2.5 PAT-5 — Confirm with "keep my changes"

`ConfirmSheet` (`packages/ui-mobile/src/components/confirm-sheet.tsx`) gains an optional `options` slot: a list of
`{ label, detail?, value, onChange }` switches rendered between the body and the buttons. Used for Regenerate
("Keep the 4 meals you chose") and downgrade ("You’ll keep / you’ll lose"). The destructive button names the object
and the scope: `Regenerate 28 Sep – 4 Oct`, never `OK`.

### 2.6 PAT-6 — Home cards (Today as a stack of jobs)

Food Today becomes an ordered stack of cards chosen by the user's jobs and the moment (UX-04). Each card is a
component under `apps/mobile/src/features/dashboard/components/` with the same shell: eyebrow (uppercase, tracked,
`text-muted-foreground`), title, one line of detail, one primary action, optional secondary text action. The order is
computed by a pure function `homeCardOrder({ jobs, localHour, trainingToday, workoutDoneToday, dinnerPlanned,
dinnerDone, hasGoal, shopDueTomorrow })` in `packages/utils/src/home-cards.ts` (unit-tested, shared with web). Cards:
`tonight` · `tomorrow` · `workout` · `nutrition` (the ring, only with a goal or tracking job) · `quick-log` ·
`week-glance` · `shop-due` · `weight` (goal only) · `favourites` · `coach-review` · `week-ready`.

### 2.7 PAT-7 — Copy system, jargon and the glossary

**Voice:** a friendly chef who is also a good coach: short sentences, second person, verbs first, no exclamation
marks except on a celebrated finish, no diet-culture words ("cheat", "guilt", "bad food", "earn"). British spelling.

| Rule                        | Do                                                  | Don't                                        | Evidence     |
| --------------------------- | --------------------------------------------------- | -------------------------------------------- | ------------ |
| Name the job                | `Plan 4 dinners`                                    | `Generate Plan`                              | CI-11        |
| Say what a total covers     | `≈ 996 lei · Mon–Sun · 1 portion`                   | `Est. total ~996 RON`                        | CI-05, CI-13 |
| Estimates are estimates     | `about`, `~`, `rough estimate`                      | two decimals on an estimate (`1.114,42 RON`) | CI-05        |
| Round money estimates       | whole lei / whole £ / $ above 20; one decimal below | `~142,00 RON`                                | CI-05        |
| Weekly, no shame            | `2 of 4 this week`                                  | `You missed 2`, red days, "0-week streak"    | P6, CI-35    |
| Spell out sets × reps once  | `3 sets of 8–12 reps` then `3 × 8–12`               | `3 × 8-12` first                             | CI-32        |
| Say what a button does next | `Regenerate 28 Sep – 4 Oct`                         | `Regenerate` → navigates                     | CI-07        |
| Next time is next time      | `+2.5 kg next time`                                 | `+2.5 kg today` (about next session)         | CI-31        |
| Checked, not safe           | `Checked for tree nuts`                             | `Safe`, `Nut-free`, `Allergen-free`          | P3           |
| Currency is the user's      | `lei` in RO copy, the ISO code in chips (`RON`)     | `EUR` fallback                               | CI-24        |

**GlossaryTerm (new):** `apps/mobile/src/components/glossary-term.tsx` wraps a term in text with a dotted underline
(`textDecorationStyle: 'dotted'`) and opens an `ExplainSheet` with the definition. Definitions live in
`packages/utils/src/glossary.ts` (shared with web): `sets-reps` ("3 × 8–12 means 3 sets. In each set, do 8 to 12
reps (repetitions). Stop 1–2 reps before you can’t do another."), `rir`, `e1rm` ("Estimated one-rep max: the most you
could lift once, worked out from a heavier set you did for several reps."), `delts` ("Deltoids: your shoulder
muscles. Side delts make shoulders look wider; rear delts sit at the back."), `flex-week`, `deload`,
`superset`, `back-off-set`, `working-set`, `compound`, `macro`, `kcal`, `portion`, `batch-prep`. Minimum 44 pt hit
area via `hitSlop`; `accessibilityRole="button"`, label `{term}, definition`.

### 2.8 PAT-8 — State matrix

Every new or changed screen and card specifies all of these; the spec's Flow section lists the ones that differ from
the default.

| State             | Default treatment                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading (first)   | Skeleton of the card's own shape (`bg-muted` blocks, 1.2 s shimmer, off under reduced motion); a spinner only for full-screen waits > 300 ms                                      |
| Loading (refresh) | Keep content, `RefreshControl`                                                                                                                                                    |
| Empty             | `EmptyState` with a verb-first action; say _why_ it is empty if the app knows (filter, search, tier)                                                                              |
| Error             | `ErrorState` "Couldn’t load {thing}" + "Nothing has been changed." + Try again. A failed load is never shown as empty (F-X-3-1 rule already in code)                              |
| Offline           | Gym works fully offline (protect D1). Food screens show cached data with a muted line `Offline · showing what was saved {time}`; write actions disabled with `Needs a connection` |
| Free vs premium   | Free shows the free way to do the job + one `LockedFeatureCard` at most; premium shows the result with its Explain sheet                                                          |
| Large text (1.8×) | Rows wrap to two lines; chips wrap; numbers never truncated                                                                                                                       |

### 2.9 PAT-9 — Navigation model and the settings map

**Keep** the two-mode model (Food | Gym) — it tested well enough and gym users liked the separation (D1–D3) — with
three changes:

1. **The switch shows where you are.** `ModeSwitch` derives its selected value from the current route group
   (`useSegments()[0] === '(gym)'` or a `/gym/*` route → `gym`, else `food`), and writes the persisted mode only on a
   user switch (fixes bug B-14, CI-39).
2. **Launch lands on the job of the moment** (UX-04 `landingFor`), not simply the last mode.
3. **A Settings entry in both modes.** A `settings-outline` icon button (44 pt) sits left of the avatar in the
   `ModeSwitch` header row on every tab root, opening a new **Settings hub** screen `apps/mobile/app/settings.tsx`.
   "Preferences" in More is renamed `Settings` and points to the same hub.

**Settings hub** (new `apps/mobile/app/settings.tsx`, grouped list, each row → the existing screen or section):

| Group    | Row (exact label)                | Destination (existing unless marked new)                                                                                                       |
| -------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| You      | `What you use Chefer for`        | jobs editor (new, UX-03)                                                                                                                       |
| You      | `Goal & body`                    | `preferences.tsx` Goal & body card (anchor)                                                                                                    |
| You      | `Your targets`                   | `preferences.tsx` targets card (new, UX-35)                                                                                                    |
| Food     | `Allergies & diets`              | `preferences.tsx` Food safety card (anchor)                                                                                                    |
| Food     | `How you cook`                   | new card in `preferences.tsx` (UX-07)                                                                                                          |
| Food     | `Household`                      | `household.tsx`                                                                                                                                |
| Food     | `Money & units`                  | `preferences.tsx` Units & currency card                                                                                                        |
| Food     | `Weekly budget`                  | `preferences.tsx` budget card                                                                                                                  |
| Food     | `Plan my week automatically`     | `preferences.tsx` auto-plan toggle (default off for new accounts, ⚖ D-13, UX-39)                                                               |
| Training | `Training days & reminders`      | `gym/settings` (was unreachable, bug B-19; UX-36): weekday kinds (Lift / Run / Long run, UX-06), clock-time reminder, "quiet for N days" nudge |
| Training | `Pause training`                 | `gym/settings` pause section (UX-36)                                                                                                           |
| Training | `Units, equipment & weekly goal` | `gym/settings`                                                                                                                                 |
| Training | `Workout history`                | Gym › Stats › History (UX-36)                                                                                                                  |
| Training | `Export workouts`                | `gym/settings` export row                                                                                                                      |
| Account  | `Plan & Premium`                 | Profile plan section (UX-10)                                                                                                                   |
| Account  | `Emails`                         | Profile › Privacy & data › Emails (digests opt-in, UX-39)                                                                                      |
| Account  | `Privacy & data`                 | Profile privacy section (UX-12, UX-26, UX-39)                                                                                                  |
| Account  | `Sign out`                       | ConfirmSheet `Sign out of Chefer?` (fixes P06-M47, no confirmation)                                                                            |

### 2.10 PAT-10 — Time picker (JS, OTA-safe)

- **New:** `packages/ui-mobile/src/components/time-picker.tsx` → `TimePicker` (value `{ hour, minute }`,
  `onChange`, `use24h` from the device locale via `Intl.DateTimeFormat().resolvedOptions().hourCycle`).
- Layout: a row of four **quick picks** as `Chip`s (`7:00`, `12:30`, `18:00`, `19:30` in the locale's format), then
  an hour grid (6 columns × 4 rows, 44 pt cells, 5 am–11 pm shown by default with `Earlier` / `Later` toggles) and a
  `SegmentedControl` for minutes `:00 :15 :30 :45`. 12-hour locales show `AM/PM` headers on the grid. Two taps reach
  any quarter hour (CI-27: was 9–11).
- A11y: every cell `accessibilityRole="button"`, label `7 PM` / `19:00`; the selected time is announced.
- Alternative (not recommended now): `@react-native-community/datetimepicker` gives the native wheel/clock but adds a
  native module (native rebuild, store review). Revisit with the next native release.

### 2.11 PAT-11 — Keyboard and forms

Applies to every touched form (CI-14, 7/10): the screen scrolls in `KeyboardAwareScrollView`; each field calls
`useScrollFieldIntoView`; numeric pads get `NumericReturnBar` (`Done`, or `Next` in a chain via `useFieldChain`); the
primary button is in a sticky footer or a `Sheet` footer, never inline under the fields; the first tap on a button
while the keyboard is up performs the action (`keyboardShouldPersistTaps="handled"` on every ScrollView that holds a
button). Inputs render at 16 pt (already global).

### 2.12 PAT-12 — Accessibility, motion and platform conventions

- **Touch targets** 44 × 44 pt minimum (kit already enforces on Button/Chip; new pressables use `min-h-11`, or
  `hitSlop` for inline links).
- **Labels:** every icon-only control has `accessibilityLabel`; every toggle has `accessibilityState`; cards that
  navigate are one element with a label that reads like a sentence (`Tonight: Lentil curry, 25 minutes. Cook it.`).
- **Dynamic Type:** body text uses `Text` (cap 1.8×); dense rows (week strips, day chips, macro bars) use
  `DENSE_MAX_FONT_SCALE`; nothing a user must read to decide is truncated at any size — wrap instead (CI-43).
- **Screen readers:** order follows visual order; announcements for async results (plan ready, list shared, logged);
  VoiceOver and TalkBack checked on hardware before store launch (V9).
- **Motion:** use `@chefer/tokens` `duration` / `springs` only; card enter = fade + 8 pt rise, staggered 40 ms, max
  6 items; all motion off or reduced to fades when `useReducedMotion()`; haptics via `haptics.*` only on commit
  actions (tick, log, finish, share done), never on scroll.
- **Colour:** meaning never by colour alone — every state has an icon and words (safety, over-target, done).
- **Platform:** share uses the OS share sheet (iOS `share-outline`, Android `share-social-outline` icon); Android
  back closes sheets (Sheet already does) and never exits a multi-step flow without the same confirm iOS shows; date
  and time formats from the device locale; system back gesture disabled only in the active workout (existing).

### 2.13 PAT-13 — Analytics conventions (with UX-12)

Every spec's Analytics section uses the event names from stage 2 §7.3 through one typed wrapper
(`apps/mobile/src/lib/analytics.ts`, UX-12). Properties are counts, booleans and enums only — **never** allergy names,
diet names, conditions, weights, food text or free text. Where a spec needs a category, it sends an enum
(`kind: allergy|diet|dislike`) or a count. Analytics itself follows P13: anonymous by default (or opt-in, ⚖), no
advertising identifiers, no tracking prompt, a visible switch.

### 2.14 PAT-14 — Change notice ("never change it silently")

Used whenever the app changes a number or rule the user relies on (UX-11 targets, UX-35 coach proposals, UX-06
training-day rules, UX-08 regenerated weeks, UX-36 streak/pause rules).

- **New:** `apps/mobile/src/features/dashboard/components/change-notice-card.tsx` → `ChangeNoticeCard` (props: `title`,
  `before`, `after`, `reason`, `primary` = keep the new value, `secondary` = keep the old one, `why` → ExplainSheet).
  Rendered at the top of Food Today (or Gym Today for gym rules) until answered; one at a time, newest first.
- Layout: eyebrow `CHANGED`, title (`Your protein target changed`), a before → after row (`128 g → 93 g`), one reason
  sentence (`Because you finished gym setup: lifters get 1.6 g per kg of body weight.`), buttons `Use the new target` /
  `Keep {before}`, text link `Why?`.
- Rules: the change is _pending_ until answered if the user had set the old value themselves (UX-35) — otherwise it
  applies immediately and the card offers to revert. The card never auto-dismisses; `Keep` writes the old value back as
  the user's own. Motion: slides in once; no haptic. A11y: `accessibilityRole="alert"` on first render.

---

## 3. Now specs

Now items in number order. Stage 2's build order (§6.1) is honoured by the packaging in §7, not by the order here.

| Track                     | Specs                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Trust floor               | [UX-01](#ux-01) · [UX-02](#ux-02) · [UX-11](#ux-11) · [UX-39](#ux-39) · [UX-22](#ux-22) · [UX-26](#ux-26)                   |
| Beachhead activation      | [UX-25](#ux-25) · [UX-03](#ux-03) · [UX-04](#ux-04) · [UX-05](#ux-05) · [UX-36](#ux-36) · [UX-06](#ux-06) · [UX-35](#ux-35) |
| Planning and logging core | [UX-08](#ux-08) · [UX-07](#ux-07) · [UX-10](#ux-10) · [UX-19](#ux-19) · [UX-13](#ux-13)                                     |
| Enablers                  | [UX-12](#ux-12) · [UX-21](#ux-21)                                                                                           |
| Stop items folded in      | B-31 → UX-03/UX-04 · B-32 → UX-10 · B-33 → UX-08/UX-11 · B-34 → UX-01 (hotfix first)                                        |

Twenty Now specs, equal to stage 2's Now set. Specs are in number order below, except that the five added in the final
revision — UX-11 and UX-19 (moved up from Next) and the new UX-35, UX-36, UX-39 — follow UX-26.

<a id="ux-01"></a>

### UX-01 ◆ One safety filter on every surface

**Problem & evidence.** 4/10 (P04, P05, P06, P10), Sev 4, the only "would uninstall / someone gets hurt" moments in
the study (CI-10 4/10, CI-26 3/10, CI-38 1/10). A tree-nut household was planned granola with almonds in the photo
([P04 parfait](../screenshots/P04/049-parfait-detail.png), bug B-02); "no eggs" typed as a restriction was a silent
no-op ([P05 eggs ×4](../screenshots/P05/048-wk-tue.png), bug B-03); "fish" didn't expand to cod or salmon (bug B-04);
the Replace list and AI Chef offered fish and egg dishes to people who had excluded them
([P04 Replace](../screenshots/P04/086-s2-swap.png), [P05 AI Chef](../screenshots/P05/094-s2-chat2.png), bug B-05);
editing a vegetarian recipe made it "non-vegetarian" ([P05](../screenshots/P05/115-s2-edited-detail.png), bug B-01).
**Final synthesis:** the manual Replace picker has **no** safety filter at all — `replaceRecipe` checks visibility only
(bug B-46, verified; it explains P04's fish and P05's eggs); the gluten matcher misses spelt, seitan, semolina, malt,
stock/bouillon and curry powder, and curated recipes carry **hard-coded** "gluten-free" tags despite stock (bug B-47,
P10: Vegetable Paella with 600 ml stock tagged GF). Inputs are free-text chip editors with no read-back
([P04 typing blind](../screenshots/P04/016-luca-allergy-focus.png)).

> "I literally typed 'no eggs'. It didn't even try." (P05) · "There are almonds in the picture. I can't trust this with Luca." (P04) · "'Gluten-free' is a label, not a promise." (P10)

**User story.** As a parent whose son has a tree-nut allergy, I pick "Tree nuts" once for him and see what that keeps
out, so that nothing Chefer proposes anywhere (plan, swap, AI Chef, import, list) contains tree nuts or the foods that
usually do, and I stop re-checking every recipe.

**Scope of the UI** (the filter itself — one server function called by plan, swap, Replace, AI Chef tools,
import/Cheferize and the list, plus the regression suite — is stage 4): (a) structured entry with read-back, used in
three places; (b) migration of existing free text; (c) what each filtered surface shows; (d) reporting a miss;
(e) the recipe-form tag fix.

#### Flow & states

**(a) Entry — the redesigned `SafetyStep`** (onboarding diet step, Settings › Allergies & diets, and per household
member). One scrolling screen, three groups, then "Something else":

```
┌──────────────────────────────────────────────┐
│ ←  Step 3 of 6 · Allergies & diets            │
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░░░░    │
│ Pick everything that applies to you. Chefer   │
│ checks every plan, swap and list for these.   │
│                                               │
│ ALLERGIES                                     │
│ [Peanuts] [Tree nuts ✓] [Milk] [Eggs]         │
│ [Gluten] [Fish] [Shellfish] [Molluscs] [Soy]  │
│ [Sesame] [Celery] [Mustard] [Sulphites]       │
│ [Lupin]                                       │
│ ┌ shield  We’ll keep out ───────────────────┐ │
│ │ Tree nuts: almonds, walnuts, hazelnuts,   │ │
│ │ cashews, pecans, pistachios, macadamias,  │ │
│ │ Brazil nuts, pine nuts and coconut — and  │ │
│ │ foods that often contain them: granola,   │ │
│ │ muesli, pesto, praline, marzipan, nut     │ │
│ │ butters and nut milks.                    │ │
│ └───────────────────────────────────────────┘ │
│ DIET                                          │
│ (•) No restriction  ( ) Vegetarian            │
│ ( ) Vegetarian, no eggs  ( ) Vegan            │
│ ( ) Pescatarian                               │
│ Also: [Gluten-free (coeliac)] [Dairy-free]    │
│       [Egg-free] [Keto] [Paleo]               │
│ WON’T EAT                                     │
│ [Fish] [Shellfish] [Pork] [Red meat]          │
│ [Poultry] [Mushrooms] [Onion & garlic]        │
│ [Spicy food] [Coriander] [Olives] [Offal]     │
│ [Leafy & green veg]                           │
│ SOMETHING ELSE?                               │
│ [ e.g. aubergine                   ] [ Add ]  │
├──────────────────────────────────────────────┤
│ [            Continue             ]           │
│               Skip for now                    │
└──────────────────────────────────────────────┘
```

- **Allergies** = the EU Annex II 14 (stage 2 B-01), as a multi-select `ChipGroup`. Each selected chip adds its line to
  the **"We’ll keep out"** read-back panel under the group (one sentence per allergen, from the shared taxonomy). The
  panel is live (appears on the first selection, updates on every change) and is announced politely.
- **Diet** = one _base_ diet (radio `ChipGroup`, single): `No restriction` · `Vegetarian` · `Vegetarian, no eggs` ·
  `Vegan` · `Pescatarian`; plus _also_ modifiers (multi): `Gluten-free (coeliac)` · `Dairy-free` · `Egg-free` · `Keto` · `Paleo`.
  Choosing `Vegan` greys out `Dairy-free` with the hint `Vegan already excludes dairy`. The base diet reads back in
  one line (`Vegetarian, no eggs: no meat, fish, seafood or eggs. Milk and cheese are fine.`).
- **Won’t eat** = dislike _categories_ (multi), each expanding like an allergy does (fixes bug B-04). Read-back is one
  compact line for all selected dislikes (`We’ll leave out fish (cod, salmon, tuna…) and mushrooms.`).
- **Something else** = a text field + `Add`. On `Add`, the term is run through the shared recogniser
  (`recogniseSafetyTerm`, `@chefer/utils`) and lands in one of five outcomes, each shown inline under the field:

| Recognised as                                                                 | What happens                                                                                                                                        | Inline copy                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A listed allergen or synonym ("nuts", "walnut", "lactose", "coeliac")         | selects that chip in its group, scrolls to it                                                                                                       | `Added to Allergies: Tree nuts.`                                                                   |
| A diet or modifier ("no eggs", "lacto vegetarian", "plant based", "no dairy") | selects the matching base diet or modifier. "no eggs" with base `Vegetarian` → `Vegetarian, no eggs`; with any other base → the `Egg-free` modifier | `Set your diet to Vegetarian, no eggs.` / `Added Egg-free to your diet.`                           |
| A specific ingredient the checker can match ("aubergine", "cilantro")         | adds an ingredient chip under Won’t eat                                                                                                             | `We’ll leave out recipes with aubergine (eggplant).`                                               |
| A health condition ("pre-diabetes", "high blood pressure", "IBS")             | not saved as a chip; shows the UX-22 notice                                                                                                         | see UX-22                                                                                          |
| Not recognised                                                                | shows `UncheckedNotice` with two buttons                                                                                                            | `Chefer can’t check for “{term}” yet, so plans won’t change for it.` [`Keep as a note`] [`Remove`] |

A kept note is shown as a muted chip with a `help-circle-outline` icon, never as a checked rule; it is still matched
literally by the filter exactly as today (no behaviour regression for existing users).

**Household members** (`HouseholdEditor`): the comma-separated `Allergies` / `Dislikes` inputs are replaced by a
`Allergies & diet for {name}` button opening the same `SafetyStep` in a `Sheet`. Member cards show everything that is
saved (fixes CI-41): `½ portion · allergic: tree nuts · vegetarian · won’t eat: fish`. A **"You"** card is always
first in the list (`You · 1 portion · {your items or "no allergies"}`; tap → your own SafetyStep). In the onboarding
household flow the diet step is titled `Your own allergies & diet` with the helper
`{Names}’s are already saved — this is just for you.` (fixes allergies asked twice, P04-M08).

**(b) Migration of existing free text.** On first launch after the release, if any saved entry (owner or member) was
free text, a one-time card appears at the top of Food Today and in Settings › Allergies & diets:

```
┌ shield  Check we understood you ─────────────┐
│ We’ve made allergies easier to check. Here’s  │
│ how we read what you typed:                   │
│ “tree nuts”      → Tree nuts ✓                │
│ “no eggs”        → Vegetarian, no eggs ✓      │
│ “green vegetables” → Leafy & green veg ✓      │
│ “pre-diabetes”   → can’t check (note)         │
│ [ Looks right ]        [ Change ]             │
└───────────────────────────────────────────────┘
```

`Looks right` saves the mapping; `Change` opens the SafetyStep with the mapping pre-applied. Until confirmed, the
filter applies **both** the old literal match and the new mapping (over-block, never under-block). Dismissing
without choosing keeps both and re-shows the card next launch (max 3 times, then it stays only in Settings).

**(c) What each filtered surface shows**

| Surface                                                                                | File                                                                    | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan (curated + AI)                                                                    | `app/(food)/meal-plan.tsx`, `src/features/meal-plan/plan-meal-card.tsx` | Unsafe recipes never planned. If an AI slot still fails the check, the slot shows the existing red `AllergenWarningChip` and the day view shows a `Replace this meal` button on that card (one tap to the picker).                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Replace sheet (bug B-46: today it is **unfiltered**; the B-34 hotfix filters it first) | `src/features/meal-plan/recipe-picker-sheet.tsx`                        | The list comes from the one server filter (never a client-side filter). Recipes failing an allergy or diet rule are **not listed**. Recipes with a disliked item are hidden from the default list, shown in search results with `DislikeChip`. Own recipes that conflict are listed under "Your recipes" with the conflict chip; tapping one opens a `ConfirmSheet`: title `Contains {allergen}`, body `{Name} is allergic to {allergen}. Add it to {day} anyway?`, buttons `Add anyway` (destructive) / `Choose another`. Footer line under the list: `{n} recipes hidden because they don’t fit your table · What we check` (link opens the What-we-check sheet, UX-02). |
| AI Chef "what can I make"                                                              | server (`pantry.service.ts`); `app/chat.tsx` unchanged                  | The tool only ranks recipes that pass the filter. No UI change; acceptance is on content.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Discover / Cookbook                                                                    | `app/(food)/recipes.tsx`                                                | Keeps filtering; adds a one-line muted header on Discover: `Showing recipes that fit your table · What we check`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Import / Cheferize                                                                     | `app/import-recipe.tsx`, `src/features/recipes/video-draft-form.tsx`    | The preview/draft runs the check and shows the conflict banner or the Checked line (UX-02) before save. Saving a conflicting recipe is allowed (it may be for someone else) but it is never auto-placed in a plan.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Shopping list                                                                          | `app/(food)/shopping-list.tsx`                                          | Plan lines are already filtered upstream. A **custom** line the user adds that matches a household allergen gets an amber chip `Check label: {allergen}` with a11y label `{item} may contain {allergen}, which {name} is allergic to`. Never blocks adding.                                                                                                                                                                                                                                                                                                                                                                                                                |
| Cook mode                                                                              | `app/cook/[id].tsx`                                                     | Unchanged banner behaviour; banner now only shows true conflicts (after the tag fix below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**(d) Report a miss.** Recipe detail (`app/recipe/[id].tsx`) gets an overflow `ellipsis-horizontal` button (44 pt) in
the header with `Report a safety problem`; the plan meal card's long-press menu gets the same item. It opens a
`Sheet` titled `Report a safety problem`:

- Options (single `ChipGroup`): `It contains something we can’t eat` · `A label is wrong (e.g. “vegetarian”)` ·
  `Something else`.
- Optional note: `What did you notice? (optional)`.
- Footer: `Send report` / `Cancel`.
- On send: the recipe is hidden from this user's plans, swaps and suggestions immediately; **needs (additive):** a
  `safety.report` procedure storing recipe, surface, reason and the rules in force (part of the B-26 evidence trail).
  Snackbar: `Thanks. We’ve hidden {recipe} from your plans and will check it.`

**(e) Recipe form tag fix** (bug B-01, `app/recipe-form.tsx` L194). The form gets a `Diet tags` multi `ChipGroup`
(`Vegetarian` · `Vegan` · `Gluten-free` · `Dairy-free` · `Pescatarian` · `Keto` · `Paleo`) prefilled from the
recipe's saved tags; the save payload sends the chosen tags, never `[]`. When an edit adds an ingredient that breaks a
tag (e.g. chicken on a vegetarian recipe), the chip gets an amber outline and the hint
`Chicken isn’t vegetarian — untick “Vegetarian”?` [`Untick`].

**(f) Hidden gluten and derived diet tags** (bug B-47, P10). Two rule changes the UI must reflect:

- **Always-gluten ingredients** join the gluten patterns and are excluded for `Gluten` / `Gluten-free (coeliac)`:
  spelt, seitan, semolina, bulgur, couscous, farro, malt (malt vinegar, malt extract), barley, rye, regular oats.
- **Label-dependent ingredients** (usually made with gluten, available certified GF): stock/bouillon cubes, curry
  powder, soy sauce (tamari is fine), baking powder, oats, chocolate, sausages. For a gluten-free table a recipe that
  contains them is **kept** but gets a `LabelCaveat` (PAT-2) on that ingredient line — in the recipe, cook mode and on
  the shopping-list line (`Buy certified gluten-free`) — and the recipe's Checked line (UX-02) adds
  `Check the label: certified GF stock`. If the user prefers, Settings › Allergies & diets offers
  `Leave out recipes that need a certified gluten-free product` (off by default; on = excluded instead of caveated).
- **Derived tags:** diet tags shown on a recipe (`vegetarian`, `vegan`, `gluten-free`, `dairy-free`) are computed from
  its ingredients by the same filter, never read from a hard-coded list; a recipe with a label-dependent ingredient
  shows `gluten-free with GF-labelled {stock}` instead of a bare `gluten-free`. The recipe form's `Diet tags` (e) show
  the derived tags ticked and locked (`From the ingredients`), and user tags only add restrictions, never remove
  derived conflicts.

#### Copy

| Key                           | Copy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| step title (solo)             | `Allergies & diets`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| step title (household, owner) | `Your own allergies & diet`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| helper                        | `Pick everything that applies to you. Chefer checks every plan, swap and list for these.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| group labels                  | `ALLERGIES` · `DIET` · `WON’T EAT` · `SOMETHING ELSE?`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| read-back title               | `We’ll keep out`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| read-back, tree nuts          | `Tree nuts: almonds, walnuts, hazelnuts, cashews, pecans, pistachios, macadamias, Brazil nuts, pine nuts and coconut — and foods that often contain them: granola, muesli, pesto, praline, marzipan, nut butters and nut milks.`                                                                                                                                                                                                                                                                                                                                          |
| read-back, other allergens    | one line each in `packages/types/src/safety-taxonomy.ts` (`readBack` field), same shape: `{Allergen}: {examples} — and foods that often contain {it/them}: {may-contain list}.` Reviewed by a dietitian (V1) and counsel (UX-26) before release.                                                                                                                                                                                                                                                                                                                          |
| read-back, empty              | `No allergies selected.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| diet read-backs               | `Vegetarian: no meat, fish or seafood. Eggs, milk and cheese are fine.` · `Vegetarian, no eggs: no meat, fish, seafood or eggs. Milk and cheese are fine.` · `Vegan: nothing from animals — no meat, fish, eggs, dairy or honey.` · `Pescatarian: fish and seafood, but no meat.` · `Gluten-free (coeliac): no wheat, barley, rye, spelt, semolina, malt or regular oats, and nothing made from them. Stock, curry powder and soy sauce only when labelled gluten-free.` · `Egg-free: no eggs, and nothing made with them, like mayonnaise, meringue or fresh egg pasta.` |
| vegan + dairy-free hint       | `Vegan already excludes dairy`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| household member button       | `Allergies & diet for {name}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| member card                   | `{portion} portion · allergic: {list} · {diet} · won’t eat: {list}` (omit empty parts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| migration card                | title `Check we understood you` · body `We’ve made allergies easier to check. Here’s how we read what you typed:` · `Looks right` · `Change`                                                                                                                                                                                                                                                                                                                                                                                                                              |
| picker footer                 | `{n} recipes hidden because they don’t fit your table · What we check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| conflict confirm              | `Contains {allergen}` / `{Name} is allergic to {allergen}. Add it to {day} anyway?` / `Add anyway` / `Choose another`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| list chip                     | `Check label: {allergen}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| report                        | `Report a safety problem` · `It contains something we can’t eat` · `A label is wrong (e.g. “vegetarian”)` · `Something else` · `What did you notice? (optional)` · `Send report` · snackbar `Thanks. We’ve hidden {recipe} from your plans and will check it.`                                                                                                                                                                                                                                                                                                            |

#### Components & files

- **New shared data:** `packages/types/src/safety-taxonomy.ts` — ids, labels, synonyms, `readBack`, `mayContain`
  examples, group (`allergen | diet | dietModifier | dislikeCategory`); consumed by the API matcher, web and mobile.
  Stored values stay **strings** (the canonical label, e.g. `Tree nuts`) so the `dietaryRestrictions / allergies /
dislikedIngredients: string[]` contract does not change and older binaries keep working.
- **New:** `packages/utils/src/safety-recognise.ts` (`recogniseSafetyTerm`, unit-tested with every example in this
  spec), `apps/mobile/src/features/safety/` (`safety-picker.tsx`, `read-back-panel.tsx`, `unchecked-notice.tsx`,
  `migration-card.tsx`, `report-sheet.tsx`, and the PAT-2 components).
- **Change:** `src/features/preferences/components/safety-step.tsx` (becomes a thin wrapper over `SafetyPicker`;
  `ChipEditor` removed), `src/features/household/household-editor.tsx`, `src/features/onboarding/onboarding-wizard.tsx`
  (step title for households), `app/preferences.tsx` (card uses the new step; save button stays),
  `src/features/meal-plan/recipe-picker-sheet.tsx`, `app/(food)/recipes.tsx` (Discover header),
  `app/(food)/shopping-list.tsx` (custom-line chip), `app/recipe/[id].tsx` (overflow + report),
  `src/features/meal-plan/plan-meal-card.tsx` (long-press item), `app/recipe-form.tsx` (diet tags),
  `src/features/recipes/allergen-warning.tsx` (moves to `features/safety/`, re-exported).
- **Kit:** `ChipGroup` already supports single/multi; add an optional `disabledValues` + `hints` prop for the
  vegan/dairy-free rule.

#### Interaction & motion

Selecting a chip ticks `haptics.selection` (kit default). The read-back panel expands with a height animation over
`duration.base` (fade only with reduced motion). "Something else" results appear under the field and push content
down; the field keeps focus so several terms can be added in a row.

#### Accessibility

Each chip: `accessibilityRole="checkbox"` (multi) or `"radio"` (base diet) with `accessibilityState`. The read-back
panel is a live region (`accessibilityLiveRegion="polite"`, iOS announcement on change: `Keeping out tree nuts and
foods that often contain them`). Group labels are headers (`accessibilityRole="header"`). At 1.8× text the chip rows
wrap; the read-back panel is never truncated.

#### Analytics

`safety_readback_viewed { itemsCount, unrecognisedCount }` on leaving the step · `safety_conflict_shown { surface,
kind }` when a conflict chip or banner renders · `safety_issue_reported { surface }` on send ·
`safety_migration_resolved { outcome: confirmed|changed|dismissed, mappedCount, noteCount }` (new). **No term names.**

#### Acceptance criteria

1. Selecting `Tree nuts` shows the exact tree-nut read-back within 150 ms; deselecting removes it.
2. Typing `no eggs` + `Add` selects `Vegetarian, no eggs` when the base diet is Vegetarian, and the `Egg-free`
   modifier otherwise (never silently makes a meat-eater vegetarian); typing `walnut` selects
   `Tree nuts`; typing `pre-diabetes` shows the UX-22 notice and saves nothing; typing `zzz` shows the unchecked
   notice. (Unit tests on `recogniseSafetyTerm` cover all rows of the outcomes table.)
3. A curated plan for a profile with `Tree nuts` contains no recipe whose ingredients or name match the tree-nut or
   may-contain list (granola, muesli, pesto, praline, marzipan, nut butter, nut milk) — verified by the regression
   suite (every profile × every curated recipe) and by a Maestro flow that generates a week and asserts no
   `Greek Yogurt Parfait`.
4. A member with `won’t eat: Fish` gets no cod, salmon, tuna or other `FISH_PATTERNS` recipe in a generated week.
5. The Replace sheet for a no-fish household lists no fish recipe in "All recipes"; its footer shows the hidden count.
6. AI Chef "what can I make" returns no recipe that fails the user's filter (API test on `whatCanIMake`).
7. Editing any field of a vegetarian recipe and saving keeps the `vegetarian` tag; no false conflict banner appears
   (regression test for bug B-01).
8. A household member card shows allergies, diet and dislikes when set; a "You" card is always first.
9. The migration card appears once for a user with free-text entries, maps `tree nuts`, `no eggs`, `fish`,
   `green vegetables` correctly, and while unconfirmed the filter over-blocks (old literal + new mapping).
10. Reporting a recipe hides it from the user's next generated plan and from the Replace list.
11. No surface shows an allergy or diet conflict silently: every conflicting recipe that is displayed carries the
    conflict chip/banner.
12. All chips ≥ 44 pt; VoiceOver reads `Tree nuts, checkbox, checked`; the read-back is announced.
13. The Replace picker for a no-fish, no-egg user lists no fish or egg recipe, served by the server filter (API test on
    the picker procedure and on `replaceRecipe`, which rejects an unsafe recipe id with a clear error) — bug B-46.
14. For a coeliac profile, no curated recipe containing spelt, seitan, semolina, malt or couscous is planned; the
    Vegetable Paella (stock) is either shown with `Check the label: certified GF stock` and its list line reads
    `Buy certified gluten-free`, or excluded when the stricter setting is on — bug B-47. No recipe shows a bare
    `gluten-free` tag while it contains a label-dependent ingredient (regression suite).

#### Edge cases

- Allergy `Gluten` and diet `Gluten-free (coeliac)` both chosen → both kept, read-back shows one gluten line.
- Base diet change from Vegan to Vegetarian keeps `Dairy-free` if it was chosen explicitly before.
- A household where one person is vegetarian: the table's plan is vegetarian (union rule, unchanged); the read-back
  in the What-we-check sheet says so (`Plans are vegetarian because Ana is.`). Per-person meals are out of scope.
- 20-item cap per list stays; the picker never hits it with chips alone.
- Offline: the step is read-only with `Needs a connection to save` (safety must not diverge between devices).
- Older app binaries keep sending free text; the server recogniser maps it on write (stage 4), so new clients show
  chips for it.

#### Web parity

Web has the same inputs: onboarding `apps/web/src/features/onboarding/components/step-diet.tsx`, Preferences
`apps/web/src/features/preferences/components/preferences-form.tsx`, household
`apps/web/src/features/preferences/components/household-section.tsx`, Replace
`apps/web/src/features/meal-plan/components/ReplaceMealSheet.tsx`, recipe form
`apps/web/src/features/recipes/components/recipe-form-fields.tsx`, warnings `AllergenWarning.tsx`. **Same PR group**:
the taxonomy, recogniser, read-back and migration card ship on web too (web renders the chips with `@chefer/ui`
`Badge`/toggle buttons). The filter is server-side, so both platforms get the safety fix at once.

**Dependencies.** B-34 hotfix first (see §6). Unblocks UX-02, UX-15, the household push. Copy sign-off from UX-26
(counsel) and the dietitian review of the taxonomy (V1) gate the store release, not the build.
**Protect:** D8 household setup (presets, portions, "Feed my household — allergies included"), D16 (recognised diets
hold). **Validate:** V1 (how parents phrase restrictions; whether "may contain" exclusions are expected).

<a id="ux-02"></a>

### UX-02 ◆ Show the check

**Problem & evidence.** 4/10 (P04, P05, P06, P10), CI-19 (Sev 3), CI-41, CI-10. No surface ever says what was checked:
not the plan, a recipe, a swap row or a list line ([P04 list with granola and dark chocolate](../screenshots/P04/072-shop-grains.png),
[P05 omelette tagged vegetarian with no badge](../screenshots/P05/061-omelette-detail.png)). Discover _is_ filtered,
silently (P04-M40). The only positive echo was the mock AI Chef (P04-M29).

> "Put a green 'Safe for Luca — no tree nuts' badge on every recipe, and mean it." (P04) · "Then what's the point?" (P04, exit)

**User story.** As the person responsible for what my family eats, I want every plan and recipe to tell me which of
our restrictions it was checked against, so that I can trust the plan without reading every ingredient list.

**Design decision.** P04 asked for "Safe for Luca". We ship **"Checked for …"** instead (P3): it tells the truth
about what the software did, without promising what it cannot know (cross-contamination, brand recipes). The badge is
neutral (muted, shield icon), not green. Variant B for the V1 concept test: a per-person line `Fits Luca · Ana · you`.
Final wording is counsel's (UX-26).

#### Flow & states

Four levels, from the whole week down to one ingredient line. All read the additive `safetyChecks` payload (PAT-2).

**1. Week statement (Plan).** A card at the top of the Plan day view (`app/(food)/meal-plan.tsx`, above the badges
row), shown when the table has ≥ 1 allergy, diet or dislike:

```
┌ shield  Checked for your table ─────────── › ┐
│ tree nuts (Luca) · no fish (Ana) ·           │
│ vegetarian (you)                              │
└───────────────────────────────────────────────┘
```

Tap → the **What we check** sheet. If any slot in the visible week has a conflict, the card turns into the conflict
state: red `warning` icon, title `1 meal needs a look`, body `Tuesday’s dinner contains fish. Ana doesn’t eat fish.`,
action `Show me` (jumps to that day and scrolls to the card). If the table has a kept note (unrecognised term), a
second line in amber: `Can’t check: “{term}”`.

**2. Recipe detail and cook mode.** Under the tag chips on `app/recipe/[id].tsx` and at the top of cook mode's
ingredient list (`app/cook/[id].tsx`): the full `CheckedForLine`
`Checked for tree nuts (Luca) · fish (Ana) · vegetarian (you)`, tappable. The existing red banner replaces it when
there is a conflict (never both).

**3. Cards and rows (compact).** Plan meal cards (`plan-meal-card.tsx`), Today hero/Tonight cards, Replace-sheet rows
and Discover cards show `CheckedForChip` — `Checked for 3` — only when the table has safety items; the a11y label
spells it out (`Checked for tree nuts, fish and vegetarian`). At 1.3× dense cap it wraps under the kcal line.

**4. Shopping list.** The list header gets one line under the cost chips:
`shield Checked for your table · 87 items` (tap → sheet). Custom lines follow UX-01 (c); lines with a label-dependent
ingredient carry `Buy certified gluten-free` (UX-01 f).

**5. Filtered lists say they are filtered** (P10 had to probe the filter with searches, P10-M33, M55). Every list the
filter shortened — Discover, the Replace picker, cookbook search, AI Chef "what can I make" results — starts with a
`FilteredForLine` (PAT-2): `Filtered for vegan + gluten-free · 14 hidden` (tap → What-we-check sheet). Searching for a
hidden recipe by name shows it in an `Also matches, but doesn’t fit your table` group (collapsed, rows show the
conflict chip and cannot be added without the UX-01 confirm).

**6. Label caveats where the risk sits in a product.** On recipe detail and cook mode, under the Checked line:
`alert-circle Check the label: certified GF stock and oats` — one line listing the label-dependent ingredients of that
recipe for the table's rules (gluten today; the same mechanism serves "may contain nuts" chocolate and granola bars).

**The "What we check" sheet** (`WhatWeCheckSheet`, an `ExplainSheet`):

```
WHAT WE CHECK
Checked for your table
────────────────────────────────────────
Luca     Tree nuts — and granola, muesli,
         pesto, praline, marzipan, nut
         butters                        ›
Ana      Won’t eat fish (cod, salmon…)  ›
You      Vegetarian                     ›
Can’t check  “low sugar” (a note)       ›
────────────────────────────────────────
How we check
We read every ingredient and the recipe name
before a meal reaches your plan, your swaps,
the AI Chef or your list. We don’t know how
packaged foods were made, so always read the
label of anything you buy — especially for
allergies.
[ Edit allergies & diets ]
```

Rows open that person's SafetyStep (UX-01). The footer action goes to Settings › Allergies & diets.

**Household setup read-back (CI-41).** After adding or editing a member, the member card animates in with the full
summary (UX-01), and the table step shows a summary line above `Continue`:
`4 at the table · we’ll check for tree nuts (Luca) and fish (Ana)`.

#### Copy

| Key                                   | Copy                                                                                                                                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| week card title                       | `Checked for your table`                                                                                                                                                                                                                                    |
| week card body                        | `{rule} ({who})` joined by `·`; `who` = member first name or `you`                                                                                                                                                                                          |
| week conflict title / body / action   | `{n} meal needs a look` / `{n} meals need a look` · `{Day}’s {meal} contains {allergen}. {Name} {is allergic to / doesn’t eat} {allergen}.` · `Show me`                                                                                                     |
| unchecked line                        | `Can’t check: “{term}”`                                                                                                                                                                                                                                     |
| full line                             | `Checked for {rule list}`                                                                                                                                                                                                                                   |
| chip                                  | `Checked for {n}`                                                                                                                                                                                                                                           |
| list header line                      | `Checked for your table · {n} items`                                                                                                                                                                                                                        |
| sheet eyebrow / title                 | `WHAT WE CHECK` / `Checked for your table`                                                                                                                                                                                                                  |
| sheet "how" heading + body            | `How we check` / `We read every ingredient and the recipe name before a meal reaches your plan, your swaps, the AI Chef or your list. We don’t know how packaged foods were made, so always read the label of anything you buy — especially for allergies.` |
| sheet action                          | `Edit allergies & diets`                                                                                                                                                                                                                                    |
| table summary                         | `{n} at the table · we’ll check for {rule} ({who}) and {rule} ({who})`                                                                                                                                                                                      |
| filtered line                         | `Filtered for {rules} · {n} hidden` · group `Also matches, but doesn’t fit your table`                                                                                                                                                                      |
| label caveat (recipe)                 | `Check the label: certified GF {products}` (e.g. `certified GF stock and oats`)                                                                                                                                                                             |
| label caveat (ingredient / list line) | `Buy certified gluten-free`                                                                                                                                                                                                                                 |

Forbidden words anywhere in safety UI: `safe`, `allergen-free`, `nut-free`, `guaranteed`, `suitable for`.
A lint rule (stage 4) scans the copy modules for them.

#### Components & files

- **New** in `apps/mobile/src/features/safety/`: `checked-for-line.tsx`, `checked-for-chip.tsx`,
  `what-we-check-sheet.tsx`, `week-safety-card.tsx`; copy in `features/safety/copy.ts`.
- **Change:** `app/(food)/meal-plan.tsx` (week card), `src/features/meal-plan/plan-meal-card.tsx` (chip),
  `app/recipe/[id].tsx` and `app/cook/[id].tsx` (line), `src/features/meal-plan/recipe-picker-sheet.tsx` (row chip),
  `src/features/dashboard/components/hero-meal-card.tsx` (chip), `app/(food)/shopping-list.tsx` (header line),
  `src/features/household/household-editor.tsx` (summary line).
- **Needs (additive):** `safetyChecks` on `mealPlan.getForWeek` meals, `recipe.byId`, picker rows,
  `dashboard.summary` hero meals, and a `tableSafety` summary on `mealPlan.getForWeek` and
  `shoppingList.getForWeek`.

#### Interaction & motion

No animation beyond the card enter. The week card's conflict state uses `haptics.warning` once when it first appears
in a session.

#### Accessibility

The week card is one button: `Checked for your table: tree nuts for Luca, fish for Ana, vegetarian for you. Opens
details.` Conflict state uses `accessibilityRole="alert"`. The shield icon is decorative (`accessible={false}`).

#### Analytics

`safety_checks_viewed { surface: plan|recipe|swap|list|cook }` when the line/card is on screen ≥ 1 s (first time per
session per surface) and when the sheet opens (`surface: sheet`).

#### Acceptance criteria

1. For a table with ≥ 1 safety item, every meal card, recipe detail, cook mode, picker row and the list header shows
   a Checked element; for a table with none, none of them does.
2. The week card lists every rule with its owner name; the sheet lists the same rules and the "How we check" text.
3. When a displayed recipe conflicts, the Checked element is replaced by the conflict element on that surface, and
   the week card switches to `needs a look` with a working `Show me`.
4. No safety surface contains the forbidden words (copy lint passes).
5. After adding Luca with Tree nuts in onboarding, the table step shows
   `2 at the table · we’ll check for tree nuts (Luca)` before Continue.
6. VoiceOver reads the full rule list for the compact chip.
7. Discover, the Replace picker, cookbook search and AI Chef results each show `Filtered for …` with the correct hidden
   count when the filter removed anything, and nothing when it didn't.
8. A coeliac table sees `Check the label: certified GF stock` on any recipe with stock and `Buy certified gluten-free`
   on its list line.

#### Edge cases

Very long rule lists (5 people × 3 rules): the week card shows the first three `rule (who)` items and `+{n} more`;
the sheet shows all. Recipes with `safetyChecks` missing (older API) render nothing, never a false "Checked". AI plans
in progress (streaming) show the chip only once the meal has been checked server-side.

#### Web parity

Web shows the same states: meal-plan `apps/web/src/features/meal-plan/components/MealCard.tsx` and
`day-view.tsx` (week card), recipe page `apps/web/src/app/(dashboard)/recipes/[id]/page.tsx`, cook mode
`features/recipes/components/cook-mode.tsx`, shopping list page, `household-section.tsx`. Same copy module
(`@chefer/utils` `safety-copy.ts`) so the words match. Ships in the same PR group as mobile.

**Dependencies.** UX-01 (taxonomy, one filter, `safetyChecks`). Counsel wording (UX-26). **Protect:** D8.
**Validate:** V1 — ≥ 8 of 10 allergy parents say they would not re-check every recipe; test variant B ("Fits Luca")
against "Checked for".

<a id="ux-03"></a>

### UX-03 Onboarding by job

**Problem & evidence.** 8/10 (CI-03), plus CI-01 (8/10), CI-09 (10/10), CI-20, CI-24 (4/10). No card fits "track what
I eat" either (P07-M04), and an en-US phone in Romania keeps USD/lb even after the user types cm and kg (bug B-43,
P07, P01). "What brings you here?" is single-choice;
a second tap replaces the first ([P02](../screenshots/P02/008-onb-step1-select.png)); `Train` skips every food
question and food setup is never offered again (`packages/utils/src/household.ts` L55); zero-waste and collector jobs
have no card ([P08](../screenshots/P08/008-after-create.png)); currency is never shown or asked (CI-24); every food path
ends on a 2,000 kcal ring, even after "Feed my household" or skipping the goal
([P04](../screenshots/P04/031-after-onboarding.png), [P05](../screenshots/P05/012-onb-step4.png)).

> "I want both, that's literally why I downloaded it. The ad said meals AND workouts." (P02) · "None of these is 'stop throwing food away'." (P08)

**User story.** As someone who lifts four times a week and cooks for myself, I want to tell Chefer both things at the
start, answer only the questions those jobs need, and land on something useful for each, so that the app is set up
for how I actually live.

#### Flow & states

**Step 1 — Jobs** (replaces `IntentStep`; multi-select):

```
┌──────────────────────────────────────────────┐
│ ←  Step 1                                     │
│ What should Chefer help with?                 │
│ Pick all that fit. You can change this any    │
│ time in Settings.                             │
│ ┌──────────────────────────────────────────┐ │
│ │ [barbell] Train                      [✓] │ │
│ │ Workouts that tell you what to lift next. │ │
│ │ Free.                                     │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ [calendar] Plan my meals             [✓] │ │
│ │ A week of meals that fits your time and   │ │
│ │ taste, with one shopping list.            │ │
│ └──────────────────────────────────────────┘ │
│ ┌ [people] Feed my household          [ ] ┐ │
│ │ One plan for everyone at my table,       │ │
│ │ allergies included.                      │ │
│ └──────────────────────────────────────────┘ │
│ ┌ [basket] Use what I have            [ ] ┐ │
│ │ Keep track of what’s in my kitchen and    │ │
│ │ use it first.                             │ │
│ └──────────────────────────────────────────┘ │
│ ┌ [book] Cook my saved recipes        [ ] ┐ │
│ │ Keep recipes from links and videos, and  │ │
│ │ plan with them.                           │ │
│ └──────────────────────────────────────────┘ │
│ ┌ [pie-chart] Track what I eat        [ ] ┐ │
│ │ Log meals fast against my own calorie    │ │
│ │ and protein targets.                      │ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ [      Continue — 2 selected       ]         │
│          Just looking around                  │
└──────────────────────────────────────────────┘
```

- Cards keep today's look (`PressableScale`, 2 pt border, icon tile) with a trailing checkbox circle; selected =
  `border-primary bg-accent` + filled check. `accessibilityRole="checkbox"`.
- `Continue` is disabled until ≥ 1 job; its label counts (`Continue — 2 selected`). `Just looking around` saves
  `jobs: ['PLAN_MEALS']` and goes straight to Food Today (it replaces "Skip for now" on this step only).

**The step list is built from the jobs** (shared pure function, replaces `onboardingSteps` in
`packages/utils/src/household.ts`):

| Jobs chosen                             | Steps after Jobs                                                                                                                                                                                                                                          | Ends on                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Train only                              | → gym setup (existing wizard, unchanged)                                                                                                                                                                                                                  | Gym Today                                                                                                 |
| Any food job, no Train                  | Table (if household) → Allergies & diets → How you cook → Your goal (optional) → Body metrics (only if a numeric goal was chosen)                                                                                                                         | Food Today, first week generated                                                                          |
| Train + any food job                    | **Training days** → Table (if household) → Allergies & diets → How you cook → Your goal (optional) → Body metrics (only if numeric goal) → **Your targets** (only with Track, or Train + a numeric goal) → gym setup starting at step 2 (days pre-filled) | Gym Today (first workout ready) and a first food week already generated with training days marked (UX-06) |
| Track what I eat (alone or with others) | Allergies & diets → Your goal (optional) → Body metrics (optional) → **Your targets** (UX-35: own or suggested) → How you cook only if a plan job was also chosen                                                                                         | Food Today with the tracker home (ring first, Quick add and Snap below — protect D20)                     |

**Step — Training days** (Train + food only; the answer is shared by both halves, CI-20):
title `Which days do you usually train?` · helper `We’ll plan more food on these days and remind you to train.
You can change them any time.` · weekday `ChipGroup multiple` (Mon…Sun, 44 pt) · a muted counter
`{n} days a week` · link `Not sure yet` (skips; gym setup will ask). Under the chips, `Do you also run or ride?` opens
the day-kind row from UX-06 (per ticked or unticked weekday: `Lift` · `Run` · `Long run`), so an endurance athlete's
long-run day is a training day for food (P10) without being a gym day. The chosen weekdays pre-fill gym setup step 1
(count) and step 4 (which days), so the gym wizard opens at step 2 and shows step 4 with the days already ticked
(its reminder toggle is still asked there — protect D3).

**Step — How you cook** (defined in UX-07; it also carries currency & units, CI-24):
the bottom of the step shows `Prices in` as a `ChipGroup` (`RON`, `EUR`, `GBP`, `USD`), pre-selected from the device
region, and `Units` (`Metric (g, kg)` / `Imperial (oz, lb)`), pre-selected likewise, with the helper
`We guessed from your phone’s region — change it if it’s wrong.` **Units follow what the user types** (bug B-43): if
the metrics step later receives cm/kg while units are Imperial (or ft/lb while Metric), units switch to match and a
one-line notice says `Switched to metric because you entered cm and kg.` with `Undo`.
The same step asks, once (⚖ D-13, UX-39): `Plan my next week automatically every Sunday?` — a switch, **off** by
default, helper `We’ll have next week ready on Monday. You can change this any time.`

**Step — Your goal** (optional, protect D18). Keeps the four `GOALS` and adds a fifth, first card:
`Just good food` — `No calorie target. We’ll plan balanced meals and never count for you.` Choosing it, or skipping,
means **no calorie ring and no body-metric prompts anywhere** (B-31, UX-04). Choosing Lose / Maintain / Gain / Eat
healthier shows the Body metrics step (still optional) with the wellness disclaimer (UX-22). Two further goal cards
come from UX-35: `Recomposition` and `Fuel my training`.

**Step — Your targets** (UX-35 component, in onboarding when Track is chosen, or Train + a numeric goal): the user
either accepts the suggested numbers (with their "why") or types their own (P07's coach-set 2,000 kcal / 150 g).
Choosing Track **keeps the ring as home** (D20) — the only job that does.

**Finish.**

- Food-only: primary button `Plan my first week` → saves everything, calls generate (curated, free) in the
  background, lands on Food Today, where the first card is `Your first week is ready` (UX-04) — or, while generating,
  a skeleton card `Planning your week…` (max 10 s; on failure `We couldn’t plan your week just now.` + `Try again`).
- Train + food: primary button `Next: set up training` → saves and starts generation, then `router.replace('/today')`
  - `router.push('/gym/setup?from=onboarding&days=0,2,4')`. The gym wizard's last step keeps "You're set" and lands on
    Gym Today.
- Progress label: `Step {i} of {n}` once jobs are known (the total never grows after step 1 — reuse
  `onboardingProgress`).

**Returning users / Settings.** Settings › `What you use Chefer for` opens the same Jobs step as a screen with a
`Save` footer. Adding `Train` offers `Set up training now` (→ gym setup). Adding a food job to a gym-only user offers
`Set up your food — 3 quick questions` (→ onboarding food steps only). Existing single intents map on read:
`EAT_BETTER → [Plan my meals]`, `HOUSEHOLD → [Feed my household]`, `TRAIN → [Train]`. A legacy account with food logs on
≥ 3 of the last 7 days also gets `Track what I eat` pre-selected (it already behaves like a tracker).

#### Copy

| Key                   | Copy                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jobs title / helper   | `What should Chefer help with?` / `Pick all that fit. You can change this any time in Settings.`                                                                      |
| Train                 | `Train` — `Workouts that tell you what to lift next. Free.`                                                                                                           |
| Plan my meals         | `Plan my meals` — `A week of meals that fits your time and taste, with one shopping list.`                                                                            |
| Feed my household     | `Feed my household` — `One plan for everyone at my table, allergies included.` (D8 wording kept)                                                                      |
| Use what I have       | `Use what I have` — `Keep track of what’s in my kitchen and use it first.`                                                                                            |
| Cook my saved recipes | `Cook my saved recipes` — `Keep recipes from links and videos, and plan with them.`                                                                                   |
| Track what I eat      | `Track what I eat` — `Log meals fast against my own calorie and protein targets.`                                                                                     |
| units switch          | `Switched to metric because you entered cm and kg.` / `Switched to imperial because you entered ft and lb.` + `Undo`                                                  |
| auto-plan question    | `Plan my next week automatically every Sunday?` / `We’ll have next week ready on Monday. You can change this any time.`                                               |
| continue / skip       | `Continue — {n} selected` / `Just looking around`                                                                                                                     |
| training days         | `Which days do you usually train?` / `We’ll plan more food on these days and remind you to train. You can change them any time.` / `{n} days a week` / `Not sure yet` |
| currency helper       | `We guessed from your phone’s region — change it if it’s wrong.`                                                                                                      |
| goal: new card        | `Just good food` / `No calorie target. We’ll plan balanced meals and never count for you.`                                                                            |
| finish (food)         | `Plan my first week`                                                                                                                                                  |
| finish (train + food) | `Next: set up training`                                                                                                                                               |
| generating            | `Planning your week…` · failure `We couldn’t plan your week just now.` + `Try again`                                                                                  |
| settings: add Train   | `Set up training now` · add food: `Set up your food — 3 quick questions`                                                                                              |

"Use what I have" and "Cook my saved recipes" must not over-promise (UX-25): until UX-15 / UX-17 ship, their home
cards say exactly what the free tier does (UX-04 copy) and carry at most one `LockedFeatureCard` (PAT-3).

#### Components & files

- **Change:** `src/features/onboarding/intent-step.tsx` → rename to `jobs-step.tsx` (multi), `onboarding-wizard.tsx`
  (step builder, new steps, finish/hand-off), `src/features/preferences/components/goal-step.tsx` (Just good food),
  `src/features/gym/setup/setup-wizard.tsx` (accept `from=onboarding` + `days` params: pre-fill step 1 and 4, start at
  step 2; back from step 2 returns to onboarding's last step, not out of the flow).
- **New:** `src/features/onboarding/training-days-step.tsx`, `src/features/onboarding/how-you-cook-step.tsx` (shared
  with UX-07's Preferences card), `app/settings/jobs.tsx` (or a section of the Settings hub, PAT-9).
- **Shared:** `packages/types/src/household.ts` — new `ONBOARDING_JOBS = ['TRAIN','PLAN_MEALS','HOUSEHOLD',
'USE_WHAT_I_HAVE','SAVED_RECIPES','TRACK']`; `packages/utils/src/household.ts` — `onboardingSteps({ jobs, … })`.
  **Needs (additive):** `preferences.setJobs({ jobs })` + `onboardingJobs` on the profile; the API keeps writing the
  legacy `onboardingIntent` (first mapped job) so web and older binaries still work; `trainingWeekdays` stored on the
  profile until a gym profile exists.

#### Interaction & motion

Card select: scale 0.98 on press (`pressScale="card"`) + selection haptic. Steps slide horizontally
(`duration.base`, fade under reduced motion). The generate call runs in the background; leaving onboarding never
cancels it.

#### Accessibility

Job cards: `accessibilityRole="checkbox"`, label `Train. Workouts that tell you what to lift next. Free.`, state
checked. The Continue label is announced when the count changes. Weekday chips read full names (`Monday`), not `M`.

#### Analytics

`onboarding_intent { jobs[] }` (extends the web event) on Continue · `onboarding_step_completed { step, skipped }` per
step · `onboarding_completed { jobs[], householdSize, hasRestrictions, currency }` · `onboarding_handoff_gym
{ fromFood: true }` (new) when the Train + food path opens gym setup.

#### Acceptance criteria

1. The jobs step allows selecting several cards; tapping a selected card deselects it; Continue is disabled at 0.
2. Train only → gym setup exactly as today (Maestro `gym-mode.flow.yaml` still passes).
3. Train + Plan my meals → Training days → Allergies & diets → How you cook → Your goal → (metrics only if a numeric
   goal) → gym setup opening at step 2 with step 1's count and step 4's weekdays pre-filled.
4. Feed my household adds the Table step before Allergies & diets; the diet step is titled `Your own allergies & diet`.
5. Currency and units appear in How you cook, pre-selected from the device region, and the choice is saved.
6. Choosing `Just good food` or skipping the goal step results in a Food Today with **no** calorie ring, no
   `Complete your profile` card and no weight card (UX-04 acceptance 4).
7. Finishing a food path generates a first week without a further tap; Food Today shows `Your first week is ready`.
8. A user with a legacy intent sees the matching job pre-selected in Settings › What you use Chefer for.
9. Onboarding completion rate target ≥ 80 % and ≥ 70 % of Train + food users finish both setups (stage 2 §7.4) —
   measured after UX-12.
10. `Track what I eat` adds the Your targets step and ends on a Food Today whose first card is the ring (D20); it is
    the only job that keeps the ring as home.
11. On an en-US device, typing 170 cm / 65 kg switches units to metric with the notice and `Undo` (bug B-43).
12. The Sunday auto-plan switch is asked once, defaults off, and its answer is saved (⚖ D-13).

#### Edge cases

Back from gym setup step 2 returns to the onboarding goal/metrics step, not to Today. Killing the app mid-onboarding
resumes at the last unfinished step (persist step + answers in the KV store). Premium accounts: the premium branch
(goal → metrics → diet → cuisine) collapses into the same builder; `Cuisine & cadence` becomes part of How you cook.
A user who picks only `Use what I have` still gets How you cook (plans are how the kitchen gets used).

#### Web parity

Web wizard `apps/web/src/features/onboarding/components/onboarding-wizard.tsx`, `step-intent.tsx`, `step-goal.tsx`,
`step-diet.tsx`, `step-cuisine.tsx` get the same jobs step, step builder, How you cook step and Just good food, from
the shared `@chefer/utils`. Web gym setup exists (`apps/web/src/app/(dashboard)/gym/setup/page.tsx`, G5); the
Train + food hand-off goes there with the same query params. Same PR group.

**Dependencies.** UX-01 (the new Allergies & diets step), UX-07 (How you cook), UX-22 (goal-step disclaimer). Feeds
UX-04 (home by job), UX-06 (training days). **Protect:** D3 (gym wizard copy, order, Weekly balance), D8, D18.
**Validate:** V2 (does the beachhead activate), plus a first-click test of the jobs cards (stage 1 §8 #2).

<a id="ux-04"></a>

### UX-04 "Tonight" home and context-aware return

**Problem & evidence.** 8/10 (CI-04, Sev 3), CI-01 (8/10), CI-35 (4/10), CI-51. After a missed planned day Gym Today
says nothing (P09-M23); P10's relaunch led with a yellow `PLAN UNDER TARGET` warning
([P10](../screenshots/P10/083-s2-relaunch.png): "The first thing I see is that my own plan is wrong."). Cold start reopens the last-used side
(`mode-store.ts` L14–28), so lifters landed on Food on a training evening ([P01](../screenshots/P01/118-s2-home.png));
evening Food Today leads with the ring, "Complete your profile" and "Next meal: breakfast"
([P08 at night](../screenshots/P08/096-s2-relaunch.png), [P04 "Tomorrow · Breakfast"](../screenshots/P04/082-s2-today-scroll.png));
minutes after a workout Gym Today offers the next one ([P03](../screenshots/P03/057-after-done.png)). The one good
case was P02, who closed on Gym and reopened on her workout (P02-M32).

> "I train tonight, why am I looking at a frittata?" (P01) · "Breakfast at eight in the evening? And not a word about my fridge." (P08) · "Wait, do I have to do another one today?" (P03)

**User story.** As a lifter who cooks, when I open Chefer on a Wednesday evening I want to see tonight's workout or
tonight's dinner, ready to start, so that the app gets me doing the thing in one tap.

#### Flow & states

**1. Where the app opens** — a pure function `landingFor(...)` in `packages/utils/src/landing.ts`, applied on cold
start and on returning to the foreground after ≥ 30 min while a tab root is showing. It is never applied when a deep
link or notification tap is being handled, or when the user is inside a flow (workout, cook mode, onboarding, a sheet).

| #   | Condition (first match wins)                                                                                                                          | Lands on                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | A workout is in progress (active-session store)                                                                                                       | Gym Today (its Resume card is first)        |
| 2   | Jobs = Train only                                                                                                                                     | Gym Today                                   |
| 3   | Jobs have no Train                                                                                                                                    | Food Today                                  |
| 4   | Today is a planned training weekday, no workout completed today, and local time ≥ 14:00 — or ≥ 2 h before the user's reminder time if that is earlier | Gym Today                                   |
| 5   | Otherwise                                                                                                                                             | Food Today                                  |
| —   | Jobs unknown (legacy account, never re-onboarded)                                                                                                     | the persisted last mode (today's behaviour) |

The Food | Gym pill reflects the route actually shown (PAT-9), and a landing never writes the persisted mode.

**2. Food Today becomes a stack of job cards** (PAT-6). Order from `homeCardOrder`:

| Moment (local time)            | Cards, top to bottom (only those that apply)                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 04:00–15:59                    | `next-up` (today's next planned meal — today's hero, renamed) · `workout` (if a training day and not done) · `nutrition` (goal users) · `week-glance` · `shop-due` (if a shop is due today) · `favourites`                                      |
| 16:00–21:29                    | `tonight` (today's dinner if planned and not done) · `workout` (training day, not done — promoted above `tonight` if jobs include Train and it is ≥ 14:00) · `shop-due` (things to buy for tomorrow) · `nutrition` (goal users) · `week-glance` |
| 21:30–03:59, or dinner done    | `tomorrow` (tomorrow's first planned meal; for dinners-only plans, tomorrow's dinner) · `shop-due` · `week-glance`                                                                                                                              |
| No plan this week              | `plan-week` card first at any time                                                                                                                                                                                                              |
| First session after onboarding | `week-ready` (`Your first week is ready`) first, once                                                                                                                                                                                           |

`nutrition` (the ring card, `NutritionSummary`) appears **only** for users who chose `Track what I eat`, have a numeric
goal (Lose / Maintain / Gain / Eat healthier / Recomposition / Fuel my training), or turned on Settings ›
`Show calories and macros on Today` (default on for those). The same rule hides `WeightCard`, the
`Complete your profile` nudge and `Snap to log` — B-31. Everyone keeps a small `Log something you ate` text row at the
bottom (opens Quick add).

**Tracker home (D20).** For users with the `Track what I eat` job the order is fixed at every hour: `nutrition` (ring,
macros, Quick add and Snap to log directly below — the layout P07 praised) → `next-up` / `tonight` → the rest. Only the
ring's status chip changes: it never leads with a warning on open (see UX-11 §3: `Plan under target` becomes a neutral
`Plan: 1,830 of 2,284 kcal` with a `Fix it` action).

**3. The Tonight card** (`tonight-card.tsx`, evolves `HeroMealCard`):

```
┌──────────────────────────────────────────────┐
│ [ recipe photo, 16:9, 160 pt ]                │
│ TONIGHT · DINNER                 [Checked 3] │
│ Red lentil & spinach curry                    │
│ 25 min · for 2 · 540 kcal*                    │
│ [      Cook it      ]  [    Swap    ]         │
│ I ate this*                                   │
└──────────────────────────────────────────────┘
 * kcal and "I ate this" only for goal users
```

- `Cook it` → cook mode with `meal=dinner` and the slot portion. `Swap` → `RecipePickerSheet` for tonight's slot
  (**needs (additive):** `planId`, `dayOfWeek`, `slotIndex` on the hero meal in `dashboard.summary`).
- **Done state:** after cook mode finishes or the meal is logged, the card collapses to a 56 pt row
  `check  Dinner done · Red lentil & spinach curry` with a `Rate it` text button (D10 rating), and `tomorrow` appears
  under it.
- **No dinner planned tonight** (dinners-off or an empty slot): the Tonight card is replaced by
  `Nothing planned tonight` / `Pick something quick from your recipes` + `Find a recipe` (→ Cookbook filtered to
  ≤ 30 min) — never a breakfast.

**4. Shop-due card:** `7 things to buy for tomorrow` / `Chicken thighs, rice, spinach and 4 more` / `Open list`.
**Needs (additive):** `dashboard.summary.shopDue { count, sample: string[], forDate }` = unticked list lines used by
tomorrow's planned meals. Hidden when 0.

**5. Workout card on Food Today** (`TodaysWorkoutCard`, `src/features/gym/today/todays-workout-card.tsx`):

- Training day, not done: eyebrow `TRAINING TODAY` (`TRAINING TONIGHT` after 16:00), title `{dayName}`, detail
  `~{min} min · {n} exercises`, primary `Start workout` (sets mode, pushes Gym Today and starts — one tap).
- Done today: `Done today ✓ · Next: {dayName} on {weekday}`; no button.
- Rest day: `Rest day · Next: {dayName} on {weekday}` (no Start; a text link `Train anyway` → Gym Today).

**6. Gym Today after a workout, and on rest days** (`src/features/gym/today/today-screen.tsx` L279–346; shared with
UX-05, fixes CI-35 / bug B-15):

```
┌ check  Done today ────────────────────────────┐
│ Upper A · 52 min · 18 sets · 1 PR              │
│ Next session: Thursday — Lower A               │
│ [ See summary ]                                 │
│ Train again today? Pick a day                   │
└─────────────────────────────────────────────────┘
```

On a non-planned weekday with nothing done: card title `Rest day`, body `Next session: {weekday} — {dayName}. Rest
counts too.`, secondary outline button `Start {dayName} anyway`. The week ring, week strip, `Log a past workout` and
the last-session row are unchanged.

**7. After a missed planned day — a kind next step** (P09-M23; P6, protect D22). When the persisted bootstrap shows a
planned weekday passed this week without a session, Gym Today (and the Food Today workout card for Train users) shows
at the top, once per missed day:

```
┌ calendar  Still time this week ─────────────────┐
│ You planned Full Body B for Wednesday. Want to   │
│ do it on Friday instead?                          │
│ [ Move it to Friday ]      Not this week          │
└───────────────────────────────────────────────────┘
```

`Move it to Friday` moves that day's session to the next free planned-or-unplanned weekday this week (`Friday` =
the first day with no session planned; on Sunday the card offers `Start it now` instead). `Not this week` dismisses it
with the snackbar `No problem — missing a session changes nothing.` Never the words "missed", "behind" or a red
colour; never shown if the weekly goal is already met. **Needs (additive):** a per-week move of a planned weekday
(shared with UX-36's carry-over).

**8. Stop B-31 on other surfaces:** cook-mode finish (`app/cook/[id].tsx`) drops `…so your nutrition stays honest`
for users without a numeric goal and shows `Rate it` + `Done`; the AI Chef example prompts (`app/chat.tsx`) use
job-based examples (`What can I make with chicken and rice?`) instead of calorie ones for non-goal users.

#### Copy

| Key              | Copy                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tonight eyebrow  | `TONIGHT · {MEAL}`                                                                                                                                                                                                                          |
| tonight done     | `Dinner done · {recipe}` + `Rate it`                                                                                                                                                                                                        |
| nothing tonight  | `Nothing planned tonight` / `Pick something quick from your recipes` / `Find a recipe`                                                                                                                                                      |
| tomorrow eyebrow | `TOMORROW · {MEAL}` (never `Next meal` after 21:30)                                                                                                                                                                                         |
| next-up eyebrow  | `NEXT UP · {MEAL}`                                                                                                                                                                                                                          |
| shop due         | `{n} things to buy for tomorrow` / `{a}, {b}, {c} and {n} more` / `Open list`                                                                                                                                                               |
| plan-week        | `No plan for this week yet` / `{config summary, UX-07}` / `Plan my week`                                                                                                                                                                    |
| week-ready       | `Your first week is ready` / `{n} meals planned{, training days marked}.` / `See the week`                                                                                                                                                  |
| log row          | `Log something you ate`                                                                                                                                                                                                                     |
| workout (food)   | `TRAINING TODAY` · `TRAINING TONIGHT` · `~{min} min · {n} exercises` · `Start workout` · `Done today ✓ · Next: {dayName} on {weekday}` · `Rest day · Next: {dayName} on {weekday}` · `Train anyway`                                         |
| gym done         | `Done today` / `{dayName} · {min} min · {sets} sets{ · {n} PR}` / `Next session: {weekday} — {dayName}` / `See summary` / `Train again today? Pick a day`                                                                                   |
| gym rest         | `Rest day` / `Next session: {weekday} — {dayName}. Rest counts too.` / `Start {dayName} anyway`                                                                                                                                             |
| missed-day step  | `Still time this week` / `You planned {dayName} for {weekday}. Want to do it on {nextDay} instead?` / `Move it to {nextDay}` / `Not this week` / snackbar `No problem — missing a session changes nothing.` / Sunday variant `Start it now` |
| settings toggle  | `Show calories and macros on Today` / helper `Off: Today shows your meals and workouts, without numbers.`                                                                                                                                   |

#### Components & files

- **New:** `packages/utils/src/landing.ts` (`landingFor`), `packages/utils/src/home-cards.ts` (`homeCardOrder`),
  `src/features/dashboard/components/tonight-card.tsx`, `tomorrow-card.tsx`, `shop-due-card.tsx`,
  `plan-week-card.tsx`, `week-ready-card.tsx`.
- **Change:** `app/(food)/index.tsx` (render by `homeCardOrder`; remove the always-on ring, weight, nudge),
  `src/features/dashboard/components/hero-meal-card.tsx` (becomes `next-up`), `app/(food)/_layout.tsx` and
  `src/features/gym/mode-store.ts` (launch uses `landingFor`; add a foreground listener),
  `src/features/gym/components/mode-switch.tsx` (route-derived pill), `src/features/gym/today/todays-workout-card.tsx`,
  `src/features/gym/today/today-screen.tsx` (done/rest states), `app/cook/[id].tsx` (finish copy), `app/chat.tsx`
  (examples), `app/preferences.tsx` (toggle).
- **Needs (additive):** in `dashboard.summary` — hero `planId`/`dayOfWeek`/`slotIndex`, `tonight`, `tomorrow`,
  `shopDue`; `workoutDoneToday` comes from the persisted gym bootstrap (offline-safe).

#### Interaction & motion

Cards enter with the house stagger (fade + 8 pt rise, 40 ms apart). The Tonight → done collapse animates height over
`duration.base` with `haptics.success`. A landing redirect happens before the first frame (no flash of the other
mode — keep the synchronous KV read).

#### Accessibility

Each card is one navigable group with a sentence label (`Tonight: Red lentil and spinach curry, 25 minutes, for 2.`)
and its buttons as separate elements. Time-of-day logic never hides content from screen-reader users — the same cards
exist in the same order.

#### Analytics

`app_opened { landing: food_today|gym_today|other, localHourBucket, trainingDayPlanned, fromPush }` ·
`home_card_tapped { card }` · `cook_finished { fromPlan }` (WPD) · existing `workout_started { source }`.

#### Acceptance criteria

1. `landingFor` unit tests cover every row of the landing table, including the reminder-time rule and "workout
   already done today".
2. Cold start at 18:00 on a planned training weekday with no completed session opens Gym Today; the pill shows Gym.
   After finishing that workout, a cold start at 20:00 opens Food Today.
3. At 18:00 with dinner planned and not done, the first Food Today card is `TONIGHT · DINNER` with `Cook it` and
   `Swap`; after cook mode finishes, it collapses to `Dinner done` and `TOMORROW` appears.
4. For jobs without a numeric goal (e.g. Feed my household, or goal skipped / Just good food), Food Today shows no
   ring, no weight card, no `Complete your profile` and no `Snap to log`.
5. At 22:00 Food Today never shows `NEXT UP · BREAKFAST`; it shows `TOMORROW · …`.
6. After `Finish` on a workout, Gym Today shows `Done today` with the next session's weekday and name and no
   `Start workout` button (fixes bug B-15).
7. On a rest weekday Gym Today shows `Rest day` and the next planned session.
   7a. The day after a missed planned session, Gym Today shows `Still time this week` with a working `Move it to …`;
   it never appears once the weekly goal is met, and no screen uses "missed" (copy grep) — stage 2 target: a next
   step shown after 100 % of missed planned days.
   7b. For a `Track what I eat` user, the ring card is first at every hour and never opens with a warning chip.
8. A notification tap still opens its target, not the landing (existing `use-notification-links.ts` behaviour).
9. Targets after UX-12: evening opens on a planned training day land on Gym ≥ 90 %; Tonight tap-through ≥ 25 % of
   evening opens.

#### Edge cases

Training planned but the gym profile has no weekdays → rule 4 never fires; landing = Food Today. Dinner logged via
"I ate this" but not cooked → done state too. Two dinners (household of 4 on free is still one slot) → one card.
Midnight crossing while the app is open: cards re-evaluate on focus. The week changes on Monday 00:00 local.
Offline: cards render from the cached dashboard; `Swap` disabled with `Needs a connection`.

#### Web parity

Web dashboard `apps/web/src/app/(dashboard)/dashboard/page.tsx`, `features/dashboard/components/next-meal-card.tsx`,
`nutrition-summary.tsx`, `training-day-note.tsx`: ship the job-based card order, Tonight/Tomorrow cards and the B-31
hiding in the same PR group (shared `homeCardOrder`). The mode-landing rule has no web counterpart until web gym mode
(G5) lands: add a `mobile_parity_backlog.md` **reverse** entry ("landingFor: open /gym on a training evening") for G5.

**Dependencies.** UX-03 (jobs; without it, jobs are inferred from the legacy intent), UX-07 (dinners-only config for
the tomorrow rule). Shares the Gym Today done/rest states (item 6) and `TodaysWorkoutCard` (item 5) with UX-05: they are built once, by
the gym-lane agent that owns `src/features/gym/**` (see §7).
**Protect:** D1 (Resume card), D3 tone, D10 (cook mode), D17 (Quick add speed). **Validate:** V3 diary study.

<a id="ux-05"></a>

### UX-05 Protect the gym engine (expert control, beginner clarity)

**Problem & evidence.** 5/10 gym personas; the gym side carries every tomorrow-score ≥ 5 (D1–D4), so its defects are
retention risks. Experts lose trust in the progression: a back-off set became next week's weight
([P01 bench 90 → "80 kg — same weight"](../screenshots/P01/087-workout-summary.png), bug B-07) and skipped sets ignored
a 150 kg deadlift ([P01](../screenshots/P01/134-lower-summary.png), bug B-08), and P09 was sent back to 8 kg dumbbells
after pressing 16s on an incomplete session — CI-31 (3/10). The lifter's split sits below a
long preview ([P01](../screenshots/P01/017-onb-program-end.png), CI-30) and the weekly goal follows the template (bug
B-18). Stats are clipped and unlabelled ([P01](../screenshots/P01/148-gym-stats.png), CI-36, 4/10). Beginners meet
jargon and can't tap an exercise name to learn it ([P06](../screenshots/P06/065-tap-goblet.png), CI-32). Adjust takes
44 taps ([P01](../screenshots/P01/135-dl-adjust.png)); logger papercuts (CI-42); swap sheets suggest the wrong things
(CI-34, 4/10); the routine editor truncates exercise names ("Dumbbe…" ×3, [P06](../screenshots/P06/111-s2-routine-edit.png),
CI-43, also P09 while cutting a session); after a workout it offers the next one (CI-35 — built with UX-04 §6).
**Moved out in the final strategy:** gym settings reachability (CI-23) and reminders (CI-27) now belong to **UX-36**.

> "80?! This is exactly why I don't trust auto-progression." · "Forty taps. And it thinks I deadlift 40." (P01) · "I don't know what any of these are." (P06)

**User story.** As an experienced lifter I want Chefer to run _my_ split and base next week on what I actually lifted,
and as a beginner I want every term and exercise explained where I meet it, so that both of us keep trusting the
"Next time" numbers.

**Protect (non-negotiable, P11):** D1 logger speed (pre-filled weights, one-tap ✓, rest timer, plate keypad, offline);
D2 Why?/Next time sentences and Adjust ("Your target wins"); D3 setup wizard (one question per screen, "Consistency
beats ambition", "Missing a session changes nothing", Weekly balance); D4 exercise detail. Any change to those screens
is additive.

#### A. Progression you can trust (fixes bugs B-07, B-08; logic in stage 4)

Engine rule (for stage 4, stated here because the copy depends on it): the working weight is the **heaviest completed
working set** (not the lightest); sets the user marks as back-off/drop sets (existing set types) are excluded; when
sets are skipped but a completed set was **heavier** than the prescription, the next target uses the lifted load.
New and changed reason sentences (`packages/utils/src/gym/reasons.ts`):

| Situation                                         | Next-time sentence (exact)                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top set hit all reps, back-off set lighter        | `Your top sets were {w} × {reps}, so next time: {w'} — aim for {aim}.`                                                                                                              |
| Missed reps on the top weight (was `MISSED_ONCE`) | `Tough day at {w}, so same weight. Get {repMin} on every set.`                                                                                                                      |
| Skipped sets, heavier than prescribed             | `You lifted {lifted} × {reps} on {done} of {planned} sets, so next time starts from {lifted}.`                                                                                      |
| Skipped sets, not heavier                         | `You skipped {n} sets, so same targets next time.` (unchanged)                                                                                                                      |
| Load increase (summary context)                   | `You hit {repMax} on every set, so +{delta} next time.` — **"today" is only used inside the workout** (the reasons builder takes `when: 'today' \| 'next'`, fixes P01-M26, P03-M28) |

Every Next-time row keeps `Adjust`. `suggestion_overridden` keeps firing on a change.

#### B. Your split, up front (CI-30, bug B-18)

- **Setup step 2** (experience): when the answer is `Experienced`, a follow-up on the same screen:
  `Do you already follow a split?` (`ChipGroup`, single): `Pick one for me` (default) · `Push / Pull / Legs` ·
  `Upper / Lower` · `Full body`. A choice other than the default makes step 5 lead with that template (mapped to the
  closest template for the chosen day count in `packages/utils/src/gym/templates.ts`).
- **Setup step 5** ("Your program"): the program card is followed **immediately** by `Other programs that fit {n}
days` — the three alternatives as visible rows (name, `{n}× a week · {description}`), each with a `Use this`
  button — then the day previews, then Weekly balance. The bottom `Choose another program` button stays as a second
  path. No alternative sits below the fold on a 667 pt-tall screen at default text size.
- **Weekly goal = the user's days.** `Weekly goal: {n} sessions — your {n} days` is shown on step 7 ("You're set");
  if the template has fewer days than chosen, the extra day is labelled `Optional {n}th day` in the preview and still
  counts toward the goal only if the user keeps `Count it toward my goal` on (default on).
- **Starting weights (step 6)**: each row gains a `reps` field next to the weight (`kg × reps`, both numeric with
  `NumericReturnBar` + `useFieldChain`), and a final row `+ Add a lift you already do` (exercise picker) so a deadlift
  outside the program can be recorded (P01).
- **Routine tab** (`app/(gym)/routine.tsx`): header action `Change program` opens the same alternatives list.

#### C. A routine editor you can read (CI-43; gym settings moved to UX-36)

In `src/features/gym/routine/day-editor.tsx` exercise names wrap to two lines (`numberOfLines={2}`, no ellipsis on
names at any text size); `Add exercise` never clips (min width, wraps under the list at 1.8×); each day shows its
estimated duration live while editing (`~41 min`, updating as exercises are removed — P09 only saw it back on Today);
the Weekly-balance tip does not nag about a muscle the user removed on purpose in this edit session. The red
`Delete` under each day (P06 fear, CI-23) moves into a day overflow (`⋯` → `Delete day`, still with the existing
confirm); saving a routine shows the snackbar `Routine saved`. (Gym settings entry points, TimePicker reminders and
equipment editing are specified in **UX-36**.)

#### D. Typed Adjust (CI-31)

`AdjustSheet` (`src/features/gym/workout/summary-screen.tsx` L348+): the weight and each rep value become tappable
numbers that open the existing `NumberSheet` keypad (`src/features/gym/workout/number-sheet.tsx`, with the plate
calculator for barbell loads). The ± steppers stay for small nudges. Reaching 150 kg from 40 kg takes ≤ 5 taps.

#### E. Explained, tappable exercises and a glossary (CI-32)

- **Tap a name → exercise detail (D4)** everywhere an exercise is listed: setup step 5 preview, Gym Today next-up,
  Routine tab, summary. In the Routine tab the row's current tap (opens the "Next target" override) moves to an
  explicit trailing `Edit target` text button (44 pt); the name opens `/gym/exercise/[id]`.
- **Glossary (PAT-7)**: `3 × 8–12` becomes `3 sets of 8–12 reps` the first time it appears in setup step 5 and on the
  first Gym Today, then `3 × 8–12` with a GlossaryTerm; `delts`, `Flex week`, `deload`, `superset`, `e1RM`,
  `Relative strength` all become GlossaryTerms. Muscle labels read `Side delts (shoulders)`, `Rear delts (back of
shoulders)`. "1.5 sets" in Weekly balance becomes `1½ sets (a set that works two muscles counts half for each)` on
  first sight.

#### F. Stats that explain themselves (CI-36, bug B-16)

- `packages/ui-mobile/src/components/charts/line-chart.tsx`: the y-axis label column sizes to the longest label
  (measure text, min 38 pt) — no clipping (`255.4 kg` shows fully).
- `strength-trend-view.tsx`: caption `Estimated 1-rep max (e1RM)` with a GlossaryTerm; a tooltip on tap of a point
  shows `{date} · {weight} × {reps} → e1RM {value}`.
- `pr-timeline-view.tsx` / summary: first-time maxes count as PRs (`First {lift}: {w} × {reps}`), so "No PRs yet" never
  shows after a real logged lift.
- `muscle-volume-view.tsx`: a legend under the stacked bar (colour swatch + label, wraps), chip labels
  sentence-cased (`Back`), `Relative strength` renamed `Strength per kg of body weight`.

#### G. Logger papercuts (CI-42, bug B-20)

In `src/features/gym/workout/exercise-card.tsx` and `workout-screen.tsx`:

- Answering the effort question (`How many more reps could you have done?`) **does not collapse** the exercise while
  it has unticked sets or within 4 s of the answer; the summary chip appears inline.
- Typed **reps** propagate to later unticked sets exactly like weight does (bug B-20).
- A visible way to delete a set: `Remove set` in the exercise's ⋯ menu (exists as `onRemoveSet`) plus a
  `minus-circle-outline` 44 pt button at the end of an unticked extra set row. Long-press stays.
- Bodyweight exercises offer `+ Add weight` (belt/vest) in the ⋯ menu when the user has `Dip belt` / `Weighted vest`
  (settings above).

#### H. Swap sheets that fit (CI-34)

`src/features/gym/library/exercise-picker.tsx` (and the workout swap flow): suggestions filter to the user's equipment
first (`Matches your equipment`), then `Needs other equipment` collapsed; while the search field has focus, the muscle
chips collapse into one horizontal scroll row so ≥ 5 results are visible above the keyboard on a 667 pt screen; the
list does not reflow under a finger (stable keys, no layout animation during typing).

#### Copy (additional)

| Key                  | Copy                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| split question       | `Do you already follow a split?` · `Pick one for me` · `Push / Pull / Legs` · `Upper / Lower` · `Full body` |
| alternatives heading | `Other programs that fit {n} days` · row button `Use this`                                                  |
| weekly goal          | `Weekly goal: {n} sessions — your {n} days` · `Optional {n}th day` · `Count it toward my goal`              |
| add a lift           | `+ Add a lift you already do`                                                                               |
| routine              | `Change program` · `Edit target` · `Routine saved` · `Delete day` · `~{n} min`                              |
| e1RM caption         | `Estimated 1-rep max (e1RM)`                                                                                |
| relative strength    | `Strength per kg of body weight`                                                                            |
| first max            | `First {lift}: {w} × {reps}`                                                                                |
| swap groups          | `Matches your equipment` · `Needs other equipment`                                                          |
| remove set           | `Remove set`                                                                                                |

#### Components & files

`packages/utils/src/gym/progression.ts`, `reasons.ts`, `templates.ts` (logic + copy); `src/features/gym/setup/setup-wizard.tsx`
(B), `app/(gym)/routine.tsx`, `src/features/gym/routine/day-editor.tsx` (C, E),
`src/features/gym/workout/summary-screen.tsx`, `number-sheet.tsx` (D), `src/features/gym/today/today-screen.tsx`
(E + UX-04 §6), `src/features/gym/stats/*` + `packages/ui-mobile/src/components/charts/line-chart.tsx` (F),
`src/features/gym/workout/exercise-card.tsx`, `set-row.tsx`, `workout-screen.tsx` (G), `src/features/gym/library/exercise-picker.tsx` (H),
and `apps/mobile/src/components/glossary-term.tsx` (PAT-7).

#### Accessibility

Exercise names become `accessibilityRole="link"` with hint `Opens how to do {name}`. The typed Adjust keeps the
stepper's `accessibilityActions` (increment/decrement). Stats legend is readable by screen readers as a list. The
effort question stays a radio group.

#### Analytics

`split_chosen { template, wasDefault }` · existing `suggestion_overridden` (target < 15 % of summaries) ·
`glossary_opened { term }` (new; term ids are not health data).

#### Acceptance criteria

1. Unit: bench 90×6, 90×6, 90×5 + back-off 80×8 → next target ≥ 90 kg with the "Tough day at 90 kg" sentence; never
   80 kg. Deadlift 150×5 on 1 of 3 sets (prescribed 40×10) → next starts from 150 kg.
2. No summary sentence says "today" about the next session.
3. Experienced + `Push / Pull / Legs` + 5 days → step 5 leads with the closest PPL template; alternatives are visible
   without scrolling on an iPhone SE-size screen at default text.
4. 5 chosen days → weekly goal 5 (bug B-18).
5. The routine editor shows full exercise names at default and 1.8× text on a 375 pt-wide screen, and the day's
   duration updates live while editing (CI-43).
6. Adjust: 40 → 150 kg in ≤ 5 taps via the keypad.
7. Tapping any exercise name in setup preview, Gym Today, Routine and summary opens its detail screen.
8. Strength trend labels are never clipped (snapshot at 255.4 kg); caption names e1RM; a first logged max shows as a
   PR.
9. Answering the effort question on set 2 of 3 does not collapse the card; typed reps carry to later unticked sets.
10. With `Full gym`, swap suggestions for incline DB press list barbell/dumbbell/cable options before bodyweight.
11. The Maestro gym flows (`e2e/gym-*.flow.yaml`) still pass; visual diff of the logger's set rows and the Why? sheet
    is empty (D1, D2).

#### Edge cases

Back-off sets logged _before_ the top set; supersets (progression per exercise, unchanged); timed exercises (the
"heaviest" rule applies to load, holds use duration); offline summary (Adjust disabled, unchanged). Users who picked a
split in setup and then edit the routine keep their edits.

#### Web parity

Web gym is in progress (G5, `apps/web/src/features/gym/*`, `apps/web/src/app/(dashboard)/gym/*`). The engine and
copy fixes (A) are shared in `@chefer/utils` and land on web automatically. Setup split question, typed Adjust,
tappable names, glossary and stats fixes: web counterparts exist for setup (`gym/setup`), summary (`gym/summary/[id]`),
stats (`gym/stats`) and routine edit (`gym/routine/edit`) — ship in the same PR group where the web page exists; for any web
gym screen not yet built, add a `mobile_parity_backlog.md` reverse entry for G5.

**Dependencies.** PAT-7 (glossary). UX-04 §6–7 (done/rest states, missed-day step) and UX-36 are built in the same gym
lane. **Validate:** V7 (lifters over 3–4 weeks trust the fixed progression).

<a id="ux-06"></a>

### UX-06 Food that follows training

**Problem & evidence.** 4/10 on CI-20 (P01, P02, P03, P10; P06 also wanted both halves; J8), and it is the beachhead's aha
(stage 2 §4.2). Gym data never reached food targets (P01); the training-day bump is shown **locked** on Food Today
([P01](../screenshots/P01/118-s2-home.png)); training days aren't marked on the plan
([P02 M/W/F lower than rest days](../screenshots/P02/095-nextweek-glance.png)); the post-workout "~30 g protein"
nudge links to a 12 g breakfast ([P02](../screenshots/P02/084-nextup-meal.png)); there is no combined week.
(The flat AI week is mock; the missing UI is real.) **Final synthesis:** endurance isn't modelled at all — the rule
applies only to lifters, so P10's 25 km long run got rest-day food; and finishing gym setup _silently_ rewrote her
macros (protein 128 → 93 g, bug B-48 — the notice is UX-11's, this spec must not add another silent change).

> "So it knows I trained, but my calories didn't move." (P02) · "It wants money to feed me for training. Nope." (P01) · "A plan that knows Tuesday is a lift day and Saturday is my 25 km long run, and fuels them differently." (P10)

**User story.** As a lifter who cooks for myself, I want my plan to show which days I train and give me more food
and protein on those days, with a reason, so that my food and my training feel like one plan.

**⚖ Owner decision (D-2).** Recommended and designed here: the deterministic training-day bump is **free** on Today
and in the plan's day targets, with its "why"; premium keeps **"Build my week around my training days"** (generation
that places higher-protein and higher-carb meals on training days). **Alternative (bump stays premium):** free users
still see the marker and the numbers in the Explain sheet, but the target does not move; the Today note becomes a
`LockedFeatureCard` with job `training-week` (`Eat for your training days`) placed under the ring, never above it,
and never on a user's first day. The components are the same; only `t.applied` changes.

#### Flow & states

**1. Training days are one shared fact, with a kind.** Source = the gym routine's planned weekdays (or the onboarding
answer until a gym profile exists, UX-03), plus manually entered **run days**. Each weekday has a kind: `Rest` ·
`Lift` · `Run` · `Long run` (a lift day comes from the routine; run kinds are set by the user in Settings › Training
days & reminders, UX-36, or in onboarding). No wearable integration (UX-38 stays Later). Food rules by kind
(deterministic, `packages/utils/src/training-nutrition.ts`): `Lift` → the existing protein-led bump; `Run` → a
moderate carb-led bump; `Long run` → a larger carb-led bump plus a pre-run carb snack idea the evening before;
`Rest` → the base target. Changing kinds updates the food side the same day, **and any change to targets that
results goes through the PAT-14 change notice** (UX-11) — never silently.

**2. Plan marks training days** (`app/(food)/meal-plan.tsx`):

- Day chips: a `barbell-outline` 10 pt glyph replaces the meal dot on training days (the dot moves under it); a11y
  label `Wednesday, training day`.
- Day view header (new row above the meals):

```
┌ barbell  Training day · Upper A ─────────── ⓘ ┐
│ Target today 2,540 kcal · 165 g protein         │
│ (+300 kcal, +31 g protein for training)         │
└─────────────────────────────────────────────────┘
```

Tap → `ExplainSheet` (PAT-1), eyebrow `Why this target`, title `More food on training days`, sentence
`You train on Mon, Wed and Fri. On those days Chefer adds about 300 kcal and 31 g of protein, mostly around your
  workout, to help you recover and build muscle.`, rows `Rest-day target` / `Training bonus` / `Protein basis
  (1.8 g per kg, because you train)`, footnote `Change your training days in Gym settings.`, action
`Change training days`.

- Week summary sheet rows (`week-summary-sheet.tsx`): `WED · 3 meals · 2,480 kcal · barbell Upper A`; the header gets
  a chip `3 training days`.

**3. Today** (`training-day-note.tsx`): free and premium both render the applied state:
`barbell Training day · +300 kcal, +31 g protein` / `{workout} today · protein at 1.8 g/kg, added to today` + a `Why?`
link (same Explain sheet). The locked variant and `Upgrade from your Profile →` are removed (recommended option).
Premium users additionally see, once per week on a training day, `Your week is built around your training days`
(when their plan was generated with it).

**4. Refuel after a workout** (`RefuelCard` in `src/features/gym/workout/summary-screen.tsx`):

- If the next planned meal has ≥ 80 % of the protein aim: `Next up: {recipe} · {g} g protein →` (as today, with grams).
- If it has less: `Your next meal has {g} g. Add a protein snack:` + two snack ideas as rows with `Log it` buttons,
  e.g. `Greek yogurt, 200 g · 20 g protein` / `2 boiled eggs · 13 g protein` / `Tuna on toast · 25 g protein` —
  chosen from a small curated list (`packages/utils/src/protein-snacks.ts`) **run through the UX-01 filter** (no
  yogurt for a dairy allergy, no eggs for egg-free). `Log it` calls the existing quick-add with known macros and shows
  the snackbar `Logged {snack}`.
- No plan / offline: `Log a meal →` (as today).

**5. Combined week glance** for users with Train + a food job: on Food Today the `week-glance` card (replaces
`WeekOutlook` for them) shows Mon–Sun columns with a meal count and a barbell for planned/done sessions
(`done` = filled, `planned` = outline — same visual language as the Gym week strip, never red). Today's column is
always visible (fixes the clipped Sunday, CI-13 correction: the strip is 7 equal columns, not a horizontal scroll).

**6. Premium: "Build my week around my training days"** — a switch in the Plan generate options (UX-07's plan
settings sheet) `Fit meals to my training days` (on by default for premium Train users). Free users see the switch
disabled with a `lock` and the PAT-3 taste link.

#### Copy

| Key                 | Copy                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| day header          | `Training day · {dayName}` / `Target today {kcal} kcal · {protein} g protein` / `(+{kcal} kcal, +{g} g protein for training)`                                                                                                                                                                                                                                                                                                |
| explain             | eyebrow `Why this target` · title `More food on training days` · sentence `You train on {days}. On those days Chefer adds about {kcal} kcal and {g} g of protein, mostly around your workout, to help you recover and build muscle.` · rows `Rest-day target` · `Training bonus` · `Protein basis ({x} g per kg, because you train)` · footnote `Change your training days in Gym settings.` · action `Change training days` |
| today note          | `Training day · +{kcal} kcal, +{g} g protein` / `{workout} today · protein at {x} g/kg, added to today` / `Why?`                                                                                                                                                                                                                                                                                                             |
| premium weekly line | `Your week is built around your training days`                                                                                                                                                                                                                                                                                                                                                                               |
| refuel good         | `Next up: {recipe} · {g} g protein →`                                                                                                                                                                                                                                                                                                                                                                                        |
| refuel low          | `Your next meal has {g} g. Add a protein snack:` · rows `{snack} · {g} g protein` + `Log it` · snackbar `Logged {snack}`                                                                                                                                                                                                                                                                                                     |
| week glance a11y    | `{Weekday}: {n} meals{, training day{, done}}`                                                                                                                                                                                                                                                                                                                                                                               |
| generate switch     | `Fit meals to my training days` · free hint `Premium` + `See what Premium adds`                                                                                                                                                                                                                                                                                                                                              |

#### Components & files

**Change:** `app/(food)/meal-plan.tsx` (chips + day header), `src/features/meal-plan/week-summary-sheet.tsx`,
`src/features/dashboard/components/training-day-note.tsx`, `src/features/dashboard/components/week-outlook.tsx`
(→ `week-glance.tsx` with sessions), `src/features/gym/workout/summary-screen.tsx` (`RefuelCard`).
**New:** `src/features/meal-plan/training-day-header.tsx`, `packages/utils/src/protein-snacks.ts`.
**Needs (additive):** `mealPlan.getForWeek` returns `trainingDays: { dayOfWeek, dayName, kcalBonus, proteinBonus }[]`
and per-day targets; `dashboard.summary` returns `weekGlance` (meals count + session status per day); the
`trainingNutrition` gate change is a server switch (⚖).

#### Accessibility

Barbell glyphs are paired with text or a11y labels. The day header is one button (`Training day, Upper A. Target
today 2,540 kilocalories, 165 grams of protein. Explains why.`). The week glance is a list of 7 items, not an image.

#### Analytics

`plan_viewed { weekOffset, trainingDaysMarked }` · `training_target_viewed { tier }` · `number_why_opened
{ metric: kcal|protein }` · `meal_logged { via: quick_add, planned: false }` from a snack.

#### Acceptance criteria

0. Saturday set to `Long run` → Plan shows a `walk-outline` run glyph on Saturday, the day header reads
   `Long run day · +{kcal} kcal, mostly carbs`, and Friday's evening shows the pre-run snack idea; a lift day keeps the
   protein-led bump. Setting a run day for the first time shows the change notice, not a silent new target.
1. With planned weekdays Mon/Wed/Fri, Plan shows the barbell on exactly those chips and the training header on those
   days only; the week sheet shows `3 training days`.
2. Changing the training days in Gym settings updates the Plan markers on the next focus.
3. Free user on a training day: Today shows the applied targets (bumped numbers) and a working `Why?`; no lock, no
   upgrade link (recommended option). Under the alternative flag, the lock renders below the ring and never on day 1.
4. After a workout whose next meal has < 80 % of the aim, the Refuel card offers two snacks that pass the user's
   safety filter; `Log it` logs with the snack's macros and updates Today.
5. The week glance shows all 7 days with today visible at every text size.
6. `plan_viewed.trainingDaysMarked` is true for ≥ 70 % of both-sides users in week 1 (after UX-12).

#### Edge cases

No planned weekdays → no markers, header shows nothing, Explain footnote invites setting days. Run glyph
(`walk-outline`) and header copy for run kinds: `Run day · +{kcal} kcal, mostly carbs` / `Long run day · +{kcal} kcal,
mostly carbs`; Explain sentence `Saturday is your long run. Chefer adds about {kcal} kcal, mostly from carbs, to fuel
it and recover.` A freestyle workout
on a non-planned day → Today applies the bump that day (reason `COMPLETED`, existing) and the Plan shows a filled
barbell for that day only after the fact. Dinners-only plans (UX-07): the header shows targets for the planned slots
only (`Dinner only · this meal ~{kcal} kcal`), not a daily target. Users without a numeric goal never see kcal in the
header — only `Training day · Upper A` and the protein line.

#### Web parity

Web: `apps/web/src/features/dashboard/components/training-day-note.tsx` (same free/applied change),
`features/meal-plan/components/day-view.tsx` + `DayRecapBar.tsx` (markers, header), gym summary refuel
(`apps/web/src/app/(dashboard)/gym/summary/[id]/page.tsx`, "RefuelCard"). Same PR group; shared helpers.

**Dependencies.** UX-03 (training days asked once), UX-07 (plan settings sheet for the premium switch), UX-01 (snack
filter), PAT-1. ⚖ D-2. **Validate:** V2.

<a id="ux-07"></a>

### UX-07 Plan the meals I actually cook

**Problem & evidence.** 5/10 (P02, P04, P05, P08, P10), Sev 3 (CI-11, J3), plus CI-18. `Generate Plan` asks nothing and
always returns 7 days × 3–4 meals at a kcal target ([P05 week sheet](../screenshots/P05/053-week-sheet.png),
[P02 a different lunch every day](../screenshots/P02/023-plan-tue.png)); meals-per-day exists only in the premium
onboarding branch (`cuisine-step.tsx` L80–81); there is no nights, time cap or servings input; dinners came back at
27–45 min for a 15-minute cook.

> "I only wanted dinners." (P04) · "Let me say 'four quick dinners for two, from my saved recipes'." (P05) · "This is a restaurant menu, not a meal-prep plan." (P02)

**User story.** As someone who cooks four quick dinners a week for two, I want to tell Chefer which meals, which
nights, how long I can cook and for how many, so that the plan and the list contain only what I will actually make.

#### Flow & states

**1. The "How you cook" settings** — one component (`HowYouCookForm`) used in three places: onboarding step
(UX-03), Settings › How you cook (a card in `preferences.tsx`), and the Plan's **Plan settings** sheet.

```
HOW YOU COOK
Which meals should we plan?
[Breakfast] [Lunch] [Dinner ✓] [Snacks]
On which days?
[Mon✓][Tue✓][Wed✓][Thu✓][Fri][Sat][Sun]
How long can you cook on those days?
( ≤ 15 min | ≤ 30 min ✓ | ≤ 45 min | No limit )
[ ] Weekends can take longer
Cooking for
( Just me | Two of us ✓ )   Household of 3+? Set up your table ›
──────────────────────────────
Prices in [RON ✓][EUR][GBP][USD]  Units (Metric ✓ | Imperial)   ← onboarding & Settings only
──────────────────────────────
Summary: 4 dinners for 2 · Mon–Thu · up to 30 min
```

- Meals: multi `ChipGroup`, ≥ 1 required; default `Breakfast` `Lunch` `Dinner`. Days: multi weekday chips, ≥ 1;
  default all. Time: `SegmentedControl`; default `≤ 30 min` for new users, `No limit` for existing users (no silent
  behaviour change). `Weekends can take longer` (switch): Sat/Sun use `No limit` when on.
- **Cooking for (⚖ D-7 / `householdPlans`):** recommended — `Just me` / `Two of us` are **free** (a couple cook scaling
  to 2 portions is not household planning); 3+ people is the household (`Set up your table ›` → `household.tsx`), whose
  scaling stays premium with the first week scaled free (UX-10). **Alternative** (servings stay premium): the control
  shows `Just me` only, with `Two of us` disabled + `lock` and the PAT-3 taste link; the summary line says
  `for 1 portion`.
- A live **summary line** at the bottom (and in the Plan header, see 2) — the plan's "shape" in words:
  `{n} {meals} for {who} · {days} · up to {time}`, e.g. `4 dinners for 2 · Mon–Thu · up to 30 min`,
  `Breakfast, lunch and dinner for 1 · every day · up to 45 min`.

**2. Plan tab** (`app/(food)/meal-plan.tsx`):

- **Empty week:** the card leads with the summary and a verb button that names the job:

```
┌──────────────────────────────────────────────┐
│ calendar  No plan for 28 Sep – 4 Oct yet      │
│ 4 dinners for 2 · Mon–Thu · up to 30 min      │
│ [        Plan 4 dinners        ]              │
│ Change what we plan                           │
└──────────────────────────────────────────────┘
```

`Change what we plan` opens the Plan settings sheet (the same form, `Save` footer). The premium leftovers switch and
UX-06's training switch live in that sheet under `Options`.

- **Generated week:** a compact header row under the week navigator shows the summary with a `sliders-outline`
  button (44 pt, label `Plan settings`). Days that are not planned show one muted line instead of meals:
  `Not planned — you cook Mon–Thu. Plan this day` (the link adds that day to this week only).
  Meals that are off (e.g. no lunch) are simply absent; the day totals say what they cover (`Dinner · 540 kcal`), and
  the "under target" language is suppressed when not all meals are planned (fixes the `1030 kcal under target`
  confusion for partial plans, P01-M32).
- **Your picks survive.** A meal the user chose (via Replace, an own recipe, or `Keep`) shows a `pin` glyph and the
  label `Your pick` on its card. The card's long-press menu adds `Keep this meal` / `Stop keeping`. Regenerate keeps
  them by default (UX-08 confirm).
- **Time on cards:** every meal card shows total minutes; a meal over the cap (possible with AI or own recipes) shows
  the time in amber with a11y `over your 30-minute limit`.

**3. Shopping list** follows the plan: unplanned meals and days add nothing; the list header says
`For 4 dinners · Mon–Thu · 2 portions` (with UX-08's coverage rule).

#### Copy

| Key            | Copy                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| section title  | `How you cook`                                                                                                                                                                    |
| questions      | `Which meals should we plan?` · `On which days?` · `How long can you cook on those days?` · `Cooking for`                                                                         |
| options        | `Breakfast` `Lunch` `Dinner` `Snacks` · `≤ 15 min` `≤ 30 min` `≤ 45 min` `No limit` · `Weekends can take longer` · `Just me` `Two of us` · `Household of 3+? Set up your table ›` |
| validation     | `Pick at least one meal.` · `Pick at least one day.`                                                                                                                              |
| summary        | `{n} {meal words} for {1 \| 2} · {Mon–Thu \| every day \| Mon, Wed, Fri} · up to {15 \| 30 \| 45} min` (no limit → omit the last part)                                            |
| empty week     | `No plan for {week} yet` · button `Plan {n} {meal words}` (e.g. `Plan 4 dinners`, `Plan my week` when all meals every day) · `Change what we plan`                                |
| settings sheet | title `Plan settings` · footer `Save` · options header `Options`                                                                                                                  |
| unplanned day  | `Not planned — you cook {days}.` + `Plan this day`                                                                                                                                |
| your pick      | `Your pick` · menu `Keep this meal` / `Stop keeping`                                                                                                                              |
| list header    | `For {n} {meal words} · {days} · {p} portions`                                                                                                                                    |

#### Components & files

- **New:** `src/features/meal-plan/how-you-cook-form.tsx`, `src/features/meal-plan/plan-settings-sheet.tsx`,
  `packages/utils/src/plan-shape.ts` (`planShapeSummary`, validation; shared with web).
- **Change:** `app/(food)/meal-plan.tsx` (empty state, header row, unplanned days, pick markers, day totals),
  `src/features/meal-plan/plan-meal-card.tsx` (time, `Your pick`, menu), `src/features/meal-plan/plan-day-totals.tsx`
  (partial-plan wording), `app/preferences.tsx` (new card), `src/features/onboarding/*` (step, via UX-03),
  `src/features/preferences/components/cuisine-step.tsx` (meals-per-day removed; cuisines stay, premium).
- **Needs (additive):** profile fields `planSlots`, `planDays`, `timeCapMins`, `weekendNoLimit`, `cookingFor`;
  `mealPlan.generate` accepts the same as optional overrides + `keepSlots`; the curated engine honours them (no AI
  needed); `mealPlan.setKept`. Old binaries send `{ weekOffset }` and get the profile defaults.

#### Interaction & motion

Changing settings in the Plan sheet does not regenerate by itself; the footer becomes `Save and re-plan {week}` when a
plan exists (it then goes through UX-08's confirm). Summary line updates live with a 150 ms cross-fade.

#### Accessibility

Chip groups have headers; the summary line is a live region. Day chips read full weekday names. The unplanned-day
line is a button with the label `Plan {day} too`.

#### Analytics

`plan_configured { slots[], nights, timeCap, servings }` (enums/counts) · `plan_generated { slotsCount, keptPicks,
trainingDaysMarked }` · `plan_day_added { }` (new).

#### Acceptance criteria

1. Settings `Dinner` + Mon–Thu + `≤ 15 min` + `Two of us` → a generated curated week has exactly 4 dinners, all with
   total time ≤ 15 min (or a visible amber over-limit time when the pool has none), sized for 2 portions; Fri–Sun
   show `Not planned`.
2. The shopping list for that week contains only those 4 dinners' ingredients, and its header says
   `For 4 dinners · Mon–Thu · 2 portions`.
3. The empty-week button reads `Plan 4 dinners`.
4. A meal replaced by the user shows `Your pick` and survives Regenerate with the default confirm (UX-08).
5. Day totals on a dinners-only day never say "under target".
6. The same settings are editable in onboarding, Settings › How you cook and the Plan settings sheet, and all three
   show the same values.
7. Existing users who never touch the settings get the same plans as before (3 meals, every day, no time cap).
8. `plan_configured` fires with no free text.

#### Edge cases

A pool that can't fill the shape (e.g. vegan + ≤ 15 min + dinners): generate returns what it can and the day shows
`We couldn’t find a {15}-minute {vegan} dinner for Tuesday.` + `Allow 30 min` / `Pick a recipe`. Mid-week generation
(covers remaining days, existing) combines with days: only remaining chosen days. Premium AI generation receives the
same shape. `Snacks` on with dinners only → one snack per planned day.

#### Web parity

Web `apps/web/src/app/(dashboard)/meal-plan/page.tsx`, `features/meal-plan/components/day-view.tsx`,
`GenerateOverlay.tsx`, `MealCard.tsx`, Preferences `preferences-form.tsx`, onboarding `step-cuisine.tsx`: same form
(shared `plan-shape.ts`), same empty state and markers. Same PR group.

**Dependencies.** API shape (stage 4). UX-08 for the regenerate confirm and kept picks. Feeds UX-03, UX-04, UX-06,
UX-09. ⚖ D-7 (servings). **Protect:** D5 (one-tap plan: `Plan 4 dinners` is still one tap), D11, D12 (leftovers
switch kept in Options). **Validate:** stage 1 §8 #2 (how many meals/nights each segment wants).

<a id="ux-08"></a>

### UX-08 Week mechanics you can trust

**Problem & evidence.** 7/10 in total. **CI-13 is a verified data bug (Sev 3, 7/10):** with a plan only for next week,
Plan, Shop _and_ Today all show it as "this week", so Today and Plan can show two different "today" menus —
`findActiveWithDays` returns the newest ACTIVE plan by `createdAt` with no week filter (bug B-13,
`meal-plan.repository.ts` L309–315; P10-M30, M48; [P08 Shop](../screenshots/P08/032-tobuy.png)); on top of that the
weekend opens the ending week. CI-07 (6/10, Regenerate hidden behind the week-label chevron —
[P02](../screenshots/P02/058-week-menu.png); the post-upgrade "Regenerate this week" only navigates —
[P02](../screenshots/P02/055-upgrade.png), [P06 lands on the unchanged week](../screenshots/P06/042-after-regen.png),
bug B-09), CI-18 (3/10, Regenerate wipes picks without asking — [P05](../screenshots/P05/068-regen-mon.png)), CI-34
(4/10: AI swap with no preview/undo — [P02](../screenshots/P02/094-ai-swap-result.png); Replace lands at 1× portion;
the Replace list shows duplicates and the meal being replaced, with no slot filter — 700-kcal dinners for a snack, bug
B-50, P10), CI-05 (prices with no confidence cue).

> "It's Saturday, why would I plan this week?" (P02) · "I tapped 'regenerate' and it... just showed me the plan? Where's the button?" (P02) · "It threw away my recipes without asking." (P05)

**User story.** As someone who plans on Sunday, I want the app to open on the week I'm planning, let me redo it
without losing what I chose, and label every list and total with the week it belongs to, so that I never shop for the
wrong week.

#### Flow & states

**0. One "this week" everywhere — fix the data first.** Plan, Shop and Today select the plan **by its week start**
(`weekStartDate` = the local Monday of the week being shown), never "the newest active plan" (server fix, stage 4; it
ships in wave 0 because it corrupts every Sunday planner's view). UI consequences: a week with no plan is shown as
empty (never another week's meals); Today's hero, Plan's day view and Shop's list always agree on which meals are
today's; each surface fires the diagnostic `plan_shown { surface, weekMatches }` so the bug class is caught in
production.

**1. Which week opens.** Plan and Shop open on **next week** from Friday 15:00 to Sunday 23:59 local, and on this
week otherwise. A dismissible line under the week navigator says so:
`Showing next week — it’s the weekend. This week ›`. Deep links with an explicit week keep it. The week navigator's
label becomes a two-state `SegmentedControl` (`This week` / `Next week`) with the dates beneath (`28 Sep – 4 Oct`);
the past week stays reachable with the `‹` arrow (unchanged range −1…+1).

**2. Week actions are visible.** Under the day chips (generated week), a row:

```
≈ 900–1,100 lei · Mon–Sun · 1 portion ⓘ        [↻ Regenerate]
```

- Left: the week cost as a range with coverage and portions (UX-11 §5, P9); tap ⓘ → Explain sheet (copy below).
- Right: `Regenerate` (outline, `refresh-outline`, 44 pt). The week-summary sheet stays (tap the dates) for the per-day
  overview, My Weeks and options, but is no longer the only way to regenerate.

**3. Regenerate asks, and keeps your picks.** Tap → `ConfirmSheet` (PAT-5):

```
Regenerate 28 Sep – 4 Oct?
This replaces the 21 planned meals.
[✓] Keep the 4 meals you chose        (shown only if picks exist)
[ Regenerate 28 Sep – 4 Oct ]
[ Cancel ]
```

After success: snackbar `New week planned. Kept 4 of your picks.` with `Undo` (8 s) → restores the previous plan
(**needs (additive):** `mealPlan.generate` returns `previousPlanId`; `mealPlan.restore` accepts it). The AI consent
sheet still appears first for premium AI generation (protect D6).

**4. Shop labels match the plan** (bug B-13, `app/(food)/shopping-list.tsx` L236, L242):

- The header shows the same `This week` / `Next week` control and dates as Plan, and the list shown is **always** that
  week's plan's list. No fallback to another week's plan (server fix in stage 4).
- A week with no plan: `EmptyState` `No plan for {dates} yet` / `Plan the week first — your list builds itself.` /
  action `Plan this week` (→ Plan on that week).
- A plan that starts mid-week: the header reads `Covers {Fri–Sun}` next to the total, and the total is labelled for
  those days: `≈ 250–320 lei · Fri–Sun`.
- Header summary line (with UX-07): `For {shape} · {portions} portions`.

**5. Post-upgrade does the job** (bug B-09, `src/features/premium/post-upgrade-sheet.tsx` L23, L49). Each step key
becomes an **action**, not a route:

| Step                                    | What the button does                                                                                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `regenerate`                            | Opens the Regenerate confirm for the **right week** (next week Fri 15:00–Sun, else this week) on the Plan tab, and generates on confirm. Button copy: `Plan {week} with Premium` |
| `household`                             | Scales the current week to the table (regenerate at the table's portions) after a confirm naming the portions: `Scale {week} to {n} portions`                                    |
| `training` (new, source `training-day`) | Turns on `Fit meals to my training days` and re-plans the right week: `Re-plan {week} around your training`                                                                      |
| `cheferize`                             | Opens Import with the link field focused: `Import a recipe`                                                                                                                      |
| `profile`                               | Only when the user chose a numeric goal but has no metrics: `Add your body metrics`                                                                                              |

**6. Swaps you can undo** (`src/features/meal-plan/recipe-picker-sheet.tsx`, `app/(food)/meal-plan.tsx`):

- `Replace`: picking a recipe replaces the slot **at the slot's current portion** (e.g. 1½) and the snackbar says
  `Swapped to {recipe} · {portion} portion` + `Undo` (→ `replaceRecipe` back to the previous recipe id).
- `Regenerate with AI` (premium): the sheet shows a proposal card before committing —
  `The chef suggests` / `{recipe}` / `{time} min · {kcal} kcal{ · Checked for n}` / `Use this` · `Try another` ·
  `Keep {current}`. **Needs (additive):** `mealPlan.suggestSwap` (no commit) or `swapRecipe({ preview: true })`.
  If stage 4 finds preview too costly on free-only AI, the fallback is commit + snackbar Undo (same copy as Replace).
- Rows in the picker show time as well as kcal (`25 min · 540 kcal`).
- The picker lists each recipe **once** (dedupe by recipe, not by plan row), never lists the meal being replaced, and
  is **filtered to the slot**: a snack slot shows snacks first (`Snacks`) and puts main meals under a collapsed
  `Bigger meals` group with their kcal (bug B-50). A `{meal type}` chip row at the top lets the user widen it.

**7. Prices are labelled as estimates** (backlog scope moved to B-11 in the final strategy — see UX-11 §5; the design
is kept here because the Plan lane builds it on these screens; B-33): every week/list total renders as a rounded range
(`≈ 900–1,100 lei`) built from the point estimate ± 20 % (the exact band is stage 4's, flagged for V5), with the
coverage and portions; line prices on the list show `~{n} lei` rounded (no decimals above 20). The pantry
`Saved ~389,80 RON` chip is removed until savings can be itemised (B-33, UX-14 Next). Explain sheet copy below.

**8. Today's chip is always visible** in `WeekOutlook` (`src/features/dashboard/components/week-outlook.tsx`
L17–29, L42–57): 7 equal-width columns instead of a horizontal scroll of 52 pt chips (CI-13 correction). (For
Train + food users the week glance of UX-06 replaces it.)

#### Copy

| Key                  | Copy                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| weekend line         | `Showing next week — it’s the weekend.` + `This week ›`                                                                                                                                                                                                                                                                                                                     |
| week control         | `This week` · `Next week`                                                                                                                                                                                                                                                                                                                                                   |
| cost row             | `≈ {low}–{high} {currency} · {coverage} · {n} portion(s)`                                                                                                                                                                                                                                                                                                                   |
| price explain        | eyebrow `About this estimate` · title `Roughly {low}–{high} {currency}` · sentence `We estimate prices from typical supermarket prices{, converted from euros}. Real prices vary by shop and brand, so treat this as a guide, not a receipt.` · rows `Covers` `{Mon–Sun}` / `Portions` `{n}` / `Items` `{n}` · footnote `Change your currency in Settings › Money & units.` |
| regenerate button    | `Regenerate`                                                                                                                                                                                                                                                                                                                                                                |
| confirm              | title `Regenerate {dates}?` · body `This replaces the {n} planned meals.` · option `Keep the {n} meals you chose` · confirm `Regenerate {dates}` · `Cancel`                                                                                                                                                                                                                 |
| regenerate done      | `New week planned.{ Kept {n} of your picks.}` + `Undo`                                                                                                                                                                                                                                                                                                                      |
| shop empty           | `No plan for {dates} yet` / `Plan the week first — your list builds itself.` / `Plan this week`                                                                                                                                                                                                                                                                             |
| shop coverage        | `Covers {days}`                                                                                                                                                                                                                                                                                                                                                             |
| post-upgrade buttons | `Plan {week} with Premium` · `Scale {week} to {n} portions` · `Re-plan {week} around your training` · `Import a recipe` · `Add your body metrics`                                                                                                                                                                                                                           |
| replace done         | `Swapped to {recipe} · {portion} portion` + `Undo`                                                                                                                                                                                                                                                                                                                          |
| AI proposal          | `The chef suggests` · `Use this` · `Try another` · `Keep {current}`                                                                                                                                                                                                                                                                                                         |

`{week}` = `this week` / `next week`; `{dates}` = `28 Sep – 4 Oct`.

#### Components & files

**Change:** `app/(food)/meal-plan.tsx` (default week, segmented label, action row, confirm, snackbar),
`src/features/meal-plan/week-summary-sheet.tsx` (keeps overview + My Weeks; its Regenerate now opens the same confirm),
`src/features/meal-plan/recipe-picker-sheet.tsx` (portion, time, proposal, undo), `app/(food)/shopping-list.tsx`
(week control, empty state, coverage, range, remove savings chip), `src/features/premium/post-upgrade-sheet.tsx` +
`packages/utils/src/premium-activation.ts` (actions + copy), `src/features/dashboard/components/week-outlook.tsx`,
`packages/ui-mobile/src/components/confirm-sheet.tsx` (options slot, PAT-5).
**New:** `packages/utils/src/week-default.ts` (`defaultWeekOffset(now)`), `packages/utils/src/price-range.ts`
(`priceRange`, `formatPriceRange`).

#### Accessibility

The weekend line is announced once on open. The confirm's option is a switch with its label. Snackbar per PAT-4. The
cost row is one button: `Estimated cost about 900 to 1,100 lei for Monday to Sunday, 1 portion. Explains the estimate.`

#### Analytics

`plan_viewed { weekOffset, trainingDaysMarked }` · `regenerate_confirmed { keptPicksCount }` ·
`regenerate_undone { }` (new) · `plan_shown { surface: plan|shop|today, weekMatches }` (diagnostic) ·
`number_why_opened { metric: price }` · `premium_feature_first_used { feature }` from
the post-upgrade action.

#### Acceptance criteria

1. `defaultWeekOffset` returns 1 for Fri ≥ 15:00, Sat and Sun, else 0 (unit tests incl. DST weekend); Plan and Shop
   both use it.
2. With a plan only for next week, Shop on `This week` shows the empty state, never next week's items (bug B-13
   regression test, API + Maestro).
3. Regenerate is visible without opening a sheet; it always asks; with picks, `Keep` defaults on and the kept meals
   are identical after regeneration; `Undo` restores the previous plan exactly (same recipes and portions).
4. The post-upgrade `regenerate` action produces a new plan for the right week without further navigation (bug B-09);
   `household` produces a week sized to the table.
5. Replace keeps the slot's portion; `Undo` restores the previous recipe.
6. No week or list total renders a single precise number; every total says what it covers.
7. The pantry savings chip is gone from Shop.
8. Today's column is visible in the week outlook on a Sunday at 1.8× text.
9. **Data bug (B-13):** with a plan only for next week, on a Sunday, Plan (This week), Shop (This week) and Today all
   show "no plan this week", and Today's hero never shows a meal from next week (API regression test on the plan
   selector + Maestro); `plan_shown.weekMatches` is true on every render in QA.
10. The Replace picker never lists the same recipe twice or the meal being replaced; on a snack slot, snacks come
    first (bug B-50).

#### Edge cases

Regenerate offline → disabled with `Needs a connection`. Undo after navigating away still works while the snackbar is
visible (global host). Kept picks that now break a new safety rule are **not** kept; the snackbar says
`Kept {n} of your picks — {m} no longer fit your table.` A week the user saved to My Weeks is unaffected by Undo.

#### Web parity

Web `apps/web/src/app/(dashboard)/meal-plan/page.tsx` (week default, visible regenerate + confirm + undo),
`ReplaceMealSheet.tsx` (portion, undo), `features/shopping-list/components/WeekNavigator.tsx` + shopping-list page
(labels, empty state, ranges), `features/premium/components/PostUpgradeActivation.tsx` (actions, via the shared
`premium-activation.ts`). Same PR group.

**Dependencies.** PAT-4, PAT-5, PAT-1; UX-07 (kept picks). The price band is validated by V5 before any "cost in lei"
marketing. **Protect:** D5, D11 (your recipes first in Replace), D6 (consent), D9.

<a id="ux-10"></a>

### UX-10 A paywall that names the job

**Problem & evidence.** 7/10 met a premium lock on their core job at first touch (CI-02: import, pantry, household
scaling, budget, training-day calories, AI Chef); 9/10 found the pitch named none of those jobs (CI-12:
[Profile "Go Premium"](../screenshots/P04/053-see-premium.png) sells "AI meal plans… nutrition profile"); the free
budget field accepts input and silently drops it (CI-16, bug B-10, [P03](../screenshots/P03/078-budget-after.png));
the import lock replaces the whole form ([P05](../screenshots/P05/014-import-sheet.png)); upgrade is one tap with
"free for now" and no terms; downgrade is instant with no "you'll lose". The AI Chef lock with free alternatives is
the model (D15). **Final synthesis adds:** Snap to log is not rendered at all on free, so the tracker never learns it
exists (bug B-35, P07-M11); the pitch offered the two gym-first personas nothing and both stayed free (P01, P09-M18);
P07 upgraded for "personal nutrition profile" and found no targets; P10 upgraded for "tailored" plans and got an AI
week 400–700 kcal under target with nothing saying what premium changed (P10-M24, M26; content mock, flow real); the
curated (non-AI) plan counts as "Meal plans generated" and an unsaved import counts toward imports (bug B-49).

> "I don't care about my nutrition profile. Does it do the four portions?" (P04) · "'Free for now' — and then what? How much?" (P05) · "So I typed it for nothing?" (P03) · "If it asks for a card later, I delete it." (P08)

**User story.** As a free user who hits a premium feature while doing a job, I want the offer to talk about that
job, show me what I can already do free, and tell me plainly what premium will cost me later, so that I can decide
without feeling tricked.

**Scope.** The mechanics (PAT-3), the copy for every source, the Profile plan section, upgrade/downgrade summaries,
the per-job lock placements from stage 2 §5.4, the mobile nudge cap, and B-32 (no "AI meal plans" headline). The ⚖
tier moves (D-2, D-6, D-7) are separate decisions; this spec ships the mechanics either way and marks where a
decision changes a screen.

#### Flow & states

**1. PremiumSheet** (PAT-3), opened with a `source` from any lock, nudge or the Profile plan section:

```
┌──────────────────────────────────────────────┐
│ PREMIUM                                   ✕   │
│ Keep portions for your table of 4             │
│ Premium sizes every recipe, the list and the  │
│ week’s cost to everyone you cook for.         │
│ ✓ Recipes scaled to 4 portions — Luca’s ½     │
│   counted                                     │
│ ✓ One shopping list with amounts for everyone │
│ ✓ The week’s cost for the whole table         │
│ Also included                              ▾  │
│ ───────────────────────────────────────────── │
│ FREE DURING THE BETA                          │
│ Premium costs nothing while Chefer is in      │
│ beta, and we won’t ask for a card. Before it  │
│ has a price, we’ll tell you in the app at     │
│ least 30 days ahead and you choose whether to │
│ keep it. Nothing changes automatically.       │
├──────────────────────────────────────────────┤
│ [          Turn on Premium          ]         │
│                Not now                        │
└──────────────────────────────────────────────┘
```

- Headline + three bullets come from the job table below, looked up by `source`. **A bullet is only shown if its
  feature is live** (a registry in `packages/utils/src/premium-pitch.ts` with an `available` flag per bullet), so the
  pitch can never promise an unbuilt feature (UX-25 rule).
- `Also included` expands to the other live premium jobs, one line each, AI features last and marked `(daily
allowance)`.
- `Turn on Premium` → upgrade → the sheet cross-fades to a confirmation state:
  `Premium is on` / `You now have: {three bullets as ticks}` / primary = the job's action (UX-08 §5 table, e.g.
  `Scale next week to 4 portions`) / secondary `Later`. This replaces the separate post-upgrade sheet for sources with a
  job action; the post-upgrade sheet remains for Profile-initiated upgrades.
- Error: `Couldn’t turn on Premium. Nothing has changed.` + `Try again`.

**2. Job copy table** (headline · lede · bullets). ⚖ items marked.

| Source(s)                                                                                     | Headline                                        | Bullets                                                                                                                                                |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `household`                                                                                   | `Keep portions for your table of {n}`           | `Recipes scaled to {n} portions — {kid}’s ½ counted` · `One shopping list with amounts for everyone` · `The week’s cost for the whole table`           |
| `recipe-import`                                                                               | `Turn your saved links and videos into recipes` | `Import from a link, pasted text or a cooking video` · `Check and fix what we understood before you save` · `Adapted to your allergies and your table` |
| `training-day`, `training-week`                                                               | `A week built around your training days`        | `More protein and carbs on {days}` · `Re-planned when your training days change` · `Refuel snacks that fit your allergies`                             |
| `budget`, `shopping-list`                                                                     | `Weeks that fit your budget`                    | `Plans built to stay under {amount} a week` · `Cheaper swaps when a week runs over` · `The week’s estimated cost as you plan`                          |
| `pantry`                                                                                      | `Plans that use what’s in your kitchen`         | `Meals chosen to use what you have first` · `Your list skips what you already have` · `What goes off first, cooked first`                              |
| `chat-locked`, `chat-quota`                                                                   | `Ask the chef`                                  | `Swaps and substitutions for any meal` · `“What can I make with…” from your kitchen` · `Cooking questions, answered`                                   |
| `snap-scan`                                                                                   | `Log a meal with a photo`                       | `Snap a plate, get an estimate` · `Edit it before it’s logged` · `Counts toward your day`                                                              |
| default (`profile`, `monday-nudge`, `meal-plan-banner`, `post-rating`, unknown)               | `Your week, ready every Monday`                 | `A new week planned for you every Sunday` · `Built around your table, budget and training days` · `Keeps the meals you rated highly`                   |
| default **for users whose jobs include Train** (gym-first; the gym itself stays free, ⚖ D-11) | `Food that fits your training week`             | `More protein and carbs on your lift and long-run days` · `A week of meals planned around your sessions` · `Everything in the gym stays free`          |
| `snap-scan` from the free Snap card                                                           | `Log a meal with a photo`                       | as above                                                                                                                                               |

Lede per job: one sentence in the same voice (listed in `premium-pitch.ts`; e.g. household above). **B-32:** the words
`AI meal plans tailored to your goals` and `nutrition profile` are removed from every pitch.

**3. Profile › Plan & Premium** (`app/profile.tsx`, replaces the "Go Premium" card):

- Free: card title `Your plan: Free` · body `Free includes the gym log, weekly plans from our recipes, allergy checks on
every plan and your shopping list.` · button `See what Premium adds` (→ PremiumSheet, source `profile`).
- Premium: `Your plan: Premium` · `Free during the beta` · a `What you have` list (live bullets) · text button
  `Switch back to Free`.
- "Today's AI usage" moves under this section, titled `Daily AI allowances`, unchanged otherwise.

**4. Downgrade asks and summarises** (`ConfirmSheet`, PAT-5): title `Switch back to Free?` · body
`You’ll keep your plans, recipes, ratings, logs and workouts.` · list `You’ll lose:` + only the premium jobs this user
has used (e.g. `Portions for your table — plans go back to 1 portion`, `Recipe import`, `The AI chef`) · buttons
`Switch to Free` (destructive) / `Keep Premium`. After: snackbar `You’re on Free. Your data is all still here.`

**5. Locks, job by job** (stage 2 §5.4). Each uses `LockedFeatureCard` and never replaces a screen:

| Job               | Where (file)                                               | Free now                                                                                                                                                                                                                     | Lock on                                                                                                  |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Household scaling | `app/(food)/shopping-list.tsx`, `app/(food)/meal-plan.tsx` | **⚖ D-7 recommended:** the first planned week is scaled to the table free; the list says `Sized for your table of {n} — free for your first week`                                                                            | From week 2: `Sized for 1 portion` + card `Keep portions for your table of {n}`                          |
| Recipe import     | `app/import-recipe.tsx` L173–190                           | The screen shows the tabs and fields; `+ New recipe` (manual, free) is offered as `Or type it in yourself`. **⚖ D-6:** if the no-AI structured-link import ships, Link works free for schema.org pages (UX-17)               | Tapping `Import` on Video/Text (and Link if D-6 = no) opens the PremiumSheet; the pasted content is kept |
| Budget            | `app/preferences.tsx` L297–310                             | **Bug B-10 fix now:** on free the field is **read-only** (muted, lock icon), never editable-and-dropped. **⚖ D-2:** if budget storage goes free (UX-16), the field saves and the lock moves to `Make my week fit the budget` | The field itself (until D-2)                                                                             |
| Training-day food | `training-day-note.tsx`                                    | UX-06 (bump free, recommended)                                                                                                                                                                                               | `Fit meals to my training days` switch                                                                   |
| Pantry            | `src/features/pantry/pantry-panel.tsx`                     | Current read-only kitchen; ⚖ free manual entry in UX-15 (Next)                                                                                                                                                               | `Plan my week around these`                                                                              |
| AI Chef           | `src/features/chat/locked-chat-preview.tsx`                | Keep as is (D15) — only the CTA opens the PremiumSheet with `chat-locked`                                                                                                                                                    | —                                                                                                        |
| Pool exhausted    | `app/(food)/meal-plan.tsx` "upgrade on the web app" card   | `Try fewer restrictions` is not offered (never suggest relaxing safety); `Pick recipes yourself` (→ Replace flow per day)                                                                                                    | `Premium builds a plan around them` → PremiumSheet (fixes "upgrade on the web app" dead end)             |

**6. Nudge cap.** All contextual nudges on mobile go through `nudge-cap.ts` (one per day, 7-day cooldown per
dismissed source), exactly as web.

**7. Snap to log is visible on free** (bug B-35; `src/features/tracker/scan-meal-card.tsx` L102 renders nothing on
free). Free users with a tracking job or a goal see the card as a taste: title `Snap to log`, body `Photograph a
restaurant meal and get an estimate in seconds.`, a static sample (a plate photo with `~620 kcal · 40 g protein ·
“dressing included”`, labelled `Example`), and `See what Premium adds` (source `snap-scan`). It is never shown to users
without a food job, and never above the ring.

**8. Show what Premium changed** (P10-M24, M26). After an upgrade whose job action regenerates a week (UX-08 §5), Plan
shows a one-time `What Premium changed` card above the day view:

```
┌ sparkles  What Premium changed ───────────────┐
│ • Built around your lift day (Tue) and long    │
│   run (Sat)                                    │
│ • Meets your 2,284 kcal target on 5 of 7 days  │
│ • Tue and Thu are about 300 kcal under — Fix it│
│ [ Compare with your free week ]                │
└────────────────────────────────────────────────┘
```

Lines are generated from the plan diff and the target check (UX-11 §3): what the premium week does differently, and
whether it meets its target, honestly — a miss is stated with a `Fix it` action, never hidden. `Compare with your free
week` opens a sheet with the two weeks' daily kcal/protein side by side. **Needs (additive):** a plan-diff summary on
`mealPlan.generate` for premium regenerations.

**9. Honest quota counters** (bug B-49): Profile › Daily AI allowances counts only AI calls — curated plans never count
toward `Meal plans generated`, and an import counts only when saved. Rows read `AI meal plans` (not "Meal plans
generated") with the helper `Plans from our recipes are unlimited and don’t count.`

#### Copy (not already in the tables)

| Key                       | Copy                                                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| sheet eyebrow             | `PREMIUM`                                                                                                                                                                                                                                        |
| also included             | `Also included` · AI suffix `(daily allowance)`                                                                                                                                                                                                  |
| beta terms heading/body ⚖ | `FREE DURING THE BETA` / `Premium costs nothing while Chefer is in beta, and we won’t ask for a card. Before it has a price, we’ll tell you in the app at least 30 days ahead and you choose whether to keep it. Nothing changes automatically.` |
| buttons                   | `Turn on Premium` · `Not now`                                                                                                                                                                                                                    |
| success                   | `Premium is on` · `You now have:` · `Later`                                                                                                                                                                                                      |
| error                     | `Couldn’t turn on Premium. Nothing has changed.` · `Try again`                                                                                                                                                                                   |
| lock card                 | eyebrow `PREMIUM` · button `See what Premium adds`                                                                                                                                                                                               |
| import free path          | `Or type it in yourself`                                                                                                                                                                                                                         |
| budget read-only helper   | `Saving a weekly budget is part of Premium.`                                                                                                                                                                                                     |
| household week 1          | `Sized for your table of {n} — free for your first week`                                                                                                                                                                                         |
| pool exhausted            | `Our recipes can’t fill this week around your restrictions.` · `Pick recipes yourself` · `Premium builds a plan around them`                                                                                                                     |
| snap taste                | `Snap to log` · `Photograph a restaurant meal and get an estimate in seconds.` · `Example` · `See what Premium adds`                                                                                                                             |
| what changed              | `What Premium changed` · `Built around your {kind} day ({weekday})…` · `Meets your {kcal} kcal target on {n} of 7 days` · `{days} are about {n} kcal under — Fix it` · `Compare with your free week`                                             |
| quotas                    | `AI meal plans` · `Plans from our recipes are unlimited and don’t count.`                                                                                                                                                                        |

**⚖ Beta terms.** "At least 30 days ahead" is a commitment for the owner and counsel (D-9, B-26). Alternative: the
web FAQ's `well in advance` — weaker for P05/P06/P08, who asked "and then what?". Either way the sentence
`Nothing changes automatically` must be true (no auto-conversion).

#### Components & files

**New:** `src/features/premium/premium-sheet.tsx`, `locked-feature-card.tsx`, `nudge-cap.ts` (PAT-3),
`packages/utils/src/premium-pitch.ts` (job copy + availability registry, shared with web).
**Change:** `app/profile.tsx` (plan section, downgrade confirm, quota rows), `src/features/premium/post-upgrade-sheet.tsx`,
`src/features/tracker/scan-meal-card.tsx` (free taste), `app/(food)/meal-plan.tsx` (What Premium changed card — placed
by the Plan lane in wave 3),
`app/import-recipe.tsx`, `app/preferences.tsx` (budget), `app/(food)/shopping-list.tsx` + `app/(food)/meal-plan.tsx`
(household week-1 line, pool card), `src/features/pantry/pantry-panel.tsx`, `src/features/chat/locked-chat-preview.tsx`
(CTA target), every `router.push('/profile', { source })` call site → `openPremium(source)`.
**Needs (additive):** a `firstScaledWeek` flag on the household/plan payload if D-7 = yes.

#### Accessibility

The sheet's headline is the accessibility title; bullets are a list; the terms paragraph is plain text (not a
tooltip). The read-only budget field has `accessibilityState={{ disabled: true }}` and the hint
`Part of Premium`.

#### Analytics

`upgrade_prompt_shown { source, job }` on sheet open (and on LockedFeatureCard impression, counted once per session)
· `upgrade_clicked { source, job }` · `upgrade_completed { source, job }` · `premium_feature_first_used { feature }` ·
`downgrade_completed { daysSinceUpgrade }` · `nudge_suppressed { source }` (new, cap hit).

#### Acceptance criteria

1. Every lock in the app opens the PremiumSheet with a job headline matching the table; no screen shows
   `AI meal plans tailored to your goals` or `nutrition profile` (copy grep).
2. The PremiumSheet shows the beta terms paragraph on every open.
3. A bullet whose feature is flagged unavailable never renders (unit test on the registry).
4. On free, the budget field cannot be edited (bug B-10); no input is ever accepted and dropped.
5. The import screen keeps its form visible on free and offers the manual path; pasted text survives opening and
   closing the sheet.
6. Upgrading from the household lock shows `Scale {week} to {n} portions`, and tapping it produces a scaled plan
   (UX-08 §5).
7. Downgrade shows the keep/lose summary; cancelling keeps Premium.
8. At most one contextual nudge per calendar day across sources (unit test on `nudge-cap`).
9. Phase C gate instrumentation fires with `source` and `job` (after UX-12).
10. A free user with a food job sees the Snap taste card on Today/Tracker; a gym-only user never does (bug B-35).
11. A user whose jobs include Train and who opens the pitch from Profile sees `Food that fits your training week`.
12. After a premium regenerate triggered from the upgrade, Plan shows `What Premium changed` with a true target-check
    line (tested with a fixture week that misses on two days).
13. Generating a curated plan leaves `AI meal plans` at 0; an import counts only after saving (bug B-49).

#### Edge cases

Admin accounts see no plan card (as today). A user upgraded on web sees `Your plan: Premium` on next focus. Offline:
`Turn on Premium` disabled with `Needs a connection`. An unknown `source` falls back to the default job.

#### Web parity

Web has source-aware pitch pieces: `apps/web/src/app/(dashboard)/premium/page.tsx`,
`features/premium/components/UpgradeNudge.tsx`, `UpgradeButton.tsx`, `PostUpgradeActivation.tsx`,
`PremiumComparisonTable.tsx`, `premium-features.ts`, `lib/nudge-cap.ts`. Web adopts the shared `premium-pitch.ts`
(job headlines, availability flags, beta terms), the downgrade summary on `/profile`, the budget read-only fix and the
import free path in the same PR group. The `/premium` page hero changes from "Your personal chef, powered by AI" style
copy to the job-led default headline.

**Dependencies.** PAT-3, PAT-5, UX-08 §5 (post-upgrade actions). ⚖ D-1, D-2, D-6, D-7, D-9; counsel for the terms
(UX-26). **Protect:** D15, D8's honest household copy. **Validate:** V4 (willingness to pay by job) before Phase C.

<a id="ux-12"></a>

### UX-12 Mobile analytics with consent (enabler)

**Problem & evidence.** Mobile ships no analytics SDK (`apps/mobile/src/features/gym/analytics.ts` is a `__DEV__`
no-op; `docs/analytics-funnel.md`; `mobile_parity_backlog.md`), so none of stage 2 §7 — the north star, the Phase C
gate, any Now target — can be measured on the product's main platform. The web already has the consent model
(P0-6: anonymous and cookieless by default, opt-in to link to the account —
`apps/web/src/features/profile/components/AnalyticsConsentCard.tsx`). D6 shows privacy-literate users reward proper
disclosure, and the privacy persona praised the very **absence** of an SDK and a tracking prompt (D24, P10: "no dark
patterns so far") — so adding analytics must not cost that trust.

**User story.** As a privacy-conscious user I want to know what usage data Chefer sends and switch it off or link it
only if I choose, so that I can trust the app with my health information.

#### Flow & states

- **Privacy-by-default constraints (final strategy, D24):** no advertising identifiers (no IDFA/AAID, no
  `expo-tracking-transparency`), **no App Tracking Transparency prompt**, EU hosting (PostHog EU, as web), no session
  replay, no autocapture of text; the privacy page and the App Store privacy questionnaire / Play data-safety form are
  updated **in the same release**. **⚖ Owner option:** an opt-in default is acceptable (it costs sample size, not the
  funnel's shape); the switch design below works either way — only the first switch's default flips.
- **No first-run banner, no prompt.** Anonymous counting starts at launch with an **in-memory** session id (never
  written to storage, reset every cold start) — the mobile equivalent of the web's cookieless mode.
- **Profile › Privacy & data** (new section in `app/profile.tsx`, next to the existing AI & your data card
  `src/features/profile/ai-consent-card.tsx`) gets a **Usage analytics** card with two switches:

```
┌ Usage analytics ─────────────────────────────┐
│ Send anonymous usage counts          [ ON ]  │
│ Which screens and buttons get used, with no   │
│ name, email or health information, and        │
│ nothing that identifies you.                  │
│ Link usage to my account             [ OFF ]  │
│ Off: nothing is tied to you. On: we see which │
│ features you use, tied to your account ID     │
│ (never your name or email), to improve Chefer.│
│ Applies to this phone.  Privacy policy        │
└───────────────────────────────────────────────┘
```

Turning the first off disables the second and sends nothing at all (not even crash-free-session counts through
PostHog; crash reporting, if added later, is a separate decision). **⚖ counsel (UX-26):** whether anonymous counting may default on in-app
(ePrivacy Art. 5(3) — no device storage is used, which is the argument for yes). If counsel says no, the first
switch defaults off and a one-time, non-blocking card on Profile invites the user to turn it on; nothing else
changes.

- **Typed wrapper:** `apps/mobile/src/lib/analytics.ts` exports `capture<E extends keyof EventMap>(event, props)`;
  the `EventMap` is shared with web in `packages/types/src/analytics-events.ts` (stage 2 §7.3 events + the existing
  gym and funnel events). `src/features/gym/analytics.ts` becomes a re-export (its call sites don't change).
- **Health-data guard:** the `EventMap` only allows `number`, `boolean` and string-literal enum property types; a
  unit test fails if any event declares `string` (free text). Allergy, diet, condition, weight and food names are
  impossible to send by type.
- **Dev overlay:** in `__DEV__`, Settings hub › About shows `Analytics debug` listing the last 50 events with props
  (for Maestro/visual checks).

#### Copy

| Key                  | Copy                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| card title           | `Usage analytics`                                                                                                                                                     |
| anon switch / helper | `Send anonymous usage counts` / `Which screens and buttons get used, with no name, email or health information, and nothing that identifies you.`                     |
| link switch / helper | `Link usage to my account` / `Off: nothing is tied to you. On: we see which features you use, tied to your account ID (never your name or email), to improve Chefer.` |
| footer               | `Applies to this phone.` + `Privacy policy`                                                                                                                           |

#### Components & files

**New:** `apps/mobile/src/lib/analytics.ts`, `src/features/profile/analytics-consent-card.tsx`,
`packages/types/src/analytics-events.ts`. **Change:** `src/features/gym/analytics.ts` (re-export),
`app/profile.tsx` (Privacy & data section), `app/_layout.tsx` (provider/init). **SDK:** PostHog React Native (EU host,
as web). ⚠ It pulls native modules (device/app info, storage) → **native rebuild + store release**; stage 4 confirms
and schedules it in the next native build. Consent storage in the gym KV store (per device, like web's per browser).

#### Accessibility

Switches with labels and states; helper text linked via `accessibilityHint`.

#### Analytics

The enabler itself: `app_opened`, `analytics_consent_changed { anonymous, linked }` (new).

#### Acceptance criteria

1. With default settings, events flow with a session id that changes on every cold start and no account id.
2. Linking on → events carry the account id; off → they stop carrying it immediately.
3. Anonymous off → zero network calls to the analytics host (verified with a proxy in QA).
4. A type test fails when any event property is typed `string` outside the allowed enums; no event in the codebase
   sends allergy/diet/condition/weight/food text.
5. ≥ 95 % of mobile sessions send events (anonymous) within 2 weeks of release (stage 2 §7.4).
6. Every event name used on both platforms is identical (shared `EventMap`).
7. The build contains no advertising-identifier or tracking-transparency module and never shows a tracking prompt
   (dependency check in CI); the App Privacy / data-safety answers and the privacy page are updated in the same PR.
8. Changing either switch writes a consent-log entry (UX-39) and fires `consent_changed { kind: analytics, granted }`.

#### Edge cases

Offline: events queue in memory and are dropped on cold start (no disk). Account deletion: linked events are deleted
via the provider's API as part of the existing deletion job (stage 4). Sign-out: link state resets to off.

#### Web parity

Web already has the linked-consent card; it gains the **anonymous off** switch (same copy) so both platforms offer the
same choice, and adopts the shared `EventMap`. Same PR group.

**Dependencies.** Native release slot (PostHog RN). Counsel on the default (UX-26). Everything in §7.4 depends on it.

<a id="ux-13"></a>

### UX-13 Send the list (and the dinners) to my partner

**Problem & evidence.** 3/10 (P02, P04, P08), Sev 3 (CI-17, J7). There is no share, export or copy on To buy, In my
kitchen or Plan ([P08 79 lines, no share](../screenshots/P08/119-s2-tobuy-bottom.png)); partners are profiles without
login; people fall back to Keep and WhatsApp. It is also the only referral loop the study found.

> "How do I send this to Mihai?" (P04) · "79 lines won't fit on one screenshot." (P08)

**User story.** As the one who plans, I want to send what's left to buy — and what we're eating — to my partner in
WhatsApp with one tap, so that whoever is near the shop can do it.

#### Flow & states

1. **Shop header** gets a share button (`share-outline` on iOS, `share-social-outline` on Android, 44 pt,
   label `Share the list`) left of the week arrows. Disabled (40 % opacity) when the list is empty.
2. Tap → a small `Sheet` titled `Send the list`:

```
SEND THE LIST
(•) What’s left to buy · 42 items
( ) Everything · 87 items
[✓] Include amounts
[ ] Add this week’s dinners
[          Share…          ]
```

The choice is remembered per device. If nothing is ticked yet, the first option reads `Everything · 87 items` and
the second is hidden. 3. `Share…` builds plain text (below) and opens the OS share sheet via React Native's `Share.share` (no new native
module; OTA-safe). On completion (iOS `sharedAction`; Android always resolves) → snackbar `List ready to send.`
(no claim that it was sent — the OS doesn't tell us on Android). 4. **Plan:** the week-summary sheet gets `Share this week’s dinners` (text list of the planned dinners per day, plus
`Shopping list in Chefer`), same mechanism.

**Text format** (WhatsApp- and Keep-friendly: no emoji, no markdown, `- ` bullets, blank line between aisles; aisles
in the list's order; custom lines under their aisle; checked items omitted in "What's left"):

```
Shopping list · 28 Sep – 4 Oct
For 4 dinners · 2 portions

PRODUCE
- Spinach, 200 g
- Lemons, 2
- Red onions, 3

PROTEINS
- Chicken thighs, 800 g

This week’s dinners
Mon: Red lentil & spinach curry
Tue: Lemon chicken traybake

Made with Chefer · {webUrl}
```

Amounts use the user's unit system and the same rounding as the list (UX-14 improves it later). The footer line is
the only branding; `{webUrl}` = `getWebUrl('/')` until a store link exists.

#### Copy

`Share the list` (a11y) · `Send the list` · `What’s left to buy · {n} items` · `Everything · {n} items` ·
`Include amounts` · `Add this week’s dinners` · `Share…` · `List ready to send.` · `Share this week’s dinners` ·
text strings as in the format block (`Shopping list · {dates}`, `This week’s dinners`, `Made with Chefer · {url}`).

#### Components & files

**New:** `packages/utils/src/share-list.ts` (`formatListForSharing(list, options)` and
`formatDinnersForSharing(plan)` — pure, unit-tested, shared with web), `src/features/shopping-list/share-list-sheet.tsx`.
**Change:** `app/(food)/shopping-list.tsx` (header button), `src/features/meal-plan/week-summary-sheet.tsx`.

#### Accessibility

Radio group for the scope; switches labelled; the share button disabled state announced (`Share the list, dimmed,
the list is empty`).

#### Analytics

`list_shared { channel: share_sheet, linesCount, scope: remaining|all, withAmounts, withDinners }` ·
`plan_shared { dinnersCount }` (new).

#### Acceptance criteria

1. With 42 unticked of 87 lines, "What's left" shares exactly those 42 lines grouped by aisle, in list order, with
   amounts when on.
2. The text contains no emoji, no markdown and no line longer than the item itself; it pastes cleanly into WhatsApp
   and Google Keep (manual QA on both platforms).
3. `Add this week’s dinners` appends only planned dinners (dinners-only plans: all planned slots).
4. The button is disabled on an empty list.
5. `formatListForSharing` unit tests cover imperial units, custom lines, a list with pantry-covered lines (omitted from
   "What's left", marked `(have it)` in "Everything").
6. ≥ 20 % of household or two-person users share in week 1 (after UX-12).

#### Edge cases

Very long lists (> 150 lines): shared as-is (WhatsApp handles it). Offline: works (list is cached). A list for a
mid-week plan: header says the covered days (`Shopping list · Fri–Sun`).

#### Web parity

Web shopping list (`apps/web/src/app/(dashboard)/shopping-list/page.tsx`) has print only; add `Share` in the overflow
menu using `navigator.share` with a `Copy list` fallback (clipboard) and the same sheet options + shared formatter.
Same PR group.

**Dependencies.** PAT-4 snackbar. None blocking. Co-access is UX-27 (Later). **Protect:** D9.

<a id="ux-21"></a>

### UX-21 Bug sweep: every Sev ≥ 3 study bug not owned elsewhere (+ cheap Sev-2 papercuts)

**Problem & evidence.** 8/10 personas hit at least one of these (CI-45, CI-08, CI-25, CI-15, CI-39, CI-14, CI-37,
CI-47). Ownership (final routing, stage 2 B-21): Sev-4 safety bugs B-01…B-05, hidden gluten B-47 → UX-01; Replace
safety B-46 → B-34 hotfix + UX-01; gym bugs B-07, B-08, B-15, B-16, B-18, B-20 → UX-05 / UX-04; gym settings, reminders,
skip and history B-19, B-40, B-41, B-45 → UX-36; week bugs B-09, B-13, B-50 → UX-08; silent target change B-48 →
UX-11; tracker save models, entry edit and sanity checks B-23, B-34, B-39 → UX-19; B-10, B-35, B-49 → UX-10; locale
defaults B-43 → UX-03; export/consent record B-53 → UX-39; unsafe-import CTA B-51 → UX-17; B-12 → UX-18; B-27 → UX-09;
B-32 → UX-15. What remains is here. Each row is independently shippable; the UI change is specified, the root cause
is in stage 1 §7.

| #     | Bug (stage 1 §7)                                                                                                                                                                                                                                        | Sev | Fix as the user sees it                                                                                                                                                                                                                                                                                                                                                                                                                                 | File(s)                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 21.1  | **One local-day contract** for every server-side date: **B-06** chat `logMeal` writes the server's UTC date → meal lands on yesterday; **B-33** Progress 28-day summary uses UTC days → "Days logged 0" for 2–3 h after local midnight in Romania (P07) | 3   | Every client call that means "a day" sends the device `localDate` (and the IANA time zone once, stored on the profile); no server code derives a day from `new Date()` in UTC (a lint/grep check in stage 4). Chat: the reply's confirmation chip reads `Logged to {Today \| Sun 27 Sep} · {Snack}` with `Change` (→ tracker on that date) and the PAT-4 snackbar `Logged {meal} to today` + `View`. Progress: counts the local day the user logged on. | `app/chat.tsx`, `src/lib/chat-stream.ts`, `app/progress.tsx`; server `chat.service.ts` L224, `tracker.service.ts` L383–392 (stage 4) |
| 21.2  | **B-11** Cookbook "All" omits imports / own recipes                                                                                                                                                                                                     | 3   | `All` = your recipes + recipes from your plans + favourites, de-duplicated; imported recipes appear immediately after saving with a `New` badge for 24 h. Save confirms with snackbar `Saved to your Cookbook` + `View` (fixes P05-M45 silent save).                                                                                                                                                                                                    | `app/(food)/recipes.tsx`; repository `favourite-recipe.repository.ts` L186–207 (stage 4)                                             |
| 21.3  | **B-24** partial pantry coverage invisible                                                                                                                                                                                                              | 3   | A list line with some but not enough in the kitchen shows `You have {have} of {need}` (emerald text) and the quantity to buy becomes the difference (`Buy {need − have}`); full coverage keeps `Have it`.                                                                                                                                                                                                                                               | `app/(food)/shopping-list.tsx` L469–481; `pantry-match.ts` (stage 4)                                                                 |
| 21.4  | **B-14** Food/Gym pill shows the persisted mode, not the current side                                                                                                                                                                                   | 2   | Pill derives from the route (PAT-9 §1).                                                                                                                                                                                                                                                                                                                                                                                                                 | `src/features/gym/components/mode-switch.tsx`                                                                                        |
| 21.5  | **CI-14** keyboard hides primary buttons; number pads without Done                                                                                                                                                                                      | 2   | Apply PAT-11 to: onboarding metrics (`metrics-step.tsx`), household member fields, weight card (`src/features/coach/weight-card.tsx`, `weight-log-form.tsx`), pantry quantity, Shop "Add item", Quick add. Every numeric pad shows `NumericReturnBar`; the first tap on `+` adds (no dismiss-only tap, P08).                                                                                                                                            | listed files                                                                                                                         |
| 21.6  | **B-21** cook-mode finish says breakfast/lunch/dinner by the clock                                                                                                                                                                                      | 1   | Without a `meal` param the finish reads `Enjoy!` (no meal word); with one, the real meal. B-31 copy change per UX-04 §8.                                                                                                                                                                                                                                                                                                                                | `app/cook/[id].tsx` L110, L311; `packages/utils/src/cook-mode.ts`                                                                    |
| 21.7  | **B-22** "Nutrition Facts per N servings" follows the stepper; values stay per 1                                                                                                                                                                        | 1   | Label is fixed `Nutrition per serving`; a second line under the stepper says `Scaled for {n} servings: {kcal} kcal total`.                                                                                                                                                                                                                                                                                                                              | `app/recipe/[id].tsx` ~L266                                                                                                          |
| 21.8  | _(moved)_ **B-23** tracker save models → **UX-19** (Now)                                                                                                                                                                                                | —   | See UX-19 §4.                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                    |
| 21.9  | **B-25** stale "Passwords do not match"                                                                                                                                                                                                                 | 1   | Re-validate confirm on every password change (`mode: 'onChange'` for the pair).                                                                                                                                                                                                                                                                                                                                                                         | `app/(auth)/register.tsx`                                                                                                            |
| 21.10 | **B-31** spell-check on the email field                                                                                                                                                                                                                 | 1   | `autoCorrect={false}`, `spellCheck={false}` on every email input.                                                                                                                                                                                                                                                                                                                                                                                       | `login.tsx`, `register.tsx`, `forgot-password.tsx`                                                                                   |
| 21.11 | **B-26** stuck spinner on Gym Today after Done                                                                                                                                                                                                          | 2   | The top refresh indicator is bound to the bootstrap refetch with a 10 s timeout; after that it hides and a muted line says `Couldn’t refresh — pull to try again`.                                                                                                                                                                                                                                                                                      | `src/features/gym/today/today-screen.tsx` (gym lane)                                                                                 |
| 21.12 | **B-28** ticking reflows the list so the next tap hits another row                                                                                                                                                                                      | 2   | Ticked items stay in place (struck through) until the aisle is collapsed or the screen refocuses; no layout animation on tick.                                                                                                                                                                                                                                                                                                                          | `app/(food)/shopping-list.tsx`                                                                                                       |
| 21.13 | **CI-43** large text truncates dense rows (routine editor now in UX-05 C)                                                                                                                                                                               | 2   | Week-sheet day labels use 3-letter names at `DENSE_MAX_FONT_SCALE`; Profile household line wraps.                                                                                                                                                                                                                                                                                                                                                       | `week-summary-sheet.tsx`, `app/profile.tsx`                                                                                          |
| 21.14 | **B-38** Units & currency button shows "Saved ✓" regardless of unsaved changes                                                                                                                                                                          | 2   | The button reads `Save units & currency` whenever the form differs from the saved values; `Saved ✓` only right after a save with no later edit (same rule for every Preferences save button).                                                                                                                                                                                                                                                           | `app/preferences.tsx` L283                                                                                                           |
| 21.15 | **B-36** Snap meal slot defaults to Lunch at any hour                                                                                                                                                                                                   | 1   | The slot defaults by local time exactly like Quick add (shared `defaultMealSlot(localHour)` in `@chefer/utils`).                                                                                                                                                                                                                                                                                                                                        | `src/features/tracker/scan-meal-card.tsx` L39, `quick-add-sheet.tsx`                                                                 |
| 21.16 | **B-37** camera-denied Snap: red text, no way out                                                                                                                                                                                                       | 2   | Muted notice `Chefer can’t use the camera.` with two buttons: `Open Settings` (`Linking.openSettings()`) and `Choose a photo instead` (Photos picker, which needs no permission).                                                                                                                                                                                                                                                                       | `scan-meal-card.tsx`                                                                                                                 |
| 21.17 | **B-42** internal spec copy in Stats ("research §6.1/§6.2")                                                                                                                                                                                             | 1   | Replaced by user copy (`How we work this out` → Explain sheet).                                                                                                                                                                                                                                                                                                                                                                                         | `src/features/gym/stats/stats-tab.tsx` L52 (gym lane)                                                                                |
| 21.18 | **B-52** servings stepper wraps "1.75" as "1.7 / 5"; scaled units like "3.1 ml cinnamon", "1.5 pinch", "2 to taste salt"                                                                                                                                | 1   | The stepper shows portions as fractions (`1¾`) at fixed width; scaled quantities round to kitchen units (`½ tsp cinnamon`, `a pinch`, `salt to taste` never scaled). Shared `formatScaledQuantity` in `@chefer/utils`.                                                                                                                                                                                                                                  | `app/recipe/[id].tsx`, `app/cook/[id].tsx`, `packages/utils`                                                                         |

#### Copy

`Logged to {Today | {weekday} {d} {Mon}} · {Meal}` · `Change` · `Logged {meal} to today` · `View` ·
`Saved to your Cookbook` · `New` · `You have {have} of {need}` · `Buy {n}` · `Enjoy!` · `Nutrition per serving` ·
`Scaled for {n} servings: {kcal} kcal total` · `Couldn’t refresh — pull to try again` · `Save units & currency` ·
`Chefer can’t use the camera.` · `Open Settings` · `Choose a photo instead` · `How we work this out`.

#### Analytics

`meal_logged { via: plan|quick_add|recent|scan|chat, planned }` from every logging path (WPD) — the tracker change
makes `via: plan` measurable.

#### Acceptance criteria

1. A chat log at 00:30 local in UTC+3 lands on the local date (API test with a fixed clock) and the reply shows the
   date; Progress at 01:00 local counts that day's logs (bug B-33); a repo check finds no UTC day derivation in
   server date code.
2. An imported, unplanned recipe appears under `All` right after saving.
3. Pantry `half a cabbage 1 pcs` vs a need of 4 → the line reads `You have 1 of 4 · Buy 3`.
4. On Food Plan reached from Gym via any path, the pill shows Food.
5. On an iPhone SE-size screen, every listed form's primary button is visible or reachable with the keyboard up, and
   every numeric field has Done/Next.
6. Cook mode opened from Discover ends with `Enjoy!`.
7. Preferences save buttons never read `Saved ✓` while the form has unsaved edits (bug B-38).
8. Snap defaults to the same meal slot as Quick add at the same hour; denying the camera offers Settings and Photos
   (bugs B-36, B-37).
9. Stats contains no "research §" text; a 1¾ portion shows as `1¾` and no scaled line reads `pinch` with a decimal or
   `to taste` with a number (bugs B-42, B-52).
10. Each row has a regression test (unit, component or Maestro) named after its bug id.

#### Web parity

21.1, 21.2, 21.3 are server fixes and land on web at once (web's progress page also reads the local-day contract);
web's own cookbook "All" and list partial-coverage label adopt the same copy. 21.7 and 21.18 (`recipes/[id]/page.tsx`,
cook mode), 21.14 (web preferences form) ship on web in the same PR group. 21.4, 21.5, 21.11, 21.13, 21.15–21.17 are
mobile-only mechanics.

**Dependencies.** PAT-4, PAT-9, PAT-11. None blocking; rows can ship as they are ready.

<a id="ux-22"></a>

### UX-22 ◆ Wellness and AI guardrails (not medical)

**Problem & evidence.** 2/10 (P06, P10) but segment-critical and a compliance floor (CI-44, Sev 3). A coeliac's
safety question to the AI Chef got no AI disclaimer and no "check the label" either (P10-M28). "pre-diabetes" typed as
a restriction became a chip that changed nothing ([P06](../screenshots/P06/017-diet-added.png)); the chat invites
"nutrition doubts" with no disclaimer and answered a blood-sugar question with no referral
([P06](../screenshots/P06/054-chat-up2.png); `app/chat.tsx` L118–120; `prompts.ts` L427–446). There is no "not medical
advice" anywhere; the AI Act Art. 50 label is missing on the chat.

> "It just made a little label. I hope it knows what it means." · "For food, worse than the leaflet from the surgery." (P06)

**User story.** As someone whose GP told me to change how I eat, I want Chefer to be honest about what it can and
can't do for my condition and point me to the right person, so that I use it as a help, not as medical advice.

#### Flow & states

1. **Condition typed anywhere safety terms are entered** (UX-01 "Something else", household member, Preferences):
   the recogniser's `condition` outcome shows an amber `UncheckedNotice` and **does not create a chip**:

```
┌ help-circle  About “pre-diabetes” ────────────┐
│ Chefer can’t adjust plans for medical          │
│ conditions, so we haven’t saved this as a rule.│
│ What Chefer can do: plan balanced meals, keep   │
│ portions in line with a goal, and show what’s   │
│ in every meal. For advice on what to eat with   │
│ pre-diabetes, talk to your GP or a dietitian.   │
│ [ Choose a goal ]            [ OK ]             │
└─────────────────────────────────────────────────┘
```

`Choose a goal` appears only where the goal step is reachable (onboarding, Settings). Existing condition chips are
surfaced by the UX-01 migration card as `can’t check (note)` with this text.
Condition list (in `packages/types/src/safety-taxonomy.ts`, `group: 'condition'`): diabetes, pre-diabetes /
prediabetes, high blood sugar, high cholesterol, high blood pressure / hypertension, IBS, Crohn’s, colitis, kidney
disease, gout, PCOS, pregnancy / pregnant, reflux / GERD, and their common Romanian forms (`diabet`, `prediabet`,
`hipertensiune`, `colesterol`) for the RO market. `Coeliac` / `celiac` is **not** a condition here: it maps to the
`Gluten-free (coeliac)` diet (UX-01).

2. **AI Chef** (`app/chat.tsx`):
   - Header subtitle under `AI Chef`: `AI · answers can be wrong` (always visible; Art. 50 label).
   - Empty-thread card: title `Ask the chef` · body `Swaps, what to cook tonight, cooking questions — or ask me to add
something to your list.` · a divider · `medkit-outline` + `I’m a chef, not a doctor. For medical questions — like
blood sugar, blood pressure or pregnancy — please ask your GP or a dietitian.`
   - Replies on health topics carry a footer line under the bubble: `Not medical advice — check with your GP.`
   - Replies on **allergy, coeliac or diet-safety** topics carry a different footer: `AI can be wrong about allergens —
always check the label.` (P10-M28), and any recipe the chat proposes still passes the UX-01 filter.
     **Needs (additive):** the stream's final event includes `healthTopic: boolean` and `safetyTopic: boolean`, set by
     the server guardrail. The
     server prompt adds the "chef, not a doctor" rule already used in the weekly review (`prompts.ts` L459–460) and
     removes "nutritional advice" from the invitation (stage 4).
3. **Goal & body metrics** (onboarding and Settings › Goal & body, `goal-step.tsx`, `metrics-step.tsx`,
   `goal-body-card.tsx`): a muted line under the goals:
   `Chefer gives general healthy-eating guidance, not medical advice. If you have a medical condition, are pregnant,
or have had an eating disorder, check with your GP before changing how you eat.`
4. **Settings › About** (hub footer): `Chefer is a wellness app. It isn’t a medical device and doesn’t give medical
advice.` (Google Play health declaration).
5. **Store listings:** the same sentence in the description (UX-25).
6. **No "eat more" nudges on a loss goal** (a B-11 sanity rule pulled in here because it reads as advice): the plan's
   `Protein short by … — add a snack` line is suppressed for Lose-weight users (`plan-day-totals.tsx`).

#### Copy

All strings are in the flow above; they live in `packages/utils/src/wellness-copy.ts` (shared with web).

#### Components & files

`src/features/safety/unchecked-notice.tsx` (condition variant), `app/chat.tsx`, `src/lib/chat-stream.ts`,
`src/features/preferences/components/goal-step.tsx`, `metrics-step.tsx`, `src/features/preferences/goal-body-card.tsx`,
`app/settings.tsx` (About), `src/features/meal-plan/plan-day-totals.tsx`; server prompts (stage 4).

#### Accessibility

The notice is `accessibilityRole="alert"` when it appears. The chat subtitle is read with the title
(`AI Chef, AI, answers can be wrong`).

#### Analytics

`safety_readback_viewed { unrecognisedCount }` already counts conditions as unrecognised; add
`condition_notice_shown { }` (no term).

#### Acceptance criteria

1. Typing any listed condition (English or Romanian form) shows the notice and saves nothing; `coeliac` selects the
   gluten-free diet instead.
2. The chat header always shows `AI · answers can be wrong`; the empty thread shows the chef-not-a-doctor line.
3. The system prompt contains the guardrail and no longer invites "nutritional advice" (prompt snapshot test).
4. A reply flagged `healthTopic` renders the GP footer; a reply flagged `safetyTopic` (e.g. "is this gluten-free?")
   renders the check-the-label footer.
5. The goal/metrics disclaimer is visible on every goal and metrics screen, at 1.8× text, without truncation.
6. No screen or listing says `suitable for diabetics`, `medical`, `treat`, `cure` or `prevent` (copy grep).
7. Lose-weight users never see `add a snack` nudges.

#### Web parity

Web chat `apps/web/src/features/chat/components/ChatWidget.tsx`, onboarding `step-goal.tsx` / `step-metrics.tsx` /
`step-diet.tsx`, preferences form, day-view protein nudge: same copy module, same PR group.

**Dependencies.** UX-01 (recogniser). Counsel review of the wording (UX-26). **Don't** go further (B-30).
**Validate:** V1/V2 interviews with 2–3 people who have a GP instruction; claims review before store submission.

<a id="ux-25"></a>

### UX-25 Store listing and first screen say what Chefer really does

**Problem & evidence.** 10/10 (CI-09): a fresh install opens on `Welcome back / Sign in` with no logo or value statement
and a small `Create one` link ([P03](../screenshots/P03/001-first-launch.png)); the register subtitle says only
`Meal planning that fits your goals` ([P01](../screenshots/P01/002-register.png)). The draft listing
(`docs/app-store/ios-drafts-2026-09-26/metadata.md`) promises plans built around "budget and the time you have to cook"
and "Pantry mode… plans use it up", which don't work on the tier people land on (CI-11, CI-16, CI-25).

> "Welcome back? I've literally never been here. Is this even the right app?" (P03) · "Meal planning? My friend said it does workouts." (P01)

**User story.** As someone who just installed Chefer because a friend said it does workouts and meals, I want the
first screen to confirm that and start me as a new user, so that I know I'm in the right app.

#### Flow & states

1. **New `Welcome` screen** — `apps/mobile/app/(auth)/welcome.tsx`. `(auth)/index.tsx` redirects to `/welcome` when
   the device has never had a signed-in session (a KV flag `hasSignedInBefore`, set on the first successful sign-in or
   registration), else to `/login`.

```
┌──────────────────────────────────────────────┐
│                                               │
│            [ Chefer mark, 64 pt ]             │
│                                               │
│   Train and eat to one plan                   │
│   A free workout log that tells you what to   │
│   lift next, and a week of meals with one     │
│   shopping list.                              │
│                                               │
│   barbell  Workouts that tell you what to     │
│            lift next — free                   │
│   calendar A week of meals that fits your     │
│            time, with one list                │
│   shield   Allergies checked on every plan    │
│                                               │
├──────────────────────────────────────────────┤
│ [       Create free account        ]          │
│ [       I already have an account  ]  (outline)│
│ By continuing you agree to the Terms…         │
└──────────────────────────────────────────────┘
```

Copy for row 2 depends on what has shipped (the rule: the first screen and the listing only claim what works on the
free tier). Before UX-07: `A week of meals and one shopping list`. After UX-07: `A week of meals that fits your
   time, with one list`. After UX-06: `A week of meals that follows your training days`. Row 3 ships with UX-01 +
UX-02 only. 2. **Login** keeps `Welcome back` only when `hasSignedInBefore`; otherwise its title is `Sign in` and the subtitle
`Use the email you signed up with.` The footer link becomes a full-width outline button `Create free account`. 3. **Register** subtitle: `Free workout log and weekly meal plans.` 4. **Store listing** (`docs/app-store/ios-drafts-2026-09-26/metadata.md`, and the Play listing when drafted):

| Field                    | New copy                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name (≤ 30)              | `Chefer: Gym Log & Meal Planner` [30]                                                                                                                                    |
| Subtitle (≤ 30)          | `Gym log + meals for your week` [29]                                                                                                                                     |
| Promotional text (≤ 170) | `Free workout log that tells you what to lift next, plus a week of meals and one shopping list. Allergies checked on every plan. Premium is free during the beta.` [160] |

**Description** (sections in this order; each claim maps to a working flow on the stated tier; `(Premium)` marks
premium-only lines):

- `TRAIN WITH A PLAN — FREE` — routine from a few questions; pre-filled targets and one-tap logging; rest timer;
  "Next time" targets that explain themselves; works offline; weekly goals, no daily streak.
- `A WEEK OF MEALS` — plan in one tap; choose which meals, which days and how long you cook _(after UX-07)_; replace
  any meal from your own recipes; `Plans built around your training days (Premium)` _(after UX-06)_.
- `ALLERGIES CHECKED ON EVERY PLAN` _(after UX-01/02)_ — pick allergies and diets for everyone at your table; see
  what each plan was checked for; always read labels of packaged food.
- `ONE SHOPPING LIST` — grouped by aisle, tick as you shop, send it to your partner _(after UX-13)_; rough cost
  estimate.
- `COOK STEP BY STEP` — cook mode.
- `PREMIUM (FREE DURING THE BETA)` — portions for your whole table; recipe import from links and videos; the AI
  chef; a week planned for you every Monday; budget-fit weeks _(only once shipped)_. The pantry line is removed until
  UX-15 ships.
- Closing line: `Chefer offers general healthy-eating and training guidance. It isn’t a medical device and doesn’t
  give medical advice.`
  **Screenshots, in order:** (1) Gym Today → a "Next time" summary with its reason; (2) Plan with the training-day
  header and `Checked for your table`; (3) Shop aisles with the share button; (4) household allergy read-back;
  (5) cook mode. Captions ≤ 6 words: `Know what to lift next` · `Meals that follow your training` ·
  `One list, sent in a tap` · `Checked for everyone’s allergies` · `Cook it step by step`.

#### Components & files

**New:** `apps/mobile/app/(auth)/welcome.tsx`, a `hasSignedInBefore` key in `src/features/gym/offline/keys.ts` (or the
auth store). **Change:** `app/(auth)/index.tsx`, `login.tsx`, `register.tsx`, `src/lib/auth-store.ts` (set the flag),
`docs/app-store/ios-drafts-2026-09-26/metadata.md` (+ `scripts/check-lengths.mjs` run), app-store screenshots (after
the features ship).

#### Accessibility

Welcome headline is `accessibilityRole="header"`; the three rows are a list; both buttons full width, 48 pt.

#### Analytics

`welcome_viewed { }` · `welcome_cta { choice: create|sign_in }` (anonymous, pre-account).

#### Acceptance criteria

1. A fresh install opens on Welcome, never on `Welcome back`.
2. After one sign-in on the device, sign-out lands on `Welcome back` (login).
3. Every listing and Welcome claim maps to a working flow on the stated tier (checklist in the PR, reviewed against
   the shipped build); lengths pass `check-lengths.mjs`.
4. No listing text mentions pantry-driven plans, budget-fit plans or time-based planning before the feature ships.
5. The medical disclaimer is in the description.

#### Web parity

Web landing `apps/web/src/app/page.tsx` hero ("Your personal chef, powered by AI" / "…goals, allergies and budget —
with the shopping list priced and ready") is rewritten with the same positioning and the same "only what works"
rule; web register subtitle (`features/auth/components/register-form.tsx`) matches mobile. Same PR group.

**Dependencies.** Positioning (stage 2 §2.3, ⚖ D-3). Copy lines unlock as UX-01/02/06/07/13 ship. Screenshots last.

<a id="ux-26"></a>

### UX-26 ◆ Compliance pack before charging (the UI parts)

**Problem & evidence.** Applies to everyone (10/10). The dossier's list (stage 2 B-26, [S66]–[S70]): explicit GDPR
Art. 9 consent for health data (allergies, diet, weight and goals are health data, read broadly), a DPIA, the AI Act
Art. 50 chat label (in force since 2 Aug 2026), the Play "not a medical device" statement, an age gate at 16 (RO),
a withdrawal button for web payments, transfer terms for Groq/Cloudflare, and a product-liability evidence trail for
allergen filtering before **9 Dec 2026**. "Free for now" with no terms (CI-12). The in-app AI consent sheet (D6) is the
model: users called it "a proper disclosure" (P05; 8/10 praised it). **Final strategy (CI-54):** B-26 also answers the
legal questions behind the privacy gaps — is footer-implied Terms consent enough when health data is processed; must
the weekly digests be opt-in; what consent record GDPR Art. 7(1) requires; what happens to data already sent to Groq
and Cloudflare after revoke or deletion (their DPA retention). **The product side of those gaps is UX-39**; this spec
keeps the health-data consent, age gate, AI labels and the evidence trail, and supplies UX-39's final copy.

**User story.** As a user who types my child's allergy and my weight into a food app, I want to be asked clearly
before that is stored, know where it goes, and be able to take it back, so that I can trust Chefer with it.

**Counsel owns the words.** This spec designs the surfaces and gives draft copy; the release gate is counsel's
sign-off (stage 2 §7.4: before 9 Dec 2026 and before any price). Non-UI work (DPIA, DPAs/SCCs, logging) is stage 4.

#### Flow & states

1. **Health-information consent** — a `HealthDataConsentSheet` modelled on the AI consent sheet
   (`src/features/ai-consent/ai-consent-provider.tsx`), shown **once, the first time** the user saves any health field
   (allergies/diets/dislikes for self or a member, goal, body metrics, a weigh-in), in onboarding or later:

```
HEALTH INFORMATION
Can Chefer use this to plan your food?
Allergies, diets, your goal and body measurements
count as health information under EU law, so we
need your clear permission.
• What: the allergies, diets and measurements you
  enter for you and your household
• Why: to check and plan your meals and targets
• Where: stored on our servers in the EU; sent to
  our AI providers only when you use an AI feature
  (you’ll be asked separately)
• Your choice: withdraw any time in Profile ›
  Privacy & data — we delete it
[ Allow and save ]
[ Don’t save it ]
```

`Don’t save it` keeps the step's other answers and discards the health fields, then shows an inline amber notice
where it matters: on the Allergies & diets step `Without this, Chefer can’t check plans for allergies.` and on Food
Today a dismissible card `Plans aren’t being checked for allergies` / `Allow health information` (→ the sheet).
The consent is not pre-ticked, not bundled with Terms, and is recorded with a timestamp and copy version.
**⚖ counsel:** whether allergies can instead rely on another Art. 9(2) ground; if so the sheet is informational
(`Got it`) for allergies and consent-based only for body data. 2. **Profile › Privacy & data** (new section; groups the existing cards): `Health information` (`Allowed on {date}` ·
`Withdraw and delete` → ConfirmSheet `Delete your health information?` / `This removes allergies, diets, dislikes,
   goal, measurements and weigh-ins for you and your household. Plans will no longer be checked for allergies.` /
`Withdraw and delete` / `Keep`) · `AI & your data` (existing `AiConsentCard`, revoke copy from UX-39) ·
`Usage analytics` (UX-12) · `Emails` (UX-39) · `Consent history` (UX-39) · `Download my data` / `Delete account`
(existing `AccountDataCard`, improved by UX-39, destructive last). The section is built once, in UX-39's lane. 3. **Age gate** on Register (`app/(auth)/register.tsx`): replace the implied "you confirm you are 16 or older" sentence
with a required, unticked checkbox row `I’m 16 or older` above `Create account`; the button stays enabled and shows
`Please confirm you’re 16 or older.` if tapped unticked. **Alternative (counsel):** a year-of-birth field. It sits
with UX-39's Terms/Privacy acceptance row as one "Before you start" block (UX-39 §1). 4. **AI labels (Art. 50):** the chat label (UX-22); an `AI-generated` chip (`sparkles-outline`, muted) on
AI-generated plan meals and Cheferized/imported recipe drafts, and on the AI swap proposal (UX-08). Ship the chip
component now; counsel decides which surfaces need it by 2 Dec 2026. 5. **Not a medical device** (UX-22 About + listing). 6. **Evidence trail:** the UX-01 report flow and the "Checked for" data are the user-facing part; the logged filter
decisions and the regression-suite report are stage 4. 7. **Payments (Phase C, web):** out of scope until payments exist; when they do, the EU withdrawal button
(`Withdraw from contract`) sits on the web billing page next to `Cancel subscription`, and the in-app PremiumSheet
terms (UX-10) link to it.

#### Components & files

**New:** `src/features/privacy/health-consent-sheet.tsx` (+ provider hook `useHealthConsent`),
`src/components/ai-generated-chip.tsx` (the Privacy & data section itself is built by UX-39).
**Change:** `app/profile.tsx`, `app/(auth)/register.tsx`, every health-field save path (`safety-step`, household
editor, goal/metrics steps, `goal-body-card.tsx`, weight log form), `plan-meal-card.tsx` + recipe detail (AI chip).
**Needs (additive):** `privacy.getConsents`, `privacy.setHealthConsent`, `privacy.withdrawHealthData`; an
`aiGenerated` flag on recipe payloads.

#### Accessibility

The consent sheet mirrors D6's structure (heading, list, two full-width buttons); no pre-selected option; reading
order puts the choice after the explanation.

#### Analytics

`health_consent_answered { allowed }`, `health_consent_withdrawn { }` (new) — counts only.

#### Acceptance criteria

1. No health field is stored before the user taps `Allow and save` (API rejects health writes without a recorded
   consent — stage 4 — and the UI never sends them).
2. `Don’t save it` stores nothing health-related and shows the two notices.
3. Withdraw deletes all listed data for the user and household and records the withdrawal; plans stop showing
   `Checked for`.
4. Registration cannot complete without the 16+ confirmation.
5. Chat always carries the AI label; the AI chip component exists and renders on AI plan meals.
6. Counsel's checklist (DPIA signed, consent copy, age gate, Art. 50 label, Play declaration) is attached to the
   release PR before 9 Dec 2026.

#### Web parity

Web profile (`apps/web/src/app/(dashboard)/profile/page.tsx`, `AccountDataCard.tsx`, `AiConsentCard.tsx`,
`AnalyticsConsentCard.tsx`), register form, onboarding and preferences get the same consent sheet (web `Sheet`),
privacy section, age checkbox and AI chip. Same PR group — consent must be identical on every platform.

**Dependencies.** Counsel (owner). UX-01 (report flow), UX-12 (analytics card), UX-22. **Protect:** D6, D14.

<a id="ux-11"></a>

### UX-11 ◆ Explain every number, and never change it silently _(Now — moved up from Next in the final strategy)_

**Problem & evidence.** 7/10 (CI-06, Sev 3), plus CI-05 (5/10) and CI-21; P10's "ONE thing" and the top frustration
of the data-literate personas (P07, P10). Targets have no visible source (the one explanation, D13, sits four screens
deep in Preferences; the kcal formula is shown nowhere): [P06 unexplained 2,099 / 184 g](../screenshots/P06/025-after-finish.png).
**Targets change silently:** completing gym setup switches on the lifter g/kg rule, which moved P10's protein
128 → 93 g and carbs 272 → 307 g, and P06's 184 → 204 g (bug B-48, `training-nutrition.service.ts` L122–136). The plan
says "Protein short by 35 g — add a snack" to a man told to lose weight ([P06](../screenshots/P06/030-plan-generated.png));
the relaunch leads with a yellow `PLAN UNDER TARGET` and no fix ([P10](../screenshots/P10/083-s2-relaunch.png)); `−79 %`
from one partial day ([P06](../screenshots/P06/100-s2-progress.png)); prices with no confidence cue; "Saved ~389 RON"
without lines.

> "Make every number tappable: 'why 93 g?', 'why 2,284?', 'why is this gluten-free?'. Show the rule, the source and what to check." (P10) · "Is that a lot or a little? 184 grams — I don't know what that looks like on a plate." (P06)

**User story.** As someone who cares whether the numbers are right, I want to tap any target to see its rule and my
inputs, be told whenever a target changes and why, and see an honest fix when the plan misses it, so that I trust the
numbers or know what to change.

**Scope.** Now: (1) change notices; (2) tappable targets; (3) plan-misses-target message with a fix; (4) sanity
rules; (5) price ranges and coverage (designed in UX-08 §7, built by the Plan lane). May trail: tap-through on every
other number (Progress %, plan-on-track chip, savings) and itemised savings (B-33).

#### Flow & states

**1. Change notice** (PAT-14) — whenever the server recomputes a target (gym setup completes, metrics or goal change,
training-day kinds change, a coach review proposes new numbers):

```
┌ CHANGED ─────────────────────────────────────┐
│ Your protein target changed                   │
│ 128 g  →  93 g                                │
│ Because you finished gym setup: lifters get   │
│ 1.6 g per kg of body weight (you: 58 kg).     │
│ [ Use the new target ]   [ Keep 128 g ]       │
│ Why?                                          │
└───────────────────────────────────────────────┘
```

- Shown at the top of Food Today until answered (for Track users above the ring; for others above the first card), and
  as a one-line banner on Plan if the plan was generated with the old target (`This week was planned for 128 g protein.
Re-plan with 93 g?` / `Re-plan` / `Keep the plan`).
- If the user had set their own target (UX-35), nothing changes until they tap `Use the new target` (the notice
  reads `Suggested change` instead of `Changed`). Otherwise the new target applies and `Keep {old}` writes the old one
  back as the user's own.
- Several fields changing at once (protein and carbs) → one card listing each `before → after` row.
- **Needs (additive):** the server records every target change (`targetChanges`: field, before, after, reason enum,
  at) and `preferences.acknowledgeTargetChange({ id, keep })`.

**2. Tap any target → its rule** (PAT-1). On Food Today the ring centre (`of 2,284 kcal`), each macro bar label, and
on Plan the day totals open an `ExplainSheet`:

| Target                  | Sentence (exact pattern)                                                                                                                                                                                                                                                                                                              | Rows                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| kcal (computed)         | `Your body uses about {tdee} kcal a day, worked out from your age, height, weight and activity. {Goal sentence}.` Goal sentences: `To lose weight steadily, Chefer takes off 500.` · `To gain muscle, Chefer adds 300.` · `To maintain, it stays the same.` · `To fuel your training, it adds your training-day bonus on those days.` | `Maintenance` · `Goal adjustment` · `Training days` · `Formula: Mifflin–St Jeor` |
| protein (computed)      | `{x} g per kg of {your body weight \| a healthy weight for your height}, because {you train \| your goal is to lose weight}.`                                                                                                                                                                                                         | `Rate` · `Weight used` · `Why this weight`                                       |
| carbs / fat             | `What’s left of your calories after protein, split {x} % carbs and {y} % fat.`                                                                                                                                                                                                                                                        | `After protein` · `Split`                                                        |
| any target the user set | `You set this on {date}.` + the suggested value for comparison                                                                                                                                                                                                                                                                        | `Your target` · `Suggested`                                                      |

Every sheet has the action `Change your targets` (→ UX-35 card). P10's "why is this gluten-free?" is answered by the
UX-02 What-we-check sheet, reachable from any recipe's Checked line.

**3. When a plan misses its target, say so and offer a fix** (replaces "Protein short by … — add a snack" and the
yellow `PLAN UNDER TARGET` chip):

- Ring status chip on Today (neutral, never a warning colour on open): `Plan: 1,830 of 2,284 kcal`; tap → a sheet
  `Today’s plan is about 450 kcal under your target` with the reason (`The curated recipes for today are lighter than
your target.`) and actions ranked: `Bigger portions` (scales the day's slots within 0.75–1.5×, preview first) ·
  `Add a snack` (only when the goal is not Lose) · `Keep it` (dismisses for today).
- Plan day totals (`plan-day-totals.tsx`) use the same sentence and actions for that day.
- A **premium AI week** that misses on some days shows it in the What Premium changed card (UX-10 §8) — never hidden.

**4. Sanity rules** (deterministic, `packages/utils/src/training-nutrition.ts` and the plan builder):
protein for BMI ≥ 30 uses an adjusted weight (so the plan can reach it; the Explain sheet says so); no "eat more" or
"add a snack" suggestions for a Lose goal; portions never exceed 2× to chase a target (the P02 "1,300 kcal cod" case) —
the day is flagged under target instead.

**5. Prices and totals** — UX-08 §7 (ranges, "rough estimate", coverage) is part of this item's scope.

**6. (May trail)** Progress: no percentages until ≥ 3 logged days (`Log 2 more days to see your average`); percentages
read `about 20 % under your target this week`; plan-on-track and weekly review numbers get Explain sheets; the pantry
savings figure returns only itemised (`Saved about 18 lei: cabbage, rice, onions ›`).

#### Copy

| Key              | Copy                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| notice           | eyebrow `CHANGED` / `SUGGESTED CHANGE` · title `Your {protein \| calorie \| carb \| fat} target changed` · `{before} → {after}` · reasons: `Because you finished gym setup: lifters get {x} g per kg of body weight (you: {w}).` · `Because you updated your weight to {w}.` · `Because you changed your goal to {goal}.` · `Because {weekday} is now a {kind} day.` · `Your weekly review suggests this.` · buttons `Use the new target` / `Keep {before}` · `Why?` |
| plan banner      | `This week was planned for {old}. Re-plan with {new}?` · `Re-plan` · `Keep the plan`                                                                                                                                                                                                                                                                                                                                                                                 |
| ring chip        | `Plan: {planned} of {target} kcal`                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| miss sheet       | `Today’s plan is about {n} kcal under your target` / `… over your target` · `Bigger portions` · `Add a snack` · `Keep it`                                                                                                                                                                                                                                                                                                                                            |
| explain          | as in the table above; action `Change your targets`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| progress (trail) | `Log {n} more days to see your average` · `about {x} % {under \| over} your target this week`                                                                                                                                                                                                                                                                                                                                                                        |

#### Components & files

**New:** `src/features/dashboard/components/change-notice-card.tsx` (PAT-14), `src/features/nutrition/target-explain-sheet.tsx`,
`src/features/nutrition/plan-miss-sheet.tsx`, `packages/utils/src/explain-targets.ts` (sentences, shared with web).
**Change:** `src/features/dashboard/components/nutrition-summary.tsx` (tappable ring/macros, neutral chip),
`app/(food)/index.tsx` (notice slot), `app/(food)/meal-plan.tsx` + `src/features/meal-plan/plan-day-totals.tsx`
(miss sheet, re-plan banner), `app/tracker.tsx` (same tappable targets), `src/features/preferences/goal-body-card.tsx`
(D13 text reused as the source), `app/progress.tsx` (trail). **Needs (additive):** `targetChanges` +
`acknowledgeTargetChange`; `dashboard.summary` returns the target inputs; `mealPlan.scaleDay` (preview + apply).

#### Accessibility

Each tappable number is one button with the hint `Explains where this number comes from`; the change notice is an
alert on first render; before → after is read as `from 128 grams to 93 grams`.

#### Analytics

`target_change_notice_viewed { reason, kept }` · `number_why_opened { metric: kcal|protein|carbs|fat|price|progress }` ·
`plan_miss_fixed { action: portions|snack|keep }` (new).

#### Acceptance criteria

1. **No target changes without a notice** (API + component tests): completing gym setup for a user whose protein was
   128 g shows the notice `128 g → 93 g` with the gym-setup reason; `Keep 128 g` restores 128 g as the user's own;
   the Today ring shows the kept value.
2. With an own target set (UX-35), a recomputation never changes it; the notice reads `Suggested change`.
3. Tapping the ring centre, each macro label and Plan day totals opens an Explain sheet naming at least one user input.
4. No screen shows `add a snack` to a Lose-goal user; the Today chip never renders in warning colour on open; a
   plan under target offers `Bigger portions` with a preview.
5. For BMI ≥ 30, the protein Explain sheet says `a healthy weight for your height` and the target uses it (unit test).
6. Stage 2 targets (after UX-12): `number_why_opened` in ≥ 20 % of weekly active food users; in V2, ≥ 80 % can say
   where their protein target comes from.

#### Edge cases

Missing metrics → the kcal sheet says `We don’t know your body measurements, so this is a standard 2,000 kcal.
Add them for a personal number.` A change while offline is shown on the next online focus. A notice older than 14 days
auto-resolves to the value in force and moves to Settings › Your targets › History.

#### Web parity

Web dashboard `features/dashboard/components/nutrition-summary.tsx`, `training-day-note.tsx`, meal-plan
`DayRecapBar.tsx` / `day-view.tsx`, progress page, preferences form: same notice, explain sentences
(`@chefer/utils/explain-targets.ts`) and miss sheet. Same PR group.

**Dependencies.** PAT-1, PAT-14; UX-35 (own targets); UX-06 (kind changes route through the notice); UX-08 §7.
**Protect:** D13 (its text becomes the source), D2 (tone). **Validate:** V2, V5.

<a id="ux-19"></a>

### UX-19 Log fast, fix mistakes _(Now — moved up from Next in the final strategy)_

**Problem & evidence.** 3/10 (CI-28, now Sev 4: P01, P06, P07), CI-48 (P07; no edit, instant delete), CI-40 (3/10,
Sev 3: ticks silently lost without "Save Day"), CI-45. P07 spent ~50 s and 9 taps per item typed from memory; quick
add accepts nonsense (100 kcal with 500 g protein, bug B-39); logged entries can't be edited
([P07 long-press does nothing](../screenshots/P07/081-s2-longpress.png), bug B-34) and the bin deletes instantly; the
fastest path — ticking planned meals with ½×–2× chips (D23) — is invisible without a plan.
**Don't:** no branded-food database or barcode (B-29, re-examined and kept).

> "How would I know? I'm not a calculator. That's why I've got the app." (P06) · "There's no edit at all? In MacroFactor I tap the entry and change the grams." (P07)

**User story.** As someone who logs what I eat, I want to log a repeat food in seconds, find "chicken breast" in grams
without knowing its calories, and fix or undo any entry, so that logging stays accurate without effort.

#### Flow & states

**1. Log something** — `src/features/tracker/quick-add-sheet.tsx` becomes search-first (keeps D17's one-sheet speed):

```
LOG SOMETHING                         Lunch ▾
[ What did you eat?                          ]
RECENT
  Protein shake · 180 kcal            [ + ]
  Oats 60 g, whey 30 g, banana · 487  [ + ]
THIS WEEK’S PLAN
  Lentil curry · 1 portion · 540      [ + ]
YOUR RECIPES / COOKBOOK
INGREDIENTS (per 100 g)
  Chicken breast, raw · 120 kcal      [150 g ▸]
─────────────────────────────────────────────
Not sure? Estimate it     Enter calories yourself
```

- Empty query shows `Recent` (last 15 distinct entries, most frequent first, one-tap `+` = log again with the same
  amount) and `This week’s plan` (planned meals of today and yesterday). Typing searches Recent, plan, own/cookbook
  recipes and **Chefer's ingredient catalogue** (per-100 g nutrition), results grouped in that order.
- Ingredient rows open an amount row inline: a numeric field in **grams** (or the user's unit) with `NumericReturnBar`,
  quick chips `50 g` `100 g` `150 g` `200 g`, live kcal/protein, `Log`.
- Recipe rows log at a portion (chips `½` `¾` `1` `1½` `2`, D23's pattern).
- `Not sure? Estimate it` → premium: Snap to log or the AI Chef with the typed text; free: the Snap taste (UX-10 §7).
  `Enter calories yourself` opens today's manual form (kcal required only here).
- The meal slot defaults by local time (shared `defaultMealSlot`, same as Snap).

**2. Edit any entry, undo any delete** (bug B-34). In the tracker (`app/tracker.tsx`) every logged row is tappable →
an `Edit entry` sheet (name, amount or portion, kcal, protein, carbs, fat, meal slot, date) with `Save` and a
destructive `Delete` at the bottom. Deleting (from the sheet or the row's bin) removes the row immediately with the
snackbar `Deleted {name}` + `Undo` (8 s). Weight entries keep their existing edit. **Needs (additive):**
`tracker.updateCustomMeal`, `tracker.restoreCustomMeal` (or soft delete).

**3. Copy a day.** Tracker day header overflow `⋯` → `Copy {yesterday} to today` (all entries, then editable);
snackbar `Copied {n} entries` + `Undo`.

**4. One save model** (CI-40, bug B-23 — moved here from UX-21): ticking a planned meal **saves immediately**
(optimistic) with the portion chips visible on the row (D23), snackbar `Logged {meal}` + `Undo`; `Save Day` is removed;
changing date never loses anything. `Extras · quick add` becomes `Also eaten`, and an entry logged as Lunch lists under
Lunch.

**5. Sanity checks** (bug B-39): macros must roughly add up to kcal (4/4/9 rule ± 25 %) — otherwise an inline amber
line `These don’t add up: 500 g protein is about 2,000 kcal.` with `Fix` (focuses the field) and `Log anyway`; values
display to one decimal below 10 g (6.5 g, not 7 g).

**6. Planned-meal ticking without a plan** (D23 invisible): for a Track user with no plan, the tracker's empty
planned section says `No plan today — log from Recent or search below.` instead of an empty card.

#### Copy

| Key      | Copy                                                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sheet    | title `Log something` · field `What did you eat?` · groups `Recent` · `This week’s plan` · `Your recipes` · `Ingredients (per 100 g)` · `Not sure? Estimate it` · `Enter calories yourself` · `Log` |
| edit     | title `Edit entry` · `Save` · `Delete` · snackbar `Deleted {name}` + `Undo` · `Changes saved`                                                                                                       |
| copy day | `Copy {yesterday \| Mon 21 Sep} to today` · `Copied {n} entries` + `Undo`                                                                                                                           |
| ticks    | snackbar `Logged {meal}` + `Undo` · section `Also eaten`                                                                                                                                            |
| sanity   | `These don’t add up: {n} g {macro} is about {kcal} kcal.` · `Fix` · `Log anyway`                                                                                                                    |
| empty    | `No plan today — log from Recent or search below.`                                                                                                                                                  |

#### Components & files

**Change:** `src/features/tracker/quick-add-sheet.tsx` (search-first), `app/tracker.tsx` (edit sheet, undo, copy day,
autosave ticks, sections), `packages/utils/src/quick-add.ts` (L52 kcal rule relaxed for matched items; macro sanity),
`src/features/dashboard/components/*` Quick add entry points (same sheet). **New:**
`src/features/tracker/edit-entry-sheet.tsx`, `packages/utils/src/meal-slot.ts` (`defaultMealSlot`).
**Needs (additive):** `tracker.recents`, `tracker.updateCustomMeal`, `tracker.restoreCustomMeal`, `tracker.copyDay`,
`ingredients.search` (Chefer's own catalogue with per-100 g nutrition; not branded products).

#### Accessibility

Search results are grouped lists with headers; `+` buttons read `Log {name} again, {kcal} kilocalories`; the grams field
announces live kcal politely; Undo per PAT-4.

#### Analytics

`meal_logged { via: plan|quick_add|recent|search|scan|chat, planned }` · `food_entry_edited { via }` ·
`food_entry_delete_undone { via }` · `day_copied { entriesCount }` (new).

#### Acceptance criteria

1. Logging a food from Recent takes ≤ 2 taps and a median ≤ 10 s (stage 2 target); `chicken breast 150 g` logs without
   typing any kcal.
2. Tapping any logged entry opens `Edit entry`; saving updates Today and Progress; deleting shows `Undo`, which restores
   the entry exactly (bug B-34).
3. Ticking a planned meal persists across date change and app kill; there is no `Save Day` (bug B-23).
4. `100 kcal, 500 g protein` shows the sanity line; `Log anyway` still logs (bug B-39).
5. `Copy yesterday to today` copies all entries and can be undone.
6. No branded products or barcodes appear anywhere (B-29).

#### Edge cases

Editing an entry logged from a plan slot keeps its link to the slot; editing a Snap entry keeps its photo (UX-37).
Offline: logging queues optimistically with a muted `Will sync` tag; edits to un-synced entries merge. Recents exclude
deleted entries.

#### Web parity

Web `apps/web/src/features/tracker/components/QuickAddSheet.tsx` and `app/(dashboard)/tracker/page.tsx` (same two save
models today): same search-first sheet, edit/undo, copy day and autosave. Same PR group.

**Dependencies.** PAT-4; UX-10 §7 (Snap taste for free "Estimate it"); UX-37 (Next) builds on the edit sheet.
**Protect:** D17 (one sheet, fast), D23 (portion chips), D20 (tracker home). **Validate:** V2 with trackers; re-check
B-29 only if beachhead users abandon over logging.

<a id="ux-35"></a>

### UX-35 Set my own targets _(new, Now)_

**Problem & evidence.** 5/10 (CI-21, **Sev 4**: P01, P02, P06, P07, P10), plus CI-06. Targets are computed-only on
**every tier** (`resolveDailyTargets` has no manual override, `preferences.service.ts` L177–222; premium `updateTargets`
has no target step, `preferences.router.ts` L101–104). P07's coach-set 2,000 kcal / 150 g became a read-only
1,669 / 146 g, and every screen then judged her against it — her salmon dinner turned the ring orange as "73 over" on a
target she never chose; P01 wanted 180 g protein ([P01](../screenshots/P01/105-calorie-card.png)); P02 wanted
recomposition; P10, an athlete with no weight goal, had no goal that fitted. The premium pitch promised a "personal
nutrition profile" (CI-12).

> "Let me type my own calorie and protein targets. Everything else I could live with for a while." (P07, her ONE thing) · "I'd type 180 if it let me." (P01)

**User story.** As someone whose targets come from my coach (or my own experience), I want to type my calories and
protein once and have every plan, ring and review use them, so that Chefer judges me against my numbers, not a formula.

**⚖ D-2 (recommended, designed here): free on every tier** — it isn't AI and every major tracker gives it away. If the
owner keeps `profilePersonalisation` premium, the same card ships on premium only and free users see the computed
targets with UX-11's Explain sheet plus a `LockedFeatureCard` (`Set your own targets`) — but the override must exist
on premium either way, because today it exists nowhere.

#### Flow & states

**1. The "Your targets" card** — `src/features/preferences/targets-card.tsx`, used in Settings › Your targets
(`preferences.tsx`) and as the onboarding step (UX-03, when the jobs include Track, or Train with a numeric goal):

```
YOUR TARGETS
( Suggested | My own ✓ )
Calories      [ 2000 ] kcal   suggested 1,669 ⓘ
Protein       [  150 ] g      suggested 146 ⓘ
Carbs & fat   ( Split the rest for me ✓ | Set them )
              → 205 g carbs · 67 g fat
Applies to    ( Every day ✓ | Different on training days )
[ Save targets ]
```

- `Suggested` shows the computed numbers read-only, each with its UX-11 Explain sheet. `My own` makes kcal and protein
  editable (numeric, `NumericReturnBar` + `useFieldChain`), with the suggestion shown beside each field for reference.
- Carbs & fat: `Split the rest for me` (default; computed from kcal − protein at the goal's split, shown live) or
  `Set them` (two more fields). Validation: kcal 1,200–5,000 (below 1,200 → `That’s very low. Chefer won’t plan below
1,200 kcal a day — talk to your GP or a dietitian if you’ve been advised otherwise.`, save blocked); protein
  40–400 g; macros must fit the kcal within ± 10 % (`Your macros add up to 2,340 kcal — 340 more than your target.`).
- `Different on training days` (Train users) reveals a second kcal/protein pair `On training days`; otherwise the
  UX-06 bump is added on top of the user's own number, and the card says so (`+ training-day bonus on lift days`
  with a switch `Add my training-day bonus`, default on).
- `Save targets` → snackbar `Targets saved. Plans and Today now use them.`; a plan generated with the old targets gets
  UX-11's re-plan banner.

**2. Two new goals** in the goal step and Goal & body card (`goal-step.tsx`, `goal-body-card.tsx`, `types.ts` `GOALS`):
`Recomposition` — `Lose fat and build muscle at the same time. Calories near maintenance, protein high.` · `Fuel my
training` — `No weight goal — eat to perform and recover.` (P10). Both compute suggestions (maintenance kcal; protein
1.8–2.0 g/kg; `Fuel my training` uses the UX-06 kinds for carbs).

**3. Everything respects the override:** Today's ring and macros, the tracker, Plan day targets, plan generation
(curated and AI), the weekly coach review and Progress. **The coach review proposes, never overwrites**: its target
suggestion arrives as a PAT-14 `SUGGESTED CHANGE` card with `Use {new}` / `Keep mine`.

**4. Where the number came from** is always visible: under the ring, a muted `Your target` (own) or `Suggested ⓘ`
(computed) label.

#### Copy

| Key            | Copy                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| card           | `Your targets` · `Suggested` · `My own` · `Calories` · `Protein` · `Carbs & fat` · `Split the rest for me` · `Set them` · `Applies to` · `Every day` · `Different on training days` · `On training days` · `Add my training-day bonus` · `suggested {n}` · `Save targets` |
| saved          | `Targets saved. Plans and Today now use them.`                                                                                                                                                                                                                            |
| validation     | `That’s very low. Chefer won’t plan below 1,200 kcal a day — talk to your GP or a dietitian if you’ve been advised otherwise.` · `Your macros add up to {n} kcal — {d} {more \| less} than your target.`                                                                  |
| goals          | `Recomposition` / `Lose fat and build muscle at the same time. Calories near maintenance, protein high.` · `Fuel my training` / `No weight goal — eat to perform and recover.`                                                                                            |
| ring label     | `Your target` · `Suggested`                                                                                                                                                                                                                                               |
| coach proposal | eyebrow `SUGGESTED CHANGE` · `Your weekly review suggests {n} kcal.` · `Use {n}` · `Keep mine`                                                                                                                                                                            |

#### Components & files

**New:** `src/features/preferences/targets-card.tsx`. **Change:** `app/preferences.tsx`, onboarding (UX-03 step),
`src/features/preferences/components/goal-step.tsx`, `goal-body-card.tsx`, `types.ts` (`GOALS`),
`src/features/dashboard/components/nutrition-summary.tsx` (label), `src/features/coach/chef-review-banner.tsx`
(proposal instead of overwrite). **Needs (additive):** `ChefProfile` fields `targetMode`, `customKcal`,
`customProteinG`, `customCarbsG?`, `customFatG?`, `customTrainingKcal?`, `customTrainingProteinG?`, goals
`RECOMP`, `PERFORMANCE`; `preferences.setTargets` (every tier, per D-2); `resolveDailyTargets` honours the override;
old clients keep reading `dailyCalorieTarget`, which now returns the effective value.

#### Accessibility

The mode switch is a segmented control with labels; each field's suggestion is read after it
(`Calories, 2000, suggested 1669`); validation messages are announced.

#### Analytics

`targets_set { source: onboarding|preferences, mode: own|computed, hasMacros }` — never the values.

#### Acceptance criteria

1. Any tier can set 2,000 kcal / 150 g; after saving, Today, the tracker, Plan day targets and the next generated plan
   use exactly those numbers (API + Maestro); **0 screens show a target other than the override** (stage 2 target).
2. Completing gym setup or changing weight never changes an own target; a `SUGGESTED CHANGE` notice appears instead
   (UX-11).
3. The coach review never writes targets; it produces a proposal card.
4. Below 1,200 kcal cannot be saved; macros that don't fit show the add-up message.
5. `Recomposition` and `Fuel my training` exist in onboarding and Settings with computed suggestions.
6. ≥ 60 % of Track/Train users with a known target set their own (after UX-12).

#### Edge cases

Switching back to `Suggested` keeps the own values stored (restored if they switch again). Unit system imperial →
kcal and grams stay (macros are universal). Household plans scale portions; the owner's targets stay theirs.

#### Web parity

Web preferences form (`apps/web/src/features/preferences/components/preferences-form.tsx`), onboarding
`step-goal.tsx`, dashboard `nutrition-summary.tsx`, weekly review: same card, goals and proposal behaviour. Same PR
group.

**Dependencies.** UX-11 (notices, Explain sheets), UX-06 (training-day bonus). ⚖ D-2. **Protect:** D13, D20.

<a id="ux-36"></a>

### UX-36 Training that bends to a chaotic week _(new, Now)_

**Problem & evidence.** 6/10 on CI-23 (gym settings built but unreachable — two of P09's four goals failed on this
alone; [P01](../screenshots/P01/181-sw-gym-settings.png)); CI-27 (5/10, ten taps for a reminder, fixed weekdays only,
rest-timer permission asked cold, bug B-40, [P03](../screenshots/P03/012-reminder-time.png)); CI-49 (a cut-short
workout can only be finished or binned, and the rest isn't carried forward —
[P09](../screenshots/P09/042-scroll-bottom.png)); CI-50 (2/10, ~50-min sessions, nobody asks how long you have —
[P09](../screenshots/P09/013-onb-step6.png)); CI-51 (the kind mechanics are invisible: `0-week streak` on minute one,
a silent `Skip this day`, bug B-45 — [P09](../screenshots/P09/018-after-onboarding.png),
[skip](../screenshots/P09/066-s2-skip-day.png)); CI-52 (no history list; set numbers off by one, bug B-41 —
[P09](../screenshots/P09/063-s2-history-detail.png)). The lapsed-lifter archetype.

> "Baby's awake — I need 'back in 20 minutes', not finish-or-bin." · "A zero streak on day one. That's the Headspace feeling." · "Ask me 'how long have you got today?' when I hit Start, and give me that workout — and if I stop halfway, keep the rest for next time." (P09)

**User story.** As a parent who trains when I can, I want to pause for a holiday, get a nudge when I've gone quiet,
fit a workout into the minutes I have and pick up where I left off, so that a messy week doesn't end my training.

**⚖ D-11:** everything here stays **free** (gym-free decision). An "adaptive week" premium is a separate V4 question.
**Protect:** D1–D3 and **D22** exactly (half sessions count, never red, no nagging; "That last line is the reason I'd
stay").

#### Flow & states (in build order; (6) may trail)

**(1) Gym settings you can reach** (S; unlocks built features). A `settings-outline` gear (44 pt) in the Gym Today and
Routine headers (the ModeSwitch row, PAT-9 §3), a `Gym settings` row in Profile, and the Settings hub rows (PAT-9).
`app/gym/settings.tsx` gets a real header (back + `Gym settings`) and sections in this order: `Training days &
reminders` · `Pause training` · `Weekly goal` · `Units` · `Equipment` (editable: `Full gym` · `Dumbbells + bench` ·
`Bodyweight` + `Dip belt` / `Weighted vest`) · `Export`. The sync banner link stays.

**(2) Reminders that fit a real week** (CI-27, bug B-40):

- **Clock-time picker** (PAT-10 `TimePicker`) in gym setup step 4 and settings; per-day times optional (`Same time
every day` switch, default on).
- **Quiet-days nudge:** `Nudge me if I’ve gone quiet for` `3 days` · `5 days` · `A week` · `Never` (default 5 days
  for new setups). Copy of the notification (never guilt): `Fancy a short one today? Your {dayName} is ready — about
{min} min.`
- **Permission in context:** notification permission is asked when the user turns a reminder or the quiet nudge on
  (existing contextual prompt, protect D3), and the rest-timer notification permission is asked with a rationale sheet
  the first time a rest timer would notify in the background — `Want a buzz when your rest is over, even with the
phone locked?` / `Allow notifications` / `Not now` — never cold at workout start.

**(3) Finish later / carry the rest** (CI-49). The workout's bottom actions become `Finish workout` · `Save for later`
· `Discard workout`; and `Finish workout` with unstarted exercises asks:

```
┌ 2 exercises not started ──────────────────────┐
│ Lat Pulldown, Romanian Deadlift                │
│ ( ) Finish now — skip them this time           │
│ (•) Move them to your next session             │
│ [ Finish workout ]                             │
└────────────────────────────────────────────────┘
```

- `Save for later` keeps the session open (existing active-session store) for up to 24 h; Gym Today shows the Resume
  card `Full Body A · 5 of 11 sets · Resume` and the Food Today workout card says `Workout paused · Resume`. After 24 h
  it finishes automatically with what was done (half sessions still count — D22), with the notice `We finished your
Full Body A with 5 sets.`
- `Move them to your next session` prepends the unstarted exercises to the next session (marked `From last time`);
  the rotation still advances. The summary lists them: `Moved to next time: Lat Pulldown, Romanian Deadlift`.
- **Needs (additive):** a carry-over list on the gym profile/next session.

**(4) Kind mechanics you can see** (CI-51, bug B-45):

- Gym Today's week card leads with the weekly ring (`1 of 2 this week`); the streak line appears only once the streak
  is ≥ 1 week (`2-week streak`), and before that reads `Your streak starts when you hit this week’s goal.` — never
  `0-week streak`.
- A `How this works` link on the week card opens an `ExplainSheet`: `Weeks, not days` / `Hit your weekly goal and your
streak grows. Missing a session changes nothing.` · `Flex weeks` / `Every 4 weeks you earn a flex week — a short week
won’t break your streak.` · `Pause` / `Going away or ill? Pause training and nothing counts against you.` · `Half
sessions count` / `Any finished workout counts toward the week.` — the Stats consistency legend links to the same
  sheet.
- `Skip this day` → snackbar `Skipped {dayName}. Next: {nextDayName}.` + `Undo`; the card animates to the next day.
- **Pause** (existing, now reachable): `Pause training` → `For how long?` `1 week` · `2 weeks` · `Until I’m back` ·
  reason chips (`Holiday`, `Ill or injured`, `Busy`, `Other`, optional) → Gym Today shows `Paused until {date} · Resume
now`; reminders are silenced during a pause.

**(5) Workout history** (CI-52, bug B-41). Gym › Stats gets a first segment `History`: a list grouped by week
(`This week`, `Last week`, `{date range}`), each row `{dayName} · {weekday d Mon} · {min} min · {sets} sets{ · PR}`,
→ the existing session detail, whose set labels number **working sets from 1** with warm-ups labelled `Warm-up`. The
unlabelled "last session" card on Gym Today becomes `Last workout · {dayName}, {relative day}` (`Yesterday`).

**(6) "How long have you got?"** (CI-50; the L part, may trail). In setup step 1 (after days): `How long can a session
usually be?` `30 min` · `45 min` · `60 min` · `75+ min` (programs are filtered/trimmed to fit). At `Start workout`, a
compact row above the button: `Time today:` `20` `30` `45` `Full` (default `Full`, remembered per weekday). A shorter
choice builds a short version of the day (keeps compounds and the first accessory per muscle group, drops the rest to
`From last time` for the next session), with the preview `Short version · ~28 min · 4 exercises`.

#### Copy (collected)

| Key             | Copy                                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| settings        | `Gym settings` · `Training days & reminders` · `Pause training` · `Weekly goal` · `Units` · `Equipment` · `Export`                                                                                                                                     |
| reminders       | `Same time every day` · `Nudge me if I’ve gone quiet for` · `3 days` · `5 days` · `A week` · `Never` · notification `Fancy a short one today? Your {dayName} is ready — about {min} min.`                                                              |
| rest permission | `Want a buzz when your rest is over, even with the phone locked?` · `Allow notifications` · `Not now`                                                                                                                                                  |
| interrupted     | `Save for later` · `{n} exercises not started` · `Finish now — skip them this time` · `Move them to your next session` · `Workout paused · Resume` · `We finished your {dayName} with {n} sets.` · `Moved to next time: {list}` · tag `From last time` |
| kind mechanics  | `Your streak starts when you hit this week’s goal.` · `How this works` · sheet rows as above · skip snackbar `Skipped {dayName}. Next: {nextDayName}.` + `Undo`                                                                                        |
| pause           | `For how long?` · `1 week` · `2 weeks` · `Until I’m back` · `Holiday` · `Ill or injured` · `Busy` · `Other` · `Paused until {date}` · `Resume now`                                                                                                     |
| history         | `History` · `This week` · `Last week` · `Warm-up` · `Last workout · {dayName}, {relative day}`                                                                                                                                                         |
| time            | `How long can a session usually be?` · `30 min` · `45 min` · `60 min` · `75+ min` · `Time today:` · `Full` · `Short version · ~{min} min · {n} exercises`                                                                                              |

#### Components & files

`src/features/gym/components/mode-switch.tsx` (gear — built in wave 0 by W0-B), `app/gym/settings.tsx` +
`src/features/gym/settings/settings-screen.tsx` (header, sections, TimePicker, quiet nudge, equipment),
`src/features/gym/reminders/*` (schedule, quiet-days logic), `src/features/gym/rest-timer.ts` +
`use-active-workout.ts` L86 (permission in context), `src/features/gym/workout/workout-screen.tsx` +
`workout-sheets.tsx` + `summary-screen.tsx` (save for later, carry-over), `src/features/gym/offline/active-session-store.ts`
(24 h), `src/features/gym/today/today-screen.tsx` + `today-helpers.ts` (week card, how-this-works, skip undo, pause
state, last-workout row), `src/features/gym/stats/stats-tab.tsx` + new `history-view.tsx`,
`src/features/gym/history/session-detail-screen.tsx` L141–142 (numbering), `src/features/gym/setup/setup-wizard.tsx`
(session length), `packages/utils/src/gym/session.ts` (carry-over, short version), `app/profile.tsx` (one row).
**Needs (additive):** carry-over list, session-length preference, quiet-days setting; pause exists.

#### Accessibility

Gear: label `Gym settings`. The unstarted-exercises choice is a radio group. History rows read as sentences. The
time-today chips are a radio group with the label `Time available today`.

#### Analytics

`gym_settings_opened { from: gear|profile|hub|outbox }` · `reminder_set { mode: time|quiet_days }` ·
`training_paused { weeks }` · `workout_saved_for_later { unstartedCount }` · `workout_rest_carried { unstartedCount }` ·
`session_time_chosen { minutes, where: setup|start }` · `skip_undone { }` (new).

#### Acceptance criteria

1. Gym settings open from the Gym Today gear, the Routine gear, Profile and the Settings hub; pause, reminders, weekly
   goal, units and equipment are all editable there (bug B-19).
2. A reminder at 19:30 takes ≤ 3 taps; the quiet-days nudge schedules after N days without a session and never during
   a pause; no permission prompt appears at workout start without a rationale (bug B-40).
3. `Save for later` keeps the session resumable from Gym Today for 24 h; `Move them to your next session` puts the
   unstarted exercises at the top of the next session marked `From last time`; ≥ 50 % of interrupted workouts are saved
   or carried after release (stage 2 target).
4. A new user never sees `0-week streak`; `How this works` explains weekly streaks, flex weeks, pause and half sessions.
5. `Skip this day` shows feedback and `Undo` restores the day (bug B-45).
6. Stats › History lists every finished session by week; session detail numbers working sets from 1 (bug B-41).
7. (6, when built) Choosing `30` at Start produces a preview ≤ 32 min and the dropped exercises go to the next session.
8. ≥ 30 % of gym users open gym settings in their first 14 days (from ~0).

#### Edge cases

An app kill with a saved-for-later session restores it (offline store, D1). Carry-over plus a missed day (UX-04 §7):
the moved exercises follow the moved day. Pause during an active saved session → the session finishes first with the
notice. Freestyle sessions have no carry-over.

#### Web parity

Web gym (G5) pages exist for settings (`apps/web/src/app/(dashboard)/gym/settings/page.tsx`), stats, workout and today:
ship the reachable settings, pause, clock reminders (web: email/push per existing settings), save-for-later,
kind-mechanics sheet and history where the page exists; otherwise add `mobile_parity_backlog.md` reverse entries for
G5. Shared logic in `@chefer/utils` (carry-over, short version, streak copy).

**Dependencies.** PAT-10, PAT-1, PAT-4, PAT-9 (gear); UX-04 §6–7 (built in the same gym lane); UX-06 (run-day kinds live
in `Training days & reminders`). ⚖ D-11. **Validate:** V2 (time-poor activation), V10/V11 (stage 2 §8).

<a id="ux-39"></a>

### UX-39 ◆ Privacy gaps closed _(new, Now)_

**Problem & evidence.** 2/10 (CI-54, Sev 2: P10, P07), against a baseline the privacy persona called the best she had
seen (D6, D14, D24). Terms and Privacy consent are implied by a footer line and the Privacy link leaves the app mid-signup
([P10](../screenshots/P10/002-register.png)); both weekly email digests and "Plan my week every Sunday" are **on by
default** (`schema.prisma` L118–119, L226; [P10](../screenshots/P10/094-s2-prefs-3.png); P07-M09); AI consent is one
nullable timestamp, so revoking erases the record and there is no consent history (L125, GDPR Art. 7(1)); revoke says
nothing about data already sent to Groq and Cloudflare ([P10](../screenshots/P10/103-s2-ai-revoke.png)); the export is
an unnamed JSON text blob in the share sheet that omits consent state, email preferences, AI logs and shopping lists
(bug B-53); the delete sheet is silent on the premium state and AI-provider data.

> "Emails opted-in by default — the one dark-ish pattern so far." · "Are the Groq logs deleted?" (P10)

**User story.** As someone who reads privacy policies, I want to agree to the terms explicitly, choose my emails,
see a record of what I've consented to and export everything in a file, so that Chefer handles my data the way it
says it does.

**Why ◆ Now:** small (S), and the consent record is a legal duty; doing it before UX-12 adds analytics keeps the
privacy story intact. Final wording comes from counsel (UX-26).

#### Flow & states

**1. Explicit acceptance at sign-up** (`app/(auth)/register.tsx`). Above `Create account`, a "Before you start" block:

```
[ ] I agree to the Terms and the Privacy Policy
[ ] I’m 16 or older                              (UX-26)
    Read: Terms · Privacy Policy   (open in-app)
[        Create account        ]
```

Both boxes unticked; tapping `Create account` with either unticked shows the matching inline error
(`Please agree to the Terms and Privacy Policy.`). `Terms` and `Privacy Policy` open **inside the app** in a
`legal/[doc]` screen (`react-native-webview`, already a dependency) with a close button, so the form keeps its values
(P10: the link left the app mid-signup). The acceptance is recorded with the document versions.

**2. Emails opt-in; auto-plan asked** (⚖ D-13). New accounts start with both weekly email digests **off**; the
onboarding How you cook step asks about the Sunday auto-plan (UX-03), default off. Settings › Emails
(`src/features/preferences/weekly-updates-card.tsx`) shows each digest with a one-line preview of what it contains and
when it's sent. Existing accounts keep their settings, and see once: `We’ve changed how emails work: they’re now
off unless you turn them on. Yours are still on.` / `Keep them on` / `Turn them off`.

**3. A consent log you can see.** Profile › Privacy & data › `Consent history`: a list of every consent event
(`Terms & Privacy v3 accepted · 27 Sep 2026, 01:26`, `AI features allowed (Groq, Cloudflare) · 27 Sep, 01:40`,
`AI features revoked · 28 Sep, 09:12`, `Usage analytics: anonymous on`, `Weekly email: off`, `Health information
allowed`). Revoking never erases a past record. **Needs (additive):** a `ConsentEvent` table (kind, granted, providers,
document version, at) replacing the single `aiDataConsentAt` as the source of truth (the old field stays readable for
old clients).

**4. Honest revoke and delete copy** (answers from counsel, UX-26):

- AI revoke (`src/features/profile/ai-consent-card.tsx`): after `Revoke`, the sheet says `AI features are off. We’ve
stopped sending your data to Groq and Cloudflare. Data they already received is deleted by them within {n} days under
our agreements with them.` (placeholder `{n}` filled from the DPAs; if a provider keeps no data, say so).
- Delete account (`src/features/profile/account-data-card.tsx`): the sheet adds `Your premium plan ends now — there’s
nothing to cancel during the beta.` and the same provider sentence.

**5. A real export.** `Download my data` produces a named file `chefer-export-YYYY-MM-DD.json` containing everything
today's export has **plus** the consent log, email preferences, AI call log (what was sent, when, to which provider —
no model output), shopping lists and pantry. Delivery: the OS share sheet with the **file** (so it can be saved to
Files/Drive), then snackbar `Your export is ready.` **Native note:** sharing a file needs `expo-file-system` +
`expo-sharing` → ship in the same native release as UX-12. Until then (OTA): the share sheet gets a title
`chefer-export-YYYY-MM-DD.json`, the missing sections, and the confirmation snackbar.

#### Copy

| Key             | Copy                                                                                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sign-up         | `I agree to the Terms and the Privacy Policy` · `I’m 16 or older` · `Read: Terms · Privacy Policy` · errors `Please agree to the Terms and Privacy Policy.` · `Please confirm you’re 16 or older.`                           |
| emails          | `Emails` · per digest `{name}` / `{what it contains} · {day and time}` · existing-user card `We’ve changed how emails work: they’re now off unless you turn them on. Yours are still on.` / `Keep them on` / `Turn them off` |
| consent history | `Consent history` · rows `{what} · {date, time}`                                                                                                                                                                             |
| revoke          | `AI features are off. We’ve stopped sending your data to Groq and Cloudflare. Data they already received is deleted by them within {n} days under our agreements with them.`                                                 |
| delete          | `Your premium plan ends now — there’s nothing to cancel during the beta.` + the provider sentence                                                                                                                            |
| export          | `Download my data` · file `chefer-export-{YYYY-MM-DD}.json` · `Your export is ready.`                                                                                                                                        |

#### Components & files

**New:** `app/legal/[doc].tsx` (in-app WebView), `src/features/privacy/consent-history.tsx`,
`src/features/privacy/privacy-section.tsx` (Profile › Privacy & data, hosts UX-12's and UX-26's cards too).
**Change:** `app/(auth)/register.tsx`, `src/features/preferences/weekly-updates-card.tsx`,
`src/features/preferences/auto-plan-toggle.tsx` (default), `src/features/profile/ai-consent-card.tsx`,
`src/features/profile/account-data-card.tsx`, `app/profile.tsx`. **Needs (additive):** `ConsentEvent` log,
`privacy.getConsentHistory`, `auth.register` accepts `acceptedTermsVersion`, export additions; defaults for new
accounts (schema default change for new rows only).

#### Accessibility

Checkboxes are real checkboxes (`accessibilityRole="checkbox"`), each with its label; the in-app legal screen has a
title and a 44 pt close; consent history is a list.

#### Analytics

`consent_changed { kind: terms|ai|analytics|email|health, granted }` · `data_exported { }` — the event only; the
record lives in the DB.

#### Acceptance criteria

1. Registration cannot complete without ticking the Terms/Privacy box; the legal documents open in-app and closing
   them keeps the form's values.
2. A new account has both digests and the Sunday auto-plan off; existing accounts are unchanged and see the one-time
   card.
3. Granting then revoking AI consent leaves two entries in Consent history and in the export (bug B-53); **100 % of
   consent changes are logged** (stage 2 target).
4. The revoke and delete sheets contain the provider sentence (with counsel's numbers) and the premium sentence.
5. The export contains the consent log, email preferences, AI call log, shopping lists and pantry; after the native
   release it is shared as a file named `chefer-export-YYYY-MM-DD.json`.
6. A privacy/legal reviewer signs off the sign-up consent before release.

#### Edge cases

Re-accepting after a Terms update: a blocking but simple sheet on next launch (`We’ve updated our Terms` / what changed
in one line / `Agree` / `Read`), logged. Accounts created on web before this change get the same one-time re-accept.

#### Web parity

Web register form (`apps/web/src/features/auth/components/register-form.tsx`), weekly-email toggles
(`features/preferences/components/weekly-email-toggles.tsx`), `AiConsentCard.tsx`, `AccountDataCard.tsx` (web can
download a named file today), profile page: same checkboxes, defaults, consent history, revoke/delete copy and export
contents. Same PR group.

**Dependencies.** UX-26 (counsel answers, age gate), UX-12 (analytics switch logged here). **Protect:** D6, D14, D24.

---

## 4. Next specs

Lighter than Now: problem, story, design, key copy, files, acceptance, web parity, dependencies. They reuse the §2
patterns; agents should read the matching Now spec for shared components. Stage 2 buckets these for the quarter after
Now; several carry ⚖ decisions — the recommended option is designed.

<a id="ux-09"></a>

### UX-09 Batch-prep planner ("cook once, eat Mon–Thu")

**Problem & evidence.** 2/10 (P02, P08 partly), CI-11, D12. "This is a restaurant menu, not a meal-prep plan. I cook
lunch ONCE on Sunday" (P02); hand-built prep landed at mismatched portions; the Cook-once toggle is buried and not
persisted (bug B-27). Premium candidate (P02's "no-brainer").

**Story.** As a meal-prepper, I want one lunch cooked on Sunday and eaten Mon–Thu, as one recipe and one list line,
so that the plan matches my week.

**Design.** In the Plan settings sheet (UX-07) under `Options`: `Batch-cook` with two choices —
`Same lunch Mon–Thu` (premium) and `Cook once, eat twice (tonight’s dinner → tomorrow’s lunch)` (the existing D12
leftovers option, now persisted — bug B-27). With batch on:

- Each batch day's lunch card reads `Batch lunch · day {k} of 4` with a `layers-outline` glyph; tapping opens the recipe
  at ×4 (× people).
- The prep day (default Sunday, selectable `Prep on` Sat/Sun/Mon) gets a card on Today and in the day view:
  `Batch prep today: {recipe} × {n} portions · ~{min} min` → cook mode at the batch portion.
- The shopping list shows one line per ingredient for the batch (`Chicken thighs, 1.2 kg — batch lunch`).
- Replacing a batch lunch asks `Change all 4 batch lunches?` (`Change all 4` / `Just {day}`).
  Free users see the switch with a `lock` and the PAT-3 taste (`Meal prep for the week`).

**Copy.** `Batch-cook` · `Same lunch Mon–Thu` · `Cook once, eat twice (tonight’s dinner → tomorrow’s lunch)` ·
`Prep on` · `Batch lunch · day {k} of {n}` · `Batch prep today: {recipe} × {n} portions · ~{min} min` ·
`Change all {n} batch lunches?` · `Change all {n}` · `Just {day}` · lock job `Meal prep for the week`.

**Files.** `src/features/meal-plan/plan-settings-sheet.tsx`, `plan-meal-card.tsx`, `app/(food)/meal-plan.tsx`,
`app/(food)/shopping-list.tsx`, a `batch-prep` home card; needs (additive) `batch` in `mealPlan.generate` + plan slots
(`batchGroupId`, `batchDay`).

**Acceptance.** (1) With batch on, Mon–Thu lunches are the same recipe, each marked with its day index; the list has
one aggregated line per ingredient sized ×4; (2) the prep card appears on the prep day and opens cook mode at ×4;
(3) the leftovers toggle survives a cold start (bug B-27); (4) replacing one batch lunch offers all/just-one.

**Web parity.** Web meal-plan day view + `GenerateOverlay.tsx` options; same PR group. **Dependencies.** UX-07, UX-10
(taste). **Validate.** Batch lunch vs leftovers as distinct jobs (stage 1 §8 #2).

<a id="ux-11-next"></a>

### UX-11 — moved to Now

Moved up to Now in the final strategy (rev 3). The full spec is [UX-11 in §3](#ux-11); its "may trail" part (§6 there)
is the remainder that used to live here.

<a id="ux-14"></a>

### UX-14 A list that doesn't create waste

**Problem & evidence.** 3/10 (P02, P04, P08), CI-22. 71–87 lines for one or two people; 0.8 lemon, 3.5 g rosemary;
near-duplicates; six cheeses in 20–150 g ([P08 produce](../screenshots/P08/035-produce2.png),
[P08 dairy](../screenshots/P08/047-dairy.png)); household portions rounded up (`household.ts` L13–17).

> "Nobody sells 0.8 of a lemon." · "That's a fridge full of half-open packets." (P08)

**Story.** As a waste-averse cook, I want the list in amounts I can buy and with duplicates merged, so that I don't
bring home things I'll throw away.

**Design.**

- **Buyable amounts:** each line shows what to buy (`4 lemons`, `1 small bunch rosemary`, `1 tub Greek yogurt (500 g)`)
  with a muted second line `Recipes need 3.3` when it differs. A header toggle `Exact amounts` switches to recipe
  quantities.
- **Merged lines:** synonyms combine (`Lemons, 4 — incl. 2 tbsp juice`), expandable to show which recipes use it.
- **Honest portions:** households list `For 3¼ portions` instead of rounding up to 4 (P04 3.25 → 4).
- **Fewer one-off items (engine, premium and curated):** plans prefer recipes that share ingredients; the list header
  says `This week reuses 9 ingredients across recipes`.
- **Have it:** with UX-15, lines covered by the kitchen move to a collapsed `Already in your kitchen ({n})` group.

**Files.** `app/(food)/shopping-list.tsx`, `packages/utils/src/household.ts`, a shared `packages/utils/src/buyable.ts`
(pack sizes, rounding, synonyms); engine work in stage 4.

**Acceptance.** (1) No line shows a fractional count of a countable item or < 5 g of a herb/spice; (2) lemon + lemon
juice + lime juice → at most two lines; (3) a table of 1 + ¾ + ½ + 1 lists `For 3¼ portions`; (4) the list for P08's
two-person curated week is ≤ 50 lines (fixture test); (5) `Exact amounts` restores recipe quantities.

**Web parity.** Web shopping list page + `ShopSegments.tsx`; shared helpers; same PR group.
**Dependencies.** UX-07 (fewer planned meals already shrinks the list); UX-15 for "have it". **Protect:** D9.

<a id="ux-15"></a>

### UX-15 Use-it-up pantry (free entry, dates, "use soon") ⚖

**Problem & evidence.** 2/10 (P08, P05), Sev 4 for P08 (CI-25, J2). The free kitchen can't be written
([P08](../screenshots/P08/022-kitchen.png)); no dates ("bought today" on a week-old cabbage); cooking deducts nothing;
the list asks to re-buy half a cabbage ([P08](../screenshots/P08/095-tobuy-premium2.png)).

> "This isn't a pantry, it's a receipt." · "Four half-cabbages? I told you I HAVE half a cabbage." (P08)

**Story.** As someone who hates throwing food away, I want to type what's in my fridge with a rough use-by, and have
Chefer tell me what to cook first, so that nothing goes off.

**⚖ D-2 (recommended):** manual entry, edit, remove and use-by are **free**; premium keeps `Plan my week around my
kitchen`. Alternative: entry stays premium with a 5-item free taste; the lock sits on the 6th item.

**Design.** `In my kitchen` (`src/features/pantry/pantry-panel.tsx`, `app/(food)/shopping-list.tsx` kitchen segment):

- `+ Add what you have` field with natural-language parsing (reuse `parse-custom-item.ts`: `half a cabbage`,
  `6 eggs`, `paneer 225 g` — unit defaults sensibly, fixes bug B-32) and a use-by chip row on each new item:
  `Use today` · `This week` · `Later` (default `This week`).
- The list is grouped `Use soon` (today / ≤ 2 days) · `This week` · `Later`; each row: name, amount, use-by chip,
  swipe or `⋯` for `Used it` / `Threw it away` / `Edit` / `Remove` (the used/wasted split feeds itemised savings, UX-11).
- Home card `use-soon` (UX-04, evening slot): `Use soon: courgettes, half a cabbage` / `Find a recipe` (free: cookbook
  recipes that use them, filtered by UX-01) / premium `Plan around them`.
- Cooking a planned recipe from cook mode offers `Take these out of your kitchen?` with the matched items ticked.
- AI Chef "what can I make" gets a tap-through on each result (D19).

**Copy.** `Add what you have` · `Use today` · `This week` · `Later` · `Use soon` · `Used it` · `Threw it away` ·
`Edit` · `Remove` · `Use soon: {items}` · `Find a recipe` · `Plan around them` · `Take these out of your kitchen?`.

**Files.** `src/features/pantry/*`, `app/(food)/shopping-list.tsx`, `app/cook/[id].tsx`, dashboard `use-soon` card;
needs (additive): `useBy` on pantry items, free `pantry.addItem/removeItem/update` (router tier change), deduction.

**Acceptance.** (1) A free user can add `half a cabbage` with `This week`, edit it and remove it; (2) items sort by
use-by; (3) the Today card appears in the evening when ≥ 1 item is `Use soon`; (4) finishing cook mode offers the
deduction; (5) `Find a recipe` results pass the safety filter.

**Web parity.** Web `features/pantry/components/PantryPanel.tsx`, `PantryUsageBanner.tsx`, pantry page; same PR group.
**Dependencies.** UX-01, UX-04 cards, UX-14. **Validate first:** V6 concierge test (will people enter dates?).

<a id="ux-16"></a>

### UX-16 Budget-true weeks in my money ⚖

**Problem & evidence.** 3/10 (P01, P03, P08), CI-16, J4. Budget is premium, silently not saved on free (bug B-10,
fixed by UX-10), and a premium week went over it with no signal
([P03 $69.79 vs $60](../screenshots/P03/089-regen-budget.png)). Currency ships in UX-03.

> "I literally told it 60. It says 69." (P03)

**Story.** As a student on a budget, I want to set a weekly amount in my money and see if the week fits, so that I
can plan without a spreadsheet.

**⚖ D-2 (recommended):** saving the budget, seeing the week vs budget, the over-budget flag, per-recipe cost and a
`Cheap` filter are **free**; premium = `Make my week fit the budget` (budget-optimised generation). Alternative:
all budget stays premium; free shows the read-only field (UX-10) and a per-recipe cost only.

**Design.**

- `Weekly food budget (optional)` in How you cook (UX-07), in the user's currency.
- Plan cost row (UX-08) gains a bar and label: `≈ 250–300 lei of your 300 lei budget` (bar emerald under, amber over).
- Over budget: amber row `About 40 lei over your budget` + `See cheaper swaps` (free: the 3 priciest meals with cheaper
  safe alternatives in the Replace sheet, sorted by cost) + premium `Fit my week to the budget`.
- Meal cards and Replace rows show `~{n} lei a portion`; Discover gets a `Cheap` filter chip (bottom third of cost per
  portion in the pool).

**Copy.** `Weekly food budget (optional)` · `≈ {range} of your {budget} budget` · `About {n} over your budget` ·
`See cheaper swaps` · `Fit my week to the budget` · `~{n} a portion` · `Cheap`.

**Files.** `app/preferences.tsx` / How you cook form, `app/(food)/meal-plan.tsx`, `recipe-picker-sheet.tsx`,
`plan-meal-card.tsx`, `app/(food)/recipes.tsx`; needs (additive): free `updateTargets` for the budget field only;
per-recipe cost on payloads.

**Acceptance.** (1) A free user saves 60 USD and sees it after relaunch; (2) a week above budget shows the amber row
and working cheaper swaps; (3) per-portion cost shows on cards; (4) all money uses the chosen currency and the range
format (UX-08).

**Web parity.** Web preferences form (budget), meal-plan page, `ReplaceMealSheet.tsx`, recipes page filter; same PR
group. **Dependencies.** UX-03 (currency), UX-07, UX-08, UX-10. **Validate.** V5 (real prices) before any "fits your
budget" marketing; real AI budget adherence is untested (mock).

<a id="ux-17"></a>

### UX-17 Import that respects the collector ⚖

**Problem & evidence.** 3/10 (P05, P08, P10), CI-33, CI-02, CI-08, D7, D25. When an import can't be adapted to the
diet, the primary button is `Save original recipe` and restrictions are named as ingredients ("could not fully remove:
vegan, gluten-free") — bug B-51 (P10); the refusal itself is right and must be protected (D25). The Link tab fails on YouTube with `page is too large
(over 1 MB)` ([P08](../screenshots/P08/064-importing.png), bug B-17 red LogBox); link/text previews lead with a calorie
banner and show no ingredients before saving ([P05](../screenshots/P05/024-link-preview.png)); save is silent; the
source link is lost. The video draft is loved (D7).

> "Show me what you understood and let me fix it. Why only for videos?" (P05)

**Story.** As a collector, I want every import to show me what Chefer understood and let me fix it before saving, so
that my cookbook is right.

**⚖ D-6 (recommended if stage 4 confirms no model call is needed):** links with schema.org Recipe data import free (no
AI); video, text and Cheferize stay premium.

**Design.** `app/import-recipe.tsx`, `src/features/recipes/video-draft-form.tsx`:

- **One review draft for every type** (the D7 form): title, servings (from the source, never forced to 1), ingredients,
  steps, `Please check` flags, `What we guessed`; the calorie-discrepancy banner moves below the ingredients as a
  one-line note with Explain.
- **Link tab routes video URLs:** pasting `youtu.be/…` shows inline `That’s a video — we’ll import it from the video.`
  and runs the video flow; the typed URL is kept when switching tabs.
- **Plain errors:** `We couldn’t read that page. Try pasting the recipe text instead.` (no sizes, no codes; no red
  LogBox for expected failures).
- **Source kept:** recipe detail shows `From {domain}` + `Open original`.
- **Saved confirmation** (UX-21.2) and simple tags (`Weeknight`, `Batch`, `Guests`, own tags).
- **A safe primary action on unsafe imports** (bug B-51, protect D25): when the draft can't be adapted to the table's
  rules, the banner reads `This recipe contains {eggs, wheat flour and honey}, which don’t fit your table.` (the
  **ingredients**, never the rule names), the primary button becomes `Find a similar recipe that fits` (searches the
  filtered pool by title keywords) and the secondary `Save for someone else` saves it with the conflict banner and never
  auto-plans it; `Save original recipe` as a primary action is removed.

**Copy.** `Please check` · `What we guessed` · `That’s a video — we’ll import it from the video.` ·
`We couldn’t read that page. Try pasting the recipe text instead.` · `From {domain}` · `Open original`. · `This recipe contains {ingredients}, which don’t fit your table.` · `Find a similar recipe that fits` ·
`Save for someone else`.

**Files.** `app/import-recipe.tsx`, `src/features/recipes/video-draft-form.tsx` (generalised to `import-draft-form.tsx`),
`app/recipe/[id].tsx`, `src/lib/trpc-links.ts` (don't log expected errors as console.error); needs (additive):
`sourceUrl` on recipes, preview payloads with ingredients/steps for link/text.

**Acceptance.** (1) Link, text and video imports all end in the editable draft; (2) a YouTube URL in the Link tab
imports as video; (3) no user-facing error mentions size or status codes; no red LogBox on expected failures;
(4) imported recipes show their source and appear in All (UX-21.2); (5) under D-6 = yes, a schema.org link imports on
free without an AI call (API test); (6) an import that can't be adapted names the conflicting **ingredients**, offers
`Find a similar recipe that fits` as the primary action, and never shows `Save original recipe` as primary (bug B-51).

**Web parity.** Web `features/recipes/components/ImportRecipeSheet.tsx`, `VideoDraftForm.tsx`; same PR group.
**Dependencies.** UX-10 (lock placement), UX-01 (draft safety check), UX-21.2.

<a id="ux-18"></a>

### UX-18 Cookbook findability and Romanian staples

**Problem & evidence.** 6/10 (CI-08, CI-37). A no-match search on All shows `No recipes yet`
([P08 cabbage](../screenshots/P08/055-search-cabbage.png), bug B-12); search persists across tabs so Mine says
`arrives on mobile soon` beside a working `+ New` ([P05](../screenshots/P05/095-s2-fav-tap.png)); search is literal
(pasta ≠ spaghetti); no ≤ 15 min / cheap / beginner filters; no cabbage or pork dishes; cook-mode steps lack quantities
and doneness cues ([P03](../screenshots/P03/063-cook-step3.png)).

> "No cabbage, no pork — the two things every Romanian kitchen has." (P08)

**Story.** As a Romanian home cook, I want to find a quick cabbage dish by typing "varză" or "cabbage", so that the
cookbook feels like my kitchen.

**Design** (`app/(food)/recipes.tsx` L220–221, L346–355):

- Empty states by cause: no match → `No recipes match “{q}”` / `Try a shorter word, or search all recipes.` /
  `Search Discover`; empty Mine → `No recipes of your own yet` / `Add one or import from a link.` / `+ New recipe`,
  `Import` (the "arrives on mobile soon" text is removed).
- Search shows its scope (`Searching “pasta” in All`) and clears on tab change unless the user taps `Search all tabs`.
- Synonyms and Romanian names (`pasta ↔ spaghetti, penne`; `varză ↔ cabbage`; `ciorbă ↔ soup`), shared list.
- Filter chips on Discover: `≤ 15 min` · `≤ 30 min` · `Cheap` (UX-16) · `Beginner` · meal type.
- **Content:** Romanian staples in the curated pool (cabbage, pork, _telemea_, _ciorbă_, _sarmale_-style, _mămăligă_),
  with real photos (fixes bug B-30 stock photos) — a content task with a dietitian/cook review, tagged for the safety
  filter.
- Cook mode: steps repeat the quantity (`Add 200 g spinach`) and carry doneness cues (`until the edges turn golden,
about 4 min`) — a content pass on curated steps; the step component bolds quantities.

**Acceptance.** (1) A no-match search never shows the first-run empty state; (2) `varză` finds cabbage recipes;
(3) `≤ 15 min` shows only recipes with total time ≤ 15; (4) ≥ 12 Romanian-staple recipes are in the pool and pass the
safety regression suite; (5) Mine never shows "arrives on mobile soon".

**Web parity.** Web recipes page + cook mode (`cook-mode.tsx`); shared synonyms and content. **Dependencies.** UX-16
for `Cheap`. **Protect:** D10.

<a id="ux-19-next"></a>

### UX-19 — moved to Now

Moved up to Now in the final strategy (rev 2) and rescoped to "Log fast, fix mistakes". The full spec is
[UX-19 in §3](#ux-19).

<a id="ux-20"></a>

### UX-20 Your goal and your progress ⚖ _(rescoped: own targets moved to UX-35)_

**Problem & evidence.** 4/10 (CI-29 3/10, CI-53 2/10; P02, P06, P07, P09), CI-21, CI-36. No goal weight or pace; Progress
is food-only with no goal line ([P06](../screenshots/P06/101-s2-progress-2.png), [P02](../screenshots/P02/096-progress.png));
P07 wanted weekly adherence ("days in range, weekly average", P07-M34); body weight lives in three places — Food
Progress, Gym Stats and the profile ([P09 Food](../screenshots/P09/094-sweep-progress.png),
[P09 Gym](../screenshots/P09/049-stats-4.png), CI-53). **Own kcal/protein targets and the recomp/performance goals moved
to UX-35 (Now).**

> "There's no line for where I'm meant to get to." (P06) · "I want one screen: Mon lunch, Mon gym, Mon dinner." (P02)

**Story.** As someone going from 102 to 92 kg, I want to set that goal, see my trend and a line toward it, how many
days I was on target this week, and my workouts next to my food, so that I know how I'm doing.

**⚖ D-2 (recommended):** goal weight and pace are **free** (deterministic). Alternative: premium, with the goal line
shown as a taste.

**Design.**

- Goal & body (`goal-body-card.tsx`, `goal-step.tsx`): `Goal weight (optional)` + `Pace` (`Gentle` · `Steady` ·
  `Faster`, each with its kg/week), with the UX-22 disclaimer; hidden for `Fuel my training` and `Just good food`.
- **One body weight** (CI-53, S slice): a single weigh-in store read and written by Food Progress, Gym Stats
  (bodyweight overlay) and the profile; entering it anywhere updates all three, and the profile's `weightKg` becomes the
  latest weigh-in. (Health sync stays Later, UX-38.)
- Progress (`app/progress.tsx`): weight **trend** (7-day moving average over the raw points) with a dashed goal line
  (`Goal 92 kg`) and start marker (`Started 102 kg · 1 Sep`), headline `−1.4 kg since 1 Sep`; **weekly adherence**
  (`4 of 7 days within ±10 % of your target · weekly average 1,980 kcal`); a `Training` section with sessions per week
  and recent PRs; a combined week list (`Mon · lunch ✓ · Upper A ✓ · dinner ✓`) for Train + food users; UX-11
  percentage rules (none from < 3 logged days).

**Copy.** `Goal weight (optional)` · `Pace` · `Gentle` · `Steady` · `Faster` · `Goal {w}` · `Started {w} · {date}` ·
`{±x} since {date}` · `{n} of 7 days within ±10 % of your target` · `weekly average {kcal} kcal` · `Training`.

**Files.** `goal-body-card.tsx`, `goal-step.tsx`, `app/progress.tsx`, `src/features/coach/weight-card.tsx`,
`src/features/gym/stats/log-weight-prompt.tsx` + `strength-trend-view.tsx` (shared weight); needs (additive):
`targetWeightKg`, `pace` on `ChefProfile` (`schema.prisma` L205–234); one weigh-in source for gym and food; adherence
and workouts summary on the progress payload.

**Acceptance.** (1) A free user sets goal weight 92 kg and sees the goal line and trend; (2) a weigh-in logged in Gym
Stats appears in Food Progress and Preferences, and vice versa; (3) Progress shows weekly adherence and sessions per
week for gym users; (4) no percentage from < 3 days (UX-11).

**Web parity.** Web progress page, preferences form, onboarding `step-goal.tsx`, web gym stats; same PR group.
**Dependencies.** UX-35, UX-11, UX-22. ⚖ D-2, D-12.

<a id="ux-28"></a>

### UX-28 Reverse trial of the deterministic premium ⚖

**Problem & evidence.** 8/10 upgraded, every time because it was free (CI-02, CI-12); in the beta a lock costs activation and
yields no pricing data. Stage 2 §5.5, D-4. Needs UX-12 to compare cohorts.

**Story.** As a new user, I want to try the planning features that save me time before deciding, and be told
plainly what I keep and lose when the trial ends.

**Design (⚖ D-4 recommended: yes).**

- New accounts get the deterministic premium features (household scaling, budget-/pantry-/training-fit curated weeks,
  auto-week, batch-prep) for 14 days; AI stays quota-gated.
- Profile › Plan & Premium: `Premium trial · {n} days left` with the `What you have` list; a small pill on Plan's
  header `Trial` (tap → the same).
- Day 11: a Today card (not a push) `Your trial ends {weekday}` / `Here’s what you’ll keep and what changes.` →
  the keep/lose summary (UX-10 §4) with `Keep Premium (free during the beta)` / `Go back to Free`.
- **Disclosed price-intent step** (only once pricing is being tested, V4): `Premium will cost about {price} a month
after the beta. Would you keep it?` · `Yes, I’d keep it` · `No` · `Not sure` · footnote `This is a question, not a
purchase. Nothing is charged.`
- End of trial with no choice → Free, with the snackbar `Your trial ended. Everything you made is still here.`

**Files.** `app/profile.tsx`, `src/features/premium/*`, dashboard card, Plan header pill; needs (additive):
`trialEndsAt` on the user, tier resolution with trial.

**Acceptance.** (1) A new account has trial features for exactly 14 local days; (2) the day-11 card shows the correct
keep/lose list; (3) ending the trial never deletes data; (4) `trial_started` / `trial_ended { kept }` and
`price_intent_answered` fire (after UX-12).

**Web parity.** Web profile + `/premium`; same PR group. **Dependencies.** UX-10, UX-12, ⚖ D-4.

<a id="ux-23"></a>

### UX-23 Dark mode and large-text polish _(moved up from Later to Next)_

**Problem & evidence.** 2/10 (CI-46: P02 on iOS, P07 on Android — every Snap flips light → dark system sheet →
light), CI-43 (3/10, dense rows truncate), CI-14. No dark support at all: `app.config.js` sets
`userInterfaceStyle: 'automatic'` while content is hard-coded light ([P02](../screenshots/P02/002-login-screen.png)).
Both personas are polish-sensitive and premium-inclined; 80 % of Romanian mobile traffic is Android. Next rather than
Later because a token pass costs less before UX-35, UX-36 and UX-19 add screens (P12 already keeps new work clean).

**Story.** As someone whose phone is dark all evening, I want Chefer to follow it, so that opening it at night doesn't
blind me.

**Design.** A token flip, not a redesign:

- Dark values for every CSS variable in `apps/mobile/global.css` — warm near-black background, cards one step lighter,
  borders low-contrast warm grey, `--primary` lifted to a lighter brown for text and icons on dark (≥ 4.5:1),
  destructive/amber/emerald re-tuned for dark (≥ 4.5:1 text, ≥ 3:1 icons); mirrored in
  `packages/ui-mobile/src/components/theme.ts` as `colors.dark` for SVG/charts/icons, selected with `useColorScheme()`.
- `StatusBar style="auto"` (`app/_layout.tsx`); NativeWind `darkMode: 'media'`.
- Replace hard-coded `text-gray-*`, `bg-white`, `bg-gray-50`, hex literals and `#944a00` icon colours screen by screen
  (grep list generated in stage 4); charts use `chartPalette` dark variants.
- Photos: a 6 % black scrim on recipe images in dark; the Snap result and cook mode stay readable.
- Settings › You gets `Appearance: System · Light · Dark` (default System).
- Large text: finish the CI-43 pass on any dense row not already fixed by UX-05 C and UX-21.13.

**Acceptance.** (1) Every screen follows the system scheme with no white cards on black (Maestro screenshots in both
schemes, iOS and Pixel_8); (2) all text passes 4.5:1 in both schemes (automated contrast check on tokens);
(3) no hard-coded colour remains in `apps/mobile` outside `theme.ts` (lint); (4) the Appearance override works and
persists; (5) no dense row truncates at 1.8× text on a 375 pt screen.

**Web parity.** Web has its own theme; new web components from this study already use tokens. No change beyond
parity of new components.

**Dependencies.** P12 (new work token-clean). Best scheduled before N-waves add screens.

<a id="ux-37"></a>

### UX-37 Correctable snap-to-log _(new, Next)_

**Problem & evidence.** 1/10 (CI-47, Sev 3: P07), CI-02, D21. The ~3 s estimate with a stated portion is praised
("dressing included"), but the card offers only meal chips, Discard and Log: no portion, no macro edit, no item list, no
"not this, it's salmon"; `CONFIDENT` is unexplained ([P07](../screenshots/P07/069-snap-result.png)); a wrong dish can
only be discarded ([P07](../screenshots/P07/095-s2-discarded.png)); camera-denied is a dead end (fixed in UX-21.16).
With UX-19's edit, a logged scan becomes fixable; this spec fixes it **before** logging. The wrong dish is mock; the
missing correction path is real. It is the one AI feature any persona said she'd pay for.

> "If it's wrong I can only throw it away. So I'm back to guessing." · "'Confident' based on what?" (P07)

**Story.** As someone who eats out, I want to correct the photo estimate — bigger portion, no dressing, it's salmon —
before logging, so that the number is right without typing it all.

**Design** (`src/features/tracker/scan-meal-card.tsx`, result state):

```
┌ [photo thumb]  Caesar salad with grilled chicken ┐
│ About 430 kcal · 32 g P · 18 g C · 26 g F         │
│ Assumed: restaurant side plate, dressing included │
│ How sure: fairly sure ⓘ                           │
│ Portion  ( Smaller | As shown ✓ | Bigger )        │
│ In it    Chicken ✓  Romaine ✓  Dressing ✓  + Add  │
│ Not this? [ It’s actually…            ] Re-check  │
│ ( Breakfast | Lunch | Dinner | Snack )            │
│ [ Discard ]              [ Log 430 kcal ]         │
└───────────────────────────────────────────────────┘
```

- Portion chips scale deterministically (0.75× / 1× / 1.5×; no AI call); unticking an item subtracts its estimated
  share; `+ Add` opens the UX-19 search to add an item.
- `Not this?` sends a one-line correction and re-estimates **within the daily scan quota** (the counter shows
  `1 re-check left today` when relevant).
- Confidence in words with an Explain sheet (`Fairly sure: the dish is clear in the photo, but portion size is a
guess.`), never a bare `CONFIDENT`.
- The logged entry keeps the photo thumbnail and stays editable (UX-19).
- Free users keep the UX-10 §7 taste.

**Copy.** `About {kcal} kcal` · `Assumed: {assumption}` · `How sure: {very sure | fairly sure | a rough guess}` ·
`Portion` `Smaller` `As shown` `Bigger` · `In it` · `+ Add` · `Not this?` · `It’s actually…` · `Re-check` ·
`{n} re-check left today` · `Log {kcal} kcal`.

**Files.** `scan-meal-card.tsx`, `app/tracker.tsx` (thumbnail on entries), `packages/utils` (portion scaling); needs
(additive): scan result returns items with kcal shares and a confidence reason; `tracker.rescan({ correction })` within
`mealScansPerDay`.

**Acceptance.** (1) `Bigger` scales every macro by 1.5× before logging with no network call; (2) unticking `Dressing`
lowers the estimate by its share; (3) `It’s actually salmon` triggers one re-estimate and counts against the quota;
(4) the confidence label is words with an Explain sheet; (5) logged scans show a thumbnail and open in UX-19's editor.

**Web parity.** Web `features/tracker/components/ScanMealButton.tsx`; same PR group. **Dependencies.** UX-19 (editor,
search), UX-10 (taste), UX-21.15–16. **Validate.** Real-AI accuracy on 20 weighed restaurant plates; which corrections
people reach for.

---

## 5. Later

<a id="ux-23-later"></a>
**UX-23 — moved to Next** (final strategy rev 2); see [UX-23 in §4](#ux-23).

<a id="ux-38"></a>
**UX-38 Apple Health / Health Connect sync ⚖ (new, Later).** Nothing syncs with Apple Health and body weight lives in
three places (CI-53, 2/10: P09 asked for it; P06 had two weights). The cheap half — **one body weight** shared by Food
Progress, Gym Stats and the profile — moves into UX-20 (Next). Full sync stays Later because wearables and health sync
are out of scope in `gym_plan.md` (⚖ D-12) and it adds health-data processing to the DPIA (UX-26). When reopened:
Settings › Training days & reminders › `Connect Apple Health` / `Connect Health Connect` with per-type toggles
(`Weight — read and write`, `Workouts — write`), each asked with the OS permission sheet and a Chefer rationale screen
first (`Chefer reads your weight so every screen shows the same number, and saves your workouts so your health app has
them. Nothing else.`), a consent-log entry (UX-39), and a `Disconnect` that states what stays in the health app. Needs
native modules (native release); run days (UX-06) could later be read from workouts instead of typed.

<a id="ux-24"></a>
**UX-24 Romanian UI (validate in Next, build Later).** No global competitor offers a Romanian UI, and Chefer's home
market is Romania, but the synthetic personas were comfortable in English (weak evidence, CI-24). Next = the V8 test
(Play store-listing experiment RO vs EN + 5 interviews with RO users 45+). Build only on signal. The design work is
already being paid for: P12 puts every new string in `copy.ts` modules and the shared ones in `@chefer/utils`, dates and
numbers come from `Intl`, and the recogniser (UX-01) and conditions list (UX-22) include Romanian terms. When built:
a language row in Settings › You (`Language: English · Română`), RO copy reviewed by a native writer (tone: `tu`,
warm), and the store listing in RO first.

<a id="ux-27"></a>
**UX-27 Household co-access.** The partner signs in to the same household, plan and list (CI-17, CI-41; P04: "Mihai
not being able to use it — then I'm back to Keep"). UX-13's share is the stop-gap. When built: `Invite {name} to your
table` on a member card → a share link (OS share sheet) → the partner creates an account and lands on the shared Plan
and list with a `Shared with {owner}` header; live ticking on the list (who ticked shows as initials on the row);
roles are equal except billing; `Leave this table` in Settings. XL across identity, sharing and permissions (stage 4);
unlocks the household plan packaging (stage 2 §5.6).

---

## 6. Don't and Stop

**Don't**

- **B-29 — Don't race MyFitnessPal on a food database or barcode.** No barcode scanner, no branded-food search; UX-19
  answers the job with recents, plan, own recipes and Chefer's ingredient catalogue.
- **B-30 — Don't build medical or diabetes features or claims.** No condition chips, condition plans, "suitable for
  diabetics" tags or glucose features; UX-22 is the ceiling.

**Stop (remove or hide now; each lands with the named spec, and B-34 ships first as a hotfix)**

- **B-31 — Calorie ring as everyone's home (kept for users who chose tracking).** Hide `NutritionSummary`,
  `WeightCard`, `Complete your profile` and `Snap to log` on Food Today unless the user chose `Track what I eat`, has a
  numeric goal, or turned on `Show calories and macros on Today`; for trackers the ring stays first (D20); drop
  `…so your nutrition stays honest` from cook-mode finish for them (`app/(food)/index.tsx`, `app/cook/[id].tsx`;
  interim hotfix in W0-C, full design in UX-04).
- **B-32 — "AI meal plans tailored to you" as the premium headline; the 4-meal AI default.** Remove the phrase and
  `nutrition profile` from `app/profile.tsx` and every pitch (UX-10); AI generation uses the user's plan shape (UX-07),
  never a default 4th meal. (Final evidence: the one persona who upgraded for AI plans got a week 400–700 kcal under
  target with nothing saying what improved — UX-10 §8 and UX-11 §3 make that visible.)
- **B-33 — Unitemised savings and precise-looking prices.** Remove the `Saved ~{n}` chip from Shop and the pantry panel
  until UX-11 itemises it; render every total as a rounded range with coverage (UX-08 §7).
- **B-34 — Unfiltered "what can I make" and Replace picker (hotfix, ship first).** Verified Sev-4 exposure: the Replace
  picker has **no** safety filter (`replaceRecipe` checks visibility only, bug B-46). Run `PantryService.whatCanIMake`
  and the picker's list through the existing `filterSafeRecipes` server-side, make `replaceRecipe` reject a recipe that
  fails it, and have the sheet hide recipes whose `allergenWarnings` is non-empty — before UX-01's full filter lands.

---

## 7. Agent work packaging

_(Rebuilt for the final Now set of 20 items. The interim packaging is superseded; see Appendix B.)_

### 7.1 Principles

- **Lanes own files, not tickets.** A lane is one agent in one worktree; within a wave no two lanes edit the same file.
  When a later spec needs a file an earlier lane owned, it runs in a later wave. The ownership map (§7.3) is binding.
- **Web parity travels with its lane** (CLAUDE.md "Platform Parity"): each lane also owns the web files named in its
  specs' Web parity notes and ships both in the same PR group; it adds any `mobile_parity_backlog.md` reverse entries its
  specs call for (UX-04 landing, UX-05/UX-36 gym screens not yet on web).
- **Shared-first:** pure logic and copy go to `@chefer/types` / `@chefer/utils` in wave 0 so every lane and both
  platforms build on the same contracts.
- **OTA vs native:** everything is JavaScript and ships over OTA **except** (a) UX-12's PostHog RN SDK and (b) UX-39's
  file export (`expo-file-system` + `expo-sharing`). Both go into **one native release** in wave 4; until then their JS
  runs behind a no-op (analytics) or the OTA fallback (export as titled text). UX-38 (Later) and the native
  date/time picker alternative (PAT-10) would also need native releases.
- **Build order** follows stage 2 §6.1: B-34 and B-31 (hours) → B-01 → the B-13 data bug → B-25 → B-12 → B-36's gym
  settings entry → B-35 + B-11's "no silent change" → B-03 → B-05 → B-19 → B-02 → B-39 → B-04 → B-36's rest → B-06 →
  B-10 → B-07 → B-11's rest → B-13 (share) → B-22 → B-26 (legal in parallel from day one; deadline 9 Dec 2026).
  The waves below respect it: everything early in that order is in wave 0 or 1.
- **If capacity forces a cut** (stage 2): cut UX-13 first, then UX-04's Tonight card (keep the gym landing), then
  UX-36 (6) time-boxed sessions, then UX-07's time cap, then UX-11 beyond targets (keep notices and tappable targets).
  **Never cut** UX-01, UX-02, UX-22, UX-26, UX-39 or UX-35.
- **Sizes:** S ≈ 1–2 agent-days, M ≈ 3–5, L ≈ 6–10 (relative; stage 4 re-estimates).
- **Verification ladder per lane:** typecheck → lint (incl. the safety-copy lint and the forbidden-phrases lint:
  B-32 phrases, medical claims, "missed") → Jest/Vitest (every new pure function) → contract tests for new/changed
  procedures → `expo export` → Maestro on iOS **and** Android `Pixel_8` → Playwright mobile sweep for web changes
  (`cd tests && pnpm exec playwright test --project=mobile`) → the lane's acceptance criteria checked in the PR.

### 7.2 Waves and lanes

```
Wave 0  Foundations ───────────┐  W0-A kit & patterns · W0-B contracts + nav · W0-C hotfixes (B-34, B-13 data bug, B-31 interim, bug B-10)
                               │  (legal/counsel track for UX-26/UX-39 starts here and runs throughout — owner)
Wave 1  Six parallel lanes ────┤  L-SAFE · L-GYM · L-PLAN · L-ENTRY · L-TRACK · L-DATA
Wave 2  Four parallel lanes ───┤  L-HOME · L-MONEY · L-SAFE2 · L-GYM (cont.)
Wave 3  Two parallel lanes ────┤  L-PLAN2 · L-CONSENT
Wave 4  Integrate & verify ────┘  full ladder, one native release (UX-12 SDK + UX-39 file export), listing + screenshots, counsel sign-off
```

| Wave | Lane                     | Specs (parts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Size | Starts after                     |
| ---- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------- |
| 0    | **W0-A Kit & patterns**  | PAT-1 ExplainSheet (+ gym WhySheet refactor), PAT-4 Snackbar + host, PAT-5 ConfirmSheet options, PAT-10 TimePicker, `ChipGroup` hints/disabled, PAT-7 GlossaryTerm + `glossary.ts`, PAT-14 ChangeNoticeCard shell, PAT-3 LockedFeatureCard + PremiumSheet shells (UI only), safety-copy and forbidden-phrases lints                                                                                                                                                                                                                                         | M    | —                                |
| 0    | **W0-B Contracts & nav** | Shared pure modules + tests: `safety-taxonomy.ts` (incl. hidden-gluten and label-dependent lists, conditions), `safety-recognise.ts`, `ONBOARDING_JOBS` (incl. TRACK), `analytics-events.ts`, `landing.ts`, `home-cards.ts`, `week-default.ts`, `price-range.ts`, `plan-shape.ts`, `premium-pitch.ts`, `share-list.ts`, `protein-snacks.ts`, `wellness-copy.ts`, `explain-targets.ts`, `meal-slot.ts`, training-day kinds, carry-over/short-version types; PAT-9 route-derived pill + gear + `app/settings.tsx` hub shell (UX-21.4, UX-36 (1) entry points) | M    | —                                |
| 0    | **W0-C Hotfixes**        | B-34 (Replace picker + `whatCanIMake` through `filterSafeRecipes`, `replaceRecipe` rejects unsafe — bug B-46); **B-13 data bug** (plan-for-now by `weekStartDate` in Plan, Shop, Today + regression test + `plan_shown`, UX-08 §0); B-31 interim (hide ring/weight/nudge for users without a goal or tracking); bug B-10 (budget read-only on free)                                                                                                                                                                                                         | S–M  | —                                |
| 1    | **L-SAFE**               | UX-01 (a, b, d, e, f; c for Discover, import preview, cook mode), UX-02 components + recipe detail / cook / household read-back + `FilteredForLine` on Discover + label caveats, UX-21.2, 21.6, 21.7, 21.18, UX-04 §8 cook-finish copy                                                                                                                                                                                                                                                                                                                      | L    | W0-A, W0-B                       |
| 1    | **L-GYM**                | UX-36 (1)–(5), UX-05 (A–H), UX-04 §5–7 (`TodaysWorkoutCard`, done/rest states, missed-day step), UX-06 §1 day kinds in gym settings + §4 RefuelCard, UX-21.11, 21.17                                                                                                                                                                                                                                                                                                                                                                                        | L    | W0-A, W0-B                       |
| 1    | **L-PLAN**               | UX-08 (after W0-C's §0), UX-07, UX-11 §5 price ranges (UX-08 §7), UX-21.3, 21.12, 21.13 (week sheet), B-33                                                                                                                                                                                                                                                                                                                                                                                                                                                  | L    | W0-A, W0-B, W0-C                 |
| 1    | **L-ENTRY**              | UX-25 part 1 (Welcome, login, register subtitle), UX-39 §1 (sign-up acceptance + `app/legal/[doc].tsx`), UX-26 §3 age gate, UX-22 (chat parts + About), UX-21.1 (chat UI + the local-day contract, server), 21.9, 21.10                                                                                                                                                                                                                                                                                                                                     | M    | W0-A, W0-B                       |
| 1    | **L-TRACK** _(new)_      | UX-19 (all), UX-35 (targets card, goals, Settings card), UX-11 §1–2 (target-change log + notice logic, TargetExplainSheet, sanity rules §4 server-side), UX-22 goal/metrics disclaimer, UX-21.5 (metrics, weight card, quick add), 21.14, 21.15, 21.16                                                                                                                                                                                                                                                                                                      | L    | W0-A, W0-B                       |
| 1    | **L-DATA**               | UX-12 (JS wrapper, consent card; SDK in the wave-4 native release), UX-39 §2–5 (emails, consent log + history, revoke/delete copy, export — OTA fallback now, file in wave 4), Profile › Privacy & data section, UX-21.13 (profile line)                                                                                                                                                                                                                                                                                                                    | M    | W0-B                             |
| 2    | **L-HOME**               | UX-03 (jobs incl. Track, training days incl. run kinds, How you cook step from L-PLAN, Your targets step from L-TRACK, units follow typed values, auto-plan question), UX-04 food side (landing, card stack, tracker home, Tonight/Tomorrow/shop-due, toggle), B-31 full, UX-11 Today integration (notice slot, tappable ring, miss sheet on Today), `CheckedForChip` on home cards                                                                                                                                                                         | L    | L-SAFE, L-PLAN, L-ENTRY, L-TRACK |
| 2    | **L-MONEY**              | UX-10 (PremiumSheet wiring, job copy incl. gym-first default, locks: import, pantry, chat, Snap taste; Profile plan section + honest quota rows; downgrade summary; nudge cap; post-upgrade actions from UX-08 §5)                                                                                                                                                                                                                                                                                                                                          | M    | L-PLAN, L-DATA, L-TRACK          |
| 2    | **L-SAFE2**              | UX-02 on plan surfaces (week card, meal-card chip, picker rows + `FilteredForLine` + hidden count, list header + label-caveat lines), UX-01 (c) for Plan/Replace/Shop                                                                                                                                                                                                                                                                                                                                                                                       | M    | L-SAFE, L-PLAN                   |
| 2    | **L-GYM (cont.)**        | UX-36 (6) "How long have you got?" + short version; any UX-05 remainder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | M    | L-GYM                            |
| 3    | **L-PLAN2**              | UX-06 food side (plan markers incl. run days, day header, week sheet, Today note, week glance), UX-11 §3 on Plan (miss sheet, re-plan banner), UX-10 §8 What Premium changed + household week-1 line + pool card, UX-13                                                                                                                                                                                                                                                                                                                                     | M–L  | L-HOME, L-MONEY, L-SAFE2, L-GYM  |
| 3    | **L-CONSENT**            | UX-26 §1 (health-information consent on every health save path), §2 (its rows in the privacy section), §4 AI chip placements                                                                                                                                                                                                                                                                                                                                                                                                                                | M    | L-HOME, L-MONEY, L-TRACK, L-DATA |
| 4    | **Integrate & verify**   | Full ladder on `integrate/ux-now`; safety regression suite report; lints; VoiceOver + TalkBack on hardware (V9); **native release** with PostHog RN (UX-12) and file export (UX-39); App Privacy / data-safety answers; UX-25 part 2 (listing text + screenshots from the integrated build); counsel checklist (UX-26/UX-39)                                                                                                                                                                                                                                | M    | all                              |

### 7.3 File-ownership map (Now)

Mobile paths are under `apps/mobile/` unless shown otherwise. A lane named in a later column takes the file over in that
wave; "—" = untouched.

| Files / dirs                                                                                                                                                                                                                                              | W0                               | Wave 1                                                                  | Wave 2                                    | Wave 3                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| `packages/ui-mobile/**`                                                                                                                                                                                                                                   | W0-A                             | L-GYM (`charts/line-chart.tsx` only)                                    | —                                         | —                                              |
| `packages/types/**`, `packages/utils/**` (new modules)                                                                                                                                                                                                    | W0-B                             | each lane: fixes/tests in modules its specs use                         | ←                                         | ←                                              |
| `packages/utils/src/gym/**`, `src/features/gym/**` (except `mode-switch.tsx`), `app/gym/**`, `app/(gym)/**`                                                                                                                                               | W0-A (WhySheet only)             | L-GYM                                                                   | L-GYM                                     | —                                              |
| `src/features/gym/components/mode-switch.tsx`, `app/settings.tsx`                                                                                                                                                                                         | W0-B                             | —                                                                       | L-HOME (jobs row)                         | —                                              |
| `src/features/gym/mode-store.ts`, `app/(food)/_layout.tsx`                                                                                                                                                                                                | —                                | —                                                                       | L-HOME                                    | —                                              |
| `src/features/safety/**`, `src/features/recipes/**`, `src/features/household/**`, `app/household.tsx`, `app/recipe/[id].tsx`, `app/recipe-form.tsx`, `app/cook/[id].tsx`, `app/(food)/recipes.tsx`, `src/features/preferences/components/safety-step.tsx` | —                                | L-SAFE                                                                  | L-SAFE2 (safety parts only)               | L-CONSENT (save paths)                         |
| `app/(food)/meal-plan.tsx`, `src/features/meal-plan/**`, `app/(food)/shopping-list.tsx`, `src/features/shopping-list/**`, `src/features/dashboard/components/week-outlook.tsx`, `app/my-weeks.tsx`                                                        | W0-C (plan selector client bits) | L-PLAN                                                                  | L-SAFE2                                   | L-PLAN2                                        |
| `src/features/premium/**`, `packages/utils/src/premium-activation.ts`                                                                                                                                                                                     | W0-A (shells)                    | L-PLAN (post-upgrade actions)                                           | L-MONEY                                   | L-PLAN2 (placements only)                      |
| `app/import-recipe.tsx`, `src/features/pantry/**`, `src/features/chat/locked-chat-preview.tsx`                                                                                                                                                            | —                                | L-SAFE (import preview check only)                                      | L-MONEY                                   | —                                              |
| `app/(auth)/**`, `app/legal/**`, `src/lib/auth-store.ts`, `app/chat.tsx`, `src/lib/chat-stream.ts`, `docs/app-store/**`                                                                                                                                   | —                                | L-ENTRY                                                                 | L-HOME (`chat.tsx` examples only)         | L-CONSENT (none expected)                      |
| `app/tracker.tsx`, `src/features/tracker/**` (incl. `scan-meal-card.tsx`, `quick-add-sheet.tsx`), `src/features/coach/**`, `src/features/nutrition/**`                                                                                                    | —                                | L-TRACK                                                                 | L-MONEY (`scan-meal-card.tsx` taste only) | —                                              |
| `app/preferences.tsx`, `src/features/preferences/components/goal-step.tsx`, `metrics-step.tsx`, `src/features/preferences/goal-body-card.tsx`, `targets-card.tsx`, `types.ts`                                                                             | W0-C (budget read-only)          | L-TRACK                                                                 | L-HOME (How you cook card, toggle, jobs)  | L-CONSENT (consent hook)                       |
| `src/features/preferences/weekly-updates-card.tsx`, `auto-plan-toggle.tsx`                                                                                                                                                                                | —                                | L-DATA                                                                  | —                                         | —                                              |
| `src/features/onboarding/**`, `app/onboarding.tsx`, `app/(food)/index.tsx`, `src/features/dashboard/**` (except week-outlook)                                                                                                                             | W0-C (`index.tsx` interim)       | —                                                                       | L-HOME                                    | L-PLAN2 (`training-day-note.tsx`, week glance) |
| `app/profile.tsx`, `src/features/profile/**`, `src/features/privacy/**`, `src/lib/analytics.ts`                                                                                                                                                           | —                                | L-DATA                                                                  | L-MONEY (`profile.tsx` plan section)      | L-CONSENT (health rows)                        |
| `app/_layout.tsx`                                                                                                                                                                                                                                         | W0-A (snackbar host)             | L-DATA (analytics init)                                                 | —                                         | —                                              |
| `app/progress.tsx`                                                                                                                                                                                                                                        | —                                | L-ENTRY (local-day contract only)                                       | —                                         | —                                              |
| Web `apps/web/src/features/onboarding/**`, `features/dashboard/**`                                                                                                                                                                                        | —                                | L-SAFE (`step-diet.tsx`), L-TRACK (`step-goal.tsx`, `step-metrics.tsx`) | L-HOME (wizard, dashboard)                | L-PLAN2 (`training-day-note.tsx`)              |
| Web `features/meal-plan/**`, `features/shopping-list/**`, `app/(dashboard)/meal-plan`, `shopping-list`                                                                                                                                                    | W0-C                             | L-PLAN                                                                  | L-SAFE2                                   | L-PLAN2                                        |
| Web `features/premium/**`, `app/(dashboard)/premium`                                                                                                                                                                                                      | —                                | —                                                                       | L-MONEY                                   | —                                              |
| Web `app/(dashboard)/profile`, `features/profile/**`                                                                                                                                                                                                      | —                                | L-DATA                                                                  | L-MONEY                                   | L-CONSENT                                      |
| Web `features/recipes/**`, `app/(dashboard)/recipes/**`                                                                                                                                                                                                   | —                                | L-SAFE                                                                  | —                                         | —                                              |
| Web `features/preferences/**`, `app/(dashboard)/preferences`                                                                                                                                                                                              | —                                | L-TRACK (targets, goals); L-DATA (`weekly-email-toggles.tsx` only)      | L-HOME                                    | L-CONSENT                                      |
| Web `features/tracker/**`, `app/(dashboard)/tracker`, `progress`                                                                                                                                                                                          | —                                | L-TRACK (tracker), L-ENTRY (progress date contract)                     | —                                         | —                                              |
| Web `app/page.tsx`, `features/auth/**`, `features/chat/**`, `app/privacy`, `app/terms`                                                                                                                                                                    | —                                | L-ENTRY                                                                 | —                                         | —                                              |
| Web `features/gym/**`, `app/(dashboard)/gym/**`                                                                                                                                                                                                           | —                                | L-GYM                                                                   | L-GYM                                     | —                                              |

Server (`apps/api/**`) work is split by stage 4 along the same lanes: plan selector and Replace safety → W0-C; safety
filter, taxonomy, derived tags, report → L-SAFE; plan shape, regenerate/undo, picker dedupe, price ranges → L-PLAN;
local-day contract, chat guardrail and date → L-ENTRY; targets override, target-change log, tracker update/recents/copy,
catalogue search → L-TRACK; consent log, emails defaults, export, analytics → L-DATA; dashboard fields, jobs → L-HOME;
pitch, trial, quotas, plan diff → L-MONEY; health consent → L-CONSENT; progression, carry-over, quiet nudge, history →
L-GYM. Additive procedures and fields only.

### 7.4 Next-quarter packaging (for planning)

| Group                | Specs                    | Size | Notes                                                    |
| -------------------- | ------------------------ | ---- | -------------------------------------------------------- |
| N0 Theme first       | UX-23                    | L    | Early in the quarter, before more screens land           |
| N1 Progress          | UX-20 (+ UX-11 §6 trail) | M    | ⚖ D-2, D-12 (one body weight only)                       |
| N2 Kitchen & list    | UX-15, UX-14             | L    | Build UX-15 only after V6; ⚖ D-2                         |
| N3 Plan power        | UX-16, UX-09             | M    | ⚖ D-2 (budget); UX-09 premium                            |
| N4 Cookbook & import | UX-17, UX-18             | M    | ⚖ D-6; UX-18 includes the RO-staples content task        |
| N5 Snap              | UX-37                    | M    | Premium AI feature to invest in first; within scan quota |
| N6 Trial             | UX-28                    | M    | ⚖ D-4; needs ≥ 2 weeks of UX-12 data                     |
| —                    | UX-24 validation (V8)    | S    | Store-listing experiment only                            |

### 7.5 Definition of done (every lane)

All acceptance criteria of the lane's specs pass and are listed in the PR with evidence (test names or screenshots at
default and 1.8× text, iOS and Pixel_8); web parity changes are in the same PR group; protected delights have an empty
visual diff; no new hex literals or inline strings in touched components (P12); analytics events typed and free of
health data; every consent change logged (P13); docs updated per CLAUDE.md's table (new routes → `infrastructure.md`
§4 and `business_flow.md`; new procedures → §8; schema → §6; new env vars → §10); `mobile_parity_backlog.md` entries
added where a spec says so.

---

## Appendix A — Copy deck and string tables

Where each spec's strings live (P12). Agents create the module if it does not exist and never inline these strings.

| Module                                                                            | Specs               | Shared with web                                   |
| --------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------- |
| `packages/types/src/safety-taxonomy.ts` (`label`, `readBack`, `mayContain`)       | UX-01, UX-22        | yes                                               |
| `packages/utils/src/safety-copy.ts`                                               | UX-01, UX-02        | yes                                               |
| `packages/utils/src/wellness-copy.ts`                                             | UX-22, UX-26        | yes                                               |
| `packages/utils/src/premium-pitch.ts`                                             | UX-10, UX-28        | yes                                               |
| `packages/utils/src/premium-activation.ts`                                        | UX-08 §5, UX-10     | yes (exists)                                      |
| `packages/utils/src/glossary.ts`                                                  | PAT-7, UX-05        | yes                                               |
| `packages/utils/src/gym/reasons.ts`                                               | UX-05 A             | yes (exists)                                      |
| `packages/utils/src/plan-shape.ts`, `price-range.ts`, `share-list.ts`             | UX-07, UX-08, UX-13 | yes                                               |
| `apps/mobile/src/features/onboarding/copy.ts`                                     | UX-03               | web has its own wizard copy; keep words identical |
| `apps/mobile/src/features/dashboard/copy.ts`                                      | UX-04, UX-06        | words identical to web dashboard                  |
| `apps/mobile/src/features/auth/copy.ts`                                           | UX-25               | web register subtitle identical                   |
| `apps/mobile/src/features/privacy/copy.ts`                                        | UX-12, UX-26, UX-39 | identical on web                                  |
| `packages/utils/src/explain-targets.ts`                                           | UX-11, UX-35        | yes                                               |
| `apps/mobile/src/features/tracker/copy.ts`                                        | UX-19, UX-37        | words identical to web tracker                    |
| `apps/mobile/src/features/gym/copy.ts` (streak rules, carry-over, pause, history) | UX-36, UX-04 §5–7   | shared strings in `@chefer/utils` gym module      |

---

## Appendix B — UX changelog

For stage 4: update the `T-xx.n` tasks of every row below. IDs never change.

### Rev 2 — 2026-09-27 (final: synthesis v3 n/10, strategy rev 3)

**Added (new specs)**

| UX          | Title                                                                                                                                                                                                                                                     | Bucket | Where |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| **UX-35**   | Set my own targets (own kcal/protein, optional carbs/fat, training-day pair; Recomposition and Fuel my training goals; coach proposes, never overwrites)                                                                                                  | Now    | §3    |
| **UX-36**   | Training that bends to a chaotic week (gym settings gear + Profile row; clock reminders + quiet-days nudge + in-context permission; Save for later / carry the rest; visible kind mechanics, skip undo, pause; Stats › History; "How long have you got?") | Now    | §3    |
| **UX-39** ◆ | Privacy gaps closed (explicit Terms/Privacy at sign-up with in-app legal screen; emails opt-in; consent log + history; honest revoke/delete copy; full named-file export)                                                                                 | Now    | §3    |
| **UX-37**   | Correctable snap-to-log (portion, items, "not this" re-check, confidence in words, thumbnail)                                                                                                                                                             | Next   | §4    |
| **UX-38**   | Apple Health / Health Connect sync ⚖ D-12 (paragraph; one body weight moves to UX-20)                                                                                                                                                                     | Later  | §5    |
| PAT-14      | Change notice pattern (`ChangeNoticeCard`)                                                                                                                                                                                                                | —      | §2.14 |
| P13         | Principle: privacy by default is part of the product                                                                                                                                                                                                      | —      | §1    |

**Re-bucketed**

| UX        | Was → now        | Change                                                                                                                                                                                                                                |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UX-11** | Next → **Now**   | Full spec in §3: change notices with "Keep {old}" (bug B-48), tappable targets, plan-misses-target sheet replacing "add a snack" / `PLAN UNDER TARGET`, sanity rules, price ranges (UX-08 §7); Progress/savings tap-through may trail |
| **UX-19** | Next → **Now**   | Full spec in §3, retitled "Log fast, fix mistakes": search-first sheet with recents and catalogue search in grams, edit + undo (bug B-34), copy day, one save model (bug B-23, moved from UX-21.8), macro sanity checks (bug B-39)    |
| **UX-23** | Later → **Next** | Lighter spec in §4 (token flip, Appearance setting, contrast checks)                                                                                                                                                                  |

**Scope changed**

| UX                | Change                                                                                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-01             | Replace picker verified unfiltered (bug B-46) and served by the one server filter; hidden-gluten patterns and label-dependent ingredients (bug B-47) with an optional stricter setting; diet tags derived from ingredients; `Egg-free` modifier; acceptance 13–14 |
| UX-02             | `Filtered for … · n hidden` lines on every filtered list; label caveats (`Check the label: certified GF stock`, `Buy certified gluten-free`); new PAT-2 rows                                                                                                      |
| UX-03             | `Track what I eat` job (keeps the ring home, adds Your targets step); run-day kinds in Training days; units follow typed values (bug B-43); Sunday auto-plan asked once, off by default (⚖ D-13)                                                                  |
| UX-04             | Kind next step after a missed planned day (`Still time this week`); tracker home fixed order (D20); no warning chip on open; §7 → §8 renumber for the B-31 copy                                                                                                   |
| UX-05             | Gym settings and reminders moved to UX-36; section C is now the readable routine editor (CI-43, live duration); P09 progression evidence                                                                                                                          |
| UX-06             | Weekday kinds `Lift` / `Run` / `Long run` with carb-led bumps for runs; any resulting target change goes through the UX-11 notice                                                                                                                                 |
| UX-08             | §0 the B-13 data bug fix (plan by `weekStartDate` on Plan, Shop, Today) shipped in wave 0 with `plan_shown`; Replace picker dedupe, excludes the replaced meal, slot filter (bug B-50); price labels now formally B-11 scope                                      |
| UX-10             | Snap visible on free as a taste (bug B-35); gym-first default pitch `Food that fits your training week`; §8 What Premium changed card; honest quota counters (bug B-49)                                                                                           |
| UX-12             | Privacy-by-default constraints: no ad IDs, no ATT prompt, EU hosting, privacy page + store questionnaires in the same release; opt-in default acceptable (⚖); consent changes logged via UX-39                                                                    |
| UX-17             | Safe primary action on unsafe imports (bug B-51), naming ingredients not rules; protect D25                                                                                                                                                                       |
| UX-20             | Own targets moved to UX-35; adds weight trend, weekly adherence, one shared body weight (CI-53)                                                                                                                                                                   |
| UX-21             | One local-day contract (bugs B-06, B-33); new rows 21.14–21.18 (bugs B-38, B-36, B-37, B-42, B-52); 21.8 moved to UX-19; routine-editor truncation moved to UX-05                                                                                                 |
| UX-22             | Retitled "Wellness and AI guardrails"; `safetyTopic` footer `AI can be wrong about allergens — always check the label.`                                                                                                                                           |
| UX-26             | Legal answers behind CI-54 (implied consent, opt-in digests, Art. 7(1) record, provider retention); product side moved to UX-39; privacy section built by UX-39's lane                                                                                            |
| B-31 (Stop)       | Ring kept as home for users who chose tracking                                                                                                                                                                                                                    |
| B-32, B-34 (Stop) | Evidence updated; B-34 now also makes `replaceRecipe` reject unsafe recipes                                                                                                                                                                                       |

**Packaging (§7) rebuilt:** 5 waves — wave 0 (3 groups; W0-C now carries the B-13 data bug), wave 1 (6 lanes, new
L-TRACK for UX-19/UX-35/UX-11 core), wave 2 (4 lanes), wave 3 (2 lanes), wave 4 (integration + one native release for
UX-12's SDK and UX-39's file export). File-ownership map redone (preferences, tracker, profile, privacy, legal routes).
Next-quarter groups N0–N6 (UX-23 first).

**Stage 4 note (native release):** `04-technical-plan.md` rev 2 §2.14 keeps one wave-4 native release, but it contains only `expo-sharing` (plus a pinned `expo-file-system`, which is already linked in the installed binaries). UX-12 ships over OTA with a pure-JS PostHog transport instead of the RN SDK. The fallbacks in §7.1 stay valid.

**Other:** status header final; evidence counts rebased to n/10; §1 P1, P9 (never changed silently), P10, P11
(D20–D25 protected), P12 updated; settings map adds Your targets, Emails, Pause, Workout history; Appendix A adds copy
modules.

### Rev 1 — 2026-09-27 (interim: synthesis n/7, strategy rev 1)

Initial spec: principles P1–P12, patterns PAT-1–13, Now UX-01–08, 10, 12, 13, 21, 22, 25, 26; Next UX-09, 11, 14–20, 28;
Later UX-23, 24, 27; Don't/Stop; 5-wave packaging.
