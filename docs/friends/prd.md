# Chefer Following: follow people, see their week, cook their recipes

**Product requirements document (PRD) · rev 2 · 2026-09-30**

| Field          | Value                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status         | **All owner decisions applied (2026-09-30), §5. No open questions.** Push is out of this program (Q-F-14; appendix A). The whole feature ships over the air.         |
| Author         | Product (PO/PM), written for the owner and for the implementing agents                                                                                               |
| Build read     | `master` @ `9dd93f3a` (API level 4 live, app version 1.0.1, OTA on runtime fingerprint)                                                                              |
| Companion docs | [`ux-design.md`](./ux-design.md) (screens, states, copy) · [`implementation-plan.md`](./implementation-plan.md) (schema, API, waves, agent tasks)                    |
| Governing docs | [`CLAUDE.md`](../../CLAUDE.md) (Platform Parity, architecture rules) · [`infrastructure.md`](../../infrastructure.md) · [`business_flow.md`](../../business_flow.md) |
| IDs            | Decisions `FD-n`, owner answers `Q-F-n`, user stories `FR-nn` with acceptance criteria `FR-nn.m`. IDs are stable. Rev 2 retired some; retired IDs are never reused.  |

**Naming convention (Q-F-3).** Everything a user reads says **Following**: the More entry, screen titles, buttons and
copy. Everything in code keeps the internal name **`friends`**: the feature flag `friends`, the tRPC router
`friends.*`, the database and service names, the folders `features/friends`, the route paths `/friends/...`, and the
analytics event prefixes `friends_`/`friend_`. These docs use "Following" for the product and "friends" only for code
identifiers. In prose, "a person you follow" or "the owner" replaces the old "friend".

---

## 0. The request (verbatim, from the owner's feedback)

> In the “More” section, there should be an entry just below “Profile” with “Friends”. We introduce this concept of
> “friends” or maybe followers/following, maybe that’s better. You can request to follow someone and they need to
> accept and they could follow you back (same as insta). You should get a push notification as well for this.
> Profiles can be either public or private (this should be a setting in your profile) and you can only follow public
> profiles. In this new section, you should be able to see the list of your friends and a list of suggested friends
> (based on existing connections, or highly followed profiles) there should be a searchbar as well for easier search.
> (search should work for both first name last name or email, in the same search bar). Here you should have the option
> of following/unfollowing. When clicking on any of your following profiles you should be directed to their profile.
> When viewing a profile there should be same way at the top the toggle between gym and food. On food toggle, you
> should be able to see their current week meal plan (calories, macros included) and also to be able to check their
> personal recipes and be able to favorite them and see them on your favorites list. You should be able to add this
> new favorited recipe to your week. On the gym page, you should be able to see their routine and also their last (n)
> workouts with possibility to load more.

The owner's answers of 2026-09-30 (§5.1) refine this. Where they differ from the request, the answers win: no email
search, no "load more", and the section is called Following.

## 1. Summary

Chefer becomes lightly social, **on mobile first**. People you know can follow you. They can see **this week's
meals** (with calories and macros), browse **your own recipes** (including ones you imported, with their source
shown), and see **your routine and your workouts from the last 7 days**. You can do the same for them, heart their
recipes into your Saved list, and put one on your week in two taps.

The model is **followers/following, as on Instagram**:

- A **public** profile can be followed at once.
- A **private** profile needs the owner to accept a request.
- **Private is the default.**
- Only followers see content. Anyone else sees just the profile header.
- No one is findable until they **turn on Following** themselves, with a clear consent step.
- Search is **by name only**.

Safety is **fully automatic**. There is no human review queue:

- Report is one tap and also blocks, so the reporter never sees that person or recipe again.
- A recipe reported by 3 different accounts is hidden for everyone.
- An account reported by 5 different accounts is forced private and removed from search.
- A bundled word list rejects offensive display names and shared-recipe text.

Notifications are an **in-app Activity inbox with a badge**. There is no push in this program (Q-F-14; appendix A
says what it would take). Nothing native changes, so **the whole feature ships over the air** (OTA JavaScript
updates on the current 1.0.1 runtime) with no new store build. **Web comes later**, in a separate phase (§16). The API
is platform-neutral from day one.

## 2. Problem and opportunity

- **Motivation is social.** Adherence to meal plans and training improves with accountability and inspiration.
  Chefer users already tell each other what they're cooking and lifting, outside the app, by screenshot.
- **Recipes are trapped.** A user's own recipes (`Recipe.source = MANUAL`, which includes imported ones) are strictly
  private today (`apps/api/src/application/recipe/recipe-access.ts` → `isRecipeOpenTo`).
- **Growth loop.** A follow graph gives Chefer its first organic acquisition loop ("follow me on Chefer") and a
  retention hook.
- **Risk.** Chefer holds health-related data. Showing any of it to other people is a new kind of processing. It must
  be opt-in, minimal, reversible and documented (§14). Opening user content to other users also brings App Store
  guideline 1.2 obligations. They are met by automatic moderation (§9), because the owner won't review reports by
  hand.

## 3. Goals and non-goals

### 3.1 Goals (v1, mobile)

| #   | Goal                                                                                                                                  | Measured by (§15)                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| G1  | Let a user find people they know **by name** and follow them (instantly if public, by request if private).                            | Search success rate; follows per activated user      |
| G2  | Let a user see a followed person's **current week** of meals, with calories and macros per meal and per day.                          | Profile views (Food tab)                             |
| G3  | Let a user browse a followed person's **own recipes**, heart them into Saved, and add one to their own week.                          | Hearts; add-to-week from another user's recipe       |
| G4  | Let a user see a followed person's **active routine** and **workouts from the last 7 days**.                                          | Profile views (Gym tab)                              |
| G5  | Tell users about follow requests, new followers and accepted requests, through an in-app inbox and badge (no push).                   | Request response time                                |
| G6  | Keep every user in control: private by default, per-section sharing switches, remove follower, block, report, leave.                  | Privacy-setting changes; block/report rate           |
| G7  | Stay compliant **without a human moderator**: explicit consent, updated policy and terms, automatic moderation meeting App Store 1.2. | Release checklist signed off; moderation log metrics |

### 3.2 Non-goals (explicitly out of scope)

- **Web** in this program. Web is a later phase (§16). The API stays platform-neutral.
- **Email search** of any kind (Q-F-5). Users are found by name only.
- **Email notifications** for this feature, ever (Q-F-9).
- **Push notifications** (Q-F-14): no Firebase, no APNs key, no `aps-environment` change, no native build. Appendix A
  describes what adding them later would take.
- **Any native change.** No new native module and no `app.config.js` change that would alter the runtime fingerprint:
  the feature ships entirely by OTA.
- **Human moderation**: no review queue, no admin reports page, no support-inbox triage (Q-F-13).
- **Feeds, likes, comments, direct messages, stories.** Messaging would add moderation and chat obligations.
- **Usernames/handles and public profile pages.** Profiles are only visible to signed-in Chefer users.
- **Contact-book import.** This adds the Contacts permission and a new App Privacy data type.
- **Profile photos.** Chefer has no avatar upload UI (`User.image` is only written by the unused
  `user.updateProfile`). Avatars are initials on a colour derived from the user id. If `User.image` is ever set,
  it's shown. Uploading is under Later, because it would add image moderation.
- **Sharing health data beyond the plan:** allergies, diets, dislikes, household members, body metrics, weight log,
  logged meals, calorie and macro **targets** (unless the owner opts in, FR-04.3), budget, shopping list, pantry, AI
  chat and coach reviews.
- **Other weeks** of someone's plan (Q-F-12), their "My weeks" templates, their stats or PRs.
- **Workout history older than 7 days**, and paging through it (Q-F-10).
- **Copying a whole week or routine.** Only single recipes cross over.

## 4. Personas

| Persona                         | Who                                                                      | What they need from Following                                                                                                     | Watch-outs                                                                          |
| ------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Andrei, the gym pair**        | 29, lifts 4× a week with a friend who also uses Chefer. Mostly Gym mode. | See his friend's routine and this week's sessions ("what did you bench Tuesday?"), follow each other in one tap each.             | Doesn't want to share food. Needs the per-section switches.                         |
| **Maria, the home cook**        | 34, plans dinners for a family, writes and imports recipes.              | Her sister and two friends want her recipes, including ones she imported from blogs, with the source shown.                       | Private person: approves every follower. Doesn't want her targets visible.          |
| **Elena, the popular creator**  | 27, personal trainer, shares a public plan and routine with clients.     | A **public** profile clients can follow instantly, and being suggested as "Popular on Chefer".                                    | Needs remove-follower and block. Abuse must be handled without anyone reviewing it. |
| **Priya, the privacy-cautious** | 41, tracks calories for a medical reason. Uses Chefer alone.             | **Nothing changes for her** unless she opts in. She must never appear in search or suggestions because a feature launched.        | Any leak of her plan or targets is a serious incident.                              |
| **Chris, the newcomer**         | 22, registered because a friend said "follow me on Chefer".              | Find the friend by name fast, follow, and see useful content on day one. Suggestions (incl. Chefer Kitchen) when he knows nobody. | Cold start.                                                                         |

## 5. Decisions

### 5.1 Owner decisions (2026-09-30)

| #      | Question                       | Owner answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Where it lands                        |
| ------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Q-F-1  | Follow model                   | **Instagram.** Public = follow instantly. Private = the owner accepts a request. **Private is the default.**                                                                                                                                                                                                                                                                                                                                                                                    | §6; FR-12                             |
| Q-F-2  | Platforms                      | **Mobile first, web later** (the gym precedent). Web is out of this program's waves. A `mobile_parity_backlog.md` reverse row ("mobile → web") is written when the feature ships. The API stays platform-neutral.                                                                                                                                                                                                                                                                               | §16; implementation plan §11, §12     |
| Q-F-3  | Name                           | The section is **"Following"**, not "Friends". Internal code names may stay `friends`.                                                                                                                                                                                                                                                                                                                                                                                                          | Naming convention (top); UX copy deck |
| Q-F-4  | Public profile content         | Public: no acceptance, and once you follow, you see the content. Private: acceptance first. **Non-followers see only the header** (name, avatar, counts, Follow button), public or private.                                                                                                                                                                                                                                                                                                     | §7; FR-14                             |
| Q-F-5  | Search                         | **No email search at all.** Name only (first and last name), prefix match, case- and accent-insensitive.                                                                                                                                                                                                                                                                                                                                                                                        | §10; FR-08                            |
| Q-F-6  | Hearting another user's recipe | As recommended. **Heart = live reference. Add to week = private copy.**                                                                                                                                                                                                                                                                                                                                                                                                                         | §13; FR-17                            |
| Q-F-7  | Imported recipes               | **Shareable** like any own recipe. They already sit under "Mine" (`source: MANUAL` with a `sourceUrl`). When a recipe has a `sourceUrl`, show the **source attribution** (domain, linking to the source) to followers.                                                                                                                                                                                                                                                                          | §7, §13; FR-16, FR-17                 |
| Q-F-8  | Cold start                     | **Yes**, seed a public "Chefer Kitchen" profile.                                                                                                                                                                                                                                                                                                                                                                                                                                                | §11; owner steps                      |
| Q-F-9  | Email notifications            | **Never**, for this feature.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | §3.2, §12                             |
| Q-F-10 | Workout history                | **Only the last week. No "Load more", no pagination.** Defined as the last 7 days (FD-15).                                                                                                                                                                                                                                                                                                                                                                                                      | FR-19                                 |
| Q-F-11 | Sharing daily targets          | As recommended. **Opt-in, off by default.**                                                                                                                                                                                                                                                                                                                                                                                                                                                     | FR-04.3                               |
| Q-F-12 | Which weeks of the meal plan   | **Current week only.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | §7.3; FR-15                           |
| Q-F-13 | Moderation                     | **Approved as proposed.** No manual review, no human queue. Fully automatic: instant mutual block; one-tap report that also blocks; reports from 3 distinct accounts hide a recipe for everyone; reports from 5 distinct accounts force the account private and drop it from search and suggestions; reports count only from accounts at least 24 h old with a verified email; a bundled word-list text filter; an append-only moderation log with a weekly metrics line; an optional ops undo. | §9; FR-13                             |
| Q-F-14 | Push notifications             | **Build without push.** Push is out of this program: no Firebase, no APNs key, no `aps-environment` change, no native build. The in-app Activity inbox plus a badge is the notification mechanism. The owner follows up on push separately.                                                                                                                                                                                                                                                     | FD-11, §12, appendix A                |

### 5.2 Decision record

| #     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Why                                                                                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FD-1  | **Follow model = Instagram** (Q-F-1). Public → **Follow** takes effect at once (the owner is told). Private → **Follow** sends a request the owner accepts or declines. Follows are one-way; following back is a separate follow.                                                                                                                                                                                                                                | Owner decision.                                                                                                                                                                                       |
| FD-2  | **Private by default.** Going public is a deliberate choice behind a confirmation that says exactly what changes.                                                                                                                                                                                                                                                                                                                                                | Health-related data (GDPR Art. 9); privacy by default (Art. 25); owner decision.                                                                                                                      |
| FD-3  | **Opt-in to exist socially.** No user is searchable, suggestible or followable until they open Following and **turn it on**. That creates a social profile and logs a `SOCIAL_SHARING` consent event. Existing users are unaffected by the launch.                                                                                                                                                                                                               | Users signed up for a private planner.                                                                                                                                                                |
| FD-4  | **Content is for followers only** (Q-F-4). Non-followers see the header only: name, avatar, counts, the Follow button, and the overflow with Report and block.                                                                                                                                                                                                                                                                                                   | Owner decision. Each disclosure goes to people the owner can see in their Followers list and remove.                                                                                                  |
| FD-5  | **User-facing name "Following"; code name `friends`** (Q-F-3). Inside the section the lists are `You follow` and `Followers`, and a person who follows you back shows a `Follows you` tag.                                                                                                                                                                                                                                                                       | Avoids a screen titled "Following" with a tab also called "Following".                                                                                                                                |
| FD-6  | **Search by name only** (Q-F-5): word-prefix match on first and last name, case- and accent-insensitive ("stefan" finds "Ștefan").                                                                                                                                                                                                                                                                                                                               | Owner decision. It also removes email-enumeration risk entirely.                                                                                                                                      |
| FD-7  | **Heart = live reference; add to week = your own copy** (Q-F-6). Details in §13.                                                                                                                                                                                                                                                                                                                                                                                 | Plans and food logs must be stable. A plan slot whose recipe row is gone throws `INTERNAL_SERVER_ERROR` in `MealPlanService.assemblePlanDto` today, and `DailyLog.loggedMeals` references recipe ids. |
| FD-8  | **Followers see what the plan shows, never the reasons behind it:** meals, portions, kcal, protein, carbs and fat. Never targets (unless opted in), safety checks, household, budget, pantry, logged meals, weight or notes.                                                                                                                                                                                                                                     | Data minimisation.                                                                                                                                                                                    |
| FD-9  | **Sharing switches:** `Meal plan`, `My recipes`, `Workouts` (on when you turn on Following), and `Show my daily targets` (off; Q-F-11). **Imported recipes are shared like any own recipe, with source attribution** (Q-F-7).                                                                                                                                                                                                                                    | Owner decisions.                                                                                                                                                                                      |
| FD-10 | **Automatic moderation, no human queue** (Q-F-13). Policy in §9.                                                                                                                                                                                                                                                                                                                                                                                                 | Owner decision. It meets App Store guideline 1.2 (filter, report, block, timely action) without anyone reviewing reports.                                                                             |
| FD-11 | **Notifications:** three events (follow request, new follower, request accepted), delivered **only through the in-app Activity inbox and badges** (Q-F-14). No push, no email. No notification for unfollow, decline, removal, block or report.                                                                                                                                                                                                                  | Owner decision. Push needs Apple/Google credentials and a native build, both out of scope.                                                                                                            |
| FD-12 | **Mobile first, web later** (Q-F-2). This program builds the API (platform-neutral) and the mobile app. Web is §16. When the feature ships, `mobile_parity_backlog.md` gets its reverse ("mobile → web") rows.                                                                                                                                                                                                                                                   | Owner decision, using the explicit-scoping exception of the CLAUDE.md parity rule (as `gym_plan.md` D7 did).                                                                                          |
| FD-13 | **No new API level.** New procedures and additive optional fields only. Installed binaries never see a breaking change.                                                                                                                                                                                                                                                                                                                                          | CLAUDE.md "never break shipped mobile clients".                                                                                                                                                       |
| FD-14 | **Leaving Following is total and immediate.** `Turn off Following` deletes your social profile, every follow both ways, pending requests, blocks you made, suggestion dismissals and your Activity items. Others' hearts on your recipes stop showing. Copies they already put in their weeks stay theirs. It's logged as a withdrawal of `SOCIAL_SHARING`. Reports and moderation log rows about you are kept, so leaving and rejoining can't reset moderation. | GDPR Art. 7(3). The moderation carve-out prevents evasion.                                                                                                                                            |
| FD-15 | **"Last week" of workouts = the last 7 days** (Q-F-10): completed workouts whose `localDate` (the owner's device-local date stored on the session) is between the owner's today − 6 days and today, inclusive, with the owner's today computed in `ChefProfile.timeZone` (UTC fallback). At most 30 sessions. One request, no cursor.                                                                                                                            | A rolling window always shows the most recent training, even on a Monday. "Current + previous training week" would show up to 13 days and depends on the routine's week shape.                        |
| FD-16 | **Over-the-air only.** The feature adds no native module and changes nothing in `apps/mobile/app.config.js`, so the runtime fingerprint stays the same and every piece ships as an OTA update to installed 1.0.1 binaries. It uses only what the binary already has: RN core `Share` (invite) and `Linking` (source links), `react-native-reanimated`, `expo-router`, `expo-haptics`, `expo-image`.                                                              | Consequence of Q-F-14; the owner builds binaries by hand, and nothing here should need one.                                                                                                           |

## 6. The follow model

### 6.1 Terms (user-facing words in `code`)

| Term                                 | Meaning                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `Following` (the section)            | More → Following. Code name `friends`.                                                                                            |
| `Turn on Following` / social profile | The opt-in. Creates the user's social profile with a visibility and sharing switches. Without it the user doesn't exist socially. |
| Follow / `You follow`                | A one-way accepted relation _viewer → owner_. It grants the viewer the owner's shared content.                                    |
| `Followers`                          | People who follow you.                                                                                                            |
| Request (`Requested`)                | A pending follow to a private profile. It grants nothing until accepted.                                                          |
| `Public` / `Private`                 | Profile visibility. Default private.                                                                                              |
| Sharing switches                     | `This week’s meal plan`, `Recipes you’ve written or imported`, `Your routine and workouts`, `Your daily targets`.                 |
| Block                                | Removes every relation both ways and hides each person from the other everywhere. The blocked user isn't told.                    |
| `Report and block`                   | One action: files a report and blocks. It feeds the automatic thresholds (§9).                                                    |
| `Activity`                           | The in-app notification inbox.                                                                                                    |

### 6.2 Follow lifecycle (per ordered pair viewer → owner)

```
                      follow (owner PUBLIC)                       ┌──────────────┐
          ┌──────────────────────────────────────────────────────▶│  FOLLOWING   │
          │                                                        └──────┬───────┘
   ┌──────┴─────┐   follow (owner PRIVATE)   ┌─────────────┐  accept     │  ▲
   │    NONE    │───────────────────────────▶│  REQUESTED  │─────────────┘  │
   └────────────┘◀───────────────────────────└─────────────┘                │
     ▲   ▲   ▲      cancel (viewer) / decline (owner) / 90-day expiry        │
     │   │   └────────── unfollow (viewer) / remove follower (owner) ◀──────┘
     │   │
     │   └── block or report (either side) from ANY state → NONE both directions + BLOCKED
     └────── unblock → NONE (nothing restored)

   Owner switches PRIVATE → PUBLIC: every REQUESTED to them → FOLLOWING (the confirmation states the count)
   Owner switches PUBLIC → PRIVATE, or is forced private (§9): existing FOLLOWING kept; new follows become requests
   Either side turns Following off, or an account is deleted: every pair involving them → NONE
```

| Transition            | Actor                              | In-app notification to the other side                | Rate limit / guard                                                         |
| --------------------- | ---------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| NONE → FOLLOWING      | viewer                             | `NEW_FOLLOWER`                                       | 60 follow actions/hour/user. Not self, blocked or un-activated users       |
| NONE → REQUESTED      | viewer                             | `FOLLOW_REQUEST`                                     | Same, plus at most 3 requests to the same person per 7 days                |
| REQUESTED → FOLLOWING | owner                              | `REQUEST_ACCEPTED`                                   | Idempotent                                                                 |
| REQUESTED → NONE      | owner (decline) / viewer (cancel)  | none; the pending `FOLLOW_REQUEST` item is withdrawn | Idempotent                                                                 |
| FOLLOWING → NONE      | viewer (unfollow) / owner (remove) | none                                                 | Idempotent. The viewer's hearts on the owner's recipes stop showing (FD-7) |
| any → blocked         | either (block, or report)          | none                                                 | 30 blocks/day/user                                                         |

## 7. Privacy model

### 7.1 Who can see what

"Header" means: display name, avatar (initials), follower and following **counts**, the `Follow` / `Requested` /
`Following` / `Follow back` button, the `Follows you` tag, and the overflow (`Report and block`). Emails are never
shown to anyone.

| Viewer ↓ / Owner's profile →                     | Header                                         | Week plan (meals, kcal, macros)                      | Daily targets                      | Own recipes (written + imported, with source)        | Active routine     | Workouts, last 7 days | Owner's follower/following **lists** |
| ------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- | ------------------ | --------------------- | ------------------------------------ |
| Owner (self, preview)                            | ✓                                              | ✓                                                    | ✓                                  | ✓                                                    | ✓                  | ✓                     | ✓ (own lists)                        |
| Accepted follower (public or private profile)    | ✓                                              | ✓ if `Meal plan` on                                  | only if `Show my daily targets` on | ✓ if `My recipes` on (auto-hidden ones excluded, §9) | ✓ if `Workouts` on | ✓ if `Workouts` on    | ✗ (counts only)                      |
| Non-follower, public profile                     | ✓                                              | ✗: `Follow {first} to see their meals and workouts.` | ✗                                  | ✗                                                    | ✗                  | ✗                     | ✗                                    |
| Pending requester, private profile               | ✓ (`Requested`)                                | ✗: locked                                            | ✗                                  | ✗                                                    | ✗                  | ✗                     | ✗                                    |
| Non-follower, private profile                    | ✓                                              | ✗: locked                                            | ✗                                  | ✗                                                    | ✗                  | ✗                     | ✗                                    |
| Blocked (either direction, incl. after a report) | ✗: `Profile not available` (same as not found) | ✗                                                    | ✗                                  | ✗                                                    | ✗                  | ✗                     | ✗                                    |
| Owner hasn't turned on Following                 | ✗: not found                                   | ✗                                                    | ✗                                  | ✗                                                    | ✗                  | ✗                     | ✗                                    |

A viewer must have turned on Following themselves to see any profile.

### 7.2 What is never shared

Email address · allergies, diets, dislikes and safety checks · household members · body metrics, weight log and goal ·
logged meals and snap-to-log photos · budget, prices, shopping list and pantry · AI chat · coach reviews · workout and
exercise **notes**, heart rate, deload flags, progression overrides · "My weeks" templates and other weeks · consent
and privacy settings · workouts older than 7 days.

### 7.3 What a follower's meal plan view contains

The owner's **current week only** (Q-F-12): Monday–Sunday in the owner's time zone (`ChefProfile.timeZone`, UTC
fallback), as the owner would see it right now, **read-only and without side effects**. Viewing must not create a
carried-forward plan for the owner.

- For every day: planned meals (type, recipe name, photo, portion), per-meal kcal/protein/carbs/fat for that portion,
  and day totals.
- For the week: the average kcal per planned day.
- A meal whose recipe was auto-hidden (§9) shows as `Hidden recipe` with its numbers, and can't be opened.
- No plan and nothing to carry forward: `{first} hasn’t planned this week yet.`

## 8. User stories and acceptance criteria

Priority: **P0** = v1 launch blocker; **P1** = v1, may trail; **P2** = nice-to-have. Everything is mobile unless
marked. Copy in `code quotes` is exact and owned by `ux-design.md` §12 (the deck wins on conflict).

Retired in rev 2: FR-08.2, FR-08.3 (email search), FR-13.5 old (admin report page, replaced), FR-19.3 (Load more),
FR-21 (push, Q-F-14), FR-22.3 (folded into §14).

### E1 Turn on Following and privacy settings

**FR-01 (P0): Discover the section.** When Following is available to me (flag or allow-list, §17), More shows
**Following** directly below **Profile**.

- FR-01.1 The More row is `Following` (icon `people-outline`). It shows a count pill when there are pending requests
  or unread Activity items (display capped at `9+`).
- FR-01.2 When unavailable, the row is absent, and a deep link to a Following screen shows `Following isn’t available
right now.` with a way back.
- FR-01.3 Gym mode has no More tab. The Settings hub (reached from the `ModeSwitch` gear in both modes) gets an
  Account-group row `Following`.
- FR-01.4 The badge also appears on the More tab icon in Food mode.

**FR-02 (P0): Turn on Following (opt-in and consent).**

- FR-02.1 The intro explains in plain words:
  - who can find me: people who search my name;
  - who can see my content: followers I approve, or anyone who follows me if I'm public;
  - what is shared: the three sections;
  - what is never shared (§7.2 summary);
  - that reported content is hidden automatically.
- FR-02.2 `Turn on Following` with `Private` (preselected) creates my social profile. It logs a `SOCIAL_SHARING`
  consent event (granted, the current privacy version, source mobile) and lands me on the Following home.
- FR-02.3 Choosing `Public` first shows the public confirmation (FR-03.2).
- FR-02.4 Until I turn it on, I'm absent from search and suggestions, and following me is impossible (API NOT_FOUND).
- FR-02.5 `Not now` stores nothing.
- FR-02.6 The intro shows how others will see me: an avatar and first and last name, prefilled from
  `User.firstName`/`lastName` (fallback `User.name`) and editable.
  - Both are required, 1–50 chars each, trimmed.
  - Saving updates `firstName`, `lastName` and `name` (`"{first} {last}"`), the same rule `AuthService.register`
    uses.
  - Names are checked by the word filter (§9.4). A match is rejected with `Please choose a different name. Some words
aren’t allowed on Chefer profiles.`
- FR-02.7 Turning on runs the word filter over my existing recipes once. Matches are auto-hidden from followers
  (§9.4) and I'm told how many: `{n} of your recipes won’t be shown to followers because of words in their name or
description.`

**FR-03 (P0): Public/private setting,** in Following's `Sharing & privacy` and in Profile › Privacy & data.

- FR-03.1 Two options: `Private — you approve each follower` / `Public — anyone on Chefer can follow you`.
- FR-03.2 Switching to Public shows a confirmation naming what followers see. If there are N pending requests, it adds
  `Your {n} pending requests will be accepted.` Confirming accepts them all and logs a consent event.
- FR-03.3 Switching to Private keeps existing followers. The confirmation says so and links to the Followers list.
- FR-03.4 The change is effective on the next request. Access decisions are not cached across requests.
- FR-03.5 A profile forced private by moderation (§9.3) can't be made public. The control is disabled and explains
  why.

**FR-04 (P0): Sharing switches.** `This week’s meal plan`, `Recipes you’ve written or imported`, `Your routine and
workouts` (default on), `Your daily targets` (default off).

- FR-04.1 Turning a section off replaces it for followers with `{first} isn’t sharing {their meal plan | their
recipes | their workouts}`.
- FR-04.2 Turning `My recipes` off hides my recipes from followers' Saved lists (the references are hidden, not
  deleted). Copies already in their weeks are unaffected.
- FR-04.3 Turning on `Your daily targets` asks for confirmation (`Followers will see your daily calorie and macro
targets next to your meal plan.`) and logs a consent event.

**FR-05 (P0): Turn off Following.**

- FR-05.1 `Turn off Following` sits at the bottom of `Sharing & privacy`. Its confirmation lists the consequences
  (FD-14).
- FR-05.2 Confirming deletes my social data per FD-14 in one transaction and logs the withdrawal.
- FR-05.3 Afterwards I'm not findable, and former followers see `Profile not available`.

### E2 Following home and lists

**FR-06 (P0): Home.** The home shows, top to bottom: the search bar; **Requests** (only if any); a `You follow` /
`Followers` switch with the selected list; **Suggested for you**.

- FR-06.1 Requests: up to 3 inline with `Accept` / `Decline`, then `See all {n}`.
- FR-06.2 `You follow` rows: avatar, name, a `Follows you` tag if mutual, and a `Following` button (unfollow after
  confirmation). Pending rows show `Requested`; tapping cancels, after confirmation.
- FR-06.3 `Followers` rows: avatar, name, `Follow back` / `Requested` / `Following`, and an overflow with `Remove
follower` and `Block`.
- FR-06.4 20 per page with infinite scroll, newest relation first.
- FR-06.5 Tapping a row opens the profile (FR-14).
- FR-06.6 Empty `You follow`: `Find people you know` plus suggestions. Empty `Followers`: `No followers yet` / `Share
Chefer with people you know so they can find you.` with `Invite someone` (FR-11).

**FR-07 (P0): Requests.** Accept (→ `REQUEST_ACCEPTED` to the requester, the row then offers `Follow back`) or decline
(silent). Requests older than 90 days expire silently.

### E3 Search (name only)

**FR-08 (P0): One search bar, by name.** (Spec in §10.)

- FR-08.1 Typing 2+ characters searches first and last names by word prefix, ignoring case and accents, after a
  250 ms pause.
- FR-08.4 Results exclude me, users without Following, anyone blocked either way, and accounts removed from search by
  moderation (§9.3).
- FR-08.5 Each result shows the relation button and opens the profile.
- FR-08.6 No results: `No one found for “{query}”` / `They may not have turned on Following yet.` plus `Invite
someone`.
- FR-08.7 More than 60 searches a minute returns `Too many searches. Try again in a minute.`

### E4 Suggestions

**FR-09 (P1): Suggested for you.** (Algorithm in §11.)

- FR-09.1 Up to 5 on the home (30 under `See all`), each with a reason line (`Followed by {name}`, `Followed by {name}
and {n} others`, `Follows you`, `Popular on Chefer`), plus `Follow` and a dismiss `×`.
- FR-09.2 A dismissed person isn't suggested again for 90 days.
- FR-09.3 A new user with no connections sees popular public profiles, including the seeded **Chefer Kitchen** (Q-F-8).
  If there are none, they see the invite card.

**FR-10 (P0): Follow from anywhere.** Relation buttons behave identically in search, suggestions, lists, Activity and
profiles, and update everywhere at once (optimistic, rolled back with a snackbar on error).

**FR-11 (P2): Invite.** `Invite someone` opens the OS share sheet with `I’m using Chefer to plan meals and workouts.
Follow me in Chefer: {my full name}. {app link}`. Chefer sends nothing itself.

### E5 Follow lifecycle

**FR-12 (P0): Follow, request, cancel, unfollow, remove.** Implements §6.2.

- FR-12.1 Public: `Following` at once. The owner gets `NEW_FOLLOWER`.
- FR-12.2 Private: `Requested`. The owner gets `FOLLOW_REQUEST`.
- FR-12.3 Unfollow asks `Unfollow {first}?`. For private profiles it adds `You’ll need to ask again to see their meals
and workouts.`
- FR-12.4 Remove follower asks `Remove {first} as a follower?` / `They won’t be told. They can follow you again, or ask
to if your profile is private.`
- FR-12.5 Everything is idempotent.
- FR-12.6 Following yourself, a blocked user or a user without Following is rejected server-side (NOT_FOUND).

### E6 Safety (automatic, §9)

**FR-13 (P0): Block, report, automatic hiding, word filter.**

- FR-13.1 `Block` on every other user's profile (overflow) and on follower rows. Confirmation: `Block {first}?` /
  `They won’t be able to find you or see your profile, and you won’t see theirs or their recipes. Any follows between
you are removed. They won’t be told.`
- FR-13.2 Blocking is instant and mutual:
  - It deletes follows and requests both ways and withdraws pending Activity items between the two.
  - It hides each person from the other in search, suggestions, profiles, Activity and recipe surfaces.
  - The blocked person's recipes disappear from the blocker's Saved list. Copies already in the blocker's own week
    stay, because they are the blocker's own rows.
- FR-13.3 `Blocked people` in `Sharing & privacy` lists blocks with `Unblock`. Unblocking restores nothing.
- FR-13.4 **Report is one tap and also blocks.**
  - A profile's overflow has `Report and block {first}`. A recipe's overflow has `Report recipe`.
  - Either opens a sheet of reasons. Tapping a reason submits the report **and** blocks the person at once. There is
    no free-text note (no human reads it).
  - Confirmation snackbar: `Reported and blocked. You won’t see {first} or their recipes again.`
- FR-13.5 A recipe reported by **3** distinct eligible accounts is hidden automatically for everyone except its owner
  (§9.3).
- FR-13.6 An account whose content (the profile, or any of their recipes) is reported by **5** distinct eligible
  accounts is automatically forced private and removed from search and suggestions (§9.3).
- FR-13.7 Word filter: display names and the name and description of **shared** recipes are checked on save. A match
  is rejected with a friendly message (§9.4).
- FR-13.8 An owner whose recipe was auto-hidden sees, on that recipe, `Hidden from people who follow you` / `Several
people reported this recipe, so it’s no longer shown to others.` An owner forced private sees the reason in
  `Sharing & privacy`. There is no appeal flow (Q-F-13). The ops undo exists for the owner of Chefer to use at their
  discretion (§9.5).

### E7 Viewing a profile

**FR-14 (P0): Header and Food | Gym switch.** The header (avatar, name, counts, relation button, overflow) sits above
the same `Food | Gym` switch as the app header. The switch opens on the viewer's current mode.

- FR-14.1 The button shows `Follow`, `Requested`, `Following` or `Follow back`.
- FR-14.2 Non-followers, public or private (Q-F-4), see the header and a locked panel instead of content:
  - private: `This profile is private` / `Follow {first} to see their meals and workouts.`
  - after requesting: `Request sent` / `You’ll see their meals and workouts once {first} accepts.`
  - public: `Follow {first} to see their meals and workouts.`
- FR-14.3 Blocked, not found or Following turned off: a full-screen `Profile not available`.
- FR-14.4 The switch is local to the profile screen. It never changes the app's mode.
- FR-14.5 Viewing yourself shows a preview of what followers see, with `Edit sharing` instead of a follow button.

### E8 Food tab

**FR-15 (P0): Their current week.** Implements §7.3.

- FR-15.1 Mon–Sun chips with today highlighted (owner's time zone). The selected day lists meals (photo, name,
  portion, `{kcal} kcal · P {g} g · C {g} g · F {g} g`) and the day total.
- FR-15.2 A week line shows the average kcal per planned day. Shared targets appear as `Target {kcal} kcal · P {g} g`,
  with no judgement colours.
- FR-15.3 Tapping a meal opens the recipe (FR-17), except for `Hidden recipe`.
- FR-15.4 States: no plan, section off, loading, error, offline (last loaded copy).
- FR-15.5 Viewing never modifies the owner's data.

**FR-16 (P0): Their recipes.** A grid of the owner's own recipes (`source: MANUAL`, written **or imported**,
excluding copies of other people's recipes and auto-hidden ones), newest first, 20 per page, with search when there
are more than 12.

- FR-16.1 Card: photo, name, kcal per serving, total time, heart. Imported recipes add a small `{domain}` line
  (e.g. `bbcgoodfood.com`, `youtube.com`).
- FR-16.2 Empty: `{first} hasn’t shared any recipes yet.`

**FR-17 (P0): Open, heart and add another user's recipe.**

- FR-17.1 The recipe opens in the normal recipe detail with:
  - a `By {name}` line (tap → their profile);
  - for imported recipes, a `Source: {domain}` link that opens `sourceUrl` in the browser (Q-F-7);
  - the **viewer's** own safety checks (as today);
  - heart, `Add to my week` and `Cook`;
  - `Report recipe` in the overflow.

  There is no edit.

- FR-17.2 The heart saves a reference. The recipe appears in my Cookbook › Saved with `From {first}`.
- FR-17.3 If I lose access (unfollow, removal, block, the owner turns off `My recipes` or Following, the owner deletes
  the account), the recipe disappears from my Saved list. The heart row is kept and returns if access returns. It is
  deleted only when the recipe or its owner's account is deleted.
  - Auto-hidden recipes stay in the Saved lists of people who hearted them before the hide (the reference keeps
    working for them, per the owner's rule). New hearts are impossible, because the recipe is no longer listed.
- FR-17.4 `Add to my week` opens a day + meal picker for my current week (next week too, from Thursday on). An empty
  slot is filled; a filled slot is replaced after a confirmation. It uses my private copy (FD-7). A snackbar offers
  `Undo`.
- FR-17.5 A conflict with my table's allergies or diets shows the existing conflict treatment and needs `Use anyway`.
- FR-17.6 My copy appears under Cookbook › Mine with `From {first}` (and keeps the source attribution for imported
  recipes). It's fully editable by me.
- FR-17.7 Adding the same recipe again reuses my copy.

### E9 Gym tab

**FR-18 (P0): Their routine.** The active routine: name, days in order with planned weekday, and exercises with
`sets × reps` and rest. There are no progression weights. Curated exercises open their detail; custom ones show
`(custom)`. Empty: `{first} doesn’t have a routine yet.`

**FR-19 (P0): Their workouts from the last 7 days** (FD-15). All completed workouts in the window, newest first, in
one list, with **no Load more and no pagination**.

- FR-19.1 Card: name, date (`Tue 29 Sep`), duration, exercise count, and the top set per exercise in the **viewer's**
  unit. `Show sets` expands every completed working set. Cardio shows duration and distance.
- FR-19.2 Never shown: notes, heart rate, discarded or in-progress sessions, deload marks, warm-up sets.
- FR-19.4 Empty: `No workouts in the last 7 days.`
- FR-19.5 Nothing from another user's gym data is persisted to the device's offline gym cache.

### E10 Notifications

**FR-20 (P0): Activity inbox and badge.** The Following header has a bell with an unread count. Activity lists, newest
first:

- `{name} wants to follow you`, with inline Accept/Decline while pending;
- `{name} started following you`, with `Follow back`;
- `{name} accepted your request`.

Opening Activity marks it read. Answered or cancelled requests update in place. Items are kept for 90 days. **This is
the complete notification experience** (Q-F-14): the badge on More, the More tab and the bell is how people notice
new activity.

FR-21 (push) is retired by Q-F-14. See appendix A.

### E11 Data rights

**FR-22 (P0): Export and deletion.**

- FR-22.1 `user.exportData` adds `social`: settings, the lists, pending requests both ways, blocks made, reports
  filed, Activity items, and `SOCIAL_SHARING` consent events.
- FR-22.2 Account deletion removes all of it. Others' references to my recipes vanish. Their copies stay theirs.

## 9. Moderation policy (automatic, Q-F-13)

There is no human review. Every action below is automatic, deterministic and logged.

### 9.1 Block

Block is instant and mutual (FR-13.1–13.3). It is the primary safety tool and the fastest possible "action" for the
person affected.

### 9.2 Report

Report is one tap on a reason and **always blocks** (FR-13.4). The reporter never sees that person or their recipes
again, so, from the reporter's side, action is immediate.

| Reason (enum)   | Label                       |
| --------------- | --------------------------- |
| `INAPPROPRIATE` | `Offensive name or recipe`  |
| `SPAM`          | `Spam or fake account`      |
| `HARASSMENT`    | `Harassment`                |
| `UNSAFE`        | `Unsafe or harmful content` |
| `OTHER`         | `Something else`            |

### 9.3 Automatic thresholds

| Constant (in `@chefer/types`, `MODERATION`) | Value | Effect                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RECIPE_HIDE_REPORTERS`                     | 3     | A recipe with reports (recipe reports) from 3 distinct eligible accounts gets `Recipe.hiddenAt`. It disappears from the owner's profile grid, from search results inside that grid, and from other viewers' access. Existing hearts (references) and copies keep working for their holders. The owner sees FR-13.8.                           |
| `ACCOUNT_RESTRICT_REPORTERS`                | 5     | Distinct eligible accounts that reported the user or any of their recipes. At 5, the profile is **forced private** (`SocialProfile.forcedPrivateAt`, visibility `PRIVATE`, can't be switched back) and **removed from search and suggestions**. Existing followers stay (a forced-private profile behaves like any private profile for them). |
| `REPORTER_MIN_ACCOUNT_AGE_HOURS`            | 24    | A report counts toward a threshold only if the reporter's account is at least 24 h old…                                                                                                                                                                                                                                                       |
| `REPORTER_REQUIRES_VERIFIED_EMAIL`          | true  | …and has a confirmed email (`User.emailVerified` set; the confirmation link is sent at registration). Ineligible reports still block and are logged, but don't count. This makes brigading with throwaway accounts harder.                                                                                                                    |

Thresholds are evaluated synchronously when a report is filed. Counting is by **distinct reporter**. Reports are
append-only. A report doesn't count after an ops undo of the action it triggered (§9.5).

**Trade-off to watch:** many existing accounts never confirmed their email, so early on few reports will be
eligible, and the thresholds may rarely fire. Blocking still protects each reporter at once. If the weekly metrics
show many ineligible reports, flip `REPORTER_REQUIRES_VERIFIED_EMAIL` (a constant, one-line change).

### 9.4 Word filter (write time)

- A deterministic, bundled word list in `@chefer/utils` (`moderation/blocked-terms.ts`). No AI cost and no network.
  It covers English and Romanian slurs, sexual terms and severe profanity, curated from the open LDNOOBW lists
  (CC-BY 4.0, attributed in the file header).
- Matching is on normalised text: lowercase, diacritics stripped, common character substitutions (`0→o`, `1→i`,
  `3→e`, `4→a`, `5→s`, `@→a`, `$→s`), and **whole-word** matching, so "Scunthorpe", "assessment" or "cocktail"
  don't match.
- Checked on:
  - the display name (first + last) at turn-on and on name change: rejected;
  - the name and description of a recipe when it is **shared**, meaning the author has turned on Following with
    `My recipes` on. This covers create, edit and import: a match is rejected with `Some words in this recipe’s name
or description aren’t allowed on shared recipes. Change them, or turn off recipe sharing.`
  - existing recipes at turn-on, and when `My recipes` is switched on: matches are auto-hidden (`hiddenReason:
FILTER`) instead of blocking the action (FR-02.7).
- There is no bio in v1 (`UserProfile.bio` has no UI and isn't shown), so there's nothing to check there.

### 9.5 Log, metrics and undo (no human queue)

- **Append-only moderation log** (`ModerationLog`): every automatic action (recipe auto-hidden, account forced
  private, filter rejection, filter auto-hide, ops undo), with the reason, the count and the actor (`system` /
  `ops`). Reports themselves are rows in `UserReport`. There is no review UI.
- **Weekly metrics line:** the maintenance worker writes one structured log line every Monday: reports, eligible
  reports, auto-hidden recipes, forced-private accounts, filter rejections, undos. It needs no action.
- **Optional ops undo:** `apps/api/src/scripts/moderation-undo.ts --log=<id>` reverses one automatic action (clears
  `hiddenAt` or `forcedPrivateAt`), marks the reports that triggered it as discounted, and writes an `UNDO` log row.
  It's for the rare case the owner chooses to use it. Nothing depends on it.

### 9.6 Why this meets App Store guideline 1.2

1.2 requires, for apps with user-generated content:

1. a method for filtering objectionable material: the word filter (§9.4) plus automatic threshold hiding (§9.3);
2. a mechanism to report offensive content, with timely responses: one-tap report (§9.2);
3. the ability to block abusive users: instant mutual block (§9.1);
4. published contact information: the existing support page `https://chefer.duckdns.org/support`.

"Timely" is met by the **instant** block and hide for the reporter, plus the **automatic** threshold hide for
everyone, without waiting for a person. The App Review notes (§14) say this explicitly.

## 10. Search specification (name only)

| Aspect     | Rule                                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input      | One field, trimmed, 2–100 chars. Placeholder `Search by name`.                                                                                                                                                                                                                         |
| Matching   | The query and each profile's first + last name are normalised (lowercase, NFD diacritics stripped, punctuation → space, whitespace collapsed) and split into tokens. A profile matches when **every** query token is a prefix of some name token. "ana pop" finds "Ana-Maria Popescu". |
| Excluded   | Me; users without Following; blocked pairs (either direction); accounts removed from search by moderation (§9.3). Any `@` in the query is treated as ordinary text. There is no email matching of any kind.                                                                            |
| Ranking    | (1) people I follow or who follow me; (2) mutual-connection count; (3) exact full-name match; (4) follower count; (5) name A–Z.                                                                                                                                                        |
| Paging     | 20 per page, cursor-based.                                                                                                                                                                                                                                                             |
| Rate limit | 60 searches/min/user.                                                                                                                                                                                                                                                                  |
| Logging    | Queries are never logged or sent to analytics. Analytics gets `{ resultBucket }` only.                                                                                                                                                                                                 |

## 11. Suggestions algorithm

Computed on read, cached per user for 10 minutes. Candidates are activated users who haven't been removed from
suggestions by moderation.

1. **Mutual connections:** people followed by people I follow (accepted edges). Score `10 × mutualCount`. Reason
   `Followed by {most recently followed mutual}` (+ `and {n} others`). Private profiles are eligible (following sends
   a request).
2. **Follows you:** my followers I don't follow back. `+25`. Reason `Follows you`.
3. **Popular:** public profiles ranked by accepted follower count, with at least 3 followers and the owner active in
   the last 30 days. Score `2 × ln(1 + followers)`. Reason `Popular on Chefer`. **Chefer Kitchen** (Q-F-8) is
   always eligible for Popular while it has fewer than 3 followers (a `SocialProfile.featured` flag set only by the
   ops script that creates it), so the cold start is never empty.
4. **Exclusions:** me; anyone I follow or have requested; blocked either way; dismissed in the last 90 days;
   moderation-restricted accounts.
5. **Ordering:** score, then followers, then recent activity. Top 5 on the home, 30 under See all.
6. **Cold start:** no connections → Popular (incl. Chefer Kitchen). Empty → the invite card.

## 12. Notifications (in-app only)

| Event              | Recipient     | Activity text                  | Tap opens            |
| ------------------ | ------------- | ------------------------------ | -------------------- |
| `FOLLOW_REQUEST`   | private owner | `{name} wants to follow you`   | Following › Requests |
| `NEW_FOLLOWER`     | public owner  | `{name} started following you` | Actor's profile      |
| `REQUEST_ACCEPTED` | requester     | `{name} accepted your request` | Actor's profile      |

- Not notified: unfollow, decline, cancel, removal, block, report, moderation actions.
- The inbox and badges (on the More row, the More tab icon and the Following bell) are the whole mechanism. The badge
  count comes from `friends.me` and refreshes on app focus and every 60 s while the app is in the foreground.
- **No push** (Q-F-14; appendix A) and **no email, ever** (Q-F-9).

## 13. Another user's recipe: reference vs copy (decided, Q-F-6)

**Heart = live reference; add to week = own copy.**

- The copy is a `MANUAL` recipe owned by the viewer, with `originRecipeId` and `originCreatorId` set. Both are nulled
  if the source or its owner disappears, and `From {first}` then reads `From another Chefer cook`.
- The copy is made inside the add-to-week transaction, at most once per viewer and source, and reused after that.
- The copy carries the text, ingredients, nutrition, photo URL **and `sourceUrl`**, so an imported recipe keeps its
  attribution (Q-F-7).
- Copies are never re-shared to the viewer's own followers (`originRecipeId != null` excludes them), so nobody can
  launder someone else's recipe through a public profile. An imported recipe, by contrast, **is** shared by the person
  who imported it, with attribution. The owner decided that (Q-F-7).
- Every path that writes a recipe id into the viewer's own records (plan slots, pinned favourites at generation,
  food log) resolves another user's recipe to the viewer's copy first.
- Auto-hidden recipes: existing hearts and copies keep working for their holders (§9.3). The recipe can't be newly
  hearted or added from a profile.
- The existing "never rendered as a republished page" rule for `sourceUrl` still holds: Chefer shows the recipe
  content the user saved (as the user already sees it in Mine), plus the source domain and link, never a copy of the
  source page.

## 14. Privacy, legal and store compliance

**Legal basis.** Explicit consent (GDPR Art. 9(2)(a)). It is captured when Following is turned on, when going public,
and when sharing targets, and logged as `ConsentKind.SOCIAL_SHARING` (additive enum value). Withdrawal is `Turn off
Following` or a sharing switch, each immediately effective.

**Updates (release blockers; owner/counsel approve):**

1. **Privacy policy** (`apps/web/src/app/privacy/page.tsx`, the policy page both apps link to). Add a new section,
   "Following and what others can see", covering:
   - what is shared and with whom, and public vs private;
   - that people who search your name can find you once you turn Following on;
   - imported recipes are shown with their source;
   - automatic moderation (reports, thresholds, word filter), and that moderation records are kept after you leave
     Following;
   - copies of recipes others add to their weeks;
   - retention: Activity and requests 90 days;
   - how to withdraw.

   Then bump `LEGAL_VERSIONS.privacy` and `EFFECTIVE_DATE`, which triggers the existing re-accept sheet.

2. **Terms** (`apps/web/src/app/terms/page.tsx`): user-content rules and the automatic enforcement (hiding, forced
   private, filter). Bump `LEGAL_VERSIONS.terms`.
3. **App Store** (`docs/app-store/ios/privacy-and-rating.md`, `review-notes.md`):
   - Age rating: "User-generated content shared with other users" changes **No → Yes**.
   - App Privacy: no new data type.
   - **Review notes:** where block and report are; that reporting blocks instantly; that content reported by 3
     accounts is hidden automatically, and accounts reported by 5 are restricted automatically; that a word filter
     applies to names and shared recipes; the support URL; and two demo accounts that follow each other.
   - Guideline 1.2 is met as described in §9.6.
4. **Google Play** (`docs/app-store/android/data-safety.md`): user-initiated sharing with other users isn't "shared"
   under Play's definition (counsel to confirm). Complete the UGC section of the Play content questionnaire the same
   way.
5. **DPIA-lite** (`docs/friends/dpia.md`), for owner/counsel.
6. **Export and deletion:** FR-22.

## 15. Metrics and analytics

**Success metrics** (30 days after launch):

| Metric                                                  | Target |
| ------------------------------------------------------- | ------ |
| Weekly-active users who turn on Following               | ≥ 25%  |
| Activated users with ≥ 1 accepted follow (either way)   | ≥ 60%  |
| Request acceptance rate (answered)                      | ≥ 70%  |
| Hearts on others' recipes per connected user            | ≥ 1    |
| Connected users who add another user's recipe to a week | ≥ 20%  |
| Searches followed by a follow within 2 min              | ≥ 40%  |

**Guardrails:**

- Reports < 1% of follow actions.
- Auto-hidden recipes and forced-private accounts are reviewed as a trend in the weekly line (no action required).
- Word-filter rejections < 2% of shared-recipe saves (higher means false positives; tune the list).
- No rise in account deletions or health-consent withdrawals.
- Zero authorization incidents.

**Events** (in `EventMap`, `packages/types/src/analytics-events.ts`): enums, counts and booleans only; no other
user's ids, no names, no queries.

| Event                         | Properties                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `friends_opened`              | `source: 'more' \| 'settings' \| 'link'`                                                                          |
| `friends_activated`           | `visibility: 'public' \| 'private'`                                                                               |
| `friends_deactivated`         | `followingCount: number, followerCount: number`                                                                   |
| `friends_visibility_changed`  | `to: 'public' \| 'private', autoAccepted: number`                                                                 |
| `friends_sharing_changed`     | `section: 'plan' \| 'recipes' \| 'workouts' \| 'targets', on: boolean`                                            |
| `friends_search`              | `resultBucket: '0' \| '1' \| '2-5' \| '6+'`                                                                       |
| `friend_follow`               | `source: 'search' \| 'suggestion' \| 'followers' \| 'profile' \| 'activity', outcome: 'following' \| 'requested'` |
| `friend_request_answered`     | `action: 'accept' \| 'decline', via: 'home' \| 'requests' \| 'activity'`                                          |
| `friend_unfollowed`           | `wasMutual: boolean`                                                                                              |
| `follower_removed`            | none                                                                                                              |
| `friend_blocked`              | `from: 'profile' \| 'followers'`                                                                                  |
| `friend_reported`             | `target: 'profile' \| 'recipe', reason: 'inappropriate' \| 'spam' \| 'harassment' \| 'unsafe' \| 'other'`         |
| `friend_suggestion_dismissed` | `reason: 'mutual' \| 'follows_you' \| 'popular'`                                                                  |
| `friend_profile_viewed`       | `tab: 'food' \| 'gym', relation: 'self' \| 'following' \| 'locked'`                                               |
| `friend_recipe_favourited`    | `on: boolean, imported: boolean`                                                                                  |
| `friend_recipe_added_to_week` | `replaced: boolean, reusedCopy: boolean`                                                                          |
| `friend_text_rejected`        | `field: 'name' \| 'recipe'`                                                                                       |
| `notification_opened`         | `kind: 'follow_request' \| 'new_follower' \| 'request_accepted'` (from Activity)                                  |

## 16. Platform scope and the web phase

**This program: API + mobile (iOS and Android, one Expo codebase).** The owner scoped web out explicitly (Q-F-2),
using the exception clause of the CLAUDE.md parity rule, as the gym feature did (`gym_plan.md` D7).

- The API is platform-neutral. Nothing in it assumes mobile.
- **When the feature ships** (the launch wave), the docs task **must** add `mobile_parity_backlog.md` reverse rows
  ("mobile → web"), one per surface in the list below. That is a launch blocker for the docs task, per CLAUDE.md
  ("a knowingly unported change with no backlog entry is a bug in the session").
- **Side effects on web today** (acceptable, and listed so nobody is surprised):
  - Recipes hearted on mobile appear in web's Saved list without the `From` line.
  - Web's recipe detail opens them (server access rules apply).
  - An activated user editing a shared recipe on web gets the word-filter rejection message from the API.
  - The legal pages and re-accept sheet are web-served and are updated in this program. They are legal documents,
    not web feature work.

**Web phase (later): what web will need**

1. Entry points:
   - `Following` in the secondary nav directly after `Profile` (`apps/web/src/features/nav/nav-items.ts`, food and
     gym secondary lists) and in the header `UserMenu`;
   - routes `/friends/*` in `src/middleware.ts` (`PROTECTED_ROUTES` + `config.matcher`), `TITLE_MAP`, `APP_ROUTES`;
   - `nav-items.test.ts` and `tests/e2e/mobile-nav.spec.ts` updates.
2. Screens: the home (search, requests, lists, suggestions), Activity, Requests, Suggestions, `Sharing & privacy`,
   Blocked people, and the profile with Food | Gym (week, recipes, routine, last-7-days workouts).
3. Recipe detail and Cookbook: the `By` line, `Source:` link, `Add to my week`, `Report recipe`, and the `From` chips.
4. Shared kit additions in `@chefer/ui`: `Avatar`, `SearchInput`, `Skeleton`, `SegmentedControl`, `CountPill`.
5. The responsive rules in `ux-design.md` §15, and a Playwright mobile sweep of the new routes.
6. Notifications on web: the same inbox and a nav badge.

## 17. Rollout (over the air)

1. **Flags.** `friends` gates every `friends.*` procedure and the mobile entry points. Clients ask the per-user
   `friends.availability` query (`flag on OR user id in FRIENDS_ALLOWLIST`), because `profile.flags` is global and
   unauthenticated.
2. **Code lands dark.** The API deploys, and the mobile JS is auto-published as an OTA update on the current 1.0.1
   runtime by the deploy workflow. With the flag off, installed apps show nothing new. **No store build is needed at
   any point** (FD-16).
3. **Internal:** the owner's and test accounts go on `FRIENDS_ALLOWLIST`. The owner creates the **Chefer Kitchen**
   profile with the provided script and fills it with recipes, a routine and a week.
4. **Store metadata (owner, recommended before launch):**
   - update the age-rating answer ("User-generated content shared with other users" → Yes) and the review notes
     (§14) in App Store Connect, and the Play content questionnaire;
   - they apply with the next store submission, whenever that happens.

   The feature itself doesn't wait for a binary. All the 1.2 mechanisms (report, block, filter, automatic action)
   are in the OTA JavaScript and the API.

5. **Launch:** `friends` on for everyone (an env change via `infrastructure/scripts/env.sh` plus an API restart).
6. **Kill switch:** `friends` off hides the feature and stops all disclosure at once. The data is kept.

## 18. Risks and mitigations

| Risk                                                                          | Likelihood            | Impact   | Mitigation                                                                                                                                  |
| ----------------------------------------------------------------------------- | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization bug leaks a private plan or targets                             | Medium                | Critical | One access resolver + middleware; allow-list DTOs; access-matrix tests; an Opus security review before launch                               |
| Report brigading hides legitimate content                                     | Low–Medium            | Medium   | Distinct eligible reporters only (24 h age + verified email); thresholds as constants; the ops undo discounts the triggering reports        |
| Thresholds rarely fire because few emails are verified                        | Medium                | Low      | Block still protects each reporter instantly; the weekly metrics show ineligible counts; a one-line constant flip                           |
| Word-filter false positives / misses                                          | Medium                | Low–Med  | Whole-word, normalised matching with a Scunthorpe test list; the rejection says what to do; the list is a data file that is easy to tune    |
| App Store rejection (1.2)                                                     | Low–Medium            | High     | §9.6 mapping in the review notes; block/report are reachable in two taps; demo accounts provided                                            |
| Imported-recipe attribution/copyright complaints                              | Low                   | Medium   | Source domain and link always shown; shared only by the person who imported it (owner decision); report reason `Something else` + auto-hide |
| People miss requests without push                                             | Medium                | Low      | Badges on the More row, the More tab icon and the Following bell; requests wait 90 days before expiring                                     |
| App Review objects to a user-content feature added by OTA                     | Low–Medium            | Medium   | Every 1.2 mechanism ships in the same OTA; the age rating and review notes are updated with the next submission; the kill switch is instant |
| Another user's recipe breaks a viewer's plan                                  | Medium w/o FD-7       | High     | Copy on add; `assemblePlanDto` made tolerant of a missing recipe                                                                            |
| Viewing a week writes to the owner's account (carry-forward is write-on-read) | High if naive         | High     | Read-only week resolver; a test asserts no writes                                                                                           |
| Another user's gym data persisted on device via the gym query cache           | High if under `gym.*` | Medium   | Router is `friends.*`; a test on `isGymQueryKey`                                                                                            |
| Cold start                                                                    | High early            | Medium   | Chefer Kitchen (featured), invite card                                                                                                      |

## 19. Later (not this program)

The **web phase** (§16) · push notifications (appendix A) · profile photo upload (with moderation) · other
people's follower/following lists · an activity feed · comments and reactions · copying a routine or a whole week ·
per-recipe "hide from followers" · `Use their latest version` for copies · handles and shareable profile links ·
contact import · a weekly "what the people you follow cooked" digest (in-app only; never email).

## 20. Open questions for the owner

None. Every question from rev 1 is answered (§5.1).

## Appendix A. Later: push notifications (out of this program, Q-F-14)

What it would take, for when the owner picks it up:

1. **Credentials.**
   - **iOS:** an APNs key from the Apple Developer account (team `45TS85YK89`), with Push Notifications enabled on the
     `com.popdan.chefer` App ID, uploaded to EAS (`eas credentials -p ios`).
   - **Android:** a Firebase project with `dev.chefer.app` registered for Firebase Cloud Messaging (FCM). Its
     `google-services.json` goes to the build (as an EAS file environment variable, since the repo is public), and
     its FCM V1 service-account key is uploaded to EAS.
2. **Native change and a new build (1.0.2).**
   - Stop stripping `aps-environment` in `apps/mobile/app.config.js` (the `withoutPushEntitlement` plugin, commits
     `10d5ac18`/`dc36aa58`) for the production variant.
   - Add `android.googleServicesFile`.
   - This changes the runtime fingerprint, so it needs a store build and review. OTA can't deliver it.
3. **Server.**
   - A `PushToken` table (one row per install, re-assigned on account switch).
   - Push state on `Notification`, so the Activity rows double as the outbox.
   - `expo-server-sdk` sending through the Expo Push API.
   - A dispatch worker (send after commit, per-pair and daily caps) and a receipt worker (prune `DeviceNotRegistered`
     tokens).
   - Per-event preferences on `SocialProfile`.
4. **Mobile JS.**
   - `expo-notifications` push-token registration (`getExpoPushTokenAsync` with the EAS project id) on sign-in, and
     unregistration on sign-out.
   - An in-context permission primer, an Android `friends` channel, and `friends` routes in `useNotificationLinks`.
5. **Policy.** Mention push tokens in the privacy policy, and confirm the App Privacy answers.

The data model in this program (the `Notification` rows) is designed so push can be added without migrating existing
rows.
