# Trainer coaching: spec (WP-18, Phase 0 revised)

_Revised 2026-10-04 for the owner's 1:1 model (decided 2026-10-04). It replaces the group / "publish the week" draft of
2026-10-03 (see [History](#history)). Inputs: [research.md](./research.md) (market + code), [interview-kit.md](./interview-kit.md),
the gym engine (`packages/utils/src/gym/*`, `apps/api/src/application/gym/*`), and Following (`docs/friends/*`,
`apps/api/src/application/friends/*`). The build plan is [phase-1-plan.md](./phase-1-plan.md). **Docs only. Nothing
here is built until the owner signs off (§14) and the trainer interview has run (§12).**_

## 0. In one paragraph

A trainer coaches **individual clients**. A client joins with an **invite link** and an explicit consent screen. From
then on the trainer can **edit the client's own active routine** (the same routine the client edits, built from the
governed Chefer library), add a **short note per exercise** ("knees out, slow eccentric"), and **prepare the next
session** by setting next-time weights and reps that override the app's suggestion once. The client sees a small
**"Changed by Ana · 2 Oct"** note wherever the trainer changed something. The routine stays the client's data, it
keeps repeating week to week, and the progression engine keeps working on it. The trainer sees the client's
**completed workouts** (exercises, sets, weights, reps, effort, dates) and **adherence** (trained or not on planned
days), and keeps **private notes** about the client that only the trainer can read. Food, body weight and targets are
never shared. There is no chat, no comments and no payment. Trainer tools work on **web and mobile**. One trainer per
client; the client can leave at any time and keeps the routine. Free during the beta.

## 1. Personas and jobs

| Persona                      | Who                                                                                                      | Job to be done                                                                                                     | What they use today (research A)                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **1:1 personal trainer**     | 5–30 individual clients, each on their own program. The validation trainer is the owner's wife's trainer | "Keep each client's program right for them, change it when they progress or something hurts, and know they did it" | Paper, spreadsheets, PDFs, WhatsApp; some use TrueCoach/Trainerize |
| **Coached client**           | Trains 2–4 times a week, partly alone, with a plan from the trainer                                      | "Know exactly what to do today, at what weight, and have my trainer see that I did it"                             | The trainer's sheet, photos of it, memory                          |
| **Lifter without a trainer** | Today's Chefer gym user                                                                                  | Nothing changes for them                                                                                           | Chefer                                                             |

Why the model changed: the owner's own case is a trainer who tailors each client's routine (injuries, age, history).
The trainer's tailoring knowledge lives in the trainer's head and their **private notes**; Chefer only carries the
resulting routine, the per-exercise cues and the logged workouts. **Chefer never stores or models client health data**
(injuries, conditions, age). See §8.

## 2. MVP slice (Phase 1): user flows

All copy below is English; Romanian strings follow the app's normal i18n path. Names are examples.

### 2.1 Trainer turns on trainer tools (web or mobile)

1. Profile → **Trainer tools** → "Coach clients in Chefer" → display name (prefilled from the first name) → **Turn on**.
   Creates a `TrainerProfile`. Shown only when the `coaching` flag is on for this user and the user is on
   `TRAINER_ALLOWLIST` during the beta (§11).
2. The trainer lands on **Clients** (empty state: "Invite your first client").

### 2.2 Trainer invites a client

1. Clients → **Invite a client** → optional private label ("Maria, Tue/Thu") → **Create link**.
2. The link is `APP_URL/coaching/join/<code>`: single use, expires in 14 days, can be revoked. **Copy** and
   **Share** (RN `Share` sheet on mobile, `navigator.share` or copy on web). The trainer sends it however they like
   (WhatsApp in practice). Pending invites are listed with their label and expiry.

### 2.3 Client joins (mobile or web)

1. The link opens the web page. On a phone it offers **Open in the Chefer app** (`chefer://coaching/join/<code>`, the
   existing scheme; no universal links, because they need native config) and **Continue on the web**. Signed-out users
   sign in or create a free account first, then return to the same page.
2. **Consent screen** (the same shared copy, `COACHING_COPY` in `@chefer/types`, on both platforms):
   - "**Ana** wants to coach you in Chefer."
   - **Ana will see:** your active routine; your completed workouts (exercises, sets, weights, reps, how hard the last
     set felt, dates) from the last 4 weeks and from now on; which planned days you trained or missed, and when you
     paused training (dates only, never the reason).
   - **Ana can:** change your routine (exercises, sets, reps, rest, notes on exercises) and set your weights and reps
     for the next session. You'll see what she changed. You can change it too.
   - **Ana can keep private notes about you.** You won't see them. Chefer never reads or uses them.
   - **Ana will never see:** your food, meals, body weight or measurements, nutrition targets, your notes on workouts,
     heart rate or calorie estimates, your age or profile.
   - "One trainer at a time. Leave whenever you want: Ana loses access at once and **your routine stays yours**."
   - Buttons: **Allow and join** / **Not now**.
3. If the client already has a trainer: an extra line "You'll stop being coached by Ion" and the button reads
   **Switch to Ana**.
4. If the client has not set up training yet, the existing gym setup runs first (it creates the starter routine the
   trainer will then rewrite). Joining needs a completed gym profile because the engine needs the equipment and
   plates.
5. On join: a `CoachingLink` (ACTIVE) and a `COACHING_SHARING` consent event. The client lands on **Your trainer**
   (Profile → Your trainer): who, since when, what she sees and can do, **Leave**.

### 2.4 Trainer: client list (web desktop-first, mobile)

One row per active client:

- name, client since;
- last workout ("Tue 30 Sep") and this week's sessions against the client's weekly goal ("2 / 3");
- a quiet flag when nothing was logged for 7 days;
- "Routine changed by Maria · 3 Oct" when the client edited after the trainer last did.

Web: a table at `lg+`, cards below. Mobile: a list. Tap → the client.

### 2.5 Trainer: one client

Three tabs (web: tabs above a two-column layout at `xl`; mobile: segmented control):

1. **Routine** (the editor):
   - the client's active routine in the existing routine editor (web `DesktopEditorBoard`/`PhoneEditorList`, mobile
     `DayEditor`), fed by `trainer.client.*` instead of `gym.routine.*`;
   - exercises come from the **curated library only** (the picker hides custom exercises; a client's own custom
     exercise already in the routine can stay but cannot be added again);
   - each exercise row has a **Note for Maria** field (max 200 characters) and shows "Changed by Maria · 3 Oct" when
     the client changed that row more recently;
   - **Next session** panel: the day that comes next in the client's rotation is highlighted ("Next: Day B · planned
     Thu"). Every strength exercise shows the app's next-time suggestion ("60 kg × 8, 8, 8 · app suggestion"). **Adjust**
     opens the existing override sheet (web `OverrideTargetSheet`, mobile `override-sheet`) to set weight and reps per
     set for the next time; it then reads "62.5 kg × 6, 6, 6, 6 · set by you 2 Oct". **Reset to app suggestion** clears
     it;
   - **Save** is version-checked (§9); **Fill from one of my routines** copies one of the trainer's own routines into
     the draft (client-side mapping, curated exercises only, then a normal save).
2. **Workouts**: completed workouts, newest first, paged. Each shows date, name, duration, and per exercise the sets
   (weight × reps, warm-ups marked), skipped exercises, and the last-set effort (reps in reserve). Cardio entries show
   duration and distance. Tapping an exercise shows its recent history (last 8 exposures).
3. **Adherence**: the last 8 weeks (sessions against goal, met/missed/paused) and a 14-day strip of planned days
   (from `RoutineDay.plannedWeekday`): trained / missed / paused / rest.

Plus **Private notes** (a side panel on web, a fourth tab on mobile): one free-text note per client, autosaved,
"Only you can see this. Chefer doesn't read it, and Maria never sees it." And **Remove client** (confirm sheet).

### 2.6 Client: what changes in their app

- **Routine** (mobile Routine tab and editor; web `/gym/routine`): a header line "Ana changed your routine · 2 Oct";
  under each changed exercise "Changed by Ana · 2 Oct"; trainer notes shown as "Ana: knees out, slow eccentric". The
  client can edit everything as today, and can **remove** a trainer note but not rewrite it.
- **Gym Today**: one line "Ana updated your routine · 2 Oct" until the client opens the routine (seen-marker kept
  on the device, no server state).
- **Workout logger**: the trainer note under the exercise name; a trainer-set target reads "Set by Ana" instead of
  "You set this target yourself".
- **Profile → Your trainer**: as in §2.3, with **Leave**. Leaving: the link ends at once (the trainer loses all access
  and editing), a withdrawal consent event is written, the routine, trainer notes and pending next-session targets stay
  with the client (who can clear them).
- **Consent history**: "Trainer access allowed" / "Trainer access ended".

### 2.7 Ending

- **Client leaves** (§2.6), **trainer removes the client**, or **trainer turns off trainer tools** (ends every link):
  the trainer loses access immediately (no cached access, checked per request). The private note is hidden and
  deleted after 30 days unless the same pair links again (§8, owner/counsel question Q-6).
- **Account deletion** of either side cascades the coaching rows; edit stamps pointing to a deleted trainer become
  "Changed by your trainer".

## 3. Explicitly not in the MVP

- Any in-app communication: chat, comments, reactions, client session notes to the trainer (owner decision 7).
- Groups, classes, "publish the week", class check-ins (classes are out of WP-18; see the activity quick-log idea in
  §4).
- Trainer-made exercises (governed library only; later slice).
- "This session only" exercise swaps (a one-off variant of one day). Phase 1 changes structure through routine edits;
  next-time numbers through next-session targets (§6). Validate need in the interview.
- Food, body weight, measurements, targets, meal plans: never shareable in this MVP.
- Health data of any kind: no injury, condition or age fields; no tags; no structured "limitations".
- Payments, trainer subscriptions, client add-ons.
- Push notifications or email to the client about changes (push is out of the app; changes show on next open).
- Multiple trainers per client, assistant trainers, gyms/organisations.
- A public trainer directory, search, or discovery.
- Editing a client's non-active routines, their gym profile, pauses, or their rotation pointer.
- AI of any kind.

## 4. Later slices (ordered, each its own WP or sub-WP)

1. **Routine change history** for both sides ("3 × 8 → 4 × 6 by Ana"), from an append-only change log (§5.3 explains
   why Phase 1 uses stamps only).
2. **One-off session variants** ("Thursday only: swap squat for leg press"), if the interview shows trainers do this
   often (§6.3).
3. **Trainer-made exercises** with governance (shared only with that trainer's clients).
4. **Program templates** for trainers (assign one program to several clients, then tailor). Phase 1's "Fill from one
   of my routines" is the cheap version.
5. **Dated private notes** (a list instead of one free-text field).
6. **Payments** (trainer seat), only after the beta proves usage. Research A.4: every comparable tool charges the
   trainer, never the client.
7. **Activity quick-log** (separate small package, not WP-18): any user logs "45 min cycling class, 400 kcal" as a
   record only, with no eating back of calories. It replaces WP-05's class check-in idea (paused 2026-10-04). If it
   ships first, a trainer's Workouts tab can list these entries later.

## 5. Data model draft (additive only)

### 5.1 New tables

```prisma
/// One row = the user turned trainer tools on. No row = cannot invite or coach.
model TrainerProfile {
  userId      String    @id
  displayName String    // shown to clients ("Ana"); word-filtered like Following names
  activatedAt DateTime  @default(now())
  disabledAt  DateTime? // turned off: every link ENDED, invites revoked
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("trainer_profiles")
}

/// Single-use invite. The code is the only secret: 10 chars, Crockford base32, from crypto random.
model CoachingInvite {
  code       String    @id
  trainerId  String
  label      String?   // trainer-private ("Maria, Tue/Thu"), max 60
  createdAt  DateTime  @default(now())
  expiresAt  DateTime  // createdAt + 14 days
  usedAt     DateTime?
  usedById   String?   // client who joined with it; SetNull on delete
  revokedAt  DateTime?
  trainer User @relation("InvitesMade", fields: [trainerId], references: [id], onDelete: Cascade)
  @@index([trainerId, createdAt])
  @@map("coaching_invites")
}

enum CoachingLinkStatus { ACTIVE ENDED }
enum CoachingEndedBy    { CLIENT TRAINER SYSTEM }   // SYSTEM = trainer tools off, account deleted, flag cleanup

/// The trainer ↔ client relationship. Access is decided ONLY from ACTIVE rows (§8).
model CoachingLink {
  id           String             @id @default(cuid())
  trainerId    String
  clientId     String
  status       CoachingLinkStatus @default(ACTIVE)
  inviteCode   String?            // provenance, no FK (invites are pruned)
  trainerLabel String?            // copied from the invite, trainer-private
  startedAt    DateTime           @default(now())
  startedOn    String? // client's device-local YYYY-MM-DD at join; anchors the 28-day window (fallback: UTC day of startedAt)
  endedAt      DateTime?
  endedBy      CoachingEndedBy?
  trainer User @relation("CoachingAsTrainer", fields: [trainerId], references: [id], onDelete: Cascade)
  client  User @relation("CoachingAsClient",  fields: [clientId],  references: [id], onDelete: Cascade)
  @@index([trainerId, status])
  @@index([clientId, status])
  @@map("coaching_links")
}
// Migration adds (raw SQL is allowed in migrations):
//   CREATE UNIQUE INDEX coaching_links_one_active_trainer ON coaching_links ("clientId") WHERE status = 'ACTIVE';
// The service also ends the old link inside the join transaction, so a switch never trips it.

/// The trainer's private note about one client. Never shown to the client, never parsed, searched, analysed or sent to AI.
model CoachingNote {
  trainerId String
  clientId  String
  body      String   // max 4000
  updatedAt DateTime @updatedAt
  hiddenAt  DateTime? // set when the link ends; the maintenance worker deletes rows hidden > 30 days
  trainer User @relation("CoachingNotesWritten", fields: [trainerId], references: [id], onDelete: Cascade)
  client  User @relation("CoachingNotesAbout",   fields: [clientId],  references: [id], onDelete: Cascade)
  @@id([trainerId, clientId])
  @@map("coaching_notes")
}
```

Notes are keyed by the **pair**, not the link, so a client who leaves and comes back within 30 days gets the same
trainer note back (owner/counsel to confirm, Q-6).

### 5.2 Additive columns on existing tables

```prisma
model Routine {
  // …existing…
  lastEditedById String?   // who last saved the document (owner or trainer); SetNull on user delete
  lastEditedAt   DateTime? // when; NOT updatedAt, which also moves on rotation (setNextDay) and setActive
}

model RoutineExercise {
  // …existing… (notes stays the OWNER's note and is never shown to or written by the trainer)
  trainerNote    String?   // max 200; written only by the trainer path; the client can clear it, not edit it
  lastEditedById String?   // who last changed THIS row (diff-based, §5.3)
  lastEditedAt   DateTime?
}

model ConsentEvent {
  // …existing…
  contextId String? // the CoachingLink id for COACHING_SHARING events (which trainer the consent named)
}

enum ConsentKind {
  // …existing…
  COACHING_SHARING // join (granted), leave/remove/trainer off (withdrawn); filtered for clients below level 6 (§10)
}
```

`ProgressionOverride` (the JSON in `ExerciseProgression.override`, type in `packages/types/src/gym/engine.ts`) gains an
optional `setById?: string`. Rows written before Phase 1 have none, which means "the owner set it".

### 5.3 Edit attribution: stamps, not a log (decision)

**Chosen:** `lastEditedById` + `lastEditedAt` on `Routine` (any document save) and on each `RoutineExercise` (only rows
that save actually changed). Both the client's save (`gym.routine.save`, every client version) and the trainer's save
(`trainer.client.saveRoutine`) go through one repository path that diffs the incoming document against the stored
rows inside the version-checked transaction, with a pure `diffRoutineDoc(before, after)` in `@chefer/utils`:

- a row is **changed** when it is new, or any of `exerciseId, sets, repMin, repMax, targetRir, restSec,
supersetGroup, trainerNote` differs (after superset normalisation; a pure reorder does not count, `notes` is ignored
  on the trainer path and is the owner's own field);
- changed rows get the saver's id and `now()`; unchanged rows keep their stamps;
- the routine gets the saver's stamp when anything changed (including deleted rows, renamed or removed days, weekday
  changes).

What each side sees:

- the **client** sees "Changed by &lt;trainer&gt; · &lt;date&gt;" on rows (and the routine) whose `lastEditedById` is not
  the client;
- the **trainer** sees "Changed by &lt;client&gt; · &lt;date&gt;" on rows the client changed after the link started.

**Why not an edit log in Phase 1:**

1. The only UI question is "who changed this last, and when". A stamp answers it in the query that already loads the
   routine (`gym.bootstrap`, the hot path), with no join or aggregation.
2. `replaceDocument` is a full-document replace that deletes rows; a meaningful log needs before/after snapshots and
   diff rendering, which is the "change history" later slice.
3. A log is another store of the client's training history with its own retention and export rules (DPIA). Stamps
   add two columns.

**Why not `updatedAt`:** `Routine.updatedAt` moves on rotation (`setNextDay`) and `setActive`, which are not edits,
and `RoutineExercise` has none.

Old clients' saves are stamped too (the diff runs on the server), so attribution is correct whichever app saved.

## 6. "Prepare the next session": how it maps onto the routine and the engine

### 6.1 The mapping

| Trainer intent                                                                    | Mechanism                                                                                        | Works on 1.0.1 bundles?                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| "From now on: swap this exercise, 4 × 6 instead of 3 × 8, rest 2 min, add a note" | **Routine edit** (version-checked document save, §9)                                             | Yes (routine sync is unchanged); notes are not shown there                       |
| "Next time she squats: 62.5 kg × 6, 6, 6, 6", then let progression continue       | **Next-session target** = the existing D5c override (`ExerciseProgression.override`) + `setById` | Yes: applied by their on-device engine and the server; copy says "You set this…" |
| "Only this Thursday: leg press instead of squat"                                  | Not in Phase 1. Edit, then edit back; later slice 2 if trainers need it                          | n/a                                                                              |
| "Do day B next"                                                                   | Client only (rotation pointer), unchanged                                                        | n/a                                                                              |

### 6.2 Why the next-session target reuses the D5c override

What exists (read in `progression.service.ts`, `packages/utils/src/gym/progression.ts:964-1010`,
`packages/utils/src/gym/session.ts:615-710`):

- `ExerciseProgression.override = { weightKg, reps[], at }` per (user, exercise, rep bucket). `prescribe()` applies it
  over the engine's suggestion (`reasonCode: USER_OVERRIDE`) when it is newer than the last exposure; `reps.length`
  sets the set count, so the trainer can also change the number of sets for one session.
- It is **consumed once**: the server clears it in `recompute()` when an exposure newer than `override.at` is logged,
  and the phone does the same offline when it folds a finished session (`session.ts:696`).
- It reaches the phone through `gym.bootstrap.progressions`, is persisted with the offline read model, and is used by
  `buildNextWorkout` both on the server (`nextWorkout`) and on the device (other days, offline starts).

So a trainer-set override needs **no engine change**: `trainer.client.setNextTarget` calls the same
`ProgressionService.setOverride(clientId, …)` with `setById = trainerId`. Progression state is never touched (the
override sits next to the derived state), so after the session the engine continues from what was actually lifted.

Rejected alternative: a per-slot `RoutineExercise.nextTarget`. It would be more precise (squat on Tue vs Thu) but needs a
new input in the shared `buildNextWorkout` that 1.0.1 bundles do not have (they build non-rotation days on the device
and would silently ignore it), plus new consumption logic in the mobile offline fold. The D5c path already works on
every shipped client.

**Known limitation:** the target is keyed by exercise + rep bucket, so if the same exercise in the same rep range is
on two days, it applies to whichever comes first. The trainer UI says so: "Applies the next time Maria does Back squat
(6–8 reps)". Both sides can overwrite or clear it; the last write wins and is attributed (§9.2).

### 6.3 What the interview must tell us

Whether trainers change **numbers** for the next session (covered), **structure** permanently (covered), or **one-off
structure** for a single session (not covered). If the third is common, later slice 2 adds a one-off day variant
(`RoutineDay`-scoped, consumed by the first completed session of that day after it was set, level-gated).

## 7. API surface

Namespaces: **`trainer.*`** for the trainer side and **`coaching.*`** for the client side. `coach.*` is **taken**
(Adaptive Chef's weekly review, `apps/api/src/routers/coach.router.ts`), and so is `apps/web/src/features/coach`; the
trainer code uses `trainer` / `coaching` everywhere to avoid confusion.

All inputs are Zod schemas in `packages/types/src/coaching/` (`schemas.ts`, `dto.ts`, `copy.ts`, `limits.ts`), exported
from `@chefer/types`. Routers are thin; services live in `apps/api/src/application/coaching/`; repositories with
interfaces in `packages/database/src/repositories/coaching-*.repository.ts`.

### 7.1 Procedures and middleware

- `coachingProcedure = protectedProcedure.use(requireCoachingEnabled)`: the `coaching` flag, or the user is on
  `COACHING_ALLOWLIST`. Otherwise `NOT_FOUND`, like Following.
- `trainerProcedure = coachingProcedure.use(requireActiveTrainer)`: an active `TrainerProfile`, else `FORBIDDEN`
  (`reason: 'TRAINER_TOOLS_OFF'`).
- `requireCoachingAccess(scope)` composed on every `trainer.client.*` procedure: calls
  `CoachingAccessService.assert(trainerId, clientId, scope)` and puts the resolved access on `ctx`. One error for every
  denial (`NOT_FOUND`, "This client isn't available"), never a reason (mirrors INV-3 in Following).

### 7.2 Trainer side (`trainer.*`)

| Procedure                        | Type     | Input                                                                | Output / notes                                                                                                                                                                                                                                         |
| -------------------------------- | -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trainer.status`                 | query    | —                                                                    | `{ canActivate, active, displayName \| null }` (coachingProcedure, so a non-trainer can ask)                                                                                                                                                           |
| `trainer.activate`               | mutation | `{ displayName }` (1–40, word filter)                                | `TrainerStatusDto`; requires `TRAINER_ALLOWLIST` during the beta                                                                                                                                                                                       |
| `trainer.updateProfile`          | mutation | `{ displayName }`                                                    | `TrainerStatusDto`                                                                                                                                                                                                                                     |
| `trainer.deactivate`             | mutation | —                                                                    | Ends every link (`SYSTEM`, withdrawal consent events for each client), revokes invites, hides notes                                                                                                                                                    |
| `trainer.invites.list`           | query    | —                                                                    | `InviteDto[]` `{ code, url, label, createdAt, expiresAt, state: 'OPEN' \| 'USED' \| 'EXPIRED' \| 'REVOKED' }` (last 30 days)                                                                                                                           |
| `trainer.invites.create`         | mutation | `{ label? }`                                                         | `InviteDto`; max 20 open invites, 50 active clients (`COACHING_LIMITS`)                                                                                                                                                                                |
| `trainer.invites.revoke`         | mutation | `{ code }`                                                           | `{ ok: true }`                                                                                                                                                                                                                                         |
| `trainer.clients.list`           | query    | —                                                                    | `ClientRowDto[]` `{ clientId, name, since, label, lastWorkoutDate, week: { sessions, goal }, inactiveDays, routineChangedByClientAt \| null }`                                                                                                         |
| `trainer.clients.remove`         | mutation | `{ clientId }`                                                       | Ends the link (`TRAINER`), withdrawal consent event on the client's log, note hidden                                                                                                                                                                   |
| `trainer.client.overview`        | query    | `{ clientId, today }`                                                | `{ client: { name, since }, adherence: AdherenceDto, recent: CoachedWorkoutDto[] (last 5) }`                                                                                                                                                           |
| `trainer.client.workouts`        | query    | `{ clientId, cursor?, limit (≤ 20) }`                                | `{ items: CoachedWorkoutDto[], nextCursor }`; window: from `startedOn − 28 days` (the client's local join date, Q-2)                                                                                                                                   |
| `trainer.client.exerciseHistory` | query    | `{ clientId, exerciseId }`                                           | last 8 exposures `{ localDate, sets[], lastSetRir }`                                                                                                                                                                                                   |
| `trainer.client.routine`         | query    | `{ clientId }`                                                       | `TrainerRoutineDto \| null`: the client's **active** routine with `trainerNote`, row/routine stamps (names resolved), `nextDayId`, and per strength row `next: { suggestion, override: { weightKg, reps, at, setBy: 'TRAINER' \| 'CLIENT' } \| null }` |
| `trainer.client.saveRoutine`     | mutation | `{ clientId, routine: trainerRoutineDocSchema, expectedVersion }`    | `TrainerRoutineDto`; `CONFLICT` with `{ kind: 'routine', current }` exactly like `gym.routine.save`. Rejects non-curated exercises not already in the routine                                                                                          |
| `trainer.client.createRoutine`   | mutation | `{ clientId, templateKey? , days? }`                                 | Only when the client has **no** active routine: creates one in the client's account and makes it active                                                                                                                                                |
| `trainer.client.setNextTarget`   | mutation | `{ clientId, exerciseId, repBucket, weightKg, reps[] }` (D5c bounds) | Row's `next`; exercise must be in the client's active routine                                                                                                                                                                                          |
| `trainer.client.clearNextTarget` | mutation | `{ clientId, exerciseId, repBucket }`                                | Row's `next`                                                                                                                                                                                                                                           |
| `trainer.client.note`            | query    | `{ clientId }`                                                       | `{ body, updatedAt } \| null`                                                                                                                                                                                                                          |
| `trainer.client.saveNote`        | mutation | `{ clientId, body (≤ 4000) }`                                        | `{ body, updatedAt }`. Never logged, never in analytics events, never word-filtered or parsed                                                                                                                                                          |

`trainerRoutineDocSchema` = `routineDocSchema` where each exercise row has `trainerNote: string(≤200) | null` and **no**
`notes` (the client's own note is kept as stored for existing rows and null for new ones).

`CoachedWorkoutDto` = `{ id, name, localDate, startedAt, finishedAt, durationMin, isDeload, exercises: [{ exerciseId,
name, skipped, lastSetRir, sets: [{ weightKg, reps, isWarmup, completed, durationSec?, distanceM?, intensityRpe?,
resistanceLevel?, inclinePct? }] }] }`. **Excluded on purpose:** session and exercise notes, `caloriesKcal` (derived
from body weight), `avgHeartRateBpm`, in-progress and discarded sessions, anything computed from body weight (e1RM of
bodyweight lifts, relative strength). Tracking types are filtered by the **trainer's** client level, like
`friends.routine`.

`AdherenceDto` = `{ weeks: [{ weekStart, goal, sessions, status }] (8), days: [{ localDate, planned, trained, paused }]
(14) }`, built by a pure `buildAdherence()` in `@chefer/utils` from `weeks.ts`, the routine's `plannedWeekday`s, sessions
and pause **dates** (never `TrainingPause.reason`).

### 7.3 Client side (`coaching.*`)

| Procedure                | Type     | Input                                             | Output / notes                                                                                                                                                                                                                                                |
| ------------------------ | -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coaching.previewInvite` | query    | `{ code }`                                        | `{ state: 'OK' \| 'EXPIRED' \| 'USED' \| 'REVOKED' \| 'SELF' \| 'ALREADY_YOURS', trainerName \| null, currentTrainerName \| null, needsGymSetup }`; rate-limited 30/h                                                                                         |
| `coaching.join`          | mutation | `{ code, source: 'web' \| 'mobile', localDate? }` | `CoachingStatusDto`. One transaction: end any other ACTIVE link (`CLIENT`, withdrawal event), create the link, mark the invite used, record `COACHING_SHARING` granted (`documentVersion = LEGAL_VERSIONS.privacy`, `contextId = link.id`). Rate-limited 10/h |
| `coaching.status`        | query    | —                                                 | `{ trainer: { name, since } \| null }`                                                                                                                                                                                                                        |
| `coaching.leave`         | mutation | `{ source }`                                      | Ends the link (`CLIENT`), withdrawal event. Routine untouched                                                                                                                                                                                                 |

Changes to existing gym procedures (all additive):

- `gym.bootstrap`, `gym.routine.get/list`: for level ≥ 6, `RoutineDto` gains optional `lastEditedByOther?: { name, at }`
  and each `RoutineExerciseDto` optional `trainerNote?`, `lastEditedByOther?: { name, at }`; `NextWorkoutExerciseDto`
  gains optional `trainerNote?`; `ProgressionDto.override` gains optional `setByName?`; bootstrap gains optional
  `coaching?: { trainerName } | null`. **Stripped below level 6** (§10).
- `gym.routine.save`: optional `clearTrainerNoteIds?: string[]` (the client removes a trainer note). The repository
  never writes `trainerNote` from this path otherwise, so an old client's full-document save keeps the trainer's notes.
- `gym.progression.setOverride` / `clearOverride`: unchanged signature; the service stamps `setById = ctx.user.id`.
- `privacy.getConsentHistory` / `consentLog`: `COACHING_SHARING` rows filtered out below level 6.
- `user.exportData`: a `coaching` section (§8.4).

## 8. Permissions, consent and DPIA

### 8.1 Authorization (one place)

`CoachingAccessService` in `apps/api/src/application/coaching/coaching-access.service.ts` is **the** place that decides
what a trainer may see or do for a client, mirroring `social-access.service.ts` + `friend-content.service.ts`:

0. The `coaching` flag (or allowlist) is on for the trainer.
1. The trainer has an active `TrainerProfile`.
2. trainerId ≠ clientId.
3. An `ACTIVE` `CoachingLink(trainerId, clientId)` exists. Scopes `read` (routine, workouts, adherence, history) and
   `write` (routine, next targets) both require it; `note` requires only rule 1 + an existing note row or an active
   link (a hidden note is not readable in Phase 1).
4. No cross-request cache; a per-request memo only. Ending a link takes effect on the trainer's next request.

All client-data reads go through a `CoachingContentService` that builds responses **only** through
`coaching-dto.mappers.ts` (the INV-2 pattern) and is **read-only** except for the two write paths (`saveRoutine`,
`setNextTarget`/`clearNextTarget`), which call the existing `RoutineService` / `ProgressionService` with an actor. The
test oracle is an access matrix test (no link / ended link / active link / self / flag off / trainer off × every
procedure).

### 8.2 Consent

- Lawful basis for showing the client's training to the trainer and letting the trainer edit: **explicit consent**
  (Art. 9(2)(a) with 6(1)(a)), as for Following's workout sharing, because routines and workouts can reveal health
  (an injury-return program). Given on the consent screen; one `COACHING_SHARING` event per grant and per end, with
  `contextId` = the link. Withdrawal is one tap (**Leave**) and immediate.
- The consent text is shared code (`COACHING_COPY` in `@chefer/types`), so web and mobile say exactly the same thing.
- The privacy policy section "Coaching" and a short trainer clause in the terms must be live **before** the flag is
  turned on for anyone outside the allowlist, and `LEGAL_VERSIONS.privacy` bumped (owner action, as for Following).

### 8.3 Health data: what the app does NOT store

- No fields, enums or tags for injuries, conditions, limitations, age or medical history. Nothing is inferred.
- The trainer's private note is free text the app treats as **opaque**: not parsed, not searched, not word-filtered,
  not sent to AI, not in analytics (WP-13 events carry no note content or length), not in logs or Sentry breadcrumbs
  (the router input is redacted), not shown to the client, not used for suggestions.
- Trainer notes on exercises (visible to the client) are coaching cues; the copy says "Note for Maria (she'll see
  it)".

### 8.4 DPIA addendum (Phase 1 deliverable, before the flag goes beyond the allowlist)

`docs/trainer-platform/dpia-addendum.md`, extending `docs/friends/dpia.md` with the same headings:

1. **Processing:** a named trainer sees a client's routine, workouts and adherence, and edits the routine.
2. **Data categories:** routine, completed workouts, pause dates, display names; **excluded:** food, body metrics,
   targets, notes, heart rate, calorie estimates, pause reasons, age/profile.
3. **Roles:** Chefer is controller for the platform; the trainer is an **independent controller** for their coaching
   relationship and their private notes (counsel to confirm vs. processor).
4. **Lawful basis:** §8.2.
5. **Minimisation:** active routine only; workouts from 28 days before joining; reads derived live, nothing copied to
   the trainer; one trainer at a time.
6. **Retention:** links kept while active, ended rows kept 24 months for disputes (Q-6) then deleted; invites deleted
   30 days after expiry; private notes deleted 30 days after the link ends; consent events with the account.
7. **Rights:** export (client: trainers and dates, consent events; trainer: clients, invites, their own notes);
   erasure by cascade; withdrawal = Leave. Whether a client's access request covers the trainer's private notes is a
   counsel question (Q-7).
8. **Risks:** a forwarded invite (single use, 14-day expiry, the client must consent anyway); a trainer writing health
   details in notes (opaque storage, trainer clause); coercion by a trainer (leave is instant and keeps the routine).

## 9. Conflicts and sync

### 9.1 Routine structure: optimistic version check (not last-write-wins)

- `Routine.version` already guards every document save (`routine.repository.ts` `replaceDocument`: the version check
  and bump are one row-locked statement). The trainer's save uses the **same** method with the client's `routineId`
  and `expectedVersion`.
- Routine editing is **online-only** on mobile (`features/gym/routine/use-online.ts`, gym_plan §5.4), so there is no
  offline queue of routine edits to reconcile; a stale editor gets `CONFLICT` with the current document. Both existing
  editors already offer **Keep mine** (re-save on the newer version) or **Use the other version**
  (`features/gym/routine/conflict.ts` on both platforms). The trainer editor reuses that dialog.
- Level 6 improves the copy only: the conflict payload's `current` carries `lastEditedByOther`, so the dialog says
  "Ana changed this routine while you were editing". Older clients show the existing generic dialog.
- "Keep mine" by either side overwrites the other's changes **explicitly**; the stamps then attribute the rows to the
  person who kept theirs, so the other side sees it.

### 9.2 Next-session targets: last write wins, attributed

One override slot per (exercise, rep bucket). Either side can set or clear it; the last write wins and `setById`
records who. A single value has nothing to merge, and the UI always shows who set it.

### 9.3 Workouts: unchanged

Sessions are client-UUID documents synced through the offline outbox with last-write-wins on `clientUpdatedAt`. The
trainer **never writes sessions**. A workout already started keeps its own snapshot (`SessionExercise.prescription`),
so a trainer edit never changes a running workout; it applies from the next one.

### 9.4 Offline edges (documented, accepted)

- The phone sees trainer changes on its next bootstrap refresh (open, foreground, pull to refresh). No push.
- Override consumption is by exposure time: a session done offline **before** the trainer set a target does not
  consume it when it syncs later (correct). A session **started after** the target was set but from a stale cache
  (offline all day) consumes the target without showing it. The trainer sees "Used 3 Oct" vs. what was lifted in
  Workouts, and can set it again.
- A trainer deleting the routine row an offline session references is the same case as the client editing on the web
  during a phone workout today (`SessionExercise.routineExerciseId` has no FK; rotation pointer repair exists).

## 10. Old-client compatibility and API level

1.0.1 binaries (and any bundle that has not taken the Phase 1 OTA) send `x-chefer-api-level: 4`.

| Surface                                  | Below level 6                                                                                                             | Level 6+             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| New routine/bootstrap/progression fields | Stripped by the mappers (never sent)                                                                                      | Sent                 |
| `COACHING_SHARING` consent rows          | Filtered out of `getConsentHistory` / `consentLog` (old mobile would print the raw enum)                                  | Shown with a label   |
| Trainer-set next-session target          | **Applied** (D5c path); the reason line says "You set this target yourself" (accepted wording gap)                        | "Set by Ana"         |
| Trainer notes on exercises               | Not shown; kept on the old app's routine saves (the repository never writes `trainerNote` there)                          | Shown                |
| Routine conflict dialog                  | Existing generic copy                                                                                                     | Names who changed it |
| Join link                                | Web page works; the old app has no `coaching/join` route, so the page leads with "Continue on the web" when it can't tell | App route            |
| Trainer tools                            | Web only                                                                                                                  | Web + mobile         |

All new procedures are new names (`trainer.*`, `coaching.*`); nothing is renamed, removed or tightened.

**API level: Phase 1 needs level 6.** The coordination file
(`/Users/danpop/work/git-projects/chefer-backlog-status.md`, "Locks and claims") lists 6 as free. The **Phase 1
orchestrator claims it there when the build starts** (this Phase 0 task does not edit the file). Add
`COACHING_API_LEVEL = 6` to `@chefer/types` and gate on the **raw** `ctx.clientApiLevel`, not `effectiveLevel()`
(that one caps gym tracking types by the cardio flag).

**Interaction with INTERVALS (must fix in Phase 1):** levels are cumulative ("a bundle that sends N implements every
level below it"), and `client-level.ts` gates `INTERVALS` at `>= 5` although no bundle implements INTERVALS yet (W5
hasn't shipped; web and mobile both send `4`). A coaching bundle sending 6 would therefore claim INTERVALS support. Lane
A moves the INTERVALS gate to the next free level after 6 (7, recorded in the coordination file), as was done twice
before (2026-09-28 and 09-29). Owner/coordinator to confirm (Q-8).

The mobile query-persistence buster (`GYM_CACHE_SCHEMA_VERSION` in `features/gym/offline/query-persistence.ts`) is
bumped with the header, because the persisted bootstrap shape changes.

## 11. Platforms and rollout

| Side    | Web                                                                                                                                                           | Mobile (Expo, OTA-only)                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trainer | `apps/web/src/app/(dashboard)/trainer/**` (desktop-first, responsive to 320 px), `apps/web/src/features/trainer/**`; reuses the gym routine editor components | `apps/mobile/app/trainer/**`, `apps/mobile/src/features/trainer/**`; reuses `DayEditor`, the override sheet and the exercise picker; entry from Profile/More |
| Client  | `(dashboard)/coaching/join/[code]`, Profile → Your trainer, routine and workout views show notes and stamps                                                   | `app/coaching/join/[code].tsx`, `app/coaching/index.tsx`, routine/Today/workout lines, consent-history label                                                 |

- **OTA-safe:** no native modules or config. The deep link uses the existing `chefer` scheme through expo-router;
  share uses RN's core `Share` (its sheet includes Copy on iOS and Android). `expo-clipboard` is **not** installed and
  must not be added; the web uses `navigator.clipboard`.
- `trainer.*` queries are **not** persisted on the device (only `gym.*` is, `isGymQueryKey`), so client data never
  lands in a trainer's offline cache.
- **Flags:** `coaching` (FEATURE_FLAGS, default off) dark-launches everything; `COACHING_ALLOWLIST` (emails) sees it
  while the flag is off; `TRAINER_ALLOWLIST` (emails, or `*`) decides who may turn on trainer tools during the beta.
  New env vars go in both `.env.example` files and `infrastructure.md` §10.
- **Beta rollout:** allowlist the trainer, the owner's wife and 1–2 more clients → 4 weeks → decide on the flag.

## 12. Validation, risks and open questions

**Validation (before Phase 1 code merges, owner decision 11):** the owner interviews his wife's trainer with
[interview-kit.md](./interview-kit.md). Phase 1 lanes may start in parallel, but nothing merges to master until the
interview notes are in `docs/trainer-platform/interview-notes-<date>.md` and §2 is adjusted.

| If we hear…                                                      | Then…                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| "I change weights for the next session all the time"             | MVP as specced; next-session targets lead the editor                   |
| "I mostly swap exercises for one session" (pain, equipment busy) | Pull later slice 2 (one-off variants) into Phase 1b                    |
| "I'd build one program and give it to 5 people"                  | Promote "Fill from one of my routines" and later slice 4               |
| "I need to see their food / weight"                              | Out of the MVP by owner decision; record it for a later consent design |
| "I'd only use it with chat"                                      | Don't build chat; WhatsApp stays the channel; recheck after 4 weeks    |
| "I plan on my phone between sessions"                            | Mobile trainer lane first, web second                                  |

**Risks:**

1. **One trainer, thin evidence.** Mitigation: the interview, then a 4-week allowlisted beta with clear success
   criteria (the trainer edits at least one client's routine or target every week unprompted; clients log ≥ 70 % of
   planned days).
2. **Attribution copy on old bundles** ("You set this target yourself" for a trainer's target) until they take the OTA.
3. **Next-target precision** (exercise + rep bucket, §6.2).
4. **Two editors, one routine.** Version conflicts are real but explicit; the dialog names the other person.
5. **Legal:** trainer as independent controller and the private-notes question need counsel before the flag widens.
6. **Level 6 vs INTERVALS** renumbering (§10).
7. **Scope creep** toward chat, food and payments: §3 is the guard.

**Open questions for the owner:**

- **Q-1 Who can be a trainer in the beta?** Recommended: `TRAINER_ALLOWLIST` (invite-only).
- **Q-2 Workout window before joining.** Recommended: 28 days (the consent screen says "the last 4 weeks and from now
  on"). Alternatives: from joining only; or all history.
- **Q-3 What would trainers pay later?** Free in the beta (decision 9); the interview asks the price.
- **Q-4 Client edits.** The client can edit everything, including what the trainer changed (decision 1). Confirm that
  the client can **remove** a trainer note but not rewrite it.
- **Q-5 Removal notice.** When the trainer removes a client, the client sees "Ana stopped coaching you" on Your trainer.
  OK?
- **Q-6 Retention.** Ended links 24 months (disputes), private notes 30 days after the link ends (restored if the pair
  re-links). Counsel to confirm.
- **Q-7 Private notes and the client's access request.** Counsel: is Chefer a processor for the trainer's notes, and
  does a client's export include them? Recommended for now: not included, trainer is controller.
- **Q-8 API level.** Coaching takes 6; INTERVALS moves from 5 to 7. Confirm with whoever owns W5.
- **Q-9 Trainer on mobile:** full parity in Phase 1 (decision 8) costs about 1.5 lane-days; keep, or ship web first
  and mobile one week later?

## 13. Phase 1 plan (summary)

Full plan, lane briefs, owned files, acceptance criteria and tests: **[phase-1-plan.md](./phase-1-plan.md)**.

| Lane | Scope                                                                          | Size             | Starts after                                            |
| ---- | ------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------- |
| A    | Schema, `@chefer/types` coaching, utils (diff, adherence), API, gating, docs   | L (≈ 2 days)     | sign-off                                                |
| B    | Web: trainer area + client surfaces + shared web routine-editor seams          | L (≈ 1.5–2 days) | A's contract commit                                     |
| C    | Mobile trainer area + shared mobile routine-editor seams                       | M–L (≈ 1.5 days) | A's contract commit                                     |
| D    | Mobile client: join, consent, Your trainer, notes/stamps lines, level 6 header | M (≈ 1 day)      | A's contract commit; C's editor seams for routine lines |

Elapsed: about 4 working days with 3 lanes in parallel after lane A's contract commit, plus about 1 day of
integration, the verification ladder and device checks.

## 14. What the owner signs off

1. The 1:1 model and MVP flows (§2) and what's out (§3).
2. The two key designs: edit attribution by stamps (§5.3) and next-session targets on the D5c override (§6).
3. Open questions Q-1 to Q-9 (§12).
4. Running the interview before Phase 1 merges (§12), and the 4-week allowlisted beta.

## History

- **2026-10-03 (superseded):** the first Phase 0 draft proposed **groups** with invite codes, a weekly **"publish the
  week"** flow (routine-style or class-style sessions copied into members' accounts), class **check-ins** reusing
  WP-05, and a trainer attendance/loads dashboard. It ordered WP-05 first. The owner replaced it on 2026-10-04 with the
  1:1 model above: individual routines edited by both sides, per-exercise trainer notes, private notes, no classes
  (WP-05 paused; activity quick-log instead), trainer tools on web and mobile. The old text is in git history
  (`git show 77f00a18:docs/trainer-platform/spec.md`).
