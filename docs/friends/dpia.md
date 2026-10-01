# Following: data protection impact assessment (DPIA)

**Draft for counsel review · prepared 2026-10-01 · GDPR Art. 35 style**

| Field               | Value                                                                                                                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | **Draft for counsel review.** Not yet approved. No sign-off has been given (section 11).                                                                                                                                                                                         |
| Controller          | Pop Dan-Vlad, an individual based in Romania (the owner of Chefer). There is no data protection officer; the privacy policy gives the support email as the contact.                                                                                                              |
| Processing assessed | **Following**: an optional, opt-in feature of the Chefer mobile app (iOS and Android) that lets users follow each other and see what each person chooses to share. Internal code name `friends`.                                                                                 |
| Assessed against    | `master` + the Following program as designed in [`prd.md`](./prd.md) (rev 2, 2026-09-30) and [`implementation-plan.md`](./implementation-plan.md), with the moderation and export code on the `integrate/following` branch at 2026-10-01. Re-check when the launch build is cut. |
| Companion documents | [`legal-drafts.md`](./legal-drafts.md) (privacy policy and terms text, apply-at-launch steps) · `docs/app-store/**` "At Following launch" sections · `infrastructure.md` §15 (existing privacy evidence).                                                                        |
| Not legal advice    | Drafted without a lawyer, like the live policy. Section 12 lists what counsel should decide.                                                                                                                                                                                     |

## 1. Why a DPIA

Chefer holds health-related data (body metrics, allergies, calorie targets, logged meals, workouts). Following is
the first feature that shows any of it to **other people**. It also adds search by name, a social graph and
automatic moderation of user content. Several indicators of "likely high risk" (Art. 35(1), (3) and the supervisory
authorities' criteria) apply together: sensitive or special-category data (Art. 9), data about possibly vulnerable
people (people who track calories for a medical reason; anyone under 16 who joined despite the age gate), a new use
of existing data (disclosure to third parties inside the product), and automated decisions about content and
accounts. A DPIA is therefore done **before launch**, whether or not counsel concludes it is mandatory. The same
document is the evidence for privacy by design and by default (Art. 25).

## 2. Description of the processing (Art. 35(7)(a))

### 2.1 Nature

| Operation                 | What happens                                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opt-in                    | The user opens More → Following, reads an intro screen, confirms first and last name, picks Private (default) or Public and taps `Turn on Following`. This creates a social profile and logs a consent event (`SOCIAL_SHARING`). |
| Discovery                 | Search by name only (word-prefix, accent- and case-insensitive); a "Suggested for you" list based on mutual follows, people who follow the user, and popular public profiles (including the seeded "Chefer Kitchen").            |
| Follow graph              | A follower sees a followed person's shared content. Public: follow takes effect at once. Private: a request the owner accepts or declines.                                                                                       |
| Display to followers      | Per-section: the current week's meal plan with calories and macros, own recipes (written or imported, with source domain), active routine, workouts completed in the last 7 days; daily targets only if switched on.             |
| Recipe actions by viewers | A viewer can heart a recipe (a live reference) or add it to their own week (a private copy owned by the viewer).                                                                                                                 |
| In-app activity           | Three events only (follow request, new follower, request accepted) in an Activity list with a badge. Nothing is delivered outside the app.                                                                                       |
| Safety                    | Block (instant, mutual), report (also blocks), automatic thresholds, a word filter, an append-only moderation log and an optional ops undo (PRD §9).                                                                             |
| Leaving                   | `Turn off Following` deletes the social data immediately (FD-14). Account deletion cascades.                                                                                                                                     |
| Export                    | `user.exportData` gains a `social` section (settings, lists, requests, blocks made, Activity, reports the user filed, recipe copies, consent events).                                                                            |

### 2.2 Scope: data categories and data subjects

**Data subjects:** Chefer users aged 16 or over who turn Following on ("members"); all other signed-in users, who see
a member's header only; reported people; reporters. Following introduces **no data about non-users**: household
members the owner added to their account, and any other third party, are never shown.

| Category                   | Examples                                                                                   | Visible to whom                                                   | Special category?                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Identity (header)          | First and last name, initials avatar, follower and following **counts**, `Follows you` tag | Any signed-in user who has turned on Following, unless blocked    | No                                                                                      |
| Meal plan                  | Meals, portions, calories and macros per meal, day totals, week average                    | Accepted followers, if `Meal plan` is on                          | **Health-adjacent.** Can reveal diet, a medical diet or an eating pattern (Art. 9 risk) |
| Daily targets              | Calorie and macro targets                                                                  | Accepted followers, only if switched on (default off)             | **Health-adjacent**, more directly                                                      |
| Recipes                    | Name, text, ingredients, nutrition, photo, source domain and link (imported)               | Accepted followers, if `My recipes` is on                         | Mostly no; may reveal dietary restrictions by pattern                                   |
| Routine and workouts       | Routine, exercises, sets, reps, weights, duration, last 7 days                             | Accepted followers, if `Workouts` is on                           | **Health-adjacent** (fitness level, health pattern)                                     |
| Social graph               | Who follows whom, requests, blocks made, suggestion dismissals                             | Each side sees its own relations; counts are public in the header | No, but sensitive to context (who someone follows)                                      |
| Activity items             | Request, new follower, request accepted                                                    | The recipient only                                                | No                                                                                      |
| Reports and moderation log | Reporter, target, recipe, reason, eligibility, action, number of reporters, actor          | The owner of Chefer only (no review UI)                           | No; may include allegations about a person                                              |
| Consent events             | `SOCIAL_SHARING` granted or withdrawn, version, source                                     | The user (export, consent history)                                | No                                                                                      |

**Never shared (PRD §7.2):** email address; allergies, diets, dislikes and safety checks; household members; body
metrics, weight log and goal; logged meals and snap-to-log photos; budget, shopping list and pantry; AI chat and
coach reviews; workout and exercise notes, heart rate and deload flags; other weeks and templates; consent and
privacy settings; workouts older than 7 days.

**Volume:** the user base is small (an independently run app). Only members' data enters the feature, and only for
members who opted in. Existing users are unaffected by launch (FD-3).

### 2.3 Context

- Users are 16 or over by the terms and age gate; age is **self-declared** (no verification).
- Users reasonably expect a private planner (they signed up for one). That is why Following is off until chosen,
  private by default, and why existing users see nothing change.
- Expected sharing: friends, family, training partners, clients of a trainer. Some members will be Public.
- The app is mobile-only for this feature. There are no public web pages: profiles are visible only to signed-in
  users who have Following on.
- No messaging, comments, likes, feeds or profile photos, which removes several classic harms.

### 2.4 Purposes

1. Let users share a week of meals, recipes and workouts with people they choose, and cook and train together.
2. Let users find people they know by name.
3. Keep the feature safe without a human review queue (the owner will not run one, Q-F-13) and meet App Store
   Guideline 1.2 and Google Play's user-generated content policy.

### 2.5 Roles, recipients and technical setup

| Role                 | Who                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controller           | The owner, for all Following processing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Processors           | **No new processor.** Oracle Cloud Infrastructure (Frankfurt, EU) hosts the API and database, as for the rest of Chefer. Expo delivers the app code and sees no account data. No AI provider is used for Following. No new international transfer.                                                                                                                                                                                                                                                                                                                                                    |
| Recipients           | **Other users** who are allowed to see a member's content (section 2.2). They are separate from the controller and decide for themselves what to do with what they see (for example a screenshot).                                                                                                                                                                                                                                                                                                                                                                                                    |
| Analytics            | Events hold counts and fixed labels only: no other user's id, name or search text. Search queries are never logged. Existing anonymous or opt-in analytics rules apply.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Technical safeguards | One server-side access resolver and middleware for every procedure that returns another user's data; allow-list response objects, built field by field (INV-1, INV-2); the same "not found" answer for a blocked, absent or not-activated user, so the API leaks no existence (INV-3); reads never write to the owner's rows (INV-4); no email is returned or searched (INV-6); other users' gym data is never persisted to the device's offline cache (INV-7); additive API only, so installed apps stay safe (INV-8); every automatic moderation action is logged in the same transaction (INV-10). |

## 3. Lawful basis (Art. 6, Art. 9)

| Processing                                                            | Basis                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creating a social profile; showing the header; search; suggestions    | **Consent** (Art. 6(1)(a)), given by turning on Following. Withdrawn by turning it off.                                                                                                                                                                                                                                                                    |
| Showing meal plan, workouts, routine and targets to followers         | **Explicit consent** (Art. 9(2)(a), with Art. 6(1)(a)): asked at turn-on; again when switching to Public; again, specifically, for daily targets. Each section has its own switch. Withdrawal is immediate (a switch, or `Turn off Following`).                                                                                                            |
| Showing recipes to followers                                          | Consent (Art. 6(1)(a)); a switch per section.                                                                                                                                                                                                                                                                                                              |
| Activity items; follow lifecycle                                      | Performance of the service the member asked for (Art. 6(1)(b)), within the consent above.                                                                                                                                                                                                                                                                  |
| Reports, the moderation log, the word filter, retention after leaving | **Legitimate interest** (Art. 6(1)(f)): keeping a feature that shows user content to other people safe, preventing abuse and evasion of moderation. Draft balancing: the data is minimal, the interest is strong (including App Store and Play requirements), the person is told in the policy and terms, and can object by email. **Counsel to confirm.** |
| Reporters' data                                                       | Same legitimate interest. The reporter's identity is never shown to the reported person.                                                                                                                                                                                                                                                                   |

Consent records (`SOCIAL_SHARING`, with the privacy-policy version, source and time) are logged and appear in the
export and the consent history. The version recorded is `LEGAL_VERSIONS.privacy`, which is why the policy text must be
live and the version bumped **before** the feature is turned on (`legal-drafts.md` section 3).

## 4. Necessity and proportionality (Art. 35(7)(b))

**Purpose limitation.** Data is used to show a member's content to the people they chose, and to keep that safe. It
is not used for advertising, profiling for third parties, or anything else.

**Data minimisation.** The feature shows the least that works. What is **not** shared is in section 2.2. The main
design choices that reduce data:

- followers see the plan the member would see, **not the reasons behind it** (no allergies, diets, safety checks,
  body metrics, logged meals, household, budget or pantry): PRD FD-8;
- **current week only** for the meal plan (Q-F-12) and **last 7 days only** for workouts (FD-15); no paging into
  history;
- **no daily targets** unless the member switches them on (default off);
- **no workout or exercise notes**, no heart rate, no warm-up sets, no in-progress sessions;
- **non-followers see the header only**, even for a Public profile (Q-F-4); follower and following **lists** are
  not visible to others;
- **no email address** anywhere in the feature (INV-6) and **no search by email** (Q-F-5), which also removes
  email enumeration;
- **no profile photos** (avatars are initials), no bio, no handles, no contact-book import;
- **no push and no outside notifications**: Activity is in-app only (Q-F-14).

**Privacy by default (Art. 25).** Following is off for everyone until they turn it on (FD-3), Private is
preselected (FD-2), sharing sections default on only inside an explicit opt-in screen, and targets default off.
Going Public needs a confirmation that says exactly what changes.

**Accuracy.** Members enter their own names and content. Names are editable. Shared nutrition values are the
member's own plan, and are labelled as estimates by the app as elsewhere.

**Storage limitation.** Section 7.

**Transparency.** The intro screen, the updated privacy policy and terms (drafted in `legal-drafts.md`), the
Activity list, and in-app messages to a member whose recipe is hidden or whose account is restricted.

**Rights.** Section 8.

**Processors and transfers.** None added (section 2.5).

**Alternatives considered and rejected.** (a) Public-by-default profiles: rejected, because most users signed up for a
private planner. (b) Search by email or contact import: rejected (enumeration, new permission, new App Privacy data
type). (c) A human moderation queue: rejected by the owner (cost); replaced by instant block, automatic thresholds
and a word filter. (d) Full workout and plan history: rejected (minimisation). (e) Push notifications: out of scope.

## 5. Special-category data (Art. 9)

Meal plans with calories and macros, routines and workouts, and targets can reveal health conditions or
characteristics: a diabetic or low-sodium plan, a very low calorie plan that may indicate an eating disorder, an
injury-return programme, pregnancy-related eating, a body-composition goal. The assessment treats this as
**special-category data when it can be linked to a person, because it is displayed with a name**. Measures:

1. **Opt-in, not opt-out.** Nothing is shown until the user turns Following on (FD-3).
2. **Private by default.** The user chooses each follower (FD-2). Choosing Public needs a confirmation.
3. **Explicit, granular consent** (Art. 9(2)(a)): the intro names what is shared and what is never shared; each
   section has a switch; targets need their own confirmation; every grant and withdrawal is a logged
   `SOCIAL_SHARING` event.
4. **The most revealing data stays out:** allergies, diets, medical-style fields, weight and body metrics, logged
   meals and notes are never shown (PRD §7.2). The existing health-information consent for storing them is unchanged
   and separate.
5. **Withdrawal is as easy as consent** (Art. 7(3)): a switch per section or `Turn off Following`, effective at once
   (FD-14, access decisions are not cached across requests, FR-03.4).
6. **No profiling use.** Suggestions use the follow graph and popularity only, never health data.

## 6. Risks to the rights and freedoms of individuals, and measures (Art. 35(7)(c), (d))

Likelihood (L) and severity (S): Low / Medium / High, **before** and **after** the measures.

| #   | Risk                                                                                                                                 | L, S before | Measures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | L, S after |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| R1  | **Stalking or harassment** by a person who finds or follows someone                                                                  | M, H        | Private by default and per-follower approval; header-only for non-followers; instant mutual **block** with no notice to the blocked person; **report also blocks**; remove follower; follow-request cap (3 per person per 7 days, 60 follow actions per hour); block cap; no messaging, so no unwanted contact channel; requests expire after 90 days; automatic force-private at 5 reporters.                                                                                                 | L, M       |
| R2  | **Discovery and enumeration of users**; scraping the member base or their data                                                       | M, M        | Search by name only (no email, no phone, no contact import); minimum 2 characters; search limited to 60 per minute; results only for signed-in users who turned Following on; blocked, absent and not-activated users are indistinguishable (the same "not found"); non-followers see the header only; follower lists are not exposed; terms forbid scraping and automated access; allow-list response objects.                                                                                | L, M       |
| R3  | **Exposure of diet or fitness data (Art. 9)** to the wrong people; an authorization bug that leaks a private plan or targets         | M, H        | One server-side access resolver and middleware; no client-side checks; response objects built field by field with a test that asserts the exact key set (no email, allergies, notes, targets unless allowed); access-matrix tests; read-only reads; a dedicated adversarial security review before launch (F3.1) with zero open criticals as a launch condition; kill switch (`friends` off stops all disclosure at once).                                                                     | L, H       |
| R4  | **Followers re-disclose** what they see (screenshots, talking)                                                                       | M, M        | Cannot be prevented technically. Mitigations: the policy and terms say so plainly; Private by default; the user chooses followers; Public needs a confirmation; remove follower and block exist; the shown data is limited (7 days, current week).                                                                                                                                                                                                                                             | M, M       |
| R5  | **Minors**: a person under 16 uses Following (age is self-declared)                                                                  | L–M, H      | 16+ age gate at sign-up, logged; Private by default; no messaging; header-only for non-followers; report and block; policy: delete a child's account on notice; no age-targeted features. **Residual risk accepted** unless counsel requires age assurance.                                                                                                                                                                                                                                    | L, M       |
| R6  | **Moderation errors**: legitimate content hidden or an account restricted by brigading or false reports; word-filter false positives | M, M        | Only distinct accounts count; reporters must be 24 h old with a confirmed email; thresholds are constants (3 and 5) in one place; owner is told in-app and keeps existing followers; hearts and copies keep working; whole-word, normalised matching with a test list for "Scunthorpe"-type false positives; filter rejection says what to do; every automatic action is **logged**; **ops undo** discounts the reports behind an action and restores the content; terms forbid false reports. | L, M       |
| R7  | **Automated decision-making (Art. 22)**: hiding content or restricting an account with no human involved                             | M, L–M      | The effects are limited (content hidden from followers, account made Private and removed from search; the account still works and nobody is banned); the owner is told in the app, next to an **appeal link** that opens an email to the support address (owner decision 2026-10-01), and the owner can reverse an action with the ops undo. The appeal is a human-read email route, not an in-app flow.                                                                                       | L, M       |
| R8  | **Reporter identity exposed**, or retaliation                                                                                        | L, M        | The reported person is never told who reported; the report has no free text; a report also blocks, so there is no contact; reports are visible only in the database to the owner; reports about a person are not in their export (section 8).                                                                                                                                                                                                                                                  | L, L       |
| R9  | **Impersonation**: someone uses another person's name                                                                                | M, M        | Report reason "Spam or fake account"; word filter on names; no email address is shown, so nothing in the profile can be passed off as someone else's contact detail; names are not verified (Chefer has no ID check), which is a **known gap**.                                                                                                                                                                                                                                                | M, M       |
| R10 | **Retention of reports and the moderation log** about people who leave (to prevent evasion) is excessive or lasts forever            | M, M        | Kept so leaving and rejoining cannot reset moderation (FD-14); contain no free text; deleted when the account is deleted; **deleted after 24 months** by the maintenance worker (a log row explaining an action still in effect stays until it is lifted). Section 7.                                                                                                                                                                                                                          | L, L       |
| R11 | **Recipe content**: another person's copyright or personal data in a shared recipe                                                   | L, M        | Terms put responsibility on the sharer and give a notice route; imported recipes show their source with a link; report reason "Something else"; automatic hide at 3 reports. Not a data-protection risk in itself.                                                                                                                                                                                                                                                                             | L, L       |
| R12 | **Another user's data stored on a device or in a cache** after access ends                                                           | M, M        | Friend data lives in its own query namespace and is never written to the offline gym cache (INV-7), with a test; access is re-checked on every request.                                                                                                                                                                                                                                                                                                                                        | L, L       |
| R13 | **Consent validity**: consent not informed, bundled or too easy to give without reading                                              | M, M        | A dedicated intro screen that lists what is shared and what is never shared; Private preselected; separate confirmations for Public and for targets; not bundled with sign-up or any other consent; withdrawal is one switch; the policy section "Following and what others can see".                                                                                                                                                                                                          | L, M       |
| R14 | **Group effects on non-members**: a member's recipe or plan mentions other people (for example "Mum's recipe")                       | L, L        | Household members and their data are never shown; free text in recipe names is subject to the word filter and reporting. Low risk.                                                                                                                                                                                                                                                                                                                                                             | L, L       |
| R15 | **Severity of a breach increases**: the database now holds a social graph on top of health-related data                              | L, H        | Existing security measures (HTTPS, hashed passwords, restricted server access, daily backups, EU hosting). Following adds no new store. The breach commitment in the privacy policy ("Security") applies.                                                                                                                                                                                                                                                                                      | L, H       |
| R16 | **Over-the-air release** puts a user-content feature into installed apps before store metadata is updated                            | M, L        | The feature ships dark behind a flag and an allow-list; metadata, age rating, review notes and demo accounts are prepared first (`docs/app-store/**` "At Following launch"); a kill switch exists.                                                                                                                                                                                                                                                                                             | L, L       |

### Residual risk summary

After the measures, no risk is rated high in both likelihood and severity. Three remain **Medium** and need an
explicit owner or counsel decision:

1. **R4 and R9**: re-disclosure by followers and unverified names cannot be solved technically.
2. **R5**: under-16 users rely on a self-declared age.
3. ~~**R10**: the retention period of reports and the log is undefined.~~ Decided: 24 months (section 7).

R3 is **High severity**, low likelihood: its acceptance depends on the security review (F3.1) closing with no open
critical findings.

## 7. Retention (Art. 5(1)(e))

| Data                                                           | Retained                                                                                                                                                                                                              | Deleted by                                                                                                                                                          | Source                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Social profile (visibility, sharing switches, activation time) | While Following is on                                                                                                                                                                                                 | `Turn off Following` (immediate); account deletion (cascade)                                                                                                        | FD-14; `SocialProfile` cascade       |
| Follows (accepted) both ways                                   | While Following is on and until unfollow or removal                                                                                                                                                                   | Unfollow, remove follower, block, turn off, account deletion                                                                                                        | FD-14; `Follow`                      |
| Follow requests (pending)                                      | Up to **90 days**                                                                                                                                                                                                     | Expiry by the maintenance worker; decline; cancel; accept (becomes a follow); turn off; account deletion                                                            | FR-07; `FRIENDS_LIMITS`              |
| Blocks the user made                                           | Until unblocked                                                                                                                                                                                                       | Unblock; turn off; account deletion                                                                                                                                 | FD-14; `Block`                       |
| Suggestion dismissals                                          | Up to **90 days**                                                                                                                                                                                                     | Pruned by the maintenance worker; turn off; account deletion                                                                                                        | `FRIENDS_LIMITS.dismissalDays`       |
| Activity items                                                 | Up to **90 days**                                                                                                                                                                                                     | Pruned by the maintenance worker; withdrawn when a request is answered or cancelled; turn off; account deletion                                                     | FR-20; `activityRetentionDays`       |
| Hearts (recipe references)                                     | While the viewer can see the recipe; the row survives loss of access and returns with access                                                                                                                          | Deleted when the recipe or its owner's account is deleted. If the owner turns Following off or switches recipe sharing off, hearts stop showing but the rows remain | FR-17.3                              |
| Recipe copies made by viewers                                  | Until the viewer deletes them or their account                                                                                                                                                                        | The viewer. A copy is **not** deleted when the original's owner turns Following off or leaves; the link to the origin is nulled                                     | PRD §13, FD-14                       |
| Reports (`UserReport`)                                         | Up to **24 months**. Kept after the target turns Following off. Hold: reporter, target, optional recipe id, reason, eligibility, time                                                                                 | Pruned by the maintenance worker after 24 months; deleted earlier when the reporter's **or** the target's account is deleted (cascade)                              | `MODERATION.RECORD_RETENTION_MONTHS` |
| Moderation log (`ModerationLog`)                               | Up to **24 months**, or longer while the action a row explains is still in effect (a recipe still hidden, an account still forced private). Hold: action, target, recipe id, reason, number of reporters, actor, time | Pruned by the maintenance worker; deleted earlier when the target's account is deleted (cascade)                                                                    | `MODERATION.RECORD_RETENTION_MONTHS` |
| Weekly moderation metrics line                                 | Server logs, per the operator's log retention                                                                                                                                                                         | Counts only; no personal data                                                                                                                                       | PRD §9.5                             |
| `SOCIAL_SHARING` consent events                                | As the rest of the consent log (kept with the account; the withdrawal is a new row)                                                                                                                                   | Account deletion                                                                                                                                                    | PRD §14                              |
| Backups                                                        | The existing 14 daily backups on the server and a second copy of the last 30                                                                                                                                          | Expire as the privacy policy describes (about 30 days after deletion)                                                                                               | Privacy policy                       |

**Decided (owner, 2026-10-01):** reports and the log are kept for **24 months**. The maintenance worker deletes older
rows daily, except a log row that explains an action still in effect, which stays until the action is lifted (so the
owner can always be told why a restriction applies, and the ops undo still finds it).

## 8. Data subject rights (Arts. 12 to 22)

| Right                                         | How it is met                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Information (Arts. 13, 14)                    | The intro screen; the new privacy section "Following and what others can see"; the terms; the Activity list.                                                                                                                                                                                                                                                                                                                                                                      |
| Access and portability (15, 20)               | `user.exportData` adds a `social` section: settings, following, followers, pending requests both ways, blocks made, Activity, **reports the user filed**, recipe copies and where they came from, and consent events (display **names** only, never another user's email, id or profile). **Not included:** reports **about** the user and the moderation log. Rationale: they hold other users' acts and the integrity of abuse prevention (Art. 15(4)). **Counsel to confirm.** |
| Rectification (16)                            | The member edits first and last name (re-checked by the word filter); content is edited in the app.                                                                                                                                                                                                                                                                                                                                                                               |
| Erasure (17)                                  | `Turn off Following` removes the social data at once. Account deletion cascades from `User`: profile, follows, blocks, dismissals, Activity, reports (by and about), the log; the user's recipes disappear for others. Exception: **after turning off** (not after deleting the account), reports and the log are retained, on the legitimate-interest basis in section 3 (counsel to confirm that this fits Art. 17). Copies others made stay with them, unlinked.               |
| Restriction (18)                              | By email to the support address.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Objection (21)                                | For the processing based on legitimate interest (moderation): by email; the owner can reverse an action and discount reports.                                                                                                                                                                                                                                                                                                                                                     |
| Withdraw consent (7(3))                       | A switch per section, or `Turn off Following`, immediate and as easy as giving it. Does not affect earlier processing.                                                                                                                                                                                                                                                                                                                                                            |
| Not to be subject to automated decisions (22) | See R7. The decisions are limited and reversible; counsel to confirm whether a human-review route is required.                                                                                                                                                                                                                                                                                                                                                                    |
| Time and channel (12)                         | One month, by email to the address in the policy, from the account's email. Complaints to ANSPDCP, as the policy says.                                                                                                                                                                                                                                                                                                                                                            |

## 9. Consultation (Art. 35(2), (9) and Art. 36)

- **DPO:** none appointed. The owner is the contact.
- **Views of data subjects (Art. 35(9)):** not formally sought. Recommended before launch: an internal check with
  the allow-listed users on the intro screen's clarity.
- **Prior consultation of the authority (Art. 36):** needed only if a high residual risk cannot be reduced. None is
  expected, subject to counsel's view of R3, R5 and R7.

## 10. Monitoring and review

- **Before launch:** the F3.1 security review has no open critical findings; counsel has reviewed this document and
  the policy and terms drafts; the legal versions are bumped (`legal-drafts.md` section 3).
- **After launch:** the weekly moderation metrics line (reports, eligible reports, auto-hidden recipes, forced-private
  accounts, filter rejections, undos) is the monitoring evidence. Guardrails from PRD §15: reports under 1% of follow
  actions; word-filter rejections under 2% of shared-recipe saves; no rise in account deletions or health-consent
  withdrawals; **zero authorization incidents**.
- **Re-assess when:** push notifications, profile photos, messaging or comments, contact import, web, a third party
  integration, or any new data in the shared sections is added; when a threshold or the reporter-eligibility rule is
  changed; after any incident; at least once a year.

## 11. Approval

| Role               | Name | Decision | Date |
| ------------------ | ---- | -------- | ---- |
| Controller (owner) |      |          |      |
| Counsel            |      |          |      |

Measures to be approved: the opt-in and consent design (section 5); the retention proposal (section 7); the
position on R3, R5, R7, R9 and R10 (section 6); the export carve-out (section 8). **Not approved until signed.**

## 12. Questions for counsel

1. Is this DPIA mandatory, or voluntary good practice? Does it satisfy Art. 35(7)?
2. Is **consent** the right basis for the header and search, and is **legitimate interest** accepted for the
   moderation records (R10)? (Retention decided: 24 months.)
3. Is hiding a recipe or restricting an account "similarly significant" (Art. 22)? Is the email-and-reversal route
   an adequate safeguard in place of a formal appeal (R7)? (Decided: an email appeal route, linked in the app; a person
   reads every appeal.)
4. Is the export carve-out (reports about the user, the log) acceptable under Art. 15(4)?
5. Are other users "recipients" (independent) and not joint controllers? Does the controller carry any duty over what
   followers do with what they see (R4)?
6. Is a self-declared 16+ gate enough for a social feature (R5)?
7. Digital Services Act duties of a micro hosting provider: point of contact, notice and action, statements of
   reasons for restricting content, and any exemptions (see `legal-drafts.md` question 5).
8. Is naming the exact reporting thresholds (3 and 5) and the eligibility rule in the terms acceptable, given that
   it can help abusers game them?
9. Do the "At Following launch" store answers (no new data type; sharing with followers is not "sharing" for Play)
   reflect the platforms' definitions?
