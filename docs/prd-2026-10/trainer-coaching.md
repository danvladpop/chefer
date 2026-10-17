# PRD · Trainers and their clients (1:1 coaching)

|               |                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status        | **Decisions in + grilled (2026-10-17)**: D-1…D-8 (§6) and grilling outcomes (§4). Terms in [GLOSSARY.md](../../GLOSSARY.md). **Committed feature**                |
| Source        | Owner PRD "Chefer Trainers PRD" (Google Doc), section _Trainers in Gym_                                                                                           |
| Companion     | [casual-training-mode.md](./casual-training-mode.md): most coached clients are "movers" (§4.3)                                                                    |
| Platforms     | Web + mobile                                                                                                                                                      |
| Existing work | PR danvladpop/chefer#123 `feat/trainer-coaching` (draft, built 2026-10-04, **274 commits behind master**); spec on that branch at `docs/trainer-platform/spec.md` |

---

## 0. Owner stance (2026-10-17)

> The trainers feature is **here to stay**. It may not be the best version yet and not every answer is known, but
> it ships and improves from real use.

What this means in practice:

- **No more gates.** The trainer interview is no longer a precondition (D-2). Build, ship, then learn from real
  trainers.
- **Design for change, not for perfection.** Additive schema and API only, so a later rethink never breaks a shipped
  mobile binary. Every phase is usable on its own.
- **It is a product line, not an experiment.** Trainer surfaces get the same quality bar as food and gym: docs,
  parity on web and mobile, e2e tests, and a place in the glossary.

## 1. Where we are

The owner's PRD asks for:

1. an account can mark itself as a **Trainer**;
2. a **two-way handshake**: both sides agree before a coaching relationship exists;
3. the trainer can **edit each client's routine**;
4. **one trainer per client, many clients per trainer**;
5. edits by the trainer are **highlighted** ("updated by your trainer").

**All five are already designed and built** in draft PR #123 (WP-18 phase 1), from owner answers given on
2026-10-04. The PR was held only because a trainer interview had not happened and the feature was parked as
"future". Both blockers are now lifted.

**Decision (D-1): build on #123. Do not restart.**

- The design matches the PRD almost line for line.
- It has a privacy model, consent logging, optimistic-concurrency editing and e2e tests.
- The cost is a large rebase.

## 2. Users and jobs

| Persona                | Job to be done                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Personal trainer**   | "I have 10–30 clients. I want each one's program in their pocket, adjust it between sessions, and see who's slacking, without spreadsheets or WhatsApp photos of a notebook." |
| **Coached client**     | "My trainer tells me what to do. When I train alone between sessions I want the plan on my phone, and I want to know when it changed."                                        |
| **Self-directed user** | Unaffected. Never sees trainer UI unless invited or unless they look for a trainer.                                                                                           |

**Why trainers matter for Chefer (strategy):** one trainer brings their clients. If each trainer onboards 10 clients,
trainers are the cheapest acquisition channel Chefer has, and coached clients have an external reason to keep
opening the app. Coaching is **free** for both sides (D-5), so nothing slows that loop.

## 3. PRD requirements vs what #123 already does

| PRD requirement                      | #123 today                                                                                                                                                                                                                                                                                                          | Gap / action                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Account marks itself as Trainer      | Profile → **Trainer tools** creates a `TrainerProfile`. Gated by `TRAINER_ALLOWLIST`.                                                                                                                                                                                                                               | Allowlist first, then self-serve (D-4, §7).             |
| Two-way handshake                    | Trainer creates an **invite** (single-use 10-char code, 14-day expiry, revocable) → link `/coaching/join/<code>` → client sees a **consent screen** → accepts; a `COACHING_SHARING` consent event is written.                                                                                                       | Add client-initiated requests in phase 1 (D-3, §4.1).   |
| Trainer edits client's routine       | Trainer and client both edit the client's single active routine. Version-checked saves with the existing "Keep mine / Use the other version" dialog. Trainer adds from the curated library and can add a per-exercise note (≤ 200 chars). Trainer can set the next session's numbers once ("Prepare next session"). | None.                                                   |
| 1 client → 1 trainer; 1 trainer → N  | `CoachingLink` with a partial unique index (one ACTIVE link per client). Switching trainer ends the old link in the same transaction. 50 clients and 20 open invites per trainer.                                                                                                                                   | None.                                                   |
| Highlight trainer changes            | `lastEditedById` / `lastEditedAt` stamps on routine and exercises. Client sees "Changed by Ana · 2 Oct" on rows, "Set by Ana" in the logger, a notice on gym Today.                                                                                                                                                 | Add a "what changed" card and notification (§4.2).      |
| _(not in PRD)_ Trainer sees progress | Client list (last workout, sessions vs weekly goal, inactive-7-days flag); per client: routine, workouts, adherence, exercise history, one private note.                                                                                                                                                            | None.                                                   |
| _(not in PRD)_ Privacy               | Trainer **never** sees food, weight, targets, heart rate, calorie estimates, age. No health or injury fields are stored. The private note is never sent to AI or analytics.                                                                                                                                         | Keep (D-8). Say it in the consent copy; it sells.       |
| _(not in PRD)_ Ending                | Client can **Leave** any time and keeps the routine; trainer access stops immediately.                                                                                                                                                                                                                              | Let the trainer end it too; note retention (D-6, §4.3). |

## 4. Gaps to close (all phase 1)

### 4.1 Who can be a trainer, and how clients find them (D-3, grilled 2026-10-17)

**Being a trainer is something an account switches on**, in Profile → Trainer tools. It is not a separate kind of
account.

- A trainer keeps their own food and gym features.
- A trainer can also be another trainer's **client**. Nobody can coach themselves.
- Phase-1 onboarding does not ask "Are you a trainer?".

**Turning on Trainer tools also turns on Following** for that person, with a **private** profile by default:

- they can be found by name, but their plan and workouts stay hidden;
- their profile shows a **Trainer** badge and an optional **gym / city** line, to tell apart six people called
  "Ana";
- if they later turn Following off, they drop out of search. Their invites keep working.

There are two ways to start coaching. **Nothing is shared until both sides have said yes.**

| Path                       | Who starts it | How                                                                                                                          | Trainer approval |
| -------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Invite** (built)         | Trainer       | Single-use link, plus a **QR code** for in-person sign-ups on the gym floor. The client sees the consent screen and accepts. | Implicit         |
| **Coaching request** (new) | Client        | **"Find a trainer"** (under Coaching) → trainer profile → **"Ask to coach me"** → consent screen → request sent.             | Accept / decline |

Rules for **Find a trainer** and **coaching requests**:

- **Find a trainer searches trainers only and needs no Following.** Today's `friends.search` requires the searcher
  to have Following turned on (`activeFriendsProcedure`). Coaching should not need that, so Find a trainer is its own
  trainers-only search. It still matches by name only, never email, and excludes blocks either way. People who have
  Following on also see trainers in the normal people search, with the badge.
- **A coaching request never creates a follow**, and it does not make the client's profile public.
- **The client sees the consent screen before sending** (shared `COACHING_COPY`), and a `COACHING_SHARING` event is
  written. The trainer's accept creates the coaching (`CoachingLink`).
- **A client has one pending request at a time.** The client can cancel it, and it **expires after 14 days**.
- **At 50 clients**, the trainer's profile shows **"Not taking new clients"** instead of the Ask button. Invites are
  bound by the same 50-client cap.
- The client must have finished gym setup, the same rule as invites. Simple mode counts.
- If the client already has a trainer, the confirmation says so: "This ends your coaching with Ana when Mihai
  accepts." The switch happens on accept, in one transaction.
- Authorization reuses the single-NOT_FOUND pattern from `social-access.service.ts`.

### 4.2 Make trainer changes impossible to miss

Stamps on rows help when the client is already in the editor. Clients mostly open **Today**, so add:

- **"Ana updated your routine" card** on Today and Train, listing the diff in plain words: "+ Romanian deadlift ·
  Squat 3×8 → 4×6 · note on Bench press". The branch already has `routine-diff.ts`; this only renders it. The card
  is dismissed once read.
- **In-app notification** via the existing `Notification` table. Push notifications come later; they are a native
  change and the owner builds it.
- **The trainer sees the client's edits** the same way, so neither side is surprised.

### 4.3 Ending, retention and simple mode

- **The trainer can end** a link as well as the client, with a confirmation. The client keeps the routine either way.
- After a link ends, the trainer loses access to **everything**, history included.
- **Private note retention (D-6):** the note is kept for **30 days** in case of reconnection, then deleted by the
  existing maintenance worker. If the same pair reconnects within 30 days, the note comes back.
- **The trainer stops being a trainer.** If they turn off Trainer tools, are removed from the allowlist or delete their
  account, **every coaching relationship ends**. A confirmation names the number of clients first.
  - Each client gets an in-app notice and keeps their routine.
  - Past attribution reads "Changed by Ana (former trainer)", or "Changed by a former trainer" if the account was
    deleted.
- **Simple-mode clients** (companion PRD §9; one active routine per [ADR 0001](../adr/0001-one-active-routine.md)):
  - The trainer sees a **"Keep it simple" badge** on the client and **cannot change** the client's training style.
  - The trainer fills the client's **My week** days with workout types, exercises and notes. Both styles edit the
    same routine, so attribution and "Keep mine / Use the other version" work the same way.
  - Ticked exercises show to the trainer as **"done as planned"**, not as lifted weights. This needs the simple-mode
    progression guard to ship first or together.
  - A workout with no exercises shows as **"Yoga · 45 min"**, with no calories (D-8).

## 5. Additions (PM suggestions, prioritised by the owner)

| #   | Suggestion                                                                                                                                                                        | Phase              | Why                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| S3  | **Client-initiated request** (§4.1).                                                                                                                                              | **1** (D-3)        | Clients who already use Chefer bring their trainer in. A second acquisition loop.                                    |
| S5  | **QR invite** (§4.1).                                                                                                                                                             | **1**              | Gym-floor speed. Tiny.                                                                                               |
| S1  | **Trainer templates:** build a routine once, assign it to several clients, then tweak each one.                                                                                   | **2, first** (D-7) | Trainers reuse 3–5 base programs. Without this, onboarding 20 clients means 20 routines by hand. Biggest time saver. |
| S2  | **Coach this session:** the trainer runs the logger for the client during a paid session, from the trainer's phone; the session lands in the client's history as "Logged by Ana". | **2, first** (D-7) | In-person sessions are when real numbers get recorded. Today the client would have to log mid-set.                   |
| S4  | **Weekly trainer digest** in-app: who trained, who didn't, who hit a PR.                                                                                                          | 2, after S1 and S2 | Turns adherence data into a 2-minute Monday routine for the trainer.                                                 |
| S6  | **Trainer web workspace first.** Trainers build programs at a desk. Make the web editor the best place for multi-client work, mobile for on-the-floor checks.                     | Guides all phases  | Matches how trainers work. Keeps mobile scope small.                                                                 |

**Deliberately out of scope**, each confirmed by the owner on 2026-10-04 unless marked:

- in-app chat or messaging;
- payments or invoicing between trainer and client;
- group classes and class check-in;
- trainer access to food, weight or calories burned (D-8 re-confirmed 2026-10-17);
- trainer credential verification (D-4, 2026-10-17);
- charging anyone for coaching (D-5, 2026-10-17).

## 6. Owner decisions

| #   | Decision                                                   | Answer (2026-10-17)                                                                                                                       |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | Build on #123 (rebase), rather than restart?               | **Yes**                                                                                                                                   |
| D-2 | Is a real-trainer interview a gate before merge?           | **No.** Build it and iterate after. Trainer feedback feeds later phases; it gates nothing                                                 |
| D-3 | Client-initiated requests?                                 | **Add it**, in phase 1 (§4.1)                                                                                                             |
| D-4 | Who may become a trainer?                                  | **As recommended:** allowlist at first launch, then self-serve with a self-declared badge and a "Chefer does not verify credentials" line |
| D-5 | Is coaching free or paid?                                  | **Free**                                                                                                                                  |
| D-6 | Private note after a link ends                             | **As recommended:** kept 30 days for reconnection, then deleted                                                                           |
| D-7 | Phase-2 priorities                                         | **As recommended:** S1 templates and S2 coach-this-session first, then S4 digest                                                          |
| D-8 | Does a trainer see the client's estimated calories burned? | **No**                                                                                                                                    |

## 7. Path to production

### Phase 1: ship coaching (finishes WP-18 phase 1)

1. **Rebase #123 onto master.** Large: 274 commits, and the train screens moved to the one-tab-bar shell
   (`mobileShellV2`).
   - Port the client-side surfaces into `src/features/shell/train/*`.
   - Re-claim the **next free API level** at rebase time (the branch claimed 6) and update the INTERVALS
     reservation.
   - Re-run the Playwright and Maestro coaching flows.
2. **Close the gaps:**
   - Trainer tools turns on a private Following profile with Trainer badge + gym / city line (§4.1);
   - **Find a trainer** (trainers-only search, no Following needed) + coaching requests (one pending, 14-day
     expiry, "Not taking new clients" at 50) (§4.1);
   - QR invite;
   - "what changed" card + in-app notification (§4.2);
   - trainer-side End, 30-day note retention, and "trainer stops" handling with "former trainer" attribution (§4.3).
3. **Simple-mode rendering** if simple mode ships first; otherwise it goes in simple mode's own PR (companion §9).
   Either way, the progression guard lands no later than coaching.
4. **Launch Following and coaching together, on the same day** (owner decision, 2026-10-17).
   - Turn on the `friends` flag with `FRIENDS_ALLOWLIST=*`, and the `coaching` flag with `COACHING_ALLOWLIST=*`.
     Following's launch checklist (report and block, App Review notes for user-generated content) is part of this
     launch.
   - `TRAINER_ALLOWLIST` lists the first trainers (D-4). Clients need no allowlist; any user can accept an invite
     or send a request to an allowlisted trainer.
   - Mobile ships over the air if no native change is needed; otherwise the owner builds.
5. **Open trainer sign-up** (`TRAINER_ALLOWLIST=*`) once the first trainers have used it for a few weeks without
   blocking issues. This is the owner's call; it needs no new code.

### Phase 2: make trainers stay

S1 templates → S2 coach-this-session → S4 digest. Each is its own PR and is shippable alone. Push notifications for
routine changes go with the next native build.

### Iterating after launch

The owner expects to learn and change course. Keep it cheap:

- **Instrument from day one** (WP-13 events): invite sent / accepted, request sent / accepted, trainer edit, client
  workout, link ended + reason.
- **One "Send feedback" entry in Trainer tools.** It is a mail link, not in-app messaging, which stays out of scope.
- **Review monthly** against §8 and re-rank phase 2.

## 8. Success metrics

| Metric                                                | Target (first 8 weeks)               |
| ----------------------------------------------------- | ------------------------------------ |
| Invites accepted / sent                               | ≥ 70%                                |
| Client requests accepted / sent                       | ≥ 60%                                |
| Clients who finish a workout within 7 days of joining | ≥ 80%                                |
| Trainer routine edits per client per month            | ≥ 2 (the trainer is really using it) |
| Coached clients active in week 8 vs non-coached users | Clearly higher; this is the thesis   |
| Trainers still active after 4 weeks                   | ≥ 60%                                |
| Clients per active trainer                            | median ≥ 5                           |

## 9. Terms

The canonical definitions are in [GLOSSARY.md](../../GLOSSARY.md): **Trainer, Client, Coaching, Invite, Coaching
request**, and on the training side Workout, Workout type, Training style, Routine and My week.

- Code keeps `CoachingLink` for the coaching relationship. User-facing copy says "coaching" ("End coaching"), never
  "link".
- Avoid "coach" as a noun for a person. In code, `coach.*` is the Adaptive Chef nutrition review; trainer code is
  `coaching.*` and `trainer.*`.
