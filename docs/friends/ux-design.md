# Chefer Friends: UX and UI design spec

**rev 1 · 2026-09-30 · built on [`prd.md`](./prd.md) rev 1 · build read `master` @ `9dd93f3a`**

Role: principal product designer (iOS HIG and Material aware), writing for implementation agents. Everything an
agent needs to build the UI is here: navigation, every screen and state, exact copy, components, interaction and
motion, accessibility and responsive rules. Data shapes and task sizing live in
[`implementation-plan.md`](./implementation-plan.md). Where this spec needs data, it names the procedure from that
plan.

**Conventions** (same as the persona-study UX spec so the app reads as one product):

- Copy in `code quotes` and in the copy deck (§12) is **exact**: British spelling, sentence case, curly apostrophes
  `’`, `…` not `...`, no exclamation marks, verbs first. `{braces}` are variables. `{first}` = the other person's
  first name, `{name}` = their full display name.
- "Mobile" = `apps/mobile` (one Expo codebase, iOS + Android). "Web" = `apps/web`. Kit = `@chefer/ui-mobile`
  (mobile) / `@chefer/ui` (web). Tokens = `@chefer/tokens`.
- Motion patterns are named by their ID (MO-01…MO-15) from `docs/audit-2026-09/motion-system.md`, as CLAUDE.md
  requires. Put the ID in the code comment.
- ⚖ marks an owner decision from PRD §20. The spec designs the **recommended** default and says in one line what
  changes under the alternative.

Contents: [1 Principles](#1-design-principles) · [2 Information architecture](#2-information-architecture) ·
[3 Shared components](#3-components) · [4 Turn on Friends](#4-turn-on-friends) · [5 Friends home](#5-friends-home) ·
[6 Search](#6-search) · [7 Requests and Activity](#7-requests-and-activity) · [8 Profile](#8-profile-view) ·
[9 Food tab](#9-food-tab) · [10 Gym tab](#10-gym-tab) · [11 Settings, privacy, safety](#11-friends-settings-privacy-and-safety) ·
[12 Copy deck](#12-copy-deck) · [13 Accessibility](#13-accessibility) · [14 Motion](#14-motion) ·
[15 Web responsive](#15-web-responsive-layout) · [16 Acceptance checklist](#16-design-acceptance-checklist)

---

## 1. Design principles

1. **Nothing changes until you choose it.** Friends is invisible to anyone who hasn't turned it on. The intro says
   plainly who can find you and what they'll see, before anything is stored.
2. **Say who can see it, where it's shared.** Every sharing control names its audience (`Followers you approve can
see…`). The own-profile preview (`See what followers see`) shows exactly what others see.
3. **The follow button is one control everywhere.** Same component, same states, same words in search, lists,
   suggestions, profile and Activity. It changes instantly (optimistic) and rolls back politely.
4. **Read-only means read-only.** A friend's week and routine have no edit affordances. The only actions are
   heart, `Add to my week`, `Cook` and expanding a workout.
5. **Numbers without judgement.** Friends' calories and macros are shown as plain facts: no red/green, no
   "over target", no comparison with the viewer's own targets.
6. **Safety is two taps away, never in the way.** Block and Report live in the profile overflow (`…`) and in row
   overflows. They're never primary buttons, but always reachable.

## 2. Information architecture

### 2.1 Entry points

| Platform           | Entry                                                        | Detail                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile, Food mode  | More tab → `Friends` row, **directly below `Profile`**       | `apps/mobile/app/(food)/more.tsx` `ITEMS`: insert `{ href: '/friends', label: 'Friends', icon: 'people-outline', testID: 'more-friends' }` after `more-profile`. Row shows a count pill when `pending + unread > 0`.  |
| Mobile, both modes | `ModeSwitch` gear → Settings hub → Account group → `Friends` | `apps/mobile/src/features/settings/settings-screen.tsx` `GROUPS` (Account): new first row `Friends` → `/friends`. Gym mode has no More tab, so this is its path.                                                      |
| Mobile             | More tab icon badge                                          | Food tab bar's More icon shows a dot with count (max `9+`) when `friends.me.badgeCount > 0`.                                                                                                                          |
| Mobile             | Profile › Privacy & data → `Friends & visibility` row        | `apps/mobile/src/features/privacy/privacy-section.tsx`, a row between `ConsentHistory` and the gym settings row → `/friends/settings` (or the intro if not activated).                                                |
| Mobile             | Push tap                                                     | Opens `/friends/requests` or `/friends/{actorId}` via `useNotificationLinks` (new `data.app = 'friends'` tag, allow-listed routes).                                                                                   |
| Web                | Secondary nav `Friends`, **directly after `Profile`**        | `apps/web/src/features/nav/nav-items.ts` `FOOD_NAV_ITEMS` (after `/profile`) and `GYM_SECONDARY_NAV_ITEMS` (after `/gym/settings`); icon `Users` (lucide). Desktop sidebar below the divider; mobile-web More drawer. |
| Web                | Header `UserMenu`                                            | New item `Friends` after `Profile`.                                                                                                                                                                                   |
| Web                | Profile page privacy card group                              | `Friends & visibility` card → `/friends/settings`.                                                                                                                                                                    |

The badge counts are **pending requests + unread Activity items** from `friends.me`, polled every 60 s while the app
is in the foreground and refetched on focus. Nothing is shown when the flag is off.

### 2.2 Routes

| Screen                  | Mobile route (expo-router, root `Stack`) | Web route (`apps/web/src/app/(dashboard)/…`) | Title (`metadata.title` / header) |
| ----------------------- | ---------------------------------------- | -------------------------------------------- | --------------------------------- |
| Friends home (or intro) | `app/friends/index.tsx`                  | `friends/page.tsx` + `layout.tsx`            | `Friends`                         |
| All requests            | `app/friends/requests.tsx`               | `friends/requests/page.tsx`                  | `Follow requests`                 |
| Activity                | `app/friends/activity.tsx`               | `friends/activity/page.tsx`                  | `Activity`                        |
| Friends settings        | `app/friends/settings.tsx`               | `friends/settings/page.tsx`                  | `Friends settings`                |
| Blocked people          | `app/friends/blocked.tsx`                | `friends/blocked/page.tsx`                   | `Blocked people`                  |
| Someone's profile       | `app/friends/[userId].tsx`               | `friends/[userId]/page.tsx`                  | `{name}` (web tab: `Profile`)     |
| Suggestions (See all)   | `app/friends/suggestions.tsx`            | `friends/suggestions/page.tsx`               | `Suggested for you`               |

Mobile: add each to the root `Stack` inside the signed-in `Stack.Protected` in `apps/mobile/app/_layout.tsx`
(typed routes are on). Web: add `/friends` to `PROTECTED_ROUTES` **and** `config.matcher` in
`apps/web/src/middleware.ts`, add `TITLE_MAP` entries in `features/nav/components/dashboard-shell.tsx`, treat
`/friends*` as mode-neutral in `modeOfPath` (like `/profile`), and add the routes to `APP_ROUTES` in
`tests/e2e/helpers/layout.ts` for the mobile sweep.

### 2.3 Map

```
More ─┬─ Profile
      └─ Friends ──┬─ (not activated) Intro ──▶ Turn on ──▶ Friends home
                   └─ Friends home
                        ├─ 🔔 Activity ─────────────▶ profile / accept / decline
                        ├─ ⚙ Friends settings ─┬─ visibility, sharing, notifications
                        │                       ├─ Blocked people
                        │                       └─ Turn off Friends
                        ├─ Search ──────────────▶ profile
                        ├─ Requests (≤3) → See all ▶ Requests
                        ├─ Following | Followers list ▶ profile
                        └─ Suggested for you → See all ▶ Suggestions
Profile /friends/[id] ── header (Follow · …) ── Food | Gym
   Food ─┬─ This week (day chips, meals, totals) ─▶ recipe/[id] ─▶ Add to my week sheet
         └─ Recipes grid ─────────────────────────▶ recipe/[id]  (♥, Add to my week, Cook, Report)
   Gym ──┬─ Routine
         └─ Recent workouts (5) ─ Load more
```

## 3. Components

### 3.1 New shared kit components (the CLAUDE.md "shared UI goes in the library" rule)

| Component                | Mobile (`packages/ui-mobile/src/components/…`)                                                                                                                                                                                                                                                                                             | Web (`packages/ui/src/components/…`)                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Avatar`                 | `avatar.tsx`: `{ name: string, seed: string, imageUrl?: string \| null, size?: 'sm' 32 \| 'md' 40 \| 'lg' 72, testID? }`. Initials (first letter of first + last name, uppercase) on a background picked from 8 warm tokens by a hash of `seed` (user id). `expo-image` when `imageUrl`. `accessible={false}` (the row carries the label). | `avatar.tsx`: same props and colour function; `<img>` with `alt=""` when `imageUrl`.                                                                                                                             |
| `SearchField`            | `search-field.tsx`: `TextInput` in a 44 pt pill with a leading `search` icon, trailing clear `×` (44 pt hit area, label `Clear search`), `returnKeyType="search"`, `autoCapitalize="none"`, `autoCorrect={false}`, `accessibilityLabel` required prop, `onDebouncedChange(value)` (250 ms).                                                | `search-input.tsx`: `<input type="search">` with `aria-label` required, the same icon/clear, `enterKeyHint="search"`, 16 px text below `sm` (globals already enforce).                                           |
| `Skeleton`               | `skeleton.tsx`: `bg-muted` block with the MO-03 shimmer (1.2 s, off under `useReducedMotion`), props `{ className, rounded? }`.                                                                                                                                                                                                            | `skeleton.tsx`: same; CSS shimmer covered by the global reduced-motion rule.                                                                                                                                     |
| `SegmentedControl` (web) | exists (`segmented-control.tsx`)                                                                                                                                                                                                                                                                                                           | **new** `segmented-control.tsx`: `role="radiogroup"`, radios with arrow-key movement, sliding thumb (MO-14, `duration-base ease-standard`), same props as mobile (`options, value, onChange, size, aria-label`). |
| `CountPill`              | `count-pill.tsx`: `{ count }` → `9+` cap, `bg-primary` pill, `text-xs`; hidden at 0.                                                                                                                                                                                                                                                       | `count-pill.tsx`: same.                                                                                                                                                                                          |

### 3.2 Feature components (not shared; `apps/mobile/src/features/friends/…`, `apps/web/src/features/friends/…`)

| Component           | Purpose                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RelationButton`    | The one follow control (§3.3). Props `{ userId, relation, name, size: 'sm' \| 'md', source }`. Owns the optimistic mutation and confirmations.                                                                                                                                                                                                                             |
| `PersonRow`         | `Avatar` + name (1 line, wraps to 2 at large text) + secondary line (reason / `Follows you` / `Requested you`) + trailing slot. The whole row is a `PressableScale` (MO-01) to the profile, `min-h-16`. The trailing button is a separate focus target.                                                                                                                    |
| `RequestRow`        | `PersonRow` with trailing `Accept` (primary, `sm`) + `Decline` (outline, `sm`).                                                                                                                                                                                                                                                                                            |
| `FriendsHeader`     | Title + Activity bell (`notifications-outline`, `CountPill`) + settings gear (`settings-outline`), both 44 pt icon buttons.                                                                                                                                                                                                                                                |
| `ProfileHeader`     | Large avatar, name, badge row (`Private`/`Public` badge only on your own profile; `Follows you` tag), counts `{n} followers · {n} following` (text, not links in v1), `RelationButton md`, overflow `…`.                                                                                                                                                                   |
| `LockedPanel`       | Lock icon, title, body, optional action.                                                                                                                                                                                                                                                                                                                                   |
| `FriendWeekView`    | Day chips + meal cards + day totals for a friend's week DTO (read-only). Visually mirrors `PlanDayChips` / `PlanMealCard` / `PlanDayTotals` (`apps/mobile/src/features/meal-plan/`) but is fed by the friend DTO, with no swap, pin or tailoring affordances. Reuse the presentational pieces where their props allow (the implementation plan extracts a `MealCardView`). |
| `FriendRecipeGrid`  | Two-column grid of recipe cards (photo, name, kcal, time, heart).                                                                                                                                                                                                                                                                                                          |
| `AddToWeekSheet`    | Day + meal picker for the viewer's week (§9.4).                                                                                                                                                                                                                                                                                                                            |
| `FriendRoutineCard` | Read-only routine: name + days (reuse the visual language of `DayCard` in `app/(gym)/routine.tsx` after it's extracted as a presentational component).                                                                                                                                                                                                                     |
| `FriendWorkoutCard` | Collapsed summary + expandable set list (MO-05).                                                                                                                                                                                                                                                                                                                           |
| `ReportSheet`       | Reason list + note + `Also block` switch.                                                                                                                                                                                                                                                                                                                                  |
| `PushPrimer`        | The in-context sheet before the OS permission prompt (§7.4).                                                                                                                                                                                                                                                                                                               |

Existing kit parts used: `Sheet` (all overlays; `onExited` for chaining), `ConfirmSheet` (every destructive
confirm), `Snackbar`/`useSnackbar` (undo and errors), `SegmentedControl` (mobile), `EmptyState`, `ErrorState`,
`Button`, `Badge`, `Chip`, `Card`, `PressableScale`, `haptics`, `Text`, `Screen`, `KeyboardAwareScrollView`. Web:
`Sheet`, `Drawer`, `Toast`, `Button`/`buttonVariants` (already carries `pressControl`), `Card`, `Badge`,
`ErrorState`, `Switch`, `useMenu` (overflow menus), `usePresence`. **No hand-rolled `fixed inset-0` overlays and
no click-catcher divs.**

**iOS rule (binding):** never present one `Sheet`/`Modal` while another is dismissing. Chains (Report → Block,
Add-to-week → Replace confirm, Unfollow from a sheet) close the first sheet and open the second from its
`onExited` callback, never in the same tick.

### 3.3 `RelationButton` states

| Relation (from API)          | Label          | Variant   | Tap does                                                                                     | A11y label / hint                                        |
| ---------------------------- | -------------- | --------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `none`, they don't follow me | `Follow`       | default   | `friends.follow` → optimistic `Following` (public) or `Requested` (private; the API decides) | `Follow {name}`                                          |
| `none`, they follow me       | `Follow back`  | default   | same                                                                                         | `Follow {name} back`                                     |
| `requested` (I asked them)   | `Requested`    | outline   | ConfirmSheet `Cancel your request?` → `friends.unfollow`                                     | `Requested. Double-tap to cancel your request to {name}` |
| `following`                  | `Following`    | secondary | ConfirmSheet `Unfollow {first}?` → `friends.unfollow`                                        | `Following {name}. Double-tap to unfollow`               |
| `self`                       | `Edit sharing` | outline   | → `/friends/settings`                                                                        | `Edit what followers see`                                |

- Width is fixed per size (`sm` 112 pt, `md` 140 pt) so the label change never reflows the row (MO-14 crossfade,
  `duration.fast`).
- Optimistic update (MO-08): the flip is instant with `haptics.selection`. If the mutation fails, it rolls back with
  a ±4 pt shake, `haptics.error` and a snackbar `Couldn’t update. Try again.` with `Retry`.
- The server response is the truth: a `Follow` on a profile that went private in the meantime lands on
  `Requested`, and the button settles to whatever `relation` the mutation returns.
- Every list and query holding this user's relation is updated from the one mutation result
  (`utils.friends.*.setData` / invalidate), so the button agrees across screens (PRD FR-10).

## 4. Turn on Friends

### 4.1 Intro (`/friends` when `friends.me.activated === false`)

```
┌───────────────────────────────────────┐
│ ←  Friends                            │
│                                       │
│        (people illustration icon)     │
│   Cook and train with people you know │
│                                       │
│ Follow friends to see their week of   │
│ meals, save their recipes and see     │
│ their workouts.                        │
│                                       │
│ HOW OTHERS WILL SEE YOU               │
│ (MP)  [ Maria        ] [ Pop        ] │
│                                       │
│ WHO CAN FOLLOW YOU                    │
│ ◉ Private — you approve each follower │
│ ○ Public — anyone on Chefer can       │
│   follow you                          │
│                                       │
│ WHAT FOLLOWERS SEE                    │
│ ✓ This week’s meals, with calories    │
│   and macros                          │
│ ✓ Recipes you’ve written              │
│ ✓ Your routine and recent workouts    │
│ You can change these any time.        │
│                                       │
│ NEVER SHARED                          │
│ Your email, allergies and diets, body │
│ measurements and weight, targets,     │
│ what you’ve logged, your household.   │
│                                       │
│ People who search your name or your   │
│ exact email can find you.             │
│  Privacy Policy ›                     │
├───────────────────────────────────────┤
│ [        Turn on Friends          ]   │
│            Not now                    │
└───────────────────────────────────────┘
```

- Layout: `KeyboardAwareScrollView` (name fields) with a sticky footer (PAT-11). Name inputs are `Input` with labels
  `First name` / `Last name`, prefilled, required, 1–50 chars. Errors: `Add your first name` / `Add your last
name`, linked by `aria-describedby`/`accessibilityHint`, with `aria-invalid`.
- Visibility is a radio group (two `PressableScale` cards, `accessibilityRole="radio"`, `accessibilityState={{
checked }}`), Private preselected.
- `Turn on Friends`:
  - Private → `friends.activate({ visibility: 'PRIVATE', firstName, lastName, documentVersion: LEGAL_VERSIONS.privacy })`. Success: land on
    home with snackbar `Friends is on. Only people you approve can see your meals and workouts.`
  - Public → first the **Public confirm** sheet (§11.2), then activate with `PUBLIC`.
  - Then (mobile, only if push is supported and permission is undetermined) the `PushPrimer` (§7.4), chained with
    `onExited` after the snackbar-bearing navigation.
- `Not now` → back. Nothing stored.
- `Privacy Policy ›` opens `legal/privacy` (mobile) / `/privacy` (web, new tab).
- Loading: button spinner, inputs disabled. Error: inline above the footer `Couldn’t turn on Friends. Nothing has
been changed.` + the button stays enabled.
- Web: same content in a centred single column (`max-w-xl`), footer inline at the end (not sticky) at `lg`.
- Under ⚖ policy B (PRD §6.1), the radio copy becomes `Private — only people you already know can see…`. Private is
  "not findable" under B: `Private: people can’t find or follow you` / `Public: people can find you and ask to
follow`.

## 5. Friends home

### 5.1 Layout (mobile)

```
┌───────────────────────────────────────┐
│ ←  Friends                   🔔² ⚙     │
│ ┌───────────────────────────────────┐ │
│ │ 🔍 Search by name or email         │ │
│ └───────────────────────────────────┘ │
│ REQUESTS · 4                          │
│ (AI) Andrei Ionescu   [Accept][Decline]│
│      2 friends in common               │
│ (EL) Elena Radu       [Accept][Decline]│
│ (CS) Chris Stan       [Accept][Decline]│
│  See all 4 ›                           │
│                                       │
│ ┌ Following 12 ┬ Followers 9 ┐        │
│ (AI) Andrei Ionescu        [Following] │
│      Follows you                       │
│ (MP) Maria Pop             [Requested] │
│ …                                      │
│                                        │
│ SUGGESTED FOR YOU            See all › │
│ (IO) Ioana Oprea      [Follow]    ×    │
│      Followed by Andrei and 2 others   │
│ (CK) Chefer Kitchen   [Follow]    ×    │
│      Popular on Chefer                 │
└───────────────────────────────────────┘
```

- One `FlatList` (virtualised) with section headers; the search field is the list header (not sticky in v1).
- **Requests** section only renders when `requests.total > 0`: up to 3 `RequestRow`s, then `See all {N} ›` when
  `N > 3`. Accept/Decline remove the row with MO-04 (exit `duration.base`, the rest settle). Accept then shows the
  snackbar `{first} can now see your meals and workouts.` with `Follow back` as its action (when not following
  already).
- **Following | Followers** is a `SegmentedControl` (`size="sm"`, labels `Following {n}` / `Followers {n}`),
  remembered for the session. Rows: `PersonRow` + `RelationButton sm`. Followers rows also get an overflow `…` (44
  pt) with `Remove follower` and `Block` (§11.4). Infinite scroll, 20 per page; footer spinner while fetching.
- **Suggested for you**: up to 5 on home (`See all ›` → suggestions screen with 30). Rows: `PersonRow` (reason as the
  secondary line) + `RelationButton sm` + a dismiss `×` icon button (label `Hide suggestion {name}`). Dismiss
  removes the row (MO-04) and calls `friends.dismissSuggestion`. Following from a suggestion keeps the row in place
  with the new state until the next refresh (no jumpy removal).
- Pull to refresh (`RefreshControl`) refetches all four queries.

### 5.2 States

| State                                      | Treatment                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First load                                 | Skeleton: search pill, 3 `PersonRow` skeletons (circle + two lines), the segmented control, 3 more rows (MO-03).                                                                                 |
| Following empty                            | `EmptyState` icon `people-outline`, title `Find people you know`, description `Search by name or email, or follow someone below.`. No action button (the search is right above).                 |
| Followers empty                            | `EmptyState` title `No followers yet`, description `Share Chefer with friends so they can find you.`, action `Invite a friend` (FR-11).                                                          |
| Suggestions empty (cold start, no popular) | The section is replaced by a `Card`: `Chefer is better with friends` / `Invite someone you cook or train with.` / `Invite a friend`.                                                             |
| Error (any section)                        | That section shows `ErrorState` compact: `Couldn’t load {your requests \| this list \| suggestions}.` + `Try again`. Other sections still render. A failed load is never shown as empty.         |
| Offline                                    | Cached content stays, with a muted line under the header `Offline · showing what was saved {time}`. `RelationButton`, Accept/Decline and search are disabled with the hint `Needs a connection`. |
| Flag turned off while open                 | Next query returns FORBIDDEN → full-screen `EmptyState` `Friends isn’t available right now.` + `Go back`.                                                                                        |

## 6. Search

Typing in the home `SearchField` swaps the list body for results. Home sections are hidden while the query is
non-empty. Clearing restores them, with the scroll position preserved.

| Query state                          | Body                                                                                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 character                          | Muted helper `Keep typing…`. No request.                                                                                                                                                                              |
| ≥ 2 chars, waiting (250 ms debounce) | Previous results stay (dimmed to 60% opacity, `duration.fast`), or 3 skeleton rows on the first search.                                                                                                               |
| Results                              | `PersonRow` + `RelationButton sm`, secondary line = `Follows you` / `{n} friends in common` / nothing. An exact-email hit is first and looks like any other row (never shows the email). Infinite scroll 20 per page. |
| Partial email typed (`maria@gm`)     | Name results only, plus the muted helper under the field: `Type the full email address to find someone by email.`                                                                                                     |
| No results                           | `EmptyState` title `No one found for “{query}”`, description `They may not have turned on Friends yet.`, action `Invite a friend`.                                                                                    |
| Rate limited                         | Inline notice `Too many searches. Try again in a minute.` Results cleared. The field stays enabled.                                                                                                                   |
| Error                                | `ErrorState` compact `Couldn’t search right now.` + `Try again`.                                                                                                                                                      |
| Offline                              | Field disabled, placeholder `Search needs a connection`.                                                                                                                                                              |

- `returnKeyType="search"` submits immediately (skips the debounce). Scrolling the results dismisses the keyboard
  (`keyboardDismissMode="on-drag"`).
- Mobile: the field has `accessibilityLabel="Search people by name or email"`. Results announce `{n} people found`
  via `AccessibilityInfo.announceForAccessibility` after each settled search (web: an `aria-live="polite"` region).

## 7. Requests and Activity

### 7.1 Requests screen (`/friends/requests`)

The full list of incoming requests as `RequestRow`s, newest first, infinite scroll. Header subtitle: `Only you can see
this list.` Empty: `EmptyState` `No requests` / `When someone asks to follow you, it shows up here.`. After accepting
the last one, the empty state fades in (MO-03).

### 7.2 Activity (`/friends/activity`)

```
┌───────────────────────────────────────┐
│ ←  Activity                           │
│ NEW                                   │
│ (AI) Andrei Ionescu wants to follow   │
│      you · 2h        [Accept][Decline]│
│ (EL) Elena Radu started following you │
│      · 5h                [Follow back]│
│ EARLIER                               │
│ (MP) Maria Pop accepted your request  │
│      · 3 days                  (row ›)│
└───────────────────────────────────────┘
```

- Sections `New` (unread when the screen opened) and `Earlier`. Opening the screen calls
  `friends.markActivityRead({ upTo })`. The bell badge clears when the call succeeds (the rows keep their
  section until the next visit).
- Row text is one sentence with the name in semibold, then the relative time (`2h`, `5h`, `Yesterday`, `3 days`, then
  `{d MMM}`). The row taps through to the actor's profile. Inline actions:
  - `FOLLOW_REQUEST` pending → `Accept` / `Decline`. Once answered, the row reads `You accepted` / `You declined`
    (muted) with no buttons.
  - `NEW_FOLLOWER` → `RelationButton sm` (usually `Follow back`).
  - `REQUEST_ACCEPTED` → no button.
- Items for a request the requester cancelled disappear. The server withdraws them, so the list never shows a dead
  Accept.
- Empty: `EmptyState` icon `notifications-outline`, `Nothing yet`, `Follow requests and new followers show up here.`
- Retention note under the list (muted, `text-xs`): `Activity is kept for 90 days.`

### 7.3 Push notification copy and routing

| Kind               | Title                                 | Body                                        | Opens                |
| ------------------ | ------------------------------------- | ------------------------------------------- | -------------------- |
| `FOLLOW_REQUEST`   | `{name} wants to follow you`          | `Open Chefer to accept or decline.`         | `/friends/requests`  |
| `NEW_FOLLOWER`     | `{name} started following you`        | `See their profile or follow back.`         | `/friends/{actorId}` |
| `REQUEST_ACCEPTED` | `{name} accepted your follow request` | `You can now see their meals and workouts.` | `/friends/{actorId}` |

- Payload `data`: `{ app: 'friends', kind, actorId, notificationId }`. `useNotificationLinks` accepts `app ===
'friends'` and maps `kind` to the route itself (never a URL from the payload). Only `/friends/requests` and
  `/friends/[id]` with a cuid-shaped id are allowed.
- Android channel `friends` (`Friends`, importance default, no sound override). iOS: default sound; the system
  groups them under Chefer.
- In the foreground: no system banner (the app doesn't set a presentation handler today). The bell badge updates
  on the next `friends.me` poll. P1: a snackbar `{name} wants to follow you` with `View`.

### 7.4 Push permission primer (mobile, once)

Shown at most once per install, and only when OS permission is undetermined and the binary supports push
(`probePushSupport()` returns `'available'`, implementation plan §6.2). It appears after the first follow or request, or right
after turning Friends on.

```
Sheet title: Know when friends follow you
Body: Get a notification when someone asks to follow you or accepts your request. Nothing about your meals or
      workouts is ever in a notification.
[ Turn on notifications ]   (primary → OS prompt)
[ Not now ]                 (ghost)
```

- Denied → no nag. The settings row shows the off state (§11.3). `Not now` → never auto-shown again. The settings
  row offers it.
- Reuses the permission helper pattern of `ensureGymReminderPermission()` (asked only on a user action). The
  granted path registers the push token.

## 8. Profile view

### 8.1 Layout (`/friends/[userId]`)

```
┌───────────────────────────────────────┐
│ ←                                  …  │
│            (MP)  large avatar          │
│             Maria Pop                  │
│           Follows you                  │
│   24 followers · 31 following          │
│          [   Following   ]             │
│ ┌──── Food ────┬──── Gym ────┐         │
│ ├ This week ┬ Recipes 12 ┤  (Food)    │
│ │ …tab content…                        │
└───────────────────────────────────────┘
```

- Header: `ProfileHeader`. The avatar is `lg` (72). Name is `text-2xl font-bold`, wrapping. The `Follows you` tag
  is a `Badge variant="secondary"`. Counts are plain text (`text-sm text-muted-foreground`). Relation button `md`,
  centred.
- Overflow `…` (44 pt, label `More options for {name}`): `Report {first}`, `Block {first}`, and `Remove follower`
  (only when they follow me). On your own profile the overflow is replaced by nothing, and the button is `Edit
sharing`.
- **Food | Gym** is the same `SegmentedControl` visual as the app's `ModeSwitch` (`size="xs"`, `w-36`, centred),
  with testIDs `profile-mode-food` / `profile-mode-gym`. The initial value is the viewer's current app mode
  (`getMode()`). Switching is **local state only**: it never calls `setMode` and never navigates. The content
  crossfades (MO-14 thumb, content fade `duration.fast`; reduced motion = instant).
- Scroll: the header scrolls away. The Food|Gym switch becomes sticky under the nav bar once it reaches the top,
  with a hairline (MO-12 elevation on scroll).
- Nav bar title shows `{name}` once the header has scrolled away (fade, `duration.fast`).

### 8.2 States

| State                                     | Treatment                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                                   | Header skeleton (circle 72, two lines, pill), switch skeleton, then the tab skeleton.                                                                                                                                                                                                                           |
| Locked, private, not following            | Header as normal. Under the switch, `LockedPanel`: icon `lock-closed-outline`, `This profile is private`, `Follow {first} to see their meals and workouts.` When requested: `Request sent` / `You’ll see their meals and workouts once {first} accepts.` The switch stays visible but both tabs show the panel. |
| Locked, public, not following             | `LockedPanel` without the lock icon (`people-outline`): `Follow {first} to see their meals and workouts.`                                                                                                                                                                                                       |
| Section not shared                        | Per tab: `{first} isn’t sharing their meal plan` / `…their recipes` / `…their workouts`. Plain `EmptyState`, no action.                                                                                                                                                                                         |
| Not available (blocked / off / not found) | Full screen `EmptyState` icon `person-outline`: `Profile not available`, `This profile doesn’t exist or isn’t available to you.`, action `Go back`. No header, no hints about why.                                                                                                                              |
| Error                                     | `ErrorState` `Couldn’t load this profile.` / `Try again`.                                                                                                                                                                                                                                                       |
| Offline                                   | Last loaded data with the offline line; relation button disabled (`Needs a connection`).                                                                                                                                                                                                                        |
| Relation changes while viewing            | Unfollow → the tabs animate to the locked panel (content fades out `duration.base`, panel fades in). Following a public profile → the content loads in place (skeleton → content, MO-03).                                                                                                                       |

### 8.3 Own profile preview

Reached from Friends settings `See what followers see`, or by tapping yourself in a list. The same screen with a
banner under the header: `This is what your followers see.` (`Badge info`), `Edit sharing` instead of the relation
button, and the `Private`/`Public` badge. Unshared sections show `Hidden from followers`.

## 9. Food tab

### 9.1 Sub-switch

`SegmentedControl size="sm"`: `This week` · `Recipes {n}` (`n` = count of their shared recipes, omitted when 0).
Both panes keep their scroll position.

### 9.2 This week

```
 Week of 28 Sep                    avg 2,150 kcal/day
 [Mon][Tue][Wed][Thu][Fri][Sat][Sun]    (today ringed)
 BREAKFAST
 ┌─(photo)─ Greek yogurt bowl ───────────┐
 │ 1 portion                              │
 │ 420 kcal · P 28 g · C 45 g · F 12 g    │
 └────────────────────────────────────────┘
 LUNCH …
 DINNER …
 ─────────────────────────────────────────
 Day total  2,080 kcal
 P 142 g · C 210 g · F 70 g
 (only if shared) Target 2,200 kcal
```

- Header row: `Week of {d MMM}` (the owner's Monday) and `avg {kcal} kcal/day` (average over days with meals;
  hidden when no day has meals).
- Day chips: reuse the visual of `PlanDayChips` (7 chips, `DENSE_MAX_FONT_SCALE`). Today (owner's time zone) is
  ringed. Days with no meals are dimmed and still selectable. Default selection is the owner's today.
- Meal cards: the `PlanMealCard` visual in read-only mode. Photo (MO-13 fade-in), meal-type eyebrow, name, portion
  line (`1 portion`, `1.5 portions`), macro line. **No** swap button, pin, `Your pick`, safety chip, tailoring mark
  or cost. `Leftovers from {day}` shows when present (it's plan content, not health data). The card is one
  pressable → recipe detail (`/recipe/[id]` mobile, `/recipes/[id]` web) with `?from=friend&owner={userId}` so the
  detail shows the `By` line correctly and back returns here.
- Day totals: the `PlanDayTotals` visual **without** target comparison or protein-gap line, unless targets are
  shared. Then one extra line `Target {kcal} kcal · P {g} g` in muted text with no colours and no "over/under"
  wording (principle 5).
- Empty day: `Nothing planned for {Tuesday}.` (muted, inline).
- No plan at all: `EmptyState` icon `calendar-outline`, `{first} hasn’t planned this week yet.`

### 9.3 Recipes

```
 [🔍 Search {first}’s recipes]      (only when > 12)
 ┌────────────┐ ┌────────────┐
 │  (photo)  ♡│ │  (photo)  ♥│
 │ Lentil dal │ │ Protein    │
 │ 480 kcal · │ │ pancakes   │
 │ 35 min     │ │ 390 kcal · │
 └────────────┘ └────────────┘
```

- Two-column grid (one column when the font scale ≥ 1.4). Cards: photo 4:3 with a placeholder when missing (MO-13).
  Name up to 2 lines. `{kcal} kcal · {min} min` per serving. Heart top-right (44 pt hit area, label `Save {recipe}`
  / `Remove {recipe} from saved`, `accessibilityState={{ selected }}`).
- Heart tap: optimistic, MO-14 heart pop with `haptics.success` on save. Snackbar `Saved to your cookbook` with
  `Undo` (and on removal `Removed from saved` with `Undo`).
- Infinite scroll, 20 per page. Search field `Search {first}’s recipes` filters server-side (debounced).
- Empty: `{first} hasn’t shared any recipes yet.`

### 9.4 Recipe detail for a friend's recipe (existing screen, additive)

Existing: mobile `apps/mobile/app/recipe/[id].tsx`, web `apps/web/src/app/(dashboard)/recipes/[id]/page.tsx`.
Additions, only when the recipe is someone else's `MANUAL` recipe (`recipe.creator` present and not me):

- Under the title: `By {name}` with the small avatar, pressable → their profile (label `By {name}. Open profile`).
- Primary actions row: `Add to my week` (primary), `Cook` (existing), heart (existing toggle).
- Overflow `…` gains `Report recipe` (→ `ReportSheet` with `recipeId`). Edit is never offered.
- The viewer's own safety block (`AllergenWarningBanner`, `CheckedForLine`) behaves exactly as today. It's the
  viewer's table, which is right: "can **I** eat this".
- For AI/curated recipes reached from a friend's week: no `By` line (they aren't the friend's). `Add to my week` is
  still offered (the recipe is open, so no copy is needed).
- **Mine tab / copies:** a recipe the viewer copied (`originCreator` present) shows `From {name}` (or `From a Chefer
friend` when the original is gone) under the title, and is fully editable as the viewer's own.
- **Saved tab:** friends' recipes show `From {first}` as a one-line chip under the name on the card (mobile
  `recipes.tsx` card, web `RecipesPage` card).

### 9.5 Add to my week sheet

```
Sheet title: Add to your week
Eyebrow:     Lentil dal · 480 kcal
[ This week | Next week ]      (Next week only from Thursday on, and when a next-week plan exists or can carry forward)
 Mon 28  Tue 29  Wed 30 …     (chips; past days of this week disabled)
 BREAKFAST  (empty)           → "Add here"
 LUNCH      Chicken wrap      → "Replace"
 DINNER     Salmon & rice     → "Replace"
 SNACK      (not in your plan) — hidden unless the plan uses snacks
Footer: [ Add to Tue lunch ]  (disabled until a slot is chosen)
```

- Data: the viewer's `mealPlan.getForWeek({ weekOffset })` (their own plan, which may carry-forward-write, as it
  always does for the owner). Slots come from the plan's meals for the day plus empty slot types from
  `mealPlan.getShape`.
- Choosing a filled slot, then `Add…`: close the sheet, then on `onExited` open `ConfirmSheet`: `Replace {current
meal}?` / `{recipe} goes on {Tue} lunch instead.` / `Replace` + `Cancel`. An empty slot adds directly.
- Mutation: `friends.addRecipeToWeek({ recipeId, weekOffset, dayOfWeek, mealType, mode: 'add' | 'replace', slotIndex?,
acknowledgeConflict? })`. It returns `{ planId, dayOfWeek, mealType, slotIndex, addedRecipeId, copiedFromId,
previousRecipeId }`. Invalidate the viewer's `mealPlan.getForWeek`, `recipe.list` and `dashboard.summary` after it.
- Conflict with the viewer's safety table: the API answers `FORBIDDEN` with `unsafeForTable`. The sheet stays open
  and shows the existing conflict treatment from `RecipePickerSheet` (`unsafeError`): the conflict line and a
  `Use anyway` secondary button, which retries with `acknowledgeConflict: true`.
- No plan for the chosen week and nothing to carry forward: the day list shows `You don’t have a plan for this
week yet.` with `Make a plan` → the Plan tab. The sheet closes first.
- Success: sheet closes, snackbar `Added to {Tue} {lunch}` + `Undo` (undo calls `friends.undoAddToWeek` with the mutation's result: it restores `previousRecipeId`, or removes the
  added slot when it was empty). `haptics.success`.
- Busy: footer button spinner, chips disabled.

## 10. Gym tab

```
 ROUTINE
 ┌ Upper / Lower 4× ──────────────────────┐
 │ Upper A · Mon                           │
 │  Bench press            3 × 6–8 · 2:30  │
 │  Barbell row            3 × 8–10 · 2:00 │
 │  … (+3 more)                    Show all│
 │ Lower A · Tue …                         │
 └─────────────────────────────────────────┘
 RECENT WORKOUTS
 ┌ Upper A · Tue 29 Sep · 58 min ─────────┐
 │ 6 exercises                             │
 │ Bench press    80 kg × 8                │
 │ Barbell row    70 kg × 10               │
 │                              Show sets ▾│
 └─────────────────────────────────────────┘
 …
 [ Load more ]
 That’s everything from the last 26 weeks.
```

- **Routine** (`FriendRoutineCard`): routine name as the card title. For each day: `{day name} · {weekday}` (weekday
  when planned). Exercises show `{sets} × {repMin}–{repMax}` (spell out `3 sets of 8–12 reps` in the a11y label)
  and rest `m:ss`. A day longer than 4 exercises shows the first 4 + `Show all` (MO-05 expand). Supersets are
  marked with the existing superset bracket visual. Curated exercises are pressable → `/gym/exercise/[id]`
  (existing detail). Custom exercises are plain text with the suffix `(custom)`.
- No active routine: `EmptyState` `{first} doesn’t have a routine yet.`
- **Recent workouts** (`FriendWorkoutCard`): title `{name}`, meta `{Ddd d MMM} · {duration} min` (duration omitted
  when unknown). `{n} exercises`. The top set per exercise (heaviest completed working set; cardio =
  `{duration} · {distance}`) in the **viewer's** units (`kg`/`lb` from the viewer's gym profile, falling back to
  their food units). `Show sets ▾` expands (MO-05) every completed working set: `Set 1  80 kg × 8`. Skipped
  exercises are omitted.
- `Load more` (outline button, full width) fetches 5 more. While loading, the button shows a spinner and 2 skeleton
  cards appear below. At the end the button is replaced by the muted line `That’s everything from the last 26
weeks.` Error on load more: the button returns with the inline text `Couldn’t load more. Try again.`
- No workouts: `EmptyState` `No workouts in the last 26 weeks.`
- Nothing here writes to or reads from the gym offline store (`useGymBootstrap`, `query-persistence`).

## 11. Friends settings, privacy and safety

### 11.1 Friends settings (`/friends/settings`)

```
 WHO CAN FOLLOW YOU
 ◉ Private — you approve each follower
 ○ Public — anyone on Chefer can follow you
 WHAT FOLLOWERS CAN SEE
 This week’s meal plan            [on ]
 Recipes you’ve written           [on ]
 Your routine and workouts        [on ]
 Your daily targets               [off]
   Calorie and macro targets, next to your meal plan.
 See what followers see ›
 NOTIFICATIONS
 Follow requests                  [on ]
 New followers                    [on ]
 Accepted requests                [on ]
 (if OS permission off) Notifications are off in your phone’s settings. Open settings ›
 (if binary lacks push) Update Chefer to get notifications on this phone.
 SAFETY
 Blocked people (2) ›
 ─────────────
 Turn off Friends                 (destructive text button)
```

- Each switch saves on change (optimistic, MO-08). Error rolls back with snackbar `Couldn’t save. Try again.`
- `Your daily targets` on → `ConfirmSheet` `Share your daily targets?` / `Followers will see your daily calorie and
macro targets next to your meal plan.` / `Share targets` / `Cancel`.
- Notification switches are server-side preferences (`friends.updateSettings({ pushFollowRequests | pushNewFollowers |
pushRequestAccepted })`). They apply on every device. Web shows the same section with the note `Notifications arrive on the Chefer app for iPhone and Android.`
- `Turn off Friends` → `ConfirmSheet` (§11.5).

### 11.2 Visibility change confirms

| Change           | Sheet                                                                                                                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private → Public | Title `Make your profile public?` Body: `Anyone on Chefer will be able to follow you without asking, and then see what you share: {list of sections that are on}.` If `n > 0` pending: `Your {n} pending requests will be accepted.` Buttons `Make public` / `Cancel`.              |
| Public → Private | Title `Make your profile private?` Body: `New followers will need your approval. Your {n} current followers can still see what you share. You can remove any of them.` Buttons `Make private` / `Cancel`, plus a text link `Review followers` (closes, `onExited` → Followers tab). |

### 11.3 Profile › Privacy & data row

Mobile `PrivacySection` / web profile privacy group gains one row:

- Activated: `Friends & visibility` with the value `Private` / `Public` on the right → `/friends/settings`.
- Not activated: `Friends & visibility` with the value `Off` → `/friends` (intro).

### 11.4 Remove follower, block, report

| Action          | Surface                                                      | Sheet (ConfirmSheet unless noted)                                                                                                                                                                                                                                                                                                                                                           | After                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove follower | Followers row `…`, profile `…`                               | `Remove {first} as a follower?` / `They won’t be told. They can follow you again, or ask to if your profile is private.` / `Remove`                                                                                                                                                                                                                                                         | Row exits (MO-04). Snackbar `{first} removed`. No undo (they weren't told, and re-adding needs them).                                                                       |
| Block           | Profile `…`, Followers row `…`                               | `Block {first}?` / `They won’t be able to find you or see your profile, and you won’t see theirs. Any follows between you are removed. They won’t be told.` / `Block` (destructive)                                                                                                                                                                                                         | Navigate back from the profile. Snackbar `{first} blocked` with no undo (unblock is in settings).                                                                           |
| Unblock         | Blocked people row                                           | `Unblock {first}?` / `They’ll be able to find you again. Follows aren’t restored.` / `Unblock`                                                                                                                                                                                                                                                                                              | Row exits.                                                                                                                                                                  |
| Report          | Profile `…` (`Report {first}`), recipe `…` (`Report recipe`) | **`ReportSheet`** (a `Sheet`, not a confirm): title `Report {first}` / `Report this recipe`; radio list of reasons (`Inappropriate name or recipe`, `Spam or fake account`, `Harassment`, `Unsafe or harmful content`, `Something else`); optional `Input` `Add details (optional)` 500 chars; switch `Also block {first}` (off); footer `Send report` (disabled until a reason is chosen). | Sheet closes. Snackbar `Thanks. We’ll look into it within 24 hours.` If `Also block` was on, the block happens in the same mutation, and the profile screen navigates back. |

### 11.5 Turn off Friends

`ConfirmSheet` title `Turn off Friends?`. Body:

`This removes you from Friends straight away:`
`• People can’t find or follow you`
`• You stop following everyone, and everyone stops following you`
`• Recipes of yours that friends saved disappear from their lists (copies they already added to their weeks stay theirs)`
`• Your requests and Activity are deleted`
`You can turn Friends on again later, starting fresh.`

Destructive button `Turn off Friends`. On success: navigate to More (mobile) / `/profile` (web), snackbar `Friends is
off.`

### 11.6 Blocked people (`/friends/blocked`)

`PersonRow` (no navigation, the profile isn't viewable) + `Unblock` outline button. Empty: `You haven’t blocked
anyone.`

## 12. Copy deck

All user-visible strings for the feature. Agents put them in `packages/types/src/friends-copy.ts` (`FRIENDS_COPY`),
shared by mobile and web, like `AI_CONSENT_COPY`. Functions for variables.

| Key                                                                              | String                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nav.friends`                                                                    | `Friends`                                                                                                                                                                      |
| `intro.title`                                                                    | `Cook and train with people you know`                                                                                                                                          |
| `intro.body`                                                                     | `Follow friends to see their week of meals, save their recipes and see their workouts.`                                                                                        |
| `intro.nameHeading`                                                              | `How others will see you`                                                                                                                                                      |
| `intro.firstName` / `lastName`                                                   | `First name` / `Last name`                                                                                                                                                     |
| `intro.firstNameError` / `lastNameError`                                         | `Add your first name` / `Add your last name`                                                                                                                                   |
| `intro.whoHeading`                                                               | `Who can follow you`                                                                                                                                                           |
| `visibility.private`                                                             | `Private — you approve each follower`                                                                                                                                          |
| `visibility.public`                                                              | `Public — anyone on Chefer can follow you`                                                                                                                                     |
| `intro.whatHeading`                                                              | `What followers see`                                                                                                                                                           |
| `intro.what.plan`                                                                | `This week’s meals, with calories and macros`                                                                                                                                  |
| `intro.what.recipes`                                                             | `Recipes you’ve written`                                                                                                                                                       |
| `intro.what.workouts`                                                            | `Your routine and recent workouts`                                                                                                                                             |
| `intro.what.change`                                                              | `You can change these any time.`                                                                                                                                               |
| `intro.neverHeading`                                                             | `Never shared`                                                                                                                                                                 |
| `intro.never`                                                                    | `Your email, allergies and diets, body measurements and weight, targets, what you’ve logged, your household.`                                                                  |
| `intro.findable`                                                                 | `People who search your name or your exact email can find you.`                                                                                                                |
| `intro.policy`                                                                   | `Privacy Policy`                                                                                                                                                               |
| `intro.cta` / `intro.notNow`                                                     | `Turn on Friends` / `Not now`                                                                                                                                                  |
| `intro.error`                                                                    | `Couldn’t turn on Friends. Nothing has been changed.`                                                                                                                          |
| `activated.private` / `.public`                                                  | `Friends is on. Only people you approve can see your meals and workouts.` / `Friends is on. People who follow you can see what you share.`                                     |
| `home.title`                                                                     | `Friends`                                                                                                                                                                      |
| `home.searchPlaceholder`                                                         | `Search by name or email`                                                                                                                                                      |
| `home.searchLabel`                                                               | `Search people by name or email`                                                                                                                                               |
| `home.requests`                                                                  | `Requests · {n}`                                                                                                                                                               |
| `home.seeAllRequests`                                                            | `See all {n}`                                                                                                                                                                  |
| `home.following` / `.followers`                                                  | `Following {n}` / `Followers {n}`                                                                                                                                              |
| `home.suggested`                                                                 | `Suggested for you`                                                                                                                                                            |
| `home.seeAll`                                                                    | `See all`                                                                                                                                                                      |
| `home.activityLabel`                                                             | `Activity, {n} new` (0 → `Activity`)                                                                                                                                           |
| `home.settingsLabel`                                                             | `Friends settings`                                                                                                                                                             |
| `empty.following.title` / `.body`                                                | `Find people you know` / `Search by name or email, or follow someone below.`                                                                                                   |
| `empty.followers.title` / `.body`                                                | `No followers yet` / `Share Chefer with friends so they can find you.`                                                                                                         |
| `invite.cta`                                                                     | `Invite a friend`                                                                                                                                                              |
| `invite.card.title` / `.body`                                                    | `Chefer is better with friends` / `Invite someone you cook or train with.`                                                                                                     |
| `invite.message`                                                                 | `I’m using Chefer to plan meals and workouts. Find me in Friends: {myName}. {appLink}`                                                                                         |
| `invite.copied` (web)                                                            | `Invite copied. Paste it anywhere.`                                                                                                                                            |
| `reason.mutualOne`                                                               | `Followed by {name}`                                                                                                                                                           |
| `reason.mutualMany`                                                              | `Followed by {name} and {n} others` (`{n} = 1` → `and 1 other`)                                                                                                                |
| `reason.followsYou`                                                              | `Follows you`                                                                                                                                                                  |
| `reason.popular`                                                                 | `Popular on Chefer`                                                                                                                                                            |
| `reason.inCommon`                                                                | `{n} friends in common` (`1 friend in common`)                                                                                                                                 |
| `requestRow.accept` / `.decline`                                                 | `Accept` / `Decline`                                                                                                                                                           |
| `accepted.snackbar`                                                              | `{first} can now see your meals and workouts.` action `Follow back`                                                                                                            |
| `relation.follow` / `.followBack` / `.requested` / `.following` / `.editSharing` | `Follow` / `Follow back` / `Requested` / `Following` / `Edit sharing`                                                                                                          |
| `confirm.unfollow.title` / `.body`                                               | `Unfollow {first}?` / (private) `You’ll need to ask again to see their meals and workouts.` (public) no body                                                                   |
| `confirm.unfollow.cta`                                                           | `Unfollow`                                                                                                                                                                     |
| `confirm.cancelRequest.title` / `.cta`                                           | `Cancel your request?` / `Cancel request` (dismiss button `Keep request`)                                                                                                      |
| `relation.error`                                                                 | `Couldn’t update. Try again.` action `Retry`                                                                                                                                   |
| `search.keepTyping`                                                              | `Keep typing…`                                                                                                                                                                 |
| `search.fullEmailHint`                                                           | `Type the full email address to find someone by email.`                                                                                                                        |
| `search.noResults.title` / `.body`                                               | `No one found for “{query}”` / `They may not have turned on Friends yet.`                                                                                                      |
| `search.rateLimited`                                                             | `Too many searches. Try again in a minute.`                                                                                                                                    |
| `search.error`                                                                   | `Couldn’t search right now.`                                                                                                                                                   |
| `search.offline`                                                                 | `Search needs a connection`                                                                                                                                                    |
| `search.announce`                                                                | `{n} people found` (`1 person found`, `No one found`)                                                                                                                          |
| `requests.title` / `.subtitle`                                                   | `Follow requests` / `Only you can see this list.`                                                                                                                              |
| `requests.empty.title` / `.body`                                                 | `No requests` / `When someone asks to follow you, it shows up here.`                                                                                                           |
| `activity.title`                                                                 | `Activity`                                                                                                                                                                     |
| `activity.new` / `.earlier`                                                      | `New` / `Earlier`                                                                                                                                                              |
| `activity.request`                                                               | `{name} wants to follow you`                                                                                                                                                   |
| `activity.newFollower`                                                           | `{name} started following you`                                                                                                                                                 |
| `activity.accepted`                                                              | `{name} accepted your request`                                                                                                                                                 |
| `activity.youAccepted` / `.youDeclined`                                          | `You accepted` / `You declined`                                                                                                                                                |
| `activity.empty.title` / `.body`                                                 | `Nothing yet` / `Follow requests and new followers show up here.`                                                                                                              |
| `activity.retention`                                                             | `Activity is kept for 90 days.`                                                                                                                                                |
| `push.request.title` / `.body`                                                   | `{name} wants to follow you` / `Open Chefer to accept or decline.`                                                                                                             |
| `push.newFollower.title` / `.body`                                               | `{name} started following you` / `See their profile or follow back.`                                                                                                           |
| `push.accepted.title` / `.body`                                                  | `{name} accepted your follow request` / `You can now see their meals and workouts.`                                                                                            |
| `push.channel`                                                                   | `Friends`                                                                                                                                                                      |
| `primer.title` / `.body`                                                         | `Know when friends follow you` / `Get a notification when someone asks to follow you or accepts your request. Nothing about your meals or workouts is ever in a notification.` |
| `primer.cta` / `.notNow`                                                         | `Turn on notifications` / `Not now`                                                                                                                                            |
| `profile.counts`                                                                 | `{n} followers · {m} following` (`1 follower`)                                                                                                                                 |
| `profile.followsYou`                                                             | `Follows you`                                                                                                                                                                  |
| `profile.moreOptions`                                                            | `More options for {name}`                                                                                                                                                      |
| `profile.food` / `.gym`                                                          | `Food` / `Gym`                                                                                                                                                                 |
| `locked.private.title` / `.body`                                                 | `This profile is private` / `Follow {first} to see their meals and workouts.`                                                                                                  |
| `locked.requested.title` / `.body`                                               | `Request sent` / `You’ll see their meals and workouts once {first} accepts.`                                                                                                   |
| `locked.public.body`                                                             | `Follow {first} to see their meals and workouts.`                                                                                                                              |
| `notShared.plan` / `.recipes` / `.workouts`                                      | `{first} isn’t sharing their meal plan` / `{first} isn’t sharing their recipes` / `{first} isn’t sharing their workouts`                                                       |
| `hiddenFromFollowers`                                                            | `Hidden from followers`                                                                                                                                                        |
| `preview.banner`                                                                 | `This is what your followers see.`                                                                                                                                             |
| `notAvailable.title` / `.body` / `.cta`                                          | `Profile not available` / `This profile doesn’t exist or isn’t available to you.` / `Go back`                                                                                  |
| `profile.error`                                                                  | `Couldn’t load this profile.`                                                                                                                                                  |
| `food.thisWeek` / `.recipes`                                                     | `This week` / `Recipes {n}`                                                                                                                                                    |
| `food.weekOf`                                                                    | `Week of {d MMM}`                                                                                                                                                              |
| `food.avg`                                                                       | `avg {kcal} kcal/day`                                                                                                                                                          |
| `food.portion`                                                                   | `{n} portion` / `{n} portions`                                                                                                                                                 |
| `food.macros`                                                                    | `{kcal} kcal · P {p} g · C {c} g · F {f} g`                                                                                                                                    |
| `food.dayTotal`                                                                  | `Day total {kcal} kcal`                                                                                                                                                        |
| `food.target`                                                                    | `Target {kcal} kcal · P {p} g`                                                                                                                                                 |
| `food.emptyDay`                                                                  | `Nothing planned for {weekday}.`                                                                                                                                               |
| `food.noPlan`                                                                    | `{first} hasn’t planned this week yet.`                                                                                                                                        |
| `recipes.search`                                                                 | `Search {first}’s recipes`                                                                                                                                                     |
| `recipes.empty`                                                                  | `{first} hasn’t shared any recipes yet.`                                                                                                                                       |
| `recipes.save` / `.unsave` (a11y)                                                | `Save {recipe}` / `Remove {recipe} from saved`                                                                                                                                 |
| `recipes.saved` / `.removed`                                                     | `Saved to your cookbook` / `Removed from saved` (action `Undo`)                                                                                                                |
| `recipe.by`                                                                      | `By {name}`                                                                                                                                                                    |
| `recipe.from` / `.fromGone`                                                      | `From {first}` / `From a Chefer friend`                                                                                                                                        |
| `recipe.addToWeek`                                                               | `Add to my week`                                                                                                                                                               |
| `recipe.report`                                                                  | `Report recipe`                                                                                                                                                                |
| `addToWeek.title`                                                                | `Add to your week`                                                                                                                                                             |
| `addToWeek.thisWeek` / `.nextWeek`                                               | `This week` / `Next week`                                                                                                                                                      |
| `addToWeek.addHere` / `.replace`                                                 | `Add here` / `Replace`                                                                                                                                                         |
| `addToWeek.cta`                                                                  | `Add to {Tue} {lunch}`                                                                                                                                                         |
| `addToWeek.noPlan` / `.makePlan`                                                 | `You don’t have a plan for this week yet.` / `Make a plan`                                                                                                                     |
| `addToWeek.replaceTitle` / `.replaceBody`                                        | `Replace {meal}?` / `{recipe} goes on {Tue} {lunch} instead.`                                                                                                                  |
| `addToWeek.done`                                                                 | `Added to {Tue} {lunch}` (action `Undo`)                                                                                                                                       |
| `gym.routine` / `.recent`                                                        | `Routine` / `Recent workouts`                                                                                                                                                  |
| `gym.showAll` / `.showSets` / `.hideSets`                                        | `Show all` / `Show sets` / `Hide sets`                                                                                                                                         |
| `gym.custom`                                                                     | `(custom)`                                                                                                                                                                     |
| `gym.exercises`                                                                  | `{n} exercises` (`1 exercise`)                                                                                                                                                 |
| `gym.noRoutine`                                                                  | `{first} doesn’t have a routine yet.`                                                                                                                                          |
| `gym.noWorkouts`                                                                 | `No workouts in the last 26 weeks.`                                                                                                                                            |
| `gym.loadMore` / `.end` / `.loadMoreError`                                       | `Load more` / `That’s everything from the last 26 weeks.` / `Couldn’t load more. Try again.`                                                                                   |
| `settings.title`                                                                 | `Friends settings`                                                                                                                                                             |
| `settings.who` / `.what` / `.notifications` / `.safety`                          | `Who can follow you` / `What followers can see` / `Notifications` / `Safety`                                                                                                   |
| `settings.plan` / `.recipes` / `.workouts` / `.targets`                          | `This week’s meal plan` / `Recipes you’ve written` / `Your routine and workouts` / `Your daily targets`                                                                        |
| `settings.targetsDetail`                                                         | `Calorie and macro targets, next to your meal plan.`                                                                                                                           |
| `settings.preview`                                                               | `See what followers see`                                                                                                                                                       |
| `settings.push.requests` / `.newFollowers` / `.accepted`                         | `Follow requests` / `New followers` / `Accepted requests`                                                                                                                      |
| `settings.push.osOff` / `.openSettings`                                          | `Notifications are off in your phone’s settings.` / `Open settings`                                                                                                            |
| `settings.push.unsupported`                                                      | `Update Chefer to get notifications on this phone.`                                                                                                                            |
| `settings.push.webNote`                                                          | `Notifications arrive on the Chefer app for iPhone and Android.`                                                                                                               |
| `settings.blocked`                                                               | `Blocked people ({n})`                                                                                                                                                         |
| `settings.turnOff`                                                               | `Turn off Friends`                                                                                                                                                             |
| `settings.saveError`                                                             | `Couldn’t save. Try again.`                                                                                                                                                    |
| `targets.confirm.title` / `.body` / `.cta`                                       | `Share your daily targets?` / `Followers will see your daily calorie and macro targets next to your meal plan.` / `Share targets`                                              |
| `public.confirm.*`                                                               | see §11.2 (title `Make your profile public?`, cta `Make public`)                                                                                                               |
| `private.confirm.*`                                                              | see §11.2 (title `Make your profile private?`, cta `Make private`, link `Review followers`)                                                                                    |
| `privacyRow.label` / values                                                      | `Friends & visibility` / `Private` · `Public` · `Off`                                                                                                                          |
| `remove.*`                                                                       | see §11.4                                                                                                                                                                      |
| `block.*` / `unblock.*`                                                          | see §11.4                                                                                                                                                                      |
| `report.titleUser` / `.titleRecipe`                                              | `Report {first}` / `Report this recipe`                                                                                                                                        |
| `report.reasons`                                                                 | `Inappropriate name or recipe` · `Spam or fake account` · `Harassment` · `Unsafe or harmful content` · `Something else`                                                        |
| `report.details` / `.alsoBlock` / `.cta`                                         | `Add details (optional)` / `Also block {first}` / `Send report`                                                                                                                |
| `report.done`                                                                    | `Thanks. We’ll look into it within 24 hours.`                                                                                                                                  |
| `blocked.empty`                                                                  | `You haven’t blocked anyone.`                                                                                                                                                  |
| `turnOff.*`                                                                      | see §11.5; done `Friends is off.`                                                                                                                                              |
| `offline.line`                                                                   | `Offline · showing what was saved {time}`                                                                                                                                      |
| `offline.needsConnection`                                                        | `Needs a connection`                                                                                                                                                           |
| `unavailable`                                                                    | `Friends isn’t available right now.`                                                                                                                                           |

## 13. Accessibility

- **Targets:** every pressable ≥ 44 × 44 pt (`min-h-11`; icon buttons `h-11 w-11`; the suggestion `×` and heart
  get `hitSlop` to 44). Web: `min-h-11` on buttons and rows; checked by the Playwright touch-target sweep.
- **Text:** nothing below `text-xs` (12 px). Counts and badges use `text-xs font-semibold`. Dense rows (day chips)
  use `DENSE_MAX_FONT_SCALE`. Everything else goes to 1.8× and wraps: names wrap to 2 lines, and relation buttons
  keep a fixed width but their label may wrap under the avatar at ≥ 1.6× (row switches to a stacked layout).
- **Rows:** `PersonRow` is one accessible element labelled `{name}, {secondary line}` with the hint `Opens profile`.
  The trailing button is a separate element. Request rows read `{name} wants to follow you` with `Accept` and
  `Decline` as separate buttons whose labels include the name (`Accept Andrei Ionescu`).
- **State:** `RelationButton` announces its state and action (§3.3). Switches use `accessibilityRole="switch"` with
  their label. Segmented controls use `accessibilityRole="tab"` (mobile) / radiogroup (web) with selected state.
  The heart has `accessibilityState={{ selected }}`.
- **Announcements:** search result counts, accept/decline outcome (`Request from {name} accepted`), follow outcome
  (`Now following {name}` / `Request sent to {name}`), load-more count (`5 more workouts loaded`). Web uses one
  `aria-live="polite"` region per page.
- **Focus:** web sheets trap focus and return it to the trigger (kit `Sheet`). After removing a row, focus moves to
  the next row, or the list heading if none. Mobile: after a sheet closes, VoiceOver focus returns to the trigger
  (`AccessibilityInfo.setAccessibilityFocus`).
- **Colour:** never meaning by colour alone. `Private`/`Public` badges have icon + word. Relation states differ by
  label, not only fill.
- **Forms:** name inputs have visible labels. Errors are linked (`aria-describedby` + `aria-invalid` on web,
  `accessibilityHint` + error text on mobile). Inputs render at 16 px below `sm` (global).
- **Reduced motion:** all MO patterns below degrade to fades or none via `useReducedMotion()` (mobile JS) and the
  global CSS rule (web).

## 14. Motion

Only tokens (`duration.*`, `spring.*`, `easing.*` from `@chefer/tokens`; web utilities `duration-instant…deliberate`,
`ease-standard/enter/exit/spring-*`). Transform and opacity only. No `transition-all`, no width transitions.

| Moment                                             | Pattern | Spec                                                                                                                                |
| -------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Row / card press                                   | MO-01   | `PressableScale` (mobile, `pressScale="card"`); `pressCard` (web cards), `pressControl` via `buttonVariants` (buttons)              |
| Every sheet (confirm, report, add-to-week, primer) | MO-02   | Kit `Sheet` enter `duration.slow` + `spring.gentle`, exit `exit(duration.slow)`; web through `usePresence`                          |
| Skeleton → content (home, profile, tabs)           | MO-03   | Crossfade `duration.base`, rows stagger 30 ms, max 6                                                                                |
| Accept/decline/remove/dismiss rows                 | MO-04   | Exit: fade + 8 pt slide, `duration.base` `easing.exit`; the rest settle with `spring.gentle` (mobile Reanimated layout transitions) |
| Workout `Show sets`, routine `Show all`            | MO-05   | Height via content reveal (mobile `Layout` transition; web `grid-rows` 0fr→1fr); no `height` animation on web                       |
| Relation button and switches (optimistic)          | MO-08   | Instant flip + `haptics.selection`; pending dot after 400 ms; rollback shake ±4 pt, 300 ms + `haptics.error`                        |
| Food/Gym and sub-switch thumb, heart               | MO-14   | Thumb slide `spring.snappy`; heart pop `spring.bouncy` scale 1→1.2→1 + `haptics.success` on save                                    |
| Profile header → sticky switch                     | MO-12   | Hairline + e1 shadow fade in `duration.fast` when stuck                                                                             |
| Recipe/meal photos                                 | MO-13   | Fade-in `duration.base` on load; placeholder stays on error                                                                         |

## 15. Web responsive layout

Mobile-first. Unprefixed classes are the phone layout. Pages render inside `<main id="main">` with exactly one
`<h1>` (the `Friends` title; on a profile the person's name is the `h1`). Each route has a `layout.tsx` with
`metadata.title`. Never `h-screen`/`100vh` (use `dvh`). `min-w-0` on every flex child with text. Nothing scrolls
horizontally.

| Breakpoint    | Friends home                                                                                                                                                             | Profile                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| base (0–639)  | Single column exactly as mobile §5. Bottom tab bar visible; `<main>` already reserves `pb-nav-safe`.                                                                     | Single column: header centred, switch, content. Food week uses the day-picker pattern of `features/meal-plan/components/day-view.tsx` (one day at a time).                                                                                              |
| `sm` (≥ 640)  | Same column, `max-w-2xl mx-auto`. Relation buttons stay fixed width.                                                                                                     | Recipes grid 2 columns → 3 at `md`.                                                                                                                                                                                                                     |
| `md` (≥ 768)  | Search + requests on top; lists and suggestions stacked.                                                                                                                 | Header becomes a row: avatar left, name/counts, button right.                                                                                                                                                                                           |
| `lg` (≥ 1024) | Sidebar shell. Two columns: `lg:grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6`: left = search, requests, Following/Followers; right = suggestions card (sticky `top-4`). | Two columns for Gym: routine left, recent workouts right. Food week: still the day picker plus a compact 7-day kcal strip above it.                                                                                                                     |
| `xl` (≥ 1280) | Same, `max-w-6xl`.                                                                                                                                                       | Food week as a 7-column grid (`xl:grid-cols-7`, each column `min-w-0`, meal cards compact: photo 16:9, name 2 lines, kcal line). No `min-w-[900px]` horizontal scroller (the meal planner's desktop grid pattern is **not** reused because it scrolls). |

Web-specific interaction: the overflow `…` uses `useMenu()` (Escape, arrows, focus return, outside click). There's no
hover-only affordance: the dismiss `×` is always visible. `Invite a friend` copies to the clipboard and shows a `Toast`
(`invite.copied`). Using `navigator.share` when available is fine on mobile web.

## 16. Design acceptance checklist

A build passes design review when all of these hold, on iOS, Android and web (base and `lg`):

1. More shows `Friends` directly under `Profile`. The Settings hub and web nav entries exist. Badges show pending +
   unread and cap at `9+`.
2. A never-activated user sees the intro, can't be found by a second account by name or email, and `Not now`
   stores nothing.
3. Every string on every screen matches §12 exactly.
4. `RelationButton` shows the same state in search, lists, suggestions, Activity and profile after any change, with
   no reload.
5. Locked, not-shared, not-available, empty, loading, error and offline states render as specified. A failed load
   never looks empty.
6. The profile's Food|Gym switch never changes the app's mode.
7. A friend's week shows meals, portions, per-meal and per-day kcal/P/C/F, the week average, and nothing from §7.2
   of the PRD (no targets unless shared, no safety chips, no costs).
8. Add to my week: works into an empty slot and a filled slot (with the chained replace confirm), handles a safety
   conflict with `Use anyway`, and offers Undo.
9. Gym tab: routine read-only, workouts 5 at a time with `Load more` and the end line. Values are in the viewer's
   units.
10. Block, report, remove follower and turn off work from the specified surfaces with the specified copy. No sheet
    ever opens while another is closing (iOS).
11. VoiceOver/TalkBack read rows, buttons and states as specified. All targets ≥ 44 pt. No text below 12 px. 1.8×
    text wraps without clipping.
12. The Playwright mobile sweep passes at 320/375/390/430 px for every new web route.
