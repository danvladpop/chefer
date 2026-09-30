# Chefer Following: UX and UI design spec

**rev 2 · 2026-09-30 · built on [`prd.md`](./prd.md) rev 2 (all owner decisions applied) · build read `master` @
`9dd93f3a`**

Role: principal product designer (iOS HIG and Material aware), writing for implementation agents. This spec covers
the **mobile app** (`apps/mobile`, one Expo codebase for iOS and Android). Web is a later phase; §15 lists what it will
need. Data shapes and task sizing live in [`implementation-plan.md`](./implementation-plan.md).

**Rev 2 changes:**

- The user-facing name is **Following** (code name stays `friends`).
- Search is by name only.
- Workouts show the last 7 days, with no Load more.
- Imported recipes are shared, with source attribution.
- Moderation is automatic: one-tap report that also blocks, and hidden states.
- There is no push: the in-app inbox and badges are the whole notification mechanism.
- Web moved to a later phase.
- Everything ships over the air, so no screen uses a native module the 1.0.1 binary doesn't already have.

**Conventions** (the same as the persona-study UX spec, so the app reads as one product):

- Copy in `code quotes` and in the copy deck (§12) is **exact**: British spelling, sentence case, curly apostrophes
  `’`, `…` not `...`, no exclamation marks, verbs first. `{braces}` are variables. `{first}` = the other person's
  first name, `{name}` = their full display name.
- **Naming:** every user-visible string says "Following", never "Friends". Code identifiers keep `friends`: routes
  `/friends/...`, folders `features/friends`, the `friends.*` procedures, testIDs `friends-*`.
- Kit = `@chefer/ui-mobile`. Tokens = `@chefer/tokens`. Motion patterns are named by ID (MO-01…MO-15,
  `docs/audit-2026-09/motion-system.md`); put the ID in the code comment.

Contents: [1 Principles](#1-design-principles) · [2 IA](#2-information-architecture) ·
[3 Components](#3-components) · [4 Turn on Following](#4-turn-on-following) · [5 Home](#5-following-home) ·
[6 Search](#6-search-name-only) · [7 Requests and Activity](#7-requests-and-activity) · [8 Profile](#8-profile-view) ·
[9 Food tab](#9-food-tab) · [10 Gym tab](#10-gym-tab) · [11 Settings, safety, moderation](#11-sharing--privacy-safety-and-moderation) ·
[12 Copy deck](#12-copy-deck) · [13 Accessibility](#13-accessibility) · [14 Motion](#14-motion) ·
[15 Web phase (later)](#15-web-phase-later) · [16 Acceptance checklist](#16-design-acceptance-checklist)

---

## 1. Design principles

1. **Nothing changes until you choose it.** Following is invisible to anyone who hasn't turned it on. The intro says
   plainly who can find you and what they'll see, before anything is stored.
2. **Say who can see it, where it's shared.** Every sharing control names its audience. `See what followers see`
   shows exactly what others see.
3. **The follow button is one control everywhere.** It has the same states and words in search, lists, suggestions,
   Activity and profiles. It changes instantly (optimistic) and rolls back politely.
4. **Read-only means read-only.** Another person's week and routine have no edit affordances. The only actions are
   heart, `Add to my week`, `Cook`, `Show sets` and the source link.
5. **Numbers without judgement.** Other people's calories and macros are plain facts: no red/green, no "over target".
6. **Safety is instant and quiet.** Reporting is one tap on a reason and blocks at once. Hidden content just isn't
   there, with no drama. The owner of hidden content is told plainly on their own screens.

## 2. Information architecture

### 2.1 Entry points (mobile)

| Entry                                                    | Detail                                                                                                                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| More tab → `Following` row, **directly below `Profile`** | `apps/mobile/app/(food)/more.tsx` `ITEMS`: insert `{ href: '/friends', label: 'Following', icon: 'people-outline', testID: 'more-friends' }` after `more-profile`. The row shows a `CountPill` when `badgeCount > 0`. |
| More tab icon badge (Food mode)                          | `app/(food)/_layout.tsx`: `tabBarBadge` = `badgeCount` (capped `9+`), hidden at 0.                                                                                                                                    |
| `ModeSwitch` gear → Settings hub → Account → `Following` | `src/features/settings/settings-screen.tsx` `GROUPS` (Account, first row) → `/friends`. This is Gym mode's path, since there's no More tab there.                                                                     |
| Profile › Privacy & data → `Profile visibility`          | `src/features/privacy/privacy-section.tsx`: a row between `ConsentHistory` and the gym settings row. Value `Private` / `Public` / `Off` → `/friends/settings`, or the intro if not activated.                         |

`badgeCount` = pending requests + unread Activity, from `friends.me`. It is refetched on app focus and polled every
60 s in the foreground. **This badge is the notification mechanism.** There is no push (PRD Q-F-14). Nothing renders
when `friends.availability` is off.

### 2.2 Routes (expo-router, root `Stack`, inside the signed-in `Stack.Protected`)

| Screen                | Route file                    | Header title          |
| --------------------- | ----------------------------- | --------------------- |
| Home (or intro)       | `app/friends/index.tsx`       | `Following`           |
| All requests          | `app/friends/requests.tsx`    | `Follow requests`     |
| Activity              | `app/friends/activity.tsx`    | `Activity`            |
| Sharing & privacy     | `app/friends/settings.tsx`    | `Sharing & privacy`   |
| Blocked people        | `app/friends/blocked.tsx`     | `Blocked people`      |
| Suggestions (See all) | `app/friends/suggestions.tsx` | `Suggested for you`   |
| Someone's profile     | `app/friends/[userId].tsx`    | (scrolls in) `{name}` |

### 2.3 Map

```
More ─┬─ Profile
      └─ Following ─┬─ (not activated) Intro ──▶ Turn on Following ──▶ Home
                    └─ Home
                         ├─ 🔔 Activity ───────────▶ profile / accept / decline
                         ├─ ⚙ Sharing & privacy ─┬─ visibility, sharing switches
                         │                        ├─ Blocked people
                         │                        └─ Turn off Following
                         ├─ Search (name) ────────▶ profile
                         ├─ Requests (≤3) → See all ▶ Requests
                         ├─ You follow | Followers ▶ profile
                         └─ Suggested for you → See all ▶ Suggestions
Profile /friends/[id] ── header (Follow · …) ── Food | Gym
   Food ─┬─ This week (day chips, meals, totals) ─▶ recipe/[id] ─▶ Add to my week sheet
         └─ Recipes grid ─────────────────────────▶ recipe/[id]  (♥, Add to my week, Cook, Source, Report recipe)
   Gym ──┬─ Routine
         └─ Last 7 days (all workouts, no paging)
```

## 3. Components

### 3.1 New shared kit components (`packages/ui-mobile/src/components/`)

All are JS-only (React Native + Reanimated), so they are OTA-safe.

| Component     | Spec                                                                                                                                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Avatar`      | `avatar.tsx`: `{ name, seed, imageUrl?, size?: 'sm' 32 \| 'md' 40 \| 'lg' 72, testID? }`. Initials (first letter of first + last name) on one of 8 warm token colours picked by a hash of `seed` (user id). `expo-image` when `imageUrl` is set. `accessible={false}` (rows carry the label).   |
| `SearchField` | `search-field.tsx`: a 44 pt pill `TextInput` with a leading `search` icon and a trailing clear `×` (44 pt hit area, label `Clear search`). `returnKeyType="search"`, `autoCorrect={false}`, `autoCapitalize="words"`. `accessibilityLabel` is required. `onDebouncedChange` fires after 250 ms. |
| `Skeleton`    | `skeleton.tsx`: a `bg-muted` block with the MO-03 shimmer (1.2 s, off under `useReducedMotion`).                                                                                                                                                                                                |
| `CountPill`   | `count-pill.tsx`: a `{ count }` pill, `9+` cap, `bg-primary`, `text-xs font-semibold`, hidden at 0.                                                                                                                                                                                             |

### 3.2 Feature components (`apps/mobile/src/features/friends/…`)

| Component           | Purpose                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RelationButton`    | The one follow control (§3.3). Props `{ userId, relation, followsYou, name, size: 'sm' \| 'md', source }`. It owns the optimistic mutation and the confirmations.                                                                      |
| `PersonRow`         | `Avatar` + name (wraps to 2 lines at large text) + secondary line + trailing slot. The whole row is a `PressableScale` (MO-01) to the profile, `min-h-16`. The trailing control is a separate focus target.                            |
| `RequestRow`        | `PersonRow` + `Accept` (primary `sm`) + `Decline` (outline `sm`).                                                                                                                                                                      |
| `FollowingHeader`   | The title `Following` + an Activity bell (`notifications-outline` + `CountPill`) + a gear (`settings-outline`), both 44 pt icon buttons.                                                                                               |
| `ProfileHeader`     | A large avatar, name, `Follows you` tag, counts `{n} followers · {m} following`, `RelationButton md`, and the overflow `…`.                                                                                                            |
| `LockedPanel`       | Icon, title, body.                                                                                                                                                                                                                     |
| `FriendWeekView`    | Day chips + meal cards + day totals for another person's week (read-only). It uses the presentational `MealCardView` extracted from `PlanMealCard` (`src/features/meal-plan/`) with no swap, pin, safety chip, tailoring mark or cost. |
| `FriendRecipeGrid`  | A two-column grid of recipe cards (photo, name, kcal, time, source domain for imported recipes, heart).                                                                                                                                |
| `AddToWeekSheet`    | A day + meal picker for the viewer's own week (§9.5).                                                                                                                                                                                  |
| `FriendRoutineCard` | A read-only routine, using the presentational `DayCardView` extracted from the local `DayCard` in `app/(gym)/routine.tsx`.                                                                                                             |
| `FriendWorkoutCard` | A collapsed summary + an expandable set list (MO-05).                                                                                                                                                                                  |
| `ReportSheet`       | Reason buttons. One tap on a reason reports **and** blocks (§11.4).                                                                                                                                                                    |
| `SourceLink`        | `Source: {domain}`, pressable, opening `sourceUrl` with RN core `Linking.openURL` (no new native module). Label `Open the original recipe on {domain}`.                                                                                |

Existing kit parts used: `Sheet` (all overlays; `onExited` for chaining), `ConfirmSheet` (every destructive
confirm), `Snackbar`/`useSnackbar`, `SegmentedControl`, `EmptyState`, `ErrorState`, `Button`, `Badge`, `Chip`, `Card`,
`PressableScale`, `haptics`, `Text`, `Screen`, `KeyboardAwareScrollView`, `Input`. RN core `Share` (invite, as the
shopping-list share already does). **No hand-rolled full-screen overlays.**

**iOS rule (binding):** never present one `Sheet`/`Modal` while another is dismissing. Chains (Add-to-week → Replace
confirm, the Public confirm after the intro, Private confirm → Review followers) close the first sheet and open the
next from its `onExited`, never in the same tick.

### 3.3 `RelationButton` states

| Relation (from the API)      | Label          | Variant   | Tap does                                                                   | A11y label                                               |
| ---------------------------- | -------------- | --------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `none`, they don't follow me | `Follow`       | default   | `friends.follow` → optimistic `Following` (public) / `Requested` (private) | `Follow {name}`                                          |
| `none`, they follow me       | `Follow back`  | default   | the same                                                                   | `Follow {name} back`                                     |
| `requested`                  | `Requested`    | outline   | ConfirmSheet `Cancel your request?` → `friends.unfollow`                   | `Requested. Double-tap to cancel your request to {name}` |
| `following`                  | `Following`    | secondary | ConfirmSheet `Unfollow {first}?` → `friends.unfollow`                      | `Following {name}. Double-tap to unfollow`               |
| `self`                       | `Edit sharing` | outline   | → `/friends/settings`                                                      | `Edit what followers see`                                |

- Fixed width per size (`sm` 112 pt, `md` 140 pt), so a label change never reflows the row (MO-14 crossfade,
  `duration.fast`).
- Optimistic (MO-08): the flip is instant with `haptics.selection`. On error it rolls back with a ±4 pt shake,
  `haptics.error`, and a snackbar `Couldn’t update. Try again.` with `Retry`. The mutation's returned `relation` is
  the truth: if a profile went private meanwhile, `Follow` settles on `Requested`.
- One mutation result updates every cached list, search page, suggestion, Activity item and profile for that user
  (`relation-cache.ts`).

## 4. Turn on Following

### 4.1 Intro (`/friends` when `friends.me.activated === false`)

```
┌───────────────────────────────────────┐
│ ←  Following                          │
│   Follow people you cook and train    │
│   with                                │
│ See their week of meals, save their   │
│ recipes and see their workouts.       │
│ HOW OTHERS WILL SEE YOU               │
│ (MP)  [ Maria        ] [ Pop        ] │
│ WHO CAN FOLLOW YOU                    │
│ ◉ Private — you approve each follower │
│ ○ Public — anyone on Chefer can       │
│   follow you                          │
│ WHAT FOLLOWERS SEE                    │
│ ✓ This week’s meals, with calories    │
│   and macros                          │
│ ✓ Recipes you’ve written or imported  │
│ ✓ Your routine and last 7 days of     │
│   workouts                            │
│ You can change these any time.        │
│ NEVER SHARED                          │
│ Your email, allergies and diets, body │
│ measurements and weight, targets,     │
│ what you’ve logged, your household.   │
│ People who search your name can find  │
│ you. Content that several people      │
│ report is hidden automatically.       │
│  Privacy Policy ›                     │
├───────────────────────────────────────┤
│ [       Turn on Following         ]   │
│            Not now                    │
└───────────────────────────────────────┘
```

- `KeyboardAwareScrollView` with a sticky footer (PAT-11). The name inputs have visible labels `First name` / `Last
name`, are prefilled and required (1–50 chars).
- Errors:
  - empty: `Add your first name` / `Add your last name`;
  - the word filter (server `BAD_REQUEST` with `data.textRejected: 'name'`): `Please choose a different name. Some
words aren’t allowed on Chefer profiles.` under the name fields;
  - each error is linked via `accessibilityHint` and error text.
- Visibility is a radio group (two `PressableScale` cards, `accessibilityRole="radio"` with checked state). Private is
  preselected.
- `Turn on Following`:
  - Private → `friends.activate({ visibility: 'PRIVATE', firstName, lastName, documentVersion })`.
  - Public → first the Public confirm (§11.2), chained via `onExited`, then activate with `PUBLIC`.
  - Success → the home, with snackbar `Following is on. Only people you approve can see your meals and workouts.`
    (Private) or `Following is on. People who follow you can see what you share.` (Public).
  - If the response reports `filterHiddenRecipes > 0`, a second snackbar follows (queued after the first):
    `{n} of your recipes won’t be shown to followers because of words in their name or description.`
- `Not now` → back. Nothing is stored.
- `Privacy Policy ›` → `Linking.openURL(getWebUrl('/privacy'))`, as the terms sheet does.
- Error: `Couldn’t turn on Following. Nothing has been changed.` above the footer.

## 5. Following home

### 5.1 Layout

```
┌───────────────────────────────────────┐
│ ←  Following                  🔔² ⚙    │
│ ┌───────────────────────────────────┐ │
│ │ 🔍 Search by name                  │ │
│ └───────────────────────────────────┘ │
│ REQUESTS · 4                          │
│ (AI) Andrei Ionescu   [Accept][Decline]│
│      Followed by Maria Pop             │
│ (EL) Elena Radu       [Accept][Decline]│
│ (CS) Chris Stan       [Accept][Decline]│
│  See all 4 ›                           │
│ ┌ You follow 12 ┬ Followers 9 ┐       │
│ (AI) Andrei Ionescu        [Following] │
│      Follows you                       │
│ (MP) Maria Pop             [Requested] │
│ SUGGESTED FOR YOU            See all › │
│ (CK) Chefer Kitchen   [Follow]    ×    │
│      Popular on Chefer                 │
└───────────────────────────────────────┘
```

- One virtualised `FlatList` with section headers. The search field is the list header.
- **Requests** render only when `total > 0`: up to 3 `RequestRow`s, then `See all {n} ›`.
  - Accept or Decline removes the row (MO-04).
  - Accept then shows the snackbar `{first} can now see your meals and workouts.`, with the action `Follow back`
    when not already following.
- **You follow | Followers** is a `SegmentedControl` (`size="sm"`, labels `You follow {n}` / `Followers {n}`),
  remembered for the session.
  - Rows are `PersonRow` + `RelationButton sm`.
  - Followers rows add an overflow `…` (label `More options for {name}`) with `Remove follower` and `Block`.
  - 20 per page, infinite scroll.
- **Suggested for you**: up to 5, each a `PersonRow` (reason as the secondary line) + `RelationButton sm` + a dismiss
  `×` (label `Hide suggestion {name}`).
  - Dismissing removes the row (MO-04).
  - Following keeps the row in place with its new state until the next refresh.
- Pull to refresh refetches everything, including the badge.

### 5.2 States

| State                           | Treatment                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First load                      | Skeletons: the search pill, 3 person rows, the segmented control, 3 rows (MO-03).                                                                                                           |
| `You follow` empty              | `EmptyState` `people-outline`: `Find people you know` / `Search by name, or follow someone below.`                                                                                          |
| `Followers` empty               | `EmptyState`: `No followers yet` / `Share Chefer with people you know so they can find you.` / action `Invite someone`.                                                                     |
| Suggestions empty               | A `Card`: `Chefer is better together` / `Invite someone you cook or train with.` / `Invite someone`.                                                                                        |
| Section error                   | Compact `ErrorState`: `Couldn’t load {your requests \| this list \| suggestions}.` + `Try again`. Other sections still render. A failed load never looks empty.                             |
| Offline                         | Cached content, with a muted line under the header: `Offline · showing what was saved {time}`. Relation buttons, Accept/Decline and search are disabled with the hint `Needs a connection`. |
| Feature switched off while open | The next query fails with `data.friendsUnavailable` → a full-screen `EmptyState`: `Following isn’t available right now.` + `Go back`.                                                       |

## 6. Search (name only)

Typing in the home `SearchField` swaps the list body for results. Clearing the field restores the sections, with the
scroll position preserved.

| Query state                    | Body                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 character                    | Muted helper `Keep typing…`. No request.                                                                                                                                |
| ≥ 2 chars, debouncing (250 ms) | The previous results stay, dimmed to 60% (`duration.fast`), or 3 skeleton rows on the first search.                                                                     |
| Results                        | `PersonRow` + `RelationButton sm`. The secondary line is `Follows you`, `Followed by {name}` (someone I follow follows them), or nothing. 20 per page, infinite scroll. |
| No results                     | `EmptyState` `No one found for “{query}”` / `They may not have turned on Following yet.` / `Invite someone`.                                                            |
| Rate limited                   | Inline `Too many searches. Try again in a minute.`                                                                                                                      |
| Error                          | Compact `ErrorState` `Couldn’t search right now.` + `Try again`.                                                                                                        |
| Offline                        | Field disabled, placeholder `Search needs a connection`.                                                                                                                |

- Placeholder `Search by name`; `accessibilityLabel="Search people by name"`. There is no email hint and no email
  matching (PRD Q-F-5).
- `returnKeyType="search"` submits immediately. Results dismiss the keyboard on drag. After each settled search,
  announce `{n} people found`.

## 7. Requests and Activity

### 7.1 Requests (`/friends/requests`)

All incoming requests as `RequestRow`s, newest first, with infinite scroll. The subtitle is `Only you can see this
list.` Empty: `No requests` / `When someone asks to follow you, it shows up here.` After the last one is answered,
the empty state fades in (MO-03).

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
│      · 3 days                         │
│ Activity is kept for 90 days.         │
└───────────────────────────────────────┘
```

- Sections `New` (unread when the screen opened) and `Earlier`. Opening the screen calls `friends.markActivityRead({
upTo })`. The badges clear when that succeeds.
- Each row is one sentence with the name in semibold, then the relative time (`2h`, `Yesterday`, `3 days`, then
  `{d MMM}`). The row taps through to the actor's profile.
  - Pending `FOLLOW_REQUEST` → `Accept` / `Decline`. Once answered, the row reads `You accepted` / `You declined`
    (muted).
  - `NEW_FOLLOWER` → `RelationButton sm`.
  - `REQUEST_ACCEPTED` → no button.
- Items for a request that was cancelled, or for a person since blocked, are withdrawn by the server and don't
  appear.
- Empty: `Nothing yet` / `Follow requests and new followers show up here.`
- **This screen plus the badges is the whole notification mechanism** (no push, PRD Q-F-14).

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

- Header: `ProfileHeader`. The avatar is `lg`. The name is `text-2xl font-bold` and wraps. `Follows you` is a `Badge
variant="secondary"`. The counts are plain text. The relation button is `md`.
- Overflow `…` (44 pt, label `More options for {name}`):
  - `Report and block {first}` → `ReportSheet` (§11.4);
  - `Block {first}` → the Block confirm (§11.4);
  - `Remove follower`, only when they follow me.

  On your own profile there's no overflow, and the button is `Edit sharing`.

- **Food | Gym** is a `SegmentedControl` (`size="xs"`, `w-36`, centred, testIDs `profile-mode-food` /
  `profile-mode-gym`), initialised from the viewer's app mode (`getMode()`). It is local state only: it never calls
  `setMode` and never navigates. The content crossfades (`duration.fast`).
- The header scrolls away. The switch becomes sticky under the nav bar (MO-12 hairline). The nav bar title shows
  `{name}` once the header is gone.

### 8.2 States

| State                                     | Treatment                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                                   | Header skeleton, switch skeleton, tab skeleton.                                                                                                                                                                                                                                                   |
| Non-follower, private                     | Header only (PRD Q-F-4), then `LockedPanel` (`lock-closed-outline`): `This profile is private` / `Follow {first} to see their meals and workouts.` After requesting: `Request sent` / `You’ll see their meals and workouts once {first} accepts.` The switch stays, and both tabs show the panel. |
| Non-follower, public                      | Header only, then `LockedPanel` (`people-outline`): `Follow {first} to see their meals and workouts.`                                                                                                                                                                                             |
| Section not shared                        | That tab: `{first} isn’t sharing their meal plan` / `…their recipes` / `…their workouts`.                                                                                                                                                                                                         |
| Not available (blocked / off / not found) | A full-screen `EmptyState` `person-outline`: `Profile not available` / `This profile doesn’t exist or isn’t available to you.` / `Go back`. No hint as to why.                                                                                                                                    |
| Error                                     | `ErrorState` `Couldn’t load this profile.` / `Try again`.                                                                                                                                                                                                                                         |
| Offline                                   | The last loaded data with the offline line. The relation button is disabled.                                                                                                                                                                                                                      |
| Relation changes while viewing            | Unfollow → the content fades out and the locked panel fades in (`duration.base`). Follow on a public profile → the content loads in place (MO-03).                                                                                                                                                |

### 8.3 Own profile preview

Reached from `See what followers see` in `Sharing & privacy`. It is the same screen with:

- a banner `This is what your followers see.` (`Badge info`);
- `Edit sharing` as the button;
- the `Private`/`Public` badge;
- `Hidden from followers` in place of unshared sections;
- for a forced-private account, the banner `Your profile is private because several people reported it.`

## 9. Food tab

### 9.1 Sub-switch

`SegmentedControl size="sm"`: `This week` · `Recipes {n}` (`n` omitted when 0). Each pane keeps its scroll position.

### 9.2 This week

```
 Week of 28 Sep                    avg 2,150 kcal/day
 [Mon][Tue][Wed][Thu][Fri][Sat][Sun]    (today ringed)
 BREAKFAST
 ┌─(photo)─ Greek yogurt bowl ───────────┐
 │ 1 portion                              │
 │ 420 kcal · P 28 g · C 45 g · F 12 g    │
 └────────────────────────────────────────┘
 DINNER
 ┌─(placeholder)─ Hidden recipe ─────────┐
 │ 1 portion                              │
 │ 610 kcal · P 40 g · C 55 g · F 22 g    │
 └────────────────────────────────────────┘
 Day total  2,080 kcal
 P 142 g · C 210 g · F 70 g
 (only if shared) Target 2,200 kcal · P 150 g
```

- Header: `Week of {d MMM}` (the owner's Monday) and `avg {kcal} kcal/day` (hidden when no day has meals).
- Day chips: the `PlanDayChips` visual (7 chips, `DENSE_MAX_FONT_SCALE`). Today (owner's time zone) is ringed. Empty
  days are dimmed but selectable. The owner's today is selected by default.
- Meal cards use `MealCardView` read-only: photo (MO-13), meal-type eyebrow, name, portion, macro line, and
  `Leftovers from {day}` when present. Tapping opens `/recipe/[id]?owner={userId}`.
- **Hidden recipe** (auto-hidden by moderation, `recipe.hidden: true`): a neutral placeholder image, the name `Hidden
recipe`, the numbers kept. It isn't pressable; its label is `Hidden recipe, {kcal} kcal`.
- Day totals: the `PlanDayTotals` visual without target comparison or the protein-gap line. Shared targets add one
  muted line, with no colours and no over/under wording.
- Empty day: `Nothing planned for {Tuesday}.` No plan: `EmptyState` `calendar-outline`, `{first} hasn’t planned this
week yet.`

### 9.3 Recipes

- A two-column grid (one column at font scale ≥ 1.4). Each card:
  - photo 4:3 with a placeholder;
  - name (2 lines);
  - `{kcal} kcal · {min} min` per serving;
  - for imported recipes, a muted `text-xs` `{domain}` line (e.g. `bbcgoodfood.com`);
  - a heart top-right (44 pt hit area, labels `Save {recipe}` / `Remove {recipe} from saved`, `selected` state).
- Heart: optimistic, MO-14 heart pop + `haptics.success`. Snackbar `Saved to your cookbook` / `Removed from saved`
  with `Undo`.
- 20 per page. Search (`Search {first}’s recipes`) appears above 12 recipes and is server-side.
- Auto-hidden recipes never appear here.
- Empty: `{first} hasn’t shared any recipes yet.`

### 9.4 Recipe detail for another person's recipe (existing `app/recipe/[id].tsx`, additive)

When `recipe.creator` is present and isn't me:

- Under the title: `By {name}` with a small avatar, pressable → their profile (label `By {name}. Open profile`).
- When `sourceUrl` is set: `SourceLink` `Source: {domain}` (opens in the browser).
- The actions row: `Add to my week` (primary), `Cook`, heart.
- The overflow gains `Report recipe` (→ `ReportSheet` with `recipeId`). Edit is never offered.
- The viewer's own safety block (`AllergenWarningBanner`, `CheckedForLine`) is unchanged: it answers "can **I** eat
  this".

Other cases:

- AI/curated recipes reached from someone's week: no `By` line. `Add to my week` is offered (no copy is needed).
- **My copies** (`origin` present): `From {first}` (or `From another Chefer cook` when the original is gone) under the
  title, plus the `SourceLink` if the copy has a `sourceUrl`. They are fully editable.
- **My own recipe that was auto-hidden:** an info banner `Hidden from people who follow you` / `Several people
reported this recipe, so it’s no longer shown to others.` (or, for `hiddenReason: FILTER`, `Some words in its name
or description aren’t allowed on shared recipes. Edit it to share it again.`). There is no appeal action.
- **Cookbook** (`app/(food)/recipes.tsx`): Saved cards of other people's recipes show a `From {first}` chip. Mine
  cards of copies show the same chip.
- **Recipe form** (`app/recipe-form.tsx`): a server rejection with `data.textRejected: 'recipe'` shows under the
  name field: `Some words in this recipe’s name or description aren’t allowed on shared recipes. Change them, or turn
off recipe sharing.` The same message covers imports (the import review form).

### 9.5 Add to my week sheet

```
Sheet title: Add to your week
Eyebrow:     Lentil dal · 480 kcal
[ This week | Next week ]     (Next week only from Thursday on)
 Mon 28  Tue 29  Wed 30 …     (past days disabled)
 BREAKFAST  (empty)           → "Add here"
 LUNCH      Chicken wrap      → "Replace"
 DINNER     Salmon & rice     → "Replace"
Footer: [ Add to Tue lunch ]  (disabled until a slot is chosen)
```

- Data: the viewer's own `mealPlan.getForWeek({ weekOffset })` and `mealPlan.getShape`.
- A filled slot: close the sheet, then (`onExited`) `ConfirmSheet` `Replace {meal}?` / `{recipe} goes on {Tue}
{lunch} instead.` / `Replace`. An empty slot adds directly.
- Mutation: `friends.addRecipeToWeek({ recipeId, weekOffset, dayOfWeek, mealType, mode, slotIndex?,
acknowledgeConflict? })`. Then invalidate `mealPlan.getForWeek`, `recipe.list` and `dashboard.summary`.
- Conflict with the viewer's safety table (`data.unsafeForTable`): the sheet stays open with the conflict line from
  `RecipePickerSheet` and a `Use anyway` secondary button.
- No plan for that week: `You don’t have a plan for this week yet.` / `Make a plan` → the sheet closes, then the Plan
  tab.
- Success: snackbar `Added to {Tue} {lunch}` + `Undo` (`friends.undoAddToWeek` with the result), and
  `haptics.success`.

## 10. Gym tab

```
 ROUTINE
 ┌ Upper / Lower 4× ──────────────────────┐
 │ Upper A · Mon                           │
 │  Bench press            3 × 6–8 · 2:30  │
 │  … (+3 more)                    Show all│
 └─────────────────────────────────────────┘
 LAST 7 DAYS
 ┌ Upper A · Tue 29 Sep · 58 min ─────────┐
 │ 6 exercises                             │
 │ Bench press    80 kg × 8                │
 │                              Show sets ▾│
 └─────────────────────────────────────────┘
 ┌ Lower A · Sun 27 Sep · 64 min ─────────┐
 └─────────────────────────────────────────┘
```

- **Routine** (`FriendRoutineCard`):
  - The routine name, then for each day `{day name} · {weekday}`.
  - Exercises show `{sets} × {repMin}–{repMax}` and rest `m:ss`; the a11y label reads `3 sets of 8–12 reps`.
  - More than 4 exercises → `Show all` (MO-05). Supersets are bracketed as in the owner's routine screen.
  - Curated exercises open `/gym/exercise/[id]`; custom ones read `{name} (custom)`.
  - Empty: `{first} doesn’t have a routine yet.`
- **Last 7 days** (`FriendWorkoutCard`, PRD FD-15): every completed workout from the owner's today − 6 days to today,
  newest first, **all in one list, with no Load more**.
  - Card meta: `{Ddd d MMM} · {n} min`, then `{n} exercises`.
  - The top set per exercise is in the **viewer's** units (the viewer's gym unit, falling back to food units).
  - `Show sets ▾` expands (MO-05) every completed working set.
  - Cardio: `{duration} · {distance}`.
  - Empty: `No workouts in the last 7 days.`
- Nothing reads or writes the gym offline store (`useGymBootstrap`, `query-persistence`).

## 11. Sharing & privacy, safety and moderation

### 11.1 Sharing & privacy (`/friends/settings`)

```
 WHO CAN FOLLOW YOU
 ◉ Private — you approve each follower
 ○ Public — anyone on Chefer can follow you
   (forced private) Your profile is private because several people
   reported it. It can’t be made public.
 WHAT FOLLOWERS CAN SEE
 This week’s meal plan                 [on ]
 Recipes you’ve written or imported    [on ]
 Your routine and workouts             [on ]
 Your daily targets                    [off]
   Calorie and macro targets, next to your meal plan.
 See what followers see ›
 SAFETY
 Blocked people (2) ›
 ─────────────
 Turn off Following        (destructive text button)
```

- Switches save on change (optimistic, MO-08). On error they roll back with `Couldn’t save. Try again.`
- `Your daily targets` on → `ConfirmSheet` `Share your daily targets?` / `Followers will see your daily calorie and
macro targets next to your meal plan.` / `Share targets`.
- Turning `Recipes you’ve written or imported` on can return `filterHiddenRecipes`. Then show the §4.1 snackbar.
- Forced private (`settings.forcedPrivate`): the radio group is disabled and shows the note above.
- There is no Notifications section (no push).

### 11.2 Visibility confirms

| Change           | Sheet                                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Private → Public | `Make your profile public?` / `Anyone on Chefer will be able to follow you without asking, and then see what you share: {sections}.` (+ `Your {n} pending requests will be accepted.`) / `Make public`                                           |
| Public → Private | `Make your profile private?` / `New followers will need your approval. Your {n} current followers can still see what you share. You can remove any of them.` / `Make private`, plus the link `Review followers` (closes; `onExited` → Followers) |

### 11.3 Profile › Privacy & data row

`Profile visibility` with the value `Private` / `Public` / `Off` → `/friends/settings` (activated) or `/friends`
(intro).

### 11.4 Block, report and block, remove follower

| Action               | Surface                                                                | Sheet                                                                                                                                                                                                                                                                                        | After                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Remove follower      | Followers row `…`, profile `…`                                         | ConfirmSheet `Remove {first} as a follower?` / `They won’t be told. They can follow you again, or ask to if your profile is private.` / `Remove`                                                                                                                                             | The row exits (MO-04). Snackbar `{first} removed`.                                                                                                                             |
| Block                | Profile `…`, Followers row `…`                                         | ConfirmSheet `Block {first}?` / `They won’t be able to find you or see your profile, and you won’t see theirs or their recipes. Any follows between you are removed. They won’t be told.` / `Block` (destructive)                                                                            | Back out of the profile. Snackbar `{first} blocked`.                                                                                                                           |
| **Report and block** | Profile `…` (`Report and block {first}`), recipe `…` (`Report recipe`) | **`ReportSheet`**: title `Report {first}` / `Report this recipe`; body `Tap a reason. We’ll block {first} straight away, so you won’t see them or their recipes again.`; five full-width reason buttons (§12). **One tap on a reason submits.** No note, no second confirm. `Cancel` closes. | The sheet closes, then snackbar `Reported and blocked. You won’t see {first} or their recipes again.` and `haptics.success`. Navigate back to the previous non-profile screen. |
| Unblock              | Blocked people row                                                     | ConfirmSheet `Unblock {first}?` / `They’ll be able to find you again. Follows aren’t restored.` / `Unblock`                                                                                                                                                                                  | The row exits.                                                                                                                                                                 |

- The reason buttons are `Button variant="outline"`, `min-h-12`, left-aligned, with `accessibilityHint="Reports and
blocks {name}"`.
- While the report is sending, the buttons are disabled with a spinner in the tapped one.
- On error, the sheet stays open with `Couldn’t send. Try again.`. Nothing is blocked until the server confirms.
- There is nothing to show the reporter afterwards. Reported users are never told. Automatic hiding (PRD §9.3) has
  no UI for anyone except the content owner (§8.3, §9.4).

### 11.5 Turn off Following

`ConfirmSheet` `Turn off Following?`:

`This removes you from Following straight away:`
`• People can’t find or follow you`
`• You stop following everyone, and everyone stops following you`
`• Your recipes disappear from other people’s saved lists (copies they already added to their weeks stay theirs)`
`• Your requests and Activity are deleted`
`You can turn Following on again later, starting fresh.`

The button is `Turn off Following` (destructive). Afterwards → More, with snackbar `Following is off.`

### 11.6 Blocked people

`PersonRow` (not pressable) + `Unblock` outline button. Empty: `You haven’t blocked anyone.`

## 12. Copy deck

Put these in `packages/types/src/friends-copy.ts` (`FRIENDS_COPY`), with functions for variables. The file name and
constant keep the code name. The strings say Following.

| Key                                                                              | String                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nav.label`                                                                      | `Following`                                                                                                                                                                                                            |
| `intro.title` / `.body`                                                          | `Follow people you cook and train with` / `See their week of meals, save their recipes and see their workouts.`                                                                                                        |
| `intro.nameHeading` / `.firstName` / `.lastName`                                 | `How others will see you` / `First name` / `Last name`                                                                                                                                                                 |
| `intro.firstNameError` / `.lastNameError`                                        | `Add your first name` / `Add your last name`                                                                                                                                                                           |
| `intro.nameRejected`                                                             | `Please choose a different name. Some words aren’t allowed on Chefer profiles.`                                                                                                                                        |
| `intro.whoHeading`                                                               | `Who can follow you`                                                                                                                                                                                                   |
| `visibility.private` / `.public`                                                 | `Private — you approve each follower` / `Public — anyone on Chefer can follow you`                                                                                                                                     |
| `intro.whatHeading`                                                              | `What followers see`                                                                                                                                                                                                   |
| `intro.what.plan` / `.recipes` / `.workouts`                                     | `This week’s meals, with calories and macros` / `Recipes you’ve written or imported` / `Your routine and last 7 days of workouts`                                                                                      |
| `intro.what.change`                                                              | `You can change these any time.`                                                                                                                                                                                       |
| `intro.neverHeading` / `.never`                                                  | `Never shared` / `Your email, allergies and diets, body measurements and weight, targets, what you’ve logged, your household.`                                                                                         |
| `intro.findable`                                                                 | `People who search your name can find you. Content that several people report is hidden automatically.`                                                                                                                |
| `intro.policy` / `.cta` / `.notNow`                                              | `Privacy Policy` / `Turn on Following` / `Not now`                                                                                                                                                                     |
| `intro.error`                                                                    | `Couldn’t turn on Following. Nothing has been changed.`                                                                                                                                                                |
| `activated.private` / `.public`                                                  | `Following is on. Only people you approve can see your meals and workouts.` / `Following is on. People who follow you can see what you share.`                                                                         |
| `activated.filterHidden`                                                         | `{n} of your recipes won’t be shown to followers because of words in their name or description.` (`1 of your recipes` → `One of your recipes`)                                                                         |
| `home.title`                                                                     | `Following`                                                                                                                                                                                                            |
| `home.searchPlaceholder` / `.searchLabel`                                        | `Search by name` / `Search people by name`                                                                                                                                                                             |
| `home.requests` / `.seeAllRequests`                                              | `Requests · {n}` / `See all {n}`                                                                                                                                                                                       |
| `home.youFollow` / `.followers`                                                  | `You follow {n}` / `Followers {n}`                                                                                                                                                                                     |
| `home.suggested` / `.seeAll`                                                     | `Suggested for you` / `See all`                                                                                                                                                                                        |
| `home.activityLabel` / `.settingsLabel`                                          | `Activity, {n} new` (0 → `Activity`) / `Sharing and privacy`                                                                                                                                                           |
| `empty.youFollow.title` / `.body`                                                | `Find people you know` / `Search by name, or follow someone below.`                                                                                                                                                    |
| `empty.followers.title` / `.body`                                                | `No followers yet` / `Share Chefer with people you know so they can find you.`                                                                                                                                         |
| `invite.cta` / `.card.title` / `.card.body`                                      | `Invite someone` / `Chefer is better together` / `Invite someone you cook or train with.`                                                                                                                              |
| `invite.message`                                                                 | `I’m using Chefer to plan meals and workouts. Follow me in Chefer: {myName}. {appLink}`                                                                                                                                |
| `reason.mutualOne` / `.mutualMany`                                               | `Followed by {name}` / `Followed by {name} and {n} others` (`and 1 other`)                                                                                                                                             |
| `reason.followsYou` / `.popular`                                                 | `Follows you` / `Popular on Chefer`                                                                                                                                                                                    |
| `requestRow.accept` / `.decline`                                                 | `Accept` / `Decline`                                                                                                                                                                                                   |
| `accepted.snackbar`                                                              | `{first} can now see your meals and workouts.` action `Follow back`                                                                                                                                                    |
| `relation.follow` / `.followBack` / `.requested` / `.following` / `.editSharing` | `Follow` / `Follow back` / `Requested` / `Following` / `Edit sharing`                                                                                                                                                  |
| `confirm.unfollow.title` / `.bodyPrivate` / `.cta`                               | `Unfollow {first}?` / `You’ll need to ask again to see their meals and workouts.` / `Unfollow`                                                                                                                         |
| `confirm.cancelRequest.title` / `.cta` / `.keep`                                 | `Cancel your request?` / `Cancel request` / `Keep request`                                                                                                                                                             |
| `relation.error`                                                                 | `Couldn’t update. Try again.` action `Retry`                                                                                                                                                                           |
| `search.keepTyping`                                                              | `Keep typing…`                                                                                                                                                                                                         |
| `search.noResults.title` / `.body`                                               | `No one found for “{query}”` / `They may not have turned on Following yet.`                                                                                                                                            |
| `search.rateLimited` / `.error` / `.offline`                                     | `Too many searches. Try again in a minute.` / `Couldn’t search right now.` / `Search needs a connection`                                                                                                               |
| `search.announce`                                                                | `{n} people found` (`1 person found`, `No one found`)                                                                                                                                                                  |
| `requests.title` / `.subtitle`                                                   | `Follow requests` / `Only you can see this list.`                                                                                                                                                                      |
| `requests.empty.title` / `.body`                                                 | `No requests` / `When someone asks to follow you, it shows up here.`                                                                                                                                                   |
| `activity.title` / `.new` / `.earlier`                                           | `Activity` / `New` / `Earlier`                                                                                                                                                                                         |
| `activity.request` / `.newFollower` / `.accepted`                                | `{name} wants to follow you` / `{name} started following you` / `{name} accepted your request`                                                                                                                         |
| `activity.youAccepted` / `.youDeclined`                                          | `You accepted` / `You declined`                                                                                                                                                                                        |
| `activity.empty.title` / `.body`                                                 | `Nothing yet` / `Follow requests and new followers show up here.`                                                                                                                                                      |
| `activity.retention`                                                             | `Activity is kept for 90 days.`                                                                                                                                                                                        |
| `profile.counts` / `.followsYou` / `.moreOptions`                                | `{n} followers · {m} following` (`1 follower`) / `Follows you` / `More options for {name}`                                                                                                                             |
| `profile.food` / `.gym`                                                          | `Food` / `Gym`                                                                                                                                                                                                         |
| `locked.private.title` / `.body`                                                 | `This profile is private` / `Follow {first} to see their meals and workouts.`                                                                                                                                          |
| `locked.requested.title` / `.body`                                               | `Request sent` / `You’ll see their meals and workouts once {first} accepts.`                                                                                                                                           |
| `locked.public.body`                                                             | `Follow {first} to see their meals and workouts.`                                                                                                                                                                      |
| `notShared.plan` / `.recipes` / `.workouts`                                      | `{first} isn’t sharing their meal plan` / `{first} isn’t sharing their recipes` / `{first} isn’t sharing their workouts`                                                                                               |
| `preview.banner` / `.hidden` / `.forcedPrivate`                                  | `This is what your followers see.` / `Hidden from followers` / `Your profile is private because several people reported it.`                                                                                           |
| `notAvailable.title` / `.body` / `.cta`                                          | `Profile not available` / `This profile doesn’t exist or isn’t available to you.` / `Go back`                                                                                                                          |
| `profile.error`                                                                  | `Couldn’t load this profile.`                                                                                                                                                                                          |
| `food.thisWeek` / `.recipes`                                                     | `This week` / `Recipes {n}`                                                                                                                                                                                            |
| `food.weekOf` / `.avg`                                                           | `Week of {d MMM}` / `avg {kcal} kcal/day`                                                                                                                                                                              |
| `food.portion` / `.macros`                                                       | `{n} portion` · `{n} portions` / `{kcal} kcal · P {p} g · C {c} g · F {f} g`                                                                                                                                           |
| `food.dayTotal` / `.target`                                                      | `Day total {kcal} kcal` / `Target {kcal} kcal · P {p} g`                                                                                                                                                               |
| `food.hiddenRecipe`                                                              | `Hidden recipe`                                                                                                                                                                                                        |
| `food.emptyDay` / `.noPlan`                                                      | `Nothing planned for {weekday}.` / `{first} hasn’t planned this week yet.`                                                                                                                                             |
| `recipes.search` / `.empty`                                                      | `Search {first}’s recipes` / `{first} hasn’t shared any recipes yet.`                                                                                                                                                  |
| `recipes.save` / `.unsave` (a11y)                                                | `Save {recipe}` / `Remove {recipe} from saved`                                                                                                                                                                         |
| `recipes.saved` / `.removed`                                                     | `Saved to your cookbook` / `Removed from saved` (action `Undo`)                                                                                                                                                        |
| `recipe.by` / `.from` / `.fromGone`                                              | `By {name}` / `From {first}` / `From another Chefer cook`                                                                                                                                                              |
| `recipe.source` / `.sourceLabel`                                                 | `Source: {domain}` / `Open the original recipe on {domain}`                                                                                                                                                            |
| `recipe.addToWeek` / `.report`                                                   | `Add to my week` / `Report recipe`                                                                                                                                                                                     |
| `recipe.hidden.title` / `.reports` / `.filter`                                   | `Hidden from people who follow you` / `Several people reported this recipe, so it’s no longer shown to others.` / `Some words in its name or description aren’t allowed on shared recipes. Edit it to share it again.` |
| `recipe.textRejected`                                                            | `Some words in this recipe’s name or description aren’t allowed on shared recipes. Change them, or turn off recipe sharing.`                                                                                           |
| `addToWeek.title` / `.thisWeek` / `.nextWeek`                                    | `Add to your week` / `This week` / `Next week`                                                                                                                                                                         |
| `addToWeek.addHere` / `.replace` / `.cta`                                        | `Add here` / `Replace` / `Add to {Tue} {lunch}`                                                                                                                                                                        |
| `addToWeek.noPlan` / `.makePlan`                                                 | `You don’t have a plan for this week yet.` / `Make a plan`                                                                                                                                                             |
| `addToWeek.replaceTitle` / `.replaceBody`                                        | `Replace {meal}?` / `{recipe} goes on {Tue} {lunch} instead.`                                                                                                                                                          |
| `addToWeek.done`                                                                 | `Added to {Tue} {lunch}` (action `Undo`)                                                                                                                                                                               |
| `gym.routine` / `.lastSevenDays`                                                 | `Routine` / `Last 7 days`                                                                                                                                                                                              |
| `gym.showAll` / `.showSets` / `.hideSets` / `.custom`                            | `Show all` / `Show sets` / `Hide sets` / `(custom)`                                                                                                                                                                    |
| `gym.exercises`                                                                  | `{n} exercises` (`1 exercise`)                                                                                                                                                                                         |
| `gym.noRoutine` / `.noWorkouts`                                                  | `{first} doesn’t have a routine yet.` / `No workouts in the last 7 days.`                                                                                                                                              |
| `settings.title`                                                                 | `Sharing & privacy`                                                                                                                                                                                                    |
| `settings.who` / `.what` / `.safety`                                             | `Who can follow you` / `What followers can see` / `Safety`                                                                                                                                                             |
| `settings.plan` / `.recipes` / `.workouts` / `.targets`                          | `This week’s meal plan` / `Recipes you’ve written or imported` / `Your routine and workouts` / `Your daily targets`                                                                                                    |
| `settings.targetsDetail`                                                         | `Calorie and macro targets, next to your meal plan.`                                                                                                                                                                   |
| `settings.preview` / `.blocked` / `.turnOff`                                     | `See what followers see` / `Blocked people ({n})` / `Turn off Following`                                                                                                                                               |
| `settings.forcedPrivate`                                                         | `Your profile is private because several people reported it. It can’t be made public.`                                                                                                                                 |
| `settings.saveError`                                                             | `Couldn’t save. Try again.`                                                                                                                                                                                            |
| `targets.confirm.title` / `.body` / `.cta`                                       | `Share your daily targets?` / `Followers will see your daily calorie and macro targets next to your meal plan.` / `Share targets`                                                                                      |
| `public.confirm.*` / `private.confirm.*`                                         | §11.2                                                                                                                                                                                                                  |
| `privacyRow.label` / values                                                      | `Profile visibility` / `Private` · `Public` · `Off`                                                                                                                                                                    |
| `remove.*` / `block.*` / `unblock.*`                                             | §11.4                                                                                                                                                                                                                  |
| `report.titleUser` / `.titleRecipe` / `.body`                                    | `Report {first}` / `Report this recipe` / `Tap a reason. We’ll block {first} straight away, so you won’t see them or their recipes again.`                                                                             |
| `report.reasons`                                                                 | `Offensive name or recipe` · `Spam or fake account` · `Harassment` · `Unsafe or harmful content` · `Something else`                                                                                                    |
| `report.profileAction`                                                           | `Report and block {first}`                                                                                                                                                                                             |
| `report.done` / `.error`                                                         | `Reported and blocked. You won’t see {first} or their recipes again.` / `Couldn’t send. Try again.`                                                                                                                    |
| `blocked.empty`                                                                  | `You haven’t blocked anyone.`                                                                                                                                                                                          |
| `turnOff.*`                                                                      | §11.5; done `Following is off.`                                                                                                                                                                                        |
| `offline.line` / `.needsConnection`                                              | `Offline · showing what was saved {time}` / `Needs a connection`                                                                                                                                                       |
| `unavailable`                                                                    | `Following isn’t available right now.`                                                                                                                                                                                 |

## 13. Accessibility

- **Targets** ≥ 44 × 44 pt (`min-h-11`, `h-11 w-11` icon buttons, `hitSlop` for the heart, the `×` and the source
  link).
- **Text** never below `text-xs` (12 px). Day chips use `DENSE_MAX_FONT_SCALE`. Everything else scales to 1.8× and
  wraps. At ≥ 1.6×, `PersonRow` stacks the button under the name.
- **Rows:** `PersonRow` is one element labelled `{name}, {secondary line}` with the hint `Opens profile`. Request
  buttons include the name (`Accept Andrei Ionescu`). Report reason buttons carry `Reports and blocks {name}`.
- **State:** `RelationButton` announces state and action (§3.3). Switches use `accessibilityRole="switch"`. Segmented
  controls use `tab` with a selected state. The heart uses `selected`. A hidden recipe card is labelled `Hidden
recipe` and isn't a button.
- **Announcements:** search counts; `Request from {name} accepted`; `Now following {name}` / `Request sent to {name}`;
  `Reported and blocked`.
- **Focus:** after a sheet closes, VoiceOver focus returns to its trigger (`AccessibilityInfo.setAccessibilityFocus`).
  After a row is removed, focus moves to the next row or the section heading.
- **Colour:** never meaning by colour alone.
- **Reduced motion:** every MO pattern degrades to a fade or nothing (`useReducedMotion()`).

## 14. Motion

Tokens only (`duration.*`, `spring.*`, `easing.*`). Animate transform and opacity only.

| Moment                                             | Pattern | Spec                                                                                   |
| -------------------------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| Row / card press                                   | MO-01   | `PressableScale` (`pressScale="card"`)                                                 |
| Sheets (confirm, report, add-to-week)              | MO-02   | Kit `Sheet`: enter `duration.slow` + `spring.gentle`, exit `exit(duration.slow)`       |
| Skeleton → content                                 | MO-03   | Crossfade `duration.base`, 30 ms stagger, max 6                                        |
| Accept / decline / remove / dismiss / unblock rows | MO-04   | Fade + 8 pt slide, `duration.base` `easing.exit`; the rest settle with `spring.gentle` |
| `Show sets`, `Show all`                            | MO-05   | Reanimated layout transition, content reveal                                           |
| Relation button, switches (optimistic)             | MO-08   | Instant flip + `haptics.selection`; rollback shake ±4 pt / 300 ms + `haptics.error`    |
| Food/Gym and sub-switch thumbs; heart              | MO-14   | Thumb `spring.snappy`; heart pop `spring.bouncy` 1→1.2→1 + `haptics.success`           |
| Profile header → sticky switch                     | MO-12   | Hairline + e1 fade in (`duration.fast`)                                                |
| Photos                                             | MO-13   | Fade-in `duration.base`; the placeholder stays on error                                |

## 15. Web phase (later)

Out of this program (PRD Q-F-2). When web is built, it needs:

- **Navigation:**
  - `Following` directly after `Profile` in `FOOD_NAV_ITEMS`, and in `GYM_SECONDARY_NAV_ITEMS`, in
    `apps/web/src/features/nav/nav-items.ts`, plus the `UserMenu`;
  - `/friends*` treated as mode-neutral in `modeOfPath`;
  - routes in `middleware.ts` (`PROTECTED_ROUTES` + `config.matcher`), `TITLE_MAP` and `APP_ROUTES`;
  - `nav-items.test.ts` and `tests/e2e/mobile-nav.spec.ts` updated.
- **Pages** under `apps/web/src/app/(dashboard)/friends/**` mirroring §2.2, each with `layout.tsx` + `metadata.title`
  and one `<h1>`.
- **Kit** in `@chefer/ui`:
  - `Avatar`, `SearchInput`, `Skeleton`, `CountPill`;
  - `SegmentedControl` (a radiogroup, keyboard-operable, MO-14 thumb).

  Overlays use `Sheet`/`Drawer`, and menus use `useMenu()`.

- **Responsive rules** (mobile-first, no horizontal scroll, `dvh`, `min-w-0`):
  - base–`md`: a single column as on mobile;
  - `lg`: the home in two columns (`grid-cols-[minmax(0,1fr)_320px]`, suggestions on the right);
  - `lg`: the Gym tab has the routine left and the last 7 days right;
  - `xl`: the week as a 7-column grid (`xl:grid-cols-7`, `min-w-0` columns). The meal planner's `min-w-[900px]`
    scroller is not reused.
- **Notifications:** the same inbox and a nav badge, polled every 60 s while the tab is visible.
- **Tests:** a Playwright mobile sweep at 320/375/390/430 and touch targets.
- The copy deck (§12) is shared as-is.

## 16. Design acceptance checklist (iOS and Android)

1. More shows `Following` directly under `Profile`. The More tab badge, Settings hub row and privacy row exist.
   Badges show pending + unread, capped at `9+`.
2. No user-visible string says "Friends". Every string matches §12.
3. A never-activated user sees the intro, can't be found by name from a second account, and `Not now` stores
   nothing.
4. `RelationButton` agrees across search, lists, suggestions, Activity and profile after any change, with no reload.
5. Non-followers see only the header and the locked panel, for public and private profiles alike.
6. Locked, not-shared, not-available, empty, loading, error and offline states render as specified.
7. The profile's Food|Gym switch never changes the app mode.
8. The week shows meals, portions, kcal/P/C/F per meal and day, the week average, and `Hidden recipe` placeholders.
   It shows no targets unless shared, no safety chips and no costs.
9. Imported recipes show their domain on cards and `Source: {domain}` on the detail. The link opens the browser.
10. Add to my week: empty slot, filled slot (chained confirm), safety conflict (`Use anyway`), Undo.
11. Gym: routine read-only. Every workout of the last 7 days appears in one list with no Load more, in the viewer's
    units.
12. Report is one tap on a reason, blocks immediately, and never asks for text. Block, remove, unblock and turn off
    work with the specified copy. No sheet opens while another is closing.
13. Word-filter rejections show the friendly messages on the intro and the recipe form. Auto-hidden recipes show the
    owner banner.
14. VoiceOver/TalkBack read everything as specified. All targets ≥ 44 pt, no text below 12 px, and 1.8× wraps.
15. Everything works on the installed 1.0.1 binary via OTA. No screen needs a native module the binary lacks.
