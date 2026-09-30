# Chefer Friends: implementation plan

**rev 1 · 2026-09-30 · built on [`prd.md`](./prd.md) and [`ux-design.md`](./ux-design.md) rev 1 · build read
`master` @ `9dd93f3a`**

Role: full-stack engineer/architect, writing for an **orchestrating Claude Code session** that runs AI agents in
waves. This file is the _how_; the PRD is the _what and why_, and the UX spec is the _look, states and copy_. Where
they disagree: PRD wins on behaviour and privacy, the UX spec wins on copy and layout, and this file wins on data,
API and task boundaries.

Task IDs are `F<wave>.<n>`. Lanes are named `L-*` (API), `M-*` (mobile), `W-*` (web), `K-*` (kits). IDs are stable:
append, never renumber.

---

## 0. How to run this plan

- **Execution model** (same mechanics as `gym_plan.md` §9 and the persona-study waves):
  - One orchestrating session (Opus) per wave.
  - Lane agents run as **background tasks**, each in its **own git worktree** (`../chefer-friends-<lane>`), on
    branch `feat/friends/<lane>`, cut from the wave's integration branch `integrate/friends-w<N>`.
  - **Every lane agent starts with `git merge --ff-only integrate/friends-w<N>`**, so it builds on the latest
    integrated state. A lane that can't fast-forward stops and reports.
  - At most **3 concurrent lane agents** (machine and simulator limits). Waves with more lanes run in the batches
    listed.
- **The orchestrator:**
  1. Cuts `integrate/friends-w<N>` from `master` after the previous wave is merged.
  2. Launches lanes with only their task text, their **Owns** list and the pointers to the relevant sections of the
     three docs. Never the whole docs.
  3. Reviews each lane diff and runs the wave's verification ladder.
  4. Merges lanes into the integration branch, resolving conflicts on the few declared shared files.
  5. Runs the docs task.
  6. Opens a PR to `master` and **does not merge it**. The owner merges, because merging deploys the API and
     auto-publishes an OTA update.
- **File ownership is binding.** A lane edits only files in its **Owns** list. A lane that needs a change elsewhere
  stops and asks the orchestrator. Shared files (`schema.prisma`, `routers/index.ts`, `apps/api/src/index.ts`,
  `apps/mobile/app/_layout.tsx`, nav files, `infrastructure.md`, `business_flow.md`) are each edited by exactly one
  task per wave, and that task is named.
- **Models:** `sonnet` for mechanical or well-specified work (kits, screens that compose finished components, docs,
  seed data, legal drafts). `opus` for architecture, authorization, cross-cutting state, native release work and
  security review. Each task says which.
- **Absolute paths for docs.** These docs live in the repo at `docs/friends/`. Once merged they are in every
  worktree. Until then, give agents absolute paths into the orchestrator's checkout.

## 1. Architecture overview

```
 mobile / web ──tRPC──▶ friends.* ─┬─ requireFriendsEnabled ─ requireActivated ─ requireSocialAccess(scope)
                                    │         (middleware, lib/friends-middleware.ts)
                                    ▼
          application/friends/*  (services, no Prisma)          application/recipe/recipe-copy.service.ts
            SocialAccessService ◀── every read of another user ──▶ recipe-access.ts (extended)
            SocialProfile · Follow · Search · Suggestion · Block/Report · Activity · FriendContent
                                    │
                                    ▼
          packages/database repositories (interfaces + Prisma impls)
                                    │
                                    ▼  Notification rows (pushState = PENDING)  = the push outbox
          workers/push-dispatch.worker.ts ─▶ Expo Push API ─▶ APNs / FCM ─▶ phone
          workers/push-receipt.worker.ts  ─▶ prune dead tokens
          workers/friends-maintenance.worker.ts (expire requests, prune Activity > 90 days)
```

**Invariants.** Every task must preserve these. Security review F4.1 checks each one.

| #     | Invariant                                                                                                                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-1 | **Server-side authorization only.** Every procedure that returns or acts on another user's data takes a `userId` input and runs `requireSocialAccess(scope)` (or the service calls `SocialAccessService.assert`) before touching data. Clients never decide visibility.                               |
| INV-2 | **Allow-list DTOs.** Other-user responses are built by `application/friends/friend-dto.mappers.ts` from Prisma rows, field by field. Never reuse or spread an own-data DTO (`WeekPlanDto`, `RoutineDto`, `SessionSummaryDto`). A unit test asserts the exact key set of every friend DTO (deep).      |
| INV-3 | **No existence oracle.** Blocked, not activated and not found are indistinguishable to the caller (`NOT_FOUND`, message `Profile not available`). `FORBIDDEN` with `data.friendsLocked` is only returned when the header itself is visible (relation exists or the profile is findable).              |
| INV-4 | **Read-only reads.** Friend reads never write to the owner's rows (no carry-forward, no tailoring, no image-priority bumps).                                                                                                                                                                          |
| INV-5 | **Own records hold own rows.** Anything written into the **viewer's** plan, pinned favourites at generation time, or food log references a recipe the viewer owns or an open (AI/CURATED) recipe. A friend's `MANUAL` recipe is resolved to the viewer's copy first (`RecipeCopyService.ownedIdFor`). |
| INV-6 | **No emails out.** No friends procedure returns an email address, except `friends.me`, which returns nothing about email either.                                                                                                                                                                      |
| INV-7 | **Not persisted on the phone's gym store.** Friend data lives under the `friends` tRPC namespace. It never goes under `gym.*`, whose query keys `query-persistence.ts` writes to disk for 30 days.                                                                                                    |
| INV-8 | **Additive API.** New procedures and optional fields only. No existing input or output changes shape. No new `x-chefer-api-level`.                                                                                                                                                                    |
| INV-9 | **Push after commit, no health data.** Push is sent by a worker reading committed `Notification` rows. Payloads carry only the actor's display name, the kind and ids.                                                                                                                                |

## 2. Data model (Prisma, `packages/database/prisma/schema.prisma`)

All changes are additive: new tables, nullable columns, columns with defaults, one new enum value and new indexes.
Production applies them with `prisma db push --skip-generate` through the compose `migrate` service
(`docker-compose.deploy.yml`). A named migration (`prisma/migrations/<timestamp>_friends_schema/`) keeps the history
honest, as the wave-0 schema did.

### 2.1 New enums

```prisma
enum ProfileVisibility {
  PUBLIC
  PRIVATE
}

enum FollowStatus {
  PENDING   // a request to a private profile
  ACCEPTED
}

enum NotificationKind {
  FOLLOW_REQUEST
  NEW_FOLLOWER
  REQUEST_ACCEPTED
}

enum PushState {
  NONE      // not pushable (web-only recipient, preference off, flag off at creation)
  PENDING   // the dispatch worker will pick it up
  SENT      // tickets stored; the receipt worker checks them
  SKIPPED   // capped, no tokens, preference off at send time
  FAILED
}

enum ReportReason {
  INAPPROPRIATE
  SPAM
  HARASSMENT
  UNSAFE
  OTHER
}

// ConsentKind gains one value (additive):
//   SOCIAL_SHARING   // Friends turned on / public / targets shared (granted) or turned off (withdrawn)
```

### 2.2 New models

```prisma
/// One row = the user turned Friends on (PRD FD-3). No row = not discoverable, not followable.
model SocialProfile {
  userId              String            @id
  visibility          ProfileVisibility @default(PRIVATE)
  /// Normalised "first last name" (lowercase, NFD diacritics stripped, single spaces), from
  /// normalizeSearchName() in @chefer/utils. Rewritten on activate and on any name change.
  searchName          String
  sharePlan           Boolean           @default(true)
  shareRecipes        Boolean           @default(true)
  shareWorkouts       Boolean           @default(true)
  shareTargets        Boolean           @default(false)
  pushFollowRequests  Boolean           @default(true)
  pushNewFollowers    Boolean           @default(true)
  pushRequestAccepted Boolean           @default(true)
  /// Set once the push primer was shown/answered on any device (UX §7.4); null = never.
  pushPrimerAt        DateTime?
  activatedAt         DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([visibility])
  @@index([searchName])
  @@map("social_profiles")
}

/// Directed edge follower → followee. PENDING = request. Decline/cancel/unfollow/remove = delete.
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

model UserReport {
  id           String       @id @default(cuid())
  reporterId   String
  targetUserId String
  recipeId     String?      // no FK: the report survives the recipe's deletion
  reason       ReportReason
  note         String?
  createdAt    DateTime     @default(now())
  resolvedAt   DateTime?

  reporter User @relation("ReportsMade", fields: [reporterId], references: [id], onDelete: Cascade)
  target   User @relation("ReportsReceived", fields: [targetUserId], references: [id], onDelete: Cascade)

  @@index([resolvedAt, createdAt])
  @@index([targetUserId])
  @@map("user_reports")
}

/// In-app Activity + the push outbox (INV-9). One row per (recipient, kind, actor): a re-sent
/// request upserts the same row (fresh createdAt, readAt = null) instead of stacking duplicates.
model Notification {
  id          String           @id @default(cuid())
  userId      String           // recipient
  kind        NotificationKind
  actorId     String
  createdAt   DateTime         @default(now())
  readAt      DateTime?
  pushState   PushState        @default(NONE)
  pushTickets Json             @default("[]") // [{ ticketId, tokenId }]
  pushedAt    DateTime?

  user  User @relation("NotificationsReceived", fields: [userId], references: [id], onDelete: Cascade)
  actor User @relation("NotificationsCaused", fields: [actorId], references: [id], onDelete: Cascade)

  @@unique([userId, kind, actorId])
  @@index([userId, createdAt])
  @@index([userId, readAt])
  @@index([pushState, createdAt])
  @@map("notifications")
}

/// Expo push tokens, one row per device install. A token that shows up for another user
/// (account switch on the same phone) is re-assigned, never duplicated.
model PushToken {
  id           String    @id @default(cuid())
  userId       String
  token        String    @unique // "ExponentPushToken[...]"
  platform     String    // "ios" | "android"
  appVariant   String    // "production" | "development"
  createdAt    DateTime  @default(now())
  lastSeenAt   DateTime  @default(now())
  disabledAt   DateTime? // DeviceNotRegistered receipt, or unregister on sign-out

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("push_tokens")
}
```

### 2.3 Changed models (additive)

```prisma
model User {
  // …existing…
  socialProfile          SocialProfile?
  followsOut             Follow[]              @relation("FollowsOut")
  followsIn              Follow[]              @relation("FollowsIn")
  blocksMade             Block[]               @relation("BlocksMade")
  blocksReceived         Block[]               @relation("BlocksReceived")
  dismissalsMade         SuggestionDismissal[] @relation("DismissalsMade")
  dismissalsReceived     SuggestionDismissal[] @relation("DismissalsReceived")
  reportsMade            UserReport[]          @relation("ReportsMade")
  reportsReceived        UserReport[]          @relation("ReportsReceived")
  notificationsReceived  Notification[]        @relation("NotificationsReceived")
  notificationsCaused    Notification[]        @relation("NotificationsCaused")
  pushTokens             PushToken[]
  copiedRecipesOrigin    Recipe[]              @relation("RecipeOriginCreator")
}

model Recipe {
  // …existing…
  /// PRD FD-7: set on a viewer's private copy of a friend's recipe (made by "Add to my week").
  /// SetNull when the source recipe or its creator goes away; the copy stays the viewer's.
  originRecipeId  String?
  originCreatorId String?

  originRecipe  Recipe?  @relation("RecipeCopies", fields: [originRecipeId], references: [id], onDelete: SetNull)
  copies        Recipe[] @relation("RecipeCopies")
  originCreator User?    @relation("RecipeOriginCreator", fields: [originCreatorId], references: [id], onDelete: SetNull)

  @@unique([creatorId, originRecipeId]) // at most one copy per viewer and source (NULLs are distinct)
  @@index([creatorId, source, createdAt])
}

model WorkoutSession {
  // …existing…
  @@index([userId, status, startedAt]) // friend history: COMPLETED, newest first, cursor on startedAt|id
}
```

**Backfill:** none. No `SocialProfile` means not activated. Existing recipes have null origins.

**`deleteAccount()` impact** (`apps/api/src/application/user/account-data.service.ts`): every new table cascades
from `User`. The explicit `recipe.deleteMany({ creatorId, source: MANUAL })` also deletes the originals of friends'
copies, and their `originRecipeId` is SetNull, which is intended. The originals' uploaded photo files are deleted by
`deleteUploadedFiles`, so a copy whose `imageUrl` points at such a file shows the placeholder (PRD §13). Friends'
`FavouriteRecipe` rows referencing the deleted originals cascade away.

### 2.4 Repositories (`packages/database/src/repositories/`, interface + class + singleton, exported from `index.ts`)

Follow the existing pattern (`household-member.repository.ts`): `export interface IXRepository`,
`export class XRepository implements IXRepository`, `export const xRepository = new XRepository()`.

| File                                 | Interface (methods, abridged)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `social-profile.repository.ts`       | `find(userId)`, `findMany(userIds)`, `create(data)`, `update(userId, patch)`, `deleteCascadeSocial(userId)` (one `$transaction`: follows both ways, blocks made, dismissals made, notifications both ways, the profile), `searchByName(tokens, excludeIds, cursor, limit)` (AND of `searchName` prefix matches: `searchName startsWith token OR contains ' ' + token`), `popular(minFollowers, activeSince, excludeIds, limit)`                                                                                                                                                                                                                              |
| `follow.repository.ts`               | `find(followerId, followeeId)`, `findPair(a, b)` (both directions, one query), `create(followerId, followeeId, status)`, `accept(followerId, followeeId)`, `acceptAllPendingTo(followeeId)` → count, `delete(followerId, followeeId)`, `listFollowing(userId, cursor, limit)`, `listFollowers(userId, cursor, limit)`, `listPendingTo(userId, cursor, limit)`, `counts(userId)` → `{ followers, following, pendingIn }`, `acceptedFolloweeIdsWithShare(viewerId, share: 'recipes')` (join `social_profiles`), `mutualCandidates(viewerId, limit)` (followees-of-followees with mutual counts, one SQL via Prisma `groupBy`) , `expirePendingOlderThan(date)` |
| `block.repository.ts`                | `existsEither(a, b)`, `blockedIdsEither(userId)`, `create(blockerId, blockedId)`, `delete(blockerId, blockedId)`, `listMade(userId, cursor, limit)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `suggestion-dismissal.repository.ts` | `upsert(userId, dismissedUserId)`, `activeIds(userId, since)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `user-report.repository.ts`          | `create(data)`, `listOpen(cursor, limit)`, `resolve(id)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `notification.repository.ts`         | `upsertSocial({ userId, kind, actorId, pushState })`, `withdraw(userId, kind, actorId)`, `list(userId, cursor, limit)`, `unreadCount(userId)`, `markReadUpTo(userId, upTo)`, `claimPendingPush(limit)` (`UPDATE … SET pushState = 'SKIPPED'` guard via `updateMany` on ids, so a double tick never double-sends), `markPushed(id, tickets)`, `findSentForReceipts(olderThan, limit)`, `countPushedToRecipientSince(userId, since)`, `countPushedPairSince(userId, actorId, since)`, `deleteOlderThan(date)`                                                                                                                                                  |
| `push-token.repository.ts`           | `upsert({ userId, token, platform, appVariant })` (re-assigns `userId`, clears `disabledAt`, bumps `lastSeenAt`), `disable(token)`, `disableById(id)`, `activeForUser(userId)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**Changed repositories** (owned by the lane noted in §11):

- `favourite-recipe.repository.ts`: `findAllRecipesForUser` gains `opts.visibleCreatorIds?: string[]`, and its
  "never list another user's private recipe" `OR` becomes `[{ source: { not: MANUAL } }, { creatorId: userId }, {
creatorId: { in: visibleCreatorIds }, sourceUrl: null, originRecipeId: null }]` (the last branch only when the
  array is non-empty). Rows `include: { creator: { select: { id, firstName, lastName, name } } }` for the `From`
  chip. `createManualRecipe` accepts `originRecipeId`/`originCreatorId`.
- `meal-plan.repository.ts`: new `appendDayMeal(planId, dayOfWeek, mealType, recipeId, { pinned })` → the new slot
  index (creates the `MealPlanDay` row if the plan lacks that day; appends so existing slot indexes don't move), and
  `removeDayMealIfMatches(planId, dayOfWeek, slotIndex, recipeId)` (for Undo).
- `workout-session.repository.ts`: `listCompletedForFriend(userId, { since, cursor, limit })` (status `COMPLETED`,
  `startedAt >= since`, order `startedAt desc, id desc`, include exercises + exercise `{ id, name, isCustom via
userId != null, trackingType }` + sets where `completedAt != null AND isWarmup = false`).
- `routine.repository.ts`: `findActiveWithExercises(userId)` (if not already present in that shape).

## 3. Shared code (`@chefer/types`, `@chefer/utils`)

### 3.1 `packages/types/src/friends.ts` (exported from `index.ts`)

```ts
export const PROFILE_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];
export type Relation = 'self' | 'none' | 'requested' | 'following';
export type FollowPolicy = 'instagram' | 'literal';

export const FRIENDS_LIMITS = {
  pageSize: 20,
  searchMinChars: 2,
  searchMaxChars: 100,
  workoutsPageSize: 5,
  workoutsHistoryWeeks: 26,
  suggestionsHome: 5,
  suggestionsAll: 30,
  suggestionCacheMs: 10 * 60_000,
  dismissalDays: 90,
  requestExpiryDays: 90,
  activityRetentionDays: 90,
  popularMinFollowers: 3,
  popularActiveDays: 30,
  reportNoteMax: 500,
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
  documentVersion: z.string().max(20).optional(), // defaults to LEGAL_VERSIONS.privacy server-side
});
export const updateFriendsSettingsInputSchema = z
  .object({
    visibility: z.enum(PROFILE_VISIBILITIES),
    sharePlan: z.boolean(),
    shareRecipes: z.boolean(),
    shareWorkouts: z.boolean(),
    shareTargets: z.boolean(),
    pushFollowRequests: z.boolean(),
    pushNewFollowers: z.boolean(),
    pushRequestAccepted: z.boolean(),
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
export const friendWorkoutsInputSchema = z.object({
  userId: friendUserIdSchema,
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(20).default(FRIENDS_LIMITS.workoutsPageSize),
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
  note: z.string().trim().max(FRIENDS_LIMITS.reportNoteMax).optional(),
  alsoBlock: z.boolean().default(false),
});
export const markActivityReadInputSchema = z.object({ upTo: z.date() });
export const registerPushTokenInputSchema = z.object({
  token: z
    .string()
    .regex(/^Expo(nent)?PushToken\[[^\]]{10,}\]$/)
    .max(200),
  platform: z.enum(['ios', 'android']),
  appVariant: z.enum(['production', 'development']),
});
export const unregisterPushTokenInputSchema = registerPushTokenInputSchema.pick({ token: true });
```

**DTOs** (plain `interface`s in the same file; the API returns exactly these):

```ts
export interface FriendUserSummary {
  id: string;
  displayName: string; // "{first} {last}", fallback name, fallback "Chefer user"
  firstName: string; // for "{first}" copy; fallback displayName's first word
  imageUrl: string | null; // User.image if ever set
  relation: Relation;
  followsYou: boolean;
  requestedYou: boolean; // they have a PENDING request to me
}
export interface FriendsAvailabilityDto {
  enabled: boolean;
}
export interface FriendsMeDto {
  activated: boolean;
  firstName: string | null;
  lastName: string | null; // prefill for the intro
  settings: null | {
    visibility: ProfileVisibility;
    sharePlan: boolean;
    shareRecipes: boolean;
    shareWorkouts: boolean;
    shareTargets: boolean;
    pushFollowRequests: boolean;
    pushNewFollowers: boolean;
    pushRequestAccepted: boolean;
    pushPrimerShown: boolean;
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
export type SectionAccess = 'visible' | 'locked' | 'not_shared';
export interface FriendProfileDto {
  user: FriendUserSummary;
  isSelf: boolean;
  visibility: ProfileVisibility;
  counts: { followers: number; following: number };
  access: { plan: SectionAccess; recipes: SectionAccess; workouts: SectionAccess };
  recipeCount: number | null; // only when access.recipes === 'visible'
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
  byFriend: boolean; // the friend's own MANUAL recipe (shows "By"), false for AI/CURATED in their week
  isFavourite: boolean; // the VIEWER's heart state
}
export interface FriendWeekDto {
  weekStartDate: string; // YYYY-MM-DD, owner's Monday
  todayIndex: number; // 0..6 in the owner's time zone
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
  targets: FriendMacroTotals | null; // only when the owner shares targets
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
  requestState?: 'pending' | 'accepted' | 'declined'; // FOLLOW_REQUEST only; 'declined' = gone
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
```

Also in `@chefer/types`:

- `friends-copy.ts`: `FRIENDS_COPY` (the UX §12 deck; string functions for variables).
- `feature-flags.ts`: keys `friends` and `friendsPush` (both default off).
- `analytics-events.ts`: the PRD §15 events. Enums and counts only, with **no `OpaqueId` of other users**.
- `ConsentKind` is a Prisma enum. Any client label map for consent kinds (web/mobile consent-history components)
  gains `SOCIAL_SHARING: 'Friends and sharing'`.

### 3.2 `packages/utils/src/friends/` (pure, unit-tested, exported from `index.ts`)

| File               | Exports                                                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `follow-policy.ts` | `followPolicy(targetVisibility, policy): 'instant' \| 'request' \| 'not_allowed'` and `isDiscoverable(visibility, policy)` (PRD §6.1)                                                                                             |
| `search-name.ts`   | `normalizeSearchName(first, last, name?)` (NFD, strip `\p{M}`, lowercase, `[^a-z0-9@. ]`→space, collapse); `queryTokens(q)`; `isFullEmail(q)` (one `@`, a dot after it, no spaces, ≤ 254); `matchesAllTokens(searchName, tokens)` |
| `display-name.ts`  | `displayNameOf({ firstName, lastName, name })` and `firstNameOf(…)` with the `Chefer user` fallback; `initialsOf(displayName)`; `avatarColorIndex(seed, 8)`                                                                       |
| `suggestions.ts`   | `scoreSuggestion({ mutualCount, followsYou, followers })` and `rankSuggestions(candidates, limit)` (PRD §11 weights: `10×mutual`, `+25` follows-you, `2×ln(1+followers)` popular; tie-breaks)                                     |
| `relation.ts`      | `relationOf({ isSelf, outgoing?: FollowStatus })` and `nextRelationAfterFollow(policyResult)`                                                                                                                                     |
| `cursor.ts`        | `encodeCursor(date, id)` / `decodeCursor(s)` (base64url of `ISO                                                                                                                                                                   | id`, throws `BAD_REQUEST`-safe errors as `null`) |
| `owner-week.ts`    | `ownerLocalDate(now, timeZone \| null)` (Intl, falls back to UTC); `mondayUtcOf(localDate)`; `weekdayIndex(localDate)` (0 = Mon)                                                                                                  |
| `friend-totals.ts` | `slotTotals(nutritionPerServing, portion)`, `dayTotals(slots)`, `weekAverageKcal(days)` (reuse `slotPortion`/rounding rules from `meal-portion.ts`, same as `sumPlanDay`)                                                         |

## 4. API

### 4.1 Routers

`apps/api/src/routers/friends/index.ts` exports `friendsRouter = router({ ...graph, ...content, ...recipes, ...safety
})`, composed from four sub-router files so the parallel lanes never share a file. Registered once as `friends:
friendsRouter` in `routers/index.ts` (F0.3). Push-token procedures are device-level, so they go in the existing
`notifications` router (a separate `routers/notifications-push.router.ts` merged with `mergeRouters` in
`routers/index.ts` by F0.3, so `notifications.router.ts` itself isn't touched).

**Middleware** (`apps/api/src/lib/friends-middleware.ts`, composed after `.input()`, like `requireHealthConsent`):

| Middleware                   | Rule                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requireFriendsEnabled`      | `isFlagEnabled('friends') \|\| env.FRIENDS_ALLOWLIST.has(ctx.user.id)`, else `FORBIDDEN` `FRIENDS_UNAVAILABLE` (`data.friendsUnavailable: true`).                                                                                                                                                                            |
| `requireActivated`           | The caller has a `SocialProfile`, else `PRECONDITION_FAILED` `FRIENDS_NOT_ACTIVATED` (`data.friendsNotActivated: true`).                                                                                                                                                                                                     |
| `requireSocialAccess(scope)` | `scope ∈ 'header' \| 'plan' \| 'recipes' \| 'workouts'`. Reads `input.userId` and resolves `SocialAccessService.resolve(ctx.user.id, input.userId)` into `ctx.socialAccess`. Profile not visible → `NOT_FOUND` `Profile not available`. Scope not visible → `FORBIDDEN` with `data.friendsLocked: 'locked' \| 'not_shared'`. |

The `errorFormatter` in `lib/trpc.ts` gains `friendsUnavailable`, `friendsNotActivated`, `friendsLocked` (from
typed `cause` classes in `lib/friends-errors.ts`, like `ConflictCause`) and `unsafeForTable` (see
`addRecipeToWeek`). Procedure bases:

```ts
export const friendsProcedure = protectedProcedure.use(requireFriendsEnabled);
export const activeFriendsProcedure = friendsProcedure.use(requireActivated);
```

### 4.2 Procedure map (all new; add every row to `infrastructure.md` §8)

| Procedure                                      | Base / middleware                                          | Type     | Input (Zod, §3.1)                       | Output                                                                                                                      | Rate limit (`assertWithinRateLimit`)                      | Lane      |
| ---------------------------------------------- | ---------------------------------------------------------- | -------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| `friends.availability`                         | `protectedProcedure` (no flag check)                       | Query    | none                                    | `FriendsAvailabilityDto`                                                                                                    | none                                                      | F0.3      |
| `friends.me`                                   | `friendsProcedure`                                         | Query    | none                                    | `FriendsMeDto`                                                                                                              | none                                                      | L-GRAPH   |
| `friends.activate`                             | `friendsProcedure`                                         | Mutation | `activateFriendsInputSchema`            | `FriendsMeDto`                                                                                                              | 10/h                                                      | L-GRAPH   |
| `friends.updateSettings`                       | `activeFriendsProcedure`                                   | Mutation | `updateFriendsSettingsInputSchema`      | `FriendsMeDto` + `{ autoAccepted?: number }`                                                                                | 60/h                                                      | L-GRAPH   |
| `friends.deactivate`                           | `activeFriendsProcedure`                                   | Mutation | `deactivateFriendsInputSchema`          | `{ ok: true }`                                                                                                              | 5/h                                                       | L-GRAPH   |
| `friends.search`                               | `activeFriendsProcedure`                                   | Query    | `friendsSearchInputSchema`              | `Page<FriendUserSummary & { mutualCount: number }>`                                                                         | 60/min; + 20/h when `isFullEmail(query)`                  | L-GRAPH   |
| `friends.suggestions`                          | `activeFriendsProcedure`                                   | Query    | `{ limit ≤ 30 }`                        | `(FriendUserSummary & { reason, mutualCount, reasonName? })[]`                                                              | none (10-min cache)                                       | L-GRAPH   |
| `friends.dismissSuggestion`                    | `activeFriendsProcedure`                                   | Mutation | `targetUserInputSchema`                 | `{ ok: true }`                                                                                                              | 120/h                                                     | L-GRAPH   |
| `friends.follow`                               | `activeFriendsProcedure` + `requireSocialAccess('header')` | Mutation | `targetUserInputSchema`                 | `{ relation: Relation }`                                                                                                    | 60/h; 3 per target per 7 d when the result is `requested` | L-GRAPH   |
| `friends.unfollow`                             | `activeFriendsProcedure`                                   | Mutation | `targetUserInputSchema`                 | `{ relation: 'none' }`                                                                                                      | 60/h                                                      | L-GRAPH   |
| `friends.acceptRequest` / `declineRequest`     | `activeFriendsProcedure`                                   | Mutation | `targetUserInputSchema` (the requester) | `{ ok: true }` (idempotent)                                                                                                 | 300/h                                                     | L-GRAPH   |
| `friends.removeFollower`                       | `activeFriendsProcedure`                                   | Mutation | `targetUserInputSchema`                 | `{ ok: true }`                                                                                                              | 60/h                                                      | L-GRAPH   |
| `friends.following` / `followers` / `requests` | `activeFriendsProcedure`                                   | Query    | `friendsPageInputSchema`                | `Page<FriendUserSummary>` (+ `total`)                                                                                       | none                                                      | L-GRAPH   |
| `friends.activity`                             | `activeFriendsProcedure`                                   | Query    | `friendsPageInputSchema`                | `Page<ActivityItemDto>`                                                                                                     | none                                                      | L-GRAPH   |
| `friends.markActivityRead`                     | `activeFriendsProcedure`                                   | Mutation | `markActivityReadInputSchema`           | `{ unreadActivity: number }`                                                                                                | none                                                      | L-GRAPH   |
| `friends.markPushPrimerShown`                  | `activeFriendsProcedure`                                   | Mutation | none                                    | `{ ok: true }`                                                                                                              | none                                                      | L-GRAPH   |
| `friends.block` / `unblock`                    | `activeFriendsProcedure`                                   | Mutation | `targetUserInputSchema`                 | `{ ok: true }`                                                                                                              | 30/day                                                    | L-GRAPH   |
| `friends.blocked`                              | `activeFriendsProcedure`                                   | Query    | `friendsPageInputSchema`                | `Page<FriendUserSummary>`                                                                                                   | none                                                      | L-GRAPH   |
| `friends.report`                               | `activeFriendsProcedure`                                   | Mutation | `reportInputSchema`                     | `{ ok: true }`                                                                                                              | 10/day                                                    | L-GRAPH   |
| `friends.profile`                              | `activeFriendsProcedure` + `requireSocialAccess('header')` | Query    | `targetUserInputSchema`                 | `FriendProfileDto`                                                                                                          | 300/h                                                     | L-CONTENT |
| `friends.week`                                 | `… + requireSocialAccess('plan')`                          | Query    | `targetUserInputSchema`                 | `FriendWeekDto \| null`                                                                                                     | 300/h                                                     | L-CONTENT |
| `friends.recipes`                              | `… + requireSocialAccess('recipes')`                       | Query    | `friendRecipesInputSchema`              | `Page<FriendRecipeCard>`                                                                                                    | 300/h                                                     | L-CONTENT |
| `friends.routine`                              | `… + requireSocialAccess('workouts')`                      | Query    | `targetUserInputSchema`                 | `FriendRoutineDto \| null`                                                                                                  | 300/h                                                     | L-CONTENT |
| `friends.workouts`                             | `… + requireSocialAccess('workouts')`                      | Query    | `friendWorkoutsInputSchema`             | `Page<FriendWorkoutDto>`                                                                                                    | 300/h                                                     | L-CONTENT |
| `friends.addRecipeToWeek`                      | `activeFriendsProcedure`                                   | Mutation | `addRecipeToWeekInputSchema`            | `{ planId, dayOfWeek, mealType, slotIndex, addedRecipeId, copiedFromId: string \| null, previousRecipeId: string \| null }` | 120/h                                                     | L-XRECIPE |
| `friends.undoAddToWeek`                        | `activeFriendsProcedure`                                   | Mutation | `undoAddToWeekInputSchema`              | `{ ok: true }`                                                                                                              | 120/h                                                     | L-XRECIPE |
| `notifications.registerPushToken`              | `protectedProcedure`                                       | Mutation | `registerPushTokenInputSchema`          | `{ ok: true }`                                                                                                              | 20/h                                                      | L-PUSH    |
| `notifications.unregisterPushToken`            | `protectedProcedure`                                       | Mutation | `unregisterPushTokenInputSchema`        | `{ ok: true }` (own tokens only; unknown = ok)                                                                              | 20/h                                                      | L-PUSH    |
| `admin.reports.list` / `resolve` (P1)          | `adminProcedure`                                           | Q / M    | `friendsPageInputSchema` / `{ id }`     | reports with reporter/target display names                                                                                  | none                                                      | L-GRAPH   |

Push-token procedures are **not** behind the flag. Tokens are harmless device registrations, so a binary can
register before launch.

**Existing procedures that change (additive only, INV-8):**

| Procedure                                                                                                 | Change                                                                                                                                                                                                                                                                 | Lane      |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `recipe.list`                                                                                             | `savedOnly` and "All" include friends' shared recipes you hearted (visible creators). Each row gains optional `creator?: { id, displayName, firstName }` (present only for another user's recipe) and `origin?: { creatorFirstName: string \| null }` for your copies. | L-XRECIPE |
| `recipe.toggleFavourite`, `recipe.isSaved`, `recipe.rate`, `mealPlan.getRecipe`, `recipe.getSafetyChecks` | Now succeed for a friend's shared recipe (through the extended `findRecipeVisibleTo`). `mealPlan.getRecipe` output gains `creator?` (same shape).                                                                                                                      | L-XRECIPE |
| `mealPlan.replaceRecipe`                                                                                  | When `recipeId` is another user's MANUAL recipe (reachable only via friends), the service swaps in the viewer's copy (INV-5). Output unchanged.                                                                                                                        | L-XRECIPE |
| `mealPlan.generate`                                                                                       | Pinned favourites (`useInNextPlan`) that are friends' recipes are placed as the viewer's copies (INV-5).                                                                                                                                                               | L-XRECIPE |
| `tracker.logRecipe`                                                                                       | A friend's MANUAL recipe is logged as the viewer's copy (INV-5).                                                                                                                                                                                                       | L-XRECIPE |
| `user.exportData`                                                                                         | Adds `social` (PRD FR-22.1).                                                                                                                                                                                                                                           | L-DATA    |
| `user.me` / `auth.me`                                                                                     | No change. Clients use `friends.me`.                                                                                                                                                                                                                                   | n/a       |

### 4.3 Authorization: `SocialAccessService` (`application/friends/social-access.service.ts`)

```ts
interface SocialAccess {
  visible: boolean;           // header may be shown
  isSelf: boolean;
  ownerVisibility: ProfileVisibility | null;
  outgoing: FollowStatus | null;   // viewer → owner
  incoming: FollowStatus | null;   // owner → viewer
  can: { plan: SectionAccess; recipes: SectionAccess; workouts: SectionAccess; targets: boolean };
}
resolve(viewerId, ownerId): Promise<SocialAccess>
```

Rules, evaluated in order. Every rule has a table-driven test row (F0.3); the §7.1 matrix of the PRD is the test
oracle.

1. `viewerId === ownerId`: `visible`, `isSelf`, every section `visible`, `targets` true. Still requires the viewer
   to be activated (`requireActivated` runs first). Used by the own-profile preview, which renders the **friend**
   DTOs so the preview is exactly what followers get. The preview therefore shows `not_shared` sections as
   `Hidden from followers` (the client maps it).
2. Owner has no `SocialProfile` → `visible: false`.
3. A `Block` exists in either direction → `visible: false`.
4. Policy B only (`FRIENDS_FOLLOW_POLICY=literal`): owner `PRIVATE` and `outgoing !== ACCEPTED` → `visible: false`.
5. Otherwise `visible: true`. The sections are `outgoing === ACCEPTED ? (share ? 'visible' : 'not_shared') :
'locked'`. `targets = can.plan === 'visible' && owner.shareTargets`.

Within a request, the resolver memoises per `(viewer, owner)` (a `Map` on `ctx`), so a procedure calling it twice
costs one query set. Across requests there is **no** cache (PRD FR-03.4).

**Recipe access** (`application/recipe/recipe-access.ts`, extended by L-XRECIPE):

```ts
export async function findRecipeVisibleTo(
  userId,
  recipeId,
  repo = mealPlanRepository,
  social = socialAccessService,
);
// unchanged: open recipe or own recipe → visible; in one of my plans → visible
// NEW: MANUAL && creatorId && creatorId !== userId && sourceUrl === null && originRecipeId === null
//      && (await social.resolve(userId, creatorId)).can.recipes === 'visible' → visible
```

`isRecipeOpenTo` (sync) is unchanged. Only the async path learns about friends, so every existing caller of
`findRecipeVisibleTo` (getRecipe, favourite, rate, replace, tracker) gets the rule for free and in one place.

### 4.4 Services (`apps/api/src/application/friends/`; constructor-injected repositories with singleton defaults, like `HouseholdService`)

| Service                                     | Responsibilities and notable rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `social-profile.service.ts`                 | `me`, `activate` (one transaction: update `User.firstName/lastName/name`, create `SocialProfile` with `searchName`, `ConsentService.record({ kind: 'SOCIAL_SHARING', granted: true, documentVersion, source })`; a second call is idempotent and returns `me`), `updateSettings` (Private→Public: `acceptAllPendingTo` in the same transaction, emits `REQUEST_ACCEPTED` for each, logs consent; `shareTargets` false→true logs consent; name change rewrites `searchName`), `deactivate` (`deleteCascadeSocial` + consent withdrawal).                                                                                                                                                     |
| `follow.service.ts`                         | `follow` (self → `BAD_REQUEST`; access `visible` required; `followPolicy()` → create ACCEPTED + `NEW_FOLLOWER`, or PENDING + `FOLLOW_REQUEST`; existing row → return its relation, idempotent), `unfollow` (delete; withdraw a pending `FOLLOW_REQUEST` notification), `accept` (PENDING → ACCEPTED, `acceptedAt`, notify `REQUEST_ACCEPTED`, mark the request's notification read), `decline` (delete + withdraw), `removeFollower`, lists with `FriendUserSummary` hydration in **one** query per page (users + social profiles + both-direction follows for the page's ids).                                                                                                             |
| `friend-search.service.ts`                  | `search(viewer, query, cursor, limit)`: `isFullEmail` → exact lookup on `User.email` (`equals`, `mode: 'insensitive'`, trimmed) joined to `SocialProfile` (activated only); name path → `searchByName(queryTokens)`; exclusions (self, `blockedIdsEither`, policy-B private non-followed). Ranking per PRD §10 on the page. **Never logs the query.**                                                                                                                                                                                                                                                                                                                                       |
| `suggestion.service.ts`                     | PRD §11. Candidates from `mutualCandidates`, follows-you (followers not followed back), `popular`. Exclusions: self, following/requested, blocked either way, dismissed ≤ 90 d, policy-B private. `rankSuggestions()` from utils. In-memory LRU cache per viewer for 10 min, invalidated by the viewer's own follow/unfollow/dismiss/block.                                                                                                                                                                                                                                                                                                                                                 |
| `block.service.ts`                          | `block` (transaction: delete follows both ways, withdraw notifications both ways, delete dismissals, create `Block`), `unblock`, `list`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `report.service.ts`                         | `report`: validates the target is visible **or** was visible (a blocked or hidden user can still be reported by id if the reporter has an Activity row or a follow with them; else `NOT_FOUND`); `recipeId` must be the target's MANUAL recipe; creates `UserReport`; emails the support address with ids and the reason only (reuse the `lib/email` transport; subject `Chefer report {reason}`); `alsoBlock` → `block` in the same request.                                                                                                                                                                                                                                               |
| `activity.service.ts`                       | `list` (hydrate actors; `requestState` from the live `Follow` row: PENDING → `pending`, ACCEPTED → `accepted`, none → `declined`), `markReadUpTo`, `notify(kind, recipientId, actorId)` (upsert; `pushState = PENDING` when `friendsPush` is on and the recipient's matching `push*` preference is on, else `NONE`), `withdraw`.                                                                                                                                                                                                                                                                                                                                                            |
| `friend-content.service.ts`                 | `profile`, `week`, `recipes`, `routine`, `workouts`. All read-only (INV-4), all built by `friend-dto.mappers.ts` (INV-2). Details in §5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `application/recipe/recipe-copy.service.ts` | `ownedIdFor(viewerId, recipe)`: open or own → `recipe.id`; a friend's MANUAL recipe → the viewer's existing copy (`findFirst({ creatorId: viewerId, originRecipeId: recipe.id })`) or a new copy via `favouriteRecipeRepository.createManualRecipe(viewerId, {...fields, originRecipeId, originCreatorId})`. Unique-violation race → re-read. Returns `{ id, copied: boolean }`.                                                                                                                                                                                                                                                                                                            |
| `application/meal-plan/…` (L-XRECIPE)       | `MealPlanService.addRecipeToSlot(userId, { weekOffset, dayOfWeek, mealType, mode, slotIndex, recipeId, acknowledgeConflict })`: the plan for the week via `getForWeek` (the viewer's own write-on-read is fine); `findRecipeVisibleTo` → `ownedIdFor` → the same safety check as `replaceRecipe` (acknowledge allowed because the copy is own); `mode: 'replace'` reuses the `replaceRecipe` path; `mode: 'add'` → `appendDayMeal`. Also `undoAddToSlot`. `replaceRecipe`, `generate` (pinned) and `TrackerService.logRecipe` call `ownedIdFor` before persisting. `assemblePlanDto` drops a slot whose recipe row is missing (logged warning) instead of throwing `INTERNAL_SERVER_ERROR`. |
| `application/notifications/push.service.ts` | `dispatchPending()` and `checkReceipts()`, used by the workers (§6.2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### 4.5 Pagination

Opaque cursors (`encodeCursor(createdAt, id)` from utils), with keyset pagination `(createdAt, id) < cursor` ordered
`createdAt desc, id desc`. Workouts use `(startedAt, id)`, matching the existing `gym.session.list` convention
(`${startedAt}|${id}`) but encoded. Pages return `nextCursor: null` at the end. A tampered cursor decodes to `null`,
so the query restarts from the top instead of erroring.

### 4.6 Performance notes

- Hydration: every list resolves users, social profiles and both-direction follow rows for the page's ids in three
  `findMany`s, never per row.
- Search: `searchName` uses a btree index. Prefix predicates on 10k rows are fine. If `EXPLAIN` shows sequential scans
  hurting later, add `pg_trgm` + a GIN index (a raw-SQL migration; `db push` can't create extensions, so note it in
  §12 of `infrastructure.md` when done).
- Counts: `follow.counts(userId)` uses `groupBy` on the two indexed columns. No denormalised counters in v1, which
  avoids drift bugs.
- Suggestions: one `groupBy` for mutuals (followees of my followees, `status = ACCEPTED`, `take 200`), one for popular
  (`groupBy followeeId` over ACCEPTED with `having count ≥ 3`, joined to PUBLIC profiles), cached 10 min.

## 5. Friend content details (L-CONTENT)

**Week (`friends.week`)**, INV-4 read-only:

1. `tz = chefProfile.timeZone` of the **owner**; `local = ownerLocalDate(now, tz)`; `monday = mondayUtcOf(local)`.
2. `plan = mealPlanRepository.findForWeek(ownerId, monday)`. If null: `source = findFollowedTemplate(ownerId) ??
findLatestWithDaysBefore(ownerId, monday)`, used **in memory only**, never `createPlan` (this is exactly what
   `getForWeek`'s carry-forward would show the owner next time). If still nothing, return `null`.
3. Recipes: `findRecipesByIds(uniqueIds)`. A slot whose recipe row is missing is dropped silently.
4. For each slot: `FriendRecipeCard` (`byFriend = source === MANUAL && creatorId === ownerId`; `isFavourite` from the
   **viewer's** favourites, one `findSavedRecipeIds(viewerId)` call), `portion = slotPortion(slot.portion)`,
   `totals = slotTotals(nutrition, portion)`. `leftoverOf` is copied if present in the JSON. **Nothing else from the
   slot JSON** (no `pinned`).
5. `targets`: only when `access.can.targets`, from `TargetsService` (effective kcal/protein/carbs/fat for the
   owner, the same resolver as the owner's dashboard). Otherwise `null`.
6. Never call `assemblePlanDto`, `loadSafetyContext`, the cost estimator, tailoring or image-priority code.

**Recipes (`friends.recipes`):** `recipe.findMany({ where: { creatorId: ownerId, source: MANUAL, sourceUrl: null,
originRecipeId: null, name contains search (insensitive) }, orderBy: createdAt desc })` with a keyset cursor. Map to
`FriendRecipeCard` with the viewer's `isFavourite`.

**Routine (`friends.routine`):** the owner's `isActive && archivedAt == null` routine with days (ordered by
`position`) and exercises (ordered by `position`) joined to `Exercise { id, name, userId, trackingType }`.
`isCustom = exercise.userId !== null`. Cardio slots (W5 of the persona study) render when their type is known.
Filter exercises the viewer's client can't render (same `renderableTrackingTypes(ctx.clientApiLevel)` helper as
`gym.*`, `application/gym/client-level.ts`).

**Workouts (`friends.workouts`):** `listCompletedForFriend(ownerId, { since: now − 26 weeks, cursor, limit })`.
Map each to `FriendWorkoutDto`. `durationMin = finishedAt ? round((finishedAt − startedAt)/60000) : null`, capped at 600. Skipped exercises and exercises with no completed working sets are omitted. `notes`, `isDeload`, heart rate,
RPE, prescription and swaps are never mapped. Same client-level tracking-type filter as above.

**Profile (`friends.profile`):** header from `User` + `SocialProfile`. `counts` from `follow.counts`. `access` from
`ctx.socialAccess`. `recipeCount` only when recipes are visible.

## 6. Push notifications

Push doesn't exist today. The iOS `aps-environment` entitlement is deliberately stripped by the
`withoutPushEntitlement` plugin in `apps/mobile/app.config.js` (commits `10d5ac18`, `dc36aa58`, 2026-09-25, because
the free personal team couldn't sign push). The app schedules local notifications only (gym reminders, rest timer,
weekly digest). There are no push tokens and no `setNotificationHandler`. The paid team (`45TS85YK89`) now signs the
production build (`com.popdan.chefer`, EAS cloud), and Android is `dev.chefer.app`.

### 6.1 Server

- Dependency: `expo-server-sdk` in `apps/api`.
- `apps/api/src/infrastructure/push/expo-push.client.ts`: `IPushClient { send(messages): Promise<Ticket[]>;
receipts(ids): Promise<Record<id, Receipt>> }`. The Expo implementation chunks with the SDK
  (`chunkPushNotifications`, `chunkPushNotificationReceiptIds`) and passes `accessToken: env.EXPO_ACCESS_TOKEN`
  when set. A no-op implementation is used when `NODE_ENV === 'test'` or `PUSH_DRY_RUN=true` (it logs one line per
  message: kind + recipient id, never the name).
- `PushService.dispatchPending()`:
  1. `claimPendingPush(100)`.
  2. For each row: skip if the flag `friendsPush` is off. Skip if the recipient's preference is now off. Skip if
     capped: pair (recipient, actor) pushed in the last 24 h, or recipient ≥ 20 in 24 h. Skip if there are no active
     tokens. Skipped rows get `SKIPPED`.
  3. Build messages from `FRIENDS_COPY.push.*` with the actor's display name: `sound: 'default'`,
     `channelId: 'friends'`, `threadId`/`categoryId` unset,
     `data: { app: 'friends', kind, actorId, notificationId }`, `priority: 'high'` for requests.
  4. Send and store tickets. `DeviceNotRegistered` in a ticket → `disable(token)`.
- `PushService.checkReceipts()`: rows `SENT` older than 15 min → fetch receipts. `DeviceNotRegistered` → disable
  that token. Other errors are logged (no PII).
- Workers (`apps/api/src/workers/`, the existing `setInterval` class pattern with `start/stop/tick` and a singleton,
  wired in `apps/api/src/index.ts` `app.listen` and `gracefulShutdown`):
  - `push-dispatch.worker.ts` (5 s)
  - `push-receipt.worker.ts` (15 min)
  - `friends-maintenance.worker.ts` (daily): expire PENDING follows older than 90 d, delete notifications older than
    90 d, delete dismissals older than 90 d.

  F0.3 creates all three as no-op stubs and wires them, so no later lane edits `index.ts`.

- Env (`apps/api/src/lib/env.ts` + `apps/api/.env.example` + `infrastructure.md` §10):

  | Variable                | Default     | Purpose                                                                                    |
  | ----------------------- | ----------- | ------------------------------------------------------------------------------------------ |
  | `EXPO_ACCESS_TOKEN`     | unset       | Only if the EAS project enables "enhanced push security". Secret                           |
  | `PUSH_DRY_RUN`          | `false`     | Log instead of sending (dev, staging)                                                      |
  | `FRIENDS_ALLOWLIST`     | empty       | Comma list of user ids with Friends while the `friends` flag is off (internal, App Review) |
  | `FRIENDS_FOLLOW_POLICY` | `instagram` | `instagram` \| `literal`: the PRD §6.1 switch (Q-F-1)                                      |

### 6.2 Mobile (JS, ships by OTA on the current runtime)

- `apps/mobile/src/features/notifications/push/`:
  - `push-support.ts`: `probePushSupport()` calls `Notifications.getDevicePushTokenAsync()` once per launch in
    `try/catch` and caches `'available' | 'unavailable'`. It is `unavailable` on binaries without the entitlement
    or `google-services.json`, on simulators, and on web. It never throws.
  - `register-push-token.ts`: `ensurePushToken()`. If permission is granted and support is available, call
    `Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig.extra.eas.projectId })`, then
    `notifications.registerPushToken({ token, platform, appVariant })`. Called after sign-in, on app foreground
    (at most daily), and from `addPushTokenListener`. On sign-out, `unregisterPushToken` runs **before** the
    session token is cleared, from the existing logout paths (More "Sign out" and the Settings hub sign-out).
  - `friends-channel.ts`: `Notifications.setNotificationChannelAsync('friends', { name: 'Friends', importance:
DEFAULT })` on Android, at startup.
  - `PushPrimer` sheet (UX §7.4). It uses the existing permission request pattern of
    `ensureGymReminderPermission()` (only ever on a user action).
- `use-notification-links.ts`: accept `data.app === 'friends'`. Map `kind` to a route from an allow-list
  (`FOLLOW_REQUEST` → `/friends/requests`; others → `/friends/[userId]` only when `actorId` matches the cuid regex).
  Never use a URL from the payload. The cold-start path is already handled.
- No `setNotificationHandler`, so foreground pushes don't show a system banner (unchanged behaviour). The badge
  updates via the `friends.me` poll.

### 6.3 Native (a new binary: runtime change, release 1.0.2)

`apps/mobile/app.config.js` changes, in **their own PR** merged last (F5.1). The fingerprint changes, so the JS
merged after it only reaches new binaries:

1. Production variant: **stop stripping** `aps-environment`. Keep `withoutPushEntitlement` only for the development
   variant unless `CHEFER_DEV_PUSH=1` (dev clients may still be signed by a personal team).
2. Android: `android.googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json'` (the file is
   gitignored, since the repo is public). EAS gets it as a **file-type EAS environment variable**. Local release
   builds read `apps/mobile/google-services.json`.
3. `['expo-notifications', { color: '#944a00', defaultChannel: 'friends' }]` (keep the icon colour).
4. `version: '1.0.2'`.

Credentials (owner steps, §14): APNs key through `eas credentials -p ios` for team `45TS85YK89`, with Push
Notifications enabled on the `com.popdan.chefer` App ID. A Firebase project with the Android app `dev.chefer.app`,
its `google-services.json`, and the FCM V1 service-account key uploaded with `eas credentials -p android`.

Release order (mirrors the "native release 1" worked example in `business_flow.md` §20):

1. Merge F5.1 → deploy → OTA publishes on the **new** runtime only. 1.0.1 phones keep the last 1.0.1 update (which
   already has Friends JS with the inbox).
2. Owner builds 1.0.2 (iOS EAS production, Android release) by hand.
3. Owner installs, checks a real push end to end, and submits with the updated age rating and review notes.
4. After approval: flags (§9).

## 7. Mobile work (`apps/mobile`)

| Area                   | Files (new unless marked)                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes                 | `app/friends/{index,requests,activity,settings,blocked,suggestions,[userId]}.tsx`. **Edit** `app/_layout.tsx`: `Stack.Screen` entries inside the signed-in `Stack.Protected` (F2.0 only).                                                                                                                                                           |
| Entry points           | **Edit** `app/(food)/more.tsx` (`ITEMS` row after Profile + count pill), `app/(food)/_layout.tsx` (More tab badge via `tabBarBadge`), `src/features/settings/settings-screen.tsx` (Account row), `src/features/privacy/privacy-section.tsx` (`Friends & visibility` row), consent-history label map (`SOCIAL_SHARING`).                             |
| Data layer             | `src/features/friends/api/`: `use-friends-availability.ts` (gate; `staleTime` 5 min), `use-friends-me.ts` (60 s poll, focus refetch), `relation-cache.ts` (`applyRelation(utils, userId, relation)` patches every cached list, search page, suggestions, profile and activity entry for that user, then invalidates `friends.me`), `query-keys.ts`. |
| Shared feature UI      | `src/features/friends/components/{relation-button,person-row,request-row,friends-header,locked-panel,invite}.tsx`; `src/features/friends/safety/{report-sheet,use-block,use-remove-follower,confirm-copy}.tsx`.                                                                                                                                     |
| Home, search, lists    | `src/features/friends/home/{friends-home-screen,friends-intro-screen,search-results,requests-section,lists-section,suggestions-section}.tsx`, `requests-screen.tsx`, `activity-screen.tsx`, `suggestions-screen.tsx`.                                                                                                                               |
| Profile                | `src/features/friends/profile/{profile-screen,profile-header}.tsx`; `food/{friend-week-view,friend-recipe-grid}.tsx`; `gym/{friend-routine-card,friend-workout-card,friend-workouts-list}.tsx`; `add-to-week/add-to-week-sheet.tsx`.                                                                                                                |
| Extractions (refactor) | `src/features/meal-plan/meal-card-view.tsx` (presentational part of `PlanMealCard`, which then wraps it). `src/features/gym/routine/day-card-view.tsx` (the local `DayCard` of `app/(gym)/routine.tsx`, exported read-only). Behaviour of both owner screens must not change (existing Jest + Maestro must stay green).                             |
| Recipe detail/cookbook | **Edit** `app/recipe/[id].tsx` (`By` line, `Add to my week`, `Report recipe`, `From` for copies). **Edit** `app/(food)/recipes.tsx` card (`From {first}` chip on Saved/Mine).                                                                                                                                                                       |
| Settings               | `src/features/friends/settings/{friends-settings-screen,visibility-control,sharing-switches,push-settings,blocked-screen,turn-off}.tsx`.                                                                                                                                                                                                            |
| Push                   | §6.2 files; **edit** `src/features/notifications/use-notification-links.ts`, the logout paths, `app/_layout.tsx` (mount `usePushRegistration`; F2.0 adds the mount point as a no-op hook that M-PUSH fills).                                                                                                                                        |
| Kit                    | `packages/ui-mobile/src/components/{avatar,search-field,skeleton,count-pill}.tsx` + `index.ts` exports.                                                                                                                                                                                                                                             |
| Analytics              | `track()` calls from `src/lib/analytics.ts` using the new `EventMap` events.                                                                                                                                                                                                                                                                        |

Rules: all overlays are kit `Sheet`/`ConfirmSheet`. Chains use `onExited` (iOS). Friend queries use the `friends`
namespace (INV-7). Nothing reads `useGymBootstrap` for a friend. Units come from the viewer: `gym.profile` unit for
weights, falling back to `useUnitSystem()`.

## 8. Web work (`apps/web`)

| Area             | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes           | `src/app/(dashboard)/friends/{layout.tsx (metadata.title 'Friends'),page.tsx,requests/,activity/,settings/,blocked/,suggestions/,[userId]/}` (each segment with `layout.tsx` + `page.tsx`; one `<h1>` per page; `<main id="main">` comes from the shell).                                                                                                                                                                                                               |
| Routing plumbing | **Edit** `src/middleware.ts` (`PROTECTED_ROUTES` + `config.matcher`), `features/nav/components/dashboard-shell.tsx` (`TITLE_MAP`), `features/nav/nav-items.ts` (`Friends` after `/profile` in `FOOD_NAV_ITEMS`; in `GYM_SECONDARY_NAV_ITEMS`; `modeOfPath` treats `/friends` as neutral), `features/nav/components/user-menu.tsx`, `features/nav/nav-items.test.ts`, `tests/e2e/mobile-nav.spec.ts` (drawer now 5 links), `tests/e2e/helpers/layout.ts` (`APP_ROUTES`). |
| Feature code     | `src/features/friends/**` mirroring mobile: `api/`, `components/` (`RelationButton`, `PersonRow`, `RequestRow`, `LockedPanel`), `home/`, `profile/` (`FriendWeekView` with the `DayView` day-picker pattern below `xl`, a 7-column grid at `xl`; `FriendRecipeGrid`; gym cards), `add-to-week/AddToWeekSheet.tsx`, `settings/`, `safety/ReportSheet.tsx`.                                                                                                               |
| Existing edits   | `src/app/(dashboard)/recipes/[id]/page.tsx` (`By` line, `Add to my week`, report, `From`), `src/app/(dashboard)/recipes/page.tsx` (card chip), `src/app/(dashboard)/profile/page.tsx` (`Friends & visibility` card), consent-history label (`SOCIAL_SHARING`).                                                                                                                                                                                                          |
| Kit              | `packages/ui/src/components/{avatar,search-input,skeleton,segmented-control,count-pill}.tsx` + `index.ts`.                                                                                                                                                                                                                                                                                                                                                              |
| Analytics        | `capture()` from `src/lib/analytics.ts` with the typed events.                                                                                                                                                                                                                                                                                                                                                                                                          |

Web gets no push. The Activity badge polls `friends.me` every 60 s while the tab is visible.

## 9. Flags, availability, rollout mechanics

- `friends.availability` → `{ enabled: isFlagEnabled('friends') || FRIENDS_ALLOWLIST.has(userId) }`. Both clients
  gate every entry point on it, not on `profile.flags`, because `profile.flags` is global and unauthenticated. A
  failed or absent response means off.
- `friendsPush` is read only by `ActivityService.notify` (initial `pushState`) and `PushService` (send time).
- Rollout order and the App Review gating are in PRD §17. Flags are env changes via `infrastructure/scripts/env.sh`
  plus an API restart.
- Kill switch: `friends` off (and allowlist emptied) → every `friends.*` call returns `FORBIDDEN` and the clients
  hide the feature. `recipe.list` keeps returning previously hearted friend recipes only while the access resolver
  says visible. That rule doesn't depend on the flag, so also gate the visible-creator branch of `recipe.list` and
  the social branch of `findRecipeVisibleTo` on `friends.availability`-equivalent server logic
  (`isFriendsEnabledFor(userId)`). Off really means off.

## 10. Testing

| Level                | What                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Where / command                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Utils                | Every §3.2 function, including diacritics (`Ștefan`, `Ioana-Maria`), emails (`a@b` is not full, `A@B.COM` is), suggestion ranking ties, cursor tamper → `null`, owner-week at tz edges (Sunday 23:30 in `Pacific/Auckland` vs UTC)                                                                                                                                                                                                                          | `pnpm --filter @chefer/utils test`                                                                                                                              |
| Access matrix        | Table-driven test of `SocialAccessService` with mocked repos: every PRD §7.1 row × {public, private} × {sharing on/off} × {blocked a→b, b→a} × {policy instagram, literal}. **This is the oracle for the feature.**                                                                                                                                                                                                                                         | `apps/api/src/application/friends/social-access.service.test.ts`                                                                                                |
| Services             | Follow lifecycle (every §6.3 transition, idempotency, the request cap), activate/deactivate transactions, visibility switch auto-accept, search exclusions (never returns email; never matches partial emails), suggestions exclusions, block side effects, report validation, activity `requestState`, push dispatch caps/preferences/flag, receipt pruning, copy dedupe race, `addRecipeToSlot` add/replace/conflict, INV-5 on replace/generate/logRecipe | co-located `*.test.ts`, mocked repos via constructor (pattern: `household.service.test.ts`); `pnpm --filter @chefer/api test` (keep the coverage ratchet green) |
| DTO shape (INV-2)    | Snapshot of the **key set** of every friend DTO built from a fully populated fixture (owner with allergies, targets, notes, cost, safety): asserts no forbidden key appears anywhere (deep scan for `email`, `allergies`, `safety`, `notes`, `calorieTarget`, `estimatedCost`, `pinned`, `avgHeartRateBpm`, `prescription`, `isDeload`)                                                                                                                     | `friend-dto.mappers.test.ts`                                                                                                                                    |
| Read-only (INV-4)    | `friends.week` on an owner with no plan this week but a previous one: returns the carried-forward view and **`mealPlan` row count unchanged**                                                                                                                                                                                                                                                                                                               | service test with a spy on `createPlan` + contract test                                                                                                         |
| Contract (real API)  | `apps/mobile/tests/contract/friends.contract.test.ts`: two throwaway users (`uniqueEmail()`), activate both, private request → accept → week/recipes/routine/workouts visible → unfollow → locked; public instant follow; block hides both ways; exact-email search finds, partial doesn't; heart friend recipe → in Saved with `creator`; add to week → slot holds a copy owned by the viewer; owner deletes account → viewer's plan still loads           | `pnpm mobile:contract` (needs `pnpm dev` + DB)                                                                                                                  |
| Mobile Jest          | `RelationButton` states and rollback; `relation-cache` patches every list; `PersonRow` a11y labels; `useNotificationLinks` friends allow-list (rejects a URL payload, rejects a non-cuid actorId); intro validation; profile tab switch doesn't call `setMode`; kit components                                                                                                                                                                              | `apps/mobile/tests/unit/friends-*.test.tsx`; `pnpm --filter @chefer/mobile test`                                                                                |
| Maestro              | `e2e/friends.flow.yaml` (More → Friends → intro → turn on → search the seeded public user → follow → open profile → Food week → Recipes → heart → Gym → Load more) and `e2e/friends-requests.flow.yaml` (a `runScript` setup registers two throwaway users over HTTP and makes a request; accept from Activity; unfollow; block). iOS **and** Android (`Pixel_8`): layout-heavy.                                                                            | `e2e/run-suite.sh <device>`                                                                                                                                     |
| Web unit             | Nav items test update, `RelationButton`, kit components                                                                                                                                                                                                                                                                                                                                                                                                     | `pnpm --filter @chefer/web test`                                                                                                                                |
| Playwright           | `tests/e2e/desktop-friends.spec.ts` (home, search, profile tabs, add to week, settings); the mobile sweep via `APP_ROUTES` (profile route uses the seeded fixed id); touch targets                                                                                                                                                                                                                                                                          | `cd tests && pnpm exec playwright test --project=mobile` and `--project=desktop`                                                                                |
| Push (manual, owner) | A real device on 1.0.2: request → push arrives, lock screen shows only the name, tap opens Requests; revoke permission → settings row shows off                                                                                                                                                                                                                                                                                                             | device checklist appended to `docs/device-checklist.md`                                                                                                         |

**Seed data** (`packages/database/src/seed.ts`, F1.5): `carol@chefer.dev` (PUBLIC, 6 manual recipes, an active
routine, 8 completed workouts, a current-week plan, fixed id `cseedcarol000000000000001`) and `dave@chefer.dev`
(PRIVATE, fixed id `cseeddave0000000000000001`, a pending request to alice). `alice` is **not** activated, so the
intro can be tested. Add the rows to the CLAUDE.md seed-accounts table and `infrastructure.md` §14 in the docs task.

## 11. Wave plan

Legend: **Owns** is binding (§0). Verify = the commands the lane runs before reporting. The orchestrator re-runs the
wave ladder after integrating.

### Wave 0: contracts (sequential: F0.1 ∥ F0.2, then F0.3)

**F0.1 L-SCHEMA · opus**

- Task: schema §2 (enums, models, relations, indexes, `ConsentKind.SOCIAL_SHARING`), the named migration folder,
  and the seven new repositories (interface + class + singleton). Simple CRUD methods are implemented here. Query-heavy
  methods (`searchByName`, `popular`, `mutualCandidates`, `claimPendingPush`, …) may be left as
  `throw new Error('not implemented')` for the owning W1 lane. Changes to **existing** repositories are made by
  their W1 owners, not here.
- **Owns:** `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/*_friends_schema/`,
  `packages/database/src/repositories/{social-profile,follow,block,suggestion-dismissal,user-report,notification,push-token}.repository.ts`,
  `packages/database/src/repositories/index.ts`, `packages/database/src/index.ts`.
- AC: `db push` on an empty and on a seeded local DB succeeds with no data-loss prompt. Every repository has an
  interface, a class and a singleton. No existing model field changed.
- Verify: `pnpm db:generate && pnpm db:push && pnpm --filter @chefer/database typecheck && pnpm typecheck`.

**F0.2 L-SHARED · sonnet**

- Task: §3.1 and §3.2 in full (schemas, DTO types, copy deck, flags, analytics events, utils + tests).
- **Owns:** `packages/types/src/{friends,friends-copy}.ts`, `packages/types/src/{feature-flags,analytics-events,index}.ts`
  (additions only), `packages/utils/src/friends/**`, `packages/utils/src/index.ts`.
- AC: every util has tests covering the §10 cases. `analytics-events.test-d.ts` still passes (no bare `string`
  props). Copy strings match UX §12 exactly.
- Verify: `pnpm --filter @chefer/types test && pnpm --filter @chefer/utils test && pnpm --filter @chefer/types typecheck && pnpm --filter @chefer/utils typecheck`.

**F0.3 L-API-SKELETON · opus** (after F0.1 + F0.2 are merged into `integrate/friends-w0`)

- Task:
  - `lib/friends-middleware.ts`, `lib/friends-errors.ts` and the `errorFormatter` fields.
  - `friendsProcedure`/`activeFriendsProcedure`.
  - `SocialAccessService` **fully implemented** with the access-matrix test.
  - `routers/friends/{index,graph,content,recipes,safety}.router.ts` (the four sub-routers empty except
    `friends.availability`), `routers/notifications-push.router.ts` (empty), registration in `routers/index.ts`.
  - Env vars (§6.1) + `.env.example`.
  - The three worker stubs wired in `apps/api/src/index.ts`.
  - `isFriendsEnabledFor(userId)` helper.
- **Owns:** `apps/api/src/lib/{friends-middleware,friends-errors}.ts`, `apps/api/src/lib/trpc.ts` (errorFormatter
  only), `apps/api/src/lib/env.ts`, `apps/api/.env.example`, `apps/api/src/application/friends/social-access.service{,.test}.ts`,
  `apps/api/src/routers/friends/*`, `apps/api/src/routers/notifications-push.router.ts`,
  `apps/api/src/routers/index.ts`, `apps/api/src/workers/{push-dispatch,push-receipt,friends-maintenance}.worker.ts`,
  `apps/api/src/index.ts`.
- AC: the access matrix test covers every row of PRD §7.1 for both policies. `friends.availability` works against
  the local API. Every other `friends.*` returns `FORBIDDEN FRIENDS_UNAVAILABLE` with the flag off.
- Verify: `pnpm --filter @chefer/api typecheck && pnpm --filter @chefer/api lint && pnpm --filter @chefer/api test`.

**F0.D docs · sonnet** (orchestrator runs it after integration)

- **Owns:** `infrastructure.md` §6 (a "Friends schema" table like "Wave-0 schema changes") and §10 (env rows).

### Wave 1: API and kits (batch A: F1.1, F1.2, F1.3 · batch B: F1.4, F1.5, F1.6, F1.7, max 3 at once)

**F1.1 L-GRAPH · opus**

- Task: §4.4 `social-profile`, `follow`, `friend-search`, `suggestion`, `block`, `report`, `activity` services +
  tests. Procedures in `graph.router.ts` and `safety.router.ts` per §4.2. Admin reports list/resolve (P1). Implement
  the new methods of `social-profile`, `follow`, `block`, `suggestion-dismissal`, `user-report` and `notification`
  repositories.
- **Owns:** `apps/api/src/application/friends/{social-profile,follow,friend-search,suggestion,block,report,activity}.service{,.test}.ts`,
  `apps/api/src/routers/friends/{graph,safety}.router.ts`, those six repository files.
- AC: PRD FR-02, 03, 04, 05, 06, 07, 08, 09, 12, 13 and 20 are server-side complete. Search never returns or logs
  emails. All rate limits are in place. Every mutation is idempotent.
- Verify: API typecheck/lint/test.

**F1.2 L-CONTENT · opus**

- Task: `friend-content.service.ts`, `friend-dto.mappers.ts` (+ key-set tests), and `content.router.ts`
  (`profile`, `week`, `recipes`, `routine`, `workouts`) per §5. Implement `workout-session.repository.ts`
  `listCompletedForFriend` and `routine.repository.ts` `findActiveWithExercises`.
- **Owns:** `apps/api/src/application/friends/{friend-content.service,friend-dto.mappers}{,.test}.ts`,
  `apps/api/src/routers/friends/content.router.ts`,
  `packages/database/src/repositories/{workout-session,routine}.repository.ts` (additions only).
- **Read-only:** `meal-plan.repository.ts`, `application/gym/client-level.ts`, `application/targets/**`.
- AC: INV-2 and INV-4 tests pass. The week honours the owner's time zone. Values are raw (kg, per-serving), and the
  clients convert.
- Verify: API typecheck/lint/test.

**F1.3 L-XRECIPE · opus**

- Task:
  - The `recipe-access.ts` social branch.
  - `recipe-copy.service.ts`.
  - `MealPlanService.addRecipeToSlot`/`undoAddToSlot`.
  - INV-5 in `replaceRecipe`, `generate` pinned placement and `TrackerService.logRecipe`.
  - `assemblePlanDto` missing-recipe tolerance.
  - `meal-plan.repository` `appendDayMeal`/`removeDayMealIfMatches`.
  - `favourite-recipe.repository` visible-creator branch + `creator` include + origin fields.
  - `recipe.list`/`getRecipe` additive `creator`/`origin`.
  - `recipes.router.ts` (`addRecipeToWeek`, `undoAddToWeek`).
- **Owns:** `apps/api/src/application/recipe/{recipe-access,recipe-copy.service,recipe.service}{,.test}.ts`,
  `apps/api/src/application/meal-plan/meal-plan.service.ts` (the listed methods only),
  `apps/api/src/application/tracker/tracker.service.ts` (`logRecipe` only),
  `apps/api/src/routers/friends/recipes.router.ts`, `apps/api/src/routers/recipe.router.ts` (output typing only if
  needed), `packages/database/src/repositories/{meal-plan,favourite-recipe}.repository.ts`.
- AC:
  - PRD FR-17 is server-side complete. §13 rules hold.
  - Old clients: `recipe.list` rows keep every existing field.
  - A friend's recipe placed through **any** path ends up as a copy in the viewer's plan.
  - The copy is made once (the concurrency test runs two parallel adds).
  - Deleting the original owner's account leaves the viewer's plan loadable.
- Verify: API typecheck/lint/test.

**F1.4 L-PUSH-API · sonnet**

- Task: §6.1: `expo-server-sdk` dependency, `infrastructure/push/expo-push.client.ts` (+ no-op), `push.service.ts`
  - tests (fake client), fill the dispatch and receipt worker stubs, `notifications-push.router.ts` procedures.
    Implement `push-token.repository.ts`.
- **Owns:** `apps/api/package.json` (the dependency), `pnpm-lock.yaml`, `apps/api/src/infrastructure/push/**`,
  `apps/api/src/application/notifications/push.service{,.test}.ts`,
  `apps/api/src/workers/{push-dispatch,push-receipt}.worker{,.test}.ts`,
  `apps/api/src/routers/notifications-push.router.ts`, `packages/database/src/repositories/push-token.repository.ts`.
- AC: dispatch respects the flag, preferences, both caps and tokens. A double tick never double-sends.
  `DeviceNotRegistered` disables the token. `PUSH_DRY_RUN` logs no names.
- Verify: API typecheck/lint/test.

**F1.5 L-DATA · sonnet**

- Task:
  - `user.exportData` `social` block.
  - `deleteAccount()` review (cascades; add a test that an account with follows, notifications, tokens and
    copies deletes cleanly, and the other user's copy survives with `originRecipeId = null`).
  - Fill the `friends-maintenance.worker.ts` stub.
  - Seed data (§10).
- **Owns:** `apps/api/src/application/user/account-data.service{,.test}.ts`,
  `apps/api/src/workers/friends-maintenance.worker{,.test}.ts`, `packages/database/src/seed.ts`.
- AC: PRD FR-22.1 and FR-22.2. The seed is idempotent (re-runnable). Fixed ids are cuid-shaped.
- Verify: API test; `pnpm db:seed` twice on a local DB.

**F1.6 K-MOBILE-KIT · sonnet**

- Task: UX §3.1 mobile components + Jest tests.
- **Owns:** `packages/ui-mobile/src/components/{avatar,search-field,skeleton,count-pill}.tsx`,
  `packages/ui-mobile/src/index.ts`, `apps/mobile/tests/unit/kit-{avatar,search-field,skeleton,count-pill}.test.tsx`.
- AC: 44 pt targets, labels, reduced motion respected. `Avatar` initials and colour are deterministic.
- Verify: `pnpm --filter @chefer/ui-mobile typecheck && pnpm --filter @chefer/mobile test`.

**F1.7 K-WEB-KIT · sonnet**

- Task: UX §3.1 web components + tests.
- **Owns:** `packages/ui/src/components/{avatar,search-input,skeleton,segmented-control,count-pill}.tsx`,
  `packages/ui/src/index.ts`, `apps/web/src/features/friends/__tests__/kit.test.tsx`.
- AC: `SegmentedControl` is a keyboard-operable radiogroup. No `transition-all`. Motion uses token utilities only.
- Verify: `pnpm --filter @chefer/ui typecheck && pnpm --filter @chefer/web test`.

**F1.D docs · sonnet**

- **Owns:** `infrastructure.md` §5.4, §5.8 (kit components), §7 (the new services, `SocialAccessService`, push,
  workers), §8 (every row of §4.2 plus the changed rows), §9 (friends middleware + resource visibility bullet for
  recipes and social access), `business_flow.md` (new §34 "Friends: follow, see, save" with the state machine,
  access rules and the push outbox; §24 deletion and §28 export updates).

Wave 1 exit: the full API ladder passes, and `pnpm mobile:contract` passes with the friends contract test
(F4.1 extends it). The owner merges; the API deploys dark.

### Wave 2: mobile, JS only on the current runtime (F2.0 first, then batch: F2.1, F2.2, F2.3; then F2.4)

**F2.0 M-CORE · opus**

- Task: every friends `Stack.Screen` + stub route files. Entry points (More row + pill, More tab badge, Settings
  hub row, privacy row, consent label). The data layer (`api/**` incl. `relation-cache.ts`). Shared components
  (`RelationButton`, `PersonRow`, `RequestRow`, `FriendsHeader`, `LockedPanel`, `Invite`). The safety sheets
  (`ReportSheet`, block/remove hooks + confirms). The `usePushRegistration` no-op mount.
- **Owns:** `apps/mobile/app/_layout.tsx`, `apps/mobile/app/friends/*.tsx` (as stubs), `apps/mobile/app/(food)/{more,_layout}.tsx`,
  `apps/mobile/src/features/settings/settings-screen.tsx`, `apps/mobile/src/features/privacy/{privacy-section,consent-history}.tsx`,
  `apps/mobile/src/features/friends/{api,components,safety}/**`, `apps/mobile/src/features/notifications/push/use-push-registration.ts` (stub),
  `apps/mobile/tests/unit/friends-core-*.test.tsx`.
- AC: with availability off, nothing renders and no friends query fires beyond `availability`. With it on, More
  shows the row under Profile. `RelationButton` passes UX §3.3 (states, rollback, a11y).
- Verify: mobile ladder levels 0, 1, 3.

**F2.1 M-HOME · sonnet**

- Task: UX §4–§7.2 screens: intro, home, search, requests, activity, suggestions. Maestro `e2e/friends.flow.yaml`
  (home part) and `friends-requests.flow.yaml`.
- **Owns:** `apps/mobile/app/friends/{index,requests,activity,suggestions}.tsx`, `apps/mobile/src/features/friends/home/**`,
  `apps/mobile/e2e/friends-requests.flow.yaml`, `apps/mobile/e2e/scripts/friends-setup.js`,
  `apps/mobile/tests/unit/friends-home-*.test.tsx`.
- AC: UX §5, §6, §7 states and copy. PRD FR-02, 06–09, 11, 20 are client-complete.
- Verify: mobile ladder 0–4 (iOS + Android).

**F2.2 M-PROFILE · opus**

- Task: UX §8–§10. The two extractions (`meal-card-view.tsx`, `day-card-view.tsx`) with no behaviour change.
  `AddToWeekSheet` (+ chained replace confirm + conflict + Undo). Recipe detail and cookbook additions. Maestro
  `e2e/friends.flow.yaml` (profile part).
- **Owns:** `apps/mobile/app/friends/[userId].tsx`, `apps/mobile/src/features/friends/{profile,add-to-week}/**`,
  `apps/mobile/src/features/meal-plan/{meal-card-view,plan-meal-card}.tsx`, `apps/mobile/app/(gym)/routine.tsx`,
  `apps/mobile/src/features/gym/routine/day-card-view.tsx`, `apps/mobile/app/recipe/[id].tsx`,
  `apps/mobile/app/(food)/recipes.tsx`, `apps/mobile/e2e/friends.flow.yaml`, `apps/mobile/tests/unit/friends-profile-*.test.tsx`.
- AC: PRD FR-14–FR-19 are client-complete. The existing `meal-plan`, `recipes` and `gym-routine` flows stay green.
  The profile switch never calls `setMode`. No friend query key starts with `gym`.
- Verify: mobile ladder 0–4 (iOS + Android), plus the existing `meal-plan`, `recipes` and `gym-routine` flows.

**F2.3 M-SETTINGS · sonnet**

- Task: UX §11 settings, visibility confirms, sharing switches, push settings rows (reading permission and support
  via the helpers from F2.4 once merged; until then `unsupported`), blocked people, turn off.
- **Owns:** `apps/mobile/app/friends/{settings,blocked}.tsx`, `apps/mobile/src/features/friends/settings/**`,
  `apps/mobile/tests/unit/friends-settings-*.test.tsx`.
- AC: PRD FR-03, 04, 05, 13.3 and 21.3 are client-complete.
- Verify: mobile ladder 0, 1, 3, 4 (a settings flow step inside `friends.flow.yaml` is owned by F2.2; coordinate
  via the orchestrator).

**F2.4 M-PUSH-JS · opus** (after F2.0–F2.3 merge)

- Task: §6.2 (support probe, token registration/unregistration in the logout paths, Android channel, primer,
  notification link allow-list) + tests.
- **Owns:** `apps/mobile/src/features/notifications/push/**`, `apps/mobile/src/features/notifications/use-notification-links.ts`,
  the logout call sites (`app/(food)/more.tsx` sign-out handler, the Settings hub sign-out), `apps/mobile/tests/unit/push-*.test.tsx`.
- AC: on the current 1.0.1 binary, `probePushSupport()` returns `unavailable` with no crash and no primer (verified
  on the iOS simulator and the Android emulator). The link routing rejects non-allow-listed payloads.
- Verify: mobile ladder 0–3 and a manual smoke on both simulators.

**F2.D docs · sonnet**

- **Owns:** `infrastructure.md` §4.3 (mobile routes and features), `business_flow.md` §34 (mobile UI notes) and §23
  "Phone notifications" (the push path).

### Wave 3: web (F3.0 first, then batch: F3.1, F3.2, F3.3)

**F3.0 W-CORE · sonnet**

- Task: routes + layouts + stubs, middleware, `TITLE_MAP`, nav items + tests + `mobile-nav.spec.ts`,
  `APP_ROUTES`, data layer (`features/friends/api/**` with the same `applyRelation` idea for the React Query
  cache), shared components, `ReportSheet`, profile-page privacy card, consent label.
- **Owns:** `apps/web/src/app/(dashboard)/friends/**` (stubs), `apps/web/src/middleware.ts`,
  `apps/web/src/features/nav/**`, `tests/e2e/{mobile-nav.spec.ts,helpers/layout.ts}`,
  `apps/web/src/features/friends/{api,components,safety}/**`, `apps/web/src/app/(dashboard)/profile/page.tsx`,
  the web consent-history label file.
- AC: the nav shows `Friends` right after `Profile` in food mode and in the gym secondary nav. Unauthenticated
  `/friends` redirects to `/login`.
- Verify: `pnpm --filter @chefer/web typecheck && pnpm --filter @chefer/web lint && pnpm --filter @chefer/web test`.

**F3.1 W-HOME · sonnet**

- **Owns:** `apps/web/src/app/(dashboard)/friends/{page,requests/*,activity/*,suggestions/*}`,
  `apps/web/src/features/friends/home/**`.
- AC: UX §5–§7 at every breakpoint of UX §15.
- Verify: web checks + `cd tests && pnpm exec playwright test --project=mobile`.

**F3.2 W-PROFILE · opus**

- Task: profile, Food week (day picker below `xl`, 7 columns at `xl`, no horizontal scroll), recipes grid, gym,
  `AddToWeekSheet`, recipe detail + cookbook additions, `desktop-friends.spec.ts`.
- **Owns:** `apps/web/src/app/(dashboard)/friends/[userId]/**`, `apps/web/src/features/friends/{profile,add-to-week}/**`,
  `apps/web/src/app/(dashboard)/recipes/{page.tsx,[id]/page.tsx}`, `tests/e2e/desktop-friends.spec.ts`.
- AC: PRD FR-14–19 on web. The mobile sweep is green at 320/375/390/430.
- Verify: web checks + Playwright `--project=mobile` and `--project=desktop`.

**F3.3 W-SETTINGS · sonnet**

- **Owns:** `apps/web/src/app/(dashboard)/friends/{settings,blocked}/**`, `apps/web/src/features/friends/settings/**`.
- AC: UX §11 on web (with `settings.push.webNote`).
- Verify: web checks.

**F3.D docs · sonnet**

- **Owns:** `infrastructure.md` §4.2 (web routes), `business_flow.md` §34 (web notes). Only if Q-F-2 scopes web
  later: add reverse rows to `mobile_parity_backlog.md`.

### Wave 4: hardening, legal, release prep (batch: F4.1, F4.2, F4.3)

**F4.1 L-SECURITY · opus**

- Task: an adversarial review of every `friends.*` procedure and every changed procedure against INV-1…INV-9. Extend
  the contract test with abuse cases:
  - id probing: random cuid, a blocked user, a not-activated user → identical `NOT_FOUND`
  - a partial-email search
  - the request cap
  - locked scopes with a forged `userId`
  - `recipe.toggleFavourite`/`mealPlan.getRecipe` on a locked friend's recipe → `NOT_FOUND`
  - `addRecipeToWeek` of a locked recipe
  - `undoAddToWeek` against someone else's plan
  - push payload content

  Fix findings in place, coordinating file ownership with the orchestrator, or file them.

- **Owns:** `apps/mobile/tests/contract/friends-abuse.contract.test.ts` + fixes as assigned.
- AC: a written findings list in the PR description. Zero open criticals.
- Verify: API test + `pnpm mobile:contract`.

**F4.2 L-LEGAL · sonnet** (drafts; the owner/counsel approves)

- Task: the PRD §14 items 1–5:
  - the privacy page section + `EFFECTIVE_DATE`
  - the terms user-content section
  - the `LEGAL_VERSIONS` bump
  - `docs/app-store/ios/{privacy-and-rating,review-notes}.md`
  - `docs/app-store/android/data-safety.md`
  - `docs/friends/dpia.md`
  - `docs/device-checklist.md` push checks
- **Owns:** `apps/web/src/app/{privacy,terms}/page.tsx`, `packages/types/src/legal.ts`, `docs/app-store/**`,
  `docs/friends/dpia.md`, `docs/device-checklist.md`.
- AC: every item on the PRD §14 list is addressed. The re-accept sheet fires for existing users after the bump
  (verify on web).
- Verify: web checks; `pnpm --filter @chefer/types test`.

**F4.3 L-E2E · sonnet**

- Task: run the full ladders on iOS and Android and on web (both Playwright projects). Fix flaky selectors in
  friends flows only. Record results in the PR.
- **Owns:** `apps/mobile/e2e/friends*.flow.yaml`, `tests/e2e/*friends*.spec.ts`.
- Verify: `e2e/run-suite.sh <iPhone>` and `e2e/run-suite.sh Pixel_8` for the friends flows plus the existing suite;
  `cd tests && pnpm exec playwright test --project=mobile --project=desktop`.

### Wave 5: native release 1.0.2 (push)

**F5.1 M-NATIVE · opus**

- Task: §6.3 `app.config.js` changes and `.gitignore` for `google-services.json`. Verify with `APP_VARIANT=production
npx expo prebuild --clean` in a scratch dir that `aps-environment` is present (iOS) and the google-services plugin
  is applied (Android). Print the old and new runtime fingerprints. Update `infrastructure.md` §11 and
  `business_flow.md` §20 ("native release 2 (1.0.2): push").
- **Owns:** `apps/mobile/app.config.js`, `apps/mobile/.gitignore`, `infrastructure.md` §11,
  `business_flow.md` §20.
- AC: the dev variant still builds with a personal team (strip kept unless `CHEFER_DEV_PUSH=1`). The production
  prebuild has the entitlement.
- Verify: mobile ladder 0–3 + both prebuilds. **Never** trigger a store build or submission (the owner builds by
  hand).

## 12. Documentation updates (the CLAUDE.md table, per task)

| Doc                                      | Section / content                                                                                                               | Task                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `infrastructure.md` §4.2 / §4.3          | Web and mobile routes, feature folders                                                                                          | F3.D / F2.D            |
| `infrastructure.md` §5.4 / §5.8          | New kit components                                                                                                              | F1.D                   |
| `infrastructure.md` §6                   | Friends schema table (like "Wave-0 schema changes")                                                                             | F0.D                   |
| `infrastructure.md` §7                   | Friends services, `SocialAccessService`, `RecipeCopyService`, `PushService`, three workers                                      | F1.D                   |
| `infrastructure.md` §8                   | Every §4.2 row + changed rows                                                                                                   | F1.D                   |
| `infrastructure.md` §9                   | Friends middleware; resource visibility: social access, recipe access extension, INV-3                                          | F1.D                   |
| `infrastructure.md` §10                  | `EXPO_ACCESS_TOKEN`, `PUSH_DRY_RUN`, `FRIENDS_ALLOWLIST`, `FRIENDS_FOLLOW_POLICY`, mobile `GOOGLE_SERVICES_JSON` (EAS file env) | F0.D / F5.1            |
| `infrastructure.md` §11                  | Push credentials, runtime 1.0.2                                                                                                 | F5.1                   |
| `infrastructure.md` §14                  | Seed accounts carol/dave                                                                                                        | F1.D                   |
| `business_flow.md`                       | New §34 Friends; §20 native release 2; §23 phone notifications; §24 deletion; §28 export                                        | F1.D, F2.D, F3.D, F5.1 |
| `mobile_parity_backlog.md`               | Only if the owner scopes web later (Q-F-2)                                                                                      | F3.D                   |
| `CLAUDE.md`                              | Seed accounts table rows (owner approves the edit)                                                                              | F1.D                   |
| `docs/app-store/**`, privacy/terms pages | PRD §14                                                                                                                         | F4.2                   |

## 13. Migration, compatibility and rollout

1. **Schema** (W0) deploys with `db push` through the compose `migrate` service before the API starts. It is purely
   additive, so the old API image keeps working if a rollback is needed.
2. **API** (W1) deploys dark: flag off, allowlist empty. The only visible changes for existing users are none,
   because the social branch of `recipe.list`/`findRecipeVisibleTo` is gated by `isFriendsEnabledFor` (§9).
3. **Mobile JS** (W2) goes out by OTA on the 1.0.1 runtime and renders nothing while `friends.availability` is off.
   Installed binaries older than 1.0.1 don't get it (already true since wave 4) and never call `friends.*`.
4. **Web** (W3) deploys dark the same way.
5. **Legal** (W4): the policy and terms bump triggers the existing re-accept sheet. Ship it in the same deploy as, or
   before, turning on the allowlist for anyone outside the team.
6. **Native 1.0.2** (W5): the owner builds, tests push on devices, and submits with the allowlisted demo accounts,
   the updated age rating and review notes.
7. **Launch:** after store approval, `FEATURE_FLAGS=…,friends,friendsPush` via `infrastructure/scripts/env.sh`,
   then an API restart. Watch reports, blocks, the push error rate (receipt worker logs) and the §15 PRD metrics.
8. **Rollback:** flags off (instant). No schema rollback is ever needed.

## 14. Owner steps

1. Answer the PRD §20 open questions (defaults ship otherwise). Most important: **Q-F-1** (follow model),
   **Q-F-2** (web in the same release), **Q-F-13** (who handles reports within 24 h).
2. **Apple push:** in the Apple Developer account (team `45TS85YK89`), make sure the `com.popdan.chefer` App ID has
   Push Notifications enabled. Run `eas credentials -p ios` → production → "Push Notifications: set up a new key"
   (or upload an existing `.p8`).
3. **Firebase/FCM:**
   1. Create a Firebase project.
   2. Add the Android app `dev.chefer.app` (and optionally `dev.chefer.app.dev`).
   3. Download `google-services.json`. Store it as the EAS file environment variable `GOOGLE_SERVICES_JSON`
      (production), and locally at `apps/mobile/google-services.json` for USB release builds (gitignored).
   4. Create an FCM V1 service-account key and upload it with `eas credentials -p android`.
4. Optional: enable Expo "enhanced push security" and set `EXPO_ACCESS_TOKEN` on production
   (`infrastructure/scripts/env.sh`).
5. Counsel review of the privacy policy section, the terms section and `docs/friends/dpia.md`. Approve the
   `LEGAL_VERSIONS` bump.
6. Create the public demo profile "Chefer Kitchen" (Q-F-8) and two App Review demo accounts. Add their ids to
   `FRIENDS_ALLOWLIST` during review.
7. Build 1.0.2 by hand (iOS EAS production build; Android release/store build) after F5.1 merges. Install, run the
   push device checklist, and submit with the updated **age rating** (UGC shared with other users → Yes) and
   review notes.
8. Merge each wave's integration PR to `master` (merging deploys). Then flip `friends` + `friendsPush` after store
   approval.
9. Own the reports inbox (`cheferapp.help@gmail.com`) with the promised 24 h response.

## 15. Gotchas for agents (read before coding)

- `mealPlan.getForWeek` **writes on read** (carry-forward). Never call it for another user (INV-4). Use the
  repository reads in §5.
- `assemblePlanDto` used to throw on a missing recipe. F1.3 makes it tolerant, but friend code must not rely on
  `assemblePlanDto` at all.
- Any tRPC query whose key starts with `gym` is persisted to disk on the phone for 30 days
  (`apps/mobile/src/features/gym/offline/query-persistence.ts`, `isGymQueryKey`). Friend data must stay under
  `friends.*`.
- `ModeSwitch` writes the app's persisted mode. The profile's Food|Gym control is a plain `SegmentedControl` with
  local state. Don't reuse `ModeSwitch`.
- The web nav drawer contents are pinned by `nav-items.test.ts` and `tests/e2e/mobile-nav.spec.ts`. Update both.
- New web routes must be added to `middleware.ts` `PROTECTED_ROUTES` **and** `config.matcher`, `TITLE_MAP`, and
  `APP_ROUTES`.
- `typedRoutes` is on in mobile. A `router.push('/friends/...')` to a route file that doesn't exist yet fails
  typecheck. F2.0 creates the stubs first for that reason.
- iOS: never open a sheet in the same tick another closes. Chain on `onExited`.
- Metro port 8083, `LANG=en_US.UTF-8` before any `expo run:*`/`prebuild`, `hideKeyboard` guarded to Android in
  Maestro, and the dev-menu FAB eats taps top-right (`mobile_native_plan.md` §5).
- superjson: raw HTTP to tRPC in Maestro `runScript` or curl must wrap `{"json": …}`.
- `db push` is what production runs (`docker-compose.deploy.yml` `migrate` service). Keep everything additive, and
  never use `--accept-data-loss`.
- Don't add `pg_trgm` in v1 (`db push` can't create extensions).
- Never trigger EAS builds or store submissions. The owner builds and submits by hand. OTA auto-publish on deploy
  stays on.
