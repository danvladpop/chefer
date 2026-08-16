# Mobile Responsiveness Plan — Chefer Web

> Status: **plan only, not implemented.**
> Scope: `apps/web` + `packages/ui`. No API, schema, or business-logic changes.
> Audit date: 2026-08-16. Audited every route under `apps/web/src/app` and every component under `apps/web/src/features`.

---

## 0. How to use this document

Each section is written to be executable on its own. Sections are ordered by dependency — §2 (foundations) and §3 (app shell) must land before the per-page work in §4, because most per-page problems are _downstream_ of the shell.

Every fix names the exact file and, where useful, the line. Line numbers are from the audit commit and may drift.

Legend:

- 🔴 **Blocker** — page is unusable or visually broken on a phone.
- 🟠 **Major** — usable but clearly degraded (crushed layout, unreachable control).
- 🟡 **Minor** — polish; correctness is fine.

---

## 1. Root cause and audit summary

### 1.1 The single cause of the screenshot

`DashboardShell` renders the desktop sidebar unconditionally, at a hard-coded width, with no breakpoint:

```tsx
// apps/web/src/features/nav/components/dashboard-shell.tsx:38
<div className="flex h-screen overflow-hidden bg-gray-50">
  <SideBar /> {/* w-56 = 224px, no `hidden lg:flex` */}
  <div className="flex flex-1 flex-col overflow-hidden">
    <TopHeader title={title} />
    <main className="flex-1 overflow-y-auto">{children}</main>
  </div>
</div>
```

```tsx
// apps/web/src/features/nav/components/side-bar.tsx:44
<aside className="flex h-screen w-56 shrink-0 flex-col border-r bg-white">
```

On a 390 px viewport the sidebar consumes 224 px, leaving **166 px** for all page content. Every symptom in the screenshot — the wrapped `Your Daily Overview` heading, the squeezed 7-day strip, the clipped `Full Schedule →` link, the overflowing date — follows from this one line. Fixing the shell resolves roughly 60 % of the visible damage across the whole app.

### 1.2 Audit numbers

| Metric                                                  | Count                                |
| ------------------------------------------------------- | ------------------------------------ |
| `.tsx` files in `apps/web/src`                          | 62                                   |
| Files with **zero** responsive breakpoints              | **41**                               |
| Files with ≥ 4 breakpoint utilities                     | 3                                    |
| Grids with a hard `min-w-[…]` forcing horizontal scroll | 2 (`min-w-[900px]`, `min-w-[700px]`) |
| Modals/overlays with no mobile treatment                | 6                                    |
| Text inputs at `text-sm` (triggers iOS zoom-on-focus)   | ~20                                  |
| Interactive targets below 44 × 44 px                    | ~35                                  |
| Uses of `env(safe-area-inset-*)`                        | **0**                                |

### 1.3 Cross-cutting defects (present on nearly every page)

1. 🔴 **Sidebar never hides** — §3.
2. 🔴 **`h-screen` + `overflow-hidden` shell.** Nested scroll containers on iOS Safari suppress URL-bar auto-hide, break momentum-scroll chaining, and lose scroll restoration on back-navigation. `100vh` is also wrong on mobile — it excludes the browser chrome, so the last ~15 % of every page sits under the toolbar.
3. 🔴 **Inputs at 14 px.** iOS Safari auto-zooms any focused input whose font-size is < 16 px, then never zooms back out. Affects every form in the app.
4. 🟠 **Touch targets far below the 44 px minimum.** Worst offenders: servings ± buttons (`h-5 w-5` = 20 px), tracker portion pills (~34 × 20 px), meal-plan week arrows (`h-8 w-8` = 32 px), all modal close buttons.
5. 🟠 **No safe-area handling.** Nothing accounts for the iPhone home indicator or notch. Critical once a bottom nav exists.
6. 🟠 **Micro-typography.** `text-[9px]`, `text-[10px]`, `text-[11px]` appear ~90 times. These read as desktop-dense-UI sizes; on a phone they are below comfortable legibility.
7. 🟡 **Global heading sizes are fixed.** `globals.css:82` sets `h1 { @apply text-4xl }` (36 px) with no breakpoint.
8. 🟡 **`images.unoptimized: true` in production** (`next.config.ts`) means no responsive `srcset` — phones download desktop-resolution images over cellular.

### 1.4 Dead code — delete instead of fixing

These are exported but referenced nowhere. Confirmed by grep across `apps/web/src`. Removing them cuts five files from the responsive work:

- `features/nav/components/nav-bar.tsx` (superseded by `side-bar` + `top-header`)
- `features/dashboard/components/NutritionPanel.tsx` (dashboard has its own inline right rail)
- `features/dashboard/components/stats-card.tsx`
- `features/meal-plan/components/MacroDonut.tsx`
- `components/ui/button.tsx` (duplicate of `@chefer/ui`'s Button)

---

## 2. Phase 0 — Foundations

Land this first. Everything else depends on it.

### 2.1 Breakpoint contract

Keep Tailwind's defaults; commit to the semantics so the codebase stays coherent:

| Token    | Width  | Meaning in Chefer                                               |
| -------- | ------ | --------------------------------------------------------------- |
| _(base)_ | 0–639  | Phone portrait. Single column. Bottom nav.                      |
| `sm`     | ≥ 640  | Large phone landscape / small tablet. Two-column grids allowed. |
| `md`     | ≥ 768  | Tablet portrait. Multi-column content, still bottom nav.        |
| `lg`     | ≥ 1024 | **Sidebar appears.** Desktop shell.                             |
| `xl`     | ≥ 1280 | Dashboard right rail appears.                                   |

Rule of thumb: **`lg` is the shell boundary.** Below `lg` the app is a mobile app; at `lg`+ it is the current desktop app.

### 2.2 `tailwind.config.ts` additions

```ts
theme: {
  extend: {
    spacing: {
      'safe-b': 'env(safe-area-inset-bottom)',
      'safe-t': 'env(safe-area-inset-top)',
      'nav-h': '4rem',        // bottom nav height
    },
    minHeight: {
      'screen-safe': '100dvh',
    },
    fontFamily: {
      // `font-serif` is used on ~12 headings but is not defined here —
      // it silently falls back to Tailwind's default serif stack.
      // Define it explicitly or replace with a `next/font` serif.
      serif: ['var(--font-serif)', ...fontFamily.serif],
    },
  },
}
```

Tailwind 3.4.19 is installed, so `dvh`/`svh`/`lvh` utilities (`h-dvh`, `min-h-dvh`) are available natively — prefer them over the custom `minHeight` entry where possible.

### 2.3 `globals.css` changes

```css
@layer base {
  /* Responsive heading scale — currently fixed at desktop sizes */
  h1 {
    @apply text-2xl sm:text-3xl lg:text-4xl;
  }
  h2 {
    @apply text-xl  sm:text-2xl lg:text-3xl;
  }
  h3 {
    @apply text-lg  sm:text-xl  lg:text-2xl;
  }

  /* Prevent iOS zoom-on-focus without disabling user zoom */
  input,
  select,
  textarea {
    @apply text-base sm:text-sm;
  }

  /* Kill the 300 ms tap delay + grey flash */
  html {
    -webkit-tap-highlight-color: transparent;
    text-size-adjust: 100%;
  }

  /* Nothing may cause a horizontal document scroll */
  body {
    @apply overflow-x-hidden;
  }
}

@layer utilities {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom);
  }
  .pt-safe {
    padding-top: env(safe-area-inset-top);
  }
  /* Horizontal card rails (day strips, favourites) */
  .scroll-rail {
    @apply flex snap-x snap-mandatory overflow-x-auto scroll-smooth;
    scrollbar-width: none;
  }
  .scroll-rail::-webkit-scrollbar {
    display: none;
  }
}
```

> ⚠️ Do **not** add `maximumScale: 1` or `userScalable: false` to the viewport export. That fixes the zoom symptom by breaking accessibility. The `text-base sm:text-sm` rule above is the correct fix.

### 2.4 `app/layout.tsx` viewport

```ts
export const viewport: Viewport = {
  themeColor: [...],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',   // ← add; required for env(safe-area-inset-*) to resolve
};
```

### 2.5 New shared primitives in `packages/ui`

Six modals are hand-rolled today with the identical broken pattern (`fixed inset-0 flex items-center justify-center p-4`, no scroll lock, no focus trap, no Escape handler, `max-h-[90vh]` instead of `dvh`). Build these once:

**`packages/ui/src/components/sheet.tsx`** — responsive dialog.

- < `sm`: bottom sheet — `fixed inset-x-0 bottom-0 rounded-t-3xl max-h-[85dvh]`, drag-handle affordance, `pb-safe`.
- ≥ `sm`: centred dialog — current appearance.
- Both: `<dialog>` or Radix-style focus trap, Escape to close, `overflow: hidden` scroll lock on `<body>` while open, `aria-modal`, restore focus on close.

**`packages/ui/src/components/drawer.tsx`** — left slide-over for the mobile nav (§3.3).

**`packages/ui/src/components/scroll-rail.tsx`** — horizontal snap rail with edge fade, used by the day strip, favourites row, and mobile meal-plan day picker.

Then migrate: `IngredientFormModal`, `SavedRecipePicker` (in `recipes/[id]/page.tsx`), ingredients delete confirm, shopping-list item popup, `UpgradeButton` dialog, `GenerateOverlay`.

### 2.6 Touch-target policy

Minimum **44 × 44 px** for anything tappable (Apple HIG; Material's 48 dp is stricter but 44 is the practical floor for a dense data app).

Where a control must stay visually small (icon buttons, chips), keep the visual size and expand the hit area:

```tsx
className = "relative h-6 w-6 after:absolute after:-inset-2.5 after:content-['']";
```

Apply to: recipe servings ±, tracker portion pills, tracker/shopping checkboxes, week-nav arrows, all modal close buttons, ingredient row delete buttons, `TopHeader` avatar.

---

## 3. Phase 1 — App shell and navigation

This is the highest-leverage change in the plan.

### 3.1 Chosen pattern

**Bottom tab bar (5 items) + slide-over drawer for the remaining 5.**

The app has 10 nav destinations — too many for a tab bar, too few to justify a hamburger-only design that hides the primary flows behind two taps.

| Bottom tab | Route            | Icon              |
| ---------- | ---------------- | ----------------- |
| Home       | `/dashboard`     | `LayoutDashboard` |
| Plan       | `/meal-plan`     | `CalendarDays`    |
| Recipes    | `/recipes`       | `BookOpen`        |
| Shop       | `/shopping-list` | `ShoppingCart`    |
| More       | _(opens drawer)_ | `Menu`            |

Drawer holds: Ingredients, Tracker, Progress, History, Profile, Preferences, plus the plan/upgrade footer currently in the sidebar.

> **Alternative considered:** hamburger-only drawer. Rejected — it puts every primary flow two taps deep and wastes the thumb zone. The tab bar keeps the four highest-frequency destinations one tap away.

### 3.2 `dashboard-shell.tsx` rewrite

Replace the single fixed-height shell with two layout modes:

```tsx
export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const title = getTitle(pathname);

  return (
    // Mobile: document scrolls. Desktop (lg+): fixed shell, main scrolls.
    <div className="flex min-h-dvh bg-gray-50 lg:h-dvh lg:overflow-hidden">
      {/* Desktop sidebar — hidden below lg */}
      <SideBar className="hidden lg:flex" />

      <div className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
        <TopHeader title={title} />
        <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:overflow-y-auto lg:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — hidden at lg+ */}
      <BottomNav className="lg:hidden" />
    </div>
  );
}
```

Key points:

- `min-h-dvh` on mobile (document scroll) → URL-bar auto-hide works, back-navigation restores scroll, momentum scrolling is native.
- `lg:h-dvh lg:overflow-hidden` preserves the current desktop behaviour exactly.
- `min-w-0` on the flex child — without it, long content forces the whole shell wider than the viewport.
- Bottom padding on `<main>` equals nav height + safe area, so the last element is never hidden behind the tab bar.

### 3.3 New components

**`features/nav/components/bottom-nav.tsx`**

```tsx
<nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur pb-safe lg:hidden">
  <ul className="flex h-16">
    {/* each item: flex-1, min-h-11, icon 22px + 10px label, active = #944a00 */}
  </ul>
</nav>
```

- Active state derived from `pathname` with the same prefix matching as `SideBar`.
- `aria-current="page"` on the active item.
- "More" opens the drawer, and is shown active whenever the route is one of the drawer's five.

**`features/nav/components/mobile-nav-drawer.tsx`**

- Slide-over from the left, `w-[85vw] max-w-xs`, backdrop, Escape/backdrop close, focus trap, body scroll lock.
- Auto-closes on route change (`useEffect` on `pathname`).
- Contains the secondary nav items + the premium/upgrade footer currently at `side-bar.tsx:85`.

### 3.4 `side-bar.tsx`

- Accept a `className` prop, merge with `cn()`.
- Change `h-screen` → `h-dvh`.
- Extract the nav-item list into `features/nav/nav-items.ts` so `SideBar`, `BottomNav`, and `MobileNavDrawer` share one source of truth (currently `NAV_ITEMS` is private to `side-bar.tsx` and `NAV_LINKS` is duplicated in the dead `nav-bar.tsx`).

### 3.5 `top-header.tsx`

Current: `h-16 … px-6`, title left, avatar right. Problems: no way into the drawer; avatar hit area is small; the title is the only mobile wayfinding.

- Make it `sticky top-0 z-30` (it is currently a static flex child of a fixed shell — once the shell scrolls with the document it must be sticky).
- Add a hamburger button on the left, `lg:hidden`, opening the drawer.
- `px-4 sm:px-6`.
- Title `text-lg sm:text-xl`, `truncate`.
- Avatar button to `min-h-11 min-w-11`; keep the name hidden below `md` (already correct at line 42).
- Dropdown: `w-52` is fine, but anchor with `right-0` and add `max-w-[calc(100vw-2rem)]`.

### 3.6 Print styles

`shopping-list/page.tsx:24` hides `nav, aside, header`. The new `<nav>` bottom bar and the drawer are covered by that selector — verify after implementation, and move `PRINT_STYLES` out of the inline `dangerouslySetInnerHTML` into `globals.css` while you are there.

---

## 4. Phase 2 — Per-page plans

### 4.1 `/dashboard` — `app/(dashboard)/dashboard/page.tsx` 🔴

**Current:** `flex h-full gap-6 p-6`, main column + `hidden w-72 lg:flex` right rail.

| #   | Sev | Problem                                                                                                                                                  | Fix                                                                                                                                                                                              |
| --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 🔴  | Root is `flex h-full` — with the sidebar gone the layout is fine, but `h-full` inside a document-scrolling shell collapses                               | `flex flex-col gap-4 p-4 xl:flex-row xl:gap-6 xl:p-6`                                                                                                                                            |
| 2   | 🟠  | `p-6` (24 px) wastes 13 % of a 375 px viewport                                                                                                           | `p-4 sm:p-6`                                                                                                                                                                                     |
| 3   | 🟠  | Header row `flex items-center justify-between` — title + date + "Sustainable Choice" pill collide                                                        | `flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between`                                                                                                                      |
| 4   | 🟠  | 7-day strip (line 97) `flex gap-2` with `flex-1` buttons → ~41 px wide at 375 px, below target                                                           | Convert to `.scroll-rail`; fixed `w-14` snap chips; `gap-1.5`; card padding `p-4`                                                                                                                |
| 5   | 🟠  | Next-meal spotlight (line 190) `flex gap-4` with a fixed `h-28 w-32` image → text column gets ~150 px                                                    | `flex-col sm:flex-row`; image `h-40 w-full sm:h-28 sm:w-32`                                                                                                                                      |
| 6   | 🟠  | Meta row inside spotlight (line 220) — time + kcal + "Start Cooking" on one line                                                                         | `flex-wrap gap-2`; CTA `w-full sm:ml-auto sm:w-auto`                                                                                                                                             |
| 7   | 🟠  | "Rest of Today" rows (line 273) — `w-16` time + badge + name + kcal on one line, name has no `truncate`                                                  | Two-line layout on mobile; add `min-w-0` + `truncate`                                                                                                                                            |
| 8   | 🟠  | Right rail is `hidden lg:flex` — the calorie ring and macro bars are **completely unavailable on mobile**, and they are the page's most valuable content | Extract to `features/dashboard/components/nutrition-summary.tsx`; render it inline in the main column below the day strip at `< xl`, and in the rail at `xl+`. Move rail breakpoint `lg` → `xl`. |
| 9   | 🟡  | Recharts line chart (line 301) at `height={80}` with 7 `EEE` labels                                                                                      | Fine at 7 points; set `interval="preserveStartEnd"` for safety                                                                                                                                   |
| 10  | 🟡  | Favourites rail (line 343) already `overflow-x-auto`                                                                                                     | Add `snap-x`, `-mx-4 px-4` bleed so cards touch the screen edge                                                                                                                                  |
| 11  | 🟡  | `DashboardSkeleton` (line 492) mirrors the desktop layout                                                                                                | Mirror the new mobile layout                                                                                                                                                                     |

**Target mobile layout (top → bottom):** header → day strip (snap rail) → **nutrition summary** → next-meal card → rest of today → week chart → favourites rail → sign-off.

### 4.2 `/meal-plan` — `app/(dashboard)/meal-plan/page.tsx` 🔴

**Current:** `grid min-w-[900px] grid-cols-7` inside `overflow-x-auto` (line 265–266).

This is the largest redesign in the plan. At 375 px the user sees **38 % of one column** and must scroll horizontally through 900 px to reach Sunday. A 7-column week grid has no mobile equivalent — it needs a different information architecture, not a breakpoint.

**Proposed responsive strategy:**

| Breakpoint | Layout                                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| base       | **Single-day view.** Sticky horizontal day picker (7 snap chips, Mon–Sun, today pre-selected, dot indicator for planned days) + the selected day's 4 meal cards stacked full-width + that day's `DayRecapBar`. Swipe left/right to change day. |
| `md`       | 2-day columns, horizontal scroll with snap per column.                                                                                                                                                                                         |
| `lg`+      | Current 7-column grid, unchanged.                                                                                                                                                                                                              |

**Implementation notes:**

- Extract the week grid into `features/meal-plan/components/week-grid.tsx` (desktop) and add `features/meal-plan/components/day-view.tsx` (mobile). Render both, toggle with `hidden lg:grid` / `lg:hidden` — avoids a JS media query and keeps SSR output stable.
- Selected day lives in the URL (`?day=N`) alongside the existing `?week=` param, so back/forward and refresh behave.
- `MealCard` on mobile becomes a horizontal card (thumb left, text right) rather than the current vertical `h-24` image + `h-[88px]` body — see §5.1.

**Other fixes on this page:**

| #   | Sev | Problem                                                                                                                                       | Fix                                                                          |
| --- | --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | 🟠  | Nav bar (line 144) `flex justify-between px-6 py-4` — week navigator (`min-w-[200px]` + two 32 px arrows) plus the Regenerate button overflow | `flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between`    |
| 2   | 🟠  | `min-w-[200px]` week label (line 156) plus up to two status pills                                                                             | `min-w-0 flex-1 justify-center`; hide the "This Week"/"Past" pill below `sm` |
| 3   | 🟠  | Arrow buttons `h-8 w-8`                                                                                                                       | `h-11 w-11` on mobile, `sm:h-8 sm:w-8`                                       |
| 4   | 🟠  | Free-tier banner (line 217) `flex justify-between` with long copy + Upgrade button                                                            | `flex-col items-start gap-2 sm:flex-row sm:items-center`; `mx-4 sm:mx-6`     |
| 5   | 🟠  | "Photos ready" pill + Regenerate on one row                                                                                                   | `flex-wrap`                                                                  |
| 6   | 🟡  | `alert()` on generate failure (line 133) — native alert is jarring on mobile                                                                  | Replace with the `Toast` from `@chefer/ui`                                   |
| 7   | 🟡  | `GenerateOverlay` — verify it covers the bottom nav (`z-50` > nav `z-40` ✓) and uses `dvh`                                                    |

### 4.3 `/recipes` — `app/(dashboard)/recipes/page.tsx` 🟠

Grid is already `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` — the best-behaved page in the app.

| #   | Sev | Problem                                                                                                                                            | Fix                                                                                                                       |
| --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🟠  | Header (line 59) title + "Create Recipe" button `justify-between` — cramped at 375 px                                                              | Icon-only FAB on mobile: `<Plus>` in a 56 px circle, `fixed bottom-20 right-4 lg:static`; or `flex-col gap-3 sm:flex-row` |
| 2   | 🟠  | `px-6 py-8`                                                                                                                                        | `px-4 py-6 sm:px-6 sm:py-8`                                                                                               |
| 3   | 🟠  | Tabs (line 76) `flex gap-1 border-b` — three tabs at `px-4` ≈ 300 px, fits but no margin                                                           | `overflow-x-auto` + `.scroll-rail`, `whitespace-nowrap`; min height 44 px                                                 |
| 4   | 🟡  | Heart/edit overlay buttons `h-8 w-8` at `right-3 top-3`                                                                                            | `h-11 w-11` on mobile                                                                                                     |
| 5   | 🟡  | Search debounce writes to `window._st` (line 28) — global mutable state, unrelated to mobile but should become a `useRef` while touching this file | Refactor                                                                                                                  |

### 4.4 `/recipes/[id]` — `app/(dashboard)/recipes/[id]/page.tsx` 🟠

| #   | Sev | Problem                                                                                                        | Fix                                                                      |
| --- | --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | 🔴  | Servings ± buttons (line 283, 290) are `h-5 w-5` = **20 px**                                                   | `h-9 w-9` visual, 44 px hit area                                         |
| 2   | 🟠  | `px-6 py-8`                                                                                                    | `px-4 py-6 sm:px-6 sm:py-8`                                              |
| 3   | 🟠  | Action bar (line 191) — Save + Choose Recipe + Swap Recipe wrap into a ragged block                            | `grid grid-cols-2 gap-2 sm:flex sm:flex-wrap`; buttons `min-h-11`        |
| 4   | 🟠  | Back link + context pill (line 130) `justify-between` — "Back to Meal Planner" + "Dinner · Wednesday" ≈ 300 px | Truncate back label to "Back" below `sm`                                 |
| 5   | 🟠  | Macro chips (line 268) `grid-cols-4` — 4 × ~78 px                                                              | Acceptable, but drop to `grid-cols-2 sm:grid-cols-4` if the values wrap  |
| 6   | 🟠  | Hero image `h-56` fixed                                                                                        | `h-48 sm:h-56 lg:h-72`                                                   |
| 7   | 🟠  | `SavedRecipePicker` (line 450) — `max-h-[80vh] max-w-md` centred dialog                                        | Migrate to the `Sheet` primitive (§2.5): bottom sheet on mobile, `85dvh` |
| 8   | 🟡  | Ingredients/instructions `md:grid-cols-[280px_1fr]` already stacks                                             | ✓                                                                        |
| 9   | 🟡  | `StarRatingWidget` star hit areas                                                                              | Verify ≥ 44 px                                                           |

### 4.5 `/recipes/new` and `/recipes/[id]/edit` 🔴

Two near-identical 730/544-line forms. **Extract the shared form into `features/recipes/components/recipe-form.tsx` before doing the responsive work** — otherwise every fix below is done twice and will drift.

| #   | Sev | Problem                                                                                                                                                                        | Fix                                                                                                                      |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | 🔴  | Ingredient row (line 473): `IngredientPicker` (flex-1) + `w-20` qty + `w-28` unit + `w-8` delete = **248 px of fixed width**, leaving ~95 px for the ingredient name at 375 px | Stack: picker on row 1 full-width; qty + unit + delete on row 2. `flex-col gap-2 sm:flex-row sm:items-center`            |
| 2   | 🔴  | All inputs `text-sm` → iOS zoom                                                                                                                                                | Covered by §2.3 base rule; verify `inputCls` (line 726) does not re-specify `text-sm` — change to `text-base sm:text-sm` |
| 3   | 🟠  | Prep/Cook/Servings `grid-cols-3` (line 374) — labels "Prep Time (mins)" wrap to 3 lines in ~105 px                                                                             | Keep `grid-cols-3`, shorten labels to "Prep (min)" / "Cook (min)" / "Servings"                                           |
| 4   | 🟠  | Photo section (line 407) `flex items-start gap-4` — 144 px preview + button column                                                                                             | `flex-col sm:flex-row`; preview `w-full sm:w-36`                                                                         |
| 5   | 🟠  | Manual-nutrition inputs `grid-cols-2 sm:grid-cols-5`                                                                                                                           | ✓ already responsive                                                                                                     |
| 6   | 🟠  | Submit row (line 630) `flex justify-end gap-3`                                                                                                                                 | Sticky action bar on mobile: `sticky bottom-16 -mx-4 border-t bg-white px-4 py-3 pb-safe`; buttons full-width stacked    |
| 7   | 🟠  | `px-6 py-8`                                                                                                                                                                    | `px-4 py-6 sm:px-6 sm:py-8`                                                                                              |
| 8   | 🟡  | `IngredientPicker` dropdown (line 704) `absolute z-30` — may open below the fold near the page bottom                                                                          | Flip upward when < 200 px of space remains, or use a full-screen picker sheet on mobile                                  |
| 9   | 🟡  | Instruction `<textarea rows={2}>`                                                                                                                                              | Auto-grow, `rows={3}` on mobile                                                                                          |

### 4.6 `/ingredients` — `app/(dashboard)/ingredients/page.tsx` 🟠

Best breakpoint coverage in the app (6 utilities), grid is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.

| #   | Sev | Problem                                                                                                        | Fix                                            |
| --- | --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | 🟠  | Header "Add Ingredient" button vs. title (line 72)                                                             | Same FAB treatment as §4.3 #1                  |
| 2   | 🟠  | Edit/Delete text links (line 191) at `text-[11px]` with 12 px icons — tiny tap targets, adjacent to each other | 44 px targets, `gap-4` separation              |
| 3   | 🟠  | Delete confirm dialog (line 255)                                                                               | Migrate to `Sheet`                             |
| 4   | 🟠  | `px-6 py-8`                                                                                                    | `px-4 py-6 sm:px-6 sm:py-8`                    |
| 5   | 🟡  | Card macro line `text-[11px]` with 4 values — wraps awkwardly in a 2-col mobile grid                           | Single column below `sm` is already the case ✓ |

### 4.7 `/shopping-list` — `app/(dashboard)/shopping-list/page.tsx` 🟠

The most mobile-relevant page in the app (you use it _in a shop_). It deserves the most care.

| #   | Sev | Problem                                                                                                                                                    | Fix                                                                                                                                                  |
| --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🔴  | Header actions (line 144): Regenerate + Print + "Send to Mobile", three ~150 px buttons in a `flex gap-2`                                                  | Below `sm`: keep Regenerate as a full-width primary; move Print + Send-to-Mobile into an overflow "⋯" menu. Print is near-useless on a phone anyway. |
| 2   | 🟠  | Item row (line 261) — whole card toggles, but thumbnail _and_ name `stopPropagation` to open a popup. On touch this is a coin-flip; mis-taps are constant. | Make the entire row a single toggle. Add an explicit ⓘ button (44 px) for the detail popup.                                                          |
| 3   | 🟠  | Item row content: 48 px thumb + name + price + `✓ BOUGHT` badge + 24 px checkbox → name gets ~150 px and truncates                                         | Two-line: name + quantity on line 1–2, price right-aligned; drop the redundant "BOUGHT" badge on mobile (strikethrough already conveys it)           |
| 4   | 🟠  | Checkbox `h-6 w-6` = 24 px, the single most-tapped control on the page                                                                                     | `h-11 w-11` hit area on mobile                                                                                                                       |
| 5   | 🟠  | `WeekNavigator` `min-w-[180px]` label + two `h-8 w-8` round buttons                                                                                        | `min-w-0 flex-1`; arrows to 44 px; shorten label to "18–24 Aug" below `sm`                                                                           |
| 6   | 🟠  | Progress bar + est. total row (line 188) `flex-wrap gap-4`                                                                                                 | ✓ wraps; make the progress bar `w-full` below `sm`                                                                                                   |
| 7   | 🟠  | Item detail popup (line 358) `w-72` fixed with a 192 px image                                                                                              | Migrate to `Sheet`                                                                                                                                   |
| 8   | 🟡  | `p-4 lg:p-6`                                                                                                                                               | ✓ already responsive                                                                                                                                 |
| 9   | 🟡  | Consider a "keep screen awake" hint or sticky progress header for in-store use                                                                             | Nice-to-have                                                                                                                                         |

### 4.8 `/tracker` — `app/(dashboard)/tracker/page.tsx` 🟠

`max-w-2xl px-4 py-8` — narrow by design, so it mostly survives. Touch targets are the issue.

| #   | Sev | Problem                                                                                                       | Fix                                                                                 |
| --- | --- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | 🔴  | Portion pills ½× 1× 1½× 2× (line 282) at `px-2 py-0.5 text-xs` ≈ **34 × 20 px**, four of them adjacent        | `min-h-11 px-3` on mobile; or convert to a segmented control spanning the row width |
| 2   | 🔴  | Meal check button (line 268) `h-6 w-6` — the primary action of the page                                       | `h-11 w-11` hit area                                                                |
| 3   | 🟠  | Date arrows (line 148, 161) `p-1.5` around a 20 px icon ≈ 32 px                                               | `min-h-11 min-w-11`                                                                 |
| 4   | 🟠  | Meal card (line 240) `flex gap-3` — 56 px image + badge + name + check + portions. Portions row can overflow. | `flex-wrap` the portion row; give the details column `min-w-0`                      |
| 5   | 🟠  | Save button is at the bottom of a long scroll                                                                 | `sticky bottom-16 pb-safe` on mobile                                                |
| 6   | 🟡  | Macro summary bars                                                                                            | ✓ fine                                                                              |

### 4.9 `/progress` — `app/(dashboard)/progress/page.tsx` 🟠

| #   | Sev | Problem                                                                                                                 | Fix                                                                                                                     |
| --- | --- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | 🟠  | Stat cards `grid-cols-3` (line 78) — label "Days logged (28d)" in ~100 px wraps to 3 lines with an inline icon          | `grid-cols-1 gap-3 sm:grid-cols-3`, or keep 3-up and shorten to "Days logged" / "Avg kcal" / "vs target"                |
| 2   | 🟠  | 28-day charts with `interval={3}` (line 137, 178) → 7 `dd MMM` labels ≈ 40 px each in a ~300 px plot area; they collide | Responsive: 14 days + `interval="preserveStartEnd"` below `sm`; add a 7d/28d/90d range toggle                           |
| 3   | 🟠  | `BarChart` legend `iconSize={8} fontSize:10`                                                                            | `fontSize: 11`, `verticalAlign="top"` on mobile                                                                         |
| 4   | 🟠  | Recharts `Tooltip` is hover-driven — **on touch there is no hover**. Tooltips are effectively unreachable on mobile.    | Enable tap-to-show: `<Tooltip trigger="click">` (Recharts 3.x) and add `activeDot={{ r: 6 }}` for a bigger touch target |
| 5   | 🟠  | Weight input + Log button `flex gap-2` — placeholder "Weight in kg (e.g. 72.5)" truncates                               | Shorten placeholder to "72.5"; add a `kg` suffix; `inputMode="decimal"`                                                 |
| 6   | 🟡  | `px-4 py-8`                                                                                                             | `px-4 py-6 sm:py-8`                                                                                                     |

### 4.10 `/history` and `/history/[planId]` 🔴

**`/history`** (`page.tsx`) — 🟡 mostly fine (`max-w-2xl px-4 py-8`).

- `PlanHistoryCard` macro row (line 422) `flex gap-4` with four values — verify no overflow at 320 px; `flex-wrap gap-x-4 gap-y-1`.
- Recipe preview chips already `flex-wrap` ✓.
- Action buttons `flex gap-2` with two `flex-1` buttons ✓, but raise to `min-h-11`.

**`/history/[planId]`** — 🔴 same `min-w-[700px] grid-cols-7` problem as the meal planner (line 73).

- Reuse the mobile day-view component built in §4.2. This is the main reason to extract `week-grid`/`day-view` as shared components rather than inlining them in the meal-plan page.
- Loading skeleton (line 246) also hard-codes `grid-cols-7` — mirror the new layout.

### 4.11 `/preferences` — page + `preferences-form.tsx` 🟠

| #   | Sev | Problem                                                                                                                                                                                      | Fix                                                                                                                             |
| --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🟠  | `Section` wrapper `p-6` (form line 113) × 6 sections                                                                                                                                         | `p-4 sm:p-6`                                                                                                                    |
| 2   | 🟠  | Save bar (line 341) `flex items-center justify-end gap-4` — the "Fill in your goal, biological sex, age, height, weight, and activity level to save." helper text plus the button on one row | `flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end`; make it `sticky bottom-16 pb-safe` on mobile |
| 3   | 🟠  | Nutrition preview `grid-cols-2 sm:grid-cols-4` ✓, but `text-2xl` values in a 2-col mobile grid                                                                                               | ✓ fine                                                                                                                          |
| 4   | 🟠  | Units toggle (line 272) `flex gap-2` with "Metric (g, ml)" / "Imperial (oz, cups)" ≈ 320 px                                                                                                  | `grid grid-cols-2 gap-2`; `min-h-11`                                                                                            |
| 5   | 🟠  | Currency `<select>` at `text-sm` → iOS zoom                                                                                                                                                  | Covered by §2.3                                                                                                                 |
| 6   | 🟡  | Page `max-w-2xl px-4 py-10`                                                                                                                                                                  | `py-6 sm:py-10`                                                                                                                 |

### 4.12 `/onboarding` + wizard steps 🟠

`onboarding-wizard.tsx` is a three-band layout (progress / content / nav).

| #   | Sev | Problem                                                                                                                                                 | Fix                                                              |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | 🔴  | `min-h-[calc(100vh-4rem)]` (line 106) — `100vh` on mobile Safari is taller than the visible area, so the sticky nav band sits under the browser toolbar | `min-h-[calc(100dvh-4rem)]`                                      |
| 2   | 🟠  | Bottom nav band (line 183) is a static flex child — scrolls away on long steps                                                                          | `sticky bottom-0 z-10 pb-safe`                                   |
| 3   | 🟠  | Step headings `text-3xl` (step-goal:46, step-diet:136, step-cuisine:57, step-metrics:214)                                                               | `text-2xl sm:text-3xl`                                           |
| 4   | 🟠  | Content padding `py-10`                                                                                                                                 | `py-6 sm:py-10`                                                  |
| 5   | 🟠  | `step-goal` grid `grid-cols-1 sm:grid-cols-2` with `p-6` cards ✓                                                                                        | `p-4 sm:p-6`                                                     |
| 6   | 🟠  | `step-diet` diet-type grid `grid-cols-2 sm:grid-cols-4` ✓                                                                                               | ✓                                                                |
| 7   | 🟠  | `step-cuisine` grid `grid-cols-2 sm:grid-cols-3` ✓; meals/serving pills `flex gap-2`                                                                    | Pills to `min-h-11`                                              |
| 8   | 🟠  | `step-metrics` cm/ft and kg/lbs toggles `px-3 py-1.5` ≈ 34 px tall                                                                                      | `min-h-11`                                                       |
| 9   | 🟠  | `step-metrics` inputs `h-10` with `text-sm` → iOS zoom                                                                                                  | Covered by §2.3; keep `inputMode` attributes (already correct ✓) |
| 10  | 🟡  | Live calorie estimate card `text-4xl`                                                                                                                   | `text-3xl sm:text-4xl`                                           |

### 4.13 `/profile` — `app/(dashboard)/profile/page.tsx` 🟡

- `max-w-lg px-6 py-8` → `px-4 py-6 sm:px-6 sm:py-8`.
- User info card `flex items-center gap-4` with a 56 px avatar ✓.
- Gemini usage `grid-cols-3` (line 160) with labels "Meal plans"/"Swaps"/"Shopping lists" — the last wraps; acceptable, or `grid-cols-3 text-[11px]`.
- Card `p-5` → `p-4 sm:p-5`.

### 4.14 `/login`, `/register`, `/` (landing) 🟡

**Auth pages** are the healthiest in the app — `max-w-md`, centred, single-column.

- `min-h-screen` → `min-h-dvh` (both pages + `login/loading.tsx`).
- Card `p-8` → `p-6 sm:p-8`.
- `py-12` → `py-8 sm:py-12`.
- `login-form.tsx` / `register-form.tsx`: inputs are `h-10 text-sm` → iOS zoom; covered by §2.3. Password-toggle button (`login-form.tsx:123`) is a 16 px icon in an `inset-y-0 pr-3` strip — the hit area is tall but only ~28 px wide; widen to 44.
- "Remember me" checkbox `h-4 w-4` — wrap the label so the whole label is tappable (it already uses `htmlFor` ✓).

**Landing page** (`app/page.tsx`):

- Hero `py-28` → `py-16 sm:py-24 lg:py-28`.
- `h1 text-5xl sm:text-6xl` → `text-3xl sm:text-5xl lg:text-6xl`.
- Sub-copy `text-xl` → `text-base sm:text-xl`.
- CTA buttons `h-12 px-8` in `flex-wrap justify-center` ✓ — make them `w-full sm:w-auto` below `sm`.
- Features `grid-cols-1 sm:grid-cols-3` ✓; card `p-8` → `p-6 sm:p-8`.
- Section `py-20` → `py-12 sm:py-20`.

### 4.15 `/error`, `/not-found`, `/user` 🟡

- `min-h-screen` → `min-h-dvh` in all three.
- `app/user/page.tsx` appears to be a leftover scaffold page — confirm and delete.

---

## 5. Shared component fixes

### 5.1 `MealCard` — `features/meal-plan/components/MealCard.tsx` 🟠

Currently a fixed vertical card: `h-24` image + `h-[88px]` body, sized for a ~120 px desktop grid column.

Add a `variant` prop:

- `"grid"` (default, desktop) — unchanged.
- `"row"` (mobile day view) — horizontal: 80 × 80 image left, name + time/kcal + macros right, `min-h-24`, full width.

Also: name is `text-[12px]` and macros `text-[10px]` — bump the row variant to `text-sm` / `text-xs`.

### 5.2 `ChatWidget` — `features/chat/components/ChatWidget.tsx` 🔴

| #   | Sev | Problem                                                                                                                       | Fix                                                                                                                               |
| --- | --- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🔴  | FAB at `fixed bottom-6 right-6` will sit **on top of the new bottom nav**                                                     | `bottom-20 lg:bottom-6` (nav is 64 px + safe area)                                                                                |
| 2   | 🔴  | Panel `fixed bottom-24 right-6 w-80` — 320 px + 24 px offset on a 320 px device overflows; on 375 px it leaves a 31 px sliver | Below `sm`: full-width bottom sheet — `inset-x-0 bottom-0 rounded-t-2xl max-h-[80dvh] pb-safe`. At `sm+`: current floating panel. |
| 3   | 🟠  | Messages area `max-h-80` (320 px) fixed                                                                                       | `max-h-[55dvh] sm:max-h-80`                                                                                                       |
| 4   | 🟠  | Input `text-sm` → iOS zoom, and the on-screen keyboard will cover the panel                                                   | `text-base sm:text-sm`; use `visualViewport` resize handling or `interactive-widget=resizes-content` in the viewport meta         |
| 5   | 🟠  | Send button `h-9 w-9`                                                                                                         | `h-11 w-11`                                                                                                                       |
| 6   | 🟡  | Suggested-prompt buttons `text-xs`                                                                                            | `text-sm` on mobile                                                                                                               |

### 5.3 `IngredientFormModal` 🟠

- Macro inputs `grid-cols-5` (line 206) → ~52 px per field at 375 px. Change to `grid-cols-3 sm:grid-cols-5`.
- Price inputs `grid-cols-3` (line 255) → `grid-cols-2 sm:grid-cols-3`.
- `max-h-[90vh]` → `max-h-[90dvh]`; better, migrate to `Sheet`.
- Close button `p-1` around a 16 px icon ≈ 24 px → 44 px.

### 5.4 `WeekNavigator` 🟠

- `min-w-[180px]` label → `min-w-0 flex-1 truncate`.
- Arrows `h-8 w-8` → `h-11 w-11 sm:h-8 sm:w-8`.
- Label format: `dd MMM – dd MMM yyyy` is ~26 chars; below `sm` drop the year.

### 5.5 `IngredientPicker` 🟠

- Dropdown `absolute z-30 max-h-56` — near the viewport bottom it opens off-screen and the on-screen keyboard covers it.
- Mobile: promote to a full-screen search sheet (search field pinned to top, results scroll, "Create custom" pinned to bottom).
- Result rows `py-2` ≈ 40 px → `py-3`.

### 5.6 `UpgradeButton` / `UpgradeCard` 🟡

- Dialog → `Sheet`.
- Button `px-3 py-1.5 text-xs` ≈ 30 px tall → `min-h-11` when used standalone; the sidebar/banner usages can stay compact at `sm+`.

### 5.7 `packages/ui` primitives 🟡

- `Button`: sizes are `h-10 / h-9 / h-11 / h-10 w-10`. Add a `touch` size (`h-11 min-w-11`) or make `default` `h-11 sm:h-10`.
- `Input`: `h-10 text-sm` → `h-11 text-base sm:h-10 sm:text-sm`.
- `Toast`: `fixed bottom-6 right-6 max-w-sm` — will collide with the bottom nav and the chat FAB. Change to `inset-x-4 bottom-20 sm:inset-x-auto sm:right-6 sm:bottom-6`.
- `Card`: `p-6` in header/content/footer → `p-4 sm:p-6`.

---

## 6. Cross-cutting concerns

### 6.1 Horizontal-overflow discipline

After every phase, assert that `document.documentElement.scrollWidth <= window.innerWidth` at 320/375/390/430 px. The usual culprits are missing `min-w-0` on flex children and un-truncated long strings (recipe names, ingredient names, email addresses in the header dropdown).

### 6.2 Charts (Recharts)

Three pages use Recharts. Beyond the per-page notes:

- `ResponsiveContainer` needs a parent with a resolved width — verify inside the new flex layouts.
- **Touch has no hover.** Every `<Tooltip>` in the app is currently desktop-only. Either enable click-triggered tooltips or render the values as text below the chart on mobile.
- Consider `recharts`'s `syncId` if the progress page's two charts should scrub together.

### 6.3 Images

- `next.config.ts` sets `images.unoptimized: true` in production, so `sizes` is ignored and phones fetch full-resolution images. Either re-enable the optimizer (and accept the VM CPU cost) or, since images are already on Cloudinary/Pollinations, append width transforms at URL-build time in `lib/recipe-image.ts`.
- Two components use raw `<img>` with eslint-disable (`ingredients/page.tsx:150`, `IngredientPicker.tsx:714`, `recipes/new/page.tsx:411`) — these bypass all optimization. Low priority, but note them.

### 6.4 Scroll and keyboard behaviour

- Body scroll lock whenever a sheet/drawer is open (part of the `Sheet` primitive).
- On-screen keyboard: add `interactive-widget=resizes-content` to the viewport meta so sticky bottom bars are pushed up rather than covered. Next's `Viewport` type does not expose this — add it via a raw `<meta>` in `layout.tsx` if needed.
- `scroll-behavior: smooth` should respect `prefers-reduced-motion`.

### 6.5 Accessibility (checked while doing this work)

- Every icon-only button needs `aria-label` — most already have one; the shopping-list ⓘ, chat close, and new nav buttons will need them.
- Bottom nav: `<nav aria-label="Primary">`, `aria-current="page"`.
- Drawer/sheets: `role="dialog"`, `aria-modal="true"`, focus trap, focus restore.
- Respect `prefers-reduced-motion` for the sheet/drawer transitions.
- Colour contrast: `#944a00` on `#fff3e8` passes AA; `text-gray-400` on white (`#9ca3af`) is **3.0:1 — fails AA for body text** and is used extensively for labels. Move label text to `text-gray-500` (4.6:1).

---

## 7. Implementation phases

| Phase | Content                                                                                                                                          | Est.       | Unblocks   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------- |
| **0** | §2 foundations: breakpoint contract, `globals.css`, viewport, Tailwind config, `Sheet`/`Drawer`/`ScrollRail` primitives, delete dead code (§1.4) | 1 day      | everything |
| **1** | §3 app shell: `DashboardShell` rewrite, `BottomNav`, `MobileNavDrawer`, `TopHeader`, shared `nav-items.ts`                                       | 1–1.5 days | all pages  |
| **2** | High-traffic pages: `/dashboard` (§4.1), `/shopping-list` (§4.7), `/tracker` (§4.8), `/recipes` (§4.3), `/recipes/[id]` (§4.4)                   | 2 days     | —          |
| **3** | Meal-plan redesign: `week-grid` / `day-view` extraction, `MealCard` row variant, `/meal-plan` (§4.2), `/history/[planId]` (§4.10)                | 2 days     | —          |
| **4** | Forms: extract `recipe-form.tsx`, `/recipes/new` + `/edit` (§4.5), `/preferences` (§4.11), `/onboarding` (§4.12), `/ingredients` (§4.6)          | 2 days     | —          |
| **5** | Long tail: `/progress` (§4.9), `/history` (§4.10), `/profile` (§4.13), auth + landing (§4.14), `ChatWidget` (§5.2), `packages/ui` (§5.7)         | 1.5 days   | —          |
| **6** | Verification: Playwright mobile specs, contrast pass, real-device sweep                                                                          | 1 day      | —          |

**Total ≈ 11 days.** Phases 2–5 are independent of one another and can be parallelised after Phase 1 lands.

---

## 8. Verification

### 8.1 Viewport matrix

| Device                    | Width × Height | Why                                    |
| ------------------------- | -------------- | -------------------------------------- |
| iPhone SE (2nd/3rd)       | 375 × 667      | Smallest widely-used iOS device        |
| Galaxy S8 / small Android | 360 × 740      | Narrowest realistic target             |
| iPhone 12/13/14           | 390 × 844      | Median iOS; has notch + home indicator |
| iPhone 14 Pro Max         | 430 × 932      | Large phone                            |
| iPad Mini portrait        | 768 × 1024     | `md` boundary                          |
| iPad Pro landscape        | 1024 × 1366    | **`lg` boundary — sidebar appears**    |
| Desktop                   | 1440 × 900     | Regression baseline                    |

Also test 320 px (`overflow-x` only) and 390 × 844 **landscape** (844 × 390 — short viewport, sticky bars must not eat the screen).

### 8.2 Playwright

`tests/playwright.config.ts` already defines `Mobile Chrome` (Pixel 5) and `Mobile Safari` (iPhone 12) projects — currently only `e2e/home.spec.ts` exists. Add:

- `e2e/mobile-nav.spec.ts` — bottom nav renders < `lg` and not at `lg+`; drawer opens/closes; every nav item routes correctly; drawer closes on navigation.
- `e2e/mobile-overflow.spec.ts` — for each of the 14 routes, assert `scrollWidth <= clientWidth` at 320/375/430 px. This is the single highest-value test in the suite.
- `e2e/mobile-touch-targets.spec.ts` — query all `button, a, [role="button"]`, assert `boundingBox()` ≥ 44 × 44 (allow an explicit allow-list for decorative elements).
- `e2e/mobile-meal-plan.spec.ts` — day view renders on mobile, day switching works, grid renders at `lg`.
- Visual regression snapshots per route × viewport.

### 8.3 Manual checklist (per page)

- [ ] No horizontal document scroll at 320 px.
- [ ] No content hidden behind the bottom nav or home indicator.
- [ ] Every interactive element ≥ 44 × 44 px.
- [ ] Focusing any input does **not** zoom the page (real iOS Safari — the simulator does not reproduce this).
- [ ] Sticky/fixed bars survive on-screen-keyboard open.
- [ ] Back-navigation restores scroll position.
- [ ] Landscape at 390 px height is usable.
- [ ] Modals/sheets trap focus and close on Escape and backdrop tap.
- [ ] Nothing depends on hover to be discoverable or usable.

### 8.4 Lighthouse

Target on the mobile preset: Performance ≥ 80, Accessibility ≥ 95, Best Practices ≥ 95. Run against `/dashboard`, `/meal-plan`, `/shopping-list`.

---

## 9. Documentation updates (required by `CLAUDE.md`)

Per the documentation-maintenance table, this work triggers:

| Change                                                         | Doc to update                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| New nav components (`BottomNav`, `MobileNavDrawer`)            | `infrastructure.md` §4                                                |
| New `packages/ui` components (`Sheet`, `Drawer`, `ScrollRail`) | `infrastructure.md` §1, §5                                            |
| Mobile day-view IA for `/meal-plan` and `/history/[planId]`    | `business_flow.md`                                                    |
| Deleted dead components (§1.4)                                 | `infrastructure.md` §5                                                |
| Breakpoint contract + responsive conventions                   | New "Responsive design" section in `CLAUDE.md` under Code Conventions |

No API, schema, env-var, or CI changes — §6, §8, §10, §13 are untouched.

---

## 10. Definition of done

1. Every route in §4 passes the §8.3 checklist at 320, 375, 390, and 430 px.
2. `e2e/mobile-overflow.spec.ts` and `e2e/mobile-touch-targets.spec.ts` pass in both mobile Playwright projects.
3. Desktop (≥ `lg`) rendering is **pixel-identical** to today, except for the deliberate changes in §4.1 #8 (dashboard rail breakpoint `lg` → `xl`) and §5.7 (`packages/ui` sizing).
4. `pnpm lint`, `pnpm typecheck`, and `pnpm test` are green.
5. Docs in §9 are updated in the same PR series.
6. Verified by hand on one real iOS device and one real Android device — the iOS input-zoom and `100vh` behaviours do not reproduce in emulators.
