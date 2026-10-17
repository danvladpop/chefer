# Trainer coaching: DPIA addendum (WP-18)

**Draft for counsel review · prepared 2026-10-04 · extends [`docs/friends/dpia.md`](../friends/dpia.md) with the same headings**

| Field               | Value                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | **Draft for counsel review.** Not approved. Nothing here is legal advice. The flag stays off, and the allowlists stay the only way in, until counsel has answered section 12 and the policy text is live.                                               |
| Controller          | Pop Dan-Vlad, an individual based in Romania (the owner of Chefer), for the platform. The **trainer** is an independent controller for their own coaching relationship and private notes (section 2.5; counsel to confirm).                             |
| Processing assessed | **Trainer coaching (1:1)**: an optional, invite-only feature of the web and mobile apps. A trainer coaches individual clients: edits the client's routine, leaves notes on exercises, sets next-session weights, sees completed workouts and adherence. |
| Assessed against    | [`spec.md`](./spec.md) (revised 2026-10-04, owner's 1:1 model) and the Phase 1 build ([`phase-1-plan.md`](./phase-1-plan.md)); code under `apps/api/src/application/coaching/`.                                                                         |
| Builds on           | [`docs/friends/dpia.md`](../friends/dpia.md): the platform facts (hosting, processors, security, rights handling) are the same and are not repeated. Only what coaching changes is assessed here.                                                       |

## 1. Why a DPIA

Training logs, a routine built around an injury return, and a trainer's tailoring knowledge can reveal health
information. Coaching is the first feature in which a **named person** can read a client's workouts and **change** the
client's own data, and the first where a third party (the trainer) keeps free-text notes about a client inside the
product. Several indicators of "likely high risk" apply together (special-category-adjacent data, possibly vulnerable
people such as someone coming back from an injury, a new use of existing data). It is assessed before the flag goes
beyond the allowlists. **Owner decision (2026-10-04): the app stores no client health data**; the design below keeps
to that.

## 2. Description of the processing (Art. 35(7)(a))

### 2.1 Nature

| Operation           | What happens                                                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trainer opt-in      | An allowlisted user turns trainer tools on with a display name (word-filtered). No other data is collected about the trainer.                                                                                                                |
| Invite              | The trainer creates a single-use link (10-character random code, 14 days, revocable) with an optional private label.                                                                                                                         |
| Join and consent    | The client opens the link, signs in, finishes gym setup if needed and sees one consent screen (shared text, `COACHING_COPY`). "Allow and join" creates the link and writes a consent event with the link as context. One trainer at a time.  |
| Reading             | The trainer sees the client's **active routine**, **completed workouts** (exercises, sets, weights, reps, last-set effort, dates) from 28 days before joining, and **adherence** (trained or missed on planned days; pause **dates** only).  |
| Editing             | The trainer edits the client's active routine (curated exercises only), adds a short note per exercise (max 200 characters, visible to the client) and sets next-session weights and reps. The client sees "Changed by Ana" on what changed. |
| Private note        | The trainer keeps one free-text note per client (max 4000 characters) that only the trainer can read.                                                                                                                                        |
| Ending              | The client leaves (instant), or the trainer removes the client or turns tools off. Access stops on the trainer's very next request. The client keeps the routine, the exercise notes and any pending target.                                 |
| Export and deletion | `user.exportData` gains a `coaching` section. Account deletion of either side cascades the coaching rows; edit stamps pointing at a deleted trainer read "your trainer".                                                                     |

### 2.2 Scope: data categories and data subjects

**Data subjects:** clients (adults who chose to join; the app's 16+ age gate applies) and trainers (allowlisted adults).

| Category (stored)                                             | Whose   | Visible to the trainer?                                       | Notes                                                                 |
| ------------------------------------------------------------- | ------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Active routine (days, exercises, sets, reps, rest, supersets) | Client  | Yes, read and edit                                            | The routine stays the client's data                                   |
| Completed workouts (sets, weights, reps, last-set effort)     | Client  | Yes, from 28 days before joining                              | Derived live, nothing copied to the trainer                           |
| Adherence (sessions against the weekly goal, planned days)    | Client  | Yes                                                           | Computed from dates                                                   |
| Pause dates                                                   | Client  | Yes, dates only                                               | `TrainingPause.reason` is never read by a trainer response            |
| Display names (trainer's chosen name, client's name)          | Both    | Each side sees the other's name                               | The trainer's display name is word-filtered                           |
| Exercise notes by the trainer                                 | Trainer | Yes (author) and the client                                   | Coaching cues, max 200 characters; the client can remove, not rewrite |
| Private note about a client                                   | Trainer | Only the trainer                                              | Opaque free text, see 2.5 and section 5                               |
| Edit stamps (who, when) on rows and routines                  | Both    | Client's changes after joining; the client sees the trainer's | `lastEditedById` / `lastEditedAt`, no change history is kept          |
| Next-session targets (weight, reps, who set them)             | Client  | Yes                                                           | The existing override mechanism                                       |
| Links, invites, consent events                                | Both    | The trainer sees their own invites and clients                | Consent events live on the client's log, with the link as context     |

**Excluded on purpose (never in any trainer response; asserted on the JSON in tests):** food, meals, body weight or
measurements, nutrition targets, the client's notes on workouts and on routine exercises, heart rate, calorie
estimates, pause reasons, age and profile, in-progress or discarded sessions, and anything derived from body
weight. **No fields, enums or tags** exist for injuries, conditions, limitations, age or medical history, and nothing
is inferred.

### 2.3 Context

A friend-of-a-friend beta: the trainer is the owner's family's own trainer, plus one or two clients, behind
`TRAINER_ALLOWLIST` and `COACHING_ALLOWLIST`. The relationship exists outside the app (WhatsApp stays the channel:
there is **no in-app communication of any kind**). Clients can be coerced by a trainer they pay in real life; the design
answers that with an instant, one-tap leave that keeps the routine.

### 2.4 Purposes

Let a trainer keep an individual client's program right for that client, and let the client see what changed. No
marketing, no profiling, no analytics on the content, no AI of any kind.

### 2.5 Roles, recipients and technical setup

- **Chefer (the owner) is controller for the platform** (the routine, workouts, consent log, security, deletion).
- **The trainer is an independent controller** for their coaching relationship and for their **private notes**; the
  trainer clause in the terms says so, and says not to record health details in notes. Whether Chefer is instead a
  processor for the notes is question Q-7 (section 12).
- **Recipients:** only the linked trainer, per request. No sharing with other trainers, gyms or third parties. No AI
  provider receives any coaching data; private notes are never parsed, searched, logged or sent anywhere.
- **Technical:** the same hosting and processors as the rest of the app. Authorization is one service
  (`CoachingAccessService`), checked per request from the `ACTIVE` link with no cache; every denial is one
  uniform "not found" so a trainer cannot probe who is somebody's client. Responses are built from allow-lists.

## 3. Lawful basis (Art. 6, Art. 9)

**Explicit consent** (Art. 9(2)(a) with 6(1)(a)), because routines and workouts can reveal health (an injury-return
program), as with Following's workout sharing. Given on the consent screen; one `COACHING_SHARING` event per grant and
per end, with the link id and the privacy-policy version. Withdrawal is one tap (**Leave**) and immediate. The consent
text is shared code, so web and mobile say exactly the same. The privacy policy "Coaching" section and a short trainer
clause in the terms must be live **before** the flag is turned on for anyone outside the allowlists, and
`LEGAL_VERSIONS.privacy` bumped (owner action).

## 4. Necessity and proportionality (Art. 35(7)(b))

- **Minimisation:** active routine only; completed workouts from 28 days before joining (Q-2); reads are derived live
  and nothing is copied to the trainer; one trainer at a time; no chat, comments, groups or classes; no food, body
  data or targets in this version.
- **Purpose limitation:** the routine is edited through the same version-checked save the client uses; the trainer never
  writes sessions, profile, pauses or the rotation pointer.
- **Transparency:** the consent screen lists what is seen, what can be done and what is never seen; the client sees who
  changed what; "Your trainer" shows the relationship and the way out.
- **Accuracy and integrity:** two editors, one routine: edits are version-checked and a conflict is explicit ("Ana
  changed this routine while you were editing"). Stamps attribute each change; a running workout keeps its own snapshot.
- **Alternatives considered:** sharing food and body data (rejected by the owner); a change log (deferred: it would be a second
  store of the client's training history with its own retention); chat (WhatsApp stays the channel).

## 5. Special-category data (Art. 9)

The app does not collect health data for coaching. Two residual routes to special-category content remain:
(a) the **workouts and routine themselves** (an injury-return program), covered by explicit consent; and (b) the
trainer's **private note** and exercise notes, where a trainer could type health details. Mitigations: the private note is
**opaque** to the app (not parsed, searched, word-filtered, logged, put in analytics, sent to AI or returned to the
client; the router input is not logged, a failed write is rethrown without its cause, and error reporting drops the
request body); the trainer clause in the terms forbids recording health details; the copy never invites it; and the
client's export excludes the notes about them by default (Q-7).

## 6. Risks to the rights and freedoms of individuals, and measures (Art. 35(7)(c), (d))

| #   | Risk                                                         | Likelihood | Severity | Measure                                                                                                                                                     | Residual |
| --- | ------------------------------------------------------------ | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R1  | A forwarded invite lets the wrong person become the "client" | Low        | Medium   | Single use, 14-day expiry, revocable; the client must consent on the consent screen anyway; the trainer sees who joined and can remove them                 | Low      |
| R2  | A trainer reads or edits a client who left                   | Low        | High     | Access decided from the `ACTIVE` link per request, no cache; leave/remove/off end it in one transaction; access matrix tested for every procedure           | Low      |
| R3  | A trainer probes who is somebody's client                    | Low        | Medium   | One uniform "not found" for every denial; rate limits on preview and join; random 10-character codes                                                        | Low      |
| R4  | A trainer writes health details in a note                    | Medium     | Medium   | Opaque storage, trainer clause, no prompts; deleted 30 days after the link ends; not in the client's export by default                                      | Medium   |
| R5  | Coercion: a client feels unable to leave                     | Low        | Medium   | Leave is one tap, instant, keeps the routine; the trainer can never block it                                                                                | Low      |
| R6  | A trainer's edit harms a client (an unsuitable program)      | Low        | Medium   | The client sees every change and can edit or ignore it; the exercises come from the curated library; the trainer is responsible for their advice (terms)    | Medium   |
| R7  | An old app mis-renders or exposes trainer data               | Low        | Low      | Every new field is gated on API level >= 6 and stripped below it; consent rows hidden from old apps; contract tests assert no new keys at level 4           | Low      |
| R8  | Data stays after it should be gone                           | Low        | Medium   | Retention worker (section 7); account deletion cascades; edit stamps degrade to "your trainer"                                                              | Low      |
| R9  | A trainer sees more than the consent screen says             | Low        | High     | Allow-list mappers with a deep key-set test from fully populated rows; excluded fields asserted absent; workouts and adherence start 28 days before joining | Low      |

### Residual risk summary

Low overall, with two residual mediums (R4, R6) that rest on the trainer's conduct and are handled by the trainer clause
in the terms and the client's ability to leave. The beta is allowlisted to a handful of known people.

## 7. Retention (Art. 5(1)(e))

Recommended defaults, kept as named constants (`COACHING_RETENTION` in `@chefer/types`) and enforced by the daily
maintenance worker. **Counsel must confirm these** (Q-6).

| Data                                       | Kept                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Active links                               | While active                                                                                          |
| Ended links                                | 24 months (disputes), then deleted                                                                    |
| Invites                                    | Deleted 30 days after they expire (used and revoked ones too)                                         |
| Private notes                              | Hidden when the link ends; deleted 30 days later; restored if the same pair links again               |
| Consent events                             | With the account (the log is the evidence of consent)                                                 |
| Edit stamps and trainer notes on exercises | With the client's routine (the client's data)                                                         |
| Trainer profile                            | Kept after tools are turned off (so old "Changed by Ana" stamps still read); deleted with the account |

## 8. Data subject rights (Arts. 12 to 22)

- **Access and portability:** the client's export (`user.exportData`) includes the routine (with the trainer's exercise
  notes and stamps), workouts, targets and a `coaching` section (their trainers and dates, consent events). The trainer's
  export has their clients (display names and dates), invites and their own private notes. The trainer's notes **about**
  a client are **not** in the client's export by default (`COACHING_RETENTION.clientExportIncludesTrainerNotes`,
  Q-7).
- **Erasure:** account deletion cascades the coaching rows on both sides. The client can also clear any trainer note on an
  exercise.
- **Withdrawal of consent:** **Leave**, one tap, immediate; logged as a consent event.
- **Rectification and objection:** the client edits their routine and notes directly; the trainer edits their own
  notes. Complaints go to the support address in the privacy policy.

## 9. Consultation (Art. 35(2), (9) and Art. 36)

No data subjects have been consulted yet. The validation interview with the trainer ([`interview-kit.md`](./interview-kit.md))
is a product interview, not a consultation. A prior consultation under Art. 36 is not expected given the residual risk,
subject to counsel.

## 10. Monitoring and review

Review this addendum before the flag goes beyond the allowlists, after the 4-week beta, and whenever a later slice is
added (food or body-data sharing, trainer-made exercises, payments, a change log, chat). Any such slice is a new
assessment, not an edit to this one.

## 11. Approval

Not approved. Sign-off (owner, and counsel if engaged) goes here.

## 12. Questions for counsel

1. **Roles (Q-7):** is the trainer an independent controller for the coaching relationship and the private notes, with
   Chefer a processor for the notes' storage? Does a client's access request cover the trainer's notes about them?
   (Default now: trainer is controller, not included in the client's export.)
2. **Retention (Q-6):** are 24 months for ended links (disputes), 30 days for hidden private notes and 30 days after
   expiry for invites acceptable and sufficient?
3. **Consent text:** is the consent screen (what the trainer sees, can do and never sees) specific enough for Art. 9(2)(a)
   for workouts and a routine that may reflect an injury return?
4. **Terms:** wording of the trainer clause (no health details in notes; the trainer's responsibility for their advice and for
   being the controller of their notes).
5. **Window (Q-2):** is showing workouts from 28 days before joining proportionate, or should it be from joining only?
6. **Beta scope:** is an allowlisted, invite-only beta with a known trainer acceptable before the privacy policy
   "Coaching" section is published, or must the section be live first? (The plan assumes live first for anyone outside
   the allowlists.)
