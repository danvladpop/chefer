# Mobile — Remaining Work

> **Status:** Phases 0–5 of [`mobile_responsive_plan.md`](./mobile_responsive_plan.md) are merged
> (`b80fa8b`…`2bbf4e7`). This file records everything still outstanding.
> **Audited:** 2026-08-21, against `master` @ `2bbf4e7`. All counts below were measured, not estimated.
> **Scope:** the mobile/responsive workstream only. For product and backend priorities see
> [`roadmap.md`](./roadmap.md) — the two overlap in exactly one place, flagged in §1.

---

## 0. Where things stand

| Check                          | Result                                      |
| ------------------------------ | ------------------------------------------- |
| e2e `mobile` + `desktop`       | **61 passing, 0 failing**                   |
| Routes swept for overflow      | 10 routes × 320/375/390/430px               |
| Touch-target sweep             | every interactive element, 10 routes, 390px |
| `h-screen` / `100vh` remaining | **0**                                       |
| Desktop regression             | verified at 1440px and 1100px               |

Verified by hand in a real browser: bottom nav geometry, drawer focus trap, the scroll-lock
round trip, `Sheet` as a bottom sheet, the meal-plan day view, and the desktop shell.

---

## 1. Broken quality gates — start here

> **✅ RESOLVED 2026-08-21** (roadmap P0-0): all six workspaces now carry an `eslint.config.js`
> wired to `@chefer/eslint-config` (lint: 0 errors, staged-adoption warnings ratcheted in the two
> app configs); the 23 `exactOptionalPropertyTypes` errors are fixed and `ignoreBuildErrors` is
> gone from `next.config.ts`; `@chefer/utils` and `@chefer/web` have real unit tests;
> `home.spec.ts` was rewritten against the current landing page (17/17 passing). The table below
> is kept for the record.

Three of the four checks `CLAUDE.md` tells contributors to run did not work. None of this was
caused by the mobile work; all of it predates `b80fa8b`.

| Command             | Actual result                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`         | **Fails immediately.** `apps/web` has no `eslint.config.js` and no `.eslintrc.*`. The entire frontend has never been linted.                                                                            |
| `pnpm test`         | **Fails.** `@chefer/utils` declares a `test` script but contains zero test files; `vitest run` exits 1 on "No test files found".                                                                        |
| `pnpm typecheck`    | 23 errors, all pre-existing in `apps/api` and `packages/database` (`exactOptionalPropertyTypes`). `apps/web/next.config.ts` sets `typescript.ignoreBuildErrors: true` and documents this as known debt. |
| `pnpm format:check` | Works.                                                                                                                                                                                                  |

> ### ⚠️ This blocks `roadmap.md` P0-3
>
> P0-3 ("Make CI run") assumes lint/typecheck/test currently pass and are simply not wired to
> `master`. They do not pass. Turning CI on today makes every PR red on the first two jobs.
>
> **`P0-3` needs a prerequisite:** restore the `apps/web` ESLint config and either add a test to
> `@chefer/utils` or set `passWithNoTests` in its vitest config. Do that first, or CI lands red
> and gets ignored — which is worse than no CI.

`tests/e2e/home.spec.ts` is separately red: **13 of 19 failing**, from landing-page copy that was
replaced long ago plus a strict-mode violation where `getByLabel(/password/i)` matches both the
password input and the "Show password" toggle. It is isolated in its own `public` Playwright
project so it cannot mask the responsive suites.

---

## 2. Responsive debt still open

### 2.1 Contrast — 17 instances · `S` — ✅ RESOLVED 2026-08-21 (roadmap P0-10)

17 uses of `text-gray-400` / `text-neutral-400` remain on white. That is **3.0:1**, below the
WCAG AA minimum of 4.5:1 for body text. `text-*-500` measures 4.6:1 and was the substitution used
elsewhere.

Files: `history/[planId]/page.tsx`, `ChatWidget.tsx`, `IngredientPicker.tsx`, `PlanHistoryCard.tsx`,
`IngredientFormModal.tsx`, `top-header.tsx`, `side-bar.tsx`, `mobile-nav-drawer.tsx`.

Mechanical, but check each one — a few are on non-white backgrounds where 400 is fine.

### 2.2 `UpgradeButton` dialog → `Sheet` · `S` — ✅ RESOLVED 2026-08-21 (roadmap P0-10)

`features/premium/components/UpgradeButton.tsx` still hand-rolls `fixed inset-0 z-50`. It is a
real dialog and has no scroll lock, no focus trap and no Escape handling. `Sheet` provides all
three and makes it a bottom sheet on phones.

`features/meal-plan/components/GenerateOverlay.tsx` matches the same pattern but is a full-screen
loading state rather than a dialog — leaving it is defensible.

### 2.3 Micro-typography — 40 instances · `M`, needs a design decision

40 uses of `text-[9px]` / `text-[10px]` across the app. Below comfortable phone legibility, and
recorded as §1.3 item 6 of the responsive plan but never addressed.

**This is not a mechanical change.** Bumping 40 sizes alters how dense the app feels, and much of
this is deliberate meta-text (macro chips, meal badges, day totals). Someone should decide the
intended mobile density first; a blanket bump would be a design change made by accident.

### 2.4 Both meal-plan layouts ship to every device · `M`

`meal-plan/page.tsx` and `history/[planId]/page.tsx` render the mobile day view _and_ the desktop
week grid, toggling with CSS. Deliberate — it keeps SSR output stable and avoids a media-query
hydration mismatch — but `display: none` does not stop image fetches. A phone downloads the whole
week's recipe images on top of the ~4 it shows.

Worse because `next.config.ts` sets `images.unoptimized: true` in production, so there is no
responsive `srcset` either: phones fetch desktop-resolution images.

Options, roughly in order of preference:

1. SSR-safe `useMediaQuery` returning `null` on first render, mounting the correct branch after
   hydration. Check for layout shift on the frame where neither renders.
2. `next/dynamic` with `ssr: false` on the desktop grid.
3. Keep both mounted, skip image rendering in the hidden branch. Most fragile.

Measure before and after by counting image requests at a 390px viewport.

---

## 3. Never exercised

| Surface                        | Why it matters                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Real iOS / Android devices** | Everything below 504px was WebKit emulation. Chrome enforces a ~504px minimum window width, so 320/375/390 were never seen in a real browser.               |
| **iOS input zoom-on-focus**    | The 16px rule is the fix, but the behaviour it prevents cannot be reproduced outside real iOS Safari.                                                       |
| **`dvh` vs `vh`**              | Same — the URL-bar behaviour that motivated the change only exists on a real device.                                                                        |
| **Landscape**                  | 390×844 rotated to 844×390. Short viewports with a sticky header _and_ a fixed tab bar are the risk.                                                        |
| **On-screen keyboard**         | Sticky bars (tracker Save, preferences save bar, chat input) versus a raised keyboard. `interactive-widget=resizes-content` was considered but not applied. |
| **`prefers-reduced-motion`**   | The block exists in `globals.css`; never verified against the drawer and sheet transitions.                                                                 |

> **Why this matters more than it sounds.** During Phase 5 I claimed chart tooltips were
> unreachable on touch, built a pointer-detection hook to fix it, and shipped it. Measuring
> afterwards showed a tap fires compatibility mouse events, so hover tooltips already worked —
> the fix was reverted in `2bbf4e7`. Emulation and reasoning were wrong in the same direction.
> Treat every untested item above as genuinely unknown, not probably-fine.

---

## 4. Known-unfixed behaviour

**Chart tooltips do not dismiss on touch.** Tapping a chart opens a tooltip; tapping away leaves
it open. Measured under both `trigger="hover"` and `trigger="click"` — identical. Needs a
different fix (an outside-tap handler, or `dismissOnTouchOutside` behaviour around Recharts), not
a trigger change. See the comment in `progress/page.tsx` and §4.9 of the responsive plan.

---

## 5. Spun-off tasks

Filed separately because each is its own concern:

| Task                             | Note                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restore `apps/web` ESLint config | See §1. Highest value — an entire app is unlinted.                                                                                                                |
| Extract a shared `recipe-form`   | `recipes/new` (730 lines) and `recipes/[id]/edit` (544) are near-duplicates. The responsive pass had to be applied twice. Differences are documented in the task. |
| Fix `home.spec.ts`               | 13 stale assertions, see §1.                                                                                                                                      |
| Meal-plan double image load      | Same as §2.4.                                                                                                                                                     |

---

## 6. Suggested order

1. **ESLint config** (§1) — unblocks `roadmap.md` P0-3 and is most likely to surface things this
   work missed.
2. **`@chefer/utils` test script** (§1) — one line; the other half of the CI prerequisite.
3. **Contrast** (§2.1) and **`UpgradeButton` → `Sheet`** (§2.2) — small, accessibility, low risk.
4. **Real-device sweep** (§3) — needs a person with a phone; nothing else substitutes.
5. **Double layout / image loading** (§2.4) — real bandwidth cost on the connections this work
   was meant to help.
6. **Micro-typography** (§2.3) — after someone decides the target density.
7. **Chart tooltip dismissal** (§4) — smallest user impact of the group.

Items 1–3 are a morning. Item 4 is the one that cannot be skipped without leaving the core claim
of this workstream — that the app works on a phone — resting on emulation alone.
