# Chefer design canvas — board conventions (READ FULLY before writing a board)

Every board is ONE file `project/<Name>.dc.html` on the canvas (mirrored in `docs/design/mobile/`).
NOTE: this is the v1 base — its colours/type/chrome are superseded by conventions-v2.md; keep its file skeleton, HARD RULES, sheet pattern and placeholders.
It is a faithful redraw of the CURRENT Chefer mobile app (Expo, iPhone 390pt wide). Fidelity beats invention:
use the exact copy strings, colors and sizes from the inventory. Use realistic example data, never lorem ipsum.

## File skeleton (copy exactly; only change title, body, H)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Food — Today</title>
    <script src="./support.js"></script>
  </head>
  <body>
    <x-dc>
      <helmet>
        <style>
          body {
            margin: 0;
          }
          a {
            color: #944a00;
            text-decoration: none;
          }
          a:hover {
            color: #6e3700;
          }
          input::placeholder,
          textarea::placeholder {
            color: #9ca3af;
          }
        </style>
      </helmet>
      <div
        style="width: 390px; height: 844px; position: relative; overflow: hidden; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif; color: #020817; display: flex; flex-direction: column"
      >
        ... content ...
      </div>
    </x-dc>
    <script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
      class Component extends DCLogic {
      renderVals() {
      return {};
      }
      }
    </script>
  </body>
</html>
```

HARD RULES (each fails silently if broken):

- Keep `<script src="./support.js"></script>` exactly. Close every non-void element; quote every attribute.
- All styling INLINE `style="…"` (helmet only holds the base rules above). Lay out with flex/grid + gap.
- `{{hole}}` = dotted lookup into renderVals() only, never an expression.
- No emoji icons — icons are inline `<svg>` from icons.md (emoji that the APP ITSELF renders as content, e.g. goal cards ⚖️ 🎯 💪 🥗, cuisine pills 🍝, 🎉 on cook finished, 🏆 on PR rows — keep those, they are real copy).
- No images files: photos are placeholders: `<div style="background: #eadccd; display: flex; align-items: center; justify-content: center; color: #8a7560; font-size: 12px">Photo</div>` sized like the real image.
- Real `<button>`, `<a href>`, `<input>`/`<textarea>` with `aria-label` or `<label for>`. Icon-only buttons get `aria-label`. Decorative svg `aria-hidden="true"`.
- No `<iframe>`, no innerHTML, no script-built UI, no global key handlers, no network.
- Root fixed at 390 × H. H = full scroll height of the content (show the whole screen scrolled out; tall is fine). The `$preview` height MUST equal H.

## Safe areas (no fake status bar)

- Top: `<div style="height: 47px; flex: none"></div>` as first child (empty = where iOS status bar sits).
- Tab roots end with the tab bar (83px, below). Stack screens end with a 34px empty home-indicator spacer.
- Sticky footers (cook mode, workout rest bar, onboarding bottom bar) sit at the bottom above the 34px spacer.

## Spacing scale — NativeWind rem = 14px (IMPORTANT)

1=3.5 · 1.5=5.25 · 2=7 · 2.5=8.75 · 3=10.5 · 4=14 · 5=17.5 · 6=21 · 8=28 · 10=35 · 12=42 · 14=49 · 16=56 · 24=84 · 28=98.
`11` is pinned to 44px (h-11 / w-11 / min-h-11). h-12 = 42px. h-14 = 49. h-40 = 140, h-56 = 196, h-28 = 98, w-24 = 84, w-36 = 126 (but ModeSwitch w-36 → 126px).
Radius: rounded-md 5.25 · rounded-lg 7 · rounded-xl 10.5 · rounded-2xl 14 · rounded-3xl 21 · full 9999.
Screen side padding px-4 = 14px. Section gap gap-4 = 14px.

## Type ramp (px size / line-height) — system font

xs 13/18 · sm 15/21 · base 17/24 · lg 19/26 · xl 21/28 · 2xl 25/31 · 3xl 31/37. Labels in tab bar 12px/600. `text-[12px]` pills 12px.
Variants: title = 25/31 bold · heading = 19/26 semibold(600) · label = 15 medium(500) · muted = 15 #8a7560 · eyebrow = 13px 600 uppercase letter-spacing .1em #6b7280.

## Colors

primary #944a00 · primary-foreground #fcf9f5 · accent #fcf3ea · muted/secondary #faf5f0 · muted-foreground #8a7560
border/input #e2e8f0 · foreground #020817 · card/background #ffffff · destructive #ef4444
gray-50 #f9fafb · gray-100 #f3f4f6 · gray-300 #d1d5db · gray-400 #9ca3af · gray-500 #6b7280 · gray-600 #4b5563 · gray-700 #374151 · gray-800 #1f2937 · gray-900 #111827
emerald-50 #ecfdf5 · emerald-100 #d1fae5 · emerald-200 #a7f3d0 · emerald-600 #059669 · emerald-700 #047857 · emerald-800 #065f46 · emerald-900 #064e3b
amber-50 #fffbeb · amber-100 #fef3c7 · amber-200 #fde68a · amber-300 #fcd34d · amber-500 #f59e0b · amber-600 #d97706 · amber-700 #b45309 · amber-800 #92400e · amber-900 #78350f
red-50 #fef2f2 · red-100 #fee2e2 · red-200 #fecaca · red-600 #dc2626 · red-700 #b91c1c · red-800 #991b1b
orange-100 #ffedd5 / orange-700 #c2410c · indigo-100 #e0e7ff / indigo-700 #4338ca · purple-100 #f3e8ff / purple-700 #7e22ce
blue-50 #eff6ff · blue-100 #dbeafe · blue-600 #2563eb · blue-700 #1d4ed8 · blue-800 #1e40af
violet-100 #ede9fe · violet-500 #8b5cf6 · violet-800 #5b21b6
Meal type pill: BREAKFAST emerald-100/#047857 · LUNCH #ffedd5/#c2410c · DINNER #e0e7ff/#4338ca · SNACK #f3e8ff/#7e22ce (12px 600 uppercase, padding 1.75px 8.75px, radius full)
Primary at 30% border = rgba(148,74,0,.3); primary/20 = rgba(148,74,0,.2).

## Primitives (markup to copy)

Button default (h44, radius 5.25, 15px 500):
`<button type="button" style="height: 44px; padding: 0 14px; border: none; border-radius: 5.25px; background: #944a00; color: #fcf9f5; font: inherit; font-size: 15px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 7px">Sign in</button>`
outline: `background: #ffffff; border: 1px solid #e2e8f0; color: #020817`
secondary: `background: #faf5f0; color: #3a2414; border: none`
ghost: `background: transparent; border: none; color: #944a00`
destructive: `background: #ef4444; color: #ffffff`
lg: height 42px, padding 0 28px. Disabled: opacity .5.
Navigation buttons are `<a href="Target.dc.html" style="…same button styles…; text-decoration: none">Label</a>`.

Card: `border: 1px solid #e2e8f0; border-radius: 7px; background: #ffffff; padding: 14px` (no shadow). CardTitle = heading 19px 600, margin-bottom 7px.
Input: `<input aria-label="Email" placeholder="you@example.com" style="height: 44px; box-sizing: border-box; width: 100%; border: 1px solid #e2e8f0; border-radius: 5.25px; padding: 0 10.5px; font: inherit; font-size: 17px; color: #020817; background: #ffffff">`
Field = `<label>` (15px 500) above input, gap 3.5px.
Chip: min-height 44px, padding 0 14px, radius 9999, border 1px #e2e8f0, bg #fff, 15px 500. Selected: bg #944a00, border #944a00, color #fcf9f5.
Badge: radius 9999, padding 1.75px 8.75px, 13px 600. success #d1fae5/#065f46 · warning #fef3c7/#92400e · info #dbeafe/#1e40af · secondary #faf5f0/#3a2414 · default #944a00/#fcf9f5.
SegmentedControl: track `background: #faf5f0; border-radius: 7px; padding: 4px; display: flex`; thumb segment `background: #ffffff; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,.08); color: #020817`; other segments transparent color #8a7560; each segment flex 1, min-height 36px (44 total), 15px 500 centered. xs size: total height 28px, 13px text.
ProgressBar: track `height: 7px; border-radius: 9999px; background: #f3f4f6; overflow: hidden` + fill `height: 100%; width: 62%; background: #944a00; border-radius: 9999px`.
ProgressRing: inline svg: `<svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="58" fill="none" stroke="#f3f4f6" stroke-width="12"/><circle cx="64" cy="64" r="58" fill="none" stroke="#944a00" stroke-width="12" stroke-linecap="round" stroke-dasharray="364.4" stroke-dashoffset="149" transform="rotate(-90 64 64)"/></svg>` (dasharray = 2πr; offset = dasharray × (1 − pct)). Overlay centered text with a position:relative wrapper.
Stepper: `[−] value [+]`, buttons 44×44 radius 5.25 bg #faf5f0 glyph 21px 600 color #020817; value 17px 600 tabular-nums, min-width 42 centered, optional 12px #8a7560 caption below.
Switch (iOS): track 51×31 radius 9999 bg #944a00 (on) / #d1d5db (off), white 27px knob with shadow.
Eyebrow: `font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: #6b7280`.
Dashed empty card: `border: 1px dashed #d1d5db; border-radius: 14px; background: #f9fafb; padding: 56px 21px; text-align: center`.

## Chrome

ModeSwitch row (first content row on every TAB ROOT, inside px-14 container, margin-top 10.5):

```html
<div style="display: flex; align-items: center; justify-content: space-between">
  <div
    role="tablist"
    aria-label="Mode"
    style="width: 126px; height: 28px; box-sizing: border-box; background: #faf5f0; border-radius: 7px; padding: 3px; display: flex"
  >
    <a
      href="FoodToday.dc.html"
      role="tab"
      aria-selected="true"
      style="flex: 1; border-radius: 5px; background: #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,.08); color: #020817; font-size: 13px; font-weight: 500; display: flex; align-items: center; justify-content: center; text-decoration: none"
      >Food</a
    >
    <a
      href="GymToday.dc.html"
      role="tab"
      aria-selected="false"
      style="flex: 1; border-radius: 5px; color: #8a7560; font-size: 13px; font-weight: 500; display: flex; align-items: center; justify-content: center; text-decoration: none"
      >Gym</a
    >
  </div>
  <a
    href="Profile.dc.html"
    aria-label="Profile"
    style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; text-decoration: none"
    ><span
      style="width: 31.5px; height: 31.5px; border-radius: 9999px; background: #944a00; color: #ffffff; font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center"
      >DP</span
    ></a
  >
</div>
```

(On gym tabs, swap which segment is white/selected.)

Stack header (pushed screens): `display: flex; align-items: center; gap: 10.5px; padding: 10.5px 14px`, back = `<a href="Parent.dc.html" aria-label="Back" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: #1f2937">` + arrow-back svg 20px; then title 25px bold (or eyebrow above title where the inventory says so).
Gym stack back button: 44×44 circle background #f3f4f6, chevron-back 22px color #374151.

Food tab bar (last child of food tab roots):

```html
<nav
  aria-label="Food tabs"
  style="margin-top: auto; flex: none; height: 83px; box-sizing: border-box; border-top: 1px solid #e2e8f0; background: #ffffff; display: flex; padding: 7px 0 34px"
>
  <a
    href="FoodToday.dc.html"
    aria-current="page"
    style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; color: #944a00; font-size: 12px; font-weight: 600; text-decoration: none"
    >[today-outline svg 26px]<span>Today</span></a
  >
  <a href="MealPlan.dc.html" style="…same…; color: #8e8e93">[calendar-outline]<span>Plan</span></a>
  <a href="ShoppingList.dc.html" …>[cart-outline]<span>Shop</span></a>
  <a href="Cookbook.dc.html" …>[book-outline]<span>Cookbook</span></a>
  <a href="More.dc.html" …>[menu-outline]<span>More</span></a>
</nav>
```

Gym tab bar: Today (today-outline) → GymToday.dc.html · Routine (list-outline) → GymRoutine.dc.html · Exercises (barbell-outline) → GymExercises.dc.html · Stats (stats-chart-outline) → GymStats.dc.html. Active #944a00, inactive #8e8e93.
For a TALL board, the tab bar stays the last child (it ends up at the board's bottom, as if scrolled to the end).

Bottom sheet boards (one board per sheet state): the root background is the scrim: render the parent screen area as plain `background: #ffffff`, then an absolutely-positioned overlay `position: absolute; inset: 0; background: rgba(0,0,0,.4)`, then the sheet panel `position: absolute; left: 0; right: 0; bottom: 0; background: #ffffff; border-radius: 21px 21px 0 0; box-shadow: 0 -4px 12px -4px rgba(67,42,25,.08), 0 -16px 40px -12px rgba(67,42,25,.18); max-height: 85%` containing: grabber `width: 40px; height: 3.5px; border-radius: 9999px; background: #d1d5db; margin: 7px auto 0`; header row `padding: 10.5px 14px 7px; display: flex; justify-content: space-between; gap: 10.5px` with optional eyebrow + title (19px 600) and close `<a href="Parent.dc.html" aria-label="Close" style="width: 44px; height: 44px; border-radius: 9999px; background: #f3f4f6; color: #374151; font-size: 19px; font-weight: 600; display: flex; align-items: center; justify-content: center; text-decoration: none">✕</a>`; body `padding: 0 14px; display: flex; flex-direction: column; gap: 10.5px`; optional footer `border-top: 1px solid #e2e8f0; padding: 10.5px 14px 0`; then 34px bottom spacer.

## Interactivity

- Every navigation in the real app = an `<a href="Board.dc.html">` to the matching board (board names in boards.md). Tab bars, back buttons, rows that push routes, buttons that open sheets (→ the sheet's board), sheet close (→ parent board).
- In-place actions (toggle heart, check an item) are plain `<button type="button">` — optional simple `state` toggles are welcome but not required; keep JS tiny.
- Each board's `<title>` is a few words, e.g. "Gym — Live workout".
