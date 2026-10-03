# Trainer platform: research (WP-18 Phase 0)

_Written 2026-10-03 for [WP-18](../backlog-2026-10/WP-18-trainer-platform.md). Read with [spec.md](./spec.md) and
[interview-kit.md](./interview-kit.md)._

Two parts:

- **A, market:** how existing coaching apps work, and what Romanian trainers use today.
- **B, code reconnaissance:** what Chefer already has that a trainer platform can reuse, with file pointers.

---

## A. Market

_Method and limits: public vendor pages and help centres, read 2026-10-03, plus third-party review sites where the vendor page
was not readable. Prices are USD list prices and change often; vendors quote monthly and annual-billing figures differently,
so treat them as orders of magnitude. Several help-centre pages (Trainerize) blocked direct fetches, so some Trainerize
details come from search-result summaries and are marked._

### A.1 Summary table

| Product                                                 | Who pays                            | Entry price                                                                      | Group / class support                                            | Nutrition                                    | Client onboarding                                           |
| ------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| [TrueCoach](https://truecoach.co/pricing/)              | Coach; "100% free for your clients" | About $26-30/mo for 5 active clients; about $58-70 for 20; about $137-165 for 50 | Client groups for bulk assign and broadcast; no group chat       | MyFitnessPal integration, habit tracker      | Email invite (name + email); copyable link                  |
| [Trainerize](https://www.trainerize.com/pricing/)       | Coach; clients free                 | Free for 1 client; $9 for 2; from $23 for 5-200 clients                          | Groups (community, up to 1000 members), workout-of-the-day share | Paid add-on, $20-45/mo                       | Email invite with account-setup link                        |
| [Everfit](https://everfit.io/pricing/)                  | Coach; clients free                 | Free for 5 clients; Pro from about $16-19                                        | Group chat and broadcast on Studio tier only                     | Basic on Pro; meal plans are a $33-39 add-on | Public invite link or email; seat waiting list              |
| [PT Distinction](https://www.ptdistinction.com/pricing) | Coach                               | $19.90/mo incl. 3 clients, then $6 per extra                                     | Built-in group training, challenges, leaderboards                | Included on every plan                       | Email, landing-page link, or purchase on the trainer's site |
| [Hevy Coach](https://hevycoach.com/)                    | Coach; clients get Hevy free        | $25/mo for 1-10 clients                                                          | No client groups; bulk-assign one program to many                | None advertised                              | Link, email, or Hevy username; client accepts               |
| [Ladder](https://www.joinladder.com/pricing)            | Member                              | $29.99/mo or $179.99/yr                                                          | The product _is_ the team: one program per team                  | Logging in the iOS app                       | Matching quiz, then join a team                             |
| Hevy / Strong sharing                                   | Nobody (free feature)               | Free                                                                             | None; a template travels as a link                               | None                                         | Open a link, save the template                              |

### A.2 Per-product teardown

#### TrueCoach

- **Trainer workflow.** A free-form workout builder on a calendar; typing an exercise name auto-links a demo video from a
  library of 3,000+. Workouts are saved as **programs**, which can be assigned to one or many clients "starting them at
  any point" ([workout builder](https://truecoach.co/features/workout-builder/)).
- **Client workflow.** Web or iOS app; a daily workout email; the client enters results per exercise, can attach photos or
  video, sees exercise history, and marks the workout complete. Missed workouts trigger alerts
  ([client experience](https://help.truecoach.co/en/articles/2403707-the-truecoach-client-experience)).
- **Client types.** _Remote_ and _dual_ clients get an account; _in-person_ clients get no access, and only the coach
  records their results ([client types](https://help.truecoach.co/en/articles/2393270-client-types)).
- **Groups.** A client can be in many groups. Groups are used to assign programs, send broadcast messages and filter the
  dashboard feed and compliance rates by group ([client grouping](https://help.truecoach.co/en/articles/3047874-client-grouping)).
  They are an organising tool for the coach, not a shared space for members.
- **Nutrition.** MyFitnessPal integration and habit and macro tracking on all plans
  ([pricing](https://truecoach.co/pricing/)). The client-experience page does not describe a food log.
- **Pricing.** Per coach, tiered by active clients: Starter (5), Standard (20), Pro (50); above that, custom. The vendor
  page shows $26.34 / $57.99 / $136.99, which look like annual-billing figures; third-party sources list monthly billing at
  about $29.98 / $69.98 / $164.98 ([quickcoach](https://www.quickcoach.fit/truecoach-pricing-2026.html)). No free tier,
  14-day trial per the same source.
- **Onboarding.** Adding a client (first name, last name, email) sends an invitation email at once; the coach can copy the
  invite link and send it by hand ([adding a client](https://help.truecoach.co/en/articles/2403903-adding-a-new-client),
  [invitation email](https://help.truecoach.co/en/articles/2403930-client-invitation-email)).

#### Trainerize (ABC Trainerize)

- **Trainer workflow.** Coaches build a training plan per client or use a **master program** that many clients subscribe to
  (a "30-Day Bootcamp"), and can copy a plan to several clients at once and then edit per client
  ([master programs](https://help.trainerize.com/hc/en-us/articles/360000886023-When-to-use-a-Master-Program-Client-s-Program-and-Multiple-Programs),
  [copy to multiple clients](https://www.trainerize.com/blog/save-time-copying-training-plan-multiple-clients/)).
- **Client workflow.** Full clients get programs, workout tracking, meal tracking, habit coaching and in-app messaging.
  _Basic_ clients can only book and buy and do not count towards plan limits
  ([pricing](https://www.trainerize.com/pricing/)).
- **Groups.** Groups are a private community space for up to 1000 members: the trainer can share a workout of the day
  in the group, and an auto-post option posts when a client finishes a workout or hits a goal (search-result summary of
  the [Groups help articles](https://help.trainerize.com/hc/en-us/articles/115003854166-Boost-Client-Engagement-with-Groups),
  which could not be fetched directly). Groups are separate from the per-client training plan.
- **Nutrition.** An **Advanced Nutrition Coaching** add-on at $20/mo (up to 15 clients) or $45/mo above that. It brings a
  smart meal planner with 1,000+ recipes; clients log in-app or sync MyFitnessPal or Fitbit
  ([add-on help](https://help.trainerize.com/hc/en-us/articles/6147803908500-Advanced-Nutrition-Coaching),
  [pricing](https://www.quickcoach.fit/trainerize-pricing-2026.html)).
- **Pricing.** Coach pays, clients free. Free for 1 client, Grow $9 for 2, Pro from $23 up to $225 for 200 clients (annual
  billing), Studio Plus $248 per location. Custom branded app is a $169 one-time fee on Pro
  ([pricing](https://www.trainerize.com/pricing/), [quickcoach](https://www.quickcoach.fit/trainerize-pricing-2026.html)).
- **Onboarding.** "Add and send invite" emails the client a link to set a password, fill a profile and (optionally) a
  consultation form, with app-store links; offline clients get no invite
  ([how to add clients](https://help.trainerize.com/hc/en-us/articles/208689066-How-To-Add-Clients-To-ABC-Trainerize)).
- **Language.** The coach dashboard and client app are English-only; Romanian is not offered
  ([help article via search](https://help.trainerize.com/hc/en-us/articles/360000610823-Is-ABC-Trainerize-Offered-in-Other-Languages)).

#### Everfit

- **Trainer workflow.** Workout builder, exercise library and training plans assigned to clients; coaches can also log a
  workout on a client's behalf ([log client workouts](https://help.everfit.io/en/articles/3904764-log-client-workouts)).
  Studio adds an on-demand portal of pre-made programs and collections ([pricing](https://everfit.io/pricing/)).
- **Client workflow.** Mobile app to log workouts, view history, tasks, habits, forms and messages
  ([client app workout history](https://help.everfit.io/en/articles/4930622-client-app-workout-history)).
- **Groups.** "Teams" means multiple coaches sharing a workspace and a library, not client groups
  ([team basics](https://help.everfit.io/en/articles/3013102-team-basics)). Client **group chat** and **broadcast
  messages** exist but only on the Studio tier; only the coach can add members
  ([group messaging](https://help.everfit.io/en/articles/8186432-group-messaging),
  [broadcast](https://help.everfit.io/en/articles/8258414-inbox-broadcast-messages)).
- **Nutrition.** Food journal (photo), macro tracker with MyFitnessPal and Cronometer sync, and meal plans with 500+
  recipes ([nutrition](https://everfit.io/nutrition/)). Food journal and macros need Pro or Studio; meal plans are a paid
  add-on.
- **Pricing.** Starter free for 5 clients; Pro scales to 300+; Studio 50-500+; Enterprise custom. Add-ons: Autoflow
  $24-29, payments $8-9, meal plans $33-39; about 16% off for annual billing. Clients pay nothing
  ([pricing](https://everfit.io/pricing/)).
- **Onboarding.** A **public client invite link** the coach pastes into social media or onboarding emails; clients
  self-register. If the plan has no free seats, sign-ups wait in a "Waiting Activation" list; the coach can also require
  manual activation for every sign-up ([public invite link](https://help.everfit.io/en/articles/5369004-public-client-invite-link)).

#### PT Distinction

- **Trainer workflow.** Builds circuits, supersets and giant sets, several workouts on one page, templates, custom
  exercises, YouTube or Vimeo videos ([features](https://www.ptdistinction.com/features)).
- **Client workflow.** The app logs workout results, takes exercise-technique video reviews, shows progress charts and a
  **photo food diary** ([features](https://www.ptdistinction.com/features)).
- **Groups.** The most group-oriented of the set: "set up once and share it with the whole group", with the option to edit
  the group program for an individual, plus challenges, leaderboards and a group messenger or forum
  ([features](https://www.ptdistinction.com/features)).
- **Nutrition.** Meal plan builder, macro coaching and adherence tracking on every plan
  ([pricing](https://www.ptdistinction.com/pricing)).
- **Pricing.** Every feature on every plan; price depends only on client count: Basic $19.90/mo including 3 clients ($6 per
  extra), Pro $59.90 including 25 ($2.40 extra), Master $89.90 including 50 ($1.60 extra); one month free trial; branded apps
  on Pro and Master ([pricing](https://www.ptdistinction.com/pricing)).
- **Onboarding.** Adding a client enrols them in an onboarding group that sends a welcome email with app links, a guide and
  intake forms ([welcome pack](https://www.ptdistinction.com/learning-centre/ptd-flow/add-clients-with-a-full-welcome-pack-and-guide));
  trainers can also sell packages on their own site that auto-create the client
  ([features](https://www.ptdistinction.com/features)).

#### Hevy Coach

- **Trainer workflow.** Drag-and-drop workout builder over a 400+ exercise library plus custom exercises; one program can be
  assigned to many clients in bulk ([home](https://hevycoach.com/),
  [client management](https://hevycoach.com/features/client-management/)).
- **Client workflow.** The client uses the normal **Hevy** app in a coach-connected mode: sets, reps, weight and RPE load
  automatically and the client ticks each set off; rest timer, coach notes on exercises, progress charts. Clients get Hevy
  Pro free while coached ([client app](https://hevycoach.com/features/personal-trainer-app/)).
- **Coach view.** A client list with "how active they've been in the past seven days", a feed of completed workouts, volume,
  PRs, 1RM, private coach notes ([client management](https://hevycoach.com/features/client-management/)).
- **Groups.** No client groups. Its "team" feature is several coaches sharing a program library, and it says it works by
  assigning clients to coaches, not by groups ([coaching team](https://hevycoach.com/features/coaching-team/)).
- **Nutrition.** None mentioned on the product pages read.
- **Pricing.** Coach pays: $25/mo for 1-10 clients, scaling with roster size; 30-day trial without a card; clients pay
  nothing ([home](https://hevycoach.com/); tiers $50 / $90 / $160 for up to 25 / 50 / 100 clients per
  [Software Advice](https://www.softwareadvice.com/personal-trainer/hevy-coach-profile/)).
- **Onboarding.** Three ways: copy the coach link, enter an email, or enter the client's Hevy username. The client accepts the
  invite by email or inside the app ([invite clients](https://help.hevycoach.com/en/articles/8460760-invite-clients)). The
  coach link opens a short application form (name, email, message); the coach clicks Invite or Decline
  ([invite link](https://hevycoach.com/features/invite-link/)).

#### Ladder

- **Model.** Not a coach tool. A member joins a coach-led **team** after a matching quiz and gets that team's weekly plan.
  Programs are "designed for a whole team, not per-member", even on higher tiers; the plan drops every Sunday evening
  ([Sensai review](https://www.sensai.fit/blog/ladder-app-review-2026), [Bustle](https://www.bustle.com/wellness/ladder-app-review)).
- **Client workflow.** Weekly plan with in-ear audio coaching, video demos, set-by-set logging with PR alerts, nutrition
  logging (photo, text, barcode) on iOS, team chat; no Android app at the time of reading
  ([Ladder](https://www.joinladder.com/)).
- **Who pays.** The member: $29.99/mo or $179.99/yr; higher tiers ($34.99-$49.99/mo) add 1:1 coach contact
  ([Sensai](https://www.sensai.fit/blog/ladder-app-review-2026)).
- **Why it matters here.** It is the closest existing model to "one trainer publishes one week to a group": a single
  authored artefact, a fixed weekly cadence, team chat for accountability.

#### Strong and Hevy workout sharing

- **Hevy.** Any routine or folder can be shared as a link or image through the share sheet (WhatsApp, Messenger); the
  recipient does not need Hevy installed to view it and can save it to their profile
  ([Hevy sharing](https://www.hevyapp.com/features/share-folders-routines/)).
- **Strong.** A workout or template is shared through the system share sheet; the recipient must have Strong installed to
  import it ([Strong help](https://help.strongapp.io/article/109-share-workout-or-template)).
- **Limits.** Both are one-way copies: no group, no visibility for the sender, no attendance. That gap is what a trainer
  needs, and it is the cheapest thing to build first.

### A.3 What Romanian trainers use today

**Evidence is thin.** There is no survey of tool use by Romanian trainers that I could find. What follows is from trainers'
own public sites, so it shows how some market themselves, not what most do. Interviews (see interview-kit.md) should replace it.

- **WhatsApp is the stated channel.** One Pitești trainer says he uses WhatsApp for support and Google Meet for live group
  sessions ([Bogdan Popescu](https://www.bogdanpopescufitness.ro/antrenor-personal-online-solutia-perfecta-pentru-slabire-si-tonifiere/)).
  A Cluj trainer lists WhatsApp, phone and email as contact and has clients send videos for corrections
  ([ML Fitness](https://mlfitness.ro/)). Other trainer sites describe remote coaching "in writing on WhatsApp or through a
  dedicated mobile application" (search-result summary; not opened).
- **Some already use a foreign coaching app.** The same Pitești trainer onboards app clients by sending a link to create a
  [Trainerize](https://www.bogdanpopescufitness.ro/antrenamente-online-prin-aplicatie/) account and delivers a plan with
  videos, sets and reps there, with a messaging group for support. Trainerize is English-only, which is a friction point for
  Romanian clients.
- **Group classes exist as paid packages.** Online group classes over Google Meet at 350-400 lei for 12 sessions a month,
  and in-gym 12-session packages at 500 lei, from the same trainer's pages (the two pages differ on the online price, so
  prices are indicative). Small-group training of 3-8 people is advertised elsewhere
  ([Mihai Argaseala](https://mihaiargaseala.ro/product/antrenament-personalizat-de-grup/); page did not load, so this rests
  on a search summary).
- **App-based programs are cheap.** About 150-300 lei a month for an app programme with nutrition advice
  ([Fitnessio](https://www.fitnessio.ro/antrenor-personal-online-solutia-moderna-de-fitness/)); 290-680 lei per four weeks for
  online coaching with video feedback at ML Fitness. A market survey put the average personal-training programme at about
  672 lei (roughly 135 EUR), with 88% of clients preferring the trainer's own facility
  ([HomeRun via Curierul National](https://curierulnational.ro/homerun-cererea-pentru-servicii-de-wellbeing-a-crescut-cu-64-masajul-antrenamentele-personale-si-nutritia-in-topul-preferintelor-romanilor/)).
- **Local software targets clubs, not solo trainers.** UPfit.team is a trainer app tied to club management software
  (scheduling, selling PT packages, contracts), reported in over 155 clubs in Romania, Serbia and the UAE; it does not
  advertise programme building ([UPfit.team](https://upfit.cloud/aplicatie-antrenori-personali)).
- **Not found:** any public evidence on Instagram DMs or spreadsheets and PDFs as delivery tools (they are plausible but
  unsourced here), the share of trainers using any paid coaching app, or any Romanian-language equivalent of
  TrueCoach or Everfit. The "demand +40% in 2025, mostly women 30-40" figure in spec.md section 1 was attributed to Forbes.ro;
  I could not find that article.

### A.4 Implications for Chefer's MVP

1. **Copy: publish once to a group, weekly.** Ladder ("one program for the whole team, dropped weekly") and PT Distinction
   ("set up once and share with the whole group") match the spec's slice, and it replaces the WhatsApp post. Do not copy
   the per-client-program model (TrueCoach, Trainerize, Hevy Coach): it makes the trainer retype per person.
2. **Copy: invite by link, with the trainer in control of who gets in.** Everfit's public link and Hevy Coach's
   apply-then-accept form both avoid the trainer typing emails. Add Everfit's waiting-list idea if seats are ever capped. The
   consent screen sits between "tap link" and "joined".
3. **Who pays: the trainer, never the member, if a price is introduced.** Every coach tool in the set has the coach pay and
   the client use the app free; only Ladder, a content product, charges the member. That also matches the "Premium =
   heavy AI only" principle in B.6. Free during the beta, as spec.md section 6 proposes.
4. **Pricing pattern for later: tiers by active-client count, small entry price.** Observed entry points are $0 for 1-5
   clients (Trainerize, Everfit), $19.90-$29 for 3-5 (PT Distinction, TrueCoach), $25 for 10 (Hevy Coach). A trainer in the
   tester's situation (6-15 per group) would land in the $25-60 band in USD. Romanian prices (150-400 lei a client a month)
   suggest a seat price must be a small fraction of one client's monthly fee; that is my inference, not sourced.
5. **Avoid in MVP: nutrition, chat, payments, branded apps.** Incumbents sell nutrition as a separate add-on ($20-45 on
   Trainerize, $33-39 on Everfit) and group chat only on Everfit's Studio tier. Each is a large build. Keep them in the
   later slices of spec.md section 3.
6. **Copy: a minimal "who did it" view.** TrueCoach filters its dashboard feed and compliance by group; Hevy Coach shows
   seven-day activity per client plus volume and PRs. That is the attendance, effort and last-loads grid in spec.md
   section 2. Nothing more is needed at first.
7. **Differentiator: Romanian-language and free for members.** Trainerize has no Romanian UI, yet a Romanian trainer
   uses it. A Romanian trainer tool where members already log in Chefer, with no second download, is a credible gap. Hevy
   Coach's "client just uses Hevy" is the closest precedent for reusing the consumer app.
8. **Cheapest validation: before building the dashboard, test the weekly habit.** Hevy and Strong show that a routine can
   be shared as a link and copied; that already works in the app via Following. A four-week trial with the tester's trainer
   could use manual steps: the trainer publishes the week, members check in, and the owner reads the data by hand. Success
   would be the trainer publishing every week unprompted, and more than half of members checking in. Compare against
   the 12-session, 350-400 lei online-class packages as the trainer's existing revenue unit.

---

## B. Code reconnaissance (master @ `df456c13`)

### B.1 Identity and roles

- `UserRole` is `USER | MODERATOR | ADMIN` (`packages/database/prisma/schema.prisma:20-24`). It's a **global staff
  role**, enforced by `adminProcedure` middleware. "Trainer" should **not** be a new `UserRole` value:
  - a person can be a trainer for one group and a member of another;
  - a new enum value would reach 1.0.1 clients that switch on the role.

  A trainer is a **relationship** (`Coaching` / `GroupMember` rows), not a role. A `TrainerProfile` row (opt-in, like
  `SocialProfile`) marks someone who has turned the trainer tools on.

- `PlanTier` (FREE / PREMIUM) is per user. Who pays for coaching is an open owner question (spec §6).

### B.2 Following: the closest existing pattern (reuse heavily)

The Following feature (`docs/friends/prd.md`, `docs/friends/dpia.md`, `docs/friends/implementation-plan.md`; code name
`friends`) already solved most of the sharing problems a trainer platform has:

| Need                            | What exists                                                                                           | Pointer                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A request/accept relationship   | `Follow { followerId, followeeId, status: PENDING \| ACCEPTED }`, `Block`, `UserReport`               | `schema.prisma:1462-1580`; `apps/api/src/application/friends/{follow,block}.service.ts`  |
| Per-section sharing toggles     | `SocialProfile.sharePlan / shareRecipes / shareWorkouts / shareTargets` (targets off by default)      | `schema.prisma` `SocialProfile`; `friend-content.service.ts` enforces them on every read |
| Explicit, revocable consent     | `ConsentKind.SOCIAL_SHARING` in the `ConsentEvent` log, withdrawn on turn-off (FD-14)                 | `schema.prisma:126-139`, `:684`; `apps/api/src/application/privacy/*`                    |
| Reading someone else's gym data | `friend-content.service.ts` returns another user's routine and last N workouts, shaped by DTO mappers | `apps/api/src/application/friends/friend-content.service.ts`, `friend-dto.mappers.ts`    |
| Moderation and retention        | word filter, reports threshold → forced private, 24-month retention (#95)                             | `ModerationAction` enum; `docs/friends/dpia.md`                                          |
| Mobile UI shell                 | profile screen with a Food/Gym toggle, add-to-week, settings                                          | `apps/mobile/src/features/friends/{profile,add-to-week,settings}`                        |
| Feature flag                    | `friends` flag (off in production for cohort 1, D-6)                                                  | `FEATURE_FLAGS`                                                                          |

**Implication:** the client→trainer data share is the Following model with a stricter consent (special-category health
data, a named recipient) and **trainer-only** visibility. The trainer doesn't need a public profile, search or
suggestions. Invite-by-link replaces search.

### B.3 Gym: what a trainer would publish and see

- **Routines** (`Routine` → `RoutineDay` → `RoutineExercise`, `schema.prisma:1290-1341`) are owned by one user, with
  `isActive`, a rotation pointer and optimistic `version`. Templates are code-defined (`packages/utils/src/gym/templates.ts`,
  `Routine.templateKey`).
  - A trainer-authored routine can be a **copy** pushed into the client's account (the client then owns it, and the
    progression engine works unchanged). Alternatively it can be a **shared source** the client follows. Copy-on-publish
    is simpler and keeps the engine untouched. Spec §2 picks it.
- **Sessions** (`WorkoutSession` / `SessionExercise` / `SessionSet`, `:1343-1420`) are client-UUID documents synced
  through an offline outbox with last-write-wins on `clientUpdatedAt`. They carry no effort, focus, kind, duration or kcal
  yet. **WP-05** adds those, plus `ClassSlot` and `ClassCheckIn` (WP-05 doc lines 39-70). A trainer dashboard needs exactly
  those fields: attendance (`ClassCheckIn.status`), effort and focus.
- **Exercise library:** a governed library, with `Exercise.ownerId` null for curated rows (`:1206-1250`). User-built
  combos were rejected. A trainer platform should keep that: trainers pick from the library. Curated combos stay in Nice
  to have.
- **Progression:** `ExerciseProgression` plus `packages/utils/src/gym/progression.ts`. Class sessions are excluded from
  the engine in WP-05 (G1). Trainer-published "strength" sessions could opt in.
- **Old clients:** gym gating by `x-chefer-api-level` (`apps/api/src/application/gym/client-level.ts`; levels in
  `infrastructure.md`). Level 4 is live and 5 is used by INTERVALS. Any trainer-published session kind a 1.0.1 client
  can't render must be filtered for levels below the claimed one.

### B.4 Food: what a trainer could suggest (later slice)

- **My weeks:** `MealPlan.isTemplate / name / isFollowed` (`schema.prisma:484-508`) are named saved weeks, and the
  followed one is carried forward. A trainer-suggested week maps cleanly onto "a template the trainer pushes into the
  client's My weeks".
- **Targets:** `apps/api/src/application/targets/*`, own targets (B-35), training-day nutrition. A trainer-set target
  would be "own targets set by someone else", which needs an audit trail and the client's consent.
- **Household** (`HouseholdMember`, `:702`) is people _you_ cook for. It's not related to coaching; don't overload it.

### B.5 Web: where the trainer works

- The web app has a full gym area: `apps/web/src/app/(dashboard)/gym/{routine,workout,history,stats,setup,settings,exercises,summary}`,
  with features in `apps/web/src/features/gym/*`. The routine editor exists on web, so a trainer can author a session there.
- There is no multi-client view anywhere yet. A `/coach` area (new route group, desktop-first, responsive per CLAUDE.md)
  would hold the client list, attendance and loads.
- `admin` exists as a route group. Trainer tools must **not** live there: it's staff-only.

### B.6 Constraints that shape the design

1. **Additive API, gated by API level.** 1.0.1 binaries are in the field (operating rules §3).
2. **OTA-safe client work.** No push notifications (the Following decision Q-F-14 kept push out), so trainer→client
   updates appear in-app on next open.
3. **Special-category data.** A trainer seeing sessions, weight or food is health data shared with a named third party.
   It needs explicit, per-section, revocable consent, and the DPIA (`docs/friends/dpia.md`) must be extended. The
   `HEALTH_CONSENT_ENFORCE` / `HEALTH` consent kind already exists for the user's own processing.
4. **The "Premium = heavy AI only" principle** (decision of 2 Oct). Coaching uses no AI, so gating it behind client
   Premium would contradict the principle. Who pays is an owner question (spec §6).
5. **Governed exercise library.** No free-text exercises.

<!-- END -->
