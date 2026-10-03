# Trainer platform: spec (WP-18 Phase 0)

_Draft for owner sign-off, 2026-10-03. Inputs: [research.md](./research.md) (market + code), [interview-kit.md](./interview-kit.md),
`docs/product/user-needs-research-2026-10.md` (G8, Summary), `docs/backlog-2026-10/feedback-2026-10-02.md`, and WP-05 (class
model). **Docs only. Nothing here is built until the owner signs off (§9).**_

## 0. In one paragraph

A trainer invites clients to a **group** with a link. Each week they **publish the sessions** for that group from the
web, either as a routine-style workout (exercises, sets × reps) or as a class-style list. Members see **"This week from
<trainer>"** on gym Today and either check in (went or skipped, plus effort) or log the session in full. With the
member's explicit consent, the trainer sees **attendance, effort and last loads** on a web dashboard. Food, messaging and
payments come later. No AI is involved, and nothing changes for people who don't use a trainer.

## 1. Personas and jobs

| Persona                           | Who                                                                                                                                                                              | Job to be done                                                                                                       | What they use today (research A)                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Small-group trainer** (primary) | Runs 3–6 recurring classes a week for 6–15 people each, e.g. the tester's trainer                                                                                                | "Get next week's sessions to everyone once, and know who came and who's progressing, without retyping it per person" | Whiteboard, WhatsApp groups, memory                                 |
| **1:1 personal trainer**          | 10–30 clients; often sells training plus nutrition (the research doc cites Forbes.ro for demand +40% in 2025, mostly women 30–40; the market lane could not re-find the article) | "Adjust each client's program and check they're doing it; answer food questions without writing meal plans by hand"  | Spreadsheets, PDFs, WhatsApp; some use TrueCoach/Trainerize/Everfit |
| **Class member** (the tester)     | Attends 2–4 classes a week; doesn't count calories; wants "sessions this week" and "calories burned"                                                                             | "Know what's on today, log it in 10 seconds, see I'm keeping it up"                                                  | Watch + Google Health; nothing for the sessions                     |

The member side **is WP-05** (class check-in, focus, effort, watch kcal). The trainer platform adds a publisher and a
viewer on top of it.

## 2. MVP slice (Phase 1)

The smallest thing a trainer would use **every week**:

1. **Turn on trainer tools** (web, Settings → "I coach people"). This creates a `TrainerProfile`. Free during the beta
   (see §6).
2. **Create a group** ("Tuesday 18:00 group", or one client's name for 1:1). Each group gets an **invite link/code**.
3. **Members join** through the link (mobile or web). Joining shows a **consent screen** listing exactly what the trainer
   will see (sessions, effort and loads by default; weight and food are off and not even offered in the MVP). Members can
   leave or change sharing any time.
4. **Publish the week** (web, desktop-first):
   - pick dates;
   - for each session, either **from a routine day or template** (exercises from the governed library, sets × reps,
     notes) or **class-style** (title, focus tags, an optional exercise list);
   - **Copy last week**;
   - **Publish** sends it to the group.
5. **Member sees it** on gym Today: a "This week from Ana" card, with today's session first.
   - **Check in** (WP-05: went or skipped, effort, optional watch kcal, note); or
   - **Start**: the session opens in the normal logger, **copied** into the member's account. The member owns the copy,
     and the progression engine is untouched.
6. **Trainer dashboard** (web): group × sessions grid (went / skipped / no answer), average effort, and per member the
   last loads on the session's exercises. Only data the member shares is shown.

**Explicitly not in the MVP:** editing a member's own routine, food or targets, messaging or comments, payments, push
notifications (Q-F-14 kept push out of the app), trainer-defined exercises (governed library), a public trainer
directory, and AI anything.

**Why this slice:**

- It replaces a habit trainers already have, posting the week in WhatsApp, rather than creating a new one.
- It gives members a reason to log: the trainer sees it.
- It reuses three things that already exist or are planned: Following's consent and section-sharing pattern, the routine
  editor on web, and WP-05's check-in.

## 3. Later slices (ordered, each its own WP)

1. **Trainer edits a 1:1 client's routine.** It writes into the client's routine with an audit trail, and the client
   gets an in-app "Ana updated your routine" notice.
2. **Food: protein or calorie targets from the trainer.** "Own targets set by someone else" (B-35), the client accepts.
   Pairs with WP-08 protein-only mode.
3. **Food: suggested weeks.** The trainer pushes a week template into the client's My weeks (`MealPlan.isTemplate`).
4. **Comments on a session** (trainer ↔ member), moderated like Following.
5. **Payments** (trainer seat or client add-on), only after the business model is proven.
6. **Push notifications** for "new week published", when push returns to the app.

## 4. Data model draft (additive only)

All new tables. No change to existing columns except **nullable** link columns.

```prisma
model TrainerProfile {          // opt-in, like SocialProfile
  userId      String   @id
  displayName String
  activatedAt DateTime @default(now())
  disabledAt  DateTime?
}

model CoachingGroup {
  id         String   @id @default(cuid())
  trainerId  String                    // → User
  name       String
  kind       CoachingGroupKind         // GROUP | ONE_TO_ONE
  inviteCode String   @unique          // short, rotatable
  archivedAt DateTime?
  createdAt  DateTime @default(now())
  @@index([trainerId])
}

model CoachingMember {
  id            String   @id @default(cuid())
  groupId       String
  userId        String                 // the member
  status        CoachingMemberStatus   // ACTIVE | LEFT | REMOVED
  shareSessions Boolean  @default(true)  // attendance + effort
  shareLoads    Boolean  @default(true)  // weights/reps on published exercises
  joinedAt      DateTime @default(now())
  leftAt        DateTime?
  @@unique([groupId, userId])
  @@index([userId, status])
}

model PublishedSession {
  id          String   @id @default(cuid())
  groupId     String
  weekStart   String                   // "YYYY-MM-DD" (Monday)
  plannedDate String?                  // "YYYY-MM-DD"
  title       String
  kind        PublishedSessionKind     // WORKOUT | CLASS
  focus       String[]                 // WP-05 focus enum values
  exercises   Json                     // [{ exerciseId, sets, repMin, repMax, restSec?, notes? }] — validated by Zod
  notes       String?
  publishedAt DateTime @default(now())
  version     Int      @default(1)
  @@index([groupId, weekStart])
}

// Nullable links on member-owned rows (additive):
// WorkoutSession.publishedSessionId String?   (set when the member starts a published session)
// ClassCheckIn.publishedSessionId   String?   (WP-05's table)
```

- **Dashboard reads** join `PublishedSession` → member `WorkoutSession` / `ClassCheckIn` by `publishedSessionId`, filtered
  by `CoachingMember.status = ACTIVE` and the share flags at read time. Turning a flag off hides past data immediately.
- **Leaving a group** stops sharing at once. Trainer-side caches hold nothing.

## 5. Roles, permissions, consent and platforms

**Permissions** (tRPC middleware, per CLAUDE.md rule 5; not `if` checks in handlers):

- `trainerProcedure` requires an active `TrainerProfile`.
- Group ownership is checked in the service ("can only manage own groups"), like other ownership checks.
- Member-data reads go through one `CoachingAccessService.canSee(trainerId, memberId, section)` that checks active
  membership plus the share flag. Every read path uses it, mirroring `friend-content.service.ts`.

**Consent (special-category data)**

- Seeing someone's training and effort is health-related data shared with a named third party. Use **explicit,
  per-section, revocable consent**: a new `ConsentKind.COACHING_SHARING` event, written per group on join and on every
  flag change, and withdrawn on leave.
  - Old clients: `privacy.getConsentHistory` returns kinds to mobile, so the new enum value must be filtered for API
    level < the claimed level, or mapped to an existing label.
- **Extend the DPIA** (`docs/friends/dpia.md`) with a coaching section, covering:
  - the purpose;
  - the recipient (one named trainer);
  - minimisation: weight, food and targets aren't shareable in the MVP;
  - retention: dashboard data is derived live and never copied;
  - the right to withdraw.
- **The trainer's own obligations.** Trainers act as independent controllers for their client relationship. The terms
  need a "trainer" clause (owner and counsel, §6).

**Platforms**

| Side    | Platform                                  | Notes                                                                                                                                                                          |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trainer | **Web first** (desktop-first, responsive) | New route group `apps/web/src/app/(dashboard)/coach/*`, reusing the web routine editor components. No trainer UI on mobile in the MVP beyond "you're a trainer → open the web" |
| Member  | **Mobile + web**                          | Join via link (deep link `chefer://join/<code>`; web `/join/<code>`), "This week from…" card on gym Today, sharing settings in Profile → Privacy                               |

**Old 1.0.1 clients:** they never see trainer data (no card, no join). Claim the next free **API level** (6, in the
coordination file) for the bootstrap field that carries "this week from" and for the new consent kind. Gate both on
`level >= 6`. All procedures are new (`coach.*`, `coaching.*`), so old clients are unaffected.

## 6. Business model: owner questions

1. **Who pays?** Every comparable coaching tool charges the trainer, never the member, with tiers by active-client count
   ($0 for 1–5 clients up to about $25–60 for 10–15; research A.4). Options:
   - (a) free during the beta (recommended, to learn usage), then a trainer seat priced as a small fraction of one
     client's monthly fee (RO packages run 150–400 lei a client a month);
   - (b) a trainer subscription (TrueCoach/Trainerize model);
   - (c) members need Premium;
   - (d) the gym pays.
     Option (c) contradicts the 2 Oct principle "Premium = heavy AI only", because coaching uses no AI.
2. **Trainer-brought growth:** should a member invited by a trainer get anything (e.g. Premium while in the group)?
3. **Terms:** do we need a trainer agreement (independent controller, acceptable use) before the beta? We recommend yes,
   and a short one.
4. **Who can be a trainer?** Anyone who turns it on (recommended for the beta), or invite-only (manual approval)?
5. **Order against WP-05:** see §8. We recommend shipping WP-05 first.

## 7. Phase 1 plan (after sign-off)

**Branch** `feat/trainer-platform`, worktree `../chefer-wp18`, DB `chefer_wp18`, ports 3218/3318/8118.

| Lane                   | Items                                                                                                                                                                                                                                                      | Owns                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A, data + API          | schema (§4), Zod in `@chefer/types` (`coaching/*`), repositories, `CoachingAccessService`, `trainerProcedure`, `coach.*` (trainer) and `coaching.*` (member) routers, `ConsentKind.COACHING_SHARING` + level-6 gating, DPIA + `infrastructure.md` §6/§8/§9 | `packages/database/prisma/*`, `packages/database/src/repositories/coaching*`, `apps/api/src/{application,routers}/coaching*`, `packages/types/src/coaching/*` |
| B, trainer web         | `/coach`: turn on, groups, invite link, publish week (reusing the web routine editor), copy last week, dashboard grid + member loads                                                                                                                       | `apps/web/src/app/(dashboard)/coach/**`, `apps/web/src/features/coach/**`                                                                                     |
| C, member mobile + web | join flow + consent screen, "This week from…" card on gym Today, start/check-in from a published session (copy into the member's account), sharing settings, leave                                                                                         | `apps/mobile/src/features/coaching/**`, gym Today card slot, `apps/web/src/features/coaching/**`                                                              |

**Acceptance:**

- A trainer creates a group, publishes 3 sessions, and 2 members join via link and consent.
- Member A checks in for Tuesday, and member B logs Thursday in full.
- The trainer dashboard shows ✓ and – correctly, effort, and B's last loads.
- Member B turns off "loads". The loads column disappears for B immediately.
- B leaves the group. B is gone from the dashboard, and the history isn't visible.
- A 1.0.1-level client gets no new fields or enum values (contract test at level 4).
- The progression engine is unchanged for a member who starts a published WORKOUT session: it is a copy, with the same
  engine path as a routine day.

**Tests:**

- Unit: the access service matrix (membership × flags × sections), publish/copy-last-week, dashboard aggregation.
- Contract: `coaching.*`, `coach.*`, level gating.
- Jest: card, join and consent.
- Playwright: trainer publish → dashboard.
- Maestro: join → check in.

## 8. Order with WP-05, and the validation plan

**Order (recommendation): WP-05 first, on its own.**

- Class-goers without a trainer on Chefer need the check-in anyway, and that's the tester's case today.
- WP-05 is half the member side of this MVP.
- It ships sooner and gives us usage data before we build the trainer side.

Phase 1's lane A can start once WP-05's schema is merged. Lanes B and C then build on it.

**Validation before Phase 1** (2–3 conversations; [interview-kit.md](./interview-kit.md)):

1. The tester's trainer (small group).
2. One 1:1 PT who also gives nutrition advice.
3. One trainer who uses or used TrueCoach, Trainerize or Everfit.

**Cheapest validation (research A.4 #8): a 4-week manual trial before building the dashboard.** The tester's trainer
shares each week's sessions (a Chefer routine link via Following, or the WP-05 class slots), members check in, and the
owner reads attendance by hand. **Success:** the trainer publishes every week unprompted and more than half the members
check in. This tests the weekly habit, the riskiest assumption, for almost no build cost, and can run while Phase A
merges.

**What would change the MVP:**

| If we hear…                                        | Then…                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| "I already post the week in WhatsApp" (2 of 3)     | MVP as specced                                                                                 |
| "I mostly work 1:1 and change programs per person" | Swap step 4 to **trainer edits a client's routine** (later slice 1), and keep groups for later |
| "Clients mostly ask me about food"                 | Pull **trainer-set protein target** (later slice 2) into the MVP; it's small                   |
| "I'd only use it with messaging"                   | Don't build messaging; test whether WhatsApp plus the dashboard is enough first                |
| Nobody would switch from their current channel     | Stop after WP-05; keep the trainer platform in Nice to have                                    |

## 9. What the owner signs off

1. The MVP slice (§2) and what's out of it.
2. The business model answers (§6): who pays during the beta, trainer terms, and who can be a trainer.
3. The order: WP-05 first (§8).
4. Running the validation conversations (§8) before Phase 1, or building in parallel with them.
