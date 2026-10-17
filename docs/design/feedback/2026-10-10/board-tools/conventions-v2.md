# Chefer design canvas v2 — board conventions (REVAMP SHELL, master e5a8ca22)

READ FULLY. This REPLACES conventions.md for colours/type/chrome, but keep its HARD RULES, file skeleton,
sheet-board pattern and photo-placeholder rule — they still apply unchanged (read conventions-v1-base.md too for those).

Source of truth = the latest origin/master (READ-ONLY reference —
never draw from a stale local branch). Draw each screen as it renders with the flag `mobileShellV2` ON, light theme.
Where a screen has `shellV2` / `useShellV2()` branches, draw the shellV2=true branch.

Boards live on the canvas (files under project/ — see the session prompt for how to read and publish them)
Reference boards (copy their chrome markup verbatim): Home.dc.html (tab root) and Main.dc.html (foundations) — also in docs/design/mobile/.

## Root

`<div style="width: 390px; height: Hpx; position: relative; overflow: hidden; background: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif; color: #1C1917; display: flex; flex-direction: column">`
Background: #FFFFFF (`bg-background`) for almost every screen. Only screens using `bg-canvas` get #FAF7F2 (You tab, some new screens — check the code).
47px empty top spacer; tab roots end with the tab bar (83px); stack screens end with a 34px spacer.

## Spacing / radius

NativeWind rem = 14px still: p-4 = 14, gap-3 = 10.5, gap-4 = 14, px-4 = 14, h-11 = 44 (pinned), h-12 = 42, h-14 = 49.
Legacy radius: rounded-md 5.25 · rounded-lg 7 · rounded-xl 10.5 · rounded-2xl 14 · rounded-3xl 21 · full.
Revamp radius classes (px): rounded-inner 8 · rounded-control 12 · rounded-card 16 · rounded-sheet 24.

## Type (px size/line-height) — CHANGED on master

Legacy: xs 14/19 · sm 16/22 · base 17/24 · lg 19/26 · xl 21/28 · 2xl 25/31 · 3xl 31/37.
Revamp named styles: display 34/41 · title1 28/34 · title2 22/28 · title3 20/25 · headline 17/22 · body 17/24 · callout 16/21 · subhead 15/20 · caption 14/19.
Text variants: title = 25 bold · heading = 19 600 · label = 16 500 · muted = 16 #8A7560 · default = 17.
Eyebrow (legacy): 14px 600 uppercase letter-spacing .1em #6B7280.

## Colours

Revamp roles (light): canvas #FAF7F2 · surface #FFFFFF · surface-raised #FFFFFF · surface-sunken #F2ECE4 · separator #E6DED3 ·
label #1C1917 · label-secondary #57534E · label-tertiary #6F675F · brand #944A00 · on-brand #FFFFFF · brand-tint #F6EADB ·
positive #2D7A4B · attention #A85100 · info #1D5FD0 · danger #C62828.
Legacy (still used by most screens): primary #944A00 · primary-foreground #FCF9F5 · accent #FCF3EA · muted/secondary #FAF5F0 ·
muted-foreground #8A7560 · border/input #E2E8F0 · foreground #020817 · destructive #EF4444 · plus Tailwind grays/emerald/amber/red etc.
(full hex list in conventions.md). Use whichever the code uses for that element.

## Chrome

### Tab bar (shell v2) — last child of every tab root

Five tabs: Today (sunny) · Plan (calendar) · Shop (cart) · Train (barbell) · You (person-circle). Focused = FILLED glyph + brand #944A00; others = outline glyph + #57534E. Icons 24px, labels 12px/600, bar #FFFFFF, top border #E6DED3. Copy from Home.dc.html and move aria-current + filled glyph to the active tab. Links: Home.dc.html · Plan.dc.html · Shop.dc.html · Train.dc.html · You.dc.html.

### ShellTopBar (`src/features/shell/shell-chrome.tsx`) — row `min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 7px`

- Today: left empty; right = Ask Chef (44px circle bg #F6EADB, sparkles-outline 22 brand → Chat.dc.html) + Add (44px circle bg #944A00, white "+" 26 → AddSheet.dc.html), gap 3.5px.
- Plan: left "Plan" title1 28/34 bold #1C1917; right Ask Chef (tinted) + Recipes (tinted, book-outline brand → Cookbook.dc.html).
- Shop, Train: NO top bar at all (row not rendered).
- Pushed shell screens (Cookbook, TrainingRoutine, TrainingExercises, TrainingStats): left = plain back button (44px, chevron-back 26 brand, margin-left -7px) → parent tab board.
- You: no ShellTopBar; LargeHeader "You" display 34/41 bold.

### Old stack screens (tracker, recipe, profile, settings, progress …): unchanged — 44px back arrow (arrow-back 20 #1F2937) + 25px bold title, row padding 10.5px 14px. Check each file.

### Workout mini bar (only while a workout runs — draw it ONLY on the board that asks for it)

Strip `background: #FAF7F2; padding: 3.5px 10.5px 7px` above the tab bar; pill `min-height: 42px; border-radius: 12px; background: #944A00; padding: 7px 14px; display: flex; align-items: center; gap: 10.5px; box-shadow: 0 1px 2px rgba(0,0,0,.08)`: timer-outline 22 white · column (name callout 16/21 600 white "Push A" / caption 14 rgba(255,255,255,.8) "23 min · 2 of 6 exercises") · "Resume" callout 600 white right. Link → Workout.dc.html.

### ListSection / ListRow (revamp)

Section: column gap 5.25px; optional title `padding: 0 14px; font-size: 15px; line-height: 20px; font-weight: 600; color: #57534E`; group `border: 1px solid #E6DED3; border-radius: 16px; background: #FFFFFF; overflow: hidden`; between rows a hairline `height: 1px; background: #E6DED3; margin-left: 49px`; optional footer `padding: 0 14px; font-size: 14px; line-height: 19px; color: #6F675F`.
Row: `<a href=…>` `min-height: 44px; display: flex; align-items: center; gap: 10.5px; padding: 10.5px 14px; color: inherit; text-decoration: none`; icon column `width: 24.5px; display: flex; justify-content: center` (icon 22 brand); text column flex 1 min-width 0: title 17/24 #1C1917, optional subtitle 15/20 #57534E margin-top 1.75px; optional value 17 #57534E; trailing "›" `font-size: 20px; color: #6F675F`. Destructive row: title #C62828, no chevron.

### IconButton: 44×44 circle; plain (no fill) / tinted (#F6EADB) / filled (#944A00, white glyph).

### SurfaceCard: `border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10.5px; background: #FFFFFF` (or #F6EADB tinted); title headline 17/22 600.

### LargeHeader: column gap 10.5px, padding 7px 0; optional eyebrow subhead 15/20 600 #57534E; title display 34/41 bold #1C1917; optional trailing actions.

### SearchField: `min-height: 44px; border-radius: 9999px; border: 1px solid #E2E8F0; background: #FFFFFF; padding-left: 10.5px` + search icon + input 17px.

### Snackbar: pill `min-height: 44px; border-radius: 9999px; background: #020817; padding: 8.75px 14px` text 15 white + action 15 600.

### CountPill: min 17.5×17.5, radius full, bg #944A00, padding 0 5.25px, text 14/600 white.

### Sheet: unchanged from conventions.md (eyebrow 14px now, title 19/600, ✕ close 44px #F3F4F6).

### Button / Chip / Card / Input / Badge: unchanged shapes from conventions.md BUT text sizes follow the new ramp: button label 16/500 (lg 17), chip 16/500, badge 14/600, input 17, Card radius 7.

## Boards / links

Board list and link targets: docs/design/mobile/README.md (board → route map). Link to boards that exist in that list only; otherwise use a <button>.
