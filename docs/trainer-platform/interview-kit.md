# Trainer interview kit (WP-18 Phase 0)

_The goal is to find out, from 2–3 real trainers, whether they would publish a week of sessions to their clients in
Chefer, and what the smallest useful version is. Use it before Phase 1 starts. The tester's trainer didn't answer the
first guide (`docs/product/user-needs-research-2026-10.md`, "Her trainer"), so this replaces it with something shorter
and more concrete._

**Who to talk to** (in this order):

1. The tester's trainer: a small-group, class-style trainer in Romania.
2. One 1:1 personal trainer who also gives nutrition advice. The Forbes.ro profile describes this growing segment:
   women aged 30–40 buying training plus nutrition.
3. One trainer who already uses an app (TrueCoach, Trainerize, Everfit or similar), to hear what they'd miss.

**Ground rules:**

- Ask about **last week**, not habits in general.
- Show nothing until part 4.
- Write down their exact words, especially about money and time.
- Interview in Romanian if they prefer.
- About 20 minutes. Thank them with a free year of Premium if they want one.

---

## 1. The 20-minute interview

### Part 1: how the week works today (6 min)

1. Walk me through how you planned **last week** for one group (or one client). When did you do it, and where?
2. What stays the same from week to week, and what changes? Do you work in blocks of a few weeks?
3. How did your clients get the plan? Whiteboard, WhatsApp message, PDF, an app, or just you telling them on the day?
4. After a session, what do you know about each person? Who came, how hard it felt, what weight they used? Where does
   that live?

### Part 2: the pain (5 min)

5. What part of planning or following up takes you the most time each week?
6. When did a client last ask you "what weight did I do last time?" or "what should I eat today?" What did you answer?
7. Have you tried an app for this? What happened? Why did you stop, or why do you keep using it?

### Part 3: food (3 min)

8. What do your clients ask you about food? Do you give food advice today? In what form (rules, a plan, a target)?
9. Would you want to see what a client eats, or only whether they hit protein? Which would they be comfortable sharing?

### Part 4: show the mock (5 min). See section 3

10. "Here's an idea." Show the publish flow, then the client view, then the dashboard. Ask: "What would you do first?"
    Then stay silent.
11. "Would you post next week's sessions here **instead of** how you do it today? What would stop you?"
12. "What's missing that would make it a no?"

### Part 5: money and close (1 min)

13. "Who should pay for this: you, your clients, or nobody?" If they say "me": "How much a month would feel fair, and
    for how many clients?"
14. "Can we come back to you with a test version in a few weeks?"

**Listen for:**

- **They already send the week in writing** (WhatsApp, PDF). This is the strongest signal: publishing in Chefer replaces
  a habit, it doesn't create one.
- **"Last time" weights matter to them** (or don't). This decides whether loads or attendance lead the dashboard.
- **Group or 1:1.** This decides whether "publish to a group" or "edit a client's routine" is the MVP.
- **Food.** "Protein only" or "targets" is a cheap later slice. "Full meal plans" is expensive.
- **Who pays.** This decides the business model question in the spec.

---

## 2. Five-question survey (for trainers we can't interview)

Send it in Romanian and English (a Google Form or Tally). It takes about 2 minutes.

1. How do your clients get their training plan today? _(Whiteboard / WhatsApp or messages / PDF or spreadsheet / A
   coaching app (which?) / I tell them on the day)_
2. How many clients or class members do you plan for in a typical week? _(1–5 / 6–15 / 16–40 / 40+)_
3. Would you publish next week's sessions in an app if your clients could log their weights and you could see who
   came? _(Yes, now / Maybe / No, because… [free text])_
4. Do your clients ask you about food? What do you give them? _(Nothing / General advice / Targets (calories or
   protein) / Full meal plans)_
5. Who should pay for a coaching app? _(Me, per month / My clients / Included in the gym membership / It should be free)_
   and, if "Me", the most you'd pay per month _(free text)_.

---

## 3. Clickable mock brief (what to show a trainer)

Build it in Figma (or as a static HTML page) with **three screens and one path**. No real data or login. Use Romanian
copy if the trainer is Romanian.

1. **Trainer, web (desktop): "Next week for Grupa de marți 18:00".**
   - A list of three sessions (Tue, Thu, Sat).
   - Each one is a few exercises from the Chefer library, with sets × reps, or a class-style list ("Leg day: leg press,
     RDL, walking lunges, box jumps, plank").
   - A **Publish to 8 members** button.
   - A secondary "Copy last week" button.
2. **Client, phone: Gym Today shows "This week from Ana".**
   - Tuesday's session card with **Start** and **Quick check-in** (went or skipped, effort 1–10). This is the WP-05
     check-in.
   - "Last time: 60 kg" under one exercise.
3. **Trainer, web: "Last week".**
   - A grid of members × sessions: ✓ went / – skipped / blank.
   - Average effort per session.
   - Clicking a member shows their last loads on the key lifts.
   - A clear note: "Ana sees this because Maria shared it. She can turn it off any time."

**Questions to ask on each screen:** "What would you do here?", "What's missing?", "What would you never use?"

**Success signal for the MVP as specced:** at least 2 of 3 trainers say they'd publish next week's sessions there
**instead of** their current channel, and name attendance or last loads (not messaging or payments) as the reason.
