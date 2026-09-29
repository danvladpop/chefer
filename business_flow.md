# Chefer — Business Flows

> **Keep this document up to date.** Any time a new flow is added, an existing flow changes, or a new tRPC procedure is introduced, update the relevant section here.

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [User Registration Flow](#2-user-registration-flow)
3. [User Login Flow](#3-user-login-flow)
4. [Session & Authorization Flow](#4-session--authorization-flow)
5. [View User Profile Flow](#5-view-user-profile-flow)
6. [User Management (Admin) Flow](#6-user-management-admin-flow)
7. [Post Lifecycle Flow](#7-post-lifecycle-flow)
8. [API Request Lifecycle](#8-api-request-lifecycle)
9. [Premium Tier & Meal Plan Generation Flow](#9-premium-tier--meal-plan-generation-flow)
10. [Dashboard Summary Flow](#10-dashboard-summary-flow)
11. [Password Reset Flow](#11-password-reset-flow)
12. [Cook Mode Flow](#12-cook-mode-flow)
13. [AI Chat Flow](#13-ai-chat-flow)
14. [Adaptive Chef Weekly Review Flow](#14-adaptive-chef-weekly-review-flow)
15. [Snap-to-Log Flow (F4)](#15-snap-to-log-flow-f4)
16. [Recipe Import & Cheferize Flow](#16-recipe-import--cheferize-flow)
17. [Household Plans Flow (F2)](#17-household-plans-flow-f2)
18. [Zero-Waste Pantry Flow (F3)](#18-zero-waste-pantry-flow-f3)
19. [Beta Feedback Flow](#19-beta-feedback-flow)
20. [Native App Update Flow (OTA, M4-4)](#20-native-app-update-flow-ota-m4-4)
21. [Gym Training Flow](#21-gym-training-flow)
22. [Gym Setup & Workout Sync Flow (API)](#22-gym-setup--workout-sync-flow-api)
23. [Weekly Emails & Notifications Flow (P2-5)](#23-weekly-emails--notifications-flow-p2-5)
24. [Account Deletion Flow (App Store 5.1.1(v))](#24-account-deletion-flow-app-store-511v)
25. [AI Data Consent Flow (App Store 5.1.2(i))](#25-ai-data-consent-flow-app-store-512i)
26. [Usage Analytics Consent Flow (P0-6)](#26-usage-analytics-consent-flow-p0-6)
27. _(reserved — another wave-1 lane)_
28. _(reserved — another wave-1 lane)_
29. [Your Own Targets & Change Notices Flow](#29-your-own-targets--change-notices-flow)
30. [Food Logging: Search, Edit, Undo, Copy Day Flow](#30-food-logging-search-edit-undo-copy-day-flow)
31. [Manual Recipe Create and Edit](#31-manual-recipe-create-and-edit-ux-40-slices-12-t-401t-4010-t-bug-o3)
32. [Terms Acceptance & Email Defaults Flow](#32-terms-acceptance--email-defaults-flow-t-391t-393)

---

## 1. Application Overview

Chefer is a full-stack web application with a clear separation between a **Next.js frontend** (port 3000) and an **Express + tRPC API** (port 3001). All data flows between the frontend and backend go through tRPC over HTTP.

```
Browser
  │
  ├─ Server Components (SSR) ──► tRPC Server Client ──► API (3001) ──► PostgreSQL
  │
  └─ Client Components (CSR) ──► tRPC React Client ──► API (3001) ──► PostgreSQL
```

---

## 2. User Registration Flow

> **Status:** Implemented (self-service at `/register`).

**Mobile first screen (UX-25, T-25.1).** `(auth)/index.tsx` no longer redirects
straight to Sign in: it checks `hasSignedInBefore` (`auth-store.ts`, a
SecureStore flag set on the first successful sign-in/registration and never
cleared by sign-out). A device that has never signed in lands on the new
`(auth)/welcome.tsx` (mark, "Train and eat to one plan", three free-tier
feature bullets, `Create free account` / `I already have an account`);
everyone else goes straight to `login`, whose title/subtitle are "Welcome
back" only once `hasSignedInBefore` — otherwise "Sign in" with a full-width
`Create free account` button (CI-09: a fresh install used to land on "Welcome
back / Sign in" with no logo or value statement). Web has no separate first
screen; the landing page (`/`, T-25.2) plays that role and now leads with the
free workout log too, not meal planning alone (CI-16/CI-25).

```
1. User fills in RegisterForm at /(auth)/register
   └── email, password, firstName?, lastName? (react-hook-form + Zod)
   └── the client adds region? — detectRegion() from @chefer/utils reads the
       browser (navigator.languages) / device (Intl, no native dependency)
       locale, e.g. "en-US" → "US"
   └── UX-39/UX-26 (T-39.1, T-26.5, wave 1): two REAL checkboxes replace the
       old static disclaimer paragraph — "I agree to the Terms and the
       Privacy Policy" (each a link; mobile opens them in-app at
       legal/[doc].tsx via react-native-webview, keeping the form's
       in-progress values in an ephemeral register-draft.ts cache; web opens
       /terms /privacy in a new tab) and "I'm 16 or older" (P0-6 — minimum
       age 16, Romania's age of digital consent). The submit button stays
       enabled either way; an unticked box shows an inline error instead.
       acceptedTermsVersion is LEGAL_VERSIONS.terms (@chefer/types).
   └── Re-accept sheet (TermsReacceptGate web, TermsReacceptSheet mobile,
       mounted in the signed-in shell): fires for a signed-in account whose
       latest recorded TERMS version is OLDER than LEGAL_VERSIONS.terms. A
       MISSING record (every account from before this wave) is treated as
       "not yet applicable", not "stale" — the sheet does not mass-prompt
       the entire existing user base the moment this ships; it only fires
       for an account that already went through this consent flow once and
       the document has since moved past what it recorded.
2. auth.register (public tRPC mutation, rate-limited 10/15 min per IP)
   └── AuthService.register
        ├── clientApiLevel ≥ 2 (the level this wave's web + mobile builds
        │    send) requires acceptedTerms + acceptedTermsVersion and
        │    ageConfirmed — BAD_REQUEST otherwise. Gated on 2, not 1,
        │    deliberately: a wave-0 mobile build already out on OTA sends
        │    level 1 (it understands the health-consent error, §2.8) but has
        │    no consent checkboxes — gating on >= 1 would have locked every
        │    wave-0 phone out of registration the moment this API deployed,
        │    since an OTA cannot land on a changed native runtime.
        │    clientApiLevel 0/1 (that wave-0 OTA, or an older installed
        │    binary) sends none of these fields and registers unchanged —
        │    the server backstop, not the primary control (the UI is)
        ├── reject with CONFLICT when the email already has an account
        ├── bcrypt.hash(password, 12)
        ├── prisma.user.create (role USER, planTier FREE)
        │    ├── weeklyEmailReady: false, weeklyEmailRecap: false written
        │    │    EXPLICITLY (T-39.3, ⚖ D-13) — every new account starts with
        │    │    both weekly digests off; existing accounts are never
        │    │    touched by this path
        │    ├── termsAcceptedVersion set when acceptedTermsVersion was sent
        │    └── with a region: nested ChefProfile { preferredUnits, deliveryCurrency }
        │        from defaultsForRegion (P2-6) — US/LR/MM → IMPERIAL, else METRIC;
        │        US → USD, GB → GBP, RO → RON, eurozone/else → EUR. The row has
        │        no goal, so preferences.hasProfile stays false and onboarding runs.
        ├── createSession → chefer_session cookie
        │    (HttpOnly, SameSite=Strict, Secure in prod, 30 days)
        └── T-39.2: every consent field actually sent is logged through
             ConsentService.record — TERMS, PRIVACY (both stamped with
             acceptedTermsVersion) and AGE, only when the client is level
             >= 2 and actually sent them (a level 0/1 signup never agreed to
             anything, so gets none of these three rows — the re-accept
             sheet catches it once that account is on a level >= 2 client).
             The EMAIL_WEEK_READY/EMAIL_RECAP/AUTO_PLAN defaults (`granted:
             false`) are logged for EVERY registration regardless of level,
             since the column defaults apply unconditionally. Best-effort —
             a logging failure never turns a successful registration into
             an error response.
   └── the router then emails the address-confirmation link in the
       background (P2-5, §23) — never blocks or fails the signup
3. Client redirects to /onboarding
4. Onboarding step 1 — "What should Chefer help with?" (§2.4, T-03.1/T-03.2,
   rev 2 — mobile only; web still runs the v1 single-intent flow below until
   its own migration lands, T-03.6). A multi-select JobsStep (`Train` /
   `Plan my meals` / `Feed my household` / `Use what I have` / `Cook my saved
   recipes` / `Track what I eat`) replaces "What brings you here?"; the step
   chain is built by `onboardingSteps({ askJobs: true, jobs, hasNumericGoal })`
   (`@chefer/utils`, shared with the shared `landingFor`/`homeCardOrder`
   pure functions), saved with `preferences.setJobs` (every tier — also
   writes the legacy `onboardingIntent` via `legacyIntentForJobs()`, so web
   and older builds still route sensibly):
   ├── Train only → gym setup first (Gym mode → Today → setup), exactly as
   │     the v1 TRAIN branch below. Food setup comes later, from Settings ›
   │     "What you use Chefer for" (`app/settings/jobs.tsx`, T-03.5).
   ├── Any food job, no Train → Diet → How you cook (+ currency/units
   │     pre-selected from the device region, CI-24, and the once-only
   │     "Plan my next week automatically every Sunday?" switch, default
   │     off, T-03.9) → Your goal (adds a "Just good food" card — no
   │     calorie target, ever, AC6) → Body metrics (optional).
   ├── Feed my household also adds "Who's at your table?" before Diet.
   ├── Train + a food job also adds "Which days do you train?" before Diet
   │     (weekday chips + a per-day Lift/Run/Long run row via
   │     `training.setDayKinds`, T-03.9) and, once a numeric goal is chosen,
   │     "Your targets" (T-35.3's TargetsCard) before the gym hand-off
   │     (`/gym/setup?from=onboarding&days=…` — the wizard passes the query
   │     params; consuming them to pre-fill steps 1/4 is L-GYM's setup-
   │     wizard, not yet wired as of this wave).
   ├── Track what I eat (alone) → Diet → Goal → Body metrics → Your targets
   │     — How you cook only joins the chain when a food-plan job was also
   │     chosen (T-03.7). Ends on the tracker home (the ring first, D20).
   └── Finish saves everything through the free-for-every-tier granular
         procedures (`updateSafety`, `saveProfileBasics`, `mealPlan.setShape`,
         `setDisplayPreferences`; premium also `updateTargets` for cuisine)
         and fires a background `mealPlan.generate` for every food path,
         gated by the AI consent sheet for premium accounts only
         (`useAiConsent('meal-plan', …)` — declining never blocks
         onboarding, it just skips generation this session).
   v1 (web, until T-03.6) — "What brings you here?", asked while
   ChefProfile.onboardingIntent is null, saved with preferences.setIntent:
   ├── Eat better (EAT_BETTER) → the tier's food wizard, unchanged
   │     (free: diet → goal → metrics; premium: goal → metrics → diet → cuisine)
   ├── Feed my household (HOUSEHOLD) → "Who's at your table?" (add members,
   │     free) → the food wizard
   └── Train (TRAIN) → gym setup first (web /gym/setup; mobile Gym mode →
         Today → setup). Food setup comes later: re-opening /onboarding skips
         the question and runs the food steps.
         T-03.4: a Train + a food job hands off with
         `/gym/setup?from=onboarding&days=0,2,4` (weekday indices, Mon = 0) —
         `setup-wizard.tsx` reads this via `useLocalSearchParams`, pre-fills
         step 1 (day count = the weekdays given) and step 4 (those weekdays
         ticked), and opens straight at step 2; its back button then returns
         to onboarding instead of the now-skipped step 1. Train-only (no
         params) opens at step 1 exactly as before (UX-03 AC2/AC3). The
         reminder toggle (step 4) is still asked either way (protects D3).
   Skip still works on every step (mobile's jobs step: "Just looking
   around" saves `jobs: ['PLAN_MEALS']` and lands on Food Today directly —
   every later mobile step is already independently optional, so Continue
   alone finishes it; web "Skip this question" continues with the solo
   flow). The premium wizard no longer asks "How many people are you
   cooking for?" — the household is the one people model (F-PM-8).
   Step counter (both platforms, shared `onboardingProgress`): while the
   jobs/intent question is on screen it reads "Step 1" with no total and an
   empty bar — the answer changes the total, so it never reads "1 of 4" and
   then "2 of 5"; from step 2 on it is "Step N of M" with a percentage.
```

Admins can additionally create users via `user.create` (admin-only).

---

## 3. User Login Flow

> **Status:** Implemented.

```
1. User fills in LoginForm at /(auth)/login
   └── email + password (react-hook-form + Zod)
2. auth.login (public tRPC mutation, rate-limited 10/15 min per IP)
   └── AuthService.login
        ├── prisma.user.findUnique by normalised email
        ├── bcrypt.compare — identical UNAUTHORIZED for wrong email
        │   and wrong password (no account probing)
        └── createSession → chefer_session cookie
            (HttpOnly, SameSite=Strict, Secure in prod, 30 days)
3. Client router.push('/dashboard')
```

Sessions are DB rows (`sessions` table), not JWTs — resolution is a lookup on
every request (see §4), and logout / password reset delete the rows.
"Forgot password?" on the form (web and the mobile Sign in screen) starts the
reset flow (§11). Both platforms' forms have a Show/Hide password toggle; the
register forms also require a matching confirm-password field (client-side
only — the API takes one `password`).

---

## 4. Session & Authorization Flow

> **Status:** Implemented — DB-backed sessions resolved from the
> `chefer_session` cookie (web) **or** an `Authorization: Bearer <sessionToken>`
> header (native mobile). Both carry the same DB `Session` token; resolution is
> shared via `lib/session-auth.ts` across tRPC and the non-tRPC endpoints.
> Mobile obtains the token from the `auth.login`/`auth.register` response body,
> which includes `session: { token, expires }` only for requests sent with the
> `x-chefer-client: mobile` header; browsers never receive the token in a body.

**How the API resolves the current user on every request:**

```
Incoming HTTP request
  │
  ├─ requestIdMiddleware → attaches X-Request-ID
  │
  └─ tRPC adapter → createContext()
        │
        ├─ Read cookie: chefer_session (web)
        ├─ OR read header: Authorization: Bearer <sessionToken> (mobile)
        │
        ├─ Look up the Session row (cookie wins when both are valid)
        │
        └─ Set ctx.user (null if unauthenticated)
              │
              └─ Procedure middleware checks ctx.user:
                    publicProcedure    → always allowed
                    protectedProcedure → requires ctx.user != null
                    premiumProcedure   → requires planTier === 'PREMIUM' OR role === 'ADMIN'
                    adminProcedure     → requires ctx.user.role === 'ADMIN'
```

**How the web app handles an expired or deleted session:**

```
Browser still holds a chefer_session cookie whose row is gone
  │
  ├─ Navigate to /dashboard
  │     ├─ middleware.ts sees a cookie value → allows the request through
  │     └─ Client queries fire → API returns UNAUTHORIZED
  │           └─ QueryCache/MutationCache onError (lib/trpc.ts)
  │                 └─ window.location.replace('/login?from=…')
  │
  └─ Navigate to /, /login or /register
        └─ getSessionUser() calls auth.me
              ├─ user  → redirect('/dashboard')
              └─ null  → render the page (login form is reachable)
```

The stale cookie is not explicitly cleared — server components cannot modify cookies
during render. A successful login overwrites it via `Set-Cookie`.

**Role capabilities:**

| Role              | What they can do                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (unauthenticated) | `auth.register`, `auth.login`, `auth.requestPasswordReset`, `auth.resetPassword`, `auth.me`                                                               |
| USER              | All protected procedures: `user.me`, `user.update` (own), `user.deleteSelf` (own, password), `user.grant/revokeAiDataConsent`, plans, recipes, tracker, … |
| MODERATOR         | Same as USER (moderation capabilities reserved for future)                                                                                                |
| ADMIN             | Everything, incl. `user.list`, `user.getById`, `user.create`, `user.delete`, `user.update` (any user); treated as premium by `premiumProcedure`           |

---

## 5. View User Profile Flow

> **Status:** Removed 2026-08-21 (roadmap P0-2). The `/user` dev scaffold rendered the first
> account's name and email to anonymous visitors and was deleted. `user.getById` became a
> `protectedProcedure`, then admin-only on 2026-09-25 (audit F-ADM-1-1: any signed-in user could
> read any account's email). Authenticated users see their own data via `user.me` on `/profile`.
>
> **Your data (audit P0-6, 2026-09-25):** `/profile` (web) and Profile (mobile) offer **Download / Export my data** (`user.exportData`, JSON) and **Delete account** (`user.deleteSelf`: re-enter password + type DELETE; deletes the user's own recipes and everything that cascades, then signs them out). The mobile app links Terms, Privacy and Support from More and Terms/Privacy from the register screen. Full flow: §24 (deletion) and §25 (AI consent).

---

## 6. User Management (Admin) Flow

> **Status:** tRPC procedures implemented. Admin UI not yet built.

### List Users

```
adminProcedure user.list
  Input: { page, limit, search?, role?, sortBy, sortOrder }
  │
  └── UserService.list()
        └── PrismaUserRepository.findManyWithCount()
              └── prisma.$transaction([findMany, count])
  Output: { users: User[], total: number, page, limit, totalPages }
```

### Create User

```
adminProcedure user.create
  Input: { email, name?, password, role? }
  │
  └── UserService.create()
        └── Check email not already in use
        └── Hash password
        └── PrismaUserRepository.create()
  Output: User
```

### Update User

```
protectedProcedure user.update
  Input: { id, name?, email?, role?, image? }
  │
  ├── If caller is not ADMIN:
  │     └── Reject if id != ctx.user.id (FORBIDDEN)
  │     └── Reject if role is being changed (FORBIDDEN)
  └── UserService.update(id, data)
        └── PrismaUserRepository.update()
  Output: User
```

### Delete User

```
adminProcedure user.delete
  Input: { id }
  │
  └── Reject if id == ctx.user.id (cannot delete self)
  └── deleteAccount(id)   (same full purge as §24)
  Output: { success: true }
```

---

## 7. Post Lifecycle Flow

> **Status:** Starter-template scaffolding — no router, no UI, no plans to
> build it. The `Post`/`Tag`/`PostTag` models are slated for deletion
> (roadmap §8 "explicitly out of scope"); the section below is kept only
> until the schema cleanup lands.

**Planned states:**

```
DRAFT ──► PUBLISHED ──► ARCHIVED
  │                        │
  └────────────────────────┘ (can archive from any state)
```

**Planned create flow:**

```
1. Author fills in PostEditor (title, content, tags)
2. POST trpc/post.create (protectedProcedure)
3. PostService.create()
    └── slugify(title) → unique slug
    └── prisma.post.create() with status: DRAFT
4. Redirect to post edit page
```

**Planned publish flow:**

```
1. Author clicks Publish on a DRAFT post
2. PATCH trpc/post.publish (protectedProcedure)
3. PostService.publish(id)
    └── Check caller is the author (or ADMIN)
    └── prisma.post.update({ status: PUBLISHED, published: true, publishedAt: now() })
```

---

## 8. API Request Lifecycle

Every call from the frontend to the API follows this path:

```
Frontend (Server or Client Component)
  │
  │  HTTP POST /trpc/<procedure>  (batched by tRPC)
  ▼
Express Server (apps/api, port 3001)
  │
  ├─ CORS check
  ├─ JSON body parse
  ├─ requestIdMiddleware (X-Request-ID)
  │
  └─ tRPC adapter
        │
        ├─ createContext()
        │     ├─ Resolve ctx.user from cookie/header
        │     └─ Resolve ctx.clientApiLevel from x-chefer-api-level (§2.8, T-00.8;
        │        absent = 0). Not enforced yet — HEALTH_CONSENT_ENFORCE stays "off"
        │        until wave 1 (T-26.1). profile.flags (public) exposes FEATURE_FLAGS
        │        separately, read once by clients and cached like profile.aiProviders
        │
        ├─ timingMiddleware (logs duration in dev)
        │
        ├─ [if protectedProcedure] isAuthenticated middleware
        ├─ [if adminProcedure]     isAdmin middleware
        │
        ├─ Zod input validation
        │
        └─ Router handler
              └─ Service method
                    └─ Repository method
                          └─ Prisma → PostgreSQL
                                └─ Response serialised with superjson
                                      └─ Returned to frontend
```

### Error Handling

| Source                       | How it surfaces                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Zod validation failure       | tRPC `BAD_REQUEST` with field-level errors                                                                    |
| `UserNotFoundError` (domain) | Mapped to tRPC `NOT_FOUND`                                                                                    |
| Unauthenticated access       | tRPC `UNAUTHORIZED`                                                                                           |
| Insufficient role            | tRPC `FORBIDDEN`                                                                                              |
| Unhandled exception          | tRPC `INTERNAL_SERVER_ERROR` — captured to Sentry (with tRPC path, request ID, user ID) and logged to console |

---

## 9. Premium Tier & Meal Plan Generation Flow

Users have a `planTier` (`FREE` by default, `PREMIUM` after upgrading). Admins are treated as premium everywhere.

### The feature matrix (PW-1)

**What each tier gets is defined in one file: [`packages/types/src/plan-features.ts`](./packages/types/src/plan-features.ts)** (`PLAN_FEATURES`). This document intentionally does not copy the matrix — the file is the source of truth, and everything reads from it:

- **API enforcement** — `apps/api/src/lib/entitlements.ts` (`isPremiumUser` / `hasFeature` / `getLimit`) backs the `premiumProcedure` middleware, the tier branch in `mealPlan.generate`/`swapRecipe`, and the daily quotas in `apps/api/src/lib/quotas.ts`. No other API file compares `planTier` directly.
- **Web UI** — the `useEntitlement(key)` hook (`apps/web/src/hooks/useEntitlement.ts`) resolves a feature for the current user; the `UpgradeButton` dialog and `UpgradeCard` panels render their perk lists from `PREMIUM_PERK_KEYS`.

Changing a limit or moving a feature between tiers is an edit to that one file; enforcement and marketing copy follow automatically.

### Upgrade & downgrade flow (soft paywall, PW-2 — no payment integration)

```
UpgradeButton (ONE shared surface; every touchpoint passes a `source`)
  sources: sidebar, mobile-drawer, meal-plan-banner, pool-exhaustion,
           shopping-list, preferences-locked, onboarding, profile-page, swap,
           chat-quota (the widget swaps its input for the shared surface when
           the API answers with X-Chat-Quota-Exhausted; upgrading re-enables
           the chat in place)
  → capture('upgrade_prompt_shown' { source, job })
  → Sheet dialog headlined by the JOB the source unlocks, with the
    "FREE FOR NOW" terms (T-10.5) → capture('upgrade_clicked')
  → user.upgradePlan (protected) → planTier = PREMIUM
  → capture('upgrade_completed') → full cache invalidate + router.refresh

DowngradeButton (profile page, premium users)
  → sheet: "Switch back to Free?" — what you keep (plans, recipes, ratings,
    logs, workouts) and what you lose (only the Premium jobs used); "Keep
    Premium" cancels → user.downgradePlan → planTier = FREE
  → capture('downgrade_completed')

Admin (/admin/users, adminProcedure-gated)
  → user.list search + user.aiCallsToday usage → user.setPlanTier flips
    any user's tier without touching prod psql
```

**Merchandising rails (premium_plan.md §6, wave 0):**

- **`/premium` showcase page** — the full pitch at one deep-linkable URL.
  Feature cards render from `features/premium/premium-features.ts` (a registry
  file — each wave agent appends its card when its feature ships); the
  Free-vs-Premium table renders row-by-row from `PLAN_FEATURES`. Entry points
  link `/premium?source=<their source>`; the page fires
  `premium_page_viewed { source }` and its CTA keeps the ORIGIN source's
  funnel attribution (falling back to `premium-page` on direct visits).
- **Upgrade dialog v2 (source-aware)** — `SOURCE_FEATURE_PRIORITY` maps each
  `source` to the matrix keys the user was looking at; those perks render
  first and expanded, the rest collapse to compact rows. The dialog links to
  `/premium` preserving its source.
- **Nudge frequency cap** — every contextual nudge must render through
  `useNudge(source)` (`features/premium/lib/nudge-cap.ts`): max one nudge per
  day across all sources, dismissal silences that source for 7 days
  (localStorage). No fake urgency, no countdowns.
- **Live nudges (§6.5, via the shared `UpgradeNudge` component)** —
  `post-rating` (free user saves a rating → "Premium turns your ratings into
  next week's menu") and `monday-nudge` (free user opens a plan-less current
  week on a Monday). Mounting counts as the impression:
  `upgrade_prompt_shown { source }`; the CTA deep-links to `/premium`.
- **Onboarding carousel (§6.6)** — the free flow's final (body metrics) step
  renders `UpgradeCard perkDisplay="carousel"` beneath the optional form: the same feature-card
  registry as `/premium`, horizontally scrollable, plus the comparison-table
  link. Source stays `onboarding`.

**A paywall that names the job (UX-10, L-MONEY wave 2, mobile + web):**

- **One pitch registry.** `premiumPitchFor(source, { jobs, flags, context })`
  (`packages/utils/src/premium-pitch.ts`) maps every upgrade `source` to the
  job it unlocks — headline, lede and at most three bullets — and is the only
  place paywall copy lives (web dialog, `/premium` hero, mobile sheet, Profile
  "What you have"). A bullet whose feature is not live (`feature: 'planned'`,
  or a `PLAN_FEATURES` tier that does not grant it, or a flag that has made it
  free) is never rendered. A user whose jobs include Train gets the gym-first
  default (`Food that fits your training week`) on a default source; the gym
  itself is never pitched as Premium (D-11). `ingredient-autofill` is the
  source behind "Fill in for me" on the custom-ingredient sheet (T-40.11).
- **Terms on every open.** The sheet/dialog shows the FREE FOR NOW paragraph
  (`Premium costs nothing for now, and we won't ask for a card. Before it has a
price, we'll tell you in the app at least 30 days ahead and you choose
whether to keep it. Nothing changes automatically.`) — never "beta" (App
  Review 2.2) — and carries no price, currency, checkout or purchase link on
  any platform (App Review 3.1.1): "Turn on Premium" is the same free
  `user.upgradePlan` toggle.
- **Mobile mechanics.** `openPremium(source)` (`apps/mobile/src/features/premium/
open-premium.ts`) opens the sheet in a `PremiumHost` (the root layout mounts
  one; a Sheet that can open Premium mounts its own nested one). Locks are
  `LockedFeatureCard`s or inline buttons and never replace a screen: recipe
  import keeps its form on free with `Or type it in yourself` (pasted content
  survives the sheet); pantry `Plan my week around these`; training-day `Fit
meals to my training days`; household and the AI chef open their job.
  Success shows `Premium is on`, what you now have and the job's next step —
  for a household with members that is `Scale next week to {n} portions`
  (AI consent first, then `mealPlan.generate({ weekOffset: 1, keepPinned })`).
- **Snap taste (B-35).** On a free plan the Snap card is a labelled static
  example + `See what Premium adds` (source `snap-scan`) for users with a food
  job; a gym-only user, and a user whose jobs are still unknown, never see it.
  It sends nothing, so it asks no AI consent (the real scan still does).
- **Profile › Plan & Premium.** `Your plan: Free` (what Free includes) +
  `See what Premium adds`, or `Your plan: Premium` · `Free for now` · `What you
have` · `Switch back to Free`. The downgrade sheet names what you keep and
  lists only the Premium jobs this user has used (`downgradeLosses`); cancel
  keeps Premium.
- **Nudge cap.** All unprompted nudges go through the pure rule in
  `packages/utils/src/nudge-cap.ts` (one per calendar day, 7-day cooldown per
  dismissed source) — web `localStorage` adapter, mobile KV adapter
  (`features/premium/nudge-cap.ts`). A user-initiated open is never capped.
- **Honest allowances.** Profile › Daily AI allowances counts what
  `lib/quotas.ts` reserves (`profile.getAiUsage`, infrastructure.md §8): a plan
  from our recipes uses no AI (free cap 3/day, `curatedPlans`); a Premium
  generate is ONE AI reservation (`aiMealPlans`, its instant curated week is not
  a second count); `mealPlan.resumeTailoring` reserves nothing; an import's AI
  cost is the preview (counted when read), and `importsSaved` says how many
  ended as a saved recipe. No copy says curated plans are unlimited (Q-18).

The `source`-tagged events are the input to the PW-3 funnel (prompt → click →
complete conversion by touchpoint). PW-3 adds per-feature usage events
(`plan_generated`, `meal_swapped`, `chat_message_sent`,
`shopping_list_regenerated`, `preferences_saved`, `recipe_rated`,
`recipe_pinned`, `pool_exhausted`) and a `planTier` person property on
identify — the full dictionary and the one-time PostHog/Sentry dashboard
setup live in [`docs/analytics-funnel.md`](./docs/analytics-funnel.md).

### Weekly plan generation

`mealPlan.generate` is available to both tiers — the behaviour branches in `MealPlanService`:

```
mealPlan.generate { weekOffset }
  │
  ├─ FREE user
  │    ├─ ensureCuratedRecipes()          (idempotent upsert of the 64-recipe pool)
  │    ├─ safeCuratedPools(prefs)         (filter by allergies/restrictions/dislikes)
  │    │    └─ any plan meal type < MIN_SAFE_POOL_SIZE safe recipes
  │    │         → PRECONDITION_FAILED → contextual upgrade prompt in the UI
  │    ├─ random breakfast/lunch/dinner per day (shuffled cycling, 7 days)
  │    ├─ no AI call, no chef profile required
  │    └─ recipes ship with preset images (imageStatus DONE) → instant board
  │
  └─ PREMIUM user (or ADMIN) — since 2026-09-28 the INSTANT path by default
       (see "Instant week, then live tailoring" below); what follows is the
       BLOCKING AI week, still used with AI_PLAN_TAILORING=false and when the
       curated pool cannot cover the table's restrictions. Every step below
       (inputs, validation, safety) is what each tailored DAY goes through too.
       ├─ load ChefProfile + DietaryPreferences (no profile → default targets,
       │    audit F-PM-2; generation errors render inline with Try again)
       ├─ load learning signals (P1-1): pinned favourites
       │   (useInNextPlan=true) + 20 most recent MealRatings joined to
       │   recipe name/cuisine
       ├─ calorie + macro targets from resolveDailyTargets()
       │   (preferences.service — THE single source: live Mifflin-St Jeor
       │   TDEE ± goal adjustment when metrics are complete, else the stored
       │   snapshot. The dashboard ring and tracker read the same resolver,
       │   so a goal change moves all three together.)
       ├─ IAIService.generateMealPlan (Gemini) → 21 personalised recipes
       │   (prompt carries "Liked recently (4-5★)…" / "Disliked recently
       │   (1-2★)… do not repeat" / "Already booked: <pinned names>" /
       │   "Budget (hard constraint): stay under €X" when set — P2-4)
       ├─ pinned favourites REPLACE matching meal slots verbatim (exact
       │   saved recipe, meal type inferred from recent plans, spread
       │   across the week); useInNextPlan flags cleared after success
       ├─ response.personalisation { pinnedDishNames, likedCount,
       │   dislikedCount } → meal-plan page shows "Built for you from N
       │   dishes you rated and M pinned favourites"
       ├─ response.estimatedCost (every tier, also on curated plans and
       │   plan loads): week cost from the price vocabulary → cost chip
       │   on the planner; over-budget warning when it exceeds the
       │   premium weeklyBudgetEur (P2-4)
       ├─ image reuse: recipes whose name matches a previously generated
       │   DONE image are marked DONE immediately
       ├─ remaining recipes upserted as PENDING with imagePriority
       │   (0 = today) → RecipeImageWorker.wake()
       └─ worker generates up to 3 images in parallel (Pollinations, or
           Cloudflare Workers AI in prod), streaming DONE events to the
           client over SSE
           └─ never "Photo unavailable" for a pipeline problem: Cloudflare's
               daily free neurons used up (then skipped until 00:00 UTC),
               the generated image can't be stored (never regenerated), or
               the 3rd failed attempt → the dish's free deterministic
               Pollinations URL, status DONE (client loads it; not warmed).
               Only a content-policy refusal ends FAILED. On API start,
               FAILED recipes with no image are backfilled the same way.
```

### Instant week, then live tailoring (premium, 2026-09-28)

Production runs AI in free-only mode (Groq → Cloudflare fallback). A whole
AI week blocked `mealPlan.generate` for minutes (one real generation took
408 s) while the UI spun. Premium generation now returns in about a second
and the chef improves the week in the background — the week is usable from
the first moment and never gets worse than the curated one.

```
mealPlan.generate (premium, AI_PLAN_TAILORING on — the default)
  ├─ quota: ONE reservation (reservePlanGeneration), as before
  ├─ a newer generation cancels any RUNNING tailoring of this week's plan
  ├─ INSTANT WEEK = the curated builder (same as free): household safety
  │    filter, plan shape + one-off override, keepPinned, weekOffset;
  │    premium extras on top: pinned favourites placed verbatim as the
  │    user's picks (flags cleared), "cook once, eat twice" pairs dinner →
  │    next-day lunch, cost sized for the household
  │    └─ curated pool can't cover the table → the BLOCKING AI week instead
  ├─ AI data consent on file? → queue MealPlanTailoring (else the week just
  │    stays curated; clients ask for consent before a premium generate)
  │      order: planned days from TODAY on (today first, then the following
  │      days; past days untouched); next week: Monday first
  │      snapshot of each queued day as stored + the shopping ticks now
  └─ response: the full week + tailoring { status: RUNNING, tailoredDays: [],
       totalDays, currentDay, queuedDays, keptDays, canResume }

PlanTailoringWorker (DB-polled every 5 s, woken on queue; one day at a time
across all users; claims a job with a 150 s lease — survives restarts)
  per step, for the job's next day:
  ├─ plan no longer ACTIVE (regenerated / restored / deleted) → CANCELLED
  ├─ user no longer premium or AI consent withdrawn → stop
  ├─ a NEW shopping tick since generation → stop (the list being shopped
  │    must stay true)
  ├─ day changed since generation (Replace, swap, pin, portions — any slot
  │    edit) or one of its meals already logged → KEPT, no AI call
  ├─ IAIService.generateMealPlanDay (the per-day prompt the chunked week
  │    already used; "don't repeat" = the rest of the week), 60 s budget:
  │    macro reconciliation → day-total validation + one corrective retry
  │    if ≥ 15 s remain → server-minted ids → household safety pass
  │    (unsafe dish → safe curated one) → merge: locked slots (the user's
  │    picks, a leftovers dinner/lunch pair) stay, the AI fills the rest; a
  │    main the AI left out keeps its curated slot
  ├─ compare-and-set write: only if the day still equals its snapshot and
  │    the plan is still ACTIVE (else KEPT) → recipes upserted, images
  │    queued at the day's priority
  ├─ capacity/quota error → keep the curated day, back off 30 s → 60 s and
  │    retry the same day; any other failure or the budget blown → that
  │    day stays curated (failed) and the chef moves on
  └─ 3 consecutive failures, or queue empty:
       DONE    nothing left undone (kept days count as done)
       PARTIAL stopped early with ≥ 1 day tailored
       FAILED  stopped before any day was tailored

"Tailor the rest" — mealPlan.resumeTailoring { planId } (PARTIAL/FAILED):
  re-queues ONLY untailored days (the stopped queue + failed days, from
  today on) with fresh snapshots; premium, AI consent, plan still current,
  capped at 3 per plan. No new quota reservation: it finishes the generation
  the user already paid for; the cap keeps it from becoming a free loop.
```

**Leftovers decision.** Pairing is cross-day (Monday's dinner is Tuesday's
lunch), which cannot be tailored one day at a time without breaking pairs
or rewriting a day the job isn't on. So the pairing is made on the instant
week and both halves of each pair are _locked_ like the user's picks: the
chef tailors every other slot, and a pair can never break mid-week.

**Clients (web + mobile).** The Plan screen polls `mealPlan.getForWeek`
every 3 s (`PLAN_TAILORING_POLL_MS`) only while `tailoring.status` is
RUNNING and the screen is visible/focused, and stops otherwise. It shows
"Your chef is tailoring your week · N of M days" with a determinate
progress bar, marks each day chip ✓ tailored / in progress / waiting (with
screen-reader labels), fades a replaced day's meals in with "updated by
your chef", confirms "Your week is tailored" briefly when it watched the
job finish, and on PARTIAL/FAILED says "Tailored N of M days — the rest are
from our recipe collection" with **Tailor the rest** (premium, consent-
gated). Copy and state rules are shared (`@chefer/utils` plan-tailoring).
Shipped mobile builds that ignore `tailoring` get the curated week
instantly and see tailored days on their next refetch. Free users are
unchanged (curated, no tailoring).

### "How you cook" plan shape (§2.3, T-07.1/T-07.2, persona-study wave 1)

Which meals to plan, which days, an optional prep+cook time cap (with a
weekend exemption) and "cooking for 1 or 2" — set once via
`mealPlan.getShape`/`setShape` (persisted on `DietaryPreferences`; `[]`
stored is the legacy sentinel, so a user who never opens the settings form
keeps today's week: breakfast/lunch/dinner, every day, no cap). Both
`mealPlan.generate` calls read it, merged with an optional one-off `shape`
override for that call only (never persisted) — the "Plan this day" action
sends `{ days: [d] }`, for example.

```
FREE generation now honours the shape:
  ├─ only the chosen meal types are planned each chosen day
  ├─ a day outside the chosen days is returned unplanned
  │    (`meals: []`, `planned: false`) rather than filled
  ├─ a time cap filters each meal type's candidates; a recipe whose
  │    prepTimeMins + cookTimeMins is 0 ("unknown") fits any cap but
  │    ranks after known-fast recipes (owner feedback Q-35)
  ├─ "cooking for 2" sets every planned slot's portion to 2 directly
  │    (a flat multiplier — separate from the calorie-driven P1-1
  │    portion, and from premium household scaling)
  ├─ an explicit shape with Snacks off never adds an opportunistic
  │    snack (the legacy/no-shape path still tops up automatically)
  ├─ a day that can't fill a wanted slot reports
  │    `unfilled: [{ slot, reason: 'time'|'pool' }]` — present only
  │    on the response that generated the plan (no schema column
  │    yet to persist it for a later read)
  └─ pool exhaustion (PRECONDITION_FAILED) is checked only against
       the meal types the shape actually wants — a "dinners only"
       shape is no longer blocked by an empty breakfast pool

PREMIUM generation: an explicit `shape` override narrows the AI week to
  the requested days/slots post-hoc; without an override, premium
  generation is unchanged this wave (it does not yet read the stored
  shape automatically — a follow-up).
```

**Plan just one day (`mealPlan.planDay`, wave-1 L-PLAN, UX-07 "Plan this
day").** Until this wave, the only way to add a day that the shape leaves
unplanned was `generate({ shape: { days: [d] } })` — which, because
`generate` always calls `createPlan` fresh, silently rewrote the WHOLE plan
document, not just that day. `mealPlan.planDay({ planId, dayOfWeek })` fills
one currently-unplanned day (`meals: []`) of an existing plan in place — every
other day is left byte-for-byte untouched (`MealPlanRepository.setDayMeals`,
a full-day write, as opposed to `updateDayMeal`/`setDayPortions`'s single-slot
patches) — and returns the whole updated `WeekPlanDto` so a client can
`setData` it exactly like a `generate` response. It always uses the curated,
zero-AI-cost picker (the same engine the free tier's `generate` uses)
regardless of the caller's plan tier, since filling one day doesn't warrant a
full AI-personalised regeneration; it is reserved against the same
`AiCallType.CURATED_PLAN` daily quota `generate`'s free path uses. `CONFLICT`
if the day already has meals (Replace/Regenerate own changing an existing
day), `PRECONDITION_FAILED` with the same `PoolExhaustedCause` pool-exhaustion
signal as `generate` (T-10.4) if the curated pool can't cover the day's
shape. Mobile's "Plan this day" link (below) now calls it directly instead of
opening Plan settings; web's own unplanned-day line (T-07.6, below) does too.

`DayPlanDto.planned` used to be reliable only on `generate`'s own response —
a plain reload always omitted it, so the "Plan this day" CTA only ever
appeared right after generating, never after a refresh. `assemblePlanDto`
(the one read path behind `getActive`/`getForWeek`/`getById`) now recomputes
it from the user's CURRENT stored shape on every read: an empty day
(`meals: []`) outside today's chosen days is `planned: false`, and a day that
already has meals is never relabelled even once the shape later excludes it.

**Your picks survive regeneration (T-07.4).** A meal chosen via `replaceRecipe`
is marked `pinned` ("Your pick") and keeps its portion (bug T-BUG-X2/T-08.5:
it used to always reset to 1×). `mealPlan.setSlotPinned` toggles the pin
without touching the recipe. `generate({ keepPinned: true })` re-applies the
replaced plan's pinned slots onto the new week when the day/slot type still
exists and the dish still passes the safety filter, and reports how many
couldn't be kept as `droppedPinned`.

**Regenerate Undo (T-08.3).** Both generation paths return `previousPlanId`
(the same-week plan the call replaced) so a client can offer `Undo` via the
existing `mealPlan.restore({ planId: previousPlanId })`. A PREMIUM
regeneration additionally returns `premiumChanges { lines[], targetHits,
missDays }` — kind-aware summary lines plus an honest day-on-target count
(T-10.7, "What Premium changed").

**Swap/Replace Undo (T-08.5/T-08.6).** `replaceRecipe` and `swapRecipe`
(both tiers) return `previousRecipeId` so a client can undo by calling the
same mutation back to that id. This wave's AI-swap default is commit +
Undo — no separate preview procedure.

**Honest AI-usage counters (T-10.8, bug B-49).** A FREE (curated) generation's
daily-cap reservation now logs `AiCallType.CURATED_PLAN` instead of
`MEAL_PLAN` — the cap still works the same way, but a curated week no longer
counts toward "AI usage" totals.

**Mobile UI for the above (T-07.3/T-07.5, T-08.1–T-08.6, T-08.10, T-10.4 —
persona-study wave 1, `feat/ux-now/plan-mobile`).** `app/(food)/meal-plan.tsx`

- new `src/features/meal-plan/how-you-cook-form.tsx` /
  `plan-settings-sheet.tsx` now surface all of the above:

* **Default week (bug B-13/CI-13).** Plan and Shop both default to next
  week from Friday 15:00 to Sunday 23:59 local, otherwise this week
  (`defaultWeekOffset`, `@chefer/utils/week-default.ts`) — a dismissible
  line explains the weekend default. Both screens' Monday-of-week math is
  the same shared `getWeekStartDate`, replacing two independent copies.
* **Plan settings.** The empty week names the shape (`planShapeSummary`/
  `planButtonLabel`) and a header "Plan settings" button opens the shared
  `HowYouCookForm` (also used by the settings sheet); saving with an
  existing plan for the week routes into the regenerate confirm below,
  never regenerating silently.
* **Regenerate is visible, asks first, and is undoable.** A `Regenerate`
  button sits under the day chips; it opens a `ConfirmSheet` with a "Keep
  the N meals you chose" switch (shown only when pinned picks exist), and
  the success snackbar offers `Undo` → `mealPlan.restore(previousPlanId)`.
* **Pin/unpin.** A bookmark toggle next to each meal's Replace action calls
  `mealPlan.setSlotPinned`; a pinned slot shows a "Your pick" badge
  (`plan-meal-card.tsx`).
* **Undoable Replace/AI swap.** Both show a "Swapped to X" snackbar with
  `Undo` back to `previousRecipeId`.
* **Replace picker filter (bug B-50).** `recipe-picker-sheet.tsx` narrows
  candidates with `filterReplaceCandidates` (`@chefer/utils/recipe-
picker.ts`) — a pure stand-in for the server-side, safety-aware
  `recipe-access.ts` version another lane is shipping (same signature;
  swapped in at integration) — so the meal being replaced is never
  re-offered and the list is filtered to the slot's type.
* **Pool-exhaustion cause (T-10.4).** Reads `error.data.poolExhausted`
  defensively (not wired through `trpc.ts` on this branch yet), falling
  back to today's generic message.
* **Plan this day (wave-1 L-PLAN).** The unplanned-day line's "Plan this
  day" link now calls `mealPlan.planDay({ planId, dayOfWeek })` directly
  (it used to open Plan settings) and shows a "{Day} planned." success
  snackbar — `setData`, not refetch, same as Regenerate.
* **Web parity:** landed wave-1 `feat/ux-now/plan-web` (T-07.6/T-08.9) —
  see below.

**Web UI for the above (T-07.6/T-08.9 — persona-study wave 1,
`feat/ux-now/plan-web`).** `app/(dashboard)/meal-plan/page.tsx` and
`app/(dashboard)/shopping-list/page.tsx`:

- **Default week (bug B-13).** Both pages default via the shared
  `defaultWeekOffset`/`getWeekStartDate` (`@chefer/utils`), not always
  `weekOffset = 0`; Plan's week nav now always writes `?week=` explicitly
  (deleting it on 0 used to make the next render recompute the default and
  jump back to next week instead of staying on "this week").
- **Plan settings.** New `PlanSettingsSheet.tsx` (reuses `plan-shape.ts`) —
  which meals/days, time cap + weekend exemption, cooking for 1/2, premium
  leftovers option, live summary; a header "Plan settings" button opens it
  and saving with an existing plan for the week routes into the regenerate
  confirm below, never regenerating silently. The empty-week CTA names the
  job via `planButtonLabel` ("Plan 4 dinners" vs "Plan my week").
- **Plan this day.** An unplanned day (`planned: false`, in both the
  mobile-first day view and the desktop week grid) says why and offers
  "Plan this day" via `mealPlan.planDay`.
- **Regenerate is visible, asks first, and is undoable.** Once a plan
  exists, the nav bar's Regenerate opens a confirm `Sheet` with a "Keep the
  N meals you chose" switch (only when picks exist); the success Toast
  offers `Undo` → `mealPlan.restore(previousPlanId)`. An empty week's own
  CTA still generates directly (nothing to lose).
- **Pin/unpin.** A bookmark toggle on `MealCard` (row and grid variants)
  calls `mealPlan.setSlotPinned`; a pinned slot shows "Your pick".
- **Undoable Replace/AI swap.** Both show a "Swapped to X" Toast with
  `Undo` back to `previousRecipeId` (`ReplaceMealSheet`'s new `onChanged`
  callback).
- **Replace picker filter (bug B-50).** `ReplaceMealSheet.tsx` narrows
  candidates with `filterReplaceCandidates` (`@chefer/utils`) the same way
  mobile's picker does — T-08.10: switch to `recipe-access.ts`'s
  server-side version at integration.
- **Pool-exhaustion cause (T-10.4).** Reads `error.data.poolExhausted`
  defensively, same as mobile.
- **Price ranges, no savings chip.** The Plan week-cost badge and Shop's
  "Est. total" both show `formatPriceRange`, not a point number; Shop's
  "Saved ~X this week" chip is removed (bug B-33, until savings can be
  itemised).
- **Partial pantry coverage (bug B-24) — web ONLY so far.** A pantry row
  with less than a line's needed amount shows "You have {haveQuantity} of
  {need} · Buy {remaining}" per item; mobile's Shop screen doesn't have this
  yet (`mobile_parity_backlog.md`, 2026-09-28).

### Weekly auto-generation (PW-5; free curated weeks since P2-5)

```
WeeklyPlanWorker (hourly tick; acts Sundays ≥ 08:00 UTC)
  ├─ eligible: planTier = PREMIUM AND complete chef profile
  │            AND ChefProfile.autoPlanWeekly ("Plan my week every Sunday")
  │            AND users.aiDataConsentAt IS NOT NULL (App Store 5.1.2(i), §25)
  │            — premium users without consent are skipped (counted +
  │            logged: "skipped N premium user(s) without AI data consent");
  │            no curated stand-in, they are asked on their next Generate
  ├─ next week already planned?
  │    ├─ untouched CARRY_FORWARD copy (no edits, no shopping ticks or
  │    │   custom items) → replaced below
  │    └─ anything else (USER, TEMPLATE, WEEKLY_AUTO, edited/shopped copy) → skip
  ├─ follows a "My weeks" template → applyTemplateToWeek (origin TEMPLATE, no AI)
  ├─ otherwise MealPlanService.generate(userId, 1, true,
  │      { origin: WEEKLY_AUTO, instant: true })  (instant only while
  │      AI_PLAN_TAILORING is on)
  │    └─ the same instant path as the Plan button: a curated week at once,
  │       tailored Monday-first by PlanTailoringWorker with ratings + pins
  │       + budget + safety per day (P1-1/P2-4); no inline AI wait, so no
  │       per-user politeness delay
  └─ Monday: dashboard.summary.weekReady { preparedAt, ratedCount } — only
       for WEEKLY_AUTO plans → "Your week is ready — built from N dishes you rated"
```

Every plan records its `origin` (audit F-PLAN-4-1/2/3): `USER` (generated,
restored or built by hand), `CARRY_FORWARD` (the lazy copy made when a new
week is first viewed), `TEMPLATE` (a followed week) or `WEEKLY_AUTO`.
Swapping a meal in a carry-forward copy (`updateDayMeal`) turns it into
`USER`, so the worker never overwrites a week the user has touched. Premium
users switch auto-planning off with `preferences.setAutoPlanWeekly` (toggle
on Preferences, web and mobile — shown on every tier since P2-5).

**Free tier (P2-5):** the same Sunday pass builds a _curated_ week (no AI) for
free accounts with the toggle on and a live session (signed in within the
session lifetime — abandoned signups don't collect weeks forever), through
`generate(userId, 1, false, { origin: WEEKLY_AUTO })`. Same skip rules
(existing week, followed template). The premium difference is that its week
learns. Curated weeks involve no AI, so free accounts are not consent-gated. Monday's email and phone notification announce both (§23).

### Viewing the plan

The generated week is presented two ways, chosen by viewport rather than by any
user setting:

```
/meal-plan
  │
  ├─ ≥ lg (1024px)   7-column week grid — the whole week at once
  │
  └─ < lg            Single-day view
       ├─ horizontal day picker (Mon–Sun), today selected by default
       ├─ that day's meals as full-width row cards + day totals
       └─ selected day is held in the URL as ?day=N, alongside ?week=N,
          so back/forward/refresh return to the day being viewed
```

A 7-column grid needs ~900px, so on a phone it showed roughly a third of one
column and reaching Sunday meant scrolling sideways through the whole week. The
single-day view is a different information architecture, not a scaled-down grid.
`/history/[planId]` renders the same component in read-only mode. Mobile has
the same read-only detail (`app/history/[planId].tsx`: day chips, meals open the
recipe) and adds Restore there; on both mobile screens Restore asks first
(`ConfirmSheet`) and only the row being restored shows a spinner.

### Meal swap

`mealPlan.swapRecipe` — premium: AI-generated alternative; free: random curated recipe of the same meal type (excluding the current one). A free swap of a portioned slot (P1-1) sizes the new dish to the old slot's calories; an AI swap resets the slot to 1× (`replaceRecipe` below keeps the current portion — T-08.5/T-BUG-X2). A curated free day can hold two snacks: every per-slot action (swap, replace, rebalance and its undo) names the slot by its index in the day, so the second snack is swapped on its own. Today's next-meal card, Later today and the read-only history grid show both snacks. **Undo (T-08.5/T-08.6):** the response gains `previousRecipeId?` — the client can undo by calling the same mutation back to that id; this wave's AI-swap default is commit + Undo, no separate preview procedure.

### Week templates — "My weeks" (4-week rotation)

Users save refined weeks as named templates (`mealPlan.saveAsTemplate`, max 4 — CONFLICT beyond) and switch between them by hand. `followTemplate` marks one followed (at most one) and applies it to the chosen week immediately (the existing plan for that week is archived); from then on carry-forward clones the followed template instead of the latest plan, so the followed week repeats indefinitely. `renameTemplate` / `deleteTemplate` / `unfollowTemplate` manage the set. Templates are `MealPlan` rows with `isTemplate=true`, invisible to week/active/history queries. All tiers, zero AI. UI: the **My weeks** page (web `/my-weeks`, mobile `my-weeks` screen; both reached from More and from the Plan tab) — saved weeks on top, past weeks below (`pastWeeks` in `@chefer/utils`: past weeks only, one card per week preferring the ACTIVE copy then the newest, newest week first — audit F-PLAN-6-3). It replaces History (web `/history` and mobile `history` redirect to My weeks; the read-only `/history/[planId]` view stays). Copy (F-PLAN-5-3): "Save a week you like and reuse it. The week you follow repeats each week until you switch." — nothing rotates automatically.

### Week carry-forward

Plans continue week to week until changed: `mealPlan.getForWeek` for the current or next week, finding no plan, copies the followed template (if any — see "My weeks" above) or else the user's most recent plan into that week (a real plan row — shopping list, tracker and swaps work on it unchanged; the source week is never touched) and returns it flagged `carriedOver: true` once, which both clients render as a "Continued from your last plan" badge. Past weeks never materialize. "Regenerate Week" still replaces the copy, so opting out is one tap. The product intent: refine one good week and keep living it, tailoring meals via the picker below.

### Meal replace (picker)

`mealPlan.replaceRecipe` — any tier, no quota: sets a meal slot to a specific recipe the user chose. On mobile this is the primary per-meal action: the Plan tab's replace button opens a bottom-sheet picker (own + favourited recipes first, searchable) with an AI-regen footer (premium, calls `swapRecipe`). Web exposes `replaceRecipe` only via the tracker rebalance banner so far — meal-plan picker port pending (see `mobile_parity_backlog.md`). **Your pick survives regeneration (T-07.4):** the slot keeps its current portion (bug T-BUG-X2/T-08.5 — it used to always drop to 1×) and is marked `pinned` ("Your pick"); `mealPlan.setSlotPinned` toggles the pin without touching the recipe, and `generate({ keepPinned: true })` re-applies pinned slots onto a freshly generated week when they still pass the safety filter (`droppedPinned` reports how many didn't). The response also gains `previousRecipeId?` for `Undo`.

**Safety on Replace (B-34/B-46, T-00.11).** The picker is a search over `recipe.list`, not the safety-filtered curated pool, so before this hotfix a user could Replace into a recipe that conflicted with their (or their household's) allergies or dietary restrictions with no check at all:

- `recipe.list({ forTable: true })` drops rows that fail the merged household safety check (`isRecipeSafe` — same matcher as `safeCuratedPools`/`filterSafeRecipes`) before the client ever sees them. Both pickers' broader/curated query passes it; each picker's "my recipes" query does not, on purpose — a user's own recipe can still be picked even if it now conflicts (e.g. an allergy added after the recipe was written), so the acknowledge path below has something to act on.
- `replaceRecipe` itself re-checks the picked recipe regardless of which query it came from, and rejects an unsafe one with `FORBIDDEN` (`UNSAFE_FOR_TABLE: …` naming the conflicting allergen/restriction) unless the caller sends `acknowledgeConflict: true` **and** the recipe is the user's own `MANUAL` recipe (never for curated/AI or someone else's). Both the mobile picker and the web `ReplaceMealSheet` show the rejection and, only for the user's own recipe, an inline "Use anyway" that retries with `acknowledgeConflict: true`.
- The chat tool `whatCanIMake` (pantry, F3) had the same gap — it ranked the curated pool and the active plan's recipes by pantry coverage with no safety filter, so a perfectly pantry-matched but unsafe dish could top the answer. It now filters both sources through the same merged safety check before ranking.

### Shopping list & ingredient price vocabulary

**Shopping state survives plan changes** (audit F-SHOP-2-1, F-PLAN-6-1): check-offs and custom items are stored per plan, so `MealPlanRepository.createPlan` copies them from the same-week plan it replaces (regenerate, follow a template) onto the new plan. History **Restore** re-creates the old plan as the newest row for its week, archiving only that week, and brings that plan's own ticks and custom items back.

```
shoppingList.getForWeek { weekOffset }
  |
  +- persisted AI list exists for the plan? -> serve it (aiGenerated: true),
  |    tidied by the same rules (tidyListItems + local aisle map)
  +- else aggregateIngredientLines (shopping-list/aggregate.ts):
  |    canonical name (Egg = Eggs, "Fresh parsley" = parsley, parentheticals
  |    dropped) + unit family (g/kg/oz/lb together, ml/l/tsp/tbsp/cup
  |    together, count units only with the same unit); mixed units are summed
  |    and shown in the unit that contributed most. Water, ice, "to taste"
  |    and bare salt-and-pepper lines are dropped (audit F-SHOP-1-1)
  +- aisle: category-map.ts — frozen/canned/dried prefixes and pantry head
  |    words (stock, sauce, paste, powder, oil, …) first, then keywords
  |    (F-SHOP-1-2); "grains" is the "Grains & Pantry" aisle
  |
  +- every item joined against IngredientPrice (store-agnostic vocabulary):
  |    estimatedPriceEur = quantity x pricePer100g / per100ml / perPiece
  |    unpriced ingredients -> IngredientPriceWorker.wake()
  +- estimatedTotalEur = sum of item estimates (minus pantry-covered lines
       for pantryPlanning accounts)

A plan made mid-week (a Friday signup, a Thursday regenerate, a copy first
opened on Wednesday) lists and prices only the days from its creation day on
(`shared/plan-window.ts`; `fromDayOfWeek` on the list, `shoppingFromDay` on the
plan, "Covers Fri–Sun" on both clients). A new user's first list used to be the
whole week — ~97 items / ~€169 for one person (audit F-PM-3).

The planner's "≈ €X this week" chip (plan-cost.ts) prices the SAME aggregated
lines, so it equals the list total unless the list adds custom items or
subtracts pantry stock (F-SHOP-1-3).

**No single precise number (UX-08 §7, bug B-33, persona-study wave 1,
mobile.)** Mobile's Plan and Shop totals now render as a rounded range
(`formatPriceRange`/`priceRange`, `@chefer/utils/price-range.ts`, ±15% of the
EUR point estimate — tuned in one place, pending V5) instead of a single
number, and the pantry "Saved ~X this week" chip on Shop is removed until
savings can be itemised (`PantryGhostBanner`'s free-tier teaser is unrelated
and stays). Web still shows a single-number total and the savings chip — see
`mobile_parity_backlog.md` (2026-09-28).

Pantry coverage (F-PAN-1-1/1-2): a line the user has ticked this week is
never "have it" (ticking seeds the pantry, which used to flip the same line
to covered and count it as saved); unticking removes that PURCHASE row again.
The matcher compares head nouns ("lemon" no longer covers "lemon juice",
"rice" no longer covers "rice vinegar"; cuts of meat still match) and a
pantry row with a known, smaller amount doesn't cover the line.

All displayed quantities (shopping list + recipe pages) are converted to the
user's preferred unit system (ChefProfile.preferredUnits, set in Preferences):
METRIC shows g/kg/ml/l (cups -> ml), IMPERIAL shows oz/lb/fl oz/cups.

All displayed prices (shopping-list lines + total, pantry savings, the
meal-plan week cost / per-person / over-budget copy, the ingredient browser)
are EUR estimates converted to ChefProfile.deliveryCurrency by formatMoney in
@chefer/utils — one static, approximate table (EUR 1, USD 1.08, GBP 0.85,
RON 4.97; EUR_EXCHANGE_RATES in currency.ts). The API stays EUR; converted
figures say "converted from euros at an approximate rate". The premium weekly
budget is typed in the user's currency and stored as weeklyBudgetEur.

shoppingList.regenerate { weekOffset }   (PREMIUM only; ticks carry over by ingredient name)
  +- Gemini consolidates raw ingredients -> persisted in ShoppingList table
     (keyed by planId) -> subsequent getForWeek calls serve it

Ingredient catalog permissions
  +- global rows (creatorId null): visible to all; edit/delete = ADMIN only
  |    (admin edits set source ADMIN -> exempt from weekly AI refresh)
  +- custom rows (creatorId set): visible/editable ONLY by their creator
  |    (hidden even from admins; others get NOT_FOUND)
  +- /ingredients page: All / My Ingredients tabs, search, add/edit/delete

Recipe creation (revamped form)
  +- ingredients.search picks from the catalog; ingredients.createCustom adds
  |    private ingredients (manual macros, uploaded or AI-generated image)
  +- ingredients.computeNutrition auto-fills per-serving nutrition from
  |    ingredient quantities (unit conversion x per-100g macros)
  +- recipe photo: device upload (POST /api/uploads/image, <=10 MB since
  |    T-BUG-O1/Q-22; the mobile app first shrinks the photo to <= 2048 px,
  |    JPEG 0.8 — T-BUG-O1.2) or deterministic AI image (recipe.aiImageUrl); a failed
  |    upload always shows one of the four UX-40 sentences (never a status
  |    code or "[object Object]") — see §15's "Error states" note and
  |    infrastructure.md §4.1.1

Synced check-off (P1-5)
  +- shoppingList.getForWeek returns checkedKeys; ticking an item calls
  |    shoppingList.toggleItems (optimistic client update, per-key
  |    add/remove under SERIALIZABLE + retry server-side) — checks made
  |    on one phone appear on the other on its next fetch
  +- pre-P1-5 localStorage checks migrate to the server once, then clear

IngredientPriceWorker (background)
  +- start + every 12 h: distinct ingredient names from ALL recipes
  +- prices missing entries, refreshes entries older than 7 days
  +- IAIService.estimateIngredientPrices (Gemini, batches of 40)
```

### Units & currency — one preference, every tier (P2-6)

```
Preferences → "Units & currency" (web preferences-form, mobile /preferences)
  └── preferences.setDisplayPreferences { preferredUnits?, currency? }   (FREE, every tier)
        ├── ChefProfile.preferredUnits / deliveryCurrency upserted
        └── units changed → gymProfileService.syncFromPreferredUnits
              └── gym profile exists and differs → gymProfileService.save({ unit })
                    (METRIC ↔ KG, IMPERIAL ↔ LB; stock rack swap + progression re-fold)

Gym settings unit switch / gym setup
  └── gym.profile.save { unit } / gym.profile.completeSetup
        └── ChefProfile.preferredUnits follows the gym unit (reverse sync;
            the forward path passes syncPreferences:false, so no ping-pong)
        └── setup's unit question defaults from preferredUnits (locale when
            the user has no profile yet)
```

- **Defaults** come from the device region at registration (see §2). Accounts created before P2-6, or from app builds that don't send a region, start METRIC + EUR and can change both freely.
- **Where units apply:** recipe/shopping quantities (`formatQuantity`), body weight on web + mobile (dashboard weight card, weight log + entry editing, /progress chart and deltas, the gym bodyweight prompt, the coach review's kg/wk trend — `formatBodyWeight` / `formatWeightTrend`) and gym loads (via the synced gym unit).
- **Body weight stays kg in the API.** IMPERIAL users type pounds; `parseBodyWeight(input, 'IMPERIAL')` accepts 44–881 lb (the API's 20–400 kg) with lb error copy and sends kg rounded to 0.1. A displayed lb value (0.1 lb) round-trips to the same stored kg.
- `preferences.updateTargets` still accepts `preferredUnits` / `deliveryCurrency` for app builds already in the stores (and syncs the gym the same way), but it is premium — current clients never send units through it.
- Not yet in the user's unit: the body-metrics step of onboarding / Goal & body (web has its own kg/lb + cm/ft toggles; mobile is metric-only v1).

### Profile personalisation gating (P1-2: safety is free)

- **Safety is free on every tier**: `preferences.updateSafety` (`protectedProcedure`) writes allergies, dietary restrictions and disliked ingredients. Free curated plans and free swaps are filtered by them (`lib/curated-recipes/safety.ts`); premium AI generation feeds them into the prompt.
- **AI output is never trusted for safety** (audit F-PLAN-1-9, 2026-09-25): after `generateMealPlan` every dish is re-checked against the household's allergies and restrictions, and a failing slot is replaced from the safe curated pool (or dropped when nothing safe fits); an unsafe AI swap falls back to a curated swap. The matcher scans name, ingredients **and steps**, and accepts qualified substitutes ("dairy-free milk", "vegan butter", "egg-free mayo", "gluten-free pasta") only for their own allergen family.
- **Warnings instead of silence**: `mealPlan.getRecipe` and every plan response carry an optional `allergenWarnings: string[]` (the viewer's conflicting allergies/restrictions). Web and mobile show a red "Contains …" banner on recipe detail and in cook mode, and a chip on plan meal cards — e.g. after allergies change under an existing plan (F-REC-2-3, F-PLAN-1-7). Mobile import now shows the same "could not fully remove" warning as web when an adaptation fails safety (F-M-REC-4-1).
- **Personalisation depth is premium**: `preferences.setup` / `preferences.updateTargets` (`premiumProcedure`) own goal, body metrics, calorie targets, cuisine, meal cadence and the weekly budget → free users receive `FORBIDDEN`. Units and currency are **not** personalisation depth: they save through the free `preferences.setDisplayPreferences` (P2-6, audit F-DASH-3-2).
- The Preferences page shows free users the editable safety section plus a locked-targets upgrade panel; the Onboarding wizard branches — free: 3 steps (safety → optional goal → optional body metrics, stored via `preferences.saveProfileBasics` with the premium pitch as a card under step 3), premium: 4 steps (goal → metrics → diet → cuisine). Both platforms start the wizard from the user's saved preferences (`preferences.get`), and `preferences.setup` never shrinks the safety lists, so re-opening onboarding after an upgrade can't erase allergies (audit F-ONB-1-1, 2026-09-25).
- **Numbers you can trust** (audit P1-1, 2026-09-26): free curated weeks are planned toward the user's calorie and protein targets, and every slot gets a **portion** (0.75×–2× of the recipe, deterministic, zero AI) so each day lands within ±10% of the calorie target — a 2,800–3,200 kcal gain goal is reachable now — with protein as close as the dishes allow (snacks added when the portioned mains still fall short). Plan cards show "1½× portion" and its kcal; day totals, the shopping list, the plan cost and the dashboard all count the portion; recipe detail and cook mode opened from the plan start at it, cook mode's "Made it!" and the tracker log it. When even 2× can't reach the protein target the day says **"Protein short by N g — add a snack"** instead of passing as on target (web + mobile). The dashboard no longer claims a meal "supports your daily nutrition goals" (F-PM-4). Premium AI plans get the protein/carbs/fat targets in the prompt, macro drift counts in the retry, and AI recipes whose stated calories don't match their ingredients are resized so the recipe delivers what it claims (bounded 0.6–1.8×; beyond that the honest computed numbers are shown).
- **Pool exhaustion is the upsell**: when the curated pool keeps fewer than `MIN_SAFE_POOL_SIZE` safe recipes for any plan meal type, `mealPlan.generate` / free swap throw `PRECONDITION_FAILED` and the meal-plan page renders a contextual upgrade prompt ("not enough free recipes matching your restrictions") instead of an error.

---

## 10. Dashboard Summary Flow

`dashboard.summary` (protected) assembles the daily overview in `DashboardService.getSummary`. Web and mobile send `{ localDate, localHour }` (the device's own day and hour, via `localDateStr` in `@chefer/utils`), so "today", the day label and the next meal follow the user's time zone; older clients without it fall back to server time (audit F-DASH-1-1). The tracker likewise sends the local calendar day, never the UTC one (F-TRK-1-1).

The "Today" card's ring shows what was **eaten** (the day's DailyLog totals: `nutrition.eatenKcal` and `protein/carbs/fat.eaten`, additive fields) against the target, with the plan as a caption ("1,870 planned · 1,200 left"); the chip judges the plan ("Plan on track / under / over target", shared `planStatus` in `@chefer/utils`). It used to show planned food only — "540 remaining" with 6,070 kcal logged (audit F-DASH-1-2).

```
dashboard.summary
  ├─ load ChefProfile + active MealPlan + recent favourites (parallel)
  ├─ join all recipe IDs across the plan's days
  ├─ load today's DailyLog (eaten totals + loggedMeals)
  ├─ nextMeal: resolveTodayMeals (@chefer/utils), by MEAL TYPE
  │    ├─ skips slots already EATEN today (audit F-PM-10): the same recipe
  │    │  was logged (Made it!, tracker, Today's "I ate this" — any meal
  │    │  type), or a custom scan/quick-add was logged for that meal type
  │    │  (not snacks: web quick-adds always land as "snack")
  │    └─ then the first meal type present in today's plan whose window is
  │       still open — MEAL_WINDOW_END: breakfast <10, lunch <14, snack <17,
  │       dinner <21. A 3-meal plan therefore surfaces dinner from 14:00
  │       (its snack window doesn't exist), a 4-meal plan surfaces the
  │       snack first.
  ├─ restOfToday: today's uneaten meals whose type sorts after nextMeal
  ├─ tomorrowFirstMeal: set when nothing is left today — every window has
  │    passed (late evening) or the rest is eaten — the first meal of day
  │    (today+1) % 7, so the hero renders a "Tomorrow" card instead of
  │    going blank or re-offering a meal already eaten
  └─ nutrition: planned kcal/macros for today vs targets
       └─ lifters only (P2-4): trainingDay + adjustedTargets (see below)
```

### Home by job, Tonight/Tomorrow and cold-start Landing (§2.4, T-03/T-04, rev 2)

`dashboard.summary` gains `planId`, `jobs` (`effectiveJobs()`) and `showNutrition`
(an explicit `ChefProfile.showNutritionOnToday` override, else the same
goal-or-tracks derivation `showNutritionCards` used, kept for older
clients) — every call, no extra cost. An opt-in `include` array adds the
heavier reads a client asks for:

```
dashboard.summary({ include: ['tonight','tomorrow','shopDue','safetyChecks','targets'] })
  ├─ tonight: today's DINNER slot specifically (not "the next open meal") —
  │    done from the log via isSlotEaten (@chefer/utils), independent of the
  │    meal-window clock. safetyChecks (include also has 'safetyChecks')
  │    decorates it read-only via SafetyService.getTable/.check — never
  │    written back into the stored plan JSON — only when the table has
  │    rules, for the Tonight hero's CheckedForChip.
  ├─ tomorrow: tomorrow's first planned meal (dinner for a dinners-only
  │    plan), always done: false — it hasn't happened yet.
  ├─ shopDue: unticked ShoppingListService.getForWeek lines whose
  │    recipeNames intersect tomorrow's planned meals — { count, sample,
  │    forDate }, null when nothing's due. (Implementation note: a
  │    **dynamic** import inside DashboardService, not a top-level one —
  │    ShoppingListService pulls in the AI module, which validates its env
  │    vars at import time, and this file has several unit tests that
  │    import pure helpers with zero env/DB mocking.)
  └─ targets: planVsTarget (today's planned kcal vs the resolved target,
       'under'|'over'|'on_target') and pendingTargetChange (the most recent
       unresolved TargetChange, read-only via TargetsService — also a
       dynamic import, same reason).
```

Mobile's Food Today (`app/(food)/index.tsx`) picks the hero card by local
moment band: 16:00–21:29 shows `TonightCard` (Cook it / Swap / "I ate
this" — the last two only when `showNutrition`); once dinner is logged it
collapses to a 56 pt "Dinner done" row and `TomorrowCard` appears under
it; 21:30 onward (or once dinner is done) shows `TomorrowCard` instead of
the existing "next up" hero, so Today never reads "NEXT UP · BREAKFAST"
late at night. `ShopDueCard` renders whenever `shopDue` isn't null.
`showNutrition` gates the ring, `WeightCard`, the profile nudge and
Snap-to-log (B-31), same rule as before, now reading the additive field.
The ring also shows a **"Your target" / "Suggested"** label
(`targetMode` from `targets.get`, §2.11, T-35.5).

**Landing (T-04.3).** `landingFor()` (`@chefer/utils`) is a pure function
over `{ jobs, persistedMode, hasGymProfile, workoutInProgress?,
isTrainingDayToday?, workoutDoneToday?, localHour?, reminderHour? }`:
a workout in progress wins over everything; else the user's own last
Food/Gym choice always wins; else Train-only (with gym set up) opens
Gym; else a planned training day not yet done from 14:00 (or 2h before
an earlier reminder) opens Gym; else Food. Mobile's cold start
(`(food)/_layout.tsx`) calls a synchronous wrapper, `landingSurfaceSync()`,
fed from a small KV-backed cache (`features/navigation/landing-cache.ts`)
that a mounted hook keeps fresh from `preferences.get`/`gym.profile.get`
for the _next_ cold start — this wave only wires the jobs/gym-setup rows
live; the workout-in-progress and training-day-time rows are implemented
and unit-tested in `landingFor` itself but not yet fed live gym state. A
landing never writes the persisted mode, and never re-applies once the
app is open (no foreground-after-30-minutes listener yet).

### Today (P2-2) — Home + Tracker in one tab

The food tab bar is **Today · Plan · Shop · Cookbook · More** on web below `lg`
and on mobile; the desktop sidebar lists the same four, a divider, then More's
items (Progress, My weeks, Profile, Preferences). Today (web `/dashboard`,
mobile `(food)/index`) shows:

```
Today
  ├─ ring: nutrition.eatenKcal against the target + macros (dashboard.summary —
  │    uses nutrition.adjustedTargets on a training day, P2-4, so server-side
  │    target changes flow straight through)
  ├─ quick log: Quick add (free, tracker.logCustomMeal) + Scan a meal
  │    (premium; free sees the demo ghost) — both refresh dashboard.summary
  ├─ next meal (nextMeal, else tomorrowFirstMeal badged "Tomorrow"):
  │    ├─ "I ate this" → tracker.logRecipe { date: local day, recipeId,
  │    │    mealType, portionMultiplier: the plan slot's portion (P1-1
  │    │    nextMeal.portion, clamped 0.5–2×; 1 when unset) } (atomic, idempotent; a premium
  │    │    log may rebalance the week) → summary refetch → the spotlight
  │    │    advances past the logged meal (resolveTodayMeals)
  │    └─ "Cook it" → cook mode (?meal=type); "Made it!" there logs too
  ├─ later today: restOfToday (uneaten meals after the spotlight)
  └─ "See full day" → /tracker (portions, past days, un-logging); the
       Tracker is no longer under More (F-PM-7) and lights the Today tab
```

The web hero card (`/dashboard`) renders `nextMeal`, else `tomorrowFirstMeal`
(badged "Tomorrow", CTA "View recipe"), else the "all caught up" empty state.

### One "this week" everywhere (B-13, T-00.15)

Plan/Shop/Today used to answer "what's my plan" four different ways: `mealPlan.getForWeek` (offset 0), `mealPlan.getActive`, `shoppingList.getForWeek` (offset 0) and `dashboard.summary` all fell back to `mealPlanRepository.findActiveWithDays` — the newest **ACTIVE** plan, from **any** week — whenever there was no plan row for the requested week. Because `archiveOldPlans` archives every other ACTIVE plan when a new one is created, "the active plan" is really "whichever week was generated most recently" — a Sunday planner who generates next week's plan first sees THAT plan on Today, Plan and Shop for the current week too, until the current week gets its own plan. All four now read the new `mealPlanRepository.findForWeek(userId, weekStart)`, which only ever matches the requested calendar week, and never fall back to "any active plan"; the existing carry-forward (continuing last week's plan into an empty current/next week, §9) is the only other source. Regression: "Sunday: only next week planned → this week is empty on Plan, Shop and Today." Each surface fires `plan_shown { surface, weekMatches }` (client-side; a no-op until the analytics transport lands in wave 1).

### B-31 interim: nutrition cards need a reason to exist (T-00.12)

`dashboard.summary.showNutritionCards` is `true` when `chefProfile.goal` is set **or** the user already tracks (logged on ≥ 3 of the last 7 days, rev 2 — a tracker keeps the ring even goal-less). A goal-less, non-tracking user gets `false`, and both clients hide `NutritionSummary` (the ring), `WeightCard`, the "Complete your profile" nudge and Snap-to-log — a ring and a weight chart against a target nobody set was meaningless, and the profile nudge and Snap-to-log both assume the same thing. Quick add stays available to everyone (it needs no goal). No schema field yet — the flag is derived fresh on every call; wave 1 persists the equivalent choice in `ChefProfile.showNutritionOnToday`.

### Cookbook, Shop, My weeks (P2-8)

- **Cookbook** (was Recipes): All (past-plan recipes) / Saved / My Recipes /
  **Discover**. Discover calls `recipe.discover` — the curated pool filtered by
  the owner's and household members' allergies and restrictions, with meal-type
  chips, a "≤ 30 min" toggle and search. Every tier, no AI; results open, save
  and cook like any recipe.
- **Shop**: "To buy" (the shopping list) / "In my kitchen" (the pantry). See §18
  for the inline "Still have these?" banner.
- **My weeks**: saved weeks + past weeks (see §9 "Week templates").
- **Ingredients** left the nav; `/ingredients` still works by URL.

### 10.1 Training-aware nutrition (audit P2-4)

Connects the gym to the food side with deterministic rules (no AI call).
The pure maths lives in `@chefer/utils` (`training-nutrition.ts`); the gym
reads live in `trainingNutritionService` (API).

**Who is a lifter:** a set-up gym profile (`GymProfile.setupCompletedAt`),
a goal, and a known bodyweight (latest `WeightEntry`, else
`ChefProfile.weightKg`). Every goal has a g/kg protein base (follow-up,
2026-09-26); only `GAIN_MUSCLE` lifters get the training-day rules.

| Rule              | Value                                                                                                                                                                                                          | Tier                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Base protein      | by goal: **GAIN_MUSCLE 1.8 g/kg**, **LOSE_WEIGHT 2.0 g/kg** (keeps muscle in a deficit), **MAINTAIN / EAT_HEALTHIER 1.6 g/kg** — replaces the goal's % split; carbs absorb the difference so kcal is unchanged | every tier — `resolveDailyTargets(profile, lifterBodyweightKg)` in dashboard, tracker, chat context, coach review and both generation paths |
| Training day      | a workout **completed** that day (any day), else a routine day **planned** for that weekday outside a training pause                                                                                           | —                                                                                                                                           |
| Training-day bump | GAIN_MUSCLE only (a cut keeps its deficit): protein to **2.2 g/kg** (+0.4 g/kg), kcal **+10%** of the base (rounded to 10, clamped 150–300); kcal not covered by protein → carbs; fat unchanged                | **premium** applies it; **free** sees the same numbers locked (upgrade source `training-day`)                                               |
| Post-workout meal | **~0.4 g/kg** protein, rounded to 5 g, 20–45 g (30 g without a bodyweight)                                                                                                                                     | every tier                                                                                                                                  |
| Premium AI week   | the routine's training weekdays + the bump go into the generation prompt (`buildTrainingDaysSection`), and the ±15%/±20% validation judges those days against the bumped targets                               | premium                                                                                                                                     |
| Free curated week | training weekdays weigh the protein shortfall double in `planCuratedWeek`, so those days pick the higher-protein combinations (usually dinner); no kcal bump                                                   | free                                                                                                                                        |

```
dashboard.summary / tracker.getDay (lifter)
  └─ trainingNutritionService.targetsForDay(profile, day, premium)
  ├─ loadLifter → lifterBodyweightKg
  ├─ resolveDailyTargets(profile, bw) → base targets (protein g/kg by goal)
  │    — the existing nutrition fields keep carrying the BASE targets,
  │      so shipped clients see no change in meaning
  ├─ GAIN_MUSCLE only: trainingDayFor(localDate, weekday)
  │    → COMPLETED | SCHEDULED | rest
  └─ trainingDay { isTrainingDay, reason, workoutName,
       kcalBonus, proteinBonus, applied, basis }            (optional)
     adjustedTargets { dailyCalorieTarget, proteinG,
       carbsG, fatG }         (optional — premium AND training day)
     (under `nutrition.` on the dashboard, top level on getDay)
```

**Clients (web + mobile, same copy):** the Today nutrition card shows
"Training day · +250 kcal, +32 g protein". Premium: the ring and macro bars
use `adjustedTargets`, with "Full Body A today · protein at 2.2 g/kg, added
to today". Free: the line is locked ("Premium adds this to today's targets")
with the upgrade button (web) or "Upgrade from your Profile →" (mobile).
Rest days and non-lifters show nothing new.

**Tracker (web `/tracker`, mobile `tracker`):** the same line in the day's
progress card, from `tracker.getDay`'s `trainingDay` / `adjustedTargets`, so
the tracker bars match Today's ring. On another day the copy says "this day"
("Full Body A planned · …, added to this day"; "Premium adds this to this
day's targets"); a past day with a finished workout counts too.

**Preferences macro preview (web + mobile):** `preferences.computeTargets`
applies the same rule, so a lifter's preview shows the protein the dashboard
will show, with "Protein set from your bodyweight (1.8 g/kg) because you
train." under it (`lifterProteinNote`). Web replaces its instant local
estimate with the server numbers once they arrive; mobile adds a protein line
under the calorie estimate in Goal & body for lifters only.

**Coach weekly review (§14):** lifters are judged against their g/kg protein
target — one line with the week's average ("Protein averaged 120 g a day, 24
g short of your 144 g lifting target (1.8 g per kg) — …"). Non-lifters get no
protein line.

**Workout summary (web + mobile, every tier):** a refuel card — "Aim for ~30 g
protein in your next meal" — linking the next planned meal (from
`dashboard.summary`, recipe page) or, offline / without a plan, the tracker's
quick add.

### 10.2 Food that follows training (UX-06, wave 3 — persona study)

**Weekday kinds.** Each weekday is `lift` (from the routine's planned
weekdays, or a workout completed that date), `run` or `long_run` (set by the
user in Gym settings › Training days & reminders or onboarding, stored on
`ChefProfile.trainingDayKinds`) or `rest`. A lift weekday always wins over a
stored kind. `TrainingNutritionService.trainingWeek` resolves them for the
plan week.

**Bumps by kind (deterministic, no AI).** `lift` keeps the protein-led bump
(§10.1). `run` and `long_run` are carb-led: kcal only (`RUN_DAY_KCAL` 8 %,
100–250; `LONG_RUN_DAY_KCAL` 15 %, 200–450), no extra protein, everything to
carbs; a long run adds an evening-before carb snack idea shown on the
previous day. **The numbers are placeholders pending dietitian review
(Q-3).** Who gets what: unwidened (default) — GAIN_MUSCLE lift days only, as
before; widened (Q-3, behind the server flag `trainingBumpFree`, off by
default) — lift for GAIN_MUSCLE / RECOMP / PERFORMANCE, run and long run for
every goal except LOSE_WEIGHT.

**Free vs premium (D-2).** The bump on Today, the tracker and the plan's day
targets is gated by `trainingDayTargets` (premium) OR the flag
`trainingBumpFree` (free). Flag off → a free user sees the same numbers as a
locked preview and the target does not move. `trainingNutrition` (premium)
means "Fit meals to my training days" — the AI/curated week is built around
the lift days; the switch is in the Plan settings sheet and is sent as
`generate.fitTrainingDays`.

**Plan (web + mobile).** Day chips carry a barbell (lift) or walk (run) glyph
on exactly the training weekdays; the day view gets a header (`Training day ·
Upper A`, `Target today … kcal · … g protein`, `(+300 kcal, +31 g protein for
training)`, or `Long run day · +N kcal, mostly carbs`) that opens an Explain
sheet (`Why this target`, rest-day target, bonus, protein basis, `Change
training days`); a user whose goal gets no bump sees the marker and title but
no kcal. The week summary shows `3 training days`. The day before a long run
shows the pre-run snack idea.

**Today.** `training-day-note` renders the applied state for free (flag on)
and premium with a `Why?` link; the locked variant only when the bump is not
applied. For users who train, the week outlook becomes the week glance: seven
equal columns (Mon–Sun, never a scroll), each with the meal count and a
barbell / walk glyph (filled = done, outline = planned, never red).
`dashboard.summary.refuelSnacks` carries two allergy-safe snacks for the gym
summary's refuel card.

**Known gap.** A change of weekday kinds moves training-day targets, not the
base targets `TargetsService` snapshots, so it does not yet raise a `DAY_KIND`
change notice; the run kinds are behind the off-by-default flag until that
hook lands (see the wave report).

### 10.3 What Premium changed, miss sheet, re-plan banner (T-10.7, T-11.3)

After a premium regeneration the Plan shows a one-time `What Premium changed`
card from `premiumChanges` (lines, `Meets your … target on X of Y days`, a
`Fix it` for days outside ±15 %) with `Compare with your free week`
(`mealPlan.getById(previousPlanId)`). A day under or over its target opens
`PlanMissSheet`: `Bigger portions` (preview via `mealPlan.scaleDay`, 0.75–1.5×),
`Add a snack` (never for LOSE_WEIGHT), `Keep it`. When the live target moved
≥ 5 % since the week was planned, a banner offers `Re-plan with {new}?`.

### 10.4 Sharing the list and the dinners (UX-13, T-13.1–T-13.3)

The Shop header (mobile) / overflow menu (web) offers `Share`: a `Send the
list` sheet with scope (`What’s left to buy · n items` / `Everything · n
items`), `Include amounts` and `Add this week’s dinners`, remembered per
device. The text is built by the shared `formatListForSharing`: title
(`Shopping list · 28 Sep – 4 Oct`, or `· Fri–Sun` mid-week), aisles in the
list's order in capitals, `- ` bullets, custom lines under their aisle, ticked
and pantry-covered lines omitted from "What's left" (pantry-covered marked
`(have it)` in "Everything"), no emoji or markdown, the dinners block, and one
`Made with Chefer · {url}` line. Mobile uses React Native's `Share.share`; web
uses `navigator.share` with a `Copy list` clipboard fallback. The button is
disabled on an empty list. The week-summary sheet has `Share this week’s
dinners` (planned dinners only). Sharing is not an AI call.

### 10.5 Household first week free and the pool-exhausted card (T-10.4, D-7)

Flag `householdFirstWeekFree` (off by default): the first curated week
generated for a free household is sized for the table (plan cost and the
`Sized for your table of {n} — free for your first week` line, `firstScaledWeek`
on the plan); `ChefProfile.freeScaledWeekStart` records it once. From week 2 the
list says `Sized for 1 portion` with a `Keep portions for your table of {n}`
row. When the free pool cannot fill the week the Plan shows `Our recipes can’t
fill this week around your restrictions.` with `Pick recipes yourself` and
`Premium builds a plan around them` (never a suggestion to relax safety).

---

## 11. Password Reset Flow

> Added 2026-08-21 (roadmap P0-6). Email goes through `IEmailService`
> (`apps/api/src/lib/email`), chosen by `EMAIL_PROVIDER`: a console-logging
> mock (default — the logged link is the local testing workflow), Resend, or
> SMTP (a Gmail account + App Password, 2026-09-26). Reset and confirmation
> emails always have priority: the daily cap (`EMAIL_DAILY_CAP`) never
> blocks them, and weekly emails stop 50 sends short of it to leave them room.

```
/forgot-password → auth.requestPasswordReset { email }   (public)
  ├─ rate limits: 5/15 min per IP, 3/h per target address
  ├─ ALWAYS returns success — responses must not reveal which
  │   addresses have accounts (enumeration)
  └─ if the account exists:
       ├─ delete any previous reset tokens for the address
       ├─ VerificationToken { identifier: "reset:<email>",
       │    token: sha256(random 32 bytes), expires: +1 h }
       │    (only the hash is stored — a DB leak can't reset passwords)
       └─ email link: APP_URL/reset-password?token=<raw>

/reset-password?token=… → auth.resetPassword { token, password }   (public)
  ├─ look up sha256(token); reject invalid / expired / non-reset rows
  └─ transaction:
       ├─ user.passwordHash = bcrypt(newPassword, 12)
       ├─ delete all reset tokens for the address (single-use)
       ├─ confirm the address (emailVerified) if it wasn't yet — the user
       │   just proved they read that inbox (P2-5, §23)
       └─ delete ALL of the user's sessions — every device signs out
```

**Mobile (audit P1-7, 2026-09-26):** the app has the same two screens —
`(auth)/forgot-password` (from "Forgot password?" on Sign in) and
`(auth)/reset-password`. The emailed link still points at the **web** page
(it works in any phone browser, app installed or not); the in-app reset
screen opens from the deep link `chefer://reset-password?token=…`
(`chefer-dev://` in dev builds). Like web, it has no manual token entry —
without a token it offers "Request a new reset link". Both screens are
signed-out routes (the root layout's `Stack.Protected` guard), so a signed-in
user following the deep link does not get the reset screen; the web page is
the path for them. After a reset the app returns to Sign in (every session, including
other phones, was deleted).

---

## 12. Cook Mode Flow

> P1-3 — the single highest-leverage interaction: finishing a cook session
> closes the tracker loop AND the personalisation loop in one tap.

```
/recipes/[id]/cook?meal=<type>       (entry: recipe page "Cook" button,
  │                                   dashboard next-meal "Start Cooking";
  │                                   meal defaults by time of day)
  ├─ focus route: no tab bar or chat button on phones; Back/Next pinned
  │    to the bottom of the screen (audit F-REC-6-1)
  ├─ full-screen stepper — one instruction at a time, large type,
  │    tap or swipe to advance (step index clamped against rapid taps)
  ├─ screen wake lock (feature-detected, reacquired on tab return,
  │    silent degrade on iOS < 16.4)
  ├─ inline timer for steps mentioning a duration (upper bound of
  │    ranges, ≤ 4 h sanity cap; Android vibrates at zero)
  ├─ servings scaler + collapsible ingredients checklist
  │    (quantities scale live in the user's unit system)
  └─ Finish → "Made it!"
       ├─ tracker.logRecipe: atomically APPENDS one serving of the
       │    recipe's stored macros to today's log (portionMultiplier 1 —
       │    cooking for 4 doesn't mean you ate 4×); idempotent per
       │    recipe + meal type, so a double tap logs once
       ├─ capture('meal_cooked' { mealType })
       └─ StarRatingWidget — "your rating shapes what the chef cooks up
            next week" (P1-1 signal)
```

Mobile (`apps/mobile/app/cook/[id].tsx`) has the same finish: "Log this meal"
→ `tracker.logRecipe`, then the rebalance banner (if the log triggered one)
and the `StarRating` card (`src/features/recipes/star-rating.tsx` — 44pt stars
labelled "Rate N stars", "who liked it" household chips, notes; helpers
shared via `@chefer/utils` `rating.ts`). Mobile recipe detail shows the same
card when opened from a Plan-tab day (`day` param), mirroring web's
`?day=` gate.

Real-device acceptance (wake lock, swipe, keyboard) is tracked in
[`docs/device-checklist.md`](./docs/device-checklist.md) (P1-6).

---

## 13. AI Chat Flow

> **Premium-only since 2026-09-25** (owner decision: per-user AI is premium). Free users
> keep the chat button; it opens a locked preview — a labelled example conversation, the
> upgrade sheet (`source: chat-locked`) and links to the free tools that do the same jobs
> (Replace a meal, Quick add, Add to shopping list). The API answers free users with
> FORBIDDEN from `reserveChatMessage`, sent as the existing 200 + `X-Chat-Quota-Exhausted`
> response plus `X-Chat-Upgrade-Required`, so shipped mobile builds still show their
> upgrade card. Recipe import (§16) and the AI nutrition auto-fill are premium-only the
> same way; free Sunday coach reviews use the deterministic template, never live AI.

The AI chef chat (P1-4) is a real assistant over the user's data, not canned
responses. The widget (`ChatWidget.tsx`, every dashboard page) posts the
message history to `POST /api/chat` on the API and renders the plain-text
stream.

**Guardrail (T-00.14, UX-22 AC3, Art. 50 floor).** `CHAT_SYSTEM_PROMPT`
(`apps/api/src/lib/ai/prompts.ts`) used to invite "nutritional advice" and
carried no medical-topic guardrail at all, unlike the weekly coach review
(§14), which already had one. The invitation now says "cooking techniques,
and meal planning questions" (no "nutritional advice"), and the prompt
carries the same "chef, not a doctor: no medical claims, no diagnoses, no
advice about health conditions" rule as the review — with an added line
telling the model to name a GP or dietitian on a medical topic (blood sugar,
blood pressure, pregnancy, medication) instead of answering. Both prompts
share one string so they can't drift apart; a snapshot test
(`prompts.chat-guardrail.test.ts`) locks the wording in.

**Header flags + footer disclaimers (UX-22, T-22.2, wave 1 L-ENTRY).** The
chat header always shows the subtitle `AI · answers can be wrong`, and the
empty thread shows a chef-not-a-doctor line (`WELLNESS_COPY` in
`@chefer/utils`, both shared with the future goal/metrics disclaimer,
T-22.3). `chat.router.ts` classifies the LAST user message with
`isHealthTopic(text)` / `isSafetyTopic(text)` (`health-topic.ts`, pure EN+RO
keyword match — a belt on top of the prompt guardrail above, not the primary
control) and, before the stream starts, sets `X-Chat-Health-Topic: 1` /
`X-Chat-Safety-Topic: 1` (the plain-text stream has no "final event" to carry
a flag on otherwise). Both clients read the header once the response arrives
and render a fixed footer under that reply: `Not medical advice — check with
your GP.` or `AI can be wrong about allergens — always check the label.`

```
POST /api/chat (session cookie)
  ├─ resolve user from session (401 without)
  ├─ ChatService.assertChatQuota
  │    └─ FREE: 5 messages/day (PLAN_FEATURES.chatMessagesPerDay, counted
  │       from ai_call_logs CHAT rows) — over quota streams the upgrade
  │       message as a normal reply + X-Chat-Quota-Exhausted header; the
  │       widget then swaps its input for UpgradeButton (source: chat-quota)
  ├─ build fresh context from REAL data:
  │    today's meals + macros + day totals, weekly overview, resolved
  │    daily targets, allergies/restrictions/dislikes, recent ratings
  ├─ log AiCallLog CHAT
  └─ aiService.chat(messages, { contextSummary, tools })
       ├─ Gemini: bounded function-calling loop, then streams the answer
       │    ├─ swapMeal(dayOfWeek, mealType, occurrence?) → MealPlanService.swapRecipe
       │    │    (occurrence 2 = the day's second snack → slotIndex; omitted = first)
       │    │    (a chat swap IS a plan swap — the meal-plan page reflects it)
       │    ├─ scaleRecipe(recipeName, servings) → quantities rescaled from
       │    │    the active plan
       │    └─ addToShoppingList(items[]) → ShoppingListService.addCustomItems
       │         (items land in the customItems overlay — visible and
       │         removable on the Shopping List page)
       └─ mock: echoes the same context and exercises the same tools
```

**One local-day contract (§2.12, T-21.1, bug B-06).** `logMeal` ("I ate
this") and the context summary's "today" both now reckon the day from the
user's own `ChefProfile.timeZone` (`localDateInZone`/`localDayIndexInZone`,
private to `chat.service.ts`), not the API server's clock — a message sent
just after midnight UTC used to log to the WRONG calendar day for anyone west
of Greenwich. Accounts that have never set a time zone fall back to UTC
(unchanged behaviour). `scripts/check-utc-days.mjs` (run in CI, the
`utc-day-guard` job) greps `apps/api/src/application/**` for the old pattern
and fails on a new occurrence outside its allowlist — `tracker.service.ts`'s
equivalent fix (bug B-33) is still open, a different lane's work.

Routing: Caddy sends `/api/chat` to the API in production; a Next.js rewrite
proxies it in dev. `apps/web` no longer touches Prisma anywhere (Architecture
Rule 1 exception removed).

---

## 14. Adaptive Chef Weekly Review Flow

**F1 (premium_plan.md W1-A).** Every Sunday the chef reviews the week that is
ending and — for premium users — adjusts the calorie budget the next week is
generated against. Free users keep static targets but still get a real review
teaser (§6.4 ghost state).

```
WeeklyPlanWorker Sunday tick (BEFORE plan generation — ordering matters:
the adjusted target must shape next week's budget)
  ├─ CoachService.runReviewSweep(now)
  │    ├─ candidates: users with ≥3 DailyLog rows since UTC Monday (groupBy)
  │    └─ per user: runWeeklyReview(userId, now, applyAdjustment=premium?,
  │               aiText=premium AND aiDataConsentAt IS NOT NULL)
  │         ├─ idempotency: existing ChefReview row for (userId, weekStart
  │         │    = UTC Monday midnight, @@unique) → no-op; second tick on the
  │         │    same Sunday changes nothing
  │         ├─ <3 logged days → no review ("log more days" is itself the coach)
  │         ├─ metrics (application/coach/review.service.ts — pure, unit-tested):
  │         │    adherence = logged days / 7; avg kcal (and protein) over
  │         │    logged days;
  │         │    weight trend = EWMA (α=0.25) over ≤28 days of WeightEntry
  │         │    rows, null unless ≥5 points spanning ≥10 days
  │         ├─ adjustment policy (deterministic, conservative):
  │         │    adherence <50% → nothing, coach the habit;
  │         │    LOSE plateau (trend ≥ −0.1 kg/wk) for 2 CONSECUTIVE reviews
  │         │    → −100 kcal (floor BMR×1.1, partial clamp);
  │         │    GAIN stall (trend ≤ +0.05) → +100 kcal (ceiling TDEE+500);
  │         │    free tier: policy skipped entirely (adjustmentKcal = 0)
  │         ├─ §2.11, T-35.4 (rev 2): the coach PROPOSES, it no longer writes
  │         │    ChefProfile.targetAdjustmentKcal itself. The adjustment is
  │         │    stored on ChefReview.proposedAdjustmentKcal and surfaced as a
  │         │    SUGGESTED/COACH TargetChange (targetsService
  │         │    .proposeCoachAdjustment, best-effort); ChefReview
  │         │    .adjustmentKcal keeps meaning "applied" — 0 until the user
  │         │    accepts via targets.acknowledgeChange({ id, keep: false }),
  │         │    which THEN bumps the dial that resolveTargets applies AFTER
  │         │    the goal adjustment and BEFORE the protein cap — so the
  │         │    dashboard ring, tracker bars, chat context AND next week's
  │         │    generation budget all move together once accepted (§29)
  │         ├─ targets: resolveDailyTargets(profile, lifter bodyweight) —
  │         │    lifters (§10.1) get a protein line vs their g/kg target
  │         └─ prose: Gemini (application/coach/review-text.ts — warm,
  │              non-medical, never mentions BMR/algorithms; first line
  │              stands alone) with the deterministic template as mock/
  │              failure fallback → ChefReview row written last.
  │              Free tier and premium users WITHOUT AI data consent (§25)
  │              always get the template — none of their data reaches the
  │              AI; their review and (premium) calorie adjustment still
  │              happen. The sweep returns + logs `aiSkipped`.
  └─ plan generation sweep (PW-5) — reads the moved targets
```

**Surfaces:**

- Review prose says "I'd suggest moving next week's calorie budget by…",
  never "I've adjusted…" (T-35.4) — an old client's banner text stays true
  even though nothing moves until the proposal is accepted.
- `coach.currentReview` (protected query) returns the latest review while
  fresh (≤14 days after its weekStart), shaped by entitlement:
  `full` for `adaptiveCoaching` accounts; `teaser` (FIRST line only +
  `lockedLineCount` — the full text never leaves the server) for free;
  `none` with `loggedDaysThisWeek`/`daysNeeded` otherwise.
- Dashboard banner (`ChefReviewBanner`): premium sees summary chips + a
  full-review Sheet (`chef_review_viewed`); free sees the blurred-teaser ghost
  state (`upgrade_prompt_shown {source: 'coach-review'}` on impression,
  `teaser_engaged {feature: 'coach'}` on interaction, UpgradeButton).
- Dashboard `WeightCard`: free-for-everyone weight quick-entry + 30-day
  sparkline over the existing `tracker.logWeight`/`tracker.weightHistory`
  procedures (`weight_logged` on save) + "log N more days" coaching hint.
- Weigh-ins are validated everywhere by the shared `parseBodyWeightKg`
  (`@chefer/utils`, 20–400 kg, "72,5" accepted, exponents rejected) with an
  inline error, and the API enforces the same bounds plus "not in the
  future". Entries can be corrected or deleted (`tracker.updateWeight` /
  `tracker.deleteWeight`): both platforms list them on Progress (web
  /progress, mobile `progress` — linked from the card's "See progress" and
  from More); mobile can also expand them inside the dashboard card.
- Progress (web + mobile): 28-day calories vs target and macro breakdown
  (`tracker.monthlySummary`), 90-day weight chart (`tracker.weightHistory`)
  with current weight and change. The change is coloured by goal via the
  shared `weightChangeTone` (`@chefer/utils`): gaining is green for
  GAIN_MUSCLE, losing is green for LOSE_WEIGHT, other goals stay neutral
  (audit F-TRK-4-1). Reads ignore
  future-dated rows, and the coach's EWMA trend drops jumps over 3 kg/day,
  so a single typo can't swing the weekly adjustment (audit F-DASH-3-1).
  **T-21.1 (§2.12) bug fix:** the web page parsed each day's `YYYY-MM-DD`
  with `date-fns` `parseISO`, which reads a date-only string as UTC
  midnight — formatting it back in a browser west of Greenwich showed the
  day before. It now parses as a local midnight (`new Date(\`${d}T00:00:00\`)`),
matching mobile's `progress.tsx` `shortDate`, which already did this.
- Chat tool `getMyReview`: the model can quote the latest review; free users
  get the teaser line + an upgrade suggestion.

---

## 15. Snap-to-Log Flow (F4)

Photo logging + week rebalance (premium*plan.md W1-B). The honesty principle:
logging off-plan food is FREE (manual quick-add, chat "I ate this"); the
\_vision* scan and the automatic week rebalance are premium
(`PLAN_FEATURES.photoLogging`, `mealScansPerDay: 10`).

### Photo scan (premium)

```
Tracker page → "Scan a meal" → native camera / file picker (≤5 MB image)
POST /api/scan-meal (session cookie, raw image body — same transport as uploads)
  ├─ resolve user from session (401 without)
  ├─ reserveMealScan (lib/quotas.ts — atomic reservation)
  │    ├─ FREE → 403 { upgradeRequired: true } — client opens the snap-scan
  │    │    demo sheet instead (upgrade source: snap-scan)
  │    └─ ≥10 scans today (ai_call_logs SCAN rows since midnight UTC) → 429
  ├─ log AiCallLog SCAN (attempts count, like chat)
  └─ aiService.analyzeMealPhoto(base64, mime)
       ├─ Gemini: multimodal structured output → { dishName, confidence
       │    low|med|high, kcal, protein, carbs, fat, portionNote }; the
       │    prompt demands honesty about what a photo can't show
       └─ mock: deterministic fixture (520 kcal chicken plate)
→ confirm Sheet: every number editable, confidence badge + portion note shown
  ├─ confirm → tracker.logCustomMeal (custom entry, estimatedBy: 'vision')
  │    → analytics meal_scanned { confirmed: true }
  └─ discard → nothing logged; meal_scanned { confirmed: false }
```

**Error states (T-BUG-O1, O-18).** A failed scan never shows a status code or
the literal text `[object Object]`. `scanMealPhoto` (mobile
`src/lib/media-client.ts`, web `features/tracker/lib/scan-client.ts`) checks
the photo's size against the 5 MB limit before sending (on mobile, after
shrinking it to <= 2048 px / JPEG 0.8 — T-BUG-O1.2), and maps any failure —
client-side pre-check or a server response — to a sentence: **too big** ("That
photo is too big. Choose another, or use a screenshot of it.") for a 413 or an
oversize body, **no connection** ("No connection. Try again when you're back
online.") for a network failure, **signed out** ("Sign in again to add
photos.") for a 401, the route's own sentence when it wrote one (429 scan
quota, 503 AI outage, 500 unreadable photo), and **something went wrong**
("Something went wrong on our side. Try again in a moment.") for anything else
— the premium-gate 403 (`upgradeRequired`) stays a separate path, unaffected. See
`infrastructure.md` §4.1.1 for the server-side 413 contract.

Custom entries render on the tracker as their own rows (name + "estimated" /
"quick add" chip, deletable via `tracker.deleteCustomMeal`) and count toward
the day's progress bars.

**Bug fixes (2026-09-28, L-TRACK wave 1).** B-36: the confirm sheet's meal-slot
default used to always be Lunch regardless of the hour — it now uses the same
`defaultMealSlot(localHour)` (`@chefer/utils`) Quick add uses. B-37: a denied
camera permission used to leave a bare "Camera access is needed…" red-text
dead end — it now shows a muted notice with **Open Settings**
(`Linking.openSettings()`) and **Choose a photo instead** (falls back to the
library picker, no new native permission). B-44: the scan's log mutation used
to invalidate nothing, so the dashboard ring lagged the tracker by ~8 s after
a snap log — every day-changing mutation now calls one shared
`invalidateDayQueries(utils, date)` helper (`src/features/tracker/invalidate.ts`)
that refreshes `tracker.getDay`, `tracker.weeklySummary`, `tracker.monthlySummary`
and `dashboard.summary` together.

**Day saves merge, they never replace** (audit 2026-09-25, F-PM-1 / F-TRK-1-2).
`tracker.upsertDay` carries only the planned meals the tracker shows; the
server keeps every custom entry and every logged recipe that isn't in today's
plan (e.g. cooked before a regenerate or swap). Those appear under "Also logged
today" (`getDay.offPlanLogged`) and count in the totals. Every day write runs
in a serializable transaction with retry, so parallel quick-adds from two
devices all persist. Saving with nothing ticked un-logs the planned meals.

**One entry per plan slot** (follow-up, 2026-09-26). A curated day can hold two
identical snacks; entries used to be matched by recipe + meal type, so ticking
one ticked both. `tracker.getDay` now gives each planned meal its `slotIndex`
(its index in the plan day's `meals`), the tracker (web + mobile) keys rows by
it and sends it back on each ticked entry, and Today's "I ate this" passes
`dashboard.summary.nextMeal.slotIndex` to `tracker.logRecipe`. Matching is
`matchLoggedToSlots` in `@chefer/utils` (tracker, and `resolveTodayMeals` for
Today): an entry with a `slotIndex` claims that slot while it still holds the
entry's recipe; any other entry claims the first unclaimed slot with its
recipe (and type) — so an older entry without one ticks one snack, not both.
`logRecipe` with a `slotIndex` replaces only that slot's entry; without one
(cook mode, shipped apps) it keeps the recipe + meal type rule. No schema
change: `slotIndex` is an optional field of the `loggedMeals` JSON.

Search-first logging (recents, edit-by-id, undo-delete, copy a day) and the
no-active-plan empty state are §30.

### Free-tier honesty tools

- **Quick add** (tracker): name + kcal only → `tracker.logCustomMeal`
  (`estimatedBy: 'manual'`, mealType snack). Free for every account.
  Mobile (`src/features/tracker/quick-add-sheet.tsx`, "Quick add" button on
  the tracker, any non-future day) also lets the user pick the meal slot and
  optional protein/carbs/fat; inline validation mirrors the API bounds via the
  shared `parseQuickAdd` (`@chefer/utils`), API errors show in the sheet, and
  the day's `tracker.getDay` is invalidated on success.
- **Chat "I ate this"**: the `logMeal` chat tool logs the model's own macro
  estimate as a manual custom entry into today's log.
- The camera button stays visible for free users; tapping it opens the
  demo-scan ghost sheet (sample scan animating into macros) — fires
  `upgrade_prompt_shown { source: 'snap-scan' }` + `teaser_engaged
{ feature: 'snap' }` (§6.4 merchandising).

### Week rebalance (premium)

After ANY log write (tracker save, quick-add, photo scan, chat logMeal,
cook-mode "Made it!"), `TrackerService.maybeRebalance` runs for users with
`photoLogging` access:

```
rebalanceWeek(userId, activePlanId)   [application/meal-plan/rebalance.ts]
  ├─ only the CURRENT week's plan; Sunday → no-op (no future days)
  ├─ projection = Σ logged kcal Mon…today + Σ planned kcal for days AFTER today
  ├─ |projection − 7×dailyTarget| ≤ 15% → no-op ("week is on track")
  └─ else: greedy-swap up to 2 FUTURE slots for closer-calorie alternatives
       from the safety-filtered curated pool (deterministic, no AI call);
       stops early when back within 15% or no swap improves ≥2% of target
       → applies via mealPlanRepository.updateDayMeal
       → returns { rebalanced, swaps[previous↔new pairs], planId }
```

The client hands the swap pairs to localStorage
(`features/tracker/lib/rebalance-storage.ts`), MERGED with any still-pending
swaps (`@chefer/utils` `mergePendingRebalance` — a second rebalance used to
erase the first one's undo, F-TRK-3-2). The banner ("I adjusted Thursday
dinner to keep your week on track") shows where the log happened (tracker,
cook-mode finish) and on the meal-plan page, with one-tap
**undo**, which replays `mealPlan.replaceRecipe(previousRecipeId)` per swap.
Undo is per-device and expires after 24 h — nothing about the swap pairs is
stored server-side (wave-0 schema freeze). Analytics: `week_rebalanced` fires
on the client when a log's response carries an applied rebalance. Failures in
the rebalance path never fail the log save itself.

**Mobile** (P1-7, 2026-09-26): every logging surface (tracker Save Day, quick
add, photo scan, cook-mode log) feeds the response's `rebalance` into
`src/features/tracker/rebalance-store.ts`, persisted in the app's SQLite KV.
The store **merges** a new rebalance into the pending one
(`mergePendingRebalance` in `@chefer/utils`: one entry per slot, a slot
swapped twice keeps its original recipe for undo, a slot swapped back drops
out; another plan or a stale hand-off is replaced) — so a second rebalance no
longer destroys the first one's undo (audit F-TRK-3-2). The banner with Undo
/ Dismiss renders **where the log happened** (tracker, cook-mode finish) and
on the Plan tab (filtered to the displayed plan). Web still overwrites and
shows the banner only on the meal-plan page — reverse row in
`mobile_parity_backlog.md`.

Routing: Caddy sends `/api/scan-meal` to the API in production; a Next.js
rewrite proxies it in dev.

---

## 16. Recipe Import & Cheferize Flow

**F5 "Cheferize Anything"** (premium_plan.md W1-C): paste a link, paste text, or snap a
cookbook page — the chef imports the recipe and adapts it to the user.

```
recipe.importPreview { url | text | imageBase64 }   (protected — free gets 1/day)
  ├─ assertRecipeImportQuota (PLAN_FEATURES.recipeImportsPerDay: FREE 1 / PREMIUM 5,
  │    counted from ai_call_logs RECIPE_IMPORT rows — attempts, not successes)
  ├─ URL path: SSRF-guarded fetch (http(s) only, default ports, private/loopback/
  │    link-local/metadata ranges rejected on EVERY resolved address and EVERY
  │    redirect hop; 10 s timeout; 1 MB streaming cap)
  │    → readability strip (schema.org Recipe JSON-LD preferred, chrome removed,
  │      og:image captured, 20 k char cap)
  ├─ IAIService.extractRecipe (structured output; photo path uses vision)
  ├─ IAIService.cheferizeRecipe — allergen/restriction substitutions, soft dislike
  │    swaps, servings rescaled to the household portion sum (P2-3); the
  │    allergy set is the household union (members included)
  ├─ P1-2 allergen matcher RE-VALIDATES the adapted output (AI never trusted for
  │    safety) — surviving terms are listed and the adapted variant is unusable
  └─ macro cross-check vs the ingredient vocabulary (>25% off → "estimate uncertain")

recipe.importSave { recipe, variant, sourceUrl?, ogImageUrl? }   (premium)
  ├─ variant=adapted → matcher re-runs server-side on the submitted payload:
  │    a recipe that still violates the user's allergies/restrictions is REJECTED
  │    (fail closed — the "AI missed the peanut" case cannot be saved as adapted)
  ├─ image: og:image only when a guarded HEAD check confirms an image response,
  │    else the deterministic name-seeded Pollinations URL
  └─ Recipe created with source: MANUAL, creatorId, sourceUrl provenance
       → rateable + pinnable → flows into P1-1 generation placement
```

**Free tier (premium-only since 2026-09-25):** the Import button is visible to everyone;
free users see a clearly labelled canned example (web) or a locked card (mobile) with
the upgrade CTA (`source: recipe-import`) — no AI call, the API answers FORBIDDEN. Events: `recipe_imported {via}`,
`recipe_cheferized`, `teaser_engaged {feature: import}`, `upgrade_prompt_shown`.

### 16.1 From a video link (review form) — 2026-09-26

Owner decision: Gemini's native video input is gone. A cooking video (YouTube, YouTube
Shorts, TikTok, Instagram reel) is read from its **words only**, and the user reviews,
corrects and completes what the AI managed to extract before saving.

```
Import → "Video" tab (web sheet + mobile screen; premium only — free users see the
          same locked example/card as the other sources, no AI call)
  ├─ link checked client-side AND server-side (@chefer/utils parseVideoUrl: one
  │    YouTube/Shorts/TikTok/Instagram video — no channels, playlists, other hosts)
  ├─ AI data consent (recipe-import; now names the Groq transcription for videos)
recipe.importVideoPreview { url }   (protected; RECIPE_IMPORT quota → FREE FORBIDDEN,
  │                                  PREMIUM 5/day, refunded on any failure)
  ├─ yt-dlp metadata → caption/description
  │    └─ caption carries the whole recipe (ingredients AND method)? → use it, stop
  ├─ else one subtitle track (uploaded in the video's language, else the original
  │    auto-captions — never a machine translation) → use it
  ├─ else AUDIO ONLY → ffmpeg 16 kHz mono mp3 → Groq Whisper (whisper-large-v3-turbo)
  │    ├─ caps: VIDEO_MAX_SECONDS (10 min) before download, VIDEO_MAX_DOWNLOAD_MB
  │    └─ audio deleted right after transcription; nothing stored
  ├─ a partial caption (ingredients, no method) rides along; used alone if
  │    subtitles and speech come up empty
  ├─ title + caption + transcript → extractRecipeAnnotated as TEXT (importText
  │    route, any provider) — may return empty steps rather than invent them
  └─ draft + notFound (name / ingredients / steps / servings not stated / time not
       stated) + amounts that appear nowhere in the words + household allergen warning

Review form (web VideoDraftForm, mobile video-draft-form):
  ├─ "Check the details — we read this from the video's caption / captions / speech"
  ├─ every field editable: name, servings, prep/cook minutes, ingredient rows
  │    (amount, unit, name; add/remove), steps (add/remove)
  ├─ "Not found — please add" until filled; servings/time "not stated — please check"
  │    until touched; "Amount not heard — please check" per ingredient until edited
  ├─ shared validation (videoDraftProblems): name, ≥1 measured ingredient, ≥1 step,
  │    1–20 servings; per-serving nutrition rescaled if the serving count changed
  └─ Save → recipe.importSave { variant: 'original', sourceUrl, ogImageUrl }
       (same save path; allergen conflicts are shown as a warning on the form)
```

Errors the user can see: not a supported link; private / login-only video; video not
found; video site refused us (YouTube bot check, rate limit); longer than 10 minutes;
too large; no caption, subtitles or speech with a recipe; took too long; video import
unavailable. Every one ends with "you can paste the recipe text instead" where it helps.

**Legal note.** Downloading from TikTok and Instagram (and YouTube) may conflict with
their terms. Chefer fetches only the single link the user explicitly submits — no
crawling — reads the words rather than the footage, stores no media, and saves the
result to the user's private collection with the source link.

**Chat entry point:** the `importRecipe(url)` chat tool runs the same flow — premium
saves automatically (adapted when safe and changed, else original); free gets the
preview summary and an upgrade pointer.

**Copyright stance (deliberate):** imports are a personal collection only. Provenance
is kept (`sourceUrl` on the recipe), imported recipes are owned by and visible to the
importing user only, never served to other users or the curated pool, and no full page
text is stored or republished — only the structured recipe data the user cooks from.

---

## 17. Household Plans Flow (F2)

**"Feed the Whole Table"** (premium_plan.md W2-D; reworked by backlog P2-3):
the account owner adds the people they cook for — partner, kids, the flatmate
with the nut allergy — and every week is safe for all of them. **Member safety
is free on every tier; portion scaling is premium.** The household is the one
people model: there is no separate "cooking for N" setting any more (F-PM-8).

```
Entry points (≤ 2 taps from Profile / "You", PM review §5)
  ├─ web: Profile → "Your household" card → /preferences#household
  │        (the Preferences header also links straight to the section)
  ├─ mobile: Profile → "Household" row → /household (also More → Household)
  └─ onboarding: intent "Feed my household" → "Who's at your table?" step

Members (household.* — protected, EVERY tier, cap householdMembers = 5)
  ├─ household.list — member chips with per-member safety summary
  ├─ household.add — { name, portionFactor 0.25–3 (0.5 kid … 1.5 big eater),
  │    isKid, allergies[], dietaryRestrictions[], dislikedIngredients[] }
  │    count + insert in one SERIALIZABLE transaction (F-ONB-3-1: parallel
  │    adds can no longer pass the cap); `household_member_added` on save
  ├─ household.update / household.remove — ownership-scoped; removing asks
  │    to confirm first (F-ONB-3-2)
  └─ quick chips on an empty household: "+ add your partner" / "+ add a kid"
       ├─ premium: open the editor pre-filled (kid = ½ portion, isKid)
       └─ free: the §6.4 ghost reflects the chip tapped (F-PM-12) — the kid
            chip shows a sample kid at ½ portion with a peanut allergy, the
            partner chip a vegetarian adult — then offers "Add a kid" (free,
            pre-filled editor) and the premium scaling upsell. Mobile
            (Household screen): the same ghost sits above the inline add form,
            which the chip pre-fills; members edit in place under their row
            (pencil → "Save changes" = household.update), every tier
            (`upgrade_prompt_shown {source: 'household'}`,
            `teaser_engaged {feature: 'household'}`)

Legacy "cooking for N" (DietaryPreferences.servingSize > 1)
  └─ converted ONCE into N−1 "Person 2…N" placeholder members (only when the
       user has none) and reset to 1 — at API boot (backfill), when an older
       app build writes servingSize through preferences.setup/updateTargets,
       and lazily on household.list / mealPlan.generate. Idempotent: the
       conditional reset is the claim. preferences.get still returns
       servingSize, derived from the household (≤ 6), for builds in the stores.

SAFETY — every tier (members' allergies + restrictions ∪ the owner's)
  ├─ free curated generation + curated swaps: loadMergedSafety →
  │    safeCuratedPools(union) — the same filterSafeRecipes
  ├─ premium AI generation + AI swaps: householdContext.mergedSafety on the
  │    prompt AND the post-generation safety pass
  ├─ allergen warnings (plan cards, recipe page, cook mode): allergenWarnings
  │    are computed against the union
  └─ recipe import (premium): the Cheferize preferences and the fail-closed
       save check use the union too

SCALING — premium only (`householdPlans`)
  ├─ generation: servings = householdPortionSum = ceil(1 + Σ portionFactor)
  │    (householdContext.portionSum → prompt "servings=N", MealPlanInput
  │    .servingSize); the legacy setting is never read. Imports adapt to the
  │    same number.
  ├─ shopping list (derived AND the AI-consolidation input): every recipe's
  │    ingredients × portions / recipe.servings — a single-portion curated
  │    week ×portions, a recipe already generated for the table ×1 — and the
  │    list reports `portions`
  ├─ plan week cost: estimatedCost scaled the same way (chip = list total),
  │    with `portions`
  └─ recipe page + cook mode default to the table's servings, × the plan
       slot's portion when opened from the plan (shared
       `defaultCookServings`; mobile cook mode's ingredient list has the
       servings stepper)
FREE households: lists, costs and recipe pages stay as written (single
portion for curated plans) and say so ("sized for 1 portion — Premium scales
it for your table"). Per-person cost is ALWAYS total ÷ the portions the list
was sized for (perPortionCost), never a single-portion total ÷ head count
(F-PM-5).

Ratings: optional "who liked it" member chips on the star widget → stored as
a "Liked by: Maria, Tom" line inside MealRating.notes.
```

**Downgrade semantics:** nothing is deleted and nothing about members changes
— they stay fully editable on free, and their safety keeps applying. Only the
scaling stops (lists go back to recipes as written).

**Post-upgrade activation (web + mobile):** the "You're premium" sheet orders its steps
by the upgrade `source` and hides what is already done (F-PREM-1-5, F-PM-9):
source `household` → "Add your table" first (web → /preferences#household,
mobile → the Household screen); users who already have a profile never see
"Set your goal" or a link to onboarding. Ordering and copy are shared
(`activationStepKeys`, `ACTIVATION_STEP_COPY`, `SOURCE_FEATURE_PRIORITY` in
@chefer/utils). Mobile: upsells open Profile with `?source=` (household,
pantry, chat-locked, training-day); a successful Upgrade there opens the sheet.

**Events:** `household_member_added`, `upgrade_prompt_shown {source:
'household'}`, `teaser_engaged {feature: 'household'}`, `onboarding_intent
{intent}` (see docs/analytics-funnel.md).

---

## 18. Zero-Waste Pantry Flow (F3)

**F3 "Zero-Waste Kitchen"** (premium_plan.md W2-E): Chefer remembers what the user
bought, plans around it, and shows the savings in euros. v1 is deliberately honest —
no per-recipe gram depletion; a weekly 60-second confirm instead.

```
SEEDING (all tiers — the free ghost state needs real data)
shoppingList.toggleItems { keys, checked: true }        (protected)
  ├─ P1-5 check-off transaction commits first (a pantry failure never
  │    breaks the check-off)
  └─ PantryService.seedFromPurchases: each checked item's name/qty/unit —
       the quantity the list shows (slot portions + premium household
       scale), not one recipe's base quantity →
       upsert PantryItem (source PURCHASE, name normalized,
       @@unique(userId, ingredientName, unit) collapses re-buys)
       ├─ STAPLES DENYLIST: salt, pepper, oil/vinegar/salt families, water,
       │    sugar, dried spices… are NEVER tracked
       └─ unchecking does NOT remove — you bought it last week, you have it

DEPLETION v1 (premium)
pantry.confirmWeekly { clearIds }                        (premium)
  ├─ asked by the inline "Still have these?" banner (PantryCheckBanner on
  │    web, pantry-check-banner on mobile) at the top of Shop — never a sheet
  │    over the list (audit F-PM-13): at most once a week (answered or "Not
  │    now" both count; web localStorage / mobile KV key = local Monday), and
  │    only about items ≥ 3 days old (pantryItemsToConfirm, @chefer/utils);
  │    also by hand from "Still have these?" on Shop → In my kitchen
  ├─ tapped items are deleted ("used it up")
  └─ kept rows older than 7 days decay quantity → 0 = the "some" state
       (amount unknown; updatedAt PRESERVED so use-first order holds)

PLANNING (premium — wired by the wave-2 integrator into the household-owned loader)
mealPlan.generate
  ├─ aiInput.useFirstIngredients ← getUseFirstIngredients(userId)
  │    (application/pantry/pantry-context.ts — top 5, OLDEST updatedAt first,
  │     human reason strings; buildUseFirstSection renders the soft-constraint
  │     prompt section, quantity 0 rendered as "some")
  ├─ optional leftoversMode → buildLeftoversSection steers dinners, then
  │    pairLeftovers() pairs 2-3 dinner → next-day-lunch slots with doubled
  │    servings and `leftoverOf` labels (Json only, no schema change)
  └─ personalisation.usedPantryItems ← computeUsedPantryItemsForUser(...)
       → meal-plan banner "uses N things you already have"
       → analytics `plan_used_pantry {itemCount}`

LIST SUBTRACTION (premium)
shoppingList.getForWeek / regenerate
  ├─ a FULLY-covered derived/AI item gets `pantryCovered` ("Have it" chip),
  │    is EXCLUDED from estimatedTotalEur; custom items never subtracted
  ├─ bug B-24 (T-BUG-24, persona-study wave 1): a pantry row that covers
  │    SOME but not all of a line is now a PARTIAL match — previously
  │    treated as "not covered" (the whole line stayed, unexplained).
  │    The item stays on the list at its remaining (need − have) quantity,
  │    its estimatedPriceEur scales proportionally, and it gains
  │    `haveQuantity?` so the UI can say "You have {have} of {need} · Buy
  │    {n}" (`buildPantryCoverageMatcher` in pantry-match.ts, additive
  │    alongside the full-coverage `buildPantryMatcher` other callers still
  │    use). Free accounts still see untouched numbers.
  ├─ header savings counter: pantry.savedEur = Σ estimated prices of FULLY
  │    covered items only ("saved ~€X this week") — a partial match is not
  │    counted as savings
  ├─ one-tap re-add = pantry.markOutOfStock { ingredientName } — clears the
  │    pantry rows, item returns to the buy list
  └─ coach seam: PantryService.computeWeekPantrySavings(userId, weekStart)
       → ChefReview.savedEur (written by coach code at review time)

CHAT
whatCanIMake tool → PantryService.whatCanIMake: ranks active-plan + curated
recipes by pantry coverage (staples assumed on hand); free tier gets an
honest teaser.
```

**Free-tier ghost state (§6.4):** check-offs really seed the pantry, so after any
check-off session the shopping list header shows "You now have N items in your
kitchen — premium plans cook from them" plus the REAL computed savings figure for
this list (web + mobile; on mobile also on Shop → "In my kitchen", where it
replaces the static upsell once the kitchen has items). Shop → "In my kitchen" (web `/shopping-list?view=kitchen`, which
`/pantry` redirects to; mobile Shop tab segment) is visible read-only with the upsell. Events:
`upgrade_prompt_shown {source: pantry}` (impression), `teaser_engaged {feature:
pantry}`, `pantry_confirmed`, `plan_used_pantry {itemCount}`.

---

## 19. Beta Feedback Flow

Any signed-in user can send free-text feedback from the sidebar (desktop) or the
More drawer (mobile web): "Send feedback" opens a Sheet with one labelled textarea;
the native app has the same field as a card on the More tab. Both cap it at the
API's 2,000 characters with a live counter ("123 / 2,000", amber in the last 100,
"Limit reached: 2,000 characters") — shared `feedbackCounter` in @chefer/utils
(F-PROF-2-2).

```
User → Send feedback → feedback.submit { message, path } → FeedbackService.submit
     → Feedback row (userId, message ≤2000, path, createdAt)
```

The current route is attached automatically as `path`. On success the client
fires the `feedback_submitted { path }` PostHog event and thanks the chef.
Feedback is write-only in-app; the team reads it via Prisma Studio/psql.

---

## 20. Native App Update Flow (OTA, M4-4)

The production native apps (`Chefer`, variant `production`) talk to
`https://chefer.duckdns.org` and receive JavaScript changes over the air via
EAS Update. Nothing here touches the API — it's how app code reaches phones.

```
push to master → Deploy workflow → API/web deployed → verify healthy
          → mobile-update job: pnpm mobile:update "<sha> <subject>"
            (or a developer runs it by hand)
          → eas update --channel production (bundle built with the prod API URL,
            tagged with the native fingerprint = runtimeVersion)

App launch (production binary) → expo-updates asks u.expo.dev for the newest
  update on channel "production" whose runtimeVersion == its own fingerprint
    ├─ none newer → run the embedded (or last downloaded) bundle
    └─ newer      → download in the background, keep running the current one;
                    the NEXT cold launch runs the new update
```

- **Native changes can't ship OTA.** A new native module changes the
  fingerprint; that update matches no installed binary and is simply ignored
  until the phones get a `pnpm mobile:release:*` build over USB.
- **Publish after deploy.** Automatic: the deploy workflow publishes only
  after the API it needs is verified live. API changes stay additive so older
  bundles (phones that haven't relaunched yet) keep working.
- **iOS free signing:** the binary itself expires 7 days after it was signed
  (free Apple ID); OTA doesn't extend that — re-run `pnpm mobile:release:ios`.
- The More tab footer shows which bundle is running (`built-in bundle` vs
  `update <id>`).
- Dev builds (`Chefer Dev`) keep loading JS from Metro on the Mac; they
  never receive production updates.

---

## 21. Gym Training Flow

Weight training alongside food (plan: [`gym_plan.md`](./gym_plan.md); evidence:
[`docs/gym/programming-research.md`](./docs/gym/programming-research.md)). Free on
every tier (`PLAN_FEATURES.gymTraining`). Mobile first; the web port is wave G5.
On web (G5) the same loop lives under `/gym*`: the mode comes from the URL plus a
`chefer_mode` cookie, the active workout is kept in localStorage (resumes after a
reload), and finished workouts upload through a localStorage outbox on
reconnect / focus. Web reminders are stored only; the phone sends them.

### Entering Gym mode

```
Food/Gym switch (header of every tab root) → persisted mode
  ├─ no GymProfile → /gym/setup
  │     days/week → experience (mobile, UX-05 B/T-05.2: "Experienced" adds
  │         "Do you already follow a split?" on the same screen — Push/Pull/Legs,
  │         Upper/Lower, Full body, or "Pick one for me"; sent as `split` on
  │         recommend/completeSetup, additive/optional, web not yet asked)
  │         → equipment + units → weekdays/reminder
  │     → gym.profile.recommend (pure engine: template + volume hints)
  │         equipment answer is a hard limit: Dumbbells → dumbbell + bodyweight moves,
  │         Bodyweight → bodyweight moves only (curated swaps, else closest same-pattern
  │         alternative, else the slot is dropped); saved routines are never rewritten
  │         a chosen split picks the closest template of that family for the day
  │         count (`recommendTemplate`), instead of the day-count default
  │     → "Your program" (mobile): "Other programs that fit {n} days" now sits
  │         right under the program card as visible rows with a "Use this" button
  │         each (T-05.2, AC3) — "Choose another program" stays as a second path
  │         to the full list via its sheet
  │     → "Help me find my weights" (calibration) | "I know my weights"
  │         (loadable lifts only; an all-bodyweight program has nothing to enter)
  │     → gym.profile.completeSetup  (profile + active routine + initial progressions)
  │         weekly goal = the days the user chose (`input.days`), not the resulting
  │         template's own day count (bug B-18, T-05.2, AC4 — 5 chosen days → goal 5,
  │         even when the template itself has only 4)
  └─ profile exists → Gym tabs: Today / Routine / Exercises / Stats
```

### The daily loop (offline-first)

```
Today: gym.bootstrap (persisted on the phone) → "Next up: <day>" with targets
  → Start → workoutReducer.startSession (warm-ups + prefilled working sets)
  → every tap: reducer action → SQLite KV write (crash-safe, resumable)
  → Finish → summary ("next time" decisions) → outbox.enqueue(doc)
      → optimistic: engine.applyFinishedSession on the cached bootstrap
      → flush when online: gym.session.upsertMany (idempotent by client UUID)
          → server: ownership + clientUpdatedAt checks → write doc
          → advance rotation once (rotationAppliedAt) → recompute progressions
      → invalidate gym.bootstrap
```

### Resume card and Recent (UX-36 A1/A2, T-36.A1.1/T-36.A2.1)

Gym Today's old one-line "Resume workout" banner and single "Last workout" row
are replaced by two components built on the same pure summaries the logger
itself uses, so they can never disagree with what the workout screen shows:

- **Resume card** (`today/resume-card.tsx`, `resumeSummary()` in
  `packages/utils/src/gym/resume.ts`): while a session is active, shows the
  live elapsed time (ticking `mm:ss`/`h:mm:ss`), `{e} of {E} exercises · {s} of
{S} sets` on a `ProgressBar`, and `Now: {exercise} · set {k} of {n}` — the
  same `workoutFocus()` the workout screen's "current" exercise uses. A
  backfilled ("Log a past workout") session — detected as `session.localDate
!== today` (no schema field needed) — shows `LOGGING {weekday d Mon}`
  instead and never ticks. Once every working set is logged the card reads
  `All sets logged · Finish when you're ready.` and the button becomes
  `Finish workout`. "Save for later" (T-36.3) sets a device-only `pausedAt` on
  the active-session record (`offline/active-session-store.ts`); while paused
  the card shows the static `{n} min in`, `Next:` instead of `Now:`, `Finish
with {s} sets`, and `Keeps until {time} tomorrow`. The Resume/Finish button
  always opens the workout screen, which owns the actual finish flow.
- **Recent** (`today/recent-workouts.tsx`, `groupRecentSessions()` in
  `packages/utils/src/gym/recent.ts`): the 3 most recent **completed**
  sessions grouped under day headers (`Today` / `Yesterday` / `{weekday d
Mon}`, never an ISO date), with a start time shown only when two sessions
  share a day, and a PR badge (`collectPrs` against `bootstrap.recentSessions`
  - `olderBests`). `Show more` first pages through the cached
    `bootstrap.recentSessions` (offline-safe), then falls back to the online
    cursor (`gym.session.list`) once the cache (12 weeks) is exhausted, up to 13
    rows inline; beyond that only `All history` (→ Stats) remains. Hidden
    entirely when there are no completed sessions.

Web parity (W2, T-36.A1.3/T-36.A2.2): web Gym Today has the same two
components. `today/ResumeBanner.tsx` is built on the same `resumeSummary()`
(live elapsed time, `{e} of {E} exercises · {s} of {S} sets`, `Now:` focus,
backfill and all-logged variants); web has no "Save for later", so its
`paused` state never occurs (a web session simply stays open in that
browser). `today/RecentWorkouts.tsx` replaces the old single "Last session"
link with the same grouped list (`groupRecentSessions()`, `Show more` cache
first then `gym.session.list`, `All history ›` → `/gym/history`) and a `⋯`
per row (see "Correcting a past workout" below). The week card also has a
`How this works` link opening the same four-row kind-mechanics sheet
(`today/HowThisWorksSheet.tsx`).

### Save for later / carry the rest (UX-36 (3), T-36.3, CI-49)

A cut-short workout is never just finish-or-bin. `workout-screen.tsx`'s
bottom actions are `Finish workout` · `Save for later` · `Discard workout`:

- **Save for later** — `saveForLater()` sets the active-session record's
  `pausedAt` (`offline/active-session-store.ts`, device-only, never
  uploaded) and returns to Gym Today; the Resume card enters its `paused`
  state (see above). Opening the workout screen again (from the Resume card,
  or `/gym/workout` directly) calls `resumeWorkout()`, clearing `pausedAt`.
- **Finish with unstarted exercises** — if any whole exercise has zero logged
  sets (`unstartedExercises()`, `packages/utils/src/gym/carry-over.ts`) AND
  the session belongs to a routine day (a freestyle session has no "next
  session" to carry into), the finish sheet becomes `{n} exercises not
started` + their names + a `Move them to your next session` switch,
  **on by default**. Confirming calls `finish(carryOverExerciseIds)`, which
  stamps `WorkoutSessionDoc.carryOverExerciseIds` on the `finish` reducer
  action (additive field) before the doc reaches the outbox. Turning the
  switch off finishes with nothing carried, same as today.
- **24 h auto-finish** — `checkPausedWorkoutTimeout(queryClient)`, checked
  every time Gym Today comes into focus, finishes a session that's been
  paused for 24 h or more with whatever was logged (D22: half sessions still
  count) and carries over everything never started (there's no dialog to ask,
  so it always carries), showing a one-time snackbar `We finished your
{dayName} with {n} sets.`
- **Server fold** — `workout-session.service.ts`'s `upsertMany` folds
  `carryOverExerciseIds` for every newly-applied `COMPLETED` doc through
  `nextCarryOver()` (consume what the doc addressed, add what it newly
  carries over) and writes `GymProfile.carryOver`; idempotent on re-sends,
  best-effort (a write failure never fails the sync). `gym.bootstrap`'s
  `nextWorkout` (`buildNextWorkout()`) prepends the stored carry-over,
  tagging each exercise `fromLastTime: true` — a carried exercise that no
  longer exists in its source routine day/exercise is dropped silently
  (self-healing after a routine edit). The offline optimistic fold
  (`applyFinishedSession`) runs the identical `nextCarryOver` logic on the
  cached bootstrap so it never drifts from the server's answer.

Edge cases (UX-36): a freestyle session never carries over (no `routineDayId`).
A pause starting while a session is saved for later still lets that session
finish first, on its own terms. Carry-over follows whichever day it's
attached to if that day later moves (T-04.8).

Web parity: not built this wave — `mobile_parity_backlog.md`.

### Missed planned day → a kind next step (T-04.8, UX-04 §7)

A routine day pinned to a specific weekday (`plannedWeekday`, set from
`Training days & reminders`) that's earlier this week and still has no
completed session is "missed" — `missedPlannedDays({ activeRoutine,
recentSessions, today })` (`packages/utils/src/gym/session.ts`), pure and
unit-tested for every weekday including the Monday edge case (nothing can be
missed on the first day of the week) and the Sunday edge case (every
undone planned day of the week is still open to move).

When the missed day **is** the rotation's next day (the usual case — the
rotation doesn't advance until you train), it isn't a separate card at all:
`todayStatus()` returns `training` with `overdueFrom` and the main card offers
it as today's workout, `Planned for {weekday} — today works just as well.`
(owner dogfood 2026-09-29: the old card's `Move it to {day}` was a
`setNextDay` to the day that was already next — a silent no-op — while the
main card said `Rest day` and pointed at next week).

For a missed day the rotation has already moved past (e.g. Lower was done
instead of Monday's Upper), Gym Today shows a `Still time this week` card
(hidden during a pause — already excused) with:

- **`Do it today`** — builds that day locally and starts it (same path as the
  day picker). After a session was already finished today it becomes
  **`Make it next`**, which calls `gym.routine.setNextDay(routineId,
missedDayId)` and confirms with a `{dayName} is up next.` snackbar (needs a
  connection, like Skip).
- **`Not this week`** — no mutation at all (D22: half sessions count, never
  red, no nagging — missing a session changes nothing): the day is dismissed
  for the current week only (`today/missed-day-dismissed.ts`, KV-keyed by
  `weekStartOf(today)`, pruned to the last two weeks on write), with a
  snackbar `No problem — missing a session changes nothing.`

Web parity: not built this wave — `mobile_parity_backlog.md`.

### Done / rest states and the Food Today workout card (bug B-15, T-05.9/T-04.6)

`bootstrap.nextWorkout` always reflects the **rotation's** next day, which
advances the instant `Finish` runs (server-side `rotationAppliedAt`). Left
alone, that means finishing day A today makes Gym Today immediately offer day
B with a `Start` button, on the same day (bug B-15: "Finish workout A ›
Done → Today shows B with Start"). `todayStatus({ bootstrap, today })`
(`packages/utils/src/gym/session.ts`) closes that gap by classifying today
against `recentSessions` and the next day's `plannedWeekday`:

- **`done`** — a `COMPLETED` session already has `localDate === today`
  (checked first, regardless of weekday). Gym Today shows `Done today` with
  the just-finished session's stats (`doneTodayCard()`: duration, working
  sets, PR count via `collectPrs`) and `Next session: {weekday} — {dayName}`;
  no Start button. `See summary` opens that session; `Train again today? Pick
a day` reuses the existing day-picker sheet.
- **`rest`** — nothing done today, and the next day's `plannedWeekday`
  (looked up on `activeRoutine`) is later in the week, or earlier but already
  trained this week. Gym Today shows `Rest day`, a secondary `Start {dayName}
anyway`, which starts that day exactly like the normal Start button, and
  `Train something else? Pick a day or freestyle` (the day-picker sheet).
- **`training`** — nothing done today and the next day IS due today, is
  overdue (pinned earlier this week, not trained yet — `overdueFrom`), or has
  no fixed weekday / nothing is planned at all: the "Next up" card.

The day-picker sheet (from `Do another day instead`, `Train again today?` and
the rest card) lists every routine day plus `Freestyle`, and **starts** the
picked day immediately — built locally by `buildNextWorkout()` (the server's
`nextWorkout` is reused when the pick is the next day, so carry-over is
kept), online or offline. It no longer moves the rotation pointer; finishing
the session advances the rotation from the day actually trained. Exercise-level
changes (swap, skip, add, extra/fewer sets — this session only or the routine)
live in each exercise's `⋯` menu during the workout; the Next-up card says so.

The Food Today dashboard card (`TodaysWorkoutCard`,
`src/features/gym/today/todays-workout-card.tsx`, UX-04 §5 — placed on the
Food dashboard by L-HOME, component owned by L-GYM) shares the same
`todayStatus()` call, so the two surfaces can never disagree: `TRAINING
TODAY`/`TRAINING TONIGHT` (after 16:00 local) with a one-tap `Start workout`
that starts the session directly and pushes `/gym/workout`; `Done today ✓ ·
Next: {dayName} on {weekday}` (whole card taps through to Gym Today, no
button); `Rest day · Next: {dayName} on {weekday}` with a `Train anyway` text
link (→ Gym Today, does not start the session itself).

**Bug B-26** (a stuck spinner at the top of Gym Today after "Done", > 10 s):
the pull-to-refresh spinner used to mirror the bootstrap query's own
`isRefetching` indefinitely, so a hung refetch (host load, a flaky
connection) spun forever. `useTimedRefresh()`
(`src/features/gym/today/use-timed-refresh.ts`) decouples the two — the
spinner always drops after 10 s, whether or not the refetch itself ever
settles.

### Correcting a past workout (UX-44, T-44.1–T-44.5, D-21 a: any past session)

Any completed session can be corrected from where it is listed. No API change
(see §22.1); the client does the work through the outbox.

- **Entry points (mobile).** A `⋯` (44 pt, labelled `Options for {name}, {weekday
d Mon}`) on every completed row of Gym Today `Recent` and Stats › History,
  with `Edit workout` · `Delete workout`; rows also expose `accessibilityActions`
  `Edit` / `Delete`. The session detail header has `Edit` and a `⋯` menu; the
  old bottom-of-screen native `Alert` delete is gone (no `Alert` anywhere in the
  path). One shared hook (`history/use-session-actions.tsx`) owns the menu, the
  confirm and the Undo for all three places.
- **Edit mode (mobile).** `Edit workout` opens `/gym/workout?edit={id}`
  (`workout/edit-session-screen.tsx`): the logger over a **draft** held in
  `use-edit-session.ts` — never the live `activeSessionStore`, so a workout in
  progress is untouched (AC3). No clock, rest timer, auto-advance or
  Why?/Next-time banners. `Cancel · Editing {weekday d Mon} · Save` header with a
  `Change ›` sheet (date chips from Monday of last week to today plus the
  session's own day, and the kit `TimePicker`; `rescheduleSession()` clamps to
  now so the date is never in the future, AC6). Exercise `⋯`: `Replace exercise`
  (straight to the picker, this workout only — the logged numbers carry over,
  the routine link is untouched and no routine option is ever offered, AC5;
  candidates stay in the same family: strength/cardio and timed/untimed),
  `Remove from this workout` (the new reducer action `removeExercise`), add
  set, remove last set, move up/down, note. Sets show as logged; ticking one
  stamps the session's own time. Save: nothing ticked → `Nothing is ticked.
Delete this workout?`; otherwise `saveEditedSession()` re-sends the doc with a
  `clientUpdatedAt` newer than the original (`bumpClientUpdatedAt`) through the
  outbox (offline-safe), updates the cached lists at once
  (`applySessionEdited`), and shows `Workout updated`. Cancel with edits asks
  `Discard your edits?`. Sessions older than the cached 12 weeks open only online
  the first time; a session opened once is in the persisted query cache and
  opens offline; an edit still waiting in the outbox is what re-opening shows.
- **Delete with Undo.** `Delete workout` opens a `ConfirmSheet` that names the
  workout, its sets and — only when they change — this week's count and the
  streak (`sessionDeletePreview()`), plus `Next time targets for its exercises
are worked out again.` Confirming removes the row now (list, week count and
  streak via `applySessionDeleted`), then `Workout deleted` + `Undo` for 8 s. The
  delete is a childless `DISCARDED` tombstone (`discardedTombstone()`) enqueued
  with `holdUntil` = now + 8 s: **Undo within the window sends nothing**
  (`outbox.cancelHeld`); after it the outbox flushes it like any entry, also
  when started offline. Once acked online the client hard-deletes with
  `gym.session.delete` (Q-30) — the pending ids live in KV
  (`gym.pending-hard-deletes`) so a kill between the ack and the delete still
  finishes on the next sync/launch, and a `stale` ack never hard-deletes over
  another device's newer copy (that shows `This workout was changed on another
device. Showing the latest.`). A refetch during the hold or before the sync
  cannot bring the row back: `reconcileWithPending` re-applies queued
  corrections (`applyPendingCorrections`).
- **Next time changed after your edit (PAT-14).** Before enqueueing, the client
  snapshots `bootstrap.progressions[].suggestion` for the touched exercises
  (`snapshotTargets`, KV `gym.target-notice`). Once the outbox acks that session
  and the bootstrap is refetched, Gym Today shows one `ChangeNoticeCard`
  (`today/target-change-notice.tsx`): up to 3 rows before → after, `and {n} more`,
  `Because you edited {weekday}'s sets.` / `Because you deleted {weekday}'s
workout.` `Use the new targets` dismisses; `Keep the old ones` writes the old
  values back as the user's overrides (`gym.progression.setOverride`, needs a
  connection). No card when nothing moved.
- **Web (T-44.5).** `gym/history/[id]` and the rows of the web `Recent` list and
  `/gym/history` list have a `⋯` menu: `Delete workout` opens a sheet with the
  same named confirm, then a toast `Workout deleted` + `Undo` (8 s) that lives in
  the gym layout so it outlives the page. It uses the web outbox
  (`holdUntil`/`cancelHeld`, `workout/session-corrections.ts`) exactly like the
  phone, including the hard delete after the ack. `Edit workout` is shown
  disabled (`In the phone app for now`); web edit mode and the web target-change
  notice are reverse rows in `mobile_parity_backlog.md`.

### Stats › History and set numbering (bug B-41, T-36.5)

Stats gains a `History` segment (a `Chip` toggle next to the 5 default
views): every completed session, grouped by ISO week
(`groupSessionsByWeek()`, `packages/utils/src/gym/history.ts`) newest first,
with the same cache-then-cursor `Load more` as Gym Today's `Recent`
(`bootstrap.recentSessions` first, `gym.session.list`'s cursor once that's
exhausted). Gym Today's `Recent` section's `All history` link opens straight
into it via `router.push({ pathname: '/stats', params: { tab: 'history' } })`
— `stats-tab.tsx` reads it with `useLocalSearchParams` to pick the initial
segment. Web (T-36.7): `/gym/history` is the same list
(`history/HistoryList.tsx`, week-grouped, cache-then-cursor `Load more`),
reached from `Recent` → `All history ›`, each row linking to `/gym/history/[id]`.

**Bug B-41** (session detail numbered sets by their position in the WHOLE
list, so a working set after 2 warm-ups read "Set 3"): `session-detail-
screen.tsx` now numbers warm-ups and working sets with their own counters
each starting at 1 — `Warm-up 1`, `Warm-up 2`, `Set 1`, `Set 2` — the same
convention `setLabelOf()` already uses in the live logger
(`workout/workout-model.ts`).

### Weekday kinds (T-06.9) and gym settings reachability (bug B-19, T-36.1)

`ChefProfile.trainingDayKinds` (`{"5": "long_run"}`, 0 = Monday) records what
kind of training day each weekday is: `lift` (derived from the active
routine's `plannedWeekday`s — never stored, never user-settable), or
user-chosen `run` / `long_run` / `rest`. `training.getDayKinds` /
`training.setDayKinds` (`apps/api/src/application/training-days/
training-days.service.ts`, replacing the wave-0 `application/training/`
stub) back a weekday-kind row in gym settings' "Training days & reminders"
section: 7 cells, lift days shown disabled with a `Lift` label, the rest
tappable to open a sheet (`Run` / `Long run` / `Rest` / `Clear`). Onboarding
(T-03.9) calls the same two procedures, so the two surfaces can never
disagree. The kind-led nutrition bump math itself (T-06.10, e.g. carb-led
refuelling on a run day) is a separate, later L-PLAN2 task — this wave only
wires the read/write and the settings row.

Bug B-19 ("Gym settings unreachable except via the sync-outbox banner") was
already fixed by an earlier task (T-00.9): every gym tab root
(`ModeSwitch`'s gear) and the general Settings hub's "Training" group both
open `/gym/settings`, which already has a real header (back button + title).
This wave's remaining reachability work is the weekday-kind row above.

### Never "0-week streak" (T-36.4)

`streakWeeksLabel(current)` (`packages/utils/src/gym/weeks.ts`) is the one
place a streak count becomes copy: a streak of 0 reads `Your streak starts
when you hit this week's goal.` instead of the demoralising "0-week streak"
that mobile's Gym Today, and web's today-view, workout summary and
`ConsistencyGrid` all used to render verbatim (`${streak.current}-week
streak`, no zero guard, three separate copies of the same bug). Mobile's
`today-helpers.ts` `formatStreakLine()` layers the flex-week suffix on top of
it; the web call sites call it directly.

A `How this works` link on the Gym Today week card (`today/how-this-works-sheet.tsx`, T-36.4
remainder) and the Stats consistency legend both open the same `ExplainSheet`: weeks-not-days
(hit the weekly goal, missing a session changes nothing), flex weeks (one every 4 weeks), pause
(nothing counts against you) and half sessions counting — the two links can never disagree
because they render the identical sheet component.

### Skip with Undo, and a paused state on Gym Today (bug B-45, T-36.4)

`Skip this day` used to swap the next workout with no confirmation, feedback
or way back (B-45). It now shows a `Snackbar` (`@chefer/ui-mobile`, PAT-4)
naming both days — `Skipped {dayName} · Next: {dayName}` — with an `Undo`
action that calls `gym.routine.setNextDay` back to the skipped day (a no-op
offline, same gate as Skip itself).

Gym Today also reads `bootstrap.activePause` (already computed server-side —
"the pause covering today") to show a `Training paused` card in place of the
next-up/done/rest card, with the resume date, the reason if one was given,
and an `End pause` button (`gym.pause.end`) — previously only the settings
screen surfaced an active pause; Gym Today itself showed the normal
next-up flow underneath it.

- The routine is a **rotation, not a calendar**: "next up" is the next day in
  sequence; missed days roll forward and are never marked failed.
- Outbox entries are removed only on an `applied`/`stale` ack; a `rejected`
  doc is parked for the user — workouts are never dropped silently.

### In the active workout (`gym/workout`, G2-A)

```
Set row: [− weight +] [− reps +] ✓  (prefilled from the suggestion)
  ✓ → completeSet with the shown values → rest timer (working sets only) + haptic
  − / + → next ACHIEVABLE load for the equipment (engine stepUp/stepDown);
          a weight OR reps change carries to the later unticked sets that had the
          old value (bug B-20, T-05.7 — reps used to be the one field that didn't
          propagate; web now carries both too, via the shared `propagateEditActions`
          pattern in `workout-model.ts`)
  tap weight → plate calculator (barbell/smith) or keypad; tap reps → keypad
  Held loads (Back Extension, BODYWEIGHT_PLUS with `heldLoad: true`) offer the
    weight stepper without a dip belt (Q-28, T-05.7) — a real belt/vest exercise
    (weighted dip/pull-up) still needs one
Last working set ticked → optional RIR chips (0/1/2/3+), highlighted while calibrating;
  the finished exercise stays open until answered / "Not now" / ticking elsewhere
⋯ menu → swap (just today | today + routine), skip, add/remove set, move, note, history
  "today + routine" → gym.routine.save (online only; one CONFLICT rebase onto the
  server's routine, else the swap stays today-only)
Finish → confirm if working sets are unticked → finish() → summary
  Web renders the summary in place and only rewrites the URL (history.replaceState), so
  finishing with no connection shows the summary, not the browser's error page (F-GYM-5-1)
  Live PR badges and the summary's PRs compare against recent sessions AND the bootstrap's
  `olderBests` (all-time), so an old best is never re-celebrated (F-GYM-6-1)
  Summary "Next time" reads the optimistically folded cached progressions, phrased as
  "next time" not "today" (T-05.1 AC2); Adjust → gym.progression.setOverride (online only)
  Adjust's weight is typed, not stepper-only (T-05.4, CI-31, AC6): mobile taps the
  value to open the same NumberSheet keypad the live logger uses (plate calculator
  for barbells too); web's `Stepper` gains an opt-in `onValueChange` (a real
  `<input type="number">` in place of the read-only value, other callers unaffected)
  wired on the Adjust weight field. Either way 40 → 150 kg takes a handful of
  keystrokes instead of ~44 ± presses; the ± steppers stay for small nudges. Reps
  stay ± only on both platforms (adjusting a whole set of reps at once by typing
  one number is not obviously the right UI, and the ± range is small)
Android back / ⌄ → minimise (the session stays resumable from Today); Discard is confirmed
Remove any set (logged or not) → mobile: long-press its row, its ⋯, or swipe the row left
  (`SwipeToRemove`, PAT-16, Δ2.6 — PanResponder + Reanimated, no native gesture-handler dep;
  claims the gesture only on clear horizontal intent so it never fights the workout
  `ScrollView`, and is always paired with the ⋯/long-press path, which alone satisfies every
  acceptance criterion). Web: tap its set number (menu) → "Remove set". Every path removes the
  set immediately, no confirm dialog: a snackbar/toast offers `Undo` for 8 s, restoring the set
  at its position with its values and tick (`restoreSet`, UX-05 A1/T-05.A1.2). Warm-ups and
  working sets alike; positions stay contiguous. The exercise ⋯ menu's "Remove last set" removes
  the last unlogged set, or the last set once every set is logged.
```

### Progression: the working weight and "next time" (T-05.1, B-07/B-08)

The engine's working weight `W` for a session is the **heaviest** completed working set, never
the lightest — a deliberate back-off/drop set logged after the top set (lighter by more than one
load step) is excluded from `W` and from the reps the miss/stall rules judge (`ENGINE_VERSION`
2 → 3). A set logged heavier than the day's prescription, even on an otherwise incomplete
exposure, is better evidence than the plan: the next target starts from what was actually lifted,
not from "same targets" (the `INCOMPLETE` reason code now branches on `liftedHeavier`). A timed
exercise with a degenerate range (no real duration was ever set, e.g. a misconfigured custom
exercise) gets no load guess and no invented "Aim for 1 s" — a normal-range timed exercise
(Farmer's Carry, a weighted plank once a load has been logged) is unaffected (T-05.A2.1, O-02;
the fuller cardio shape is W2/W5's `T-42.x`).

### Supersets (G4-B)

```
Routine editor (mobile + web): "Superset with next" on any exercise but the day's last
  → adjacent exercises share a letter (routineExercise.supersetGroup: A, B … per day)
  → violet bracket + A1/A2 chips + "Superset A · <rest> s rest after each round"
  reorder / remove / cross-day move → groups re-normalised (a pair left with one dissolves;
  a step move hops over a whole superset; a drag dropped between members joins it)
Active workout: grouping derived from routineExerciseId via the cached routine
  (the session doc has no superset field; exercises added mid-session never join one,
  and moving members apart in the session breaks it for that session)
  tick set k of A1 → no rest, focus + scroll to set k of A2 (a running rest is cleared)
  last exercise of round k ticked → rest timer with the superset's LAST exercise's rest
  focus walks round by round (A1·1, A2·1, A1·2 …); skipped members drop out of rounds
Also shown outside the workout, same bracket/chip/heading, read-only (no reorder there):
  Routine tab day cards (mobile `(gym)/routine.tsx`, web `gym/routine/components/DayCard.tsx`)
  Today's "Next up" exercise list (mobile `today-screen.tsx`, web `today-view.tsx`'s NextUpCard,
  via the shared `SupersetHeading` component)
```

Shared logic: `@chefer/utils` `gym/supersets.ts` (`setSupersetWithNext`,
`moveSupersetItem[To]`, `removeSupersetItem`, `sessionSupersets`, `setTickOutcome`,
`workoutFocus`, `supersetRuns`, `supersetSlot`).

"Notes from last time": `SessionSummaryDto.exercises[].notes` (additive, optional —
shipped mobile clients predate it) carries each exercise's session note through
`toSessionSummary` (`@chefer/utils` `gym/session.ts`). The workout screens (mobile
`exercise-card.tsx`, web `workout/components/exercise-card.tsx`) show the most
recent non-empty note for that exercise from `bootstrap.recentSessions` as a muted
"Last time: <note>" line under the exercise name.

On web the floating chat widget is hidden on `/gym/workout*` (`ChatWidgetGate`).

### Progression (deterministic, explainable)

Double progression inside the slot's rep range (research §1): all sets at the
top → add the smallest achievable load; otherwise add reps. The optional
last-set RIR chip (0/1/2/3+) only adjusts (bigger jump when easy, consolidate
at failure). Misses hold once then drop ~10 %; three stalled exposures reset to
90 %; breaks > 2 weeks re-enter lighter and fast-track back. Every suggestion
carries a reason code shown as one sentence plus a "Why?" sheet.
`ExerciseProgression` is a derived cache — the server re-folds the engine over
completed sessions, so late offline syncs and deleted sessions stay consistent.

### Editing at three levels (D5)

| Level    | Where                                                                                        | Effect                                                              |
| -------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Routine  | Routine tab → editor (`gym.routine.save`, optimistic version)                                | Days, exercises, sets, rep ranges, rest, order, planned weekdays    |
| Week/day | Today → "Do another day" / "Skip" (`gym.routine.setNextDay`); pre-start and in-session edits | Session-only unless the user picks "Update routine"                 |
| Targets  | Summary "Adjust" / routine "Next targets" (`gym.progression.setOverride`)                    | Overrides the next prescription once; the engine resumes afterwards |

### Consistency mechanics

Weekly goal = routine days/week; the week ring fills per session; the streak
counts consecutive goal-met weeks. Flex weeks (earn 1 per 4 met weeks, hold 2)
auto-cover a short week; pauses (`gym.pause.*`) freeze the streak. No daily
streaks, no red "missed" markers.

- **Pause, end early:** `GymBootstrap.activePause` (additive DTO field, G4-A)
  carries the id/dates/reason of the pause covering the client's `today`, so
  both mobile settings and web settings can show "Paused until <date>" with an
  **End pause** button (`gym.pause.end`) regardless of which device started
  it — the web's earlier "only pauses created in this browser" workaround
  (localStorage bookkeeping) is gone.
- **Reminders (mobile only, local `expo-notifications`, G4-A):** one
  notification per planned weekday over the next 14 days at the profile's
  `reminderTime`, skipping a day already trained or inside a pause, plus at
  most one gentle "missed yesterday" nudge the day after a missed planned
  day (never the same day as a planned reminder — max one notification a
  day, never guilt copy). `useGymReminders()` cancels and reschedules
  everything whenever the bootstrap's reminder-relevant fields change or the
  app foregrounds; permission is requested only from the settings toggle and
  the setup wizard's reminder step, never on cold start. Web shows "Reminders
  are sent by the Chefer phone app" — it stores the preference but sends
  nothing itself.
- **Quiet-days nudge (T-36.2, bug B-40):** an independent, gym-settings-only
  toggle — `Nudge me if I've gone quiet for` `3 days` / `5 days` / `a week` /
  `Never` (`GymProfile.quietNudgeDays`, `null` = off; new setups default to
  5). `computeQuietNudge()` schedules exactly one notification that many days
  after the last finished session (`Fancy a short one today? Your {dayName}
is ready — about {min} min.`), never during a pause, never late if it's
  computed after the due date already passed while offline.
  `computeAllGymReminders()` merges it with the planned/missed reminders
  above, deduped to at most one notification a day (a same-day planned
  reminder wins); it reschedules on the same triggers (finish, launch) as
  everything else in `useGymReminders()`, independent of the main
  `reminderEnabled` toggle. Web parity: not built this wave —
  `mobile_parity_backlog.md`.
- **Rest-timer permission rationale (bug B-40):** the rest-timer's own
  background-notification permission used to be requested cold, at workout
  start (`use-active-workout.ts`'s `startWorkout()`). It's now asked with a
  rationale sheet (`workout/rest-permission-sheet.tsx`: `Want a buzz when
your rest is over, even with the phone locked?` / `Allow notifications` /
  `Not now`) shown once, in context, the first time a rest actually begins
  (`workout/rest-timer-bar.tsx`) — never cold, never more than once per
  device.
- **Streak repair — "Log a workout you already did" (mobile + web, G4-A;
  was "Log a past workout"):** pick a date in the current or previous week,
  today included (never the future), then a routine day or freestyle. Today
  starts a normal session now (an 18:00 backdate could be in the future);
  an earlier date starts a session backdated to that date's `localDate` with
  `startedAt` at 18:00 local (`use-active-workout.ts`'s `backfillDate`); the
  user logs the actual sets in the normal workout screen and finishes like
  any other session. The engine folds it into `summarizeWeeks` by the week it
  happened in and into progression by `performedAt` — never by upload order —
  so a backfill logged after today's session still lands in the right place
  chronologically.
- **Contextual offers:** at most one of comeback / deload / stall / recap is
  shown at a time, in that priority order (`pickOffer` in `@chefer/utils`,
  shared by mobile and web so they never disagree — the web previously just
  took `offers[0]`, found and fixed during G4-A verification). A deload
  accepted from Today (`gym.progression.startDeload`) flips
  `nextWorkout.isDeload` and prescribes deload targets (half the sets,
  ~90% load, reps at the floor) on the very next bootstrap read.

### Stats explained (T-05.6, CI-36, bug B-16)

```
Strength trend: e1RM per session for a picked lift, PR dots, 3m/1y/all, a
  bodyweight overlay and a "Strength per kg of body weight" toggle (renamed
  from "Relative strength" — same e1RM ÷ bodyweight math)
  Caption "Estimated 1-rep max (e1RM)" — mobile's "(e1RM)" is a GlossaryTerm
    (packages/utils/src/glossary.ts's existing `e1rm` entry); web is plain text
  Mobile: no interactive tap-tooltip on the chart yet (the shared LineChart
    primitive has no touch targets) — a caption under the chart instead names
    the latest point ("{date} · {weight} × {reps} → e1RM {value}"). Web's
    Recharts <Tooltip> already shows point detail on hover/tap
PR timeline / summary: a lift's first-ever logged set now counts as a PR
  (bug B-16's sibling bug: `kindsBeaten` used to require a prior exposure to
  "beat", so a genuinely new lift never got a badge and a real PR-holder
  could still see "No PRs yet"). `PersonalRecord.isFirst` (additive) flags it;
  the timeline shows "First logged" instead of the usual weight/reps/e1RM
  kind label. Ranked PRs (weight beaten, more reps at a weight already held)
  still need real prior history — there's no "first" version of those
Weekly sets per muscle (mobile only — web's chart shows one group at a time):
  a legend under the stacked bar (colour swatch + `VOLUME_GROUP_LABELS` name,
  wraps), using the same `seriesColors` map the bars themselves use so the
  colours always match
```

### Exercise library: photos, search and the swap sheet (T-05.11, T-05.A3.1, T-05.10)

- **Photos, everywhere (T-05.11, UX-05 A6):** one shared `ExerciseImage`
  (mobile: `apps/mobile/src/features/gym/components/exercise-image.tsx`; web
  twin: `apps/web/src/features/gym/library/ExerciseImage.tsx`) renders every
  exercise thumbnail and hero photo at a true 3:2 — never the square crop
  that used to cut off a third of the frame. No photo, a custom exercise, or
  a slug in `HIDDEN_EXERCISE_IMAGE_IDS` (a wrong-photo audit hit —
  `packages/types/src/gym/exercise-catalog.ts`) shows a designed icon
  placeholder (by equipment) instead of a blank tile or a letter. A load
  failure retries once silently, then falls back to the placeholder and
  fires `exercise_image_failed` (analytics id: the slug, or `'custom'`).
  Surfaces: Exercises tab/list, swap sheet, workout exercise card, technique
  sheet, detail hero (mobile: `PhotoCrossfade`; web: its own twin, same
  contract).
- **Swap sheet / Exercises tab keyboard collapse (T-05.A3.1, mobile):** both
  screens' filter chips normally wrap or stack onto several rows; while the
  keyboard is up (`use-keyboard-visible.ts`) `CollapsibleChipFilters`
  (`apps/mobile/src/features/gym/library/collapsible-chip-filters.tsx`)
  collapses them into one horizontal strip (MO-05 + a FLIP re-layout, `base`
  timing, instant under reduced motion) so at least 5 results stay visible
  above the keyboard. Search inputs carry a real accessible label, a 4.5:1
  placeholder (`#4b5563`, not the default gray-400) and a clear (✕) button
  once there's a query.
- **Library staples (T-05.10, UX-05 A5):** `incline-barbell-bench-press`
  (searchable by "incline bench"; shares the `incline-press` swap group,
  sorted before the dumbbell version) and `back-extension` (`BODYWEIGHT_PLUS`
  so "+ Add weight" loads a held plate; searchable by "hyper", "back ext" and
  "roman chair"; `hinge` swap group) — additive catalog rows only, synced in
  by the existing boot upsert (§ ensureExerciseLibrary, infrastructure.md).
- **Tappable exercise names (T-05.5, mobile):** an exercise name is a real
  link to `/gym/exercise/[id]` (`ExerciseNameLink`,
  `apps/mobile/src/features/gym/components/exercise-name-link.tsx`) in Gym
  Today's "Next up" card, the setup wizard's program preview, the
  post-workout summary's PR list and "Next time" rows, and now the routine
  editor's exercise cards (`day-editor.tsx`'s `ExerciseRow`, T-05.5 follow-up
  — its name is its own tap target, a sibling of the expand/collapse
  Pressable, never nested inside it) — so a name the user doesn't recognise
  is never a dead end. Not yet done: web parity for the tappable link itself
  (`mobile_parity_backlog.md` reverse row — the web routine editor's compact
  card, below, shows the full name but not yet as a link); the glossary
  (`packages/utils/src/glossary.ts`) gained gym terms (`amrap`,
  `workingSet`, `warmUpSet`, `tempo`, `calibrating`) but nothing in a gym
  screen renders a `GlossaryTerm` for them yet, and "first-sight" long-form
  copy tracking in the gym offline KV is unbuilt.
- **Routine-editor card, redesigned (T-05.3, UX-05 A4, O-23):** exercise
  cards are compact by default (`{n} sets · {min}–{max} reps · {rest} s
rest`) and expand **one at a time** (opening another collapses the first).
  The expanded card is a labelled two-column grid (`Sets`/`Rest between
sets`, `Reps from`/`to`, the grouped `ValueStepper`) with `Target effort
(RIR)` and `Superset with next` tucked under `More ▸`. Move up/down, Swap
  and Remove live in a per-row `⋯` sheet; the expanded card also shows
  `Swap exercise`/`Remove` as text buttons. Removing a row is immediate (no
  confirm — the routine only changes on Save) with an 8s Undo snackbar
  (`restoreExercise`, mirroring the workout reducer's `restoreSet`); a newly
  added exercise opens expanded. The day footer is a full-width `+ Add
exercise` (never wraps) plus the live `~{n} min` (`estimateDurationMin`)
  and the day's own `⋯` (`Duplicate day`, `Delete day`). Mobile:
  `apps/mobile/src/features/gym/routine/day-editor.tsx`,
  `reducer.ts`'s new `restoreExercise` action. Web (phone widths only —
  `DesktopEditorBoard.tsx`'s dense always-open grid is unchanged):
  `features/gym/routine/components/{PhoneEditorList,ExerciseFieldsForm}.tsx`
  gain a `compact`/`expanded` mode with the same hierarchy, minus the `⋯`
  sheet (Swap/Remove are already accessible as text buttons once expanded;
  Move stays the existing up/down buttons).

## 22. Gym Setup & Workout Sync Flow (API)

Server side of gym_plan.md §4/§5.2 (services in `apps/api/src/application/gym/`). Every
`gym.*` procedure is `protectedProcedure` and free (D9). Progression, weeks, PRs and volume are
computed by the pure engine in `@chefer/utils`; the API loads, calls it and persists.

```
Setup: gym.profile.recommend (engine only) → user picks template/days/weekdays
  → gym.profile.completeSetup  ── ONE transaction:
        GymProfile (unit-default plates, goalHistory, knownWeights in offerState)
        + active Routine from the template (pointer = day 1, others deactivated)
        + ExerciseProgression initialState per (exercise, rep bucket)
  → returns GymBootstrap (the phone persists it)

Workout (offline on the phone) → Finish → outbox → gym.session.upsertMany({ docs })
  per doc, oldest first:
    unknown exercise / duplicate ids / bad range ─► rejected (reason)   phone parks it
    id owned by another user ────────────────────► rejected: forbidden
    stored clientUpdatedAt newer ────────────────► stale                phone drops it
    same clientUpdatedAt (retry) ────────────────► applied (no write)
    else: upsert row + delete/recreate children ─► applied
          COMPLETED routine session & rotationAppliedAt empty
             → Routine.nextDayId = engine nextDayIdAfter(day)   (exactly once)
  then ProgressionService.recompute(touched exercises):
    all completed exposures → group by rep bucket → engine foldHistory → state
    (overrides consumed by a newer exposure are cleared)
  then (T-36.3) for every newly-applied COMPLETED doc, oldest first:
    GymProfile.carryOver = engine nextCarryOver(carryOver, doc)
      — consumes exercises the doc addressed, adds doc.carryOverExerciseIds
      (best-effort; a write failure here never fails the sync)
  → phone invalidates gym.bootstrap → next workout + prescriptions for `today`,
    with GymProfile.carryOver prepended (tagged fromLastTime) by buildNextWorkout
```

- **Re-syncs are harmless:** the same doc twice is one write; the rotation never advances twice
  (even after later edits of the finished session).
- **Delete / discard** of a completed session re-folds its exercises; the rotation pointer is not
  rewound.
- **Routine editing** is a whole-document save with `expectedVersion`; a stale version returns
  `CONFLICT` with `error.data.conflict.current` (the server's `RoutineDto`) so the client can offer
  "keep mine / take theirs". Moving the pointer (`setNextDay`, finished workouts) never bumps the
  version.
- **Offers** in the bootstrap (deload, stall, comeback after > 8 days, monthly recap on days
  1–7) are dismissed by key via `gym.progression.dismissOffer`; `startDeload` makes the next 7 days'
  prescriptions deloads.

### 22.1 Correcting a past session (UX-44, Δ2.3) — no new API surface

Edit and delete both ride the existing `gym.session.upsertMany` sync path above; nothing new was
added to the API for this.

> Built (W2 L-GYM part 2): mobile edit mode + delete, web delete. The client-side
> pieces are in `apps/mobile/src/features/gym/offline/session-corrections.ts`
> (`deleteSessionWithUndo`, `saveEditedSession`, pending hard deletes, the
> target-notice snapshot) and its web twin
> `apps/web/src/features/gym/workout/session-corrections.ts`. The tombstone is
> sent childless (`discardedTombstone()`): the server replaces children and
> recomputes from the exercises it stored before, so it works without the full
> doc (offline, sessions older than the cache). Both platforms' outboxes take
> `holdUntil` (an entry is not sendable until then) and report `stale` acks via
> `onStale`.

```
Edit a completed session:
  load the stored doc → change it on the client → bump clientUpdatedAt → outbox.enqueue(doc)
  → gym.session.upsertMany applies it like any other sync (last-write-wins on clientUpdatedAt)
  → recompute folds the EDITED history — a 600 → 60 kg fix changes the next-time target
    the same way a fresh fold over the corrected numbers would (AC8)

Delete a completed session (with an 8 s Undo):
  the delete is held on the device (outbox OutboxEntry.holdUntil, T-44.2 — additive, `v` stays 1)
    → Undo within the window: outbox.cancelHeld(id) removes the entry before it is ever sent
    → after 8 s (or immediately if the app is killed and relaunched past the window):
         outbox re-sends the SAME doc with status: 'DISCARDED' and a bumped clientUpdatedAt
         → gym.session.upsertMany applies it — every list/bootstrap/stat already excludes
           DISCARDED, and recompute folds the exercises as if the session never happened
         → once that write is acknowledged AND the device is online, the client calls
           gym.session.delete (hard delete) so no DISCARDED row lingers (Q-30)
  Offline the whole way: the DISCARDED upsert is itself an outbox entry, so a delete started
  offline still "sticks" locally (dropped from the next bootstrap.recentSessions/session.list)
  even before the hard delete can run.

Target-change notice (PAT-14): the client snapshots bootstrap.progressions[].state.next for the
touched exercises before enqueueing the edit, diffs against the next bootstrap refetch
(packages/utils/src/gym/session-edit.ts targetDiff()) and offers "Keep the old ones" →
gym.progression.setOverride per row — no server change.
```

The delete confirm's preview lines (this week's session count and streak, before/after) are a pure
client-side re-fold: `sessionDeletePreview()` (`packages/utils/src/gym/session-edit.ts`) rebuilds
the current week's row from `bootstrap.weeks`/`.streak` with one session subtracted and re-runs
`settleWeeks()` (`weeks.ts`) — the same fold the server uses — so the sheet can say "this drops you
from a 3-week streak to 2" before the delete is even sent.

### 22.2 Cardio delivery (UX-42 minimal slice, T-42.1/T-42.2)

12 catalogue entries (`packages/types/src/gym/cardio-catalog.ts` + the `cardio()` builder in
`exercise-catalog.ts`) ship through the same sync/bootstrap machinery as strength exercises — a
cardio `SessionSet` is one row (`weightKg: 0, reps: 0, isWarmup: false`) carrying `durationSec` /
`distanceM` / `intensityRpe` instead. The only new behaviour is what a client is SENT: `gym
.bootstrap`, `gym.library.list`, `gym.session.get` and `gym.session.list` each drop rows/exercises
whose `trackingType` isn't renderable at the caller's `x-chefer-api-level` (`renderableTrackingTypes()`,
§9) — a mixed session (bench + bike) still shows its bench part to an old client, the bike part
just isn't there, and week/streak counts are unaffected either way. Progression has no cardio
state to recompute (Δ2.2); PR/e1RM/volume code needs no special case since a cardio set's
`weightKg: 0, reps: 0` already produces nothing in those pure functions.

**Mobile logging (T-42.3, behind `cardioLogging`, off by default).** A cardio exercise's card in the
active workout renders `CardioEntry` (`src/features/gym/workout/cardio-entry.tsx`) instead of the
usual set rows — `Timer | Enter`, an absolute-timestamp wall-clock timer that survives a kill
(`cardio-timer.ts`, the same pattern as the existing rest timer, counting up with pause/resume
instead of down), duration chips, a distance/level stepper when the catalogue entry uses them, and
`EffortChips` (Easy/Moderate/Hard + an exact 1–10 expansion). "Log it" is one `completeSet` action
carrying the cardio fields instead of weightKg/reps (`workout-reducer.ts`'s `completeSet`/`editSet`
gained an optional `CardioSetFields` intersection for this). History (`session-detail-screen.tsx`)
renders time/distance/effort for a cardio exercise instead of `0 kg × 0`. The custom exercise
form's "How do you track it?" chips (`trackingType`, replacing the old `isTimed`-only checkbox) and
a `Cardio` filter chip (exercise picker + Exercises tab) are also behind the flag. The mobile bundle
sends `x-chefer-api-level: 3` as of this change (Δ2.1) — bumped in the same commit as this UI, per
the rule that a level is only ever sent by a bundle that implements it. **Not done this wave:** web
rendering/logging at all (T-42.5, tracked as a reverse `mobile_parity_backlog.md` row), the
mixed-session `{done}/{planned}` header, and Stats/PR views for a cardio exercise (W5's T-42.8).

---

## 23. Weekly Emails & Notifications Flow (P2-5)

> Added 2026-09-26 (audit backlog P2-5; F-PM-14, F-PLAN-4-3, PM review §7 #9).
> The outbound retention channel, for **both tiers**: Monday "your week is
> ready" and a Sunday recap, by email and (opt-in) as phone notifications.

### Email

```
Sunday ≥ 08:00 UTC  WeeklyPlanWorker builds next week (premium: AI, learned;
                    free: curated) — §9
Monday ≥ 07:00 UTC  WeeklyEmailWorker → WeeklyEmailService.sendWeekReady
Sunday ≥ 17:00 UTC  WeeklyEmailWorker → WeeklyEmailService.sendWeeklyRecap
  (hourly tick; fixed UTC hours because no per-user time zone is stored —
   08:00/09:00 and 18:00/19:00 in Central Europe)

recipients = users with a CONFIRMED address (emailVerified)
             AND the email's switch on (weeklyEmailReady / weeklyEmailRecap)
             AND no EmailSend row for (kind, this week)
for each:
  build → nothing to say?  skip (no plan this week / an empty recap week)
        → claimSend (insert EmailSend; @@unique → a second tick or a restart
          loses the claim and sends nothing)
        → send (EMAIL_PROVIDER: Gmail SMTP / Resend; console mock in dev)
            └─ failure → release the claim, the next tick retries
  daily cap (EMAIL_DAILY_CAP, 400 for Gmail): budget = cap − 50 − sends in
  the last 24h. Budget spent, or the provider says "sending limit" →
  stop BEFORE the next claim (a failed user's claim is released); the rest
  go out on later hourly ticks, for up to 48h (a capped Sunday recap
  finishes Monday for the week that ended).
```

- **Monday** lists one dinner per day, the shopping-list estimate in the
  user's currency (`formatMoney`) and where the week came from: premium
  Sunday week "planned around your targets and the N dishes you rated", free
  Sunday week "a fresh week of recipes … fit your allergies and daily
  targets" (plus one quiet premium line), a followed template, or the user's
  own week. Links: the plan and the shopping list.
- **Sunday** recaps meals logged, days within ±10% of the calorie target,
  weight vs the previous weigh-in (in the user's units), completed workouts
  (Gym users only) and next week's planned dinners. Premium: a pointer to the
  chef review on Progress; free with ≥ 3 logged days: one line on what the
  review adds. Never guilt copy — a quiet week gets an encouraging line.
- Every weekly email has an unsubscribe link and a `List-Unsubscribe` header.

### Confirmation, opt-out, account deletion

```
signup (auth.register) ─► confirmation email: APP_URL/verify-email?token=…
                          (signed, 7 days, bound to the address)
Preferences "Send confirmation link" ─► notifications.resendConfirmation (3/h)
/verify-email ─► notifications.confirmEmail { token } ─► emailVerified = now
password reset completed ─► emailVerified = now (if unset)

email "Unsubscribe" ─► /unsubscribe?token=… (public, no login)
   └─ the page calls notifications.unsubscribe { token } from the browser
      (so link-prefetching mail scanners can't unsubscribe anyone)
      → flips the Monday, Sunday or both switches; "Undo" re-subscribes
Preferences (web + mobile) ─► notifications.setEmailPreferences
                               └─ logs a ConsentEvent per switch present in the
                                  call (kind EMAIL_WEEK_READY / EMAIL_RECAP,
                                  §28) — the digest IS the consent, so
                                  switching it off is withdrawing it
```

Deleting the account (§24) hard-deletes the user (cascade), so there is nobody left
to email. Accounts created before P2-5 are unconfirmed: they see the
"Confirm your email" prompt in Preferences and get nothing until they confirm.

### Phone notifications (mobile)

Local repeating notifications — no push tokens, no server state:

```
Preferences → Weekly updates → "On this phone" switch
  on:  ensureGymReminderPermission() (asked HERE, never on launch)
       ├─ denied → "Turn them on in your phone's Settings", stays off
       └─ granted → schedule two WEEKLY notifications (data.app = weekly-digest)
            Monday 08:00 local  "Your week is ready"   → /meal-plan
            Sunday 18:00 local  "Your week in review"  → /progress
  off: cancel the weekly-digest notifications (gym reminders untouched)
  state = whether they are scheduled (nothing else is stored)

tap → useNotificationLinks (root layout, signed in only) → router.push(url)
      (cold start: the launch response, deferred until the Stack mounts)
```

Off by default; unlike email they use the phone's own time zone.

### Manual trigger (ops / live verification)

No API procedure. From `apps/api`:

```
pnpm exec tsx --env-file=.env src/scripts/send-weekly-emails.ts ready  [--user=a@b.c] [--dry-run]
pnpm exec tsx --env-file=.env src/scripts/send-weekly-emails.ts recap  [--user=a@b.c] [--dry-run]
```

Runs one sweep now regardless of day and hour; opt-outs, confirmation and the
per-week claims still apply (delete the `email_sends` row to resend).
`--dry-run` prints the rendered text without claiming or sending.

---

## 24. Account Deletion Flow (App Store 5.1.1(v))

> **Status:** Implemented on web and mobile (audit P0-6, hardened 2026-09-26).

```
Profile → Your data → "Delete account"  (web /profile, mobile Profile — last card)
  │
  └─ Sheet (ACCOUNT_DELETION_COPY, shared): "This permanently deletes your Chefer
     account. It can't be undone." + the list of what goes (profile/preferences/
     body metrics; plans, shopping lists, logs, weights, pantry; own + imported
     recipes, favourites, ratings; workouts, routines, custom exercises;
     household, feedback, sign-in on every device) + "Backup copies age out
     within about 30 days."
     Inputs: password + type DELETE (case-insensitive) → destructive button
        │
        └─ user.deleteSelf { password, confirm: 'DELETE' }
              ├─ wrong password            → FORBIDDEN "That password is not correct"
              ├─ caller is the last ADMIN  → BAD_REQUEST (promote someone first)
              └─ deleteAccount(userId) — ONE transaction:
                    shopping_lists (by the user's planIds; no FK)
                    recipes where creatorId = user AND source = MANUAL
                    ingredient_prices where creatorId = user (private custom)
                    verification_tokens 'reset:<email>'
                    workout_sessions, routines (before the user: RESTRICT FKs)
                    sessions (every device)
                    users row → cascades everything else
                 then deleteUploadedFiles(): the /uploads files behind the
                 avatar, own recipes and custom ingredients (best effort,
                 P0-6) — then authService.logout clears the web cookie
        │
        ├─ web:    window.location.assign('/') — full navigation drops every cache
        └─ mobile: clear SecureStore token + queryClient.clear() (incl. persisted
                   gym reads) → router.replace('/(auth)')
```

**Households:** `HouseholdMember` rows are the account's own extra eaters (name,
portion, allergies) — no other account is linked to them, so they are simply
deleted with the owner. There is no ownership to transfer.

**Kept:** AI-generated recipe rows (shared recipe content, no personal data)
remain with `creatorId` nulled. Backups roll off within about 30 days: the VM
keeps 14 nightly dumps and the off-site mirror keeps 30 (`/privacy`, P0-6). Admins deleting a user (`user.delete`) run the same purge.

**Linked analytics (T-12.5, added 2026-09-28):** BEFORE the transaction (its
`ConsentEvent` row cascades away with the user), `deleteAccount` reads whether
the account ever linked analytics to itself (latest `ANALYTICS_LINKED` event,
`granted: true`). If so, AFTER the commit it calls
`posthogAdmin.deletePerson(userId)` (`infrastructure/analytics/posthog-admin.ts`)
— best effort, logged, never blocks or reverts the deletion. A no-op (logged)
when the account never linked, or when `POSTHOG_PERSONAL_API_KEY` /
`POSTHOG_PROJECT_ID` aren't configured (`infrastructure.md` §10).

---

## 25. AI Data Consent Flow (App Store 5.1.2(i))

> **Status:** Implemented on web and mobile 2026-09-26. User-initiated AI
> procedures are gated in the clients only (the API does not re-check them).
> Server-initiated jobs check consent themselves: the Sunday auto-plan skips
> premium users without consent (§9) and the weekly review writes their text
> from the template instead of the AI (§14). Other background AI calls carry
> no personal data (recipe images from AI recipe names; the global ingredient
> price vocabulary).

```
user taps an AI action ──► requestAiConsent(feature, run, { usesAi })
  │
  ├─ usesAi false (free curated plan / free swap) ─────────────► run()
  ├─ user.me.aiDataConsentAt set ──────────────────────────────► run()
  └─ null (never asked, or revoked)
        └─ consent Sheet (AI_CONSENT_COPY):
             "Allow AI to use your data?"
             "To <action>, Chefer sends some of your data to <primary>, a
              third-party AI service, which uses it only to produce the result."
             (<primary>/<backups> from profile.aiProviders — Google Gemini +
              Groq by default; Groq + Cloudflare Workers AI when the API runs
              AI_FREE_ONLY=true)
             What gets sent: <per-feature list, AI_CONSENT_FEATURE_DATA>
             "Your data is not used to train AI models."
             backup-provider line · "You can turn this off at any time in
             Profile → AI & your data." · Privacy policy link (/privacy)
             ├─ Not now → close; nothing sent, nothing recorded
             └─ Allow  → user.grantAiDataConsent → run()
                         (mobile: after the sheet is fully dismissed, so the
                          camera can present next)
```

| Feature (`AiConsentFeature`) | Web entry point                                              | Mobile entry point                                    |
| ---------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| `meal-plan` (premium only)   | Meal plan Generate/Regenerate, `/meal-plan?generate=1`       | Plan tab empty-week Generate, Week summary Regenerate |
| `meal-swap` (premium only)   | Recipe page "Swap Recipe", Replace meal "Regenerate with AI" | Replace meal sheet "Regenerate with AI"               |
| `meal-scan`                  | Tracker scan (after the file is picked, before upload)       | Snap-to-Log card (before camera/library opens)        |
| `recipe-import`              | Import recipe sheet preview (URL / text / photo / video)     | Import recipe screen preview (URL / text / video)     |
| `chat`                       | Chat widget send + suggested prompts                         | AI Chef screen send                                   |
| `shopping-list`              | Shop "Regenerate list"                                       | Shop "Regenerate with AI"                             |

The first plan after onboarding is generated from the Plan tab / dashboard
"Generate my week", so it is covered by `meal-plan`. Not gated (no personal
data): AI nutrition estimate for a custom ingredient (ingredient name only) and
recipe image generation.

**Revoking:** Profile → "AI & your data" → "Allow AI features to process my
data" switch (web + mobile) → `user.revokeAiDataConsent` / `grantAiDataConsent`.

**Who is named (2026-09-26):** the sheet, the Profile switch's "on" text, the
web privacy page ("AI processing" + "Who receives your data") and the support
FAQ never hard-code a provider. They read `profile.aiProviders` (public), which
the API derives from its live route table, and fill the shared templates in
`@chefer/types` `AI_CONSENT_COPY` via `@chefer/utils` (`aiConsentIntro`,
`aiConsentBackupLine`, `aiConsentToggleOn`). Until it answers, or against an
API that predates it, clients show the standard set (Gemini, Groq backup).

**When the AI is out of capacity** (every provider in a chain busy or past its
free daily quota): the user sees "The chef is over capacity right now — give it
a minute and try again." (never a raw error), and the day's quota reservation is
refunded — plans, swaps, imports and ingredient estimates on any failure,
chat messages and meal scans on capacity failures only (other failed attempts
still count). The Sunday auto-plan stops asking for premium plans for that tick
and retries the rest on the next hourly tick; the ingredient-price worker backs
off 90 s → doubling → 1 h.

---

## 26. Usage Analytics Consent Flow (P0-6, T-12.2/T-12.3)

> **Status:** Implemented on web (2026-09-26) and mobile (2026-09-28,
> T-12.2/T-12.3 — mobile no longer "sends no analytics"; the
> `mobile_parity_backlog.md` row for this feature is now `done`). Details and
> the legal reasoning: `infrastructure.md` §15 "Privacy & analytics consent".
> Every switch change is also logged server-side (§28) so the choice is
> provable, on top of the local storage that actually enforces it.

**Web**

```
page load ──► initAnalytics(): PostHog EU, persistence 'memory'
  │           (no cookies / localStorage / sessionStorage; DNT → nothing sent)
  │
  ├─ signed out ──────────────────────────► anonymous events, in-memory ID
  │
  └─ auth.me resolves ──► identifyUser(id, planTier)
        ├─ chefer.analytics-anonymous:<id> = 'denied' → capture() sends nothing
        ├─ chefer.analytics-consent:<id> ≠ 'granted' (default)
        │     └─► no identify(): anonymous events only
        └─ 'granted' ──► posthog.identify(id, { planTier })  (ID + tier only)

Profile → "Usage analytics" (AnalyticsConsentCard)
  "Send anonymous usage counts" (Q-8 default: ON)
    ├─ off → setAnonymousAnalyticsConsent(id, 'denied') → also forces "linked"
    │        off; capture() sends nothing at all, not even anonymous counts
    └─ on  → resumes anonymous counting
  "Link usage to my account" (default: OFF, disabled while anonymous is off)
    ├─ on  → setAnalyticsConsent(id, 'granted') → identify now
    └─ off → setAnalyticsConsent(id, 'denied')  → posthog.reset() (new anonymous ID)
  each change also calls privacy.recordAnalyticsConsent({ anonymous?, linked? })
logout → resetAnalytics() → posthog.reset(); anonymous choice resets to ON for
         the next (anonymous) visitor
```

**Mobile** — a pure-JS transport (`apps/mobile/src/lib/{analytics,analytics-transport}.ts`,
T-12.2), not the PostHog SDK: no native module, no runtime-fingerprint change.

```
app/_layout.tsx ──► initAnalytics(): starts the 30s flush timer + background flush
                     track('app_opened', {})
  │
  distinct_id = a random session id, generated once per cold start,
                NEVER written to storage (AC1)
  │
  consent (device-local, default { anonymous: true, linked: false } — Q-8):
    anonymous off  → track() queues nothing, fetch is never called (AC3)
    linked on + signed in → distinct_id becomes the account id on the very
                             next event (AC2); off → sign-out resets it to off

Profile → Privacy & data → "Usage analytics" (AnalyticsConsentCard, mobile)
  same two switches as web; each change also calls
  privacy.recordAnalyticsConsent and fires analytics_consent_changed
```

The choice is stored per account/device only (another browser, another phone,
or a new device starts at the Q-8 defaults). The card links to
`/privacy#analytics`. No advertising identifiers, no App Tracking
Transparency prompt, anywhere (AC7).

---

## 27. Safety filter & reporting flow (UX-01/UX-02, T-01.1–T-01.10, T-02.1–T-02.5, T-22.1)

> One matcher, one merge, one service. Every surface that shows or picks a
> recipe answers "is this safe for the table" the same way — see
> `infrastructure.md` §7 "SafetyService" for the code, and §7's
> "CuratedRecipes" for the taxonomy-driven matcher itself.

```
DietaryPreferences (owner) + HouseholdMember[] (P2-3)
  │
  └─► SafetyService.loadContext(userId)
        ├─ mergeHouseholdSafety: allergies ∪ dietaryRestrictions ∪ dislikedIngredients
        │     (ALL THREE now a HARD union across owner + every member — owner
        │      decision 2026-09-27; dislikes used to be owner-only)
        ├─ hiddenRecipeIds ← safetyReportRepository.findRecipeIdsByUser(userId)
        │     (UX-01 d: a reported recipe is gone for THIS user, everywhere,
        │      the moment safety.report lands — never for anyone else)
        └─ table ← every stored term run through recogniseSafetyTerm()
              (taxonomy synonym map — "nuts", "no eggs", "green vegetables"
              all resolve to their canonical category; unrecognised text is
              kept as a `notes` entry, never silently dropped — C5e)

Every surface calls the SAME SafetyContext:
  recipe.list({forTable:true}) / recipe.discover ──► SafetyService.filter()
  pantry.whatCanIMake ──────────────────────────────► SafetyService.filter()
  recipe.importPreview / recipe.importSave (BOTH variants) ─► filter + fail-closed reject on `adapted`
  mealPlan rebalance (rebalanceWeek) ────────────────► SafetyService.loadContext().prefs
  curated plan generation, AI swap fallback ─────────► safeCuratedPools() / findSafetyIssues() (unchanged path)

  NOT yet wired (handoff, outside L-SAFE's file ownership this wave):
  ChatService.buildContextSummary — still reads the OWNER's DietaryPreferences
  only, not the household union (T-BUG-X1's chat half)

Reporting a recipe (T-01.5):
  recipe detail overflow (mobile) / Report button (web) ──► safety.report
        { recipeId, surface, reason, note? }
    └─► SafetyReport row written (rulesSnapshot = the table's SafetyPrefs NOW)
    └─► next SafetyService.loadContext() includes it in hiddenRecipeIds
    └─► recipe.list({forTable:true}) / discover / whatCanIMake never show it again for this user
```

**Dislikes: hard everywhere `SafetyService.filter` runs with its default
`opts.dislikes: 'hide'`** (generation, the Replace picker's default list,
`whatCanIMake`); **soft** ("mark") on `recipe.discover` — UX-01's rule that a
SEARCH surface should chip a dislike rather than hide it, while generation
never serves a disliked dish at all. The regression suite
(`safety.regression.test.ts`) prints a per-profile pool-size report so a
content gap (e.g. "vegan + coeliac") is caught in CI, not by a user hitting
the "pick recipes yourself" fallback (`MIN_SAFE_POOL_SIZE`, unchanged from P1-2).

**Hidden gluten (bug B-47, T-01.9 rev 2):** `check()` returns `labelCaveats`
for a plain "gluten-free" restriction when a recipe has a label-dependent
ingredient (stock, curry powder, soy sauce, baking powder, oats, chocolate,
sausages) — shown as "Check the label", never a silent pass. A coeliac-
strength restriction (`gluten-free-coeliac`, what the `coeliac` CONDITION
implies) excludes those ingredients outright instead, as does any plain
gluten-free profile once `DietaryPreferences.excludeLabelDependent` is on.

**UI status:** both the server half (matcher, `SafetyService`,
`safety.getTable`/`report`/`confirmReview`) and the client surfaces below are
now built on both platforms (mobile `apps/mobile/src/features/safety/**`, web
`apps/web/src/features/safety/components/**`), sharing one copy module
(`@chefer/utils` `safety-copy.ts`) and one picker-state helper
(`safety-classify.ts`, `classifySafetyValue`/`serialiseSafetyPickerValue`).

**Detail-surface Checked line (T-02.3).** `mealPlan.getRecipe` (another
lane's file) is not touched — the Checked line and the coeliac label caveat
are a separate, additive query instead:

```
recipe.getSafetyChecks({ recipeId })
  └─► RecipeService.getSafetyChecks(userId, recipeId)
        ├─ findRecipeVisibleTo (recipe-access.ts) — NOT_FOUND if the user can't see it
        ├─ SafetyService.loadContext(userId) → table
        └─ table.hasRules ? SafetyService.check(recipe, table) : { safetyChecks: null }
              (also null when checked/unchecked/conflicts are ALL empty —
              nothing to show, AC1)
```

`app/recipe/[id].tsx` (mobile) and `recipes/[id]/page.tsx` (web) render
`CheckedForLine` from this query under the tag chips — but only when the
EXISTING `recipe.allergenWarnings` conflict banner isn't already showing
(AC3: the two are never both on screen). Cook mode (`app/cook/[id].tsx`)
renders the same line at the top of the ingredient list. A recipe's
`labelCaveats` render as a `LabelCaveat` line under Checked (AC8, coeliac's
"Check the label: certified GF …").

**Filtered lists say so (T-02.5).** `recipe.discover` keeps returning a plain
array (old clients unaffected); a separate `recipe.discoverHiddenCount(filters)`
diffs the safety-filtered pool against the unfiltered one and returns
`{ hiddenCount, filteredFor }` for the `FilteredForLine` Discover renders on
both platforms (AC7), opening the same `WhatWeCheckSheet`.

**SafetyPicker (T-01.7).** The onboarding diet step, Settings › Allergies &
diets, and the household member editor all render the same structured entry
(mobile `safety-picker.tsx`, web `StepDiet` — same component name kept so
every caller's props are unchanged): Allergies/Diet/Won't-eat `ChipGroup`s
over `SAFETY_TAXONOMY`, a live read-back panel, and a "Something else" field
wired to the recogniser's five outcomes (allergy/dislike chip, diet base,
diet modifier — including the AC2 "no eggs" base-diet disambiguation —
UX-22's condition notice, coeliac's automatic `gluten-free-coeliac` mapping,
and the unrecognised term's Keep-as-a-note/Remove flow). A household editor
always shows a "You" card first (UX-01) and a table read-back summary line
once `safety.getTable().hasRules`.

**Legacy migration card (T-01.3).** Mounted in Settings › Allergies & diets
on both platforms (`MigrationCard` / `SafetyReviewCard`); the Food Today
mount point is a wave-2 (L-HOME) handoff. Shown while
`safety.getTable().needsReview` is true: every stored term is mapped through
`recogniseSafetyTerm` client-side for display; "Looks right" calls
`safety.confirmReview` directly, "Change" opens the SafetyPicker pre-applied
(the same stored values) and saves through `preferences.updateSafety` before
confirming in the same flow (AC9).

**Report a safety problem (T-01.5, AC10).** A 44pt header overflow on recipe
detail (mobile) / a "Report" button in the action row (web) opens
`ReportSafetySheet`: a reason `ChipGroup` + optional note, `safety.report`
hides the recipe from the reporter's plans/swaps immediately and both
`recipe.list` and `mealPlan` caches are invalidated so it disappears at once.

**Not yet wired this wave (handoffs):** `ChatService.buildContextSummary`
still reads only the owner's `DietaryPreferences` (T-BUG-X1's chat half —
`application/chat/**` is L-ENTRY's file, outside this lane's ownership); the
import preview/Cheferize draft still shows only the pre-existing conflict
banner (`ImportSafety.ok/issues`), not a positive Checked line — a UX-02
nicety not built this wave.

### Plan / Replace / Shop surfaces (wave 2, L-SAFE2 — T-01.5/T-01.8/T-01.9/T-01.10/T-02.1/T-02.4/T-02.5)

The wave-1 handoff above ("Replace picker, plan meal-card long-press report
entry and shopping-list `Check label` chip are L-SAFE2's wave-2 tasks") is
done this wave. `application/meal-plan/**` and `application/shopping-list/**`
now call `SafetyService` the same way every other surface does (§7's
`MealPlanService`/`ShoppingListService` notes) instead of a locally re-merged
`SafetyPrefs`:

```
mealPlan.{getActive,getForWeek,getById,generate,restore,planDay}
  └─► assemblePlanDto / buildCuratedWeek / generateBlocking's own DTO
        ├─ SafetyService.loadContext(userId) → { prefs, hiddenRecipeIds, table }
        ├─ per meal: decorateRecipeDto(dto, recipeData, ctx)
        │     ├─ SafetyService.decorate() → derivedTags / tagQualifiers (T-01.10)
        │     ├─ allergenWarnings? (unchanged matcher, now also on
        │     │     replaceRecipe/swapRecipe — they returned neither before)
        │     └─ table.hasRules ? SafetyService.check() → safetyChecks? : (nothing)
        └─ response.tableSafety = table   (top-level, §2.2)

mealPlan.{replaceRecipe,swapRecipe,getRecipe}  → same decorateRecipeDto call

Reported-recipe exclusion (T-01.5/AC10) reaches the curated pool, not just
`recipe.list`/`discover`:
  buildCuratedWeek / planDay / swapCurated / enforcePlanSafety(unsafe-AI-slot
  replacement) ──► pool.filter(id not in hiddenRecipeIds) before a pick
  enforcePlanSafety is ALSO `tailorDay`'s safety pass (plan-tailoring.service.ts
  → MealPlanService.tailorDay) — a reported recipe is excluded from a fresh
  instant/curated week AND from every later live-tailored day, not only the
  week that was active when it was reported.

recipe.list({forTable:true}) / recipe.discover
  └─► rows gain safetyChecks? (same table.hasRules gate)
  └─► NEW recipe.listHiddenCount mirrors discoverHiddenCount for the
        Replace picker's FilteredForLine (AC7)

shoppingList.getForWeek
  └─► response.tableSafety = table
  └─► per item: labelCheck? = gluten-free diet labels this ingredient needs
        a certified product for (LABEL_DEPENDENT_INGREDIENTS, bug B-47/T-01.9)
```

**Read-only, never a plan edit.** Every field above is computed fresh on each
read from the CURRENT table and the CURRENT stored recipe rows — none of it
is written into a plan's stored day JSON. This matters for two things this
wave depends on: (1) the Replace picker hiding a failing row is a pure
`recipe.list({forTable:true})` read, so it never counts as the user editing
the day; (2) `plan-tailoring.service.ts`'s compare-and-set
(`isTouched`/`replaceDayIfUnchanged`, §21-adjacent "instant week, live
tailoring" flow) keeps comparing the day's stored slot JSON exactly as
before — safety decoration never touches it, so a tailored day's Checked/
conflict state is always derived fresh on the next read, never stale from
tailor time (proven by
`meal-plan.service.test.ts`'s `"delta-4: a day replaced by tailorDay shows
the CORRECT Checked/conflict state on a later read"`).

**Client surfaces.** Plan surfaces: the week view shows
`SAFETY_COPY.weekCardTitle` ("Checked for your table") above the badges row
when `tableSafety.hasRules`; each `PlanMealCard`/`MealCard` shows
`CheckedForChip` from `recipe.safetyChecks.checked` (a conflict still shows
the pre-existing `AllergenWarningChip`/banner instead, AC3 — the two are
never both on screen, same rule as the detail-surface Checked line above).
Report a safety problem (T-01.5) is also reachable from a plan meal card's
long-press (mobile) — the same `ReportSafetySheet` as the recipe-detail
overflow, `surface: 'plan_card'`. Replace sheet: `FilteredForLine` from
`recipe.listHiddenCount` above the search results (AC7), `CheckedForChip` per
row; it already hard-excludes unsafe rows (`forTable: true`) and, since
dislikes are hard there too (§ above), there is nothing left to soft-chip.
Shopping list: a header Checked/needs-a-look line from `tableSafety`, and a
compact `LabelCaveat` ("Buy certified gluten-free") on any line carrying
`labelCheck`.

---

## 28. Consent Log & Data Export Flow (§2.13, T-39.2/T-39.5)

> **Status:** Implemented 2026-09-28 (L-DATA). Every consent write in
> Chefer — AI, the two analytics switches, the two weekly-email switches,
> Terms/Privacy/age (§32), health (wave 3) — goes through one service, so
> the log is complete and the export can show it.

```
ConsentService.record({ userId, kind, granted, source, documentVersion?, providers? })
  └─ consentEventRepository.record(): append-only INSERT — a revoke never
     erases the earlier grant row. `source` is always `ctx.isMobileClient ?
     'mobile' : 'web'`, decided at the router, never a client-supplied field.

Callers (this wave):
  user.grantAiDataConsent / revokeAiDataConsent  → kind AI        (on a real transition only)
  notifications.setEmailPreferences              → kind EMAIL_WEEK_READY / EMAIL_RECAP (§23)
  privacy.recordAnalyticsConsent                 → kind ANALYTICS_ANON / ANALYTICS_LINKED (§26)
  privacy.acceptTerms                            → kind TERMS + PRIVACY (+ AGE) — the
                                                     re-accept-after-a-version-bump path
Callers (other wave-1 branches, same stable signature):
  auth.register (L-ENTRY)                        → kind TERMS / PRIVACY / AGE, at sign-up (§32)
  preferences.setAutoPlanWeekly (L-TRACK)         → kind AUTO_PLAN

Profile → Privacy & data → "Consent history" (mobile: consent-history.tsx;
web: privacy.getConsentHistory is served, UI port tracked in
mobile_parity_backlog.md) → privacy.getConsentHistory → every ConsentEvent,
newest first, in plain language ("AI features allowed (Groq, Cloudflare)",
"Usage analytics: anonymous on", "Weekly email (Monday): off", …).
```

`user.dismissEmailDefaultsNotice` (§32) is NOT a `ConsentEvent` writer — it
only marks the one-time notice shown (`User.emailDefaultsNoticeAt`). The
actual consent change it can trigger ("Turn them off") goes through
`notifications.setEmailPreferences` above, which IS logged.

**Boot backfill** (`consent-backfill.service.ts`, unchanged from wave 0):
every non-null `User.aiDataConsentAt` gets a `source: migration` AI
`ConsentEvent` with the ORIGINAL timestamp, idempotently, so the log is the
source of truth even for pre-existing accounts.

### Data export (bug B-53)

```
Profile → Your data → "Download my data" / "Export my data"
  │
  └─ user.exportData ──► exportAccountData(userId)
        food (chefProfile, dietaryPreferences, householdMembers, mealPlans,
              dailyLogs, weightEntries, favourites, ratings, pantryItems,
              recipes, chefReviews, shoppingLists — resolved through the
              user's own meal-plan ids, since ShoppingList has no userId)
        gym  (gymProfile, routines, workoutSessions, exerciseProgressions,
              trainingPauses, customExercises)
        feedback
        privacy (consentHistory — every ConsentEvent; emailPreferences;
                 aiCallLog — type/provider/time only, never model output)
  │
  ├─ web:    Blob download, filename chefer-export-YYYY-MM-DD.json,
             then a Toast "Your export is ready."
  └─ mobile: shareExportFile() (src/lib/share-file.ts)
        iOS:     expo-file-system writes the named file to the cache dir,
                 then Share.share({ url }) — a real, named, saveable file
        Android: Share.share({ title, message }) — same content, titled
                 text share until expo-sharing lands (wave 4, T-39.5)
        then the Snackbar "Your export is ready."
```

---

## 29. Your Own Targets & Change Notices Flow

**§2.11 (UX-35 "Set my own targets", UX-11 "Never change it silently"), wave 1
(L-TRACK).** One resolver, an own-target override that nothing can move
silently, and a provable change log.

```
resolveTargets(profile, lifterBodyweightKg?)      [preferences.service.ts]
  ├─ suggested = live Mifflin-St Jeor TDEE ± goal adjustment ± the coach's
  │    cumulative dial, macros from the goal's split; lifter g/kg protein +
  │    BMI ≥ 30 adjusted-weight rule when lifterBodyweightKg is given
  ├─ effective = profile.targetMode === 'OWN'
  │      ? { customKcal, customProteinG, customCarbsG, customFatG }
  │          (falling back per-field to `suggested`)
  │      : suggested
  └─ inputs = { weightKg, heightCm, age, activity, goal, isLifter,
       proteinGPerKg, usedAdjustedWeight, rate } — what the Explain sheet names

resolveDailyTargets(profile, lifterBodyweightKg?) = resolveTargets(...).effective
  → every existing consumer (dashboard, tracker, meal-plan generation, the
    coach review, TrainingNutritionService) picks up the own-target override
    with ZERO call-site changes (AC1: one number, everywhere)

targets.set({ targetMode, kcal, proteinG, carbsG?, fatG?, trainingKcal?,
              trainingProteinG?, addTrainingBonus? })
  ├─ gate: ownTargetsFree flag (free tier) OR premium
  ├─ validate: kcal 1,200–5,000; protein 40–400 g; when carbs/fat are given,
  │    protein*4 + carbs*4 + fat*9 must be within ±10% of kcal (AC4)
  └─ writes ChefProfile.{targetMode, custom*}; the legacy dailyCalorieTarget
       stays in step with the new effective value (old clients read the
       right number)

Every read of the targets (targets.get, tracker.getDay — dashboard.summary
is a handoff, not yet wired) recomputes and detects a silent change:
  targetsService.detectAndRecordChange(userId, profile, resolved)
    ├─ first read ever → write the baseline snapshot (ChefProfile
    │    .targetSnapshot = { effective, suggested, inputs }), no notice
    ├─ SUGGESTED-mode user, effective moved since the snapshot → TargetChange
    │    { kind: CHANGED, reason: GYM_SETUP|WEIGHT|GOAL|DAY_KIND (inferred
    │    from which input changed) } — the new number is ALREADY showing
    │    everywhere (AC1); weight-driven notices debounce to 1/7 days
    ├─ OWN-mode user, suggested drifted ≥5% since the snapshot → TargetChange
    │    { kind: SUGGESTED } — purely informational, effective never moved
    │    (AC2: a gym setup or weigh-in can never silently change an own target)
    └─ snapshot advances either way

targets.acknowledgeChange({ id, keep })
  ├─ keep: true  = "keep what I already have"
  │    CHANGED   → writes the row's `before` numbers back as the OWN override
  │                ("Keep {before}" restores exactly, AC1)
  │    SUGGESTED → declines (a coach proposal never applies)
  └─ keep: false = "use the new/suggested value"
       CHANGED   → no-op (already effective); just resolves the row
       SUGGESTED + reason COACH → applyCoachProposal: bumps
         ChefProfile.targetAdjustmentKcal by the latest ChefReview's
         proposedAdjustmentKcal, then chefReviewRepository.resolveProposal
```

**The coach proposes, never overwrites (T-35.4, §14 cross-reference).**
`CoachService.runWeeklyReview` stops writing `targetAdjustmentKcal` directly —
the computed adjustment becomes `ChefReview.proposedAdjustmentKcal` and a
`SUGGESTED`/`COACH` `TargetChange` (AC3: a coach review never writes targets).

**Goals (T-35.2).** `RECOMP` and `PERFORMANCE` join the four original goals —
both maintenance-calorie (0 kcal adjustment), lifter protein 2.0 g/kg (RECOMP)
/ 1.8 g/kg (PERFORMANCE). A client below `x-chefer-api-level 1` (a fixed
client-side GOALS list that predates the two) sees `MAINTAIN` in
`preferences.get`'s `chefProfile.goal`; the additive `goalV2` field carries the
true value.

**Surfaces:**

- `TargetsCard` (Settings › Preferences, both platforms) — Suggested
  (read-only) / My own (editable kcal/protein/carbs/fat) via `targets.get`/
  `targets.set`; client-side bound checks before the round trip.
- `ChangeNoticeCard` (tracker, both platforms) — the latest unresolved
  `targets.changes` row, "Keep {before}" / "Use {after}" buttons.
- `TargetExplainSheet` (tracker, both platforms) — "Why this number" (UX-11
  AC3): the resolved numbers + the formula sentence (`@chefer/utils`
  `explain-targets.ts`), with a never-an-upsell action to Settings.
- **Handoff to L-HOME (wave 2):** the dashboard ring/macros should call
  `targets.changes` + render `ChangeNoticeCard`, and wire a "why" tap to
  `TargetExplainSheet` fed by `targets.get` — the same pattern as the tracker.
  `dashboard.summary` itself should also call `detectAndRecordChange` so a
  change is caught even for a user who never opens the tracker that day.
- **Known gap:** `ChefReview.adjustmentKcal` doesn't get set to the applied
  amount when a coach proposal is accepted (the repository only exposes
  `resolveProposal`, which sets `proposalResolvedAt`) — it stays 0. A
  `packages/database` follow-up should add that.

---

## 30. Food Logging: Search, Edit, Undo, Copy Day Flow

**§5.15b (UX-19 "Log fast, fix mistakes"), wave 1 (L-TRACK).** Every logged
entry is addressable, editable and undoable; a day's log can be copied to
another day; the last things logged surface first.

```
Every LoggedMealEntry gains an optional `entryId` (stable, assigned server-
side). Old entries (no id) are backfilled lazily: tracker.getDay checks
needsEntryIdBackfill and, if true, writes ensureEntryIds(current) back through
dailyLogRepository.mutateDay before returning — best-effort, a failed backfill
never fails the day read (the client still gets in-memory ids for that
response). New entries (logCustomMeal, copyDay's copies) get one at write time.

tracker.recents({ limit? })                          [T-19.1]
  └─ scans the last 60 days' DailyLog rows, aggregates by recipeId or
     normalized custom name (aggregateRecents, @chefer/utils merge-log.ts),
     most frequent first (ties → most recent) — the search-first Log sheet's
     "Recent" group. A deleted entry simply isn't in the scanned days any
     more; no separate filtering needed.

tracker.updateCustomMeal({ date, entryId, name?, estimatedBy?, mealType?,
                           kcal, protein, carbs, fat })       [T-19.2, B-34]
  └─ finds the entry by entryId (must be a custom entry — a planned-recipe
     entryId answers NOT_FOUND; those are edited by re-ticking a portion)
     and replaces its fields in one mutateDay transaction

tracker.restoreCustomMeal({ date, entry })                    [T-19.2, B-34]
  └─ the bin's `Undo` snackbar (8 s): the client already holds the exact
     deleted entry (its snapshot, including entryId) and sends it back;
     idempotent — restoring the same entryId twice never duplicates the row.
     AC2: restore reproduces the entry exactly.

tracker.copyDay({ fromDate, toDate })                         [T-19.3]
  └─ copies every entry from fromDate onto toDate, each with a FRESH entryId
     (so the header's own Undo can delete exactly the copies, not the
     originals) and no slotIndex (the target day's plan slots differ)

tracker.unlogRecipe({ date, recipeId, mealType, slotIndex? })  [T-19.4, B-23]
  └─ the one-save model's untick: removes exactly the entry logRecipe would
     have written for that slot (matchesRecipeSlot, shared identity rule with
     logRecipe — same slotIndex, else same recipeId + mealType). A no-op, not
     NOT_FOUND, when nothing matches (an already-unticked row).

tracker.deleteEntries({ date, entryIds })                      [T-19.3]
  └─ removes any entries (recipe or custom) named by stable id — undoes
     copyDay (deletes exactly the returned `copiedEntryIds`) and any other
     batch a client already holds ids for. Idempotent: an unmatched id is
     silently ignored.

tracker.weeklySummary / monthlySummary({ localDate? })   [§2.12, T-21.1, B-33]
  └─ optional localDate anchors the trailing-N-day window on the CLIENT's
     local day instead of the server's UTC one (a user whose local day has
     turned over relative to UTC used to see a window shifted by a day);
     omitting it keeps the old server-UTC-anchored behaviour exactly

getDay.hasActivePlan                                          [T-19.6]
  └─ whether the user has an active meal plan at all, distinct from today
     just having nothing scheduled. The tracker's empty state reads as an
     invitation to log ("No plan today — log from Recent or search below.")
     for a Track-only user who may never generate a plan, instead of a
     plan-focused message that pushes them toward one.
```

**Macro sanity check (bug B-39, T-19.5).** `checkMacroSanity` (`@chefer/utils`
`quick-add.ts`) compares a quick-add/edit entry's stated calories against the
4/4/9 rule from its macros; a mismatch beyond ±25% (and above a small floor,
to avoid false positives on tiny entries) is advisory only — "These don't add
up: N kcal logged, but the macros add up to M kcal" with `Fix` / `Log
anyway`, never a hard block. `formatQuickAddGrams` shows one decimal below
10 g (a supplement scoop matters), whole grams at or above it.

**Ingredients search carries per-100g macros (T-19.1).** `ingredients.search`
rows now include `per100g` (null when the catalog row has no macro data yet)
so the Log sheet's grams row can show a live kcal as the user picks
50/100/150/200 g. Fixed alongside (T-BUG-X7): `search()` now goes through
`ingredientPriceRepository.searchCatalog` instead of querying `prisma`
directly.

**Search-first Log sheet (T-19.1, both platforms).** `quick-add-sheet.tsx` /
web `QuickAddSheet.tsx` open on a search field with **Recent** (one tap re-logs
the same amount, AC1), **This week's plan** and **Your recipes** (portion
chips ½ ¾ 1 1½ 2, log at a chosen portion), and **Ingredients (per 100 g)**
(grams chips 50/100/150/200 + a live kcal preview from `ingredients.search`'s
`per100g`). "Enter calories yourself" is the old calories-only form, kept as
the fallback when nothing matches — gated by the macro sanity check above
(`Fix` focuses the calories field, `Log anyway` bypasses it for that submit).
Never a branded product or barcode (B-29, AC6): the Ingredients group is
Chefer's own catalog only.

**Edit any entry, undo any delete (bug B-34, T-19.2, both platforms).** Every
custom entry (quick-add, photo scan) is tappable → `edit-entry-sheet.tsx` /
web `EditEntrySheet.tsx` (name, meal, calories, macros — the sanity check
applies here too), with `Save` and a destructive `Delete`. Deleting — from the
sheet or the row's own bin icon — removes the row immediately with a
snackbar/toast `Deleted {name}` + `Undo` that calls `restoreCustomMeal` with
the exact snapshot held client-side (AC2). A planned-recipe row is still
edited by re-ticking it with a different portion, matching the API's
`updateCustomMeal` NOT_FOUND rule for a non-custom entryId.

**One-save model (bug B-23, T-19.4, both platforms).** `app/tracker.tsx` /
web `tracker/page.tsx` no longer have a `Save Day` button. Ticking a planned
meal calls `tracker.logRecipe` immediately (portion chips already visible on
the row) with a snackbar/toast `Logged {mealType}` + `Undo`; unticking calls
the new `tracker.unlogRecipe` immediately, also with an `Undo`. A tick
persists across a date change or an app kill because it was already written
to the server the moment it happened (AC3) — the client no longer holds
unsaved state to lose.

**Copy a day (T-19.3, both platforms).** A header action (mobile: the ⧉ icon
next to the title; web: the same icon by the page heading) opens a confirm
sheet naming the previous day (`yesterday`, or a short date further back) and
calls `tracker.copyDay`; the result's snackbar/toast `Copied {n} entries` +
`Undo` calls the new `tracker.deleteEntries` with the returned
`copiedEntryIds` — deleting exactly the copies, never the originals.

**Known gap — training-day target pair has no UI (T-35.3 remainder).**
`targets.get`/`targets.set` already read and write `customTrainingKcal`,
`customTrainingProteinG` and `addTrainingBonus` (§29), but
`TrainingNutritionService.targetsForDay` / `buildTrainingDayNutrition`
(`@chefer/utils` `training-nutrition.ts`) — the function that actually
computes a lifter's training-day bump, shared by the dashboard and the
tracker — never reads them. Building `TargetsCard`'s "Different on training
days" fields now would ship a control with zero effect. Needs a resolver
change before the UI can honestly ship (handoff, see `mobile_parity_backlog.md`).

---

## 31. Manual recipe create and edit (UX-40 slices 1–2, T-40.1–T-40.10, T-BUG-O3)

> The D-19 minimum, the pickers, photo states, the sectioned mobile rebuild
> and the O-15 ("edit doesn't work") fix, on both platforms (slice 1). Slice
> 2 (W2 L-RECIPE) brings mobile's ingredient lines to web parity: a
> catalogue search sheet, a custom-ingredient sheet with a premium
> AI auto-fill, computed nutrition, and swipe-to-remove — closing the
> `mobile_parity_backlog.md` row opened in slice 1.

```
D-19 minimum — recipe.create / recipe.update (additive widening, T-40.3):
  name (required) + ≥ 1 ingredient line with a name AND an amount > 0
  description / instructions / cuisineType default to '' / [] / ''
       (an empty cuisineType is stored as "International")
  servings defaults to 1; nutritionInfo defaults to all-zero + optional `source`
  Old clients: unaffected — nothing already required got a new `.min(1)`.
  Web (T-40.6): validateRecipeCore + both pages' own checks relaxed to the
  same minimum — cuisine, description, steps, times and nutrition (computed
  or manual) are all optional now, closing the parity gap ("36 boxes").

Diet tags (bug B-01, T-01.6):
  mobile/web form ── ticks Diet tags (ChipGroup) ──► payload.dietaryTags
  recipe.update:
    x-chefer-client: mobile AND clientApiLevel === 0 AND dietaryTags === []
        └─► KEEP the stored tags (old binaries hard-code [])
    otherwise ──► trust the payload, including an intentional []
  tagConflicts(ingredients, tags) ──► amber "Chicken breast doesn't look
        vegetarian" hint while editing (client-side only, not the safety matcher)

O-15 "Edit created recipe is not working properly" — all 7 candidates fixed
  on both platforms, and kept working through the mobile sectioned rebuild:
  C1 stale prefill  → getMyRecipe refetchOnMount:'always'; prefill gated on
                       isFetchedAfterMount && !isFetching; update invalidates
                       recipe.getMyRecipe + mealPlan.getRecipe + recipe.list
  C2 tags wiped     → T-01.6 above
  C3 "½" → 0        → parseQuantity() (fractions, mixed numbers, comma decimals)
  C4 save "dead"    → KeyboardAwareScrollView keyboardShouldPersistTaps="handled";
                       the footer button is NEVER disabled (PAT-17) — a blocked
                       tap scrolls to + focuses the first problem instead
  C5 blank form     → ErrorState "Couldn't load your recipe" + Try again on a load error
  C6 fiber → 0      → the STORED fiber is sent back on every edit (create still 0, D-18)
  C7 raw server msg → friendlySaveError() — a long/Zod-shaped message becomes
                       "Couldn't save your recipe. Nothing you typed is lost."

D-18 fiber: no input, no default display, on either platform (mobile form,
  mobile recipe detail's macro row, web's new/edit forms, web's detail page
  MacroChip). The field is still SENT (0 on create, the stored value on
  edit) so nothing already saved is destroyed, and web's separately-computed
  nutrition still has it under the hood.

Photo field (T-40.5, apps/mobile/src/features/recipes/form/photo-field.tsx):
  empty ──pick──► local preview (dimmed) + uploading ──► done (Change/Remove)
                                                      └─► failed: one of four
       server-written sentences (never a code or [object Object]), Try again
       re-sends the SAME bytes, Choose another re-picks. Saves without a photo
       either way. pick → (T-BUG-O1.2 placeholder: preparePhoto(asset) once
  feat/device-photo-resize lands) → upload stay three separately named calls.

AC4 refinement (packages/utils/src/recipe-form.ts): a named ingredient line
  with no amount ("salt", blank qty) always blocks saving with "Finish the
  ingredient on line {n}." — even when another line is already complete.
  recipeMissingFields()'s 'incompleteLine' flag is independent of the
  generic 'ingredient' flag (which only fires when NO line has a name at
  all); firstIncompleteIngredientLineIndex() finds which row to focus.
```

**Mobile — sectioned rebuild (T-40.4/T-40.5).** `app/recipe-form.tsx` is a
thin screen over `apps/mobile/src/features/recipes/form/**`:
`ingredient-line.tsx` (qty `NumericReturnBar` + fraction chip row `¼ ½ ¾ 1 1½
2` while focused, unit `SelectField` 88pt over `RECIPE_UNIT_GROUPS`, name),
`step-line.tsx`, `photo-field.tsx`, `nutrition-fields.tsx` (four fields, no
fiber, a 4/4/9 ±25% amber sanity line), `form-footer.tsx` (PAT-17: sticky,
never disabled, offline reads "Needs a connection"), `row-menu.tsx` (PAT-16
menu path — `⋯` → `Sheet` → Remove/Move, paired with a snackbar Undo;
swipe-to-remove is slice 2, once L-GYM's kit component lands), `copy.ts`,
`use-is-online.ts`. Cuisine is a `SelectField` over `CUISINE_PRESETS`
(`@chefer/types`) with `Other…`. `More details` (description, prep, cook —
all optional, blank by default) is collapsed unless prefilled with a value.
Servings is a `Stepper` (1–20, default 1). Leaving with unsaved changes
(header back, Android back, iOS swipe-back — one `navigation.addListener
('beforeRemove', …)` covers all three) opens a `ConfirmSheet` "Discard your
changes?". An edit load error shows `ErrorState`; loading shows a PAT-8
skeleton, not a spinner.

**Recipe detail (`app/recipe/[id].tsx`):** a 0 prep/cook/total time is
hidden, not shown as "0m"; no nutrition added shows "Nutrition not added"
instead of "0 kcal" (and hides the Energy stat and the macro row); no steps
shows "No steps yet" instead of an empty Instructions card.

**Kit (T-40.2):** `SelectField`/`SelectSheet` (PAT-15) and `FormField`
(PAT-17) in `packages/ui-mobile` — see infrastructure.md §5.8. No icon-font
dependency (plain glyphs), consistent with the rest of the kit.

### Mobile ingredient search and computed nutrition (slice 2, T-40.7–T-40.10, AC12)

Mobile's manual ingredient lines now match the web reference
(`IngredientPicker` / `IngredientFormModal`), built entirely in NEW
`apps/mobile/src/features/ingredients/**`:

```
Ingredient row name field ──tap──► IngredientSearchSheet (full-height Sheet)
  search box, 2+ chars, 250ms debounce ──► ingredients.search
  results grouped "YOUR INGREDIENTS" (isCustom) then "CHEFER CATALOGUE"
  pick a row   ──► line.name = row.displayName, line.linked = true,
                    and — only while the unit is still the default 'g' —
                    line.unit = naturalUnitForIngredient(row.name)
                    (a small curated name-based heuristic: "milk"/"oil"/… →
                    ml, "egg"/"onion"/… → piece; the search DTO carries no
                    per-row unit hint today, so this is a client-side
                    approximation, not a server answer)
  linked line  ──► shows a muted `nutrition-outline` icon, a11y "…, nutrition known"
  "Use "{text}" as typed"       ──► line.name = text, line.linked = false (today's free text)
  "Add "{text}" as my ingredient" ──► CustomIngredientSheet (opens only once
                                       the search sheet's exit animation
                                       finishes — the kit Sheet's own rule:
                                       one Modal must finish dismissing
                                       before the next presents)
```

**Custom ingredient sheet (T-40.8):** name, four per-100g macro fields (no
fiber, D-18), `One piece weighs (g)` optional, over
`ingredients.createCustom` — a private row visible only to its creator
(never even to another account searching the identical text, `AC12`).
`Fill in for me` calls `ingredients.estimateNutrition` with ONLY the
ingredient name — the delta rules' existing precedent that a name-only
nutrition estimate is not AI-consent-gated. It is premium-only and the only
lock on this screen (P4): a free tap never calls the mutation, it opens the
existing `/profile?source=ingredient-autofill` upsell entry point instead
(the same mechanism `import-recipe.tsx`'s locked state already uses),
isolated in `premium-upsell.ts` so it is a one-line swap to
`openPremium('ingredient-autofill')` once L-MONEY's job-led `PremiumSheet`
ships. No price/checkout copy anywhere in that path (delta rule 2). Saving
returns to the form with the new ingredient picked (linked, natural unit
applied).

**Computed nutrition (T-40.9):** the nutrition section defaults to a
`ComputedNutritionCard` (`ingredients.computeNutrition`, debounced 600ms —
the web model) showing four `CountUp` stats and a coverage line
(`Calculated from all N ingredients.` / `From M of N ingredients · no data
for: X, Y` / `Add ingredients to calculate nutrition automatically.` /
offline: the last numbers stay with `Offline — showing the last calculated
numbers. Will calculate when you're online.`). `Edit numbers` prefills the
slice-1 manual fields with the last computed values and switches to manual;
`Use calculated numbers` switches back. `nutritionInfo.source` records which
mode saved (`'computed'`, `'manual'`, or `'none'` when computed mode never
matched anything) — edit reopens in `'manual'` unless the loaded recipe was
explicitly saved as `'computed'`, so an old manual save is never silently
replaced by a fresh recompute.

**Swipe-to-remove (T-40.10):** both ingredient and step lines wrap in
L-GYM's `swipe-to-remove.tsx` (`apps/mobile/src/components/`) — swipe left
to remove, always alongside the existing `⋯` row menu (progressive
enhancement, never the only way to remove a line). The ingredient row's
forwarded ref now targets the QUANTITY field, not the name field — the name
field is a sheet trigger, not a `TextInput`, and the quantity is what D-19's
`incompleteLine` error actually means.

---

## 32. Terms Acceptance & Email Defaults Flow (T-39.1/T-39.3)

> **Status:** Terms acceptance at sign-up (`auth.register`'s
> `acceptedTermsVersion`/`ageConfirmed`) is reserved — owned by L-ENTRY, not
> written by this lane. The email-defaults one-time notice (below) IS this
> lane's (L-DATA, 2026-09-28).

### Email-defaults notice (existing accounts)

```
Preferences (mobile) / Settings › Emails (web) load
  │
  └─ user.me().emailDefaultsNoticeAt === null
     AND (weekReady === true OR weeklyRecap === true)   ← "yours are still on"
     would be the wrong sentence for an account that already starts off
        │
        └─ shows once: "We've changed how emails work: they're now off
           unless you turn them on. Yours are still on."
             ├─ "Keep them on"  → user.dismissEmailDefaultsNotice
             └─ "Turn them off" → notifications.setEmailPreferences
                                  { weekReady: false, weeklyRecap: false }
                                  (logs EMAIL_WEEK_READY/EMAIL_RECAP
                                  ConsentEvents, §28)
                                  + user.dismissEmailDefaultsNotice

user.dismissEmailDefaultsNotice: sets User.emailDefaultsNoticeAt = now,
  idempotent (a second call keeps the original timestamp — a race between
  two devices dismissing at once never overwrites an earlier value)
```

A brand-new account created after the S15 default change already starts
both digests off (`@default(false)` for new rows), so it never sees this —
the condition above only fires for an account whose values predate the
change and are still on. L-ENTRY's registration flow (§27 above) is
expected to set `emailDefaultsNoticeAt` explicitly for accounts created
through it, so a new sign-up never sees the notice either way.
