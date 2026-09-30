# Chefer Friends: follow people, see their week, cook their recipes

**Product requirements document (PRD) · rev 1 · 2026-09-30**

| Field          | Value                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status         | Draft for owner review. Everything marked ⚖ needs an owner answer; the doc ships a recommended default for each (§20), and the design makes either answer a small switch. |
| Author         | Product (PO/PM), written for the owner and for the implementing agents                                                                                                    |
| Build read     | `master` @ `9dd93f3a` (API level 4 live, app version 1.0.1, OTA on runtime fingerprint)                                                                                   |
| Companion docs | [`ux-design.md`](./ux-design.md) (screens, states, copy) · [`implementation-plan.md`](./implementation-plan.md) (schema, API, waves, agent tasks)                         |
| Governing docs | [`CLAUDE.md`](../../CLAUDE.md) (Platform Parity, architecture rules) · [`infrastructure.md`](../../infrastructure.md) · [`business_flow.md`](../../business_flow.md)      |
| IDs            | Decisions `FD-n`, user stories `FR-nn` with acceptance criteria `FR-nn.m`, open questions `Q-F-n`. IDs are stable; never renumber, only append.                           |

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

## 1. Summary

Chefer becomes lightly social. People you know can follow you, see **this week's meals** (with calories and macros),
browse **your own recipes**, and see **your routine and recent workouts**. You can do the same for them, heart their
recipes into your Saved list and put one on your week in two taps.

The model is **followers/following**, as on Instagram. Follows are one-way, and following back is optional. The
section is still called **Friends**, because that is the word the owner used and the one people search for.
**Profiles are private by default.** A private profile's content is only visible to followers the owner has
approved. A public profile can be followed without approval, but its meals, recipes and workouts are still only
shown to followers. Nothing is ever visible to people who don't follow you. No one becomes findable until they
**turn on Friends** themselves, with a clear consent step.

It ships on **mobile and web**, following the parity rule, behind one feature flag. Push notifications need new
native infrastructure: a push-token table, the Expo Push API, APNs/FCM credentials, and a **new store build**. The
feature therefore works first through an **in-app Activity inbox** plus a badge, and push switches on once the new
binaries are installed.

## 2. Problem and opportunity

- **Motivation is social.** Adherence to meal plans and training improves with accountability and inspiration.
  Chefer users already tell each other what they're cooking and lifting, outside the app, by screenshot.
- **Recipes are trapped.** A user's own recipes (`Recipe.source = MANUAL`) are strictly private today
  (`apps/api/src/application/recipe/recipe-access.ts` → `isRecipeOpenTo`). The best recipes in the product can't
  travel between the people who'd cook them.
- **Growth loop.** A friend graph gives Chefer its first organic acquisition loop ("follow me on Chefer") and a
  retention hook (people come back to see what friends cook and lift).
- **Risk.** Chefer holds health-related data: calorie and macro targets, body metrics, allergies, logged meals and
  workouts. Showing any of it to other people is a new kind of processing. It must be opt-in, minimal, reversible
  and documented (§14).

## 3. Goals and non-goals

### 3.1 Goals (v1)

| #   | Goal                                                                                                                 | Measured by (§15)                                      |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| G1  | Let a user find people they know by name or exact email, and follow them (or request to).                            | Search success rate; follows per activated user        |
| G2  | Let a user see a followed person's **current week** of meals, with calories and macros per meal and per day.         | Profile views (Food tab)                               |
| G3  | Let a user browse a followed person's **own recipes**, heart them into Saved, and add one to their own week.         | Friend-recipe favourites; friend-recipe add-to-week    |
| G4  | Let a user see a followed person's **active routine** and **recent workouts**, with Load more.                       | Profile views (Gym tab); Load more usage               |
| G5  | Tell users about follow requests, new followers and accepted requests (in-app always; push once the build ships).    | Request response time; notification open rate          |
| G6  | Keep every user in control: private by default, per-section sharing switches, remove follower, block, report, leave. | Block/report rate (guardrail); privacy-setting changes |
| G7  | Stay compliant: explicit consent before sharing, updated privacy policy, App Store UGC rules (1.2), GDPR rights.     | Release checklist signed off                           |

### 3.2 Non-goals (v1): explicitly out of scope

- **Feeds, likes, comments, direct messages, stories.** There is no activity feed. You look at a profile.
  Messaging would bring moderation and App Store "chat" obligations Chefer isn't staffed for.
- **Usernames/handles and public web profile pages.** Profiles are only visible to signed-in Chefer users, inside
  the app and the web app. There is no SEO or public URL.
- **Contact-book import and "find friends from contacts".** This adds the Contacts permission and a new App Privacy
  data type.
- **Profile photos.** Chefer has no avatar upload UI today (`User.image` is only written by the unused
  `user.updateProfile`). Avatars are initials on a colour derived from the user id. A photo upload would add image
  moderation to the UGC surface, so it is listed under Later (§19). If `User.image` is ever set, it is shown.
- **Sharing health data beyond the plan:** allergies, diets, dislikes, household members, body metrics, weight log,
  logged meals (tracker), calorie and macro **targets** (unless the owner opts in, FR-12.4), budget, shopping list,
  pantry, AI chat, and coach reviews.
- **Seeing other weeks** (past or next) of a friend's plan, their "My weeks" templates, or their stats and PRs pages.
- **Copying a friend's whole week or routine.** Only single recipes cross over in v1. Routine copy is listed under
  Later (§19).
- **Web push and email notifications** for social events (Q-F-9).
- **Groups, challenges, leaderboards.**

## 4. Personas

Drawn from the persona study (`docs/persona-study-2026-09/personas.md` on the study branch) and the owner's request.

| Persona                         | Who                                                                       | What they need from Friends                                                                                                  | Watch-outs                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Andrei, the gym pair**        | 29, lifts 4× a week with a friend who also uses Chefer. Mostly Gym mode.  | See his friend's routine and last sessions ("what did you bench Tuesday?"), follow each other in one tap each.               | Doesn't care about food sharing; wants Gym only. Needs the per-section switches.                      |
| **Maria, the home cook**        | 34, plans dinners for a family, writes her own recipes in Chefer.         | Her sister and two friends want her recipes. She wants them to heart them and cook them without her re-typing into WhatsApp. | Private person: wants approval of every follower. Doesn't want her weight target visible.             |
| **Elena, the popular creator**  | 27, personal trainer, shares a public meal plan and routine with clients. | A **public** profile that clients can follow instantly; being suggested as "popular" so new users find her.                  | Needs remove-follower and block; receives many requests, so no push storm.                            |
| **Priya, the privacy-cautious** | 41, tracks calories for a medical reason. Uses Chefer alone.              | **Nothing changes for her** unless she opts in. She must never appear in search or suggestions because a feature launched.   | Health-data sensitivity: any leak of her plan or targets is a serious incident.                       |
| **Chris, the newcomer**         | 22, just registered because a friend said "follow me on Chefer".          | Find the friend fast (exact email or name), follow, and see useful content on day one. Suggestions when he knows nobody yet. | Cold start: no connections, so suggestions must still show something useful or a clear invite action. |

## 5. Decision record (recommended; ⚖ = owner confirms)

| #     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                   | Why                                                                                                                                                                                                                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FD-1  | ⚖ **Follow model = Instagram model.** Public profile → **Follow** takes effect at once (the owner is told). Private profile → **Follow** sends a **request** the owner accepts or declines. Following is one-way; "follow back" is a separate follow. See §6.1 for the tension in the request and the alternative (Q-F-1).                                                                                                                 | "Same as insta" is the owner's explicit reference model. With private as the default (FD-2), the common case of two friends connecting always goes through an accept step, which honours "they need to accept". The literal alternative (only public profiles can be followed, and every follow needs approval) is a config switch (§6.1). |
| FD-2  | **Private by default.** Every profile starts `PRIVATE`. Going public is a deliberate choice behind a consent sheet that says exactly what becomes visible and to whom.                                                                                                                                                                                                                                                                     | Health-related data (GDPR Art. 9); privacy by default (GDPR Art. 25); design principle P13 of the persona study ("Privacy by default is part of the product").                                                                                                                                                                             |
| FD-3  | **Opt-in to exist socially.** No user is searchable, suggestible or followable until they open Friends and **turn it on** (a social profile is created, and a `SOCIAL_SHARING` consent event is logged). Existing users are unaffected by the launch.                                                                                                                                                                                      | Users signed up for a private planner. Silently making them discoverable at launch would be a material change to how their data is processed. It's also what Priya needs.                                                                                                                                                                  |
| FD-4  | **Content is for followers only, even on public profiles.** A non-follower sees a profile header only: name, avatar, counts, and public/private status. Meals, recipes, routine and workouts need an accepted follow.                                                                                                                                                                                                                      | Keeps each disclosure to people the owner can see in their Followers list and remove. "Public" means "anyone can follow me without asking", not "anyone can read my plan".                                                                                                                                                                 |
| FD-5  | **"Friends" is the section; the model is follow.** There is no separate mutual-friend concept. The section has **Following** and **Followers** lists; a person who follows you back shows a `Follows you` tag.                                                                                                                                                                                                                             | Resolves the owner's "friends or maybe followers/following". One model, words people already know.                                                                                                                                                                                                                                         |
| FD-6  | **Search = one bar, names by prefix, email only by exact full address.** Names are matched case- and accent-insensitively ("stefan" finds "Ștefan"). An email only matches when the whole address is typed. **An email is never shown** in any result, including the one that matched.                                                                                                                                                     | Owner asked for name + email in one bar. Substring email search would let anyone harvest addresses ("@gmail"), so exact-only is the privacy-safe reading.                                                                                                                                                                                  |
| FD-7  | **Favourite = live reference; add to week = your own copy.** Hearting a friend's recipe saves a reference: it shows in your Saved list with `From {first name}` and stays in sync with their edits. **Adding it to your week** makes a private copy owned by you (made once per recipe, then reused) and puts the copy in your plan, so your week, shopping list and food log never change or break because of what the friend later does. | Plans and logs must be stable: today a plan slot whose recipe row is gone throws `INTERNAL_SERVER_ERROR` in `MealPlanService.assemblePlanDto`, and `DailyLog.loggedMeals` reference recipe ids. Favourites are a light "remember this" and benefit from staying live. Details and alternatives are in §13.                                 |
| FD-8  | **Friends see only what the plan shows, never the reasons behind it.** The week view carries meals, portions, kcal, protein, carbs and fat. It never carries targets (unless the owner opts in), allergy or safety checks, household members, budget, pantry, logged meals, weight or notes.                                                                                                                                               | Data minimisation. The owner asked for "calories, macros included", meaning the numbers of the meals. Targets are derived from body metrics, which are health data.                                                                                                                                                                        |
| FD-9  | **Three sharing switches, all on when you turn on Friends:** `Meal plan`, `My recipes`, `Workouts` (routine plus history). A fourth, `Show my daily targets`, is **off**. Imported recipes (from a link or video) are **never** shared (Q-F-7).                                                                                                                                                                                            | Andrei wants gym only; Maria wants recipes but not targets. Imported recipes reproduce third-party content; the code already treats their `sourceUrl` as "never rendered as a republished page".                                                                                                                                           |
| FD-10 | **Remove follower, block and report ship in v1.**                                                                                                                                                                                                                                                                                                                                                                                          | Apple Guideline 1.2 (user-generated content) requires a way to block abusive users and report content before an app with UGC is approved. It is also basic safety for Elena.                                                                                                                                                               |
| FD-11 | **Notifications:** three events: follow request received, new follower (public profiles), request accepted. In-app Activity inbox and badge **always**; push when the device has a push token and the per-event switch is on. No notification for unfollow, decline, removal or block. Nothing health-related is ever in a push payload.                                                                                                   | The owner asked for push; the inbox makes the feature complete before the new binary is installed, and on web.                                                                                                                                                                                                                             |
| FD-12 | ⚖ **Platform scope: mobile + web in the same program**, mobile first by one wave, released together behind the `friends` flag (§16). Web gets the same screens at `/friends` and `/friends/[userId]`.                                                                                                                                                                                                                                      | CLAUDE.md Platform Parity rule. The API is platform-neutral, so web mostly reuses components. If the owner prefers a gym-style "mobile first, web later" (gym_plan.md D7), that is an explicit scoping and adds `mobile_parity_backlog.md` rows.                                                                                           |
| FD-13 | **No new API level.** Everything is new procedures or additive optional fields. Installed binaries never see a breaking change. The only visible change to old clients is that friends' recipes you heart on web appear in Saved (with a creator line only on new clients).                                                                                                                                                                | CLAUDE.md "never break shipped mobile clients"; level 5 is already reserved for W5 intervals.                                                                                                                                                                                                                                              |
| FD-14 | **Leaving Friends is total and immediate.** `Turn off Friends` deletes your social profile, every follow in both directions, pending requests, blocks you made, suggestion dismissals and your social notifications. Friends' references to your recipes vanish from their Saved lists. Copies they already put in their week stay theirs. It is logged as a withdrawal of `SOCIAL_SHARING`.                                               | GDPR withdrawal of consent must be as easy as giving it (Art. 7(3)). The copies are the other user's own records (FD-7). The privacy policy says so.                                                                                                                                                                                       |

## 6. Concepts and the follow model

### 6.1 The tension in the request, and how either answer works

The request says both _"you can request to follow someone and they need to accept … (same as insta)"_ and _"you can
only follow public profiles"_. On Instagram, acceptance is only needed for **private** profiles, and anyone can
follow a public one. Read literally, the request means public profiles still need acceptance and private profiles
can't be followed at all.

| Policy                         | Public profile                    | Private profile                                                       | Consequence                                                                                                                                                                              |
| ------------------------------ | --------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A: Instagram (recommended)** | Follow is instant; owner notified | Follow = request; owner accepts/declines                              | Private-by-default users can still connect (by request). Public profiles like Elena's grow without effort. Matches "same as insta".                                                      |
| **B: Literal**                 | Follow = request; owner accepts   | Not followable; not in search or suggestions; existing followers kept | Every follower is always approved. But with private as the default, nobody can follow anybody until they switch to public. Public then just means "discoverable and accepting requests". |

**Recommendation: A**, with private as the default. The behaviour sits in one pure function,
`followPolicy(targetVisibility, policy)` → `'instant' | 'request' | 'not_allowed'` in `@chefer/utils`, with the
policy as a server constant. Switching to B changes that constant, the search/suggestion filter (B hides private
profiles) and three strings. The data model, state machine and screens are identical because both policies use
`Requested`.

### 6.2 Terms

| Term                                 | Meaning                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Friends**                          | The section (More → Friends; web nav → Friends). Not a relationship type.                                                         |
| **Turn on Friends / social profile** | The opt-in. Creates the user's social profile with a visibility and sharing switches. Without it the user doesn't exist socially. |
| **Follow / following**               | A one-way accepted relation _viewer → owner_. Grants the viewer the owner's shared content.                                       |
| **Follower**                         | Someone who follows you.                                                                                                          |
| **Request**                          | A pending follow to a private profile. Grants nothing until accepted.                                                             |
| **Public / private**                 | The profile's visibility setting (§6.1). Default private.                                                                         |
| **Sharing switches**                 | `Meal plan`, `My recipes`, `Workouts`, `Show my daily targets`: which sections followers can see.                                 |
| **Block**                            | Removes every relation between two users both ways and makes each invisible to the other in Friends. The blocked user isn't told. |
| **Activity**                         | The in-app notification inbox for social events.                                                                                  |

### 6.3 Follow lifecycle (state machine, per ordered pair viewer → owner)

```
                      follow (owner PUBLIC)                       ┌──────────────┐
          ┌──────────────────────────────────────────────────────▶│  FOLLOWING   │
          │                                                        └──────┬───────┘
   ┌──────┴─────┐   follow (owner PRIVATE)   ┌─────────────┐  accept     │  ▲
   │    NONE    │───────────────────────────▶│  REQUESTED  │─────────────┘  │
   └────────────┘◀───────────────────────────└─────────────┘                │
     ▲   ▲   ▲      cancel (viewer) / decline (owner)                       │
     │   │   └────────── unfollow (viewer) / remove follower (owner) ◀──────┘
     │   │
     │   └── block (either side) from ANY state → NONE both directions + BLOCKED overlay
     └────── unblock → NONE (nothing restored)

   Owner switches PRIVATE → PUBLIC: every REQUESTED to them → FOLLOWING (confirm sheet states the count)
   Owner switches PUBLIC → PRIVATE: existing FOLLOWING kept; new follows become requests
   Either side turns Friends off: every pair involving them → NONE (rows deleted)
   Either account deleted: rows cascade away
```

| Transition            | Actor                              | Notification to the other side                        | Rate limit / guard                                                                          |
| --------------------- | ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| NONE → FOLLOWING      | viewer                             | `NEW_FOLLOWER` to owner                               | 60 follow actions/hour/user; cannot follow self, blocked or un-activated users              |
| NONE → REQUESTED      | viewer                             | `FOLLOW_REQUEST` to owner                             | Same, plus max **3 requests to the same person per 7 days** (stops decline–re-request spam) |
| REQUESTED → FOLLOWING | owner                              | `REQUEST_ACCEPTED` to viewer                          | Idempotent                                                                                  |
| REQUESTED → NONE      | owner (decline) / viewer (cancel)  | none (the `FOLLOW_REQUEST` notification is withdrawn) | Idempotent                                                                                  |
| FOLLOWING → NONE      | viewer (unfollow) / owner (remove) | none                                                  | Idempotent; the viewer's Saved references to the owner's recipes become hidden (FD-7)       |
| any → blocked         | either                             | none                                                  | 30 blocks/day/user                                                                          |

The viewer needs no separate state for "follows me". It is the mirrored pair and is shown as a tag.

## 7. Privacy model

### 7.1 Who can see what

Rows are the viewer's relation to the profile owner. "Header" means: display name, avatar (initials; there is no profile-photo upload in Chefer today), follower and following
**counts**, the public/private badge and the viewer's relation (`Follows you`, `Requested`). Emails are never shown to
anyone but the account owner.

| Viewer ↓ / Owner's profile →                     | Header                                                                          | Food: week plan (meals, kcal, macros) | Food: daily targets                | Food: own recipes (not imported) | Gym: active routine | Gym: recent workouts | Owner's follower/following **lists** |
| ------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------- | -------------------------------- | ------------------- | -------------------- | ------------------------------------ |
| Owner (self)                                     | ✓                                                                               | ✓                                     | ✓                                  | ✓                                | ✓                   | ✓                    | ✓                                    |
| Accepted follower, **public or private** profile | ✓                                                                               | ✓ if `Meal plan` on                   | only if `Show my daily targets` on | ✓ if `My recipes` on             | ✓ if `Workouts` on  | ✓ if `Workouts` on   | ✗ (counts only, v1)                  |
| Non-follower, **public** profile                 | ✓                                                                               | ✗: "Follow {name} to see their meals" | ✗                                  | ✗                                | ✗                   | ✗                    | ✗                                    |
| Pending requester, **private** profile           | ✓                                                                               | ✗: locked state, `Requested`          | ✗                                  | ✗                                | ✗                   | ✗                    | ✗                                    |
| Non-follower, **private** profile                | ✓                                                                               | ✗: locked state                       | ✗                                  | ✗                                | ✗                   | ✗                    | ✗                                    |
| Blocked (either direction)                       | ✗: "Profile not available" (same as not found)                                  | ✗                                     | ✗                                  | ✗                                | ✗                   | ✗                    | ✗                                    |
| User who hasn't turned on Friends (as viewer)    | Only after turning on Friends. The Friends home shows the turn-on screen first. | ✗                                     | ✗                                  | ✗                                | ✗                   | ✗                    | ✗                                    |
| Any user, **owner hasn't turned on Friends**     | ✗: not found                                                                    | ✗                                     | ✗                                  | ✗                                | ✗                   | ✗                    | ✗                                    |

Under policy B (§6.1), the "Non-follower, private profile" row can't reach the profile at all: it isn't in search or
suggestions, and a direct link shows "Profile not available".

### 7.2 What is never shared (any relation, any setting)

Email address · allergies, diets, dislikes and safety checks ("Checked for…") · household members and portions for
them · body metrics, weight log and goal · logged meals (tracker) and snap-to-log photos · budget, prices, shopping
list and pantry · AI chat · coach reviews · workout **notes**, exercise notes, heart rate, deload flags and progression
overrides · "My weeks" templates and other weeks · imported recipes (link or video) · consent and privacy settings.

### 7.3 What a follower's meal plan view contains

The owner's **current week** (Monday–Sunday in the owner's time zone, `ChefProfile.timeZone`, falling back to UTC) as
the owner would see it right now, **read-only and without side effects**. Viewing must not create a carried-forward
plan for the owner. For every day: planned meals (type, recipe name, photo, portion), per-meal kcal/protein/carbs/fat
for that portion, and day totals. For the week: average kcal per planned day. If the owner has no plan for this week
and nothing to carry forward: "{First name} hasn’t planned this week yet."

## 8. User stories and acceptance criteria

Priority: **P0** = v1 launch blocker; **P1** = v1, may trail the first internal build; **P2** = nice-to-have. Every
criterion applies to mobile and web unless marked. Copy in `code quotes` is exact and owned by `ux-design.md` (the
copy deck there wins on conflict).

### E1 Turn on Friends and privacy settings

**FR-01 (P0): Discover the section.** As any signed-in user I see **Friends** in More, directly below Profile, and
in the web navigation (§16), when the `friends` flag is on.

- FR-01.1 Mobile More lists `Profile` then `Friends` (icon `people-outline`), with a count badge when there are
  pending requests or unread Activity items (max display `9+`).
- FR-01.2 With the flag off (and the user not allow-listed, §17), the row and the web nav item are absent. A deep link to
  `/friends*` shows `Friends isn’t available right now.` with a way back.
- FR-01.3 Gym mode has no More tab, so Friends must also be reachable there. The Settings hub
  (`apps/mobile/src/features/settings/settings-screen.tsx`, reached from the `ModeSwitch` gear in both modes) gains
  an Account-group row `Friends` → `/friends`. On web, `Friends` sits directly after `Profile` in the secondary
  navigation (desktop sidebar below the divider, mobile-web More drawer) and is also added to the gym secondary
  navigation. `/friends` is a mode-neutral "account page", like `/profile`.
- FR-01.4 The badge also appears on the mobile More tab icon (food mode), so a pending request is noticed without
  opening More.

**FR-02 (P0): Turn on Friends (opt-in and consent).** As a user opening Friends for the first time, I see what
Friends does and what will be shared before anything is created.

- FR-02.1 The intro screen explains, in plain words: who can find me (people who search my name or my exact email),
  who can see my content (only followers I approve, or anyone who follows me if I'm public), what is shared (the
  three sections) and what is never shared (§7.2 summary).
- FR-02.2 Choosing `Turn on Friends` with `Private` (preselected) creates my social profile, logs a `SOCIAL_SHARING`
  consent event (granted, document version = the current privacy version, source web/mobile) and lands me on
  Friends home.
- FR-02.3 Choosing `Public` on the intro shows the public-profile confirmation (FR-03.2) before creating anything.
- FR-02.4 Until I turn it on, I don't appear in anyone's search or suggestions, and following me is impossible
  (API returns NOT_FOUND for my id).
- FR-02.5 `Not now` leaves nothing stored; the next open shows the intro again.
- FR-02.6 The intro shows **how others will see me**: an avatar and my first and last name, prefilled from
  `User.firstName`/`lastName` (fallback: `User.name`). I can correct them here. There is no name-editing screen in
  Chefer today, and a user registered without a last name may want one. Both are required (1–50 chars each, trimmed)
  to turn Friends on, so every discoverable profile has a searchable name. Saving updates `firstName`, `lastName`
  and `name` (`"{first} {last}"`), which is the same rule `AuthService.register` uses.

**FR-03 (P0): Public/private setting.** As a user I can change my profile visibility in Friends settings and in
Profile › Privacy & data.

- FR-03.1 The setting is a two-option control: `Private: you approve each follower` / `Public: anyone on Chefer
can follow you`.
- FR-03.2 Switching to Public shows a confirmation naming what followers see and, if I have N pending requests,
  `{N} pending requests will be accepted`. Confirming accepts them all and logs a consent event.
- FR-03.3 Switching to Private keeps existing followers; the confirmation says so and links to the Followers list.
- FR-03.4 The change is effective on the next request anywhere (no caching of access decisions beyond one request).

**FR-04 (P0): Sharing switches.** As a user I choose which sections followers can see: `Meal plan`, `My recipes`,
`Workouts` (default on), `Show my daily targets` (default off).

- FR-04.1 Turning a section off makes it disappear for followers on their next load, replaced by
  `{First name} isn’t sharing {their meal plan|their recipes|their workouts}`.
- FR-04.2 Turning `My recipes` off hides my recipes from followers' Saved lists (references hidden, not deleted).
  Copies they already added to their weeks are unaffected.
- FR-04.3 `Show my daily targets` adds my kcal and macro targets to the week view for followers. Turning it on shows
  a one-line consent: `Followers will see your daily calorie and macro targets.`

**FR-05 (P0): Turn off Friends.** As a user I can leave Friends entirely.

- FR-05.1 `Turn off Friends` sits at the bottom of Friends settings. Its confirmation lists the consequences (FD-14).
- FR-05.2 Confirming deletes my social profile and every related row (follows both ways, requests, my blocks, my
  dismissals, my social notifications and their push deliveries) in one transaction, and logs the `SOCIAL_SHARING`
  withdrawal.
- FR-05.3 Afterwards I'm not findable, and former followers see "Profile not available". Turning Friends on again
  starts from zero.

### E2 Friends home and lists

**FR-06 (P0): Friends home.** As an activated user, Friends shows (top to bottom): search bar; **Requests** (only if
any); a `Following` / `Followers` switch with the selected list; **Suggested for you**.

- FR-06.1 Requests show up to 3 inline with `Accept` / `Decline`, then `See all {N}`.
- FR-06.2 Following rows: avatar, name, `Follows you` tag if mutual, and a `Following` button that unfollows after
  confirmation. Pending rows show `Requested` (tap = cancel request, with confirmation).
- FR-06.3 Followers rows: avatar, name, `Follow back` (or `Requested`/`Following`), and an overflow with
  `Remove follower` and `Block`.
- FR-06.4 Lists are paginated (20 per page, infinite scroll), newest relation first.
- FR-06.5 Tapping any row opens that person's profile (FR-14).
- FR-06.6 Empty Following: `Find people you know` plus the suggestions. Empty Followers: `No followers yet` /
  `Share Chefer with friends so they can find you.` with `Invite a friend` (FR-11).

**FR-07 (P0): Requests.** As a private user I can accept or decline each request, and see all of them.

- FR-07.1 Accept moves the requester into Followers at once and notifies them (`REQUEST_ACCEPTED`). The row then
  offers `Follow back`.
- FR-07.2 Decline removes the request silently.
- FR-07.3 Requests older than 90 days expire silently (row deleted by a nightly sweep).

### E3 Search

**FR-08 (P0): One search bar for names and email.** (Full spec in §10.)

- FR-08.1 Typing 2+ characters searches names (first, last, display name) by word prefix, case- and
  accent-insensitive, with results after a 250 ms pause.
- FR-08.2 Typing a complete email address (contains `@` and a dot after it) also finds the one activated account
  with exactly that email. The result shows name and avatar only, never the email.
- FR-08.3 A partial email (`maria@`, `@gmail.com`) returns name matches only, never an email match.
- FR-08.4 Results exclude me, users who haven't turned on Friends, and anyone I blocked or who blocked me. Under
  policy B they also exclude private profiles.
- FR-08.5 Each result shows the relation button (`Follow` / `Requested` / `Following`) and opens the profile on tap.
- FR-08.6 No results: `No one found for “{query}”` / `They may not have turned on Friends yet.` plus the invite
  action (FR-11).
- FR-08.7 More than 60 searches a minute (or 20 exact-email lookups an hour) returns `Too many searches. Try again in
a minute.` and doesn't query.

### E4 Suggestions

**FR-09 (P1): Suggested for you.** (Algorithm in §11.)

- FR-09.1 Up to 10 suggestions on Friends home, each with a reason line: `Followed by {name}`, `Followed by {name}
and {N} others`, `Follows you` or `Popular on Chefer`, plus `Follow` and a dismiss `×`.
- FR-09.2 Dismissing removes the person and they aren't suggested again for 90 days.
- FR-09.3 A new user with no connections sees popular public profiles, or, if there are none, the invite card only.
  The section is never an empty box.

**FR-10 (P1): Follow from anywhere.** Follow/Requested/Following buttons behave identically in search, suggestions,
lists and profiles, and update everywhere at once (optimistic, rolled back with a snackbar on error).

**FR-11 (P2): Invite.** `Invite a friend` opens the OS share sheet (mobile) / copies a link (web) with
`I’m using Chefer to plan meals and workouts. Find me in Friends: {my full name}. {app link}`. No email is sent by
Chefer. No referral tracking in v1.

### E5 Follow lifecycle

**FR-12 (P0): Follow, request, cancel, unfollow, remove.** Implements §6.3.

- FR-12.1 Following a public profile shows `Following` at once. The owner gets `NEW_FOLLOWER`.
- FR-12.2 Following a private profile shows `Requested`. The owner gets `FOLLOW_REQUEST`.
- FR-12.3 Unfollowing asks `Unfollow {first}?` with, for private profiles, `You’ll need to ask again to see their
meals and workouts.`
- FR-12.4 Remove follower asks `Remove {first} as a follower?` / `They won’t be told. They can follow you again, or
ask to if your profile is private.`
- FR-12.5 All transitions are idempotent. Double taps and retries never create duplicates or errors.
- FR-12.6 Following yourself, a blocked user or a user without Friends is rejected by the API (NOT_FOUND) regardless
  of the client.

### E6 Safety: block and report

**FR-13 (P0): Block and report** (App Store 1.2).

- FR-13.1 `Block` is available on every other user's profile (overflow) and on follower rows. Confirmation: `Block
{first}?` / `They won’t be able to find you or see your profile, and you won’t see theirs. Any follows between you
are removed. They won’t be told.`
- FR-13.2 Blocking deletes follows and requests both ways, withdraws pending social notifications between the two,
  hides each from the other's search and suggestions, and makes each other's profile "Profile not available".
- FR-13.3 Blocked users are listed in Friends settings › `Blocked people` with `Unblock`. Unblocking restores
  nothing.
- FR-13.4 `Report` is available on profiles and on friends' recipes. Reasons: `Inappropriate name or recipe`,
  `Spam or fake account`, `Harassment`, `Unsafe or harmful content`, `Something else` (+ optional note, 500 chars).
  It creates a report row, emails the support address (`cheferapp.help@gmail.com`, the existing support channel)
  with ids only, and shows `Thanks. We’ll look into it within 24 hours.` Reporting offers `Also block {name}`.
- FR-13.5 An admin can see reports (P1: web `/admin/reports` list, read-only with resolve).

### E7 Viewing a profile

**FR-14 (P0): Profile header and Food | Gym switch.** As a viewer, opening a profile shows a header (avatar,
name, counts, badge, relation button, overflow) and the **same `Food | Gym` switch** as the app header. It opens on
the viewer's current mode.

- FR-14.1 The header's primary button shows `Follow`, `Requested`, `Following` or `Follow back` per relation.
- FR-14.2 Locked (non-follower): below the switch, a lock panel: private: `This profile is private` / `Follow
{first name} to see their meals and workouts.`; public: `Follow {first name} to see their meals and workouts.`
- FR-14.3 Blocked / not found / Friends turned off: a full-screen `Profile not available` with a back action.
- FR-14.4 The switch value is local to the profile screen. It never changes the app's own mode (`mode-store`).
- FR-14.5 Viewing your own profile from a list or link shows the same screen with `Edit sharing` instead of a follow
  button, as a preview of what followers see.

### E8 Food tab

**FR-15 (P0): Their current week.** Implements §7.3.

- FR-15.1 Day chips Mon–Sun with today highlighted in the owner's time zone. The selected day lists meals with photo,
  name, portion and `{kcal} kcal · P {g} · C {g} · F {g}`, then the day total.
- FR-15.2 A week strip shows average kcal per planned day. If targets are shared, it shows `Target {kcal} kcal`
  next to the total, with no judgement colours.
- FR-15.3 Tapping a meal opens the recipe (FR-17).
- FR-15.4 States: no plan: `{First name} hasn’t planned this week yet.`; section off: FR-04.1 copy; loading
  skeleton; error with retry; offline shows the last loaded copy with `Offline · showing what was saved {time}`
  (mobile).
- FR-15.5 Viewing never modifies the owner's data (no carry-forward write, no tailoring, no image generation
  priority change).

**FR-16 (P0): Their recipes.** Below the week (mobile: a `Week` / `Recipes` sub-switch), a grid of the owner's own
non-imported recipes, newest first, 20 per page, with search when there are more than 12.

- FR-16.1 Each card: photo, name, kcal per serving, total time, heart.
- FR-16.2 Empty: `{First name} hasn’t shared any recipes yet.`

**FR-17 (P0): Open, heart and add a friend's recipe.**

- FR-17.1 A friend's recipe opens in the normal recipe detail with a `By {name}` line (tap → their profile), the
  viewer's own safety checks ("Checked for…" / conflict banner against **the viewer's** table, as today), heart,
  `Add to my week`, `Cook`, and `Report` in the overflow. No edit.
- FR-17.2 Heart saves a reference. The recipe appears in my Cookbook › Saved with `From {first name}`. Un-heart
  removes it.
- FR-17.3 If I lose access (unfollow, removal, block, owner turns off `My recipes` or Friends, owner deletes the
  account), the recipe disappears from my Saved list. If I regain access it comes back (hearts are kept and only hidden; they're deleted only when the
  recipe or its owner's account is deleted).
- FR-17.4 `Add to my week` opens a day + meal picker for my current week (next week also offered from Thursday on).
  Choosing a slot either fills an empty slot or replaces the meal there, after confirmation (`Replace {current meal}?`).
  It uses my copy of the recipe (FD-7). Result: snackbar `Added to {Tue} dinner` with `Undo`.
- FR-17.5 If the recipe conflicts with my table's allergies or diets, the picker shows the existing conflict
  treatment and requires `Use anyway`, as for my own recipes.
- FR-17.6 My copy appears under Cookbook › Mine with `From {first name}` and is fully editable by me. Editing it
  never affects the original.
- FR-17.7 Adding the same friend recipe again reuses my existing copy (no duplicates), unless the original changed
  since my copy was made. Then the picker offers `Use their latest version` (P2) or keeps my copy.

### E9 Gym tab

**FR-18 (P0): Their routine.** The owner's **active** routine: name, days in order with planned weekday, and
exercises with `sets × reps` range and rest. No progression weights.

- FR-18.1 Exercise names come from the server (including the owner's custom exercises by name). Tapping a curated
  exercise opens the normal exercise detail (photos, cues). Custom ones aren't tappable.
- FR-18.2 No active routine: `{First name} doesn’t have a routine yet.`

**FR-19 (P0): Their last workouts with Load more.** Completed workouts, newest first, **5 per page**, with `Load
more`.

- FR-19.1 Each workout card: name, date (`Tue 29 Sep`), duration, exercise count, and the top set per exercise
  (`Bench press · 80 kg × 8`) in the **viewer's** unit. Expanding shows every completed working set. Cardio shows
  duration and distance.
- FR-19.2 Never shown: notes, heart rate, discarded/in-progress sessions, deload marks, warm-up sets (P1: warm-ups
  behind `Show warm-ups`).
- FR-19.3 `Load more` fetches the next 5 by cursor. At the end: `That’s everything from the last {N} weeks.`
  (history window: 26 weeks, Q-F-10).
- FR-19.4 Nothing from a friend's gym data is persisted to the device's offline gym cache.

### E10 Notifications

**FR-20 (P0): Activity inbox.** Friends home shows a bell with an unread count. Activity lists social notifications
newest first: `{Name} wants to follow you` (with inline Accept/Decline while pending), `{Name} started following you`
(with `Follow back`), `{Name} accepted your request`.

- FR-20.1 Opening Activity marks everything visible as read.
- FR-20.2 Items whose request was since answered or cancelled update in place (no stale Accept buttons).
- FR-20.3 90-day retention, then deleted.

**FR-21 (P0 once the new build is installed; P1 overall): Push.**

- FR-21.1 The push permission is requested **in context**, the first time the user follows someone or turns on
  Friends, never on launch. It reuses the existing permission helper pattern
  (`apps/mobile/src/features/gym/reminders/permission.ts`).
- FR-21.2 Events and copy per §12. Tapping a push opens Activity (requests) or the actor's profile.
- FR-21.3 Per-event switches in Friends settings › Notifications: `Follow requests`, `New followers`, `Accepted
requests` (all on). Turning the OS permission off is respected; the settings row says `Notifications are off in
your phone’s settings` with a link.
- FR-21.4 At most one push per actor→recipient pair per 24 h (follow/unfollow loops can't spam). At most 20 social
  pushes per recipient per day. Beyond that the inbox still updates.
- FR-21.5 A push never contains health data, recipe names or anything but the actor's display name.
- FR-21.6 Installed binaries without push support still get the inbox and badge. Nothing errors.

### E11 Data rights

**FR-22 (P0): Export and deletion.**

- FR-22.1 `user.exportData` adds `social`: my social profile settings, following, followers, pending requests (both
  ways), blocks I made, reports I filed, notifications, push tokens (masked) and my `SOCIAL_SHARING` consent events.
- FR-22.2 Account deletion removes everything above (cascades). Others' references to my recipes vanish. Their
  copies stay theirs.
- FR-22.3 The privacy policy, App Store privacy answers, age-rating answers and Play Data safety form are updated
  before the flag is switched on for everyone (§14).

## 9. Non-functional requirements

| Area          | Requirement                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization | Every read of another user's data is authorised **server-side** by one access resolver (implementation plan §4.3). Clients never decide visibility. Denials are indistinguishable from not-found where existence itself is private. |
| Data shape    | Other-user responses are built by **allow-list mappers** into friend-specific DTOs, never by trimming the owner's own DTOs. A test asserts the exact key set of every friend DTO.                                                   |
| Performance   | Friends home P95 < 400 ms server time at 10k users; profile Food tab < 500 ms; search < 250 ms. No N+1: lists hydrate users in one query.                                                                                           |
| Abuse         | Rate limits in §6.3 and FR-08.7; the in-memory limiter (`apps/api/src/lib/rate-limit.ts`) is acceptable while the API is a single process.                                                                                          |
| Offline       | Mobile caches the last loaded friend screens in memory (TanStack Query) only. Nothing is written to the gym offline store.                                                                                                          |
| Accessibility | 44 pt targets, text ≥ 12 px, every icon button labelled, relation buttons announce state (`Following, button, double-tap to unfollow`), Dynamic Type to 1.8×.                                                                       |
| Compatibility | Additive API only (FD-13). Installed 1.0.x binaries keep working unchanged.                                                                                                                                                         |
| Copy          | British spelling, sentence case, curly apostrophes, no exclamation marks, no diet-culture words (persona-study copy rules).                                                                                                         |

## 10. Search specification

| Aspect         | Rule                                                                                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input          | One field, trimmed, 2–100 chars. Placeholder `Search by name or email`.                                                                                                                                                                                                          |
| Name matching  | The query is normalised (lowercase, diacritics stripped via NFD, whitespace collapsed) and split into tokens. A profile matches when **every** query token is a prefix of some token of its normalised search name (first + last + `name`). "ana pop" finds "Ana-Maria Popescu". |
| Email matching | Only when the whole query is a syntactically valid email: exact, case-insensitive equality with `User.email` (registration already stores it lowercased and trimmed). At most one result, merged at the top of the name results.                                                 |
| Never          | Substring or prefix email matching; returning or rendering an email; matching users without Friends; matching blocked pairs. Admin accounts are ordinary users here: findable only once they turn Friends on.                                                                    |
| Ranking        | (1) exact email match; (2) people I follow / who follow me; (3) mutual-connection count; (4) exact full-name match; (5) follower count; (6) name A–Z.                                                                                                                            |
| Paging         | 20 per page, cursor-based.                                                                                                                                                                                                                                                       |
| Rate limits    | 60 searches/min/user; 20 exact-email lookups/hour/user (counted only when the query is an email). On limit: `TOO_MANY_REQUESTS`, friendly copy.                                                                                                                                  |
| Enumeration    | An exact-email hit only reveals that an **activated** user has that email. The intro screen and privacy policy say "people who know your email can find you". Non-activated accounts are indistinguishable from non-existent ones.                                               |
| Logging        | Queries are never logged or sent to analytics. Analytics gets `{ kind: 'name' \| 'email', resultBucket: '0' \| '1' \| '2-5' \| '6+' }` only.                                                                                                                                     |

## 11. Suggestions algorithm

Computed on read by the API, cached per user for 10 minutes. Candidates are activated users only.

1. **Mutual connections (friends of friends):** people followed by people I follow (accepted edges only). Score
   `10 × mutualCount`. Reason `Followed by {most-recently-followed mutual}` (+ `and {N} others`). Private profiles are
   eligible (following them sends a request) under policy A; excluded under B.
2. **Follows you:** my followers I don't follow back. Score `+25`. Reason `Follows you`.
3. **Popular:** public profiles ranked by accepted follower count, minimum 3 followers, owner active in the last 30
   days (any session or plan write, `User.updatedAt` or the latest `Session.expires` as a cheap proxy). Score
   `2 × ln(1 + followers)`. Reason `Popular on Chefer`.
4. **Exclusions:** me; anyone I follow or have requested; blocked either way; dismissed in the last 90 days; users
   without Friends; policy-B private profiles.
5. **Ordering:** score descending, ties by follower count, then most recent activity. Top 10 (home), up to 30 (See
   all).
6. **Cold start:** no follows and no followers → only the Popular list. If that's empty too (early launch), show the
   invite card instead of the section. Mutual scoring kicks in with the first accepted follow.
7. **Privacy:** a suggestion never reveals a private relation the viewer couldn't otherwise see. "Followed by X" only
   names X if the viewer follows X (true by construction: X is someone the viewer follows).

## 12. Notifications

| Event              | Recipient     | In-app Activity text           | Push title / body (lock-screen safe)                                                | Tap opens          | Default |
| ------------------ | ------------- | ------------------------------ | ----------------------------------------------------------------------------------- | ------------------ | ------- |
| `FOLLOW_REQUEST`   | private owner | `{Name} wants to follow you`   | `{Name} wants to follow you` / `Open Chefer to accept or decline.`                  | Friends › Requests | On      |
| `NEW_FOLLOWER`     | public owner  | `{Name} started following you` | `{Name} started following you` / `See their profile or follow back.`                | Actor's profile    | On      |
| `REQUEST_ACCEPTED` | requester     | `{Name} accepted your request` | `{Name} accepted your follow request` / `You can now see their meals and workouts.` | Actor's profile    | On      |

- Not notified: unfollow, decline, cancel, removal, block, unblock, suggestion.
- A request that is cancelled or declined before it's seen is removed from Activity. Its push, if already delivered,
  opens Requests, which then no longer lists it.
- Push delivery: Expo Push API (FCM v1 on Android, APNs on iOS through EAS-managed credentials); the API sends
  after the database transaction commits, never inside it; receipts are checked later and dead tokens pruned
  (implementation plan §6).
- Web: inbox and nav badge only.
- Email: none in v1 (Q-F-9).

## 13. Favouriting another user's recipe: reference vs copy

| Option                                                             | Pros                                                                                                                                                                                  | Cons                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Reference everywhere (heart + plan slot point at their recipe) | No duplication; edits propagate; smallest change                                                                                                                                      | Plans, shopping lists, cook mode and **food logs** point at a row someone else controls. Owner deletes the account → `assemblePlanDto` throws for every follower who planned it. Owner edits → a follower's past week and log totals change silently (violates P9 "never change numbers silently"). |
| (b) Copy on heart                                                  | Everything downstream is own data; works with all existing code                                                                                                                       | Saved fills with copies; un-heart semantics get murky (delete the copy?); the friend's later fixes never arrive; "favourite" stops meaning favourite.                                                                                                                                               |
| **(c) Heart = reference; add to week = own copy (recommended)**    | Saved stays live and reversible; the week, shopping list, cook mode and logs only ever reference the viewer's rows; one copy per source recipe; the copy is editable ("make it mine") | Two concepts to explain (handled with `From {name}` on both); a small `Recipe.originRecipeId` addition; the copy may drift from the original (P2 `Use their latest version`).                                                                                                                       |

**Decision (FD-7): (c).** Rules:

- The copy is a `MANUAL` recipe owned by the viewer, with `originRecipeId` and `originCreatorId` set (both nulled
  if the source or its owner disappears; the `From {name}` line then reads `From a Chefer friend`). It is created
  inside the add-to-week transaction, at most one per viewer and source (unique index), and reused afterwards.
- The copy carries the recipe's text, ingredients, nutrition and photo URL (the uploaded file is shared by URL;
  account deletion of the original owner deletes the file, so the copy's photo falls back to the placeholder;
  P2: duplicate the file).
- Copies are private to the viewer like any `MANUAL` recipe and are **not** re-shared to the viewer's own followers
  (`originRecipeId != null` excludes them from "My recipes" as seen by others). This avoids laundering someone
  else's recipe through a public profile.
- The existing rule that a recipe in one of your own plans stays visible (`isRecipeInUserPlans`) keeps working and
  becomes mostly moot for friend recipes, because plans hold copies.

## 14. Privacy, legal and store compliance

**Legal basis.** Chefer already treats calorie and macro targets, body metrics, allergies and logged meals as health
data (wave 3 health consent, `privacy.grantHealthConsent`). A meal plan with calories, and a workout log, shown to
other people is a disclosure of data that may reveal health information. Basis: **explicit consent** (GDPR Art.
9(2)(a)), captured when Friends is turned on and again when going public or sharing targets, logged in the existing
append-only consent log as a new `ConsentKind.SOCIAL_SHARING` (additive enum value). Withdrawal = `Turn off Friends`
(FR-05) or turning a sharing switch off, each immediately effective.

**Policy and store updates (release blockers, owner/counsel):**

1. **Privacy policy** (`apps/web/src/app/privacy/page.tsx`): new section "Friends and what others can see". It covers
   what is shared and with whom, public vs private, that people who know your email can find you once you turn
   Friends on, blocking and reporting, copies of recipes that friends add to their weeks, push tokens (a device
   token stored to deliver notifications, sent to Apple/Google via Expo), retention (Activity 90 days, requests 90
   days), and how to withdraw. Bump `LEGAL_VERSIONS.privacy` (`packages/types/src/legal.ts`) and the page's
   `EFFECTIVE_DATE`. The existing re-accept sheet asks signed-in users to accept the new version.
2. **Terms** (`apps/web/src/app/terms/page.tsx`): user-content rules (no offensive names, photos or recipes), the
   right to remove content and suspend accounts, and the report route. Bump `LEGAL_VERSIONS.terms`.
3. **App Store** (`docs/app-store/ios/privacy-and-rating.md`): the age-rating answer "User-generated content shared
   with other users" changes **No → Yes** (the rating may rise; accept what Apple computes). App Privacy: no new
   data type. Push tokens are not "Device ID" in Apple's taxonomy, but counsel should confirm. Review notes
   (`docs/app-store/ios/review-notes.md`) must explain where block and report are, and give the reviewer a second
   demo account to follow. Guideline 1.2 checklist: report, block, a contact address and timely action.
4. **Google Play** (`docs/app-store/android/data-safety.md`): data visible to other users at the user's own
   initiative is not "shared" under Play's definition. Confirm with counsel. Add "Push notifications" to the app's
   declared features if asked.
5. **DPIA-lite:** a one-page assessment in `docs/friends/` before launch (processing, risks, mitigations = this
   PRD's §7, §10, FR-13). Owner/counsel action.
6. **Export and deletion:** FR-22.

## 15. Metrics and analytics

**Success metrics (30 days after 100% rollout):**

| Metric                                                           | Target                                |
| ---------------------------------------------------------------- | ------------------------------------- |
| Activation: weekly-active users who turn on Friends              | ≥ 25%                                 |
| Connected: activated users with ≥ 1 accepted follow (either way) | ≥ 60%                                 |
| Request acceptance rate (answered requests)                      | ≥ 70%                                 |
| Median time to answer a request                                  | < 24 h (with push) / < 72 h (without) |
| Friend-recipe hearts per connected user                          | ≥ 1                                   |
| Connected users who add a friend's recipe to their week          | ≥ 20%                                 |
| Search success (searches followed by a follow within 2 min)      | ≥ 40%                                 |

**Guardrails:** blocks + reports < 1% of follow actions; push opt-out (per-event switch off) < 30%; no rise in
account deletions or health-consent withdrawals vs the prior 30 days; zero authorization incidents (§9).

**Events** (added to `EventMap` in `packages/types/src/analytics-events.ts`; enums, counts and booleans only; **no
user ids of other people, no names, no queries, no recipe names**):

| Event                                | Properties                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `friends_opened`                     | `source: 'more' \| 'settings' \| 'push' \| 'link' \| 'nav'`                                                       |
| `friends_activated`                  | `visibility: 'public' \| 'private'`                                                                               |
| `friends_deactivated`                | `followingCount: number, followerCount: number`                                                                   |
| `friends_visibility_changed`         | `to: 'public' \| 'private', autoAccepted: number`                                                                 |
| `friends_sharing_changed`            | `section: 'plan' \| 'recipes' \| 'workouts' \| 'targets', on: boolean`                                            |
| `friends_search`                     | `kind: 'name' \| 'email', resultBucket: '0' \| '1' \| '2-5' \| '6+'`                                              |
| `friend_follow`                      | `source: 'search' \| 'suggestion' \| 'followers' \| 'profile' \| 'activity', outcome: 'following' \| 'requested'` |
| `friend_request_answered`            | `action: 'accept' \| 'decline', via: 'home' \| 'requests' \| 'activity'`                                          |
| `friend_unfollowed`                  | `wasMutual: boolean`                                                                                              |
| `follower_removed`                   | none                                                                                                              |
| `friend_blocked` / `friend_reported` | `from: 'profile' \| 'followers' \| 'recipe'`; reported adds `reason` enum                                         |
| `friend_suggestion_dismissed`        | `reason: 'mutual' \| 'follows_you' \| 'popular'`                                                                  |
| `friend_profile_viewed`              | `tab: 'food' \| 'gym', relation: 'self' \| 'following' \| 'locked'`                                               |
| `friend_recipe_favourited`           | `on: boolean`                                                                                                     |
| `friend_recipe_added_to_week`        | `replaced: boolean, reusedCopy: boolean`                                                                          |
| `friend_workouts_load_more`          | `page: number`                                                                                                    |
| `push_permission_result`             | `granted: boolean, context: 'follow' \| 'activate' \| 'settings'`                                                 |
| `notification_opened`                | `kind: 'follow_request' \| 'new_follower' \| 'request_accepted', via: 'push' \| 'inbox'`                          |

Server-side counts for the success metrics come from the database (follows, requests, copies), not from client
analytics, so they don't depend on analytics consent.

## 16. Platform scope and phasing

Per CLAUDE.md, a new user-facing feature lands on **every platform** unless the owner scopes it. Recommendation
(FD-12): one program, both platforms, one flag.

| Surface                     | Mobile (`apps/mobile`, iOS + Android)                       | Web (`apps/web`)                                                                                             |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Entry                       | More → `Friends` directly below `Profile`; Settings hub row | Sidebar/nav item `Friends` directly after `Profile` (desktop) and in the mobile-web More menu, same position |
| Friends home, search, lists | Stack route `/friends`                                      | `/friends`                                                                                                   |
| Profile with Food \| Gym    | Stack route `/friends/[userId]`                             | `/friends/[userId]`                                                                                          |
| Activity inbox              | `/friends/activity`                                         | `/friends/activity`                                                                                          |
| Settings                    | `/friends/settings` + Profile › Privacy & data row          | `/friends/settings` + Profile privacy card row                                                               |
| Push                        | Yes (needs the new native build)                            | No (inbox + badge)                                                                                           |

If the owner prefers the gym precedent (mobile first, web later), web becomes a later wave and every mobile
change adds a reverse row to `mobile_parity_backlog.md`. That is a one-line owner decision (Q-F-2).

## 17. Rollout

1. **Flags.** `friends` (`FEATURE_FLAGS`, `packages/types/src/feature-flags.ts`) gates every `friends.*` procedure
   and the entry points on both clients. `friendsPush` gates push sending, so the inbox can launch before push.
   Flags are an env change plus an API restart, no deploy. Because `profile.flags` is global and unauthenticated,
   clients gate on a new per-user `friends.availability` query instead: `enabled = flag on OR user id in
FRIENDS_ALLOWLIST` (implementation plan §9).
2. **Code lands dark.** API, web and the mobile JS merge to `master` with both flags off. The mobile JS reaches
   installed 1.0.1 binaries by OTA and shows nothing.
3. **Internal:** the owner's and test accounts are added to `FRIENDS_ALLOWLIST` on production.
4. **App Review first, then everyone.** Adding a user-generated-content feature to an approved app by OTA alone is a
   grey zone under App Review guidelines (2.5.2, and the age-rating answer in §14). The push work needs a new binary
   anyway (1.0.2). So Friends goes to users **after** the 1.0.2 build, with Friends and push, is approved: the review
   demo accounts are allow-listed during review, and the reviewer notes say where block and report are. Android
   follows the same order with its store build.
5. **Launch:** `friends` on for everyone once 1.0.2 is live in the stores. `friendsPush` goes on at the same time,
   since only 1.0.2+ binaries register tokens. Older binaries still get the full feature through OTA JS, with the
   inbox instead of push.
6. **Kill switch:** turning `friends` off hides the feature and stops all disclosure at once. Data is kept, so turning
   it back on restores the graph.

## 18. Risks and mitigations

| Risk                                                                             | Likelihood                       | Impact   | Mitigation                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | -------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization bug leaks a private plan or targets                                | Medium                           | Critical | One access resolver + middleware; allow-list DTOs; exhaustive authorization tests (implementation plan §10); security review task (Opus) before launch                                                           |
| Email enumeration / harvesting                                                   | Medium                           | High     | Exact-match only, activated users only, 20/h limit, never displayed                                                                                                                                              |
| Harassment (unwanted follow requests, offensive names/photos)                    | Low–Medium                       | High     | Private by default, block, report, per-pair request cap, support SLA in the Terms                                                                                                                                |
| App Store rejection (Guideline 1.2 UGC)                                          | Medium                           | High     | FR-13 complete before submission; review notes; age-rating update                                                                                                                                                |
| Push infra delays (credentials, new build review)                                | High                             | Medium   | Inbox-first; `friendsPush` is a separate flag. If credentials slip, 1.0.2 ships without push (the entitlement strip stays) and push follows in 1.0.3. The launch waits for a reviewed binary (§17), not for push |
| Friend's recipe breaks a viewer's plan                                           | Medium (without FD-7)            | High     | FD-7 copy-on-add; `assemblePlanDto` also made tolerant of a missing recipe (defensive, implementation plan)                                                                                                      |
| Viewing a friend's week writes to their account (carry-forward is write-on-read) | High if reused naively           | High     | Read-only week resolver; test asserts no writes                                                                                                                                                                  |
| Friend gym data persisted on device for 30 days via the gym query cache          | High if namespaced under `gym.*` | Medium   | Router is `friends.*`, outside the persisted `gym` key space; test on `isGymQueryKey`                                                                                                                            |
| Cold start: nobody to follow                                                     | High early                       | Medium   | Invite card; popular list; owner seeds a public demo profile (Q-F-8)                                                                                                                                             |
| Scale of suggestions/search queries                                              | Low now                          | Medium   | Indexed queries; 10-min cache; `pg_trgm` path documented for later                                                                                                                                               |

## 19. Later (not v1)

Profile photo upload (with moderation) · followers/following lists of other people · activity feed ("Maria planned a new week") · comments and reactions on
recipes · copy a friend's routine into Gym (a routine template) · copy a friend's whole week · per-recipe "hide from
friends" · `Use their latest version` for copies (FR-17.7) · email notifications · web push · contact import ·
handles and shareable profile links · close-friends lists · weekly "what your friends cooked" digest.

## 20. Open questions for the owner (recommended defaults ship if unanswered)

| #      | Question                                                                                                                                | Recommended default                                                        | Switch cost if changed later                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| Q-F-1  | Follow model: Instagram (public = instant, private = request) or literal (only public can be followed, every follow needs acceptance)?  | **Instagram model (A)**, private by default                                | One constant + filter + 3 strings (§6.1)            |
| Q-F-2  | Ship web in the same release, or mobile first with web as a later wave (gym precedent)?                                                 | **Same program, mobile one wave ahead, both before the flag goes on**      | Wave plan change + parity backlog rows              |
| Q-F-3  | Section name: `Friends` (your wording) or `Following`?                                                                                  | **`Friends`** for the entry; follow language inside                        | Copy only                                           |
| Q-F-4  | Should public profiles' content be visible to non-followers (true Instagram)?                                                           | **No.** Content needs a follow even when public (FD-4)                     | Access resolver rule + locked-state copy            |
| Q-F-5  | Email search: exact full address only, or also partial?                                                                                 | **Exact only**, never displayed                                            | Search service                                      |
| Q-F-6  | Heart a friend's recipe: reference, with a private copy only when added to your week?                                                   | **Yes (FD-7)**                                                             | Moderate (copy logic lives in one service method)   |
| Q-F-7  | Share imported recipes (from a website/video link) with followers?                                                                      | **No.** Only recipes you wrote                                             | One filter                                          |
| Q-F-8  | Seed a public "Chefer Kitchen" profile (owner-run) so new users have someone to follow?                                                 | **Yes**, owner-created account, public, a few recipes and a routine        | Ops only                                            |
| Q-F-9  | Email notifications for requests (for web-only users)?                                                                                  | **No in v1**                                                               | New email kind in `WeeklyEmailService`-style sender |
| Q-F-10 | How far back can followers load workouts, and page size?                                                                                | **26 weeks, 5 per page**                                                   | Constants                                           |
| Q-F-11 | Show a friend's daily targets at all (even with their opt-in)?                                                                          | **Yes, opt-in switch, default off**                                        | Remove the switch                                   |
| Q-F-12 | Should friends see **next** week's plan too?                                                                                            | **No, current week only**                                                  | Add `weekOffset` 0–1 to the read                    |
| Q-F-13 | Who handles reports, and what's the response time promise?                                                                              | **Owner via the support inbox, "within 24 hours"** (needed for App Review) | Copy + Terms                                        |
| Q-F-14 | Apple team / Firebase project for push: OK to create a Firebase project for FCM and upload the APNs key to EAS under team `45TS85YK89`? | **Yes.** Owner steps in the implementation plan §12                        | n/a                                                 |
