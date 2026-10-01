# Chefer Following: implementation plan

**rev 2 · 2026-09-30 · built on [`prd.md`](./prd.md) and [`ux-design.md`](./ux-design.md) rev 2 (all owner decisions
applied) · build read `master` @ `9dd93f3a`**

> **rev 2.1 (2026-10-01), build-time deviations from rev 2:**
>
> - **§2.3:** `Recipe` copy uniqueness `[creatorId, originRecipeId]` is an `@@index`, not an `@@unique`. A new unique on
>   the populated `recipes` table makes `prisma db push` (run by production's `migrate` service without
>   `--accept-data-loss`) refuse the deploy.
> - **§4.4:** so `recipe-copy.service.ts` enforces one copy per viewer and source itself: a SERIALIZABLE find-or-create,
>   retried on `P2034`, instead of "unique-violation race → re-read".
> - **Migration:** the schema lands as `20260930120000_friends_schema` (additive: new enums, 7 tables, 4 `recipes` columns).

Role: full-stack engineer/architect, writing for an **orchestrating Claude Code session** that runs AI agents in
waves. This file is the _how_; the PRD is the _what and why_; the UX spec is the _look, states and copy_. On a
conflict: the PRD wins on behaviour and privacy, the UX spec on copy and layout, and this file on data, API and task
boundaries.

**Scope of this program (owner decisions, PRD §5.1):**

- The **API** (platform-neutral) and the **mobile app** (`apps/mobile`, iOS + Android).
- **No web** (a later phase, §13).
- **No push** (PRD appendix A).
- **No native change:** the whole feature ships **over the air** on the current 1.0.1 runtime (§6).
- **Automatic moderation**, with no human queue.

**Naming:** the user-facing label is **Following**. Code identifiers keep **`friends`**: the flag `friends`, the router
`friends.*`, `features/friends`, routes `/friends/...`, `FRIENDS_*` constants and env vars. Never put "Friends" in a
user-visible string.

Task IDs are `F<wave>.<n>`. Lanes: `L-*` (API), `M-*` (mobile), `K-*` (kit). Rev 1's web (W3 web) and push/native
(W5, F2.4, F1.4 push) tasks are **removed**. The IDs are renumbered for rev 2 because no rev-1 task had started.

---

## 0. How to run this plan

- **Execution model** (same mechanics as `gym_plan.md` §9 and the persona-study waves):
  - One orchestrating session (Opus) per wave.
  - Lane agents run as **background tasks**, each in its **own git worktree** (`../chefer-friends-<lane>`), on
    branch `feat/friends/<lane>`, cut from the wave's integration branch `integrate/friends-w<N>`.
  - **Every lane agent starts with `git merge --ff-only integrate/friends-w<N>`.** A lane that can't fast-forward
    stops and reports.
  - At most **3 concurrent lane agents**. Batches are listed per wave.
- **The orchestrator:**
  1. Cuts `integrate/friends-w<N>` from `master` after the previous wave is merged.
  2. Launches lanes with only their task text, their **Owns** list and pointers to the relevant sections of the three
     docs.
  3. Reviews each lane diff and runs the wave ladder.
  4. Merges lanes into the integration branch.
  5. Runs the docs task.
  6. Opens a PR to `master` and **doesn't merge it**. The owner merges, because merging deploys the API and
     auto-publishes the OTA update.
- **File ownership is binding.** A lane edits only files in its **Owns** list. Shared files (`schema.prisma`,
  `routers/index.ts`, `apps/api/src/index.ts`, `apps/mobile/app/_layout.tsx`, `infrastructure.md`,
  `business_flow.md`) have exactly one owning task per wave. A later batch may take over a file an earlier batch
  owned, once that batch is merged. This is stated per task.
- **Models:** `sonnet` for mechanical or well-specified work; `opus` for architecture, authorization, moderation,
  cross-cutting state and security review.
- **No native changes, ever, in this program** (§6). No lane edits `apps/mobile/app.config.js`,
  `apps/mobile/package.json` dependencies or `eas.json`. No lane triggers an EAS build or a store submission.

### 0.1 Wall-clock estimate (orchestrator + background agents, including verification)

| Wave                       | Critical path                                                                                                                                   | Estimate    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| W0 contracts               | F0.1 ∥ F0.2 (~1–1.5 h) → F0.3 skeleton + access matrix (~1.5–2 h) → integrate + docs (~0.5 h)                                                   | 3–4 h       |
| W1 API + kit               | batch A (3 Opus lanes, ~3–4 h) → integrate (~1 h) → batch B (~2.5–3 h) → integrate, contract tests, docs (~1 h)                                 | 7.5–9 h     |
| W2 mobile                  | F2.0 core (~2.5–3 h) → batch (M-PROFILE is longest, ~3.5–4.5 h, incl. extractions) → integrate + full ladder on iOS and Android, Maestro (~2 h) | 8–10 h      |
| W3 hardening + launch prep | security review + fixes (~2.5–3 h) ∥ legal drafts ∥ E2E runs → fixes + fingerprint check + docs (~1–1.5 h)                                      | 4–5 h       |
| **Total**                  |                                                                                                                                                 | **22–28 h** |

That is 3–4 working days of active orchestration. It **excludes** owner time: reviewing and merging four PRs, the
deploy after each merge (~15–20 min each), counsel review of the legal text, and creating the Chefer Kitchen content.
Maestro on the iOS simulator is the most variable item (`mobile_native_plan.md` §5 gotcha 13). Budget the upper end if
the simulator needs resets.

## 1. Architecture overview

```
 mobile ──tRPC──▶ friends.* ─┬─ requireFriendsEnabled ─ requireActivated ─ requireSocialAccess(scope)
                              │        (middleware, lib/friends-middleware.ts)
                              ▼
      application/friends/*  (services, no Prisma)                application/recipe/recipe-copy.service.ts
        SocialAccessService ◀── every read of another user ──▶     recipe-access.ts (extended)
        SocialProfile · Follow · Search · Suggestion · Block · Activity · FriendContent · Moderation
                              │
                              ▼
      packages/database repositories (interfaces + Prisma impls)
                              │
      workers/friends-maintenance.worker.ts  (expire requests, prune Activity, weekly moderation metrics line)
      scripts/moderation-undo.ts · scripts/create-chefer-kitchen.ts  (ops, optional)
```

**Invariants.** Every task preserves these; F3.1 audits each one.

| #      | Invariant                                                                                                                                                                                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-1  | **Server-side authorization only.** Every procedure returning or acting on another user's data takes a `userId` and runs `requireSocialAccess(scope)` (or the service calls `SocialAccessService.assert`) before touching data.                                                                           |
| INV-2  | **Allow-list DTOs.** Other-user responses are built field by field by `application/friends/friend-dto.mappers.ts`. Never spread an own-data DTO (`WeekPlanDto`, `RoutineDto`, `SessionSummaryDto`). A test asserts the exact deep key set of every friend DTO.                                            |
| INV-3  | **No existence oracle.** Blocked, not activated and not found all return the same `NOT_FOUND` `Profile not available`. `FORBIDDEN` with `data.friendsLocked` only occurs when the header is visible.                                                                                                      |
| INV-4  | **Read-only reads.** Reads of another user's data never write to that user's rows (no carry-forward, tailoring or image-priority changes).                                                                                                                                                                |
| INV-5  | **Own records hold own rows.** Anything written into the viewer's plan, pinned-favourite placement at generation, or food log references a recipe the viewer owns or an open (AI/CURATED) recipe. Another user's `MANUAL` recipe is first resolved to the viewer's copy (`RecipeCopyService.ownedIdFor`). |
| INV-6  | **No emails out, no email in.** No friends procedure returns an email. No search path reads `User.email`.                                                                                                                                                                                                 |
| INV-7  | **Not persisted in the gym store.** Friend data lives under the `friends` tRPC namespace, never `gym.*` (whose query keys `query-persistence.ts` writes to disk for 30 days).                                                                                                                             |
| INV-8  | **Additive API.** New procedures and optional fields only. No new `x-chefer-api-level`. The one new failure mode on an existing procedure (the word filter on recipe writes) applies only to users who opted into Following and share recipes.                                                            |
| INV-9  | **OTA only.** No native module and no native config change. The runtime fingerprint on the integration branch equals `master`'s (§6).                                                                                                                                                                     |
| INV-10 | **Moderation is automatic and logged.** Every automatic action writes one `ModerationLog` row in the same transaction as the action. No code path waits for a human.                                                                                                                                      |

## 2. Data model (Prisma, `packages/database/prisma/schema.prisma`)

Additive only: new tables, nullable columns, columns with defaults, new enums, one new `ConsentKind` value. Production
applies it with `prisma db push --skip-generate` through the compose `migrate` service (`docker-compose.deploy.yml`).
A named migration (`prisma/migrations/<timestamp>_friends_schema/`) keeps the history.

### 2.1 Enums

```prisma
enum ProfileVisibility { PUBLIC PRIVATE }
enum FollowStatus { PENDING ACCEPTED }
enum NotificationKind { FOLLOW_REQUEST NEW_FOLLOWER REQUEST_ACCEPTED }
enum ReportReason { INAPPROPRIATE SPAM HARASSMENT UNSAFE OTHER }
enum RecipeHiddenReason { REPORTS FILTER }
enum ModerationAction {
  RECIPE_AUTO_HIDDEN      // reports threshold (§4.6)
  ACCOUNT_FORCED_PRIVATE  // reports threshold
  RECIPE_FILTER_HIDDEN    // word filter on an existing recipe at turn-on / recipes-on
  NAME_REJECTED           // word filter rejected a display name
  RECIPE_TEXT_REJECTED    // word filter rejected a shared recipe write
  UNDO                    // ops undo of an earlier row
}
// ConsentKind gains: SOCIAL_SHARING
```

### 2.2 New models

```prisma
/// One row = the user turned Following on. No row = not discoverable, not followable.
model SocialProfile {
  userId          String            @id
  visibility      ProfileVisibility @default(PRIVATE)
  /// normalizeSearchName(first, last) from @chefer/utils; rewritten on activate and on name change.
  searchName      String
  sharePlan       Boolean           @default(true)
  shareRecipes    Boolean           @default(true)
  shareWorkouts   Boolean           @default(true)
  shareTargets    Boolean           @default(false)
  /// Set by moderation (§4.6): visibility locked to PRIVATE, excluded from search and suggestions.
  forcedPrivateAt DateTime?
  /// Chefer Kitchen (Q-F-8): always eligible for "Popular". Set only by scripts/create-chefer-kitchen.ts.
  featured        Boolean           @default(false)
  activatedAt     DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([visibility, forcedPrivateAt])
  @@index([searchName])
  @@map("social_profiles")
}

/// Directed edge follower → followee. PENDING = request. Decline/cancel/unfollow/remove/block = delete.
model Follow {
  id         String       @id @default(cuid())
  followerId String
  followeeId String
  status     FollowStatus
  createdAt  DateTime     @default(now())
  acceptedAt DateTime?

  follower User @relation("FollowsOut", fields: [followerId], references: [id], onDelete: Cascade)
  followee User @relation("FollowsIn", fields: [followeeId], references: [id], onDelete: Cascade)

  @@unique([followerId, followeeId])
  @@index([followeeId, status, createdAt])
  @@index([followerId, status, createdAt])
  @@map("follows")
}

model Block {
  blockerId String
  blockedId String
  createdAt DateTime @default(now())

  blocker User @relation("BlocksMade", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked User @relation("BlocksReceived", fields: [blockedId], references: [id], onDelete: Cascade)

  @@id([blockerId, blockedId])
  @@index([blockedId])
  @@map("blocks")
}

model SuggestionDismissal {
  userId          String
  dismissedUserId String
  createdAt       DateTime @default(now())

  user      User @relation("DismissalsMade", fields: [userId], references: [id], onDelete: Cascade)
  dismissed User @relation("DismissalsReceived", fields: [dismissedUserId], references: [id], onDelete: Cascade)

  @@id([userId, dismissedUserId])
  @@map("suggestion_dismissals")
}

/// Append-only. Kept when the target turns Following off (PRD FD-14), so leaving can't reset moderation.
model UserReport {
  id           String       @id @default(cuid())
  reporterId   String
  targetUserId String       // the reported user, or the reported recipe's creator
  recipeId     String?      // no FK: the report outlives the recipe
  reason       ReportReason
  /// Counts toward thresholds: reporter account ≥ 24 h old and email verified, evaluated at report time.
  eligible     Boolean
  /// Set by an ops undo of the action this report contributed to; discounted reports never count again.
  discountedAt DateTime?
  createdAt    DateTime     @default(now())

  reporter User @relation("ReportsMade", fields: [reporterId], references: [id], onDelete: Cascade)
  target   User @relation("ReportsReceived", fields: [targetUserId], references: [id], onDelete: Cascade)

  @@index([targetUserId, eligible])
  @@index([recipeId, eligible])
  @@index([createdAt])
  @@map("user_reports")
}

/// Append-only log of every automatic moderation action and every ops undo (PRD §9.5).
model ModerationLog {
  id                String           @id @default(cuid())
  action            ModerationAction
  targetUserId      String
  recipeId          String?
  reason            String           // e.g. "3 distinct eligible reporters", "blocked term in name"
  distinctReporters Int?
  actor             String           // "system" | "ops"
  undoOfId          String?          // for UNDO rows
  createdAt         DateTime         @default(now())

  target User @relation("ModerationTarget", fields: [targetUserId], references: [id], onDelete: Cascade)

  @@index([createdAt])
  @@index([targetUserId])
  @@map("moderation_log")
}

/// In-app Activity. One row per (recipient, kind, actor): a re-sent request upserts it
/// (fresh createdAt, readAt = null) instead of stacking duplicates.
model Notification {
  id        String           @id @default(cuid())
  userId    String           // recipient
  kind      NotificationKind
  actorId   String
  createdAt DateTime         @default(now())
  readAt    DateTime?

  user  User @relation("NotificationsReceived", fields: [userId], references: [id], onDelete: Cascade)
  actor User @relation("NotificationsCaused", fields: [actorId], references: [id], onDelete: Cascade)

  @@unique([userId, kind, actorId])
  @@index([userId, createdAt])
  @@index([userId, readAt])
  @@map("notifications")
}
```

### 2.3 Changed models (additive)

```prisma
model User {
  // …existing…
  socialProfile         SocialProfile?
  followsOut            Follow[]              @relation("FollowsOut")
  followsIn             Follow[]              @relation("FollowsIn")
  blocksMade            Block[]               @relation("BlocksMade")
  blocksReceived        Block[]               @relation("BlocksReceived")
  dismissalsMade        SuggestionDismissal[] @relation("DismissalsMade")
  dismissalsReceived    SuggestionDismissal[] @relation("DismissalsReceived")
  reportsMade           UserReport[]          @relation("ReportsMade")
  reportsReceived       UserReport[]          @relation("ReportsReceived")
  moderationLog         ModerationLog[]       @relation("ModerationTarget")
  notificationsReceived Notification[]        @relation("NotificationsReceived")
  notificationsCaused   Notification[]        @relation("NotificationsCaused")
  copiedRecipesOrigin   Recipe[]              @relation("RecipeOriginCreator")
}

model Recipe {
  // …existing… (sourceUrl already exists: imported recipes, Q-F-7)
  /// Set on a viewer's private copy of another user's recipe (made by "Add to my week", PRD §13).
  originRecipeId  String?
  originCreatorId String?
  /// Automatic moderation (PRD §9): hidden from everyone but the creator; existing hearts and copies keep working.
  hiddenAt        DateTime?
  hiddenReason    RecipeHiddenReason?

  originRecipe  Recipe?  @relation("RecipeCopies", fields: [originRecipeId], references: [id], onDelete: SetNull)
  copies        Recipe[] @relation("RecipeCopies")
  originCreator User?    @relation("RecipeOriginCreator", fields: [originCreatorId], references: [id], onDelete: SetNull)

  // At most one copy per viewer and source. NOT a @@unique (rev 2.1): see the note below the block.
  @@index([creatorId, originRecipeId])
  @@index([creatorId, source, createdAt])
}
```

**Why `@@index`, not `@@unique` (rev 2.1).** Adding a unique constraint to the populated `recipes` table makes
`prisma db push` refuse with a data-loss warning, and production's compose `migrate` service runs `db push` without
`--accept-data-loss`, so the deploy would stall. The index keeps the lookup fast; `RecipeCopyService` enforces "one copy
per viewer and source" itself, with a SERIALIZABLE find-or-create and a retry on `P2034` (§4.4).

No `WorkoutSession` index is needed. The last-7-days query uses the existing `@@index([userId, localDate])`.

**Backfill:** none. **`deleteAccount()`** (`application/user/account-data.service.ts`): the new tables cascade from
`User`. The existing explicit `recipe.deleteMany({ creatorId, source: MANUAL })` deletes the originals of other people's
copies, and their `originRecipeId`/`originCreatorId` are SetNull (intended). Hearts on deleted originals cascade away.

### 2.4 Repositories (`packages/database/src/repositories/`: interface + class + singleton, exported from `index.ts`)

| File                                 | Interface (abridged)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `social-profile.repository.ts`       | `find`, `findMany(ids)`, `create`, `update`, `forcePrivate(userId)`, `clearForcedPrivate(userId)`, `deleteCascadeSocial(userId)` (one transaction: follows both ways, blocks made, dismissals made, notifications both ways, the profile; **not** reports or moderation log), `searchByName(tokens, excludeIds, cursor, limit)` (excludes `forcedPrivateAt != null`), `popular(minFollowers, activeSince, excludeIds, limit)` (PUBLIC, not forced private; `featured` bypasses the follower minimum) |
| `follow.repository.ts`               | `find`, `findPair(a, b)`, `create`, `accept`, `acceptAllPendingTo(followeeId)`, `delete`, `deleteBothWays(a, b)`, `listFollowing`, `listFollowers`, `listPendingTo`, `counts(userId)`, `acceptedFolloweeIdsSharingRecipes(viewerId)`, `mutualCandidates(viewerId, limit)`, `expirePendingOlderThan(date)`                                                                                                                                                                                            |
| `block.repository.ts`                | `existsEither(a, b)`, `blockedIdsEither(userId)`, `create`, `delete`, `listMade(userId, cursor, limit)`                                                                                                                                                                                                                                                                                                                                                                                              |
| `suggestion-dismissal.repository.ts` | `upsert`, `activeIds(userId, since)`, `deleteOlderThan(date)`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `user-report.repository.ts`          | `create`, `distinctEligibleReportersForRecipe(recipeId)`, `distinctEligibleReportersForUser(targetUserId)` (both exclude `discountedAt != null`), `discountForRecipe(recipeId)`, `discountForUser(userId)`, `countSince(date)`                                                                                                                                                                                                                                                                       |
| `moderation.repository.ts`           | `log(entry)`, `find(id)`, `weeklyCounts(since)`, `hideRecipe(recipeId, reason)`, `unhideRecipe(recipeId)`, `ownSharedRecipesForFilter(userId)` (`MANUAL`, `originRecipeId: null`, `hiddenAt: null`; `id, name, description`)                                                                                                                                                                                                                                                                         |
| `notification.repository.ts`         | `upsertSocial({ userId, kind, actorId })`, `withdraw(userId, kind, actorId)`, `withdrawBetween(a, b)`, `list(userId, cursor, limit)`, `unreadCount`, `markReadUpTo(userId, upTo)`, `deleteOlderThan(date)`                                                                                                                                                                                                                                                                                           |

**Changed repositories** (owner noted in §11):

- `favourite-recipe.repository.ts`: `findAllRecipesForUser` gains `opts.visibleCreatorIds?: string[]`. The
  "another user's private recipe" `OR` gets one more branch, `{ creatorId: { in: visibleCreatorIds },
originRecipeId: null }`. That branch **includes** imported recipes (Q-F-7) and includes auto-hidden ones only for
  existing hearts (the heart query path is the only one that uses it, and Saved is heart-driven, so hidden recipes
  stay visible to people who hearted them before the hide). Rows `include` `creator { id, firstName, lastName, name
}`. `createManualRecipe` accepts `originRecipeId`/`originCreatorId` (and keeps `sourceUrl`).
- `meal-plan.repository.ts`: `appendDayMeal(planId, dayOfWeek, mealType, recipeId, { pinned })` → the new slot index
  (it creates the day row if missing and appends, so existing indexes don't move), and
  `removeDayMealIfMatches(planId, dayOfWeek, slotIndex, recipeId)` for Undo.
- `workout-session.repository.ts`: `listCompletedInLocalDateRange(userId, fromLocalDate, toLocalDate, max = 30)`.
  Status `COMPLETED`, `localDate` between the bounds (string compare on `YYYY-MM-DD`), order `startedAt desc`. It
  includes exercises and `Exercise { id, name, userId, trackingType }`, and sets where `completedAt != null AND
isWarmup = false`.
- `routine.repository.ts`: `findActiveWithExercises(userId)`, if the existing reads don't already give that shape.

## 3. Shared code

### 3.1 `packages/types/src/friends.ts` (exported from `index.ts`)

```ts
export const PROFILE_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];
export type Relation = 'self' | 'none' | 'requested' | 'following';

export const FRIENDS_LIMITS = {
  pageSize: 20,
  searchMinChars: 2,
  searchMaxChars: 100,
  workoutsDays: 7, // PRD FD-15: owner's today − 6 … today
  workoutsMax: 30,
  suggestionsHome: 5,
  suggestionsAll: 30,
  suggestionCacheMs: 10 * 60_000,
  dismissalDays: 90,
  requestExpiryDays: 90,
  activityRetentionDays: 90,
  popularMinFollowers: 3,
  popularActiveDays: 30,
} as const;

/** PRD §9.3 (approved by the owner, Q-F-13). Change here only. */
export const MODERATION = {
  RECIPE_HIDE_REPORTERS: 3,
  ACCOUNT_RESTRICT_REPORTERS: 5,
  REPORTER_MIN_ACCOUNT_AGE_HOURS: 24,
  REPORTER_REQUIRES_VERIFIED_EMAIL: true,
} as const;

const personName = z.string().trim().min(1).max(50);
export const friendUserIdSchema = z.string().cuid();
export const targetUserInputSchema = z.object({ userId: friendUserIdSchema });
export const friendsPageInputSchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).default(FRIENDS_LIMITS.pageSize),
});
export const activateFriendsInputSchema = z.object({
  visibility: z.enum(PROFILE_VISIBILITIES),
  firstName: personName,
  lastName: personName,
  documentVersion: z.string().max(20).optional(), // defaults to LEGAL_VERSIONS.privacy
});
export const updateFriendsSettingsInputSchema = z
  .object({
    visibility: z.enum(PROFILE_VISIBILITIES),
    sharePlan: z.boolean(),
    shareRecipes: z.boolean(),
    shareWorkouts: z.boolean(),
    shareTargets: z.boolean(),
    firstName: personName,
    lastName: personName,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const deactivateFriendsInputSchema = z.object({ confirm: z.literal('TURN_OFF') });
export const friendsSearchInputSchema = friendsPageInputSchema.extend({
  query: z.string().trim().min(FRIENDS_LIMITS.searchMinChars).max(FRIENDS_LIMITS.searchMaxChars),
});
export const friendRecipesInputSchema = friendsPageInputSchema.extend({
  userId: friendUserIdSchema,
  search: z.string().trim().max(100).optional(),
});
export const addRecipeToWeekInputSchema = z.object({
  recipeId: z.string().min(1).max(64),
  weekOffset: z.number().int().min(0).max(1),
  dayOfWeek: z.number().int().min(0).max(6),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  mode: z.enum(['add', 'replace']),
  slotIndex: z.number().int().min(0).max(9).optional(), // required when mode = 'replace'
  acknowledgeConflict: z.boolean().optional(),
});
export const undoAddToWeekInputSchema = z.object({
  planId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  slotIndex: z.number().int().min(0).max(9),
  addedRecipeId: z.string().min(1),
  previousRecipeId: z.string().min(1).optional(),
});
export const REPORT_REASONS = ['INAPPROPRIATE', 'SPAM', 'HARASSMENT', 'UNSAFE', 'OTHER'] as const;
export const reportInputSchema = z.object({
  userId: friendUserIdSchema,
  recipeId: z.string().min(1).max(64).optional(),
  reason: z.enum(REPORT_REASONS),
});
export const markActivityReadInputSchema = z.object({ upTo: z.date() });
```

**DTOs** (the API returns exactly these):

```ts
export interface FriendUserSummary {
  id: string;
  displayName: string; // "{first} {last}", fallback name, fallback "Chefer user"
  firstName: string;
  imageUrl: string | null;
  relation: Relation;
  followsYou: boolean;
  requestedYou: boolean;
}
export interface FriendsAvailabilityDto {
  enabled: boolean;
}
export interface FriendsMeDto {
  activated: boolean;
  firstName: string | null;
  lastName: string | null;
  settings: null | {
    visibility: ProfileVisibility;
    forcedPrivate: boolean;
    sharePlan: boolean;
    shareRecipes: boolean;
    shareWorkouts: boolean;
    shareTargets: boolean;
  };
  counts: {
    followers: number;
    following: number;
    pendingRequests: number;
    unreadActivity: number;
    blocked: number;
  };
  badgeCount: number; // pendingRequests + unreadActivity
}
export interface ActivateResultDto extends FriendsMeDto {
  filterHiddenRecipes: number;
}
export type SectionAccess = 'visible' | 'locked' | 'not_shared';
export interface FriendProfileDto {
  user: FriendUserSummary;
  isSelf: boolean;
  visibility: ProfileVisibility;
  counts: { followers: number; following: number };
  access: { plan: SectionAccess; recipes: SectionAccess; workouts: SectionAccess };
  recipeCount: number | null;
}
export interface FriendMacroTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
export interface FriendRecipeCard {
  id: string;
  name: string;
  imageUrl: string | null;
  imageStatus: 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';
  perServing: FriendMacroTotals;
  totalTimeMins: number;
  byOwner: boolean; // the owner's own MANUAL recipe (the UI shows "By")
  sourceDomain: string | null; // Q-F-7: hostname of sourceUrl, "www." stripped
  sourceUrl: string | null;
  isFavourite: boolean; // the VIEWER's heart
  hidden: boolean; // auto-hidden: name/photo withheld (the name is "Hidden recipe"), not openable
}
export interface FriendWeekDto {
  weekStartDate: string; // YYYY-MM-DD, owner's Monday
  todayIndex: number; // 0..6, owner's time zone
  days: {
    dayOfWeek: number;
    meals: {
      type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      portion: number;
      leftoverOf?: string;
      recipe: FriendRecipeCard;
      totals: FriendMacroTotals;
    }[];
    totals: FriendMacroTotals;
  }[];
  averageKcal: number | null;
  targets: FriendMacroTotals | null;
}
export interface FriendRoutineDto {
  name: string;
  days: {
    position: number;
    name: string;
    plannedWeekday: number | null;
    exercises: {
      exerciseId: string;
      name: string;
      isCustom: boolean;
      sets: number;
      repMin: number;
      repMax: number;
      restSec: number;
      supersetGroup: string | null;
      trackingType: string;
    }[];
  }[];
}
export interface FriendWorkoutDto {
  id: string;
  name: string;
  localDate: string;
  startedAt: string;
  durationMin: number | null;
  exercises: {
    exerciseId: string;
    name: string;
    isCustom: boolean;
    trackingType: string;
    sets: { weightKg: number; reps: number; durationSec?: number; distanceM?: number }[];
  }[];
}
export interface ActivityItemDto {
  id: string;
  kind: 'FOLLOW_REQUEST' | 'NEW_FOLLOWER' | 'REQUEST_ACCEPTED';
  actor: FriendUserSummary;
  createdAt: Date;
  readAt: Date | null;
  requestState?: 'pending' | 'accepted' | 'declined';
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
```

Also in `@chefer/types`:

- `friends-copy.ts` (`FRIENDS_COPY`, the UX §12 deck, strings say "Following");
- `feature-flags.ts` key `friends` (default off);
- `analytics-events.ts`: the PRD §15 events (no bare `string`, no other users' ids).

### 3.2 `packages/utils/src/friends/` and `packages/utils/src/moderation/` (pure, unit-tested)

| File                          | Exports                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `friends/follow-policy.ts`    | `followOutcome(targetVisibility): 'instant' \| 'request'` (Instagram model, Q-F-1)                                                                                                                                                                                                                               |
| `friends/search-name.ts`      | `normalizeSearchName(first, last, name?)` (NFD, strip `\p{M}`, lowercase, non-alphanumerics → space, collapse); `queryTokens(q)`; `matchesAllTokens(searchName, tokens)`                                                                                                                                         |
| `friends/display-name.ts`     | `displayNameOf`, `firstNameOf` (`Chefer user` fallback), `initialsOf`, `avatarColorIndex(seed, 8)`                                                                                                                                                                                                               |
| `friends/suggestions.ts`      | `scoreSuggestion({ mutualCount, followsYou, followers, featured })`, `rankSuggestions(candidates, limit)` (PRD §11)                                                                                                                                                                                              |
| `friends/relation.ts`         | `relationOf({ isSelf, outgoing })`                                                                                                                                                                                                                                                                               |
| `friends/cursor.ts`           | `encodeCursor(date, id)` / `decodeCursor(s)` (base64url `ISO                                                                                                                                                                                                                                                     | id`; tampered → `null`) |
| `friends/owner-week.ts`       | `ownerLocalDate(now, tz \| null)`, `mondayUtcOf(localDate)`, `weekdayIndex(localDate)`, `localDateMinusDays(localDate, n)`                                                                                                                                                                                       |
| `friends/friend-totals.ts`    | `slotTotals(nutrition, portion)`, `dayTotals(slots)`, `weekAverageKcal(days)` (same rounding as `sumPlanDay` in `meal-portion.ts`)                                                                                                                                                                               |
| `friends/source-domain.ts`    | `sourceDomainOf(url)` → the hostname without `www.`, or `null` for an invalid or non-http(s) URL                                                                                                                                                                                                                 |
| `moderation/blocked-terms.ts` | `BLOCKED_TERMS: readonly string[]`: English + Romanian slurs, sexual terms and severe profanity, curated from LDNOOBW (CC-BY 4.0, attribution in the header). **Data only.**                                                                                                                                     |
| `moderation/text-filter.ts`   | `normalizeForFilter(text)` (lowercase, NFD strip, leet map `0→o 1→i 3→e 4→a 5→s @→a $→s`, collapse repeated letters ≥ 3 to 2, non-letters → space); `containsBlockedTerm(text): boolean` (whole-word or whole-phrase matching on normalised tokens, never substring); `firstBlockedField({ name, description })` |

## 4. API

### 4.1 Routers and middleware

`apps/api/src/routers/friends/index.ts` → `friendsRouter = router({ ...graph, ...content, ...recipes, ...safety })`,
from four sub-router files (so parallel lanes never share a file), registered once as `friends: friendsRouter` in
`routers/index.ts` (F0.3).

| Middleware (`lib/friends-middleware.ts`) | Rule                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requireFriendsEnabled`                  | `isFriendsEnabledFor(userId)` = `isFlagEnabled('friends') \|\| env.FRIENDS_ALLOWLIST.has(userId)`, else `FORBIDDEN` (`data.friendsUnavailable: true`)                                                                                                                           |
| `requireActivated`                       | The caller has a `SocialProfile`, else `PRECONDITION_FAILED` (`data.friendsNotActivated: true`)                                                                                                                                                                                 |
| `requireSocialAccess(scope)`             | `scope ∈ header \| plan \| recipes \| workouts`. Resolves `SocialAccessService.resolve(ctx.user.id, input.userId)` into `ctx.socialAccess`. Not visible → `NOT_FOUND` `Profile not available`. Scope not visible → `FORBIDDEN` (`data.friendsLocked: 'locked' \| 'not_shared'`) |

`lib/trpc.ts` `errorFormatter` gains `friendsUnavailable`, `friendsNotActivated`, `friendsLocked`, `textRejected:
'name' | 'recipe' | null` and `unsafeForTable`, from typed `cause` classes in `lib/friends-errors.ts` (the
`ConflictCause` pattern). Bases:

```ts
export const friendsProcedure = protectedProcedure.use(requireFriendsEnabled);
export const activeFriendsProcedure = friendsProcedure.use(requireActivated);
```

### 4.2 Procedure map (all new; every row goes into `infrastructure.md` §8)

| Procedure                                      | Base + middleware                                          | Type     | Input                              | Output                                                                                      | Rate limit                  | Lane         |
| ---------------------------------------------- | ---------------------------------------------------------- | -------- | ---------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------- | ------------ |
| `friends.availability`                         | `protectedProcedure`                                       | Query    | none                               | `FriendsAvailabilityDto`                                                                    | none                        | F0.3         |
| `friends.me`                                   | `friendsProcedure`                                         | Query    | none                               | `FriendsMeDto`                                                                              | none                        | L-GRAPH      |
| `friends.activate`                             | `friendsProcedure`                                         | Mutation | `activateFriendsInputSchema`       | `ActivateResultDto`                                                                         | 10/h                        | L-GRAPH      |
| `friends.updateSettings`                       | `activeFriendsProcedure`                                   | Mutation | `updateFriendsSettingsInputSchema` | `ActivateResultDto & { autoAccepted?: number }`                                             | 60/h                        | L-GRAPH      |
| `friends.deactivate`                           | `activeFriendsProcedure`                                   | Mutation | `deactivateFriendsInputSchema`     | `{ ok: true }`                                                                              | 5/h                         | L-GRAPH      |
| `friends.search`                               | `activeFriendsProcedure`                                   | Query    | `friendsSearchInputSchema`         | `Page<FriendUserSummary & { mutualName?: string }>`                                         | 60/min                      | L-GRAPH      |
| `friends.suggestions`                          | `activeFriendsProcedure`                                   | Query    | `{ limit ≤ 30 }`                   | `(FriendUserSummary & { reason, mutualCount, reasonName? })[]`                              | none (10-min cache)         | L-GRAPH      |
| `friends.dismissSuggestion`                    | `activeFriendsProcedure`                                   | Mutation | `targetUserInputSchema`            | `{ ok: true }`                                                                              | 120/h                       | L-GRAPH      |
| `friends.follow`                               | `activeFriendsProcedure` + `requireSocialAccess('header')` | Mutation | `targetUserInputSchema`            | `{ relation }`                                                                              | 60/h; 3 requests/target/7 d | L-GRAPH      |
| `friends.unfollow`                             | `activeFriendsProcedure`                                   | Mutation | `targetUserInputSchema`            | `{ relation: 'none' }`                                                                      | 60/h                        | L-GRAPH      |
| `friends.acceptRequest` / `declineRequest`     | `activeFriendsProcedure`                                   | Mutation | `targetUserInputSchema`            | `{ ok: true }`                                                                              | 300/h                       | L-GRAPH      |
| `friends.removeFollower`                       | `activeFriendsProcedure`                                   | Mutation | `targetUserInputSchema`            | `{ ok: true }`                                                                              | 60/h                        | L-GRAPH      |
| `friends.following` / `followers` / `requests` | `activeFriendsProcedure`                                   | Query    | `friendsPageInputSchema`           | `Page<FriendUserSummary>` + `total`                                                         | none                        | L-GRAPH      |
| `friends.activity`                             | `activeFriendsProcedure`                                   | Query    | `friendsPageInputSchema`           | `Page<ActivityItemDto>`                                                                     | none                        | L-GRAPH      |
| `friends.markActivityRead`                     | `activeFriendsProcedure`                                   | Mutation | `markActivityReadInputSchema`      | `{ unreadActivity }`                                                                        | none                        | L-GRAPH      |
| `friends.block` / `unblock`                    | `activeFriendsProcedure`                                   | Mutation | `targetUserInputSchema`            | `{ ok: true }`                                                                              | 30/day                      | L-GRAPH      |
| `friends.blocked`                              | `activeFriendsProcedure`                                   | Query    | `friendsPageInputSchema`           | `Page<FriendUserSummary>`                                                                   | none                        | L-GRAPH      |
| `friends.profile`                              | `activeFriendsProcedure` + `requireSocialAccess('header')` | Query    | `targetUserInputSchema`            | `FriendProfileDto`                                                                          | 300/h                       | L-CONTENT    |
| `friends.week`                                 | `… + requireSocialAccess('plan')`                          | Query    | `targetUserInputSchema`            | `FriendWeekDto \| null`                                                                     | 300/h                       | L-CONTENT    |
| `friends.recipes`                              | `… + requireSocialAccess('recipes')`                       | Query    | `friendRecipesInputSchema`         | `Page<FriendRecipeCard>` (hidden excluded)                                                  | 300/h                       | L-CONTENT    |
| `friends.routine`                              | `… + requireSocialAccess('workouts')`                      | Query    | `targetUserInputSchema`            | `FriendRoutineDto \| null`                                                                  | 300/h                       | L-CONTENT    |
| `friends.workouts`                             | `… + requireSocialAccess('workouts')`                      | Query    | `targetUserInputSchema`            | `FriendWorkoutDto[]` (last 7 days, ≤ 30, **no cursor**)                                     | 300/h                       | L-CONTENT    |
| `friends.addRecipeToWeek`                      | `activeFriendsProcedure`                                   | Mutation | `addRecipeToWeekInputSchema`       | `{ planId, dayOfWeek, mealType, slotIndex, addedRecipeId, copiedFromId, previousRecipeId }` | 120/h                       | L-XRECIPE    |
| `friends.undoAddToWeek`                        | `activeFriendsProcedure`                                   | Mutation | `undoAddToWeekInputSchema`         | `{ ok: true }`                                                                              | 120/h                       | L-XRECIPE    |
| `friends.report`                               | `activeFriendsProcedure`                                   | Mutation | `reportInputSchema`                | `{ ok: true }` (always blocks)                                                              | 20/day                      | L-MODERATION |

**Existing procedures that change (additive, INV-8):**

| Procedure                                                                                                 | Change                                                                                                                                                                                                                                                                       | Lane         |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `recipe.list`                                                                                             | Saved/All include recipes of people you follow that you hearted (visible creators, gated by `isFriendsEnabledFor`). Rows gain optional `creator?: { id, displayName, firstName }` (another user's recipe) and `origin?: { creatorFirstName: string \| null }` (your copies). | L-XRECIPE    |
| `recipe.toggleFavourite`, `recipe.isSaved`, `recipe.rate`, `mealPlan.getRecipe`, `recipe.getSafetyChecks` | Succeed for a visible recipe of someone you follow (extended `findRecipeVisibleTo`). `mealPlan.getRecipe` gains `creator?`, `origin?` and, for the owner, `hidden?: { reason }`. `sourceUrl` is exposed if it isn't already.                                                 | L-XRECIPE    |
| `mealPlan.replaceRecipe`, `mealPlan.generate` (pinned), `tracker.logRecipe`                               | Another user's MANUAL recipe → the viewer's copy first (INV-5).                                                                                                                                                                                                              | L-XRECIPE    |
| `recipe.create` / `recipe.update`                                                                         | Word filter when the author's recipes are shared (`SocialProfile` exists and `shareRecipes`) → `BAD_REQUEST` + `data.textRejected: 'recipe'` + a `RECIPE_TEXT_REJECTED` log row. The message is the plain-language copy, so old clients show it as is.                       | L-XRECIPE    |
| `recipe.importSave` (`import.router.ts`)                                                                  | The same word filter, same condition.                                                                                                                                                                                                                                        | L-MODERATION |
| `user.exportData`                                                                                         | Adds `social` (PRD FR-22.1).                                                                                                                                                                                                                                                 | L-DATA       |

### 4.3 Authorization: `SocialAccessService` (`application/friends/social-access.service.ts`)

```ts
interface SocialAccess {
  visible: boolean;
  isSelf: boolean;
  ownerVisibility: ProfileVisibility | null;
  outgoing: FollowStatus | null;
  incoming: FollowStatus | null;
  can: { plan: SectionAccess; recipes: SectionAccess; workouts: SectionAccess; targets: boolean };
}
```

Rules in order (the PRD §7.1 matrix is the test oracle):

1. Self → visible, all sections visible, targets true. The caller must be activated.
2. The owner has no `SocialProfile` → not visible.
3. A `Block` in either direction → not visible.
4. Otherwise the header is visible. Sections are `outgoing === ACCEPTED ? (share ? 'visible' : 'not_shared') :
'locked'`, for **public and private alike** (Q-F-4). `targets = plan visible && owner.shareTargets`.

Forced private changes nothing here: an existing follower still has `outgoing === ACCEPTED`. It only affects
discoverability and `follow` (it becomes a request). The resolver is memoised per request on `ctx`, with no
cross-request cache.

**Recipe access** (`application/recipe/recipe-access.ts`, extended by L-XRECIPE): `findRecipeVisibleTo(userId,
recipeId, repo, social, favourites)` keeps today's rules. Then, for a MANUAL recipe of another creator with
`originRecipeId === null`:

- it is visible if `isFriendsEnabledFor(userId)`
- and `(await social.resolve(userId, creatorId)).can.recipes === 'visible'`
- and (`hiddenAt === null` **or** the viewer already hearted it).

Imported recipes (`sourceUrl` set) are included (Q-F-7). `isRecipeOpenTo` (sync) is unchanged.

### 4.4 Services (`apps/api/src/application/friends/`, constructor-injected repositories, `HouseholdService` pattern)

| Service                                     | Responsibilities                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `social-profile.service.ts`                 | `me`; `activate` (name filter via `containsBlockedTerm` → reject + `NAME_REJECTED` log; one transaction: update `User.firstName/lastName/name`, create `SocialProfile`, `ConsentService.record(SOCIAL_SHARING)`; then `moderationService.hideFilteredRecipes(userId)` → `filterHiddenRecipes`; idempotent); `updateSettings` (Private→Public refused when `forcedPrivateAt`; `acceptAllPendingTo` + `REQUEST_ACCEPTED` items; consent for public/targets; name change → filter + `searchName`; `shareRecipes` false→true → `hideFilteredRecipes`); `deactivate` (`deleteCascadeSocial` + consent withdrawal). |
| `follow.service.ts`                         | `follow` (self → `BAD_REQUEST`; `followOutcome(visibility)`, with a forced-private profile always a request; the per-target cap; `NEW_FOLLOWER`/`FOLLOW_REQUEST` item), `unfollow`, `accept`, `decline`, `removeFollower`, lists with one-query-per-page hydration.                                                                                                                                                                                                                                                                                                                                           |
| `friend-search.service.ts`                  | Name only: `queryTokens` → `searchByName` (excludes self, blocked either way, forced private, un-activated). Ranking per PRD §10. Never logs the query. **No email path.**                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `suggestion.service.ts`                     | PRD §11 (incl. `featured`), exclusions, a 10-min per-viewer LRU invalidated by the viewer's own follow/unfollow/dismiss/block.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `block.service.ts`                          | `block` (one transaction: `deleteBothWays` follows, `withdrawBetween` notifications, delete dismissals both ways, create `Block`), `unblock`, `list`.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `activity.service.ts`                       | `list` (`requestState` from the live `Follow`), `markReadUpTo`, `notify`, `withdraw`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `friend-content.service.ts`                 | `profile`, `week`, `recipes`, `routine`, `workouts` (§5). Read-only, allow-list DTOs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `moderation.service.ts`                     | §4.6: `reportAndBlock`, `evaluateThresholds`, `hideFilteredRecipes`, `checkRecipeText`, `undo(logId)`, `weeklyMetrics()`. **F0.3 creates it as a typed stub** (`hideFilteredRecipes` → 0, a permissive `checkRecipeText`, `weeklyMetrics` → zeros, `reportAndBlock` throws `not implemented`) so batch-A lanes and the F1.5 worker can call it. L-MODERATION implements it.                                                                                                                                                                                                                                   |
| `application/recipe/recipe-copy.service.ts` | `ownedIdFor(viewerId, recipe)`: open or own → id; another user's MANUAL recipe → the existing copy, or a new copy (text, ingredients, nutrition, photo URL, **`sourceUrl`**, origins). The one-copy rule is enforced here (there is no DB unique, §2.3): a SERIALIZABLE find-or-create, retry on `P2034`.                                                                                                                                                                                                                                                                                                     |
| Meal-plan / tracker (L-XRECIPE)             | `MealPlanService.addRecipeToSlot` / `undoAddToSlot`; INV-5 in `replaceRecipe`, `generate` pinned placement and `TrackerService.logRecipe`; `assemblePlanDto` drops (logs) a slot whose recipe row is missing instead of throwing.                                                                                                                                                                                                                                                                                                                                                                             |

### 4.5 Pagination and performance

- Opaque keyset cursors `(createdAt, id)` for lists, search and recipes. A tampered cursor restarts at the top.
  Workouts have **no cursor** (≤ 30 rows, last 7 days).
- Hydration: users + social profiles + both-direction follows for a page's ids in three `findMany`s.
- Search: the `searchName` btree index, prefix predicates. `pg_trgm` only if needed later (`db push` can't create
  extensions).
- Counts via `groupBy` on indexed columns; no denormalised counters.
- Suggestions: one `groupBy` for mutuals and one for popular, with a 10-min cache.

### 4.6 Moderation service (L-MODERATION, PRD §9)

**`reportAndBlock(reporter, { userId, recipeId?, reason })`:**

1. Validate. The target must be header-visible to the reporter, **or** the reporter must have an Activity row or a
   follow with them. Otherwise `NOT_FOUND` (INV-3). A `recipeId` must be the target's MANUAL recipe.
2. `eligible = now − reporter.createdAt ≥ 24 h && (!REPORTER_REQUIRES_VERIFIED_EMAIL || reporter.emailVerified !==
null)`.
3. Transaction:
   1. `UserReport.create`.
   2. `blockService.blockInTx`.
   3. **Recipe threshold:** if `recipeId` and `distinctEligibleReportersForRecipe(recipeId) ≥ RECIPE_HIDE_REPORTERS`
      and the recipe isn't hidden → `hideRecipe(recipeId, REPORTS)` + a `RECIPE_AUTO_HIDDEN` log row.
   4. **Account threshold:** if `distinctEligibleReportersForUser(targetUserId) ≥ ACCOUNT_RESTRICT_REPORTERS` and not
      already forced → `forcePrivate(targetUserId)` (visibility PRIVATE + `forcedPrivateAt`) + an
      `ACCOUNT_FORCED_PRIVATE` log row, and invalidate the suggestion caches.
   5. Run at `SERIALIZABLE` with the existing retry helper pattern (shopping-list toggles), so concurrent reports
      can't double-act.
4. Return `{ ok: true }`. There is no notification to anyone.

**`hideFilteredRecipes(userId)`:** for each `ownSharedRecipesForFilter(userId)` whose `firstBlockedField` is set, run
`hideRecipe(id, FILTER)` + a `RECIPE_FILTER_HIDDEN` log row. Returns the count.

**`checkRecipeText(userId, { name, description })`:** when the user has a `SocialProfile` with `shareRecipes` and
the text contains a blocked term → log `RECIPE_TEXT_REJECTED` and throw `BAD_REQUEST` (`TextRejectedCause('recipe')`,
message = `FRIENDS_COPY.recipe.textRejected`). Editing a `FILTER`-hidden recipe so it passes clears `hiddenAt`
(only for `hiddenReason: FILTER`, never for `REPORTS`).

**`undo(logId)`** (used only by the script):

- `RECIPE_AUTO_HIDDEN` → `unhideRecipe` + `discountForRecipe`.
- `ACCOUNT_FORCED_PRIVATE` → `clearForcedPrivate` (the visibility stays PRIVATE; the user may switch it) +
  `discountForUser`.
- `RECIPE_FILTER_HIDDEN` → `unhideRecipe`.
- Every undo writes an `UNDO` row with `actor: 'ops'`.

**`weeklyMetrics(since)`:** counts per action + reports + eligible reports. `friends-maintenance.worker.ts` logs one
structured line `moderation.weekly { reports, eligibleReports, recipeAutoHidden, accountForcedPrivate, nameRejected,
recipeTextRejected, recipeFilterHidden, undo }` on its first tick of each ISO week. The guard is an in-memory ISO-week
marker. A process restart may log the line twice in a week; that's harmless, and nothing acts on it.

**Scripts** (`apps/api/src/scripts/`, the `send-weekly-emails.ts` style, `pnpm exec tsx --env-file=.env …`):

- `moderation-undo.ts --log=<id> [--dry-run]`
- `create-chefer-kitchen.ts --email=<address>`: for an account the owner registered in the app, activate it PUBLIC
  with `featured: true` (idempotent).

## 5. Friend content details (L-CONTENT)

**Week (`friends.week`),** INV-4:

1. `tz` = the owner's `chefProfile.timeZone`; `local = ownerLocalDate(now, tz)`; `monday = mondayUtcOf(local)`.
2. `plan = mealPlanRepository.findForWeek(ownerId, monday)`. If there's none: `findFollowedTemplate(ownerId) ??
findLatestWithDaysBefore(ownerId, monday)`, **in memory only** (never `createPlan`). If there's still nothing →
   `null`.
3. `findRecipesByIds`. A missing row → the slot is dropped.
4. Each slot → `FriendRecipeCard`:
   - `byOwner = MANUAL && creatorId === ownerId`;
   - `sourceDomain`/`sourceUrl` from the recipe;
   - `isFavourite` from the viewer's `findSavedRecipeIds`;
   - `hidden = hiddenAt !== null` → name `Hidden recipe`, `imageUrl: null`, `id` kept but not openable (access
     refuses it);
   - `portion = slotPortion(slot.portion)`, `totals = slotTotals`;
   - `leftoverOf` copied. Nothing else from the slot JSON.
5. `targets` only when `can.targets`, from `TargetsService` (the owner's effective targets).
6. Never call `getForWeek`, `assemblePlanDto`, `loadSafetyContext`, the cost estimator, tailoring or image priority.

**Recipes (`friends.recipes`):** `recipe.findMany({ where: { creatorId: ownerId, source: MANUAL, originRecipeId: null,
hiddenAt: null, name contains search (insensitive) }, orderBy: createdAt desc })`, keyset. Imported recipes are
**included**, with `sourceDomain`.

**Routine (`friends.routine`):** the active, unarchived routine with ordered days and exercises, joined to `Exercise {
id, name, userId, trackingType }`. `isCustom = userId !== null`. Filter tracking types with
`renderableTrackingTypes(ctx.clientApiLevel)` (`application/gym/client-level.ts`), as the `gym.*` reads do.

**Workouts (`friends.workouts`, FD-15):**

- `to = ownerLocalDate(now, tz)`, `from = localDateMinusDays(to, 6)`.
- `listCompletedInLocalDateRange(ownerId, from, to, 30)`.
- `durationMin = finishedAt ? round(Δ/60000) : null`, capped at 600.
- Skipped exercises and exercises with no working sets are omitted.
- Notes, deload, heart rate, RPE, prescription and swaps are never mapped. The same tracking-type filter applies.

**Profile (`friends.profile`):** header from `User` + `SocialProfile`, `counts`, `access` from `ctx.socialAccess`,
and `recipeCount` (non-hidden, non-copy MANUAL) only when recipes are visible.

## 6. Over the air only (no native change)

The whole feature ships as OTA JavaScript on the current 1.0.1 runtime. **No lane may:**

- add or change a dependency in `apps/mobile/package.json`;
- edit `apps/mobile/app.config.js`, `eas.json`, `ios/`, `android/`;
- add a config plugin.

What the feature uses, all already in the binary:

| Need                       | Provided by (already installed)                        |
| -------------------------- | ------------------------------------------------------ |
| Navigation, typed routes   | `expo-router`                                          |
| Motion, layout transitions | `react-native-reanimated`, `react-native-worklets`     |
| Haptics                    | `expo-haptics` (kit `haptics`)                         |
| Images                     | `expo-image`                                           |
| Invite share sheet         | RN core `Share.share` (as `share-list-sheet.tsx` does) |
| Open the source link       | RN core `Linking.openURL` (as the terms sheet does)    |
| Local state, queries       | TanStack Query, the existing tRPC client               |

Audit result while writing this plan: **no screen or behaviour needs a new native module.** Push, the one thing that
would, is out of scope (PRD appendix A).

**Verification (F3.3):**

- `git diff master -- apps/mobile/package.json apps/mobile/app.config.js apps/mobile/eas.json` is empty.
- The runtime fingerprint printed by the OTA publish path (`pnpm mobile:update` prints the runtime per platform;
  use its dry-run/print mode, or `npx @expo/fingerprint` on `apps/mobile`) is identical on `master` and on the
  integration branch, for iOS and Android.

A mismatch is a release blocker. Find the native change and remove it.

## 7. Mobile work (`apps/mobile`)

| Area                   | Files (new unless marked)                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes                 | `app/friends/{index,requests,activity,settings,blocked,suggestions,[userId]}.tsx`. **Edit** `app/_layout.tsx`: `Stack.Screen` entries in the signed-in `Stack.Protected` (F2.0 only).                                                                                                                                                                                        |
| Entry points           | **Edit** `app/(food)/more.tsx` (the `Following` row after Profile + `CountPill`), `app/(food)/_layout.tsx` (`tabBarBadge`), `src/features/settings/settings-screen.tsx` (Account row `Following`), `src/features/privacy/privacy-section.tsx` (`Profile visibility` row), `src/features/privacy/consent-history.tsx` (`SOCIAL_SHARING` → `Following and sharing: {on/off}`). |
| Data layer             | `src/features/friends/api/`: `use-friends-availability.ts`, `use-friends-me.ts` (60 s foreground poll + focus refetch: **the notification mechanism**), `relation-cache.ts`, `query-keys.ts`.                                                                                                                                                                                |
| Shared feature UI      | `src/features/friends/components/{relation-button,person-row,request-row,following-header,locked-panel,invite,source-link}.tsx`; `src/features/friends/safety/{report-sheet,use-block,use-remove-follower,confirm-copy}.tsx`.                                                                                                                                                |
| Home, search, lists    | `src/features/friends/home/**`, `requests-screen.tsx`, `activity-screen.tsx`, `suggestions-screen.tsx`.                                                                                                                                                                                                                                                                      |
| Profile                | `src/features/friends/profile/**`, `food/{friend-week-view,friend-recipe-grid}.tsx`, `gym/{friend-routine-card,friend-workout-card,friend-last-seven-days}.tsx`, `add-to-week/add-to-week-sheet.tsx`.                                                                                                                                                                        |
| Extractions            | `src/features/meal-plan/meal-card-view.tsx` (presentational part of `PlanMealCard`, which then wraps it) and `src/features/gym/routine/day-card-view.tsx` (the local `DayCard` of `app/(gym)/routine.tsx`). No behaviour change on the owner screens.                                                                                                                        |
| Recipe detail/cookbook | **Edit** `app/recipe/[id].tsx` (`By`, `SourceLink`, `Add to my week`, `Report recipe`, `From`, the owner's hidden banner) and `app/(food)/recipes.tsx` (`From {first}` chip). **Edit** `app/recipe-form.tsx` and the import review form (show `data.textRejected` under the name field).                                                                                     |
| Settings               | `src/features/friends/settings/**` (visibility incl. the forced-private state, sharing switches, blocked, turn off). **No notifications section.**                                                                                                                                                                                                                           |
| Kit                    | `packages/ui-mobile/src/components/{avatar,search-field,skeleton,count-pill}.tsx` + `index.ts`.                                                                                                                                                                                                                                                                              |

Rules:

- Overlays are kit `Sheet`/`ConfirmSheet`; chains go through `onExited` (iOS).
- Friend queries stay in the `friends` namespace (INV-7).
- Never use `useGymBootstrap` for another user.
- Units are the viewer's.
- Everything user-visible reads from `FRIENDS_COPY`, so no "Friends" string exists.

## 8. Flags, availability, rollout mechanics

- `friends.availability` → `{ enabled: isFriendsEnabledFor(userId) }`. Mobile gates every entry point on it. A failed
  or absent response means off.
- Kill switch: the `friends` flag off (and the allowlist emptied) → `friends.*` returns `FORBIDDEN`, the entry points
  disappear, and the social branches of `recipe.list`/`findRecipeVisibleTo` stop too (they check
  `isFriendsEnabledFor`).
- Env (`apps/api/src/lib/env.ts` + `.env.example` + `infrastructure.md` §10): `FRIENDS_ALLOWLIST` (comma-separated
  user ids, default empty). **No other new env var.**
- Rollout: PRD §17 (dark → allowlist → store metadata → flag on). Flags change via `infrastructure/scripts/env.sh` +
  an API restart.

## 9. Testing

| Level             | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Where / command                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Utils             | All §3.2 functions: diacritics (`Ștefan`, `Ioana-Maria`); `@` in a name query is plain text; cursor tamper → `null`; owner-week and 7-day bounds at tz edges (`Pacific/Auckland` Sunday 23:30); `sourceDomainOf` (`https://www.bbcgoodfood.com/x` → `bbcgoodfood.com`, `javascript:` → `null`); **word filter**: leet and diacritic evasions caught, a Scunthorpe list (`Scunthorpe`, `assessment`, `cocktail`, `Sussex`, `shiitake`, `Dickens`, Romanian food words) **not** caught                                                                                                                                    | `pnpm --filter @chefer/utils test`                                               |
| Access matrix     | `SocialAccessService`: every PRD §7.1 row × {public, private, forced private} × sharing on/off × blocks both ways. **This is the oracle.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `apps/api/src/application/friends/social-access.service.test.ts`                 |
| Services          | Follow lifecycle and idempotency, the request cap, activate/deactivate transactions (deactivate keeps reports and log), Public auto-accept, forced private refuses Public, name-only search (a query containing an email matches nothing unless a name matches; never reads `email`), suggestions incl. `featured`, block side effects, activity `requestState`, copy dedupe race, add/replace/conflict, INV-5 paths                                                                                                                                                                                                    | co-located `*.test.ts`; `pnpm --filter @chefer/api test`                         |
| Moderation        | Distinct counting (the same reporter twice counts once); ineligible (new or unverified) reports block but don't count; the recipe hides at exactly 3 and the account forces private at exactly 5; concurrency (parallel reports act once); every action logs one row; `hideFilteredRecipes` at activate and recipes-on; recipe create/update/importSave rejection only when shared; FILTER unhide on a clean edit, never REPORTS; `undo` reverses and discounts; the weekly metrics line                                                                                                                                | `moderation.service.test.ts`                                                     |
| DTO shape (INV-2) | The deep key set of every friend DTO from a fully populated owner (allergies, targets, notes, cost, safety, hidden recipe): no `email`, `allergies`, `safety`, `notes`, `calorieTarget`, `estimatedCost`, `pinned`, `avgHeartRateBpm`, `prescription`, `isDeload`; a hidden recipe card carries no name or image                                                                                                                                                                                                                                                                                                        | `friend-dto.mappers.test.ts`                                                     |
| Read-only (INV-4) | `friends.week` on an owner with no plan this week but an earlier one: returns the carried view, and the `mealPlan` row count is unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | service test + contract test                                                     |
| Contract          | `apps/mobile/tests/contract/friends.contract.test.ts`: throwaway users (`uniqueEmail()`); private request → accept → content visible → unfollow → locked; public instant follow + non-follower header only; name search finds, email search doesn't; an imported recipe is listed with `sourceDomain`; heart → Saved with `creator`; add to week → a copy owned by the viewer; the workouts window; report → blocked both ways; 3 eligible reporters → recipe hidden (verified-email throwaways via the confirm-email token path or a test-only seed helper); owner deletes the account → the viewer's plan still loads | `pnpm mobile:contract`                                                           |
| Mobile Jest       | `RelationButton` states/rollback; `relation-cache`; `PersonRow` a11y; intro validation + the name-rejected message; the report sheet submits on one tap and never renders a text input; profile switch doesn't call `setMode`; hidden recipe card not pressable; a copy-deck scan asserting no user-visible "Friends"; kit components                                                                                                                                                                                                                                                                                   | `apps/mobile/tests/unit/friends-*.test.tsx`; `pnpm --filter @chefer/mobile test` |
| Maestro           | `e2e/friends.flow.yaml` (More → Following → intro → turn on → search the seeded public user → follow → Food week → Recipes → heart → Gym last 7 days) and `e2e/friends-requests.flow.yaml` (a `runScript` setup registers two throwaway users over HTTP and makes a request; accept from Activity; report and block). iOS **and** Android `Pixel_8`.                                                                                                                                                                                                                                                                    | `e2e/run-suite.sh <device>`                                                      |
| OTA check         | §6 verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | F3.3                                                                             |

**Seed data** (`packages/database/src/seed.ts`, F1.5):

- `carol@chefer.dev`: PUBLIC, fixed id `cseedcarol000000000000001`, 6 recipes (2 imported with `sourceUrl`), an
  active routine, 4 completed workouts in the last 7 days + 3 older, a current-week plan.
- `dave@chefer.dev`: PRIVATE, `cseeddave0000000000000001`, a pending request to alice.
- `kitchen@chefer.dev`: "Chefer Kitchen", PUBLIC, `featured`.
- `alice` stays **not** activated, so the intro can be tested.
- All seeded social accounts have `emailVerified` set.

## 10. Wave plan

### Wave 0: contracts (F0.1 ∥ F0.2, then F0.3)

**F0.1 L-SCHEMA · opus**

- Task: schema §2 (enums, models, relations, indexes, `SOCIAL_SHARING`), the named migration, and the seven new
  repositories (interface + class + singleton). Simple CRUD is implemented. Query-heavy methods (`searchByName`,
  `popular`, `mutualCandidates`, the distinct-reporter counts) may throw `not implemented` for their W1 owners.
- **Owns:** `packages/database/prisma/schema.prisma`, `prisma/migrations/*_friends_schema/`,
  `packages/database/src/repositories/{social-profile,follow,block,suggestion-dismissal,user-report,moderation,notification}.repository.ts`,
  `repositories/index.ts`, `src/index.ts`.
- AC: `db push` works on an empty and a seeded DB with no data-loss prompt. No existing field changed.
- Verify: `pnpm db:generate && pnpm db:push && pnpm --filter @chefer/database typecheck && pnpm typecheck`.

**F0.2 L-SHARED · sonnet**

- Task: §3.1 and §3.2 in full, incl. `MODERATION`, the word list + filter with tests, `FRIENDS_COPY` (UX §12), the
  flag and the analytics events.
- **Owns:** `packages/types/src/{friends,friends-copy}.ts`, `packages/types/src/{feature-flags,analytics-events,index}.ts`
  (additions only), `packages/utils/src/{friends,moderation}/**`, `packages/utils/src/index.ts`.
- AC: the §9 util cases pass; the analytics type test passes; the copy matches UX §12; no user-facing "Friends".
- Verify: `pnpm --filter @chefer/types test && pnpm --filter @chefer/utils test` + both typechecks.

**F0.3 L-API-SKELETON · opus** (after F0.1 and F0.2 are integrated)

- Task:
  - middleware + errors + `errorFormatter` fields;
  - `friendsProcedure`/`activeFriendsProcedure`, `isFriendsEnabledFor`;
  - `SocialAccessService` **fully implemented**, with the access-matrix test;
  - `routers/friends/{index,graph,content,recipes,safety}.router.ts` (empty except `friends.availability`) +
    registration in `routers/index.ts`;
  - the `moderation.service.ts` **typed stub**;
  - `FRIENDS_ALLOWLIST` env + `.env.example`;
  - a `friends-maintenance.worker.ts` stub wired in `apps/api/src/index.ts`.
- **Owns:** `apps/api/src/lib/{friends-middleware,friends-errors}.ts`, `lib/trpc.ts` (the errorFormatter only),
  `lib/env.ts`, `apps/api/.env.example`, `application/friends/{social-access.service,social-access.service.test,moderation.service}.ts`,
  `routers/friends/*`, `routers/index.ts`, `workers/friends-maintenance.worker.ts`, `apps/api/src/index.ts`.
- AC: the matrix covers every PRD §7.1 row. With the flag off, `friends.*` returns `FORBIDDEN`, except
  `availability`.
- Verify: `pnpm --filter @chefer/api typecheck && pnpm --filter @chefer/api lint && pnpm --filter @chefer/api test`.

**F0.D docs · sonnet**

- **Owns:** `infrastructure.md` §6 (a Friends schema table) and §10 (`FRIENDS_ALLOWLIST`).

### Wave 1: API and kit (batch A: F1.1, F1.2, F1.3 → integrate → batch B: F1.4, F1.5, F1.6)

**F1.1 L-GRAPH · opus** (batch A)

- Task: `social-profile`, `follow`, `friend-search`, `suggestion`, `block`, `activity` services + tests; the
  procedures in `graph.router.ts` (incl. block/unblock/blocked); the query-heavy methods of the social-profile,
  follow, block, dismissal and notification repositories.
- **Owns:** `application/friends/{social-profile,follow,friend-search,suggestion,block,activity}.service{,.test}.ts`,
  `routers/friends/graph.router.ts`, those five repository files.
- AC: PRD FR-02–FR-09 and FR-12, FR-13.1–13.3 and FR-20 are server-complete. Search is name-only and never touches
  `email`. Forced-private rules apply. The rate limits are in place. Everything is idempotent.
- Verify: API typecheck/lint/test.

**F1.2 L-CONTENT · opus** (batch A)

- Task: §5, `friend-dto.mappers.ts` (+ key-set tests), `content.router.ts`, and the `workout-session`/`routine`
  repository additions.
- **Owns:** `application/friends/{friend-content.service,friend-dto.mappers}{,.test}.ts`,
  `routers/friends/content.router.ts`, `packages/database/src/repositories/{workout-session,routine}.repository.ts`
  (additions).
- **Read-only:** `meal-plan.repository.ts`, `application/gym/client-level.ts`, `application/targets/**`.
- AC: INV-2 and INV-4 tests pass; the 7-day window matches FD-15; hidden recipes are masked in the week and excluded
  from recipes; imported recipes carry `sourceDomain`.
- Verify: API typecheck/lint/test.

**F1.3 L-XRECIPE · opus** (batch A)

- Task:
  - the `recipe-access.ts` social branch (imported included, hidden excepting existing hearts);
  - `recipe-copy.service.ts` (keeps `sourceUrl`);
  - `addRecipeToSlot`/`undoAddToSlot`;
  - INV-5 in `replaceRecipe`, `generate` pinned and `logRecipe`;
  - `assemblePlanDto` tolerance;
  - the `meal-plan` and `favourite-recipe` repository changes;
  - `recipe.list`/`getRecipe` additive fields;
  - `recipes.router.ts`;
  - the word-filter call (`moderationService.checkRecipeText`, the stub until batch B) in `recipe.service`
    create/update.
- **Owns:** `application/recipe/{recipe-access,recipe-copy.service,recipe.service}{,.test}.ts`,
  `application/meal-plan/meal-plan.service.ts` (the listed methods), `application/tracker/tracker.service.ts`
  (`logRecipe`), `routers/friends/recipes.router.ts`, `routers/recipe.router.ts` (output typing only if needed),
  `packages/database/src/repositories/{meal-plan,favourite-recipe}.repository.ts`.
- AC: PRD FR-17 is server-complete and §13 holds. Old clients' `recipe.list` fields are unchanged. Any placement path
  yields a copy, made once under concurrency. Deleting the original owner leaves the viewer's plan loadable.
- Verify: API typecheck/lint/test.

**F1.4 L-MODERATION · opus** (batch B; takes over `moderation.service.ts` and `routers/friends/safety.router.ts`)

- Task:
  - §4.6 in full: `reportAndBlock` + thresholds + eligibility + serializable retry, `hideFilteredRecipes`,
    `checkRecipeText`, `undo`, `weeklyMetrics`;
  - `friends.report` in `safety.router.ts`;
  - the word filter on `recipe.importSave`;
  - `scripts/moderation-undo.ts`;
  - `scripts/create-chefer-kitchen.ts`.
- **Owns:** `application/friends/moderation.service{,.test}.ts`, `routers/friends/safety.router.ts`,
  `application/recipe-import/**` (the importSave filter hook only), `routers/import.router.ts` (only if the hook needs
  it), `packages/database/src/repositories/{user-report,moderation}.repository.ts` (query methods),
  `apps/api/src/scripts/{moderation-undo,create-chefer-kitchen}.ts`. (The weekly line is emitted by the worker F1.5
  owns, which calls `moderationService.weeklyMetrics()`, a stub returning zeros until this lane merges.)
- AC: PRD FR-13.4–13.8 and §9 in full. Every automatic action is logged. No human-facing queue, endpoint or email
  exists.
- Verify: API typecheck/lint/test; run both scripts with `--dry-run` against a local DB.

**F1.5 L-DATA · sonnet** (batch B)

- Task: `user.exportData` `social` (incl. reports filed); a `deleteAccount()` test (a user with follows, reports,
  notifications and copies deletes cleanly, and the other user's copy survives with null origins); the maintenance
  worker (expire requests, prune Activity and dismissals > 90 d, and the weekly moderation line via
  `moderationService.weeklyMetrics()`); the seed (§9).
- **Owns:** `application/user/account-data.service{,.test}.ts`, `workers/friends-maintenance.worker{,.test}.ts`,
  `packages/database/src/seed.ts`.
- AC: PRD FR-22. The seed is idempotent, with cuid-shaped fixed ids.
- Verify: API test; `pnpm db:seed` twice.

**F1.6 K-MOBILE-KIT · sonnet** (batch B)

- Task: the UX §3.1 components + Jest tests.
- **Owns:** `packages/ui-mobile/src/components/{avatar,search-field,skeleton,count-pill}.tsx`,
  `packages/ui-mobile/src/index.ts`, `apps/mobile/tests/unit/kit-{avatar,search-field,skeleton,count-pill}.test.tsx`.
- AC: 44 pt targets, labels, reduced motion; JS only.
- Verify: `pnpm --filter @chefer/ui-mobile typecheck && pnpm --filter @chefer/mobile test`.

**F1.D docs · sonnet**

- **Owns:**
  - `infrastructure.md` §5.8 (kit), §7 (services incl. moderation, scripts, worker), §8 (every §4.2 row + the changed
    rows), §9 (the middleware, social access, recipe access extension, INV-3), §14 (the seed accounts);
  - `business_flow.md`: a new §34 "Following: follow, see, save" (the state machine, access, the Activity inbox) and a
    new §35 "Automatic moderation" (report and block, thresholds, the filter, the log, undo); §24 and §28 updates.

Wave 1 exit: the full API ladder + `pnpm mobile:contract` green. The owner merges, and the API deploys dark.

### Wave 2: mobile, OTA only (F2.0 → batch: F2.1, F2.2, F2.3)

**F2.0 M-CORE · opus**

- Task:
  - every friends `Stack.Screen` + stub route files;
  - the entry points (More row + pill, More tab badge, Settings hub row, privacy row, consent label);
  - the data layer (incl. `relation-cache.ts` and the badge poll);
  - the shared components (`RelationButton`, `PersonRow`, `RequestRow`, `FollowingHeader`, `LockedPanel`, `Invite`,
    `SourceLink`);
  - the safety UI (`ReportSheet` one-tap, block/remove hooks + confirms);
  - the `textRejected` display in `recipe-form.tsx` and the import review form.
- **Owns:** `apps/mobile/app/_layout.tsx`, `apps/mobile/app/friends/*.tsx` (stubs), `apps/mobile/app/(food)/{more,_layout}.tsx`,
  `src/features/settings/settings-screen.tsx`, `src/features/privacy/{privacy-section,consent-history}.tsx`,
  `src/features/friends/{api,components,safety}/**`, `apps/mobile/app/recipe-form.tsx` and the import review form
  file (error display only), `apps/mobile/tests/unit/friends-core-*.test.tsx`.
- AC: with availability off, nothing renders and only `availability` is queried. With it on, More shows `Following`
  under Profile and the badges work. `RelationButton` meets UX §3.3. Report is one tap and blocks.
- Verify: mobile ladder 0, 1, 3 (`mobile_native_plan.md` §4).

**F2.1 M-HOME · sonnet**

- Task: the intro, home, name search, requests, activity and suggestions (UX §4–§7). Maestro
  `friends-requests.flow.yaml` + its `runScript` setup.
- **Owns:** `apps/mobile/app/friends/{index,requests,activity,suggestions}.tsx`, `src/features/friends/home/**`,
  `apps/mobile/e2e/friends-requests.flow.yaml`, `apps/mobile/e2e/scripts/friends-setup.js`,
  `apps/mobile/tests/unit/friends-home-*.test.tsx`.
- AC: UX §4–§7 states and copy. PRD FR-02, FR-06–FR-11 and FR-20 are client-complete. No email UI anywhere.
- Verify: ladder 0–4 on iOS and Android.

**F2.2 M-PROFILE · opus**

- Task: UX §8–§10: the profile, Food week (with `Hidden recipe`), recipes grid (source domains), Gym routine + last
  7 days (no paging), the two extractions, `AddToWeekSheet`, the recipe detail additions (`By`, `SourceLink`, the
  owner's hidden banner, `Report recipe`), the cookbook chips. Maestro `friends.flow.yaml`.
- **Owns:** `apps/mobile/app/friends/[userId].tsx`, `src/features/friends/{profile,add-to-week}/**`,
  `src/features/meal-plan/{meal-card-view,plan-meal-card}.tsx`, `app/(gym)/routine.tsx`,
  `src/features/gym/routine/day-card-view.tsx`, `app/recipe/[id].tsx`, `app/(food)/recipes.tsx`,
  `apps/mobile/e2e/friends.flow.yaml`, `apps/mobile/tests/unit/friends-profile-*.test.tsx`.
- AC: PRD FR-14–FR-19. The existing `meal-plan`, `recipes` and `gym-routine` flows stay green. The switch never calls
  `setMode`. No `gym`-prefixed friend query keys.
- Verify: ladder 0–4 on iOS and Android + the three existing flows.

**F2.3 M-SETTINGS · sonnet**

- Task: UX §11: `Sharing & privacy` (visibility incl. forced private, sharing switches + the filter snackbar, targets
  confirm, preview link), blocked people, turn off.
- **Owns:** `apps/mobile/app/friends/{settings,blocked}.tsx`, `src/features/friends/settings/**`,
  `apps/mobile/tests/unit/friends-settings-*.test.tsx`.
- AC: PRD FR-03–FR-05, FR-13.3. No notifications section.
- Verify: ladder 0, 1, 3, 4.

**F2.D docs · sonnet**

- **Owns:** `infrastructure.md` §4.3 (mobile routes and features) and `business_flow.md` §34 (the mobile UI notes,
  the badge as the notification mechanism).

### Wave 3: hardening, legal, launch prep (batch: F3.1, F3.2, F3.3 → F3.D)

**F3.1 L-SECURITY · opus**

- Task: an adversarial review of every `friends.*` procedure and every changed one against INV-1…INV-10. Add abuse
  contract tests:
  - id probing (random, blocked, not activated → identical `NOT_FOUND`);
  - a search with an email string (no email match);
  - the request cap;
  - forged `userId` on locked scopes;
  - `recipe.toggleFavourite`/`mealPlan.getRecipe` on a locked or hidden recipe;
  - `addRecipeToWeek` of a locked recipe;
  - `undoAddToWeek` against another user's plan;
  - a report from a non-visible target;
  - a threshold race;
  - brigading by new or unverified accounts.
- **Owns:** `apps/mobile/tests/contract/friends-abuse.contract.test.ts` + fixes as assigned by the orchestrator.
- AC: a findings list in the PR and zero open criticals.
- Verify: API test + `pnpm mobile:contract`.

**F3.2 L-LEGAL · sonnet** (drafts for owner/counsel)

- Task: PRD §14 items 1–5: the privacy page section + `EFFECTIVE_DATE`, the terms (user content + automatic
  enforcement), the `LEGAL_VERSIONS` bump, `docs/app-store/ios/{privacy-and-rating,review-notes}.md` (the age rating
  UGC → Yes; the §9.6 mapping stating that "timely" is met by the instant block/hide for the reporter plus the
  automatic threshold hide; demo accounts), `docs/app-store/android/data-safety.md`, `docs/friends/dpia.md`.
  The legal pages live in `apps/web` because they're the policy both apps link to. That is not web feature work.
- **Owns:** `apps/web/src/app/{privacy,terms}/page.tsx`, `packages/types/src/legal.ts`, `docs/app-store/**`,
  `docs/friends/dpia.md`.
- AC: every item of PRD §14 is addressed. No push or email-notification wording.
- Verify: `pnpm --filter @chefer/web typecheck`; `pnpm --filter @chefer/types test`.

**F3.3 L-E2E · sonnet**

- Task: the full ladders on iOS and Android (the friends flows + the existing suite), the §6 OTA check (the
  fingerprint and a clean diff on native files), and fixing flaky friends selectors.
- **Owns:** `apps/mobile/e2e/friends*.flow.yaml`.
- Verify: `e2e/run-suite.sh <iPhone>`, `e2e/run-suite.sh Pixel_8`, the §6 commands.

**F3.D launch docs · sonnet** (after F3.1–F3.3)

- **Owns:** `mobile_parity_backlog.md`, `business_flow.md` §20 (a note that Following shipped OTA with no runtime
  change), `CLAUDE.md` seed-accounts rows (the owner approves the edit).
- Task: **the reverse rows ("mobile → web")** in `mobile_parity_backlog.md`, one per PRD §16 web-phase surface: nav
  entry, home/search/lists, Activity + badge, `Sharing & privacy` + blocked, profile Food|Gym, recipe detail + cookbook
  chips, report/block, kit components. This is required by the owner (Q-F-2) and CLAUDE.md. The wave can't close
  without it.

## 11. Documentation updates (the CLAUDE.md table)

| Doc                              | Section / content                                                               | Task             |
| -------------------------------- | ------------------------------------------------------------------------------- | ---------------- |
| `infrastructure.md` §4.3         | Mobile routes and features                                                      | F2.D             |
| `infrastructure.md` §5.8         | New kit components                                                              | F1.D             |
| `infrastructure.md` §6           | The Friends schema table                                                        | F0.D             |
| `infrastructure.md` §7           | The services, moderation, scripts, maintenance worker                           | F1.D             |
| `infrastructure.md` §8           | Every §4.2 row + the changed rows                                               | F1.D             |
| `infrastructure.md` §9           | Middleware, social access, recipe access, INV-3                                 | F1.D             |
| `infrastructure.md` §10          | `FRIENDS_ALLOWLIST`                                                             | F0.D             |
| `infrastructure.md` §14          | Seed accounts carol/dave/kitchen                                                | F1.D             |
| `business_flow.md`               | §34 Following; §35 Automatic moderation; §24 deletion; §28 export; §20 OTA note | F1.D, F2.D, F3.D |
| `mobile_parity_backlog.md`       | The reverse ("mobile → web") rows when the feature ships                        | F3.D             |
| `CLAUDE.md`                      | The seed accounts table                                                         | F3.D             |
| Legal pages, `docs/app-store/**` | PRD §14                                                                         | F3.2             |

No `infrastructure.md` §11 (builds) or §12/§13 change: there's no native build, Docker service or CI change.

## 12. Migration, compatibility, rollout

1. **W0 schema** deploys via `db push` in the compose `migrate` service before the API starts. It's additive, so a
   rollback to the old image is safe.
2. **W1 API** deploys dark. The social branches of existing procedures are gated by `isFriendsEnabledFor`, so
   nothing changes for anyone until the allowlist or flag is set. The word filter only applies to activated users.
3. **W2 mobile** reaches installed 1.0.1 binaries as an OTA update via the deploy workflow's `mobile-update` job,
   with the **same runtime** (§6). It renders nothing while unavailable.
4. **W3** adds the legal bump (the re-accept sheet), the store metadata drafts and the parity rows.
5. **Launch** (owner): allowlist → Chefer Kitchen content → store metadata → `FEATURE_FLAGS=…,friends` + an API
   restart. Watch the weekly moderation line and the PRD §15 metrics.
6. **Rollback:** the flag off (instant). No schema rollback is ever needed.

## 13. Web phase (later, not in these waves)

When the owner schedules web (PRD §16), plan it as its own program from the `mobile_parity_backlog.md` rows F3.D
writes. It needs:

- **Nav and routing:** `nav-items.ts` (`Following` after Profile, and in the gym secondary list), `UserMenu`,
  `middleware.ts` `PROTECTED_ROUTES` + `config.matcher`, `TITLE_MAP`, `APP_ROUTES`, the nav tests.
- **Pages:** `apps/web/src/app/(dashboard)/friends/**`, with layouts and `metadata.title`.
- **Kit:** `@chefer/ui` `Avatar`, `SearchInput`, `Skeleton`, `SegmentedControl`, `CountPill`.
- **Feature code:** `apps/web/src/features/friends/**` mirroring mobile, the recipe detail and cookbook additions,
  the profile page privacy card.
- **Responsive layouts** per UX §15, and the Playwright mobile sweep + `desktop-friends.spec.ts`.

The API needs **no** change for web. Every procedure above is platform-neutral.

## 14. Owner steps

1. Merge each wave's integration PR (merging deploys the API and publishes the OTA update).
2. Counsel review of the privacy and terms sections and `docs/friends/dpia.md`; approve the `LEGAL_VERSIONS` bump.
3. Register the "Chefer Kitchen" account in the app, confirm its email, run `create-chefer-kitchen.ts
--email=<address>` on production, and add a few recipes, a routine and a week.
4. Put the owner's and test accounts' ids in `FRIENDS_ALLOWLIST` (`infrastructure/scripts/env.sh`) for the internal
   check.
5. Store metadata: in App Store Connect set the age-rating answer "User-generated content shared with other users" →
   **Yes** and paste the review notes (F3.2). Do the same in the Play content questionnaire. These go with the next
   store submission; **no new binary is needed for the feature**.
6. Launch: add `friends` to `FEATURE_FLAGS` and restart the API.
7. Optional, any time: read the weekly `moderation.weekly` log line. Use `moderation-undo.ts` only if you choose to.
8. Push notifications: a separate decision later (PRD appendix A).

## 15. Gotchas for agents

- `mealPlan.getForWeek` **writes on read** (carry-forward). Never call it for another user (INV-4).
- `assemblePlanDto` threw on a missing recipe before F1.3. Friend code must never rely on it.
- Any tRPC query key starting with `gym` is persisted to disk for 30 days (`query-persistence.ts`, `isGymQueryKey`).
  Friend data stays under `friends.*`.
- `ModeSwitch` writes the app's persisted mode. The profile's Food|Gym control is a plain `SegmentedControl` with
  local state.
- `typedRoutes` is on. F2.0 creates the route stubs first so `router.push('/friends/...')` typechecks in parallel
  lanes.
- iOS: never open a sheet while another is closing; chain on `onExited`.
- Metro port 8083; `LANG=en_US.UTF-8` before `expo run:*`; guard `hideKeyboard` to Android in Maestro; the dev-menu
  FAB eats top-right taps (`mobile_native_plan.md` §5).
- superjson: raw HTTP to tRPC (Maestro `runScript`, curl) wraps `{"json": …}`.
- `db push` is what production runs. Keep it additive; never use `--accept-data-loss`.
- **Never** add a mobile dependency, touch `app.config.js`/`eas.json`, or trigger a build or submission (§6). OTA
  auto-publish on deploy stays on.
- **Never** write "Friends" in a user-visible string. Use `FRIENDS_COPY`.
- No email search, no email notifications, no push, no human moderation queue: these were all decided out (PRD §5.1).
  Don't reintroduce them.
