# Spec · Trainer mode

|            |                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Status     | **Approved for build**: owner answered Q1–Q9 on 2026-10-18 (§3)                                                           |
| Source     | Owner doc "Trainer mode vs Private mode" (Google Doc, 2026-10-18)                                                         |
| Builds on  | Trainer coaching phase 1, live since 2026-10-18 (#170); invite links (#176); [trainer-coaching.md](./trainer-coaching.md) |
| Platforms  | Mobile (iOS + Android, one Expo codebase) and web                                                                         |
| Flag       | `trainerMode` (new). Push notifications ship separately with the next store build (M4)                                    |
| Milestones | M1 shells + Today + Clients + You · M2 Workouts (templates) · M3 Schedule + coach this session · M4 push (§13)            |
| Glossary   | New terms in §4, to be added to `GLOSSARY.md` in M1                                                                       |

---

## 1. Why

Trainer coaching phase 1 is live. Its tools sit **inside a client app**:

- they are a stack of pages behind You → Trainer tools;
- coaching requests show up **only** on the Trainer tools page;
- nothing alerts the trainer when a client asks for coaching: no badge on You and no push.

A trainer working the gym floor needs:

- **"who am I training today and when"**, which Chefer can't answer at all (there is no scheduling);
- **"give this workout to these clients"**, which today means re-typing (there are no templates);
- **"log this session while I'm with the client"**, which today means the client has to log mid-set.

**Goal.** A trainer switches Chefer into **trainer mode**, a second app shell built for coaching, with its own five
tabs:

- a day view of **who and when**;
- a **client list**;
- a **template library** they assign and tune per client;
- **logging a session on the client's behalf**.

They hear about anything needing them (requests, schedule changes) through badges now and push notifications from
the next store build.

**Non-goals (v1).**

- Payments, invoicing, packages and prices.
- In-app chat.
- Clients booking or rescheduling themselves.
- Google or Apple calendar sync, and `.ics` export.
- Public group classes.
- Trainer access to food, weight or calories.
- Any change to personal mode beyond §6.9.

## 2. Users and jobs

| Persona                    | Job                                                                                                | Where in this spec                  |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Trainer at the gym (phone) | "What's next, who's it with, what are we doing?" "Log Maria's sets while I spot her."              | Today, Schedule, coach this session |
| Trainer at a desk (web)    | "Build Lower body A once, give it to 8 clients, set each one's weights." "Plan next week's slots." | Workouts, Schedule                  |
| Trainer as a person        | "I also track my own food and training."                                                           | Mode switch, personal mode          |
| Client                     | "When's my next session with Ana? Did she change my plan?"                                         | §6.9, notifications                 |

## 3. Owner decisions (2026-10-18)

| #   | Decision                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Mobile and web.** Mobile gets a trainer tab bar; web gets **Trainer** as a third sidebar mode next to Food and Gym.                                                                                                                               |
| Q2  | Five tabs: **Schedule · Clients · Today · Workouts · You**. **Today sits in the middle and is the default**, the same as personal mode (Shop · Meals · Today · Train · You).                                                                        |
| Q3  | Switch from You ("Switch to trainer mode" and back). The app remembers the last mode per device and opens in it. Only active trainers see the switch. Each mode's You tab badges what is waiting in the other mode.                                 |
| Q4  | **Workouts = templates.** Assigning a template copies it into the client's routine, where the trainer tunes exercises and kg per client. Editing a template doesn't change clients unless the trainer explicitly chooses "Update for clients".      |
| Q5  | **Bookings**: date, time, duration, one or more clients, optional location, optional workout, optional weekly repeat. Plus **blocked time**. The trainer manages the calendar; clients only see their upcoming bookings. No external calendar sync. |
| Q6  | **Coach this session** is in scope. Starting a booking opens the logger on the trainer's phone and writes into the client's history as "Logged by Ana". In a group booking the trainer switches between clients.                                    |
| Q7  | **Real push**, held for the next store build. Per-event switches. Until then: in-app badges and a requests card on trainer Today.                                                                                                                   |
| Q8  | Dashboard: active clients, requests waiting, bookings this week (scheduled/done), average adherence, quiet clients, **sessions delivered this month per client**, next booking. No money.                                                           |
| Q9  | Milestones M1–M4 (§13). M1–M3 ship over the air behind `trainerMode`; M4 is held for the store build.                                                                                                                                               |

## 4. Concepts and terms

These are additions to `GLOSSARY.md`, made in M1. Existing terms (Workout, Routine, Trainer, Client, Coaching,
Invite, Coaching request) are unchanged.

| Term                  | Definition                                                                                                        | Avoid                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Personal mode**     | Chefer as it is for anyone: your own food and training.                                                           | Private mode, client mode     |
| **Trainer mode**      | The second app shell for coaching, available to active trainers.                                                  | Coach mode, pro mode          |
| **Template**          | A reusable workout a trainer builds once and assigns to clients. Assigning makes a copy that is the client's own. | Program, plan, master workout |
| **Booking**           | A time slot in a trainer's calendar with one or more clients.                                                     | Session, appointment, class   |
| **Blocked time**      | A time slot in a trainer's calendar with no client (break, own training, unavailable).                            | Busy event                    |
| **Coached workout**   | A workout the trainer logged on the client's behalf ("Logged by Ana").                                            | Trainer session               |
| **Session delivered** | A booking the trainer marked attended for a given client. It is the unit trainers bill by.                        | Credit, paid session          |

**Why "booking" and not "session":**

- `GLOSSARY.md` already lists "session" under _Avoid_ for Workout.
- The code's `WorkoutSession` means a workout.
- A scheduled slot named "session" would collide with both.

"Booking" also reads naturally in client copy: "Ana booked you for Tue 18:00".

## 5. Information architecture

### 5.1 The mode switch

- **Who sees it.** Users whose trainer tools are active (`trainer.status`: active, not disabled) and with the
  `trainerMode` flag on. Everyone else sees no change.
- **Where.** Mobile: the first row of You, in both modes:
  - in personal mode, "Switch to trainer mode" with an icon and a badge (§7.1);
  - in trainer mode, "Switch to personal mode".

  Web: the sidebar's `ModeSwitch` gains a third segment, **Trainer**, and the top-header switch does the same below
  lg.

- **What switching does.**
  - It swaps the tab bar (mobile) or nav items (web) and lands on that mode's **Today**.
  - It is instant, with no reload: a cross-fade, **MO-xx** per the motion system (the implementer picks the pattern
    ID from `docs/audit-2026-09/motion-system.md`).
  - The light haptic from `haptics` plays.
- **Persistence.**
  - Mobile: last mode in device KV (`shell-store`), read before the first render, so a trainer who left in trainer
    mode reopens straight into it.
  - Web: the existing `chefer_mode` cookie gains the value `trainer`.
  - The mode is per device, not stored on the server.
- **Losing trainer status** (tools turned off, removed from allowlist, flag off): the app falls back to personal mode
  at next launch or on the next status refresh, and the switch disappears.
- **Deep links decide the mode.**
  - A notification or link about trainer work (a coaching request, a booking a client cancelled) opens trainer mode.
  - One about the user's own life opens personal mode.
  - The router switches mode before navigating. Rules per kind are in §7.2.
- **The workout mini bar**, for a workout in progress, shows in both modes. A coached workout's mini bar shows the
  client's name.

### 5.2 Mobile trainer tab bar

| Order | Tab          | Icon (lucide)                    | Root screen | Notes                                          |
| ----- | ------------ | -------------------------------- | ----------- | ---------------------------------------------- |
| 1     | **Schedule** | `CalendarDays`                   | §6.2        |                                                |
| 2     | **Clients**  | `UsersRound`                     | §6.4        | Badge = pending coaching requests              |
| 3     | **Today**    | `House` (same as personal Today) | §6.1        | **Initial route**; Android Back returns here   |
| 4     | **Workouts** | `Dumbbell`                       | §6.6        | Lists templates (label per owner; see §16 O-1) |
| 5     | **You**      | `CircleUser`                     | §6.8        | Badge = personal-mode items waiting (§7.1)     |

**Implementation shape:**

- A new route group `apps/mobile/app/(trainer)/` mirrors `(main)/_layout.tsx`, with the same custom `tabBar`,
  `SnackbarAwareTabBar`, haptics and fade, and `initialRouteName="today"`.
- Pushed pages (client detail, routine editor, template editor, booking editor, coached-workout logger) stay
  root-level stack routes under `trainer/*`. They work from either mode.
- **Existing routes keep working:**
  - `/trainer` redirects to the Clients tab when `trainerMode` is on.
  - `/trainer/[clientId]` and `/trainer/[clientId]/routine` are unchanged.
  - `/trainer/invite` becomes a sheet launched from Clients.
  - With the flag off, everything behaves exactly as today (You → Trainer tools).
- `shell-routes.ts` gains `TrainerTab` and an `OLD_TO_NEW` entry for `/trainer` → `/(trainer)/clients`.

### 5.3 Web

- `nav-items.ts` gains mode `trainer`:
  - **primary:** Today (`/trainer/today`), Schedule (`/trainer/schedule`), Clients (`/trainer/clients`), Workouts
    (`/trainer/workouts`);
  - **secondary:** Trainer settings (`/trainer/settings`), Profile.
- **Below lg:** `BottomNav` shows Schedule · Clients · Today · Workouts plus **More**, the same pattern as the other
  modes. Today goes in the middle slot: the web bottom nav has four tabs plus More, so the order is Schedule ·
  Clients · Today · Workouts · More.
- `TRAINER_NAV_ITEM` ("Clients" in the Gym secondary list) is removed when `trainerMode` is on, and stays as it is
  today when the flag is off.
- Today's `/trainer` page becomes `/trainer/clients`. `/trainer` redirects to `/trainer/today`.
- Every page renders inside `<main id="main">` with exactly one `<h1>`, and each new route gets a `layout.tsx` with
  `metadata.title` (CLAUDE.md).

### 5.4 Route map

| Screen                 | Mobile route                                | Web route                       | Milestone              |
| ---------------------- | ------------------------------------------- | ------------------------------- | ---------------------- |
| Trainer Today          | `/(trainer)/today`                          | `/trainer/today`                | M1                     |
| Clients                | `/(trainer)/clients`                        | `/trainer/clients`              | M1                     |
| Client detail          | `/trainer/[clientId]` (exists)              | `/trainer/[clientId]` (exists)  | M1 (+M2, M3 additions) |
| Client routine editor  | `/trainer/[clientId]/routine` (exists)      | same (exists)                   | M2 additions           |
| Invite                 | sheet from Clients                          | sheet from Clients              | M1                     |
| Trainer You            | `/(trainer)/you`                            | `/trainer/settings` (+ Profile) | M1                     |
| Workouts (templates)   | `/(trainer)/workouts`                       | `/trainer/workouts`             | M2                     |
| Template editor        | `/trainer/templates/[id]`                   | `/trainer/workouts/[id]`        | M2                     |
| Assign template        | sheet                                       | sheet                           | M2                     |
| Schedule               | `/(trainer)/schedule`                       | `/trainer/schedule`             | M3                     |
| Booking editor         | sheet (`Sheet`)                             | sheet (`Sheet`)                 | M3                     |
| Booking detail         | `/trainer/bookings/[id]`                    | `/trainer/bookings/[id]`        | M3                     |
| Coached workout logger | `/trainer/coach/[bookingId]`                | `/trainer/coach/[bookingId]`    | M3                     |
| Notification settings  | Settings → Notifications (exists, extended) | (web has no push; none)         | M4                     |

## 6. Screens

Every screen must:

- show loading, empty and error states using the existing error primitives;
- meet 44×44 touch targets and text no smaller than `text-xs`;
- work at 320–430 px;
- respect reduced motion;
- use `Sheet` or `Drawer` for overlays and `useMenu` for menus (CLAUDE.md).

### 6.1 Trainer Today (M1; booking parts in M3)

**Purpose:** what needs me now, and what's next. Top to bottom:

1. **Requests waiting** card. Shown only when there are pending coaching requests. "2 people asked you to coach
   them", with **Review** → Clients (requests section). It is the M1 answer to "requests are buried".
2. **Next booking** card (M3): time, client name(s), workout name, location, and a **Start** button that opens the
   coached workout logger (§6.7). Start is enabled from 15 minutes before the start time. With nothing today: "No
   bookings today", and **Add a booking**.
3. **Today's bookings** (M3): a compact list of the rest of today. Tapping one opens booking detail.
4. **This week**, as a stat row (CountUp numbers):
   - active clients (of 50);
   - bookings this week, scheduled and done (M3);
   - average adherence across clients (sessions done ÷ weekly goal, last 7 days);
   - quiet clients (7+ days without a workout).
5. **Needs attention**: quiet clients (name, last workout date, tap → client detail) and client notices (the existing
   `trainer-notices`, moved here from Trainer tools).
6. **Sessions delivered this month** (M3): one row per client with a count. "Maria · 6". Tapping a row opens that
   client's bookings. Its footer explains: "Counts bookings you marked as attended."

**Acceptance:**

- A trainer with a pending request sees the requests card within one refresh, with no navigation needed.
- All numbers match the underlying lists.
- Empty states read well for a brand-new trainer with no clients and no bookings. They suggest: **Invite a client**,
  **Build a template**, **Add a booking**.

### 6.2 Schedule (M3)

**Purpose:** the trainer's calendar.

- **Views.**
  - Mobile: **Day** (default) and **Week**, as a segmented control. A `day-strip` sits on top to move between days.
  - Web: **Week** (default) and **Day**.
  - Hours run 06:00–22:00 by default; scrolling reveals the rest of the 24 hours. The view starts scrolled to the
    current time.
- **Blocks.**
  - A booking shows client name(s), its workout and its time.
  - A group booking shows "Maria + 1".
  - Blocked time is greyed and hatched.
  - Overlapping items render side by side. **Overlaps are allowed**, since the owner said several clients at once
    must work; the editor only warns.
- **Create.** Tap an empty slot (mobile: long-press or the **+** button; web: click and drag). This opens the
  booking editor (§6.3) pre-filled with that time.
- **Move** (web): drag a booking to another slot; this asks "This booking only / This and following" for repeats.
  Mobile moves through the editor. No drag in v1.
- **Time zone.** The schedule shows the **trainer's device time zone**. Each booking stores its time zone
  (§8.2), so a trainer who travels sees an "In Europe/Bucharest time" hint on bookings made in another zone.

**Acceptance:**

- Create, edit, move and cancel a single booking or a repeating one, with both scopes, on both platforms.
- Two bookings at the same time both render readably at 320 px.
- No horizontal page scroll.

### 6.3 Booking editor (M3)

The booking editor is a sheet with these fields:

| Field       | Rules                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type        | **Booking** (default) or **Blocked time**                                                                                                                          |
| Clients     | One or more **active clients** (searchable list). Required for a booking, hidden for blocked time. Max **6** per booking (`TRAINER_MODE_LIMITS.clientsPerBooking`) |
| Date, start | Required. 5-minute steps (`time-picker`)                                                                                                                           |
| Duration    | 30 / 45 / 60 / 90 chips, or custom 15–240 min                                                                                                                      |
| Repeat      | **Doesn't repeat** / **Every week** (until a date, or for 12 weeks by default; max 52)                                                                             |
| Workout     | Optional. For each client: "Their next routine day" (default), a specific routine day of theirs, or a template (which gets **assigned** on save, §6.6)             |
| Location    | Optional free text, ≤ 60 chars. Pre-filled from the trainer's gym line                                                                                             |
| Note        | Optional, ≤ 200 chars, **shown to the client(s)** ("Bring your belt")                                                                                              |

- **Conflict warning.** If the slot overlaps another booking or blocked time: "Overlaps with 18:00 Maria". Save is
  still allowed.
- **Saving notifies** each client (in-app now, push in M4): "Ana booked you for Tue 21 Oct, 18:00". A repeating
  booking sends **one** notification for the series.
- **Edit scope** for repeating bookings: **This booking** / **This and following**.
- **Cancel.** "Cancel booking", with the same scope choice and an optional reason the clients see. Clients are
  notified. Cancelled bookings stay in history greyed out; they are never hard-deleted (§10).

### 6.4 Clients (M1)

This is today's Trainer tools home, restructured as a tab root.

1. **Requests** section, at the top when any are pending: the existing `requests-section` (Accept / Decline, expiry,
   "Has a trainer now").
2. **Client list.** The existing cards (name, label, last workout, sessions vs goal, quiet badge, Keep it simple
   badge, "Routine changed by…"), plus:
   - **Next booking** on each card (M3);
   - a search field once there are 8 or more clients;
   - sorting by name, last workout or next booking.
3. **Invite a client** button in the top bar. It opens the existing invite flow (link + QR + pending invites) as a
   sheet.
4. Capacity line: "23 of 50 clients".

Turning trainer tools off and editing the trainer profile move to trainer You (§6.8).

**Acceptance:**

- Everything Trainer tools does today is reachable from Clients or You, with no feature lost.
- With `trainerMode` off, Trainer tools is unchanged.

### 6.5 Client detail (M1 restructure; M2 and M3 additions)

These are the existing tabs (Workouts, Adherence, Notes) plus:

- **Header actions:**
  - **Edit routine** (exists);
  - **Assign a template** (M2);
  - **Add a booking** (M3; the editor opens pre-filled with this client).
- **Bookings** tab (M3): upcoming and past bookings with this client, attendance status, and a "Sessions delivered"
  count for this month and last month.
- **Workouts** tab: coached workouts are labelled "Logged by you" (M3).

### 6.6 Workouts: the template library (M2)

- **List.** The trainer's templates: name, workout type, exercise count, estimated duration, "Assigned to 5 clients",
  and last edited. Search and a filter by workout type. **New template** button. Empty state: "Build a workout once,
  give it to any client."
- **Template editor.**
  - It reuses the routine `DayEditor` in a new `template` role: a name (≤ 40), a workout type, and exercises from the
    **curated** library only (the same rule as for clients).
  - Per exercise: sets, reps or duration, a default load (optional), rest, and a trainer note (≤ 200).
  - Autosave is versioned (`WorkoutTemplate.version`); conflicts use the existing "Keep mine / Use the other version"
    sheet. Two tabs on web can edit the same template.
- **Assign.** From the template ("Assign to clients", multi-select) or from client detail ("Assign a template").
  For each client, choose:
  - **Add as a new routine day**, with an optional weekday for simple-mode clients' My week; or
  - **Replace a day**: pick one of their routine days.

  On confirm, the template is **copied** into each client's routine through the normal versioned routine save, so
  the existing attribution ("Changed by Ana") and client notification apply. The new day records `templateId` and
  `templateVersion` (§8.1).

- **Tune per client.** After assigning, the screen offers "Set weights for each client". It steps through clients
  one at a time and shows each client's last loads from their history next to the template default. Saving writes
  each client's routine and next-session targets, using the existing override.
- **Update for clients.** When a template changes after being assigned, its screen shows "5 clients have an older
  version · Update for clients".
  - The trainer picks which clients.
  - Each update **replaces that routine day's exercises with the new template version, keeping per-client loads for
    exercises that are still present**.
  - It is routine-saved, attributed, and notifies the client.
  - Clients whose day was edited since assignment are flagged "Edited since. Updating replaces their changes", and
    are unticked by default.
- **Delete** a template: it is removed from the library. Clients' copies are untouched. "Based on" stays as plain
  text.
- **Limits:** 200 templates per trainer; 30 exercises per template.

**Acceptance:**

- Build, assign to 3 clients, tune each one's kg, edit the template, and update 2 of the 3.
- The third client is unchanged.
- All three clients see "Changed by Ana".

### 6.7 Coach this session: the coached workout logger (M3)

- **Entry:** Start on a booking (from Today, Schedule or booking detail), or "Log a workout for Maria" on client
  detail when there is no booking.
- **Logger:** the existing workout logger, run against the **client's** routine day (or the booking's chosen
  workout), with the client's units, history and progression.
  - The header shows "Coaching Maria" and the timer.
  - The workout mini bar shows the client's name in both modes.
- **Group booking:** a client switcher (chips) at the top. Each client has their own workout in progress; switching
  keeps every logger's state. "Finish" asks whether to finish just this client or all of them.
- **Saving:** each workout is written into the client's history through the normal session sync, with
  `loggedById = trainer` (§8.3).
  - Progression runs exactly as if the client had logged it. Coached sets are **confirmed loads**, because the
    trainer saw them.
  - The client sees it in history as "Logged by Ana", plus an in-app notice.
- **Attendance:** finishing a coached workout marks that client **attended** on the booking automatically. Otherwise,
  the booking detail has **Attended / No-show** per client. Bookings in the past that are still unmarked show "Mark
  attendance" on trainer Today.
- **Offline:** it works offline like the normal logger, using a client UUID and syncing later.
- **The client logs the same day themselves:** both workouts exist; the system doesn't merge them.

**Acceptance:**

- Coach a one-client booking and a two-client booking offline.
- Reconnect: both clients' histories show "Logged by Ana", progression has advanced, and attendance is marked.

### 6.8 Trainer You (M1)

- Switch to personal mode, with a badge for personal items waiting.
- **Trainer profile**: display name and gym line (moved from Trainer tools).
- **Invites**: link and QR (also reachable from Clients).
- **Availability**: "Accepting new clients" is shown read-only (the auto-close at 50 clients; no switch, PRD Q16b).
- **Notifications** (M4): trainer push switches, plus a link to the device settings.
- **Send feedback** (trainer-specific mail link, exists).
- **Turn off trainer tools**: the existing confirmation naming the client count.
- Help, Terms, Privacy, Sign out and version, the same as personal You.

### 6.9 Changes in personal mode

- **You:** the "Switch to trainer mode" row with a badge (§5.1), for active trainers only. The "Trainer tools" row
  goes away when `trainerMode` is on, because trainer mode replaces it.
- **Client side (anyone with a trainer):**
  - **Upcoming booking** card on Today and Train: "Session with Ana · Tue 18:00 · Gym Fit Center". Tapping it shows
    booking detail, read-only, with the trainer's note and the workout name.
    - It is shown from 7 days ahead; the card shows only the next one.
    - In group bookings **the client doesn't see the other clients' names**, only "with 1 other" (§10).
  - **History:** coached workouts show "Logged by Ana".
  - **Your trainer** page (`/coaching`): an "Upcoming bookings" list, read-only.
  - **Booking reminders** (M3): a local notification 60 minutes before, with a switch in Settings → Notifications.
    These are scheduled on the device from the upcoming bookings (§7.3), so no store build is needed.

## 7. Notifications

### 7.1 In-app (M1, ships over the air)

- **Badges.**
  - Trainer mode: the **Clients** tab badge counts pending requests.
  - Trainer mode: the **You** tab badge counts personal items (the existing `friends.me.badgeCount`).
  - Personal mode: the **You** tab and the switch row badge count trainer items (pending requests, plus unmarked
    attendance and booking changes from M3).
  - One count source: `trainer.badges` (§9), polled every 60 s in the foreground like `friends.me`.
- **Requests card** on trainer Today (§6.1).
- **New `NotificationKind`s:** `BOOKING_CREATED`, `BOOKING_CHANGED`, `BOOKING_CANCELLED` (client),
  `COACHED_WORKOUT_LOGGED` (client) and `COACHING_CLIENT_LEFT` (trainer, if it isn't covered by `COACHING_ENDED`).
  They render as dismissible notices on client Today/Train, the existing coaching notices pattern.

### 7.2 Push (M4, next store build)

| Event                                 | Recipient | Copy (example)                       | Opens                         | Preference key           | Default |
| ------------------------------------- | --------- | ------------------------------------ | ----------------------------- | ------------------------ | ------- |
| Coaching request received             | Trainer   | "Maria asked you to coach her"       | Trainer mode → Clients        | `trainer.requests`       | On      |
| Client left / coaching ended          | Trainer   | "Maria ended coaching"               | Trainer mode → Clients        | `trainer.clients`        | On      |
| Booking reminder                      | Trainer   | "18:00 Maria · Lower body A"         | Trainer mode → booking        | `trainer.reminders`      | On      |
| Request accepted / declined           | Client    | "Ana accepted your request"          | Personal → Your trainer       | `coaching.requests`      | On      |
| Routine changed by trainer            | Client    | "Ana updated your routine"           | Personal → Train              | `coaching.routine`       | On      |
| Booking created / changed / cancelled | Client    | "Ana booked you for Tue 18:00"       | Personal → booking detail     | `coaching.bookings`      | On      |
| Booking reminder                      | Client    | "Session with Ana in 1 hour"         | Personal → booking detail     | `coaching.reminders`     | On      |
| Coached workout logged                | Client    | "Ana logged today's workout for you" | Personal → workout summary    | `coaching.loggedWorkout` | On      |
| Follow request / new follower         | Anyone    | "Tom wants to follow you"            | Personal → Following activity | `social.follows`         | On      |

**Rules:**

- **Throttling:** at most one push per event kind per actor per 10 minutes; for example, five routine saves in a row
  send one push.
- **Never send:** food, weight, calories or the trainer's private notes in any push payload. Payloads carry ids
  only; the app fetches the details.
- **Quiet hours:** respect the device's Focus / Do Not Disturb. Chefer adds no quiet-hours setting of its own.
- **Reminders move from local to remote in M4**, and the device's scheduled local reminders are removed after
  migration so nothing fires twice.

**Infrastructure (M4):**

- **Client.**
  - Ask for push permission at a moment that has value: when a trainer turns on trainer mode for the first time,
    after a client's first booking, or after a coaching request. Never at launch.
  - Register with `getExpoPushTokenAsync` → `notifications.push.register`, and unregister on sign out.
  - Tapping a notification goes through the existing `use-notification-links`, extended with the mode rule (§5.1).
- **Server.**
  - A `PushDevice` model (§8.4).
  - A `PushService` that calls the **Expo push API** in batches and checks receipts.
  - Prune `DeviceNotRegistered` tokens.
  - Run it as a worker (`push-delivery.worker.ts`) fed by a `PushOutbox` table, so a push is enqueued in the same
    transaction as the domain change (the outbox pattern; no lost or duplicate push on crash).
- **Native**, which is why push needs the store build:
  - remove the `withoutPushEntitlement` plugin, so `aps-environment` returns (team 45TS85YK89 is a paid team now);
  - FCM credentials in EAS for Android.
  - Both change the runtime fingerprint. M4 is a **draft PR**, merged right before the store build after 1.0.2,
    the same as #177. Bundle it with #177 into one store build.

### 7.3 Local booking reminders (M3, over the air)

- On app start and after any booking change, the client app schedules a local notification 60 minutes before each
  upcoming booking in the next 14 days. It cancels and reschedules by booking id.
- Trainers get the same for their own bookings while in trainer mode.
- Switches: Settings → Notifications → "Booking reminders" (client) and trainer You → "Booking reminders".
- `expo-notifications` local scheduling is already in the binary. No native change.

## 8. Data model (additive Prisma; `prisma migrate` with migration files)

### 8.1 Templates (M2)

```
WorkoutTemplate         id, trainerId → TrainerProfile.userId, name (≤40), workoutType (WorkoutType?),
                        version Int, createdAt, updatedAt, deletedAt?  (soft delete; history keeps the name)
WorkoutTemplateExercise id, templateId, exerciseId (curated only), position, sets, reps?/durationSec?,
                        defaultLoadKg Decimal?, restSec?, trainerNote (≤200)?
RoutineDay              + templateId String? (no FK cascade: keep after template deletion)
                        + templateVersion Int?  + templateAssignedAt DateTime?
                        + editedSinceTemplate Boolean @default(false)   (set by any routine save touching the day)
```

### 8.2 Bookings (M3)

```
BookingSeries   id, trainerId, rule WEEKLY, weekday (0–6, trainer tz), startLocalTime "HH:MM", durationMin,
                timeZone (IANA), startsOn Date, endsOn Date, createdAt
Booking         id, trainerId, seriesId?, kind BOOKING|BLOCK, startsAt DateTime (UTC), durationMin, timeZone (IANA),
                location (≤60)?, note (≤200)?, cancelledAt?, cancelReason (≤200)?, createdAt, updatedAt, version Int
BookingClient   bookingId, clientId, workoutRef Json? ({routineDayId} | {templateId}), attendance
                SCHEDULED|ATTENDED|NO_SHOW|CANCELLED, workoutSessionId? (the coached workout), @@id([bookingId, clientId])
```

- **Repeats are materialised.** Creating a weekly series writes its `Booking` rows up to `endsOn` (12 weeks by
  default, 52 at most). "This and following" edits split the series by ending the old one and creating a new one.
  Why materialise: queries stay simple range scans, per-occurrence edits are ordinary rows, and 52 rows is cheap.
- **Times.** Store UTC plus the IANA zone, and compute occurrences in the trainer's zone, so DST shifts keep 18:00
  at 18:00. Everything must pass the **UTC Day Guard** CI check.
- **Indexes:** `Booking(trainerId, startsAt)`, `BookingClient(clientId, bookingId)`.

### 8.3 Coached workouts (M3)

```
WorkoutSession  + loggedById String?   (null = the owner logged it; else the trainer's userId)
                + bookingId String?
```

### 8.4 Push (M4)

```
PushDevice              id, userId, expoPushToken (unique), platform IOS|ANDROID, appVersion, lastSeenAt, createdAt
PushPreference          userId, key (see §7.2), enabled Boolean, @@id([userId, key])  (missing row = default)
PushOutbox              id, userId, kind, payload Json (ids only), dedupeKey, createdAt, sentAt?, attempts, lastError?
```

### 8.5 Limits

Add these to `@chefer/types` as `TRAINER_MODE_LIMITS`:

- templates per trainer: 200;
- exercises per template: 30;
- clients per booking: 6;
- weekly repeats: 52;
- booking horizon: 365 days ahead;
- location: 60 chars; note: 200 chars;
- reminder lead: 60 minutes.

## 9. API (tRPC, additive only)

| Procedure                                        | Base                 | Type           | Purpose                                                                                                       | M   |
| ------------------------------------------------ | -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- | --- |
| `trainer.badges`                                 | `trainerProcedure`   | Query          | Pending requests, unmarked attendance, booking changes; drives badges                                         | M1  |
| `trainer.dashboard.summary`                      | `trainerProcedure`   | Query          | Today stats (§6.1); booking fields null until M3                                                              | M1  |
| `trainer.templates.list / get`                   | `trainerProcedure`   | Query          | Library and detail, including assigned count and outdated clients                                             | M2  |
| `trainer.templates.create / save / delete`       | `trainerProcedure`   | Mutation       | Versioned save (CONFLICT like `routine.save`); soft delete                                                    | M2  |
| `trainer.templates.assign`                       | `trainerProcedure`   | Mutation       | `{templateId, targets:[{clientId, mode: ADD_DAY\|REPLACE_DAY, routineDayId?, weekday?}]}` → per-client result | M2  |
| `trainer.templates.updateClients`                | `trainerProcedure`   | Mutation       | `{templateId, clientIds}`: replace exercises, keep loads (§6.6)                                               | M2  |
| `trainer.bookings.range`                         | `trainerProcedure`   | Query          | `{from, to}` → bookings + blocks, clients, workout refs                                                       | M3  |
| `trainer.bookings.create / update / cancel`      | `trainerProcedure`   | Mutation       | Scope `THIS\|FOLLOWING` for series; versioned; notifies clients                                               | M3  |
| `trainer.bookings.markAttendance`                | `trainerProcedure`   | Mutation       | `{bookingId, clientId, attendance}`                                                                           | M3  |
| `trainer.coach.start`                            | `trainerProcedure`   | Mutation       | `{bookingId?, clientId}` → the client's workout prescription (the same shape the client logger gets)          | M3  |
| `trainer.coach.sync`                             | `trainerProcedure`   | Mutation       | Upserts coached `WorkoutSession`s for an active client (reuses `gym.session.upsertMany` logic, `loggedById`)  | M3  |
| `coaching.bookings.upcoming`                     | `coachingProcedure`  | Query          | Client: the next bookings (no other clients' names)                                                           | M3  |
| `notifications.push.register / unregister`       | `protectedProcedure` | Mutation       | Device tokens                                                                                                 | M4  |
| `notifications.push.preferences / setPreference` | `protectedProcedure` | Query/Mutation | §7.2 keys                                                                                                     | M4  |

**Authorization** (enforced in middleware and services, never in UI):

- Every `trainer.*` call that names a client requires an **ACTIVE coaching** with that client, and the existing
  single-NOT_FOUND pattern applies.
- Booking participants must be active clients when the booking is saved.
- **When coaching ends:**
  - that client's **future** bookings are cancelled (`attendance = CANCELLED`; a booking with no clients left is
    cancelled entirely), and the client is notified once;
  - past bookings and coached workouts stay; coached workouts belong to the client.
  - The trainer stops seeing that client's bookings and history, per the existing "loses access to everything" rule.
    The trainer's own aggregate counts for past months stay, as numbers only, without names.
- Coached workouts can only be written for active clients, and `loggedById` is set by the server from `ctx.user`,
  never from input.

**Mobile compatibility:**

- Every new field is optional and every procedure is new.
- Coached workouts have the normal `WorkoutSession` shape, so binaries already in the field render them. The
  "Logged by" label just doesn't appear there.
- Booking notices use new kinds. The server filters new `NotificationKind`s out of `coaching.notices` for clients
  below the API level that knows them: **claim API level 8** in M3, and move the INTERVALS reservation to 9.
- M1 and M2 need no new level.

## 10. Privacy, consent, retention

- **What the trainer sees is unchanged:** workouts, adherence, notes and bookings. Never food, weight, targets,
  calories or age.
- **Group bookings:** clients see the trainer, time, place, note and workout, but **not other clients' names**. Only
  "with 1 other" is shown.
- **Consent.** Phase-1 coaching consent (`COACHING_SHARING`) gains two lines, as a **new consent copy version**:
  "Your trainer can book sessions with you" and "Your trainer can log workouts for you".
  - New links accept the new version.
  - Existing clients get a **one-time notice** (not a re-consent gate): "What's new with Ana: bookings and logged
    workouts". It links to Leave.
  - The consent event records the copy version.
- **Retention:**
  - Bookings follow the coaching link's retention: 24 months after coaching ends, then deleted by
    `coaching-maintenance.worker`.
  - Templates live until the trainer deletes them, plus 30 days of soft delete.
  - `PushDevice` rows are pruned after 90 days unseen.
  - `PushOutbox` rows are deleted 7 days after sending.
- **Never in analytics or logs:** booking notes, locations, private notes, push tokens.

## 11. Analytics (WP-13 events, no PII)

- **Mode:** `trainer_mode_switched {to}`.
- **Templates:** `template_created`, `template_assigned {clients}`, `template_clients_updated {clients}`.
- **Bookings:** `booking_created {repeat, clients}`, `booking_cancelled {scope}`, `attendance_marked {status}`.
- **Coaching:** `coached_workout_started {group}`, `coached_workout_finished`.
- **Push (M4):** `push_permission_prompted / granted / denied`, `push_opened {kind}`.

## 12. Non-functional

- **Performance:** Schedule loads a week in a single `range` call, at p95 < 400 ms for 50 clients and 100 bookings
  a week. Switching tabs makes no extra round trip when data is cached.
- **Offline:** the coached logger is fully offline. Schedule and Today show cached data with a "Last updated" line;
  creating bookings needs a connection, with a clear error.
- **Motion:**
  - press feedback uses `PressableScale` / `pressControl`;
  - numbers use `CountUp`, and adherence uses `ProgressRing`;
  - every motion names its MO-xx pattern ID, honours reduced motion, and animates transform/opacity only.
- **Responsive:** sweep the routes at 320 / 375 / 390 / 430 px (`playwright --project=mobile`). The week view on
  web at lg and up; day view below sm.
- **Accessibility:**
  - calendar blocks are buttons with full labels ("Tuesday 18:00 to 19:00, Maria, Lower body A");
  - each mode switch announces the new mode;
  - badges carry accessible counts.

## 13. Milestones

Each milestone is **one PR to master**: web and mobile parity, docs updated per CLAUDE.md, and the test ladder in
§14. M1–M3 sit behind `trainerMode` and ship over the air. Merge in order.

| M   | Scope                                                                                                                                                                                                                                                                                        | Exit criteria                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | Flag `trainerMode`; mode switch (mobile KV, web cookie); `(trainer)` tab group and web Trainer mode; Today (requests card, stats, needs attention); Clients (requests, list, invite sheet); trainer You; `trainer.badges`, `trainer.dashboard.summary`; badges in both modes; glossary terms | A trainer can do everything from Trainer tools via trainer mode; a request shows a badge and a Today card within 60 s; flag off = no change      |
| M2  | Templates: models, library, editor (`DayEditor` template role), assign (add/replace), tune per client, update for clients, delete                                                                                                                                                            | §6.6 acceptance                                                                                                                                  |
| M3  | Bookings and blocked time, repeats, Schedule (day/week), booking editor, booking detail, attendance, coached workout logger (group-capable), client upcoming-booking card and list, local reminders, sessions delivered, the new notices, consent copy v2 + notice, API level 8              | §6.2, §6.3 and §6.7 acceptance; DST test (a booking across the late-October change keeps its local time)                                         |
| M4  | Push: `PushDevice`/`PushPreference`/`PushOutbox`, register flow, sender worker, receipts and pruning, preferences UI, deep-link mode rule, native entitlement + FCM. **Draft PR**, bundled with #177 for the store build after 1.0.2                                                         | A request reaches the trainer's locked phone within 10 s on TestFlight / internal testing; preferences respected; no payload carries health data |

**Launch:** after M3, the owner adds `trainerMode` to prod `FEATURE_FLAGS` (the same script pattern as the
2026-10-18 launch). M4 goes live when the store build is approved.

## 14. Test plan (per milestone)

- **Unit:**
  - repeat materialisation and series splitting;
  - DST and time-zone conversion;
  - template assign and update merge (keeps loads, flags edited days);
  - badge counts;
  - attendance rules;
  - push throttling and dedupe.
- **Contract (API):**
  - every new procedure: authorization (non-client → NOT_FOUND), CONFLICT on stale version, limits;
  - "coaching ended → future bookings cancelled";
  - old API level (6) does not receive the new notice kinds.
- **Web:** Playwright flows (switch mode → Today → Clients → assign a template → book → coach → attendance), plus
  the mobile sweep.
- **Mobile:**
  - Jest for screens and stores;
  - Maestro: mode switch persists across relaunch; request badge; booking create → client sees the card (two
    accounts); coached group workout offline → sync;
  - run on iOS and Android (Pixel_8) for M1 (new shell) and M3 (calendar layout).
- **M4:** a manual TestFlight / internal-testing pass with two phones: request push, booking push, reminder push,
  and the tap opening the correct mode.

## 15. Out of scope (later candidates)

- Clients requesting or accepting bookings.
- Trainer availability windows.
- Calendar sync (`.ics`, Google).
- Session packages and pricing.
- Trainer weekly digest (PRD S4).
- Template folders and sharing between trainers.
- Booking chat or comments.
- Video or photo form checks.
- A web push channel.

## 16. Defaults taken (owner may override)

| #   | Question                                                                                            | Default in this spec                                                                   |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| O-1 | Tab label "Workouts" lists **templates**, while "workout" elsewhere means one done bout of training | Keep "Workouts" (owner's word); screens and copy say "template" for the item           |
| O-2 | The word for a scheduled slot                                                                       | **Booking** (§4), not "session"                                                        |
| O-3 | Group bookings: can clients see each other?                                                         | No, "with 1 other" only                                                                |
| O-4 | "Sessions delivered" counts                                                                         | Bookings marked **attended**; finishing a coached workout marks attended automatically |
| O-5 | Reminder lead time                                                                                  | 60 minutes, fixed in v1                                                                |
| O-6 | Max clients per booking                                                                             | 6                                                                                      |
| O-7 | Existing clients and the new consent lines                                                          | One-time notice, no re-consent gate                                                    |
