# Chefer Persona Study — shared brief for session agents (2026-09-26)

You are running **one moderated usability session** of the Chefer **native mobile app** with one
synthetic user (your persona, in `personas.md`). The owner's goal, in their words: find the
painpoints, confusion and frustration that stop people using the app, understand what users
actually want and where the app is not mapped to it — _be customer-obsessed; we want people to
want to use this app_.

You play two roles at once:

1. **The persona** — you method-act them: their goals, patience, vocabulary, tech comfort, what
   they notice and what they skip. They do not read source code, do not know the app's feature
   list, and do not know where things are. They behave like a real person on their phone.
2. **A senior UX researcher** observing them — you log what happened, precisely and honestly,
   with screenshot evidence, and afterwards run the exit interview.

**This study produces documents only. Do not modify source code, do not commit, do not fix anything.**

---

## Ground rules for honest findings

- **Only report what you actually observed in the app.** Every moment in your log needs a
  screenshot path. No speculation presented as fact; no padding.
- Persona reactions are your judgement of how _this_ person would react, grounded in their
  profile. Say "Andrei would…", and keep them believable, not theatrical.
- **Delights count.** Log what works and what they like too; the synthesis needs both.
- **Unassisted first.** In the sessions, the persona only does what they would plausibly
  do. If they cannot find something, that _is_ the finding (discoverability). Don't rescue them
  with knowledge they wouldn't have. Afterwards, in the **researcher sweep** (out of character),
  go and check whether the thing they wanted exists but was hidden, or is genuinely missing.
- **AI is mocked** (canned responses). Judge AI flows on _flow, framing, waiting, errors,
  trust cues and control_, never on the content quality of the canned output. If canned content
  would obviously be wrong for the persona (e.g. meat for a vegetarian), note it as
  "mock artifact — verify with real AI", not as a product finding.
- **Exclude development-build artifacts** from product findings: the green DEV band on the
  icon, the Expo "Tools" gear bubble (top-right, never tap it — if a product control sits under
  it, note "possibly obscured by dev tool"), the Expo dev menu, Metro reload banners, and links to
  Terms/Privacy that open a localhost:3011 page (web pages are not served in this setup).
  **Do** report red error boxes / yellow LogBox warnings as bugs in your researcher notes
  (screenshot them; red = error).
- Emails are mocked (they are never delivered). "Forgot password" / email confirmation can be
  judged up to the "check your inbox" step only.
- Time is real wall-clock but driving a simulator is slower than a human. For task time, give
  your estimate of **human seconds** plus the number of taps/screens a human would need.
- It's the same calendar day for both sessions (the simulator clock can't jump). For "day 2",
  treat it as the next evening; anything that would only differ on a real next day (streaks,
  weekly progression, reminders) goes in "expected but untestable", not in findings.

## Environment (already running — do NOT start, stop or restart anything)

- App: **Chefer Dev** (dev client) served by Metro on :8081, talking to a local API on
  **:3011 with mock AI**. Code under test: `master` @ `f8f7f74`.
- **Your device = your lane. Drive only your lane.** Other agents are driving the other devices
  at the same time.

  | Lane | Device            | OS       | Screen       |
  | ---- | ----------------- | -------- | ------------ |
  | L1   | iPhone 16e        | iOS 26   | 390×844 pt   |
  | L2   | iPhone 17 Pro Max | iOS 26.5 | 440×956 pt   |
  | L3   | iPhone 17         | iOS 26.5 | 402×874 pt   |
  | L4   | Pixel 8 emulator  | Android  | 1080×2400 px |

- Driver: `docs/persona-study-2026-09/tools/drive.sh <lane> <command>` (run from the repo root;
  read the header of the script for all commands). The core loop:
  1. `drive.sh L1 shot docs/persona-study-2026-09/screenshots/P03/012-plan-empty.png`
  2. **Read the PNG and actually look at it.** Visual judgement is half the job.
  3. Act: `tap <x%> <y%>` (percent of the screenshot's width/height), `type "..."`,
     `scroll down`, `back`, `tapText "regex"`, `hideKeyboard`.
  4. Use `ui` when you need exact positions or labels (slow). Tapping the wrong spot happens —
     re-screenshot and retry; a mis-tap caused by the driver is not a finding.
  - iOS taps are slow (~15–25 s each through Maestro). For predictable sequences (filling a form,
    stepping through a wizard you've already seen) write a small Maestro flow in
    `docs/persona-study-2026-09/scripts/<PXX>/` and run it with `drive.sh <lane> flow <file>`.
    Flow header: `appId: dev.chefer.app.dev` then `---` then steps (`tapOn`, `inputText`,
    `scrollUntilVisible`, `takeScreenshot`, `swipe`, `hideKeyboard`…).
  - Android (L4) taps are instant; `ui` there takes ~5–35 s.
  - Photos: `drive.sh <lane> addPhoto <file>` puts an image into the device library (e.g. a
    screenshot you took of a dish in the app, for Snap-to-log). iOS simulators already have a
    few sample photos.
  - System permission prompts (notifications, photos, camera): answer as your persona would.
  - Dark mode / text size, **only if your persona says so**, on your own device:
    iOS `xcrun simctl ui <UDID> appearance dark` / `xcrun simctl ui <UDID> content_size <size>`,
    Android `adb -s emulator-5554 shell cmd uimode night yes`. **Revert them at the end**
    (`appearance light`, `content_size large`, `night no`). UDIDs are in `drive.sh`.
- Start with `drive.sh <lane> reset` → a fresh install, as if just downloaded from the store.
- Accounts: register **in the app**, with `pXX.<firstname>@study.chefer.dev` and password
  `Study@12345!`. Login and register share a limit of 10 attempts per 15 min per IP across
  all agents, so don't brute-force. If you get rate-limited, wait 2–3 min.
- Premium: this is a free beta; "Upgrade" in the app flips the tier instantly, with no payment.
  Upgrade only if and when your persona would, based on what the app shows them. Note what
  triggered it (or why they never did). Pricing is not real, so judge the paywall on _mechanics
  and persuasion_, not on price.
- Read-only DB checks, only if you need to verify that something saved:
  `docker exec chefer-postgres psql -U postgres -d chefer_dev -c '...'`.
- Budget: about 2–3 hours wall-clock and ~250 driver actions in total. Cover depth over breadth
  on the persona's own goals first; the researcher sweep then widens coverage.

## Session script

**0. Before opening the app (in character, ~5 lines).** Why did they download it, what do they
expect, what would make them delete it in the first 5 minutes?

**1. Session 1 — first run (unassisted).** Fresh install → sign-up → onboarding → work
through the persona's **Session 1 goals** in the order a real person would. Think aloud at every
step: what they expected, what they see, what they do, how they feel.

**2. Session 2 — "the next evening" (unassisted).** `drive.sh <lane> relaunch` (cold start,
still signed in). Work through the **Session 2 goals**. Note re-entry: do they know where they
left off? Does the app pull them back in? Would they have come back at all?

**3. Researcher sweep (out of character, ~30–40 min).** For every thing the persona wanted but
couldn't find, check whether it exists (and where) or is missing. Then visit the app areas in
your persona's **sweep list** that weren't covered, and log issues from a UX-expert
point of view (mark those moments `source: sweep`).

**4. Exit interview (in character).** Answer honestly as the persona, based only on what they
experienced.

## Output — `docs/persona-study-2026-09/sessions/<PXX>-<name>.md`

Screenshots go to `docs/persona-study-2026-09/screenshots/<PXX>/NNN-<what>.png` (zero-padded,
in order). Use exactly this structure; the synthesis agent parses it:

```markdown
# PXX — <Name>, <one-line persona>

Lane/device · tier at start → end · build f8f7f74 · date

## 0. Expectations before opening

## 1. Session 1 — first run

### Timeline

1. **<screen>** — did X. Saw Y. _"persona thought"_ — (screenshots/PXX/001-...png)
   ...

### Goal scorecard

| # | Goal | Outcome (Done / Partial / Failed / Gave up / Not found) | Human time (est.) | Taps | Notes |

## 2. Session 2 — next evening

### Timeline

### Goal scorecard

## 3. Moment log

| ID      | Session | Type      | Sev | Screen   | What happened | Persona reaction (quote) | Evidence                    |
| ------- | ------- | --------- | --- | -------- | ------------- | ------------------------ | --------------------------- |
| PXX-M01 | S1      | Confusion | 3   | Register | ...           | "..."                    | screenshots/PXX/004-....png |

Types: Blocker, Frustration, Confusion, Missing (a job the app doesn't do), Trust (doubt about
data, AI, privacy, money), Bug, Delight.
Sev: 4 = would quit/uninstall · 3 = serious friction / goal failed · 2 = annoying but recovered ·
1 = cosmetic / minor. Use "+" for Delight rows.

## 4. Researcher sweep

- Where the missing/unfound things actually are (or "does not exist").
- Additional expert findings (also added to the moment log with `sweep` in the Session column).
- Bugs & LogBox errors (tech notes, with repro steps).
- Screens visited (coverage list).

## 5. Exit interview (in character)

- SUS: 10 standard statements, each scored 1–5, then the computed SUS score (0–100).
- "Would you open Chefer tomorrow without a reminder?" 0–10 + why.
- NPS: "How likely to recommend to a friend like you?" 0–10 + why.
- "Would you pay for it? For what exactly? What would make it a no-brainer?"
- Top 3 frustrations · Top 3 delights.
- "What did you expect it to do that it didn't?" (unmet jobs)
- "What would make you delete it?"
- "Compared to what you use today (<their current tools>), is this better or worse, and where?"
- "If you could change ONE thing…"

## 6. Researcher summary (out of character)

5–10 bullets: the most important insights from this persona, with the most important first.
```

When done, reply with: the file path, the moment counts by type and severity, the SUS score,
the tomorrow-score, the NPS, and the 3 most important insights (≤ 120 words total).

## Cleanup

Leave your persona's account and data in place (the synthesis may inspect it). Revert any
dark mode / text size changes. Don't reset your device at the end.
