# Persona Study 2026-09 — Stage 1: Research synthesis

**Status: final, 10 of 10 sessions (P01–P10), v3 — 2026-09-27.** 54 insights (`CI-01` … `CI-54`), with stable IDs across
the three integration rounds; see the changelog in [Appendix A](#appendix-a--changelog-and-inconsistencies-across-session-files).
Evidence added in later rounds is marked **"Added from P07/P09"** or **"Added from P10"** inside each CI.

Build under test: `master` @ `f8f7f74`, Chefer Dev (Expo dev client), local API with **mock AI**, 2026-09-26/27.
Inputs: [`../BRIEF.md`](../BRIEF.md), [`../personas.md`](../personas.md), `../sessions/P01…P10-*.md`, `../screenshots/`.

## Executive summary

**What we did.** Ten synthetic personas (gym-only, food-only, both, households; beginner to expert; RO/UK/US/DE;
iOS + Android; dark mode; XXL text; free- and premium-leaning) each ran two sessions of the native app from a fresh
install, then a researcher sweep and an exit interview. The result is 499 logged moments, which cluster into 54 insights.

**Headline numbers (indicative, n = 10).** SUS **56.5** (median 58.75; only 1 of 10 at or above the 68 "average"
mark). Would open tomorrow unprompted: **4.6/10**. NPS likelihood **4.6/10** (0 promoters, 9 detractors → NPS −90).
Goals completed: **34 of 80 (43 %)**. Eight of ten upgraded, but only because "Upgrade — free for now" cost nothing.

**Why people would not use Chefer, or would stop:**

1. **Everyone gets the same product, and it rarely matches what they came for.** One single-choice intent
   question, then a calorie-ring home, a 7-day × 3–4-meal plan and a computed kcal target, for households,
   recipe collectors, zero-waste cooks, lifters, a prediabetic and an athlete alike (CI-01, CI-03, CI-11, CI-21).
   Re-entry doesn't surface tonight's job (CI-04).
2. **Numbers and safety are asserted, not shown.** Targets move silently: protein went 128 → 93 g for one persona
   and 184 → 204 g for another after gym setup. Prices look 5–15× off (the absolute prices are mock). Plans miss
   their own targets. Next week's plan shows as "this week" (a real data bug). Diet and allergy filtering has silent
   gaps: granola for a tree-nut allergy, "no eggs" ignored, hidden gluten, and an unfiltered replace list. The app
   never says what it checked (CI-05, CI-06, CI-10, CI-13, CI-19, CI-26). These are the only **Sev-4** moments in
   the study.
3. **The job that brought people in is locked, hidden or unreachable at first touch.** This covers import, the
   pantry, household scaling, budget, Snap to log (invisible on free), your own targets (impossible on any tier), and
   Gym pause and reminders (built, but with no entry point). The premium pitch names none of these jobs (CI-02,
   CI-12, CI-21, CI-23, CI-25).

**What already works and must be protected.**

- **Gym:** the workout logger, "Why?" and "Next time", and the gym setup wizard (D1–D3). This part carries every
  tomorrow-score ≥ 5.
- **Privacy:** the AI data-consent sheet, revoke, export and delete flows (D6, D14, D24), which the privacy persona
  called the best she had seen.
- **Food:** video-import review (D7), cook mode (D10), shopping-list ticking (D9), and the household setup (D8).

**Segments.** Gym-involved personas averaged SUS 59.6 and tomorrow 5.7. Food-only personas averaged SUS 50 and
tomorrow 3.3. The precision tracker (P07) found the app easy (SUS 57.5) but useless for her job (tomorrow 2).

**Validate with real users next.** In priority order:

1. Allergy and diet trust, including a safety review before any "safe for" claim.
2. The home and activation experience per segment.
3. Paywall placement at real prices.
4. Price credibility.
5. The pantry with use-by dates.
6. Re-entry and notifications over 1–2 weeks.

The full list is in §8.

> **Caveat (carry through every stage).** These are synthetic users: an LLM method-acting each persona on the real
> app, with a researcher role logging evidence. Treat findings as strong hypotheses, not measurements. Frequency
> counts (n/10) are indicative, not statistical: the personas were _designed_ to span segments, so "3/10" means
> "three segments ran into it", not "30 % of users". Scores (SUS, NPS) are the persona's judgement and are useful for
> comparing personas with each other, not for benchmarking against industry norms. §8 lists what needs real-user
> validation.

**How to read the evidence.** Moment IDs (`P04-M13`) point to the moment-log rows in each session file; screenshot
links are relative to this folder. Each insight separates **Observed** (what happened on screen), **Inferred**
(our interpretation) and **Artifact** (what is mock-AI or dev-build and must not be counted as a product finding).
Root causes marked ✔ were verified by reading source at `f8f7f74` (file:line) or with read-only DB queries; ✘ means
a session agent's claim was checked and is wrong; ~ means partly right.

Contents: [Executive summary](#executive-summary) · [1 Scoreboard](#1-scoreboard) · [2 Insight catalogue](#2-insight-catalogue-ci-xx) ·
[3 Unmet jobs](#3-unmet-jobs-to-be-done) · [4 Delights](#4-delights--strengths-to-protect) ·
[5 Journey map](#5-journey-map) · [6 Segments](#6-segment-differences) · [7 Tech bug list](#7-tech-bug-list) ·
[8 Excluded / untestable](#8-excluded--untestable--needs-real-user-validation) ·
[Appendix A: changelog + cross-session inconsistencies](#appendix-a--changelog-and-inconsistencies-across-session-files)

---

## 1. Scoreboard

"Done" counts every Done variant (incl. "Done (slow)", "Done after upgrade", "Done, not trusted"); "Partial"
includes "Partial / Gave up". The goal lists come from [`../personas.md`](../personas.md).

| ID  | Persona                                                    | Device (lane)                         | Tier start → end (trigger)                                                          | S1 goals done                      | S2 goals done                | SUS  | Tomorrow (0–10) | NPS (0–10) | One-line verdict                                                                                                                                                                           |
| --- | ---------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------- | ---- | --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P01 | Andrei, 24, bulking lifter                                 | Pixel 8, Android (L4)                 | Free → Free (never upgraded; the one upsell he met felt like a penalty)             | 2/4 (2 partial)                    | 1/4 (3 partial)              | 60   | 5               | 5          | "The logger is nice, ignore the suggestions and the food part."                                                                                                                            |
| P02 | Maria, 30, lifts 3×/wk, meal-preps                         | iPhone 17 Pro Max, **dark mode** (L2) | Free → Premium in S1 ("tailored to your goals")                                     | 1/4 (3 partial) + upgrade decision | 2/4 (1 failed, 1 partial)    | 55   | 6               | 5          | Gym carries the app; food can't express Sunday meal-prep and food/gym feel like two apps.                                                                                                  |
| P03 | Jake, 19, total beginner, $60/wk                           | iPhone 16e (L1)                       | Free → Premium in S2 (to unlock weekly budget)                                      | 3/4 (1 partial)                    | 2/3 (1 partial)              | 70   | 7               | 7          | "Way better for the gym"; food feels like "a fancy diet app" in the wrong currency.                                                                                                        |
| P04 | Elena, 38, family of 4, tree-nut allergy                   | iPhone 17 (L3)                        | Free → Premium in S1 (household "sized for one portion")                            | 1/4 (1 failed, 2 partial)          | 4/4                          | 65   | 5               | 4          | Household setup feels made for her, but the app never shows it checked for nuts, and ignores "no fish".                                                                                    |
| P05 | Priya, 34, lacto-vegetarian, 15-min dinners                | iPhone 16e (L1)                       | Free → Premium in S1 (Import lock)                                                  | 1/4 (3 partial)                    | 2/4 (1 failed, 1 partial)    | 47.5 | 3               | 3          | Diet safety she can't trust (eggs, turkey, false "non-vegetarian"); no model of "4 quick dinners for 2".                                                                                   |
| P06 | Tom, 52, prediabetic, XXL text                             | iPhone 17 Pro Max, **XXL text** (L2)  | Free → Premium in S1 (AI Chef lock; wanted to ask about blood sugar)                | 2/4 (2 partial)                    | 2/4 (2 partial)              | 45   | 5               | 5          | Gym setup is great for a novice; food never says a word about sugar and its numbers have no "why".                                                                                         |
| P07 | Ioana, 27, cutting, logs every bite                        | Pixel 8, Android, **dark mode** (L4)  | Free → Premium in S1 ("your personal nutrition profile", hoping for custom targets) | 0/4 (1 failed, 3 partial)          | 0/4 (1 failed, 3 partial)    | 57.5 | 2               | 2          | Can't type her own 2,000 kcal / 150 g, no food search, no edit; snap-to-log is fast but can't be corrected.                                                                                |
| P08 | Daniela, 45, cooks for two, hates waste                    | iPhone 17 (L3)                        | Free → Premium in S1 (Import, after the pantry wall)                                | 3/5 (1 failed, 1 partial)          | 0/4 (2 not found, 2 partial) | 37.5 | 2               | 3          | The "zero-waste pantry" she installed for doesn't exist on free and is invisible on premium.                                                                                               |
| P09 | Chris, 36, new dad back to the gym                         | iPhone 16e (L1)                       | Free → Free (never upgraded: the pitch had nothing for training)                    | 2/4 (2 partial)                    | 0/4 (2 not found, 2 partial) | 65   | 6               | 6          | "The best logger I've used" and no guilt, but pause, reminders and "finish later" — the dad features — couldn't be found.                                                                  |
| P10 | Lena, 29, vegan + coeliac runner who lifts, privacy-minded | iPhone 17 (L3; moved from Android)    | Free → Premium in S1 (AI Chef lock + "AI meal plans tailored to your goals")        | 2/4 (2 partial)                    | 4/4                          | 62.5 | 5               | 6          | Best privacy and consent she has seen and a genuinely vegan + GF plan, but numbers shift silently, "gluten-free" carries no label caveats, and her training is invisible to the food side. |

**Aggregates (n = 10, final)**

| Metric           | Mean            | Median | Range / distribution                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | --------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goals done       | 34 of 80 (43 %) | —      | S1 17/41 (41 %) · S2 17/39 (44 %). Every goal was met only by P04-S2 and P10-S2; P07 (both sessions), P08-S2 and P09-S2 met none                                                                                                                                                                                                                                                                                                                                      |
| SUS              | **56.5**        | 58.75  | 37.5 · 45 · 47.5 · 55 · 57.5 · 60 · 62.5 · 65 · 65 · 70. 7 of 10 are below 65; only P03 is at or above 68 ("average")                                                                                                                                                                                                                                                                                                                                                 |
| Tomorrow-score   | **4.6**         | 5      | 2 · 2 · 3 · 5 · 5 · 5 · 5 · 6 · 6 · 7. Nobody scored 8 or more                                                                                                                                                                                                                                                                                                                                                                                                        |
| NPS (likelihood) | **4.6**         | 5      | 0 promoters (9–10), 1 passive (P03 = 7), 9 detractors → **NPS −90** (indicative only)                                                                                                                                                                                                                                                                                                                                                                                 |
| Upgraded         | 8/10            | —      | Every upgrade was free ("Upgrade — free for now"). Two kinds of trigger (see CI-02 and CI-12): (1) a lock on the core job (P03, P04, P05, P06, P08), or (2) pitch copy promising something the persona wanted and didn't get (P02 "tailored", P07 "personal nutrition profile", P10 AI Chef + "tailored to your goals"). The two who stayed free (P01, P09) are gym-first and found nothing for training in the pitch. None of this is evidence of willingness to pay |

**Pattern in the scores.**

- The gym logger produced all the higher tomorrow-scores: P03 7, P02 6, P09 6, P01 5 and P06 5. Each of those
  personas says so in the exit interview. P10's 5 comes from the clean vegan + GF plan.
- The lowest scores (P07 2, P08 2, P05 3) belong to personas whose core food job is blocked:
  - precision tracking (own targets, food search, correctable scans),
  - the pantry,
  - cooking saved recipes safely.
- By segment:

  | Segment           | Personas                     | SUS  | Tomorrow |
  | ----------------- | ---------------------------- | ---- | -------- |
  | Gym-involved      | P01, P02, P03, P06, P09, P10 | 59.6 | 5.7      |
  | Food-only         | P04, P05, P08                | 50   | 3.3      |
  | Precision tracker | P07                          | 57.5 | 2        |

- The precision tracker found the app easy to use and useless for her job ("For what? My targets are wrong").
- The privacy persona's NPS of 6 (P10) rests on privacy alone: "I'd tell my vegan
  running group about the privacy side."

---

## 2. Insight catalogue (`CI-xx`)

**Method.** All 499 moment-log rows (390 issue rows + 109 delight rows) of the ten files (including `sweep` rows) were clustered by _user problem_
(not by screen). Each row belongs to one primary CI; a few rows are cited by two CIs where the same moment shows two
problems. Delight rows went to §4. **Impact = reach × max severity**; ties broken by mean severity. Severity scale
from the brief: 4 = would quit, 3 = serious friction / goal failed, 2 = annoying but recovered, 1 = cosmetic.
Bugs that block goals are kept as their own CIs (CI-31, CI-38, CI-45, CI-48 and the defect cluster CI-15). CIs added with P07/P09 are CI-47 to CI-53; CI-54 was added with P10.

**⚑ Read these first regardless of rank.** Pure reach × severity ranks food-safety problems in the middle of the
table because only four of the ten personas had a restriction (P04 tree nuts + dislikes, P05 lacto-vegetarian,
P06 prediabetes, P10 vegan + coeliac). They are the Sev-4 "would uninstall / someone gets hurt" moments:
**CI-10, CI-26, CI-38** (diet/allergy safety), **CI-25** (pantry), **CI-44** (health condition). P07 added two Sev-4
blockers for precision trackers that _did_ rise in the table: **CI-21** (can't type own targets) and **CI-28** (no food
search). P10 found the planner's vegan + gluten-free output clean (D16) but confirmed that the safety is implicit and
has hidden-gluten and replace-picker gaps.

| CI                | Problem (user's view)                                                                                 | Type             | Reach (n/10) | Sev max / mean | Impact | Journey stage        | Conf.           |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ---------------- | ------------ | -------------- | ------ | -------------------- | --------------- |
| [CI-03](#ci-03)   | Onboarding makes me pick food _or_ training (or has no card for my job)                               | Missing          | 8            | 3 / 2.2        | 24     | onboarding           | H               |
| [CI-01](#ci-01)   | First screen is a calorie counter, whatever I came for                                                | Confusion        | 8            | 3 / 2.1        | 24     | first value, return  | H               |
| [CI-04](#ci-04)   | Evening re-entry doesn't surface tonight's job                                                        | Frustration      | 8            | 3 / 2.0        | 24     | return               | M-H             |
| [CI-02](#ci-02)   | My core job is paywalled (or hidden) at first touch                                                   | Blocker, Trust   | 7            | 3 / 2.9        | 21     | first value → pay    | H               |
| [CI-06](#ci-06)   | Numbers with no "why", moving silently, contradicting the plan                                        | Trust            | 7            | 3 / 2.3        | 21     | throughout           | H               |
| [CI-13](#ci-13)   | Weekend defaults to the ending week; next week's plan shown as "this week" (data bug)                 | Confusion, Bug   | 7            | 3 / 1.8        | 21     | plan, shop, today    | H               |
| [CI-21](#ci-21) ⚑ | I can't state my goal or type my own targets                                                          | Missing          | 5            | **4** / 2.8    | 20     | onboarding, return   | H               |
| [CI-09](#ci-09)   | "Welcome back?" on a fresh install                                                                    | Confusion        | 10           | 2 / 1.3        | 20     | sign-up              | H               |
| [CI-07](#ci-07)   | Regenerate is hidden; post-upgrade "Regenerate" doesn't                                               | Confusion, Bug   | 6            | 3 / 2.4        | 18     | plan, pay            | H               |
| [CI-23](#ci-23)   | Settings scattered; gym settings (pause, reminders) unreachable                                       | Missing, Blocker | 6            | 3 / 2.3        | 18     | return               | H               |
| [CI-08](#ci-08)   | Cookbook search/empty states mislead; catalogue and time-filter gaps                                  | Confusion, Bug   | 6            | 3 / 2.0        | 18     | cookbook             | H               |
| [CI-12](#ci-12)   | Premium pitch doesn't name my job; payoff invisible; "free for now" worries me                        | Trust            | 9            | 2 / 1.8        | 18     | pay                  | H               |
| [CI-10](#ci-10) ⚑ | Stated diets/allergies/dislikes silently not enforced (incl. hidden gluten)                           | Trust, Bug       | 4            | **4** / 3.3    | 16     | onboarding → plan    | H               |
| [CI-15](#ci-15)   | Visual and copy defects                                                                               | Bug              | 8            | 2 / 1.1        | 16     | throughout           | H               |
| [CI-11](#ci-11)   | Plan can't express how I cook (dinners only, time, batch, servings, variety)                          | Missing          | 5            | 3 / 2.7        | 15     | plan                 | H               |
| [CI-05](#ci-05)   | I don't believe the money numbers                                                                     | Trust            | 5            | 3 / 2.6        | 15     | plan, shop           | H (partly mock) |
| [CI-14](#ci-14)   | Keyboard hides buttons; number pads without Done                                                      | Frustration      | 7            | 2 / 1.7        | 14     | onboarding, loop     | H               |
| [CI-26](#ci-26) ⚑ | Replace picker and AI Chef suggest food my diet rules out                                             | Trust, Bug       | 3            | **4** / 3.3    | 12     | loop                 | H               |
| [CI-28](#ci-28) ⚑ | Logging needs numbers I don't have (no food search, kcal mandatory)                                   | Missing          | 3            | **4** / 3.0    | 12     | tracking             | H               |
| [CI-19](#ci-19)   | The app never shows its safety check                                                                  | Trust, Missing   | 4            | 3 / 2.5        | 12     | plan → cook          | H               |
| [CI-20](#ci-20)   | Food and training feel like two apps; endurance not modelled                                          | Missing          | 4            | 3 / 2.5        | 12     | onboarding, loop     | M-H             |
| [CI-24](#ci-24)   | Wrong money and units for where I live                                                                | Confusion        | 4            | 3 / 2.1        | 12     | onboarding → plan    | M               |
| [CI-27](#ci-27)   | Reminders: ten taps, fixed weekdays, cold permission prompt                                           | Frustration      | 5            | 2 / 1.7        | 10     | gym onboarding       | H               |
| [CI-16](#ci-16)   | Budget is premium, not saved on free, not enforced                                                    | Missing          | 3            | 3 / 3.0        | 9      | onboarding → plan    | H (UI)          |
| [CI-29](#ci-29)   | Progress can't tell me how I'm doing                                                                  | Missing          | 3            | 3 / 2.9        | 9      | return               | M-H             |
| [CI-17](#ci-17)   | Partner can't see the list or plan                                                                    | Missing          | 3            | 3 / 2.8        | 9      | shop                 | H               |
| [CI-18](#ci-18)   | Regenerate wipes my chosen meals without asking                                                       | Frustration      | 3            | 3 / 2.7        | 9      | plan                 | H               |
| [CI-31](#ci-31)   | Bug: "Next time" drops after back-off / incomplete sets                                               | Bug, Trust       | 3            | 3 / 2.4        | 9      | gym loop             | H               |
| [CI-22](#ci-22)   | The shopping list itself creates waste                                                                | Frustration      | 3            | 3 / 2.4        | 9      | shop                 | H               |
| [CI-40](#ci-40)   | "Save Day", "Extras" and lost ticks confuse                                                           | Confusion        | 3            | 3 / 2.2        | 9      | tracking             | H               |
| [CI-33](#ci-33)   | Import: Link tab fails on YouTube; no review for link/text; unsafe-save CTA                           | Frustration      | 3            | 3 / 2.1        | 9      | collectors           | H               |
| [CI-25](#ci-25) ⚑ | The pantry can't hold my fridge (free) and has no dates                                               | Blocker, Missing | 2            | **4** / 3.4    | 8      | first value → loop   | H               |
| [CI-35](#ci-35)   | Right after a workout it offers the next one                                                          | Confusion        | 4            | 2 / 1.8        | 8      | gym loop             | H               |
| [CI-36](#ci-36)   | Stats unlabelled and clipped                                                                          | Bug, Confusion   | 4            | 2 / 1.8        | 8      | return               | H               |
| [CI-34](#ci-34)   | Swap sheets give wrong/duplicate options, no preview/undo                                             | Frustration      | 4            | 2 / 1.7        | 8      | loop                 | H               |
| [CI-45](#ci-45)   | Bug: server UTC dates (chat log on yesterday; Progress "0 days")                                      | Bug              | 2            | 3 / 2.7        | 6      | tracking, return     | H               |
| [CI-30](#ci-30)   | Lifter's split picked for him; alternatives below the fold                                            | Missing          | 2            | 3 / 2.6        | 6      | gym onboarding       | H               |
| [CI-44](#ci-44) ⚑ | Health condition ignored; no medical/AI disclaimer                                                    | Missing, Trust   | 2            | 3 / 2.6        | 6      | onboarding → loop    | H               |
| [CI-32](#ci-32)   | Jargon; exercise explanations unreachable from the plan                                               | Confusion        | 2            | 3 / 2.2        | 6      | gym onboarding       | H               |
| [CI-50](#ci-50)   | Sessions ~50 min; nobody asks how long I have _(v2)_                                                  | Missing          | 2            | 3 / 2.0        | 6      | gym onboarding, loop | H               |
| [CI-43](#ci-43)   | Dense rows truncate ("Dumbb…" ×3)                                                                     | Bug              | 3            | 2 / 1.6        | 6      | throughout           | H               |
| [CI-37](#ci-37)   | Cook-mode steps thin; wrong "Enjoy your …"                                                            | Missing, Bug     | 3            | 2 / 1.4        | 6      | cook                 | H               |
| [CI-38](#ci-38) ⚑ | Bug: editing a recipe makes it "non-vegetarian"                                                       | Bug, Trust       | 1            | **4** / 3.7    | 4      | own recipes          | H               |
| [CI-39](#ci-39)   | Bug: Food/Gym switch highlights the wrong side                                                        | Bug              | 2            | 2 / 2.0        | 4      | navigation           | H               |
| [CI-46](#ci-46)   | No dark mode (iOS and Android)                                                                        | Frustration      | 2            | 2 / 2.0        | 4      | throughout           | H               |
| [CI-41](#ci-41)   | Household setup doesn't read back what I said                                                         | Confusion        | 2            | 2 / 1.8        | 4      | onboarding           | H               |
| [CI-42](#ci-42)   | Logger papercuts (RIR collapse, reps don't carry, BW load, set delete)                                | Frustration      | 2            | 2 / 1.8        | 4      | gym loop             | H               |
| [CI-51](#ci-51)   | Kind streak/pause/skip mechanics are invisible; "0-week streak" leads _(v2)_                          | Confusion, Trust | 2            | 2 / 1.7        | 4      | first value, return  | M-H             |
| [CI-53](#ci-53)   | No Apple Health; body weight in two places _(v2)_                                                     | Missing          | 2            | 2 / 1.5        | 4      | return               | H               |
| [CI-54](#ci-54)   | Privacy gaps: implied consent, opt-out emails, no consent record, nothing on data already sent _(v3)_ | Trust            | 2            | 2 / 1.4        | 4      | sign-up, account     | H               |
| [CI-47](#ci-47)   | Snap-to-log estimate can't be corrected _(v2)_                                                        | Trust, Missing   | 1            | 3 / 2.5        | 3      | tracking             | H               |
| [CI-49](#ci-49)   | Interrupted workout: only finish or bin; the rest vanishes _(v2)_                                     | Missing          | 1            | 3 / 2.5        | 3      | gym loop             | H               |
| [CI-48](#ci-48)   | Logged food entries can't be edited; instant delete _(v2)_                                            | Missing          | 1            | 3 / 2.3        | 3      | tracking             | H               |
| [CI-52](#ci-52)   | Where's the workout I just did? (history hidden) _(v2)_                                               | Missing          | 1            | 2 / 1.7        | 2      | gym return           | H               |

**Cross-cutting themes** (for stage 2/3; each groups several CIs):

1. **"Show your work" is missing on the food side** — safety (CI-10, CI-19, CI-26), numbers (CI-05, CI-06, CI-13), pantry savings (CI-25), budget (CI-16). P10's one-line ask: "make every number tappable: why 93 g? why 2,284? why is this gluten-free?" The gym side's Why?/Next-time pattern (D2) is the in-house model.
2. **One product frame ("one dieter, 7 × 4 meals, computed kcal target") imposed on five different jobs** — CI-01, CI-03, CI-11, CI-21, CI-44; and, for the one persona who _does_ want to count (P07), the counting itself is too coarse: CI-21, CI-28, CI-47, CI-48.
3. **Locks sit on activation moments and the pitch doesn't name them** — CI-02, CI-12, CI-16, CI-25.
4. **Weekly planning mechanics** — CI-07, CI-13, CI-18, CI-22.
5. **The gym side is the retention engine; its defects are about control for experts and adaptation for busy people** — CI-30, CI-31, CI-35, CI-42 (experts); CI-49, CI-50, CI-51, CI-23 (time-poor: no time budget, no resume, pause/reminders built but unreachable) vs D1–D4, D22.
6. **Server-side time and week handling** — CI-45 (UTC dates in chat logging and Progress), CI-13 ("active plan" chosen by creation time, not week), CI-37 and CI-47 (meal word/slot by clock). One date/time contract for the client's local day would remove a whole class.
7. **Privacy is a differentiator worth leading with** — D6, D14, D24 vs the small gaps in CI-54 (and the absence of any mobile analytics, which also means the funnel can't be measured yet; see §8).

---

<a id="ci-01"></a>

### CI-01 — "I came for X and the first screen is a calorie counter"

- **Type:** Confusion, Frustration · **Reach:** 8/10 — P01, P02, P03, P04, P05, P06, P08, P09 (counter-case: P07, for whom a tracker home is right, D20) · **Severity:** max 3, mean 2.1 · **Stage:** first value, re-entry
- **Evidence:** P01-M27, P02-M08, P03-M13, P04-M09, P04-M10, P04-M38, P05-M07, P05-M13, P05-M51, P05-M53, P06-M07, P08-M06, P08-M27 ·
  [P04 after "Feed my household"](../screenshots/P04/031-after-onboarding.png) ·
  [P05 after skipping the goal](../screenshots/P05/012-onb-step4.png) ·
  [P08 after "Feed my household", looking for the pantry](../screenshots/P08/018-onb-step5.png)
- **Quotes:** "I said I'm feeding a family. Why am I looking at my own calories?" (P04) · "I didn't ask to be counted." (P05) · "Calories? Gym? I came for the pantry." (P08)
- **Added from P07/P09:** P09-M27 (gym-first user, no body data, sees "0 of 2,000 kcal" as if personal), P07-M09 ("Plan my week every Sunday" and weekly emails ON by default for a logger who never asked for a plan). [P09 Food Today](../screenshots/P09/073-s2-food.png). Counter-case: for P07, who came to track, a ring-first home was right (P07-M23, D20) — the problem is the _same_ home for every intent, not the ring itself.
- **Observed:** Every food onboarding ends on Food › Today with "0 of 2,000 kcal eaten" and protein/carbs/fat targets, plus "No meals planned yet. Head to the Plan tab" as plain text (no button). This happened after "Feed my household" (P04, P08), after skipping the goal step (P05, P08), and for gym-first users who were never asked about food (P01, P03). Later: "Complete your profile (body metrics)" banner (P05, P08), cook-mode finish "Log it … so your nutrition stays honest" (P04), calorie-themed AI Chef example (P05, P08), a post-upgrade sheet whose first step is "Set your goal & body metrics" (P05-M51).
- **Inferred:** Today is designed for one job (track intake against a target), which only P06 (and partly P01) has. For households, recipe collectors and waste-averse cooks the first screen says "wrong app" before any value. Diet-sceptical users (P05, P08) read it as diet culture.
- **Root cause (✔):** with no metrics the target falls back to `DEFAULT_CALORIE_TARGET = 2000` (`apps/api/src/application/preferences/preferences.service.ts` L162, L214); 125 g protein is the 25 % split of 2,000 (`packages/utils/src/training-nutrition.ts` L35–42). Onboarding intent does not change the Today layout (observed across intents). The Train intent skips all food steps (`packages/utils/src/household.ts` L55), so gym-first users get the default ring.
- **Confidence:** High (8/9, consistent screenshots).
- **Validate:** which "home" each segment expects (tonight's dinner, the list, the fridge, the workout) — card sort / first-click test.

<a id="ci-02"></a>

### CI-02 — "The thing I installed it for is the paid part, and I find out at the moment I need it"

- **Type:** Blocker, Frustration, Trust · **Reach:** 7/10 — P01, P03, P04, P05, P06, P07, P08 · **Severity:** max 3, mean 2.9 · **Stage:** first value → pay
- **Evidence:** P01-M38, P03-M36, P04-M11, P04-M17, P05-M09, P05-M11, P06 S1 step 12 (AI Chef lock), P08-M08, P08-M09, P08-M31, P08-M42 ·
  [P05 import lock](../screenshots/P05/014-import-sheet.png) ·
  [P08 kitchen "premium cooks from it"](../screenshots/P08/022-kitchen.png) ·
  [P01 training-day bump locked on Food Today](../screenshots/P01/118-s2-home.png)
- **Quotes:** "The one thing I downloaded it for is behind the paywall." (P05) · "It wants money to feed me for training. Nope." (P01) · "So the family part is the paid part." (P04)
- **Added from P07/P09:** P07-M11: **Snap to log is not locked but invisible on free** — the card doesn't render at all, and the Go Premium pitch never mentions photo logging; P07 found the feature she installed for only after upgrading for another reason. ✔ `apps/mobile/src/features/tracker/scan-meal-card.tsx` L102 (`return null; // tier has zero scans — the profile page carries the upsell`). [free Today without the card](../screenshots/P07/020-after-onboarding.png) vs [premium Today with it](../screenshots/P07/040-after-full-setup.png).
- **Observed:** Each persona's core food job hit a lock at first touch: recipe import (P05, P08), pantry add/"use it up" (P08), scaling to the household (P04: plan and list "for 1 portion" on free), weekly budget (P03: field editable but silently not saved), training-day calories (P01), AI Chef to ask about blood sugar (P06). Free alternatives are thin: the manual recipe form is 36 boxes (P05-M11), the free kitchen is read-only (P08). Five of the six upgraded (P01 refused); every one of them did so because "Upgrade — free for now" cost nothing.
- **Inferred:** The paywall sits on the _activation_ moment of three segments (collectors, zero-waste, households). With a real price this is the uninstall point for P05 and P08 (both say so), and the P01 lock reads as a penalty for using both halves of the app. The locks are often "cliff" locks (nothing to try), unlike the well-designed free AI Chef lock that offers free alternatives (D15).
- **Root cause (✔):** import lock replaces the whole form (`apps/mobile/app/import-recipe.tsx` L173–190) although the API comment describes a free 1-per-day import that mobile never offers (`apps/api/src/routers/import.router.ts` L65); pantry writes are `premiumProcedure` (`apps/api/src/routers/pantry.router.ts` L18–53); budget input stays editable with no save on free (`apps/mobile/app/preferences.tsx` L297–310; API `updateTargets` is premium, `preferences.router.ts` L102); training-day bump gated by `trainingNutrition` (`apps/api/src/application/dashboard/dashboard.service.ts` L201, `packages/utils/src/training-nutrition.ts` L168, `packages/types/src/plan-features.ts` L190; locked card `apps/mobile/src/features/dashboard/components/training-day-note.tsx` L33–70).
- **Artifact:** willingness to pay is untestable: premium is free in this beta, so upgrades here measure curiosity, not conversion.
- **Confidence:** High on the mechanics; Medium on the conversion effect.
- **Validate:** real paywall test per segment (which first-touch lock converts vs churns); whether a free "taste" (1 import, 5 pantry items, household scaling preview) changes activation.

<a id="ci-03"></a>

### CI-03 — "I want food _and_ training (or neither): the first question makes me pick one"

- **Type:** Missing, Frustration · **Reach:** 8/10 — P01, P02, P03, P06, P10 (wanted both); P05, P07, P08 (no intent fits) · **Severity:** max 3, mean 2.2 · **Stage:** onboarding
- **Evidence:** P01-M04, P02-M04, P03-M04, P06-M03, P05-M03, P08-M02 ·
  [P02 second tap replaces the first](../screenshots/P02/008-onb-step1-select.png) ·
  [P08 no pantry/waste intent](../screenshots/P08/008-after-create.png)
- **Quotes:** "I want both, that's literally why I downloaded it. The ad said meals AND workouts." (P02) · "None of these is 'stop throwing food away'." (P08)
- **Added from P07/P09:** P07-M04: no "track what I eat / hit my macros" intent ("None of these is me. I don't want a plan, I want to log."). P09 is a counter-case: Train fitted exactly (P09-M02).
- **Added from P10:** P10-M04 ("I'm both. Why make me choose?" — a food-first runner who lifts).
- **Observed:** "What brings you here?" is single-select (Eat better / Feed my household / Train); choosing Train skips all food setup, and food setup is never offered again (P01, P03). P05 (cook my saved recipes) and P08 (use up my fridge) found no card for their job. P04 is the counter-example: "Feed my household — allergies included" was "literally me" (D8). "You can use everything either way" softened it for three personas.
- **Inferred:** The intent step decides which half of the product a user ever configures, but it is framed as a light "where to start". "Both" users end up half-configured (CI-20); collectors and zero-waste users start on the wrong path.
- **Root cause (✔):** single-value radio group (`apps/mobile/src/features/onboarding/intent-step.tsx` L10–33, L48–60); step list in `packages/utils/src/household.ts` L44–61 (TRAIN → `['intent']` only, L55), then the wizard hands off to gym setup (`apps/mobile/src/features/onboarding/onboarding-wizard.tsx` L318–324).
- **Confidence:** High.

<a id="ci-04"></a>

### CI-04 — "When I come back in the evening, it doesn't know what I'm here for"

- **Type:** Frustration, Confusion · **Reach:** 8/10 — P01, P03, P04, P05, P06, P08, P09, P10 · **Severity:** max 3, mean 2.0 · **Stage:** return
- **Evidence:** P01-M37, P03-M21, P04-M30, P05-M34, P06-M24, P08-M45 (counter-example P02-M32) ·
  [P08 "Next meal: breakfast" in the evening](../screenshots/P08/096-s2-relaunch.png) ·
  [P01 on Food on a training evening](../screenshots/P01/118-s2-home.png) ·
  [P04 "Tomorrow · Breakfast", not dinner](../screenshots/P04/082-s2-today-scroll.png)
- **Quotes:** "I train tonight, why am I looking at a frittata?" (P01) · "Breakfast at eight in the evening? And not a word about my fridge." (P08) · "I don't want to be weighed, I want dinner." (P05)
- **Added from P07/P09:** P09-M23: after a missed planned day the app is silent — no "still time for one this week", no "move Wednesday to Friday?" (the kind, no-red design is praised, P09-M20, but offers no next step). P07 is a counter-case: opening straight on the numbers was what she wanted.
- **Added from P10:** P10-M31: cold start leads with a yellow "PLAN UNDER TARGET" pill — "The first thing I see is that my own plan is wrong."
- **Observed:** Cold start reopens the last-used side (Food or Gym). Gym users on a training evening landed on Food (P01, P03); a food user landed on Gym (P06). Food Today in the evening led with "Next meal: breakfast", the calorie ring, weight box, "Complete your profile" and "Start training" — nothing about tonight's dinner, the list for tomorrow's shop, or expiring food. Mihai's "what's for dinner tomorrow?" took 4 taps via Plan (P04). Nobody saw a "welcome back / where you left off". P02 was the one good case: she ended S1 on Gym and reopened on her workout.
- **Inferred:** The app has the data for a context-aware landing (planned training day, tonight's planned dinner, expiring pantry items) but uses "last mode" instead. The persona study cannot test notifications (same-day clock), so this in-app hook is the only re-entry lever observed.
- **Root cause (✔):** the persisted mode defaults to food and is restored on launch (`apps/mobile/src/features/gym/mode-store.ts` L14–28, redirect L49–51; `apps/mobile/app/(food)/_layout.tsx` L19–25). "Next meal" on Food Today treats the day's first unlogged meal as next (observed; P05, P08 at ~19:00 role-play / 01:00 real).
- **Artifact:** S2 was role-played as "the next evening" on the same (or just-past-midnight) day; the clock was 00:xx–01:xx for P05, P06, P08, so "breakfast next" is partly a clock effect. The absence of any dinner/fridge/workout hook stands.
- **Confidence:** Medium-High.
- **Validate:** diary study of real re-entry times and what users look for first.

<a id="ci-05"></a>

### CI-05 — "I don't believe the money numbers"

- **Type:** Trust · **Reach:** 5/10 — P01, P02, P03, P04, P08 · **Severity:** max 3, mean 2.6 · **Stage:** first value (plan, shop)
- **Evidence:** P01-M33, P01-M34, P02-M13, P03-M35, P03-M40, P04-M25, P08-M14, P08-M15, P08-M23, P08-M44 ·
  [P02 "Eggs 9 large ~142 RON", "Lemon 3.3 piece"](../screenshots/P02/033-shop-proteins.png) ·
  [P08 banana 15 RON](../screenshots/P08/034-produce.png) ·
  [P08 "Saved ~389,80 RON" on a 2,908 RON list](../screenshots/P08/094-tobuy-premium.png)
- **Quotes:** "142 lei for nine eggs?! I can't trust this total at all." (P02) · "A banana is one leu at Carrefour, not fifteen." (P08) · "I don't believe any of these numbers." (P08)
- **Observed:** Weekly totals of 531–1,165 RON for one person and 2,900–3,650 RON for households; item prices 5–15× shelf prices and internally inconsistent (avocado cheaper than a banana); a "Saved ~389 RON" claim with no per-line explanation; the Shop header "covers Sat–Sun" next to a whole-week total (P01, P03). No label says how rough the estimate is.
- **Root cause / artifact (✔):** **the absolute prices are a mock artifact.** The mock AI generates deterministic pseudo-prices from a hash of the ingredient name (`apps/api/src/lib/ai/mock.ts` L167–180); read-only DB: 763 `ingredient_prices` rows with source `AI_ESTIMATE` written 22–26 Sep by the mock. Session files disagree on this (P02, P04 log the prices as Trust/Bug; P08 flags them as likely mock) — see Appendix A. What is **not** an artifact: prices are EUR estimates converted to local currency with no confidence cue or breakdown; a savings claim with nothing itemised; totals that don't say which days they cover; and quantity problems that inflate totals (CI-22).
- **Confidence:** High that trust collapses on implausible numbers; Low on real price accuracy (untested).
- **Validate:** with real AI price estimates, compare 20 staple prices per market (RO, UK, US) to shelf prices; test whether a "rough estimate ± X %" label preserves trust.

<a id="ci-06"></a>

### CI-06 — "Numbers with no 'why' — and some contradict the plan"

- **Type:** Trust, Confusion · **Reach:** 7/10 — P01, P02, P03, P04, P06, P07, P10 · **Severity:** max 3, mean 2.3 · **Stage:** first value, daily loop, return
- **Evidence:** P01-M30, P02-M14, P02-M16, P02-M29, P02-M39, P03-M13, P04-M11, P06-M07, P06-M09, P06-M17, P06-M30, P06-M31, P06-M32, P06-M40 ·
  [P06 "Protein short by 35 g — add a snack" + 2× lunch for a dieter](../screenshots/P06/030-plan-generated.png) ·
  [P06 unexplained 2,099 / 184 g](../screenshots/P06/025-after-finish.png) ·
  [P06 "vs target −79 %"](../screenshots/P06/100-s2-progress.png)
- **Quotes:** "Is that a lot or a little? 184 grams — I don't know what that looks like on a plate." (P06) · "On track for what — the ten kilos, or just today?" (P06) · "Who eats 1,300 kcal of cod for dinner?" (P02)
- **Added from P07/P09:** P07-M22 (remaining shown only for kcal; macros as eaten/target, no grams left), P07-M29 (protein _over_ target coloured orange like a warning — a win on a cut), P07-M36 (Tracker keeps normal colours for the same over-target state), P07-M39 (a generated premium day is "286 kcal over target · Protein short by 49 g"; mock content, honest flags). [P07 orange protein](../screenshots/P07/099-s2-logged-out.png).
- **Added from P10:** **P10-M09, M14, M26, M27, M29 (Sev 3), M36, M37, M50.** Protein dropped 128 → 93 g and carbs rose 272 → 307 g the moment she finished gym setup, with no notice; the source ("1.6 g/kg because you train") exists only four screens deep in Preferences; the kcal formula is shown nowhere; the premium AI week came out 414–714 kcal under target on every day with "Protein short" on 6/7, with no "what changed" and no fix action (content is mock; the flow gap is real). [P10 before](../screenshots/P10/015-after-onboarding.png) · [after gym setup](../screenshots/P10/081-today-after.png) · [source buried in Preferences](../screenshots/P10/099-s2-prefs-up2.png). ✔ **Rule location (P10's claim confirmed):** once `gymProfile.setupCompletedAt` is set, `TrainingNutritionService.loadLifter` marks the user a lifter (`apps/api/src/application/training-nutrition/training-nutrition.service.ts` L122–136) and `resolveDailyTargets` applies `withLifterProtein` (`apps/api/src/application/preferences/preferences.service.ts` L226; `packages/utils/src/training-nutrition.ts` L84–93): protein = bodyweight × goal rate (GAIN 1.8, LOSE 2.0, MAINTAIN/EAT_HEALTHIER 1.6, L35–42) and carbs absorb the difference so kcal stay fixed. For a 58 kg MAINTAIN user that is 93 g, _lower_ than the 22 % split (128 g); for P06 (102 kg, LOSE) it was _higher_ (184 → 204 g). Same silent rule, opposite directions. Premium is unrelated.
- **Observed:** Targets appear without source (2,000/125 g default; 2,099/184 g for P06); protein moved 184 → 204 → 203 g between sessions without notice (P06), 133 → 101 g (P02); "PLAN ON TRACK" isn't tappable or explained; "−79 %" computed from one partial day; "Learned from 0 likes · 0 dislikes" chips; 68 g vs 45 g protein on the same recipe screen (P02). The app's own generated days say "Protein short by 35/87/106 g — add a snack" and use 1¾–2× portions (1,120–1,300 kcal meals) to hit targets, including for a man told to lose weight.
- **Inferred:** Low-confidence and sceptical users read unexplained numbers as either wrong or judgemental. The only explanation that exists (Preferences › Goal & body, D13) is excellent and hidden.
- **Root cause (✔/~):** protein g/kg rates GAIN 1.8, LOSE 2.0, MAINTAIN 1.6 once **gym setup is complete** (the lifter rule; corrected in v3, see the P10 addition above); "because you train" note (`packages/utils/src/training-nutrition.ts` L35–42, L195). For a 102 kg novice on Lose that is 2.0 g/kg × total body weight = 203 g, which the plan can't reach, hence the "add a snack" nudges (inferred from P06-M40 figures). The P06 switch from 184 g to 204 g coincides with finishing gym setup (P06 sweep). Portion multipliers are how plans hit kcal targets (observed).
- **Artifact:** the AI days' exact macros are mock; the curated day (free) shows the same contradiction, so it is real.
- **Confidence:** High.

<a id="ci-07"></a>

### CI-07 — "Regenerate is hidden, and the 'Regenerate this week' button after upgrading doesn't regenerate"

- **Type:** Confusion, Bug · **Reach:** 6/10 — P01, P02, P03, P04, P06, P10 · **Severity:** max 3, mean 2.4 · **Stage:** first value, pay
- **Evidence:** P01-M32, P02-M25, P03-M38, P04-M20, P06-M14 ·
  [post-upgrade sheet](../screenshots/P02/055-upgrade.png) ·
  [lands on the unchanged current week](../screenshots/P06/042-after-regen.png) ·
  [the real control, behind the week chevron](../screenshots/P02/058-week-menu.png)
- **Quotes:** "I tapped 'regenerate' and it... just showed me the plan? Where's the button?" (P02) · "Did it do anything? Same meatballs." (P04)
- **Added from P10:** P10-M24 (Sev 3): "It said it would rebuild my week around me. Nothing happened. Did it even run?" — sixth of six personas who tapped it.
- **Observed:** Regenerate Week, Cook-once and My Weeks live in a sheet behind a small chevron next to the week label; P01 found it only after targets changed and the plan showed "1030 kcal under target". The post-upgrade sheet's "Regenerate this week →" only opens Plan on the current (often nearly over) week and regenerates nothing — five of five personas who tapped it were confused.
- **Root cause (✔):** the sheet item maps to `'/meal-plan'` and only calls `router.push` (`apps/mobile/src/features/premium/post-upgrade-sheet.tsx` L23, L49); Plan opens on `weekOffset` 0 (`apps/mobile/app/(food)/meal-plan.tsx` L54).
- **Confidence:** High.

<a id="ci-08"></a>

### CI-08 — "Search says I have no recipes, and can't find pasta, cabbage or anything quick"

- **Type:** Confusion, Bug, Missing · **Reach:** 6/10 — P01, P03, P04, P05, P08, P09 · **Severity:** max 3, mean 2.0 · **Stage:** daily loop (cookbook)
- **Evidence:** P01-M35, P03-M16, P03-M19, P03-M20, P03-M44, P03-M45, P04-M44, P04-M45, P05-M08 (empty state never mentions Import), P05-M18, P05-M36, P05-M41, P05-M42, P05-M57, P08-M28, P08-M29, P08-M37 ·
  [All + no-match = "No recipes yet"](../screenshots/P08/055-search-cabbage.png) ·
  [imports missing from "All"](../screenshots/P05/035-all-tab.png) ·
  [Mine: "arrives on mobile soon" next to "+ New"](../screenshots/P05/095-s2-fav-tap.png)
- **Quotes:** "No recipes? I just got 21." (P01) · "'All' doesn't include mine?" (P05) · "No cabbage, no pork — the two things every Romanian kitchen has." (P08)
- **Added from P07/P09:** P09-M28: "quick" returns nothing and there is no time filter; dinners shown are 30–40 min for a parent with a one-hour window (same gap as P05-M36). [P09 search "quick"](../screenshots/P09/079-s2-search-quick.png).
- **Observed:** A no-match search on **All** shows the first-run empty state "No recipes yet — Recipes from your meal plans appear here" (4 personas). Imported recipes appear under Mine but not All (P05 nearly re-imported). Search text persists across tabs, so Mine shows "No custom recipes yet — Recipe creation arrives on mobile soon — use the web app" beside a working "+ New" (P03, P04, P05, P08). Search is literal on names (pasta ≠ spaghetti, "quick"/"cheap"/"easy" match nothing). Discover filters: meal type + "≤ 30 min" only; no ≤ 15 min, price, skill or equipment. The catalogue has no cabbage or pork dishes. Organisation = one heart; no folders.
- **Root cause (✔):** All = recipes referenced by the user's meal plans only (`packages/database/src/repositories/favourite-recipe.repository.ts` L186–207); the empty state renders whenever the list is empty, ignoring an active search (`apps/mobile/app/(food)/recipes.tsx` L220–221, copy L355).
- **Confidence:** High.

<a id="ci-09"></a>

### CI-09 — "Welcome back? I've never been here"

- **Type:** Confusion · **Reach:** 10/10 — all · **Severity:** max 2, mean 1.3 · **Stage:** sign-up
- **Evidence:** P01-M01, P01-M02, P02-M02, P03-M01, P03-M02, P04-M01, P05-M01, P06-M01, P08-M01, P08-M02 ·
  [first launch](../screenshots/P03/001-first-launch.png) · [register subtitle "Meal planning that fits your goals"](../screenshots/P01/002-register.png)
- **Quotes:** "Welcome back? I've literally never been here. Is this even the right app?" (P03) · "Meal planning? My friend said it does workouts." (P01)
- **Added from P07/P09:** P07-M02, P09-M01 ("did I get the gym app?"). P07-M03: the register form re-centres on every keyboard open/close, so fields jump under the finger (Android).
- **Added from P10:** P10-M01. **10/10.**
- **Observed:** A fresh install opens on "Welcome back / Sign in" with no logo, value statement or "new here?" path above the fold; "Create one" is a small link. The register subtitle mentions only meal planning, not training, households or the pantry that brought P01, P03 and P08.
- **Inferred:** Low severity each time, but it is the first impression for 100 % of new users and it mis-states the product for gym and zero-waste users.
- **Root cause (✔):** unauthenticated users only get the `(auth)` group (`apps/mobile/app/_layout.tsx` L108–110), whose index redirects to `/login` (`apps/mobile/app/(auth)/index.tsx` L4), titled "Welcome back" (`login.tsx` L48).
- **Confidence:** High.

<a id="ci-10"></a>

### CI-10 — "I told it what my family can't eat, and it served it anyway" ⚑ safety

- **Type:** Trust, Bug (blocks goals) · **Reach:** 4/10 — P04, P05, P06, P10 · **Severity:** max 4, mean 3.3 · **Stage:** onboarding → first value (plan)
- **Evidence:** P04-M12, P04-M13, P04-M39, P05-M25, P05-M30, P05-M31, P05-M48, P06-M04, P06-M39 ·
  [P04 parfait with granola + almonds in photo](../screenshots/P04/049-parfait-detail.png) ·
  [P05 eggs ×4 despite "no eggs"](../screenshots/P05/048-wk-tue.png) ·
  [P05 badges appear once "eggs" is an allergy](../screenshots/P05/066-plan-after-prefs.png)
- **Quotes:** "There are almonds in the picture. I can't trust this with Luca." (P04) · "I literally typed 'no eggs'. It didn't even try." (P05)
- **Added from P10:** **P10-M16, P10-M49 (coeliac).** Vegan + gluten-free held in every planned and swapped dish (P10-M12, D16) — but the gluten list (✔ `safety.ts` L71–94) lacks spelt, seitan, semolina, malt, stock/bouillon and curry powder, and there is no "may contain / check label" concept; curated recipes with 600 ml vegetable stock and 15 g curry powder carry a hard-coded "gluten-free" tag (`apps/api/src/lib/curated-recipes/extra-pool.ts`, per P10 sweep). [paella: stock tagged GF](../screenshots/P10/034-paella-ingr.png). "One recipe with barley malt or regular oats tagged 'gluten-free'" is P10's delete trigger.
- **Observed:** (a) A tree-nut household was planned a Greek Yogurt Parfait whose ingredients list 40 g granola and whose photo shows flaked almonds, twice in the curated week (P04). (b) Ana's dislikes "fish, green vegetables" were saved (DB-verified by P04) yet the week had cod ×2, salmon, green beans (P04). (c) "no eggs" entered as a dietary restriction produced 4 egg slots with no badge; the same word entered as an _allergy_ instantly produced red "Contains eggs" badges and an egg-free regeneration (P05). (d) "pre-diabetes" typed as a restriction became a chip and changed nothing (P06).
- **Inferred:** The matcher is keyword-based and the UI accepts any free text without read-back, so users cannot tell which words the app understood. The failure mode is silent, which is the worst case for an allergy.
- **Root cause (✔ verified):** `apps/api/src/lib/curated-recipes/safety.ts`
  - Tree-nut patterns (L48–61) have no "granola"/"muesli"/"praline-coated"/"pesto"; granola appears only in the gluten list (L82). Ingredient text is matched, not the photo or description (L214–217).
  - Dislikes are matched as the raw word only (L233–235): "fish" does not expand to the `FISH_PATTERNS` family (L96–107) that allergies use (L161), so cod/salmon pass; "green vegetables" matches nothing.
  - Unknown restrictions fall through `RESTRICTION_RULES` (L170–195) and are matched as a literal phrase (L237–242): "no eggs" → `\bno egg`, "pre-diabetes" → `\bpre-diabete` (the plural-strip in `normalizeTerm` L198–201 even mangles it). There is no lacto-vegetarian / egg-free rule.
  - Allergy "eggs" works because `ALLERGEN_PATTERNS.egg` exists (L157).
- **Artifact:** The AI (premium) weeks are canned mock output; the fish/granola repeats in P04's AI week (P04-M23) are not evidence about the real model. The curated (free) weeks are real product behaviour.
- **Confidence:** High (reproduced in two personas, root cause in code).
- **Validate with real users:** how allergy households phrase restrictions (free text vs chips), and whether "may contain" categories (granola, chocolate, pesto, baked goods) are expected to be excluded.

<a id="ci-11"></a>

### CI-11 — "It plans 28 meals a week; I cook four dinners (or one Sunday batch)"

- **Type:** Missing · **Reach:** 5/10 — P02, P04, P05, P08, P10 · **Severity:** max 3, mean 2.7 · **Stage:** first value (plan)
- **Evidence:** P02-M11, P02-M12, P02-M27, P02-M41 (Cook-once toggle not persisted), P02-M48, P04-M11, P04-M22, P04-M41, P05-M24, P05-M27, P05-M36, P05-M56, P08-M11, P08-M13 ·
  [P02 a different lunch every day](../screenshots/P02/023-plan-tue.png) ·
  [P05 week sheet: 7 days × 4 meals, kcal only](../screenshots/P05/053-week-sheet.png) ·
  [P04 AI week adds a 4th meal](../screenshots/P04/060-ai-plan.png)
- **Quotes:** "This is a restaurant menu, not a meal-prep plan. I cook lunch ONCE on Sunday." (P02) · "I only wanted dinners." (P04) · "Let me say 'four quick dinners for two, from my saved recipes'." (P05)
- **Added from P10:** P10-M13: heavy repetition (Mon = Fri, Tue ≈ Sat, Sun/Wed share lunch + dinner) and 3–5 meals/day with no explanation — "four menus on repeat".
- **Observed:** Generate asks nothing and produces 7 days × breakfast/lunch/dinner(/snack) at a kcal target. There is no input for which meals, which nights, cooking time, servings, "same lunch Mon–Thu", or "use what I have". Generated dinners were 27–45 min for a "15-minute" persona. "Cook once, eat twice" only turns a dinner into next-day lunch (P02, P08); P02 hand-built her prep with 3 swaps that landed at mismatched portions (1× vs 1½×).
- **Root cause (✔):** meals-per-day is only asked in the premium onboarding branch (`CuisineStep`, `apps/mobile/src/features/preferences/components/cuisine-step.tsx` L80–81); free users keep the default 3 (`apps/mobile/src/features/onboarding/onboarding-wizard.tsx` L118–121); no Preferences control (P04-M41, P05-M56). No time, nights or batch-cook model exists (sweeps of P02, P04, P05).
- **Artifact:** the 4th (snack) meal in AI weeks may be mock (P02-M48); the free curated weeks are 3 meals.
- **Confidence:** High.
- **Validate:** how many meals/nights each segment actually wants planned; whether "batch lunch" is a distinct job from "leftovers".

<a id="ci-12"></a>

### CI-12 — "The premium pitch doesn't mention what sent me there, and 'free for now' worries me"

- **Type:** Trust, Confusion · **Reach:** 9/10 — P01, P02, P04, P05, P06, P07, P08, P09, P10 · **Severity:** max 2, mean 1.8 · **Stage:** pay
- **Evidence:** P01-M56, P02-M45, P04-M18, P05-M10, P05-M13, P06-M13, P08-M10, P08-M32 ·
  [Profile "Go Premium" after "See Premium" from the pantry](../screenshots/P08/023-see-premium.png) ·
  [P04 pitch about "nutrition profile"](../screenshots/P04/053-see-premium.png)
- **Quotes:** "'Free for now' — and then what? How much?" (P05) · "I don't care about my nutrition profile. Does it do the four portions?" (P04) · "If it asks for a card later, I delete it." (P08)
- **Added from P07/P09:** P07-M10 — upgraded because "your personal nutrition profile" sounded like custom targets; it isn't (CI-21). P09-M18 — the only premium pitch is about AI meal plans, so the gym-first persona never considered it ("Nothing here for the gym bit"); P09 stayed free.
- **Added from P10:** P10 upgraded on "AI meal plans tailored to your goals" and got a non-regenerating CTA (CI-07) and an AI week visibly worse than the free one (CI-06). P10-M23, P10-M54: "Meal plans generated 1/3" counts the curated (non-AI) plan and an unsaved import counts against the import quota — quota copy that doesn't match what the user did (P02-M29 saw the same).
- **Observed:** Every "See Premium" lands on Profile, whose card sells "AI meal plans tailored to your goals, AI-powered swaps, and your personal nutrition profile" — not import, pantry, household scaling, budget or training-day calories, which are what the personas were blocked on. Upgrade is one tap with no summary, price or terms; downgrade is also instant with no "you'll lose…" (P02-M45). The post-upgrade sheet varies by entry point and sometimes leads with "Set your goal & body metrics" (P05-M51).
- **Artifact:** pricing is not real in this beta; judge mechanics and persuasion only.
- **Confidence:** High.

<a id="ci-13"></a>

### CI-13 — "It's the weekend: why is it showing me the week that's ending — or next week's meals as this week's?"

- **Type:** Confusion, Bug · **Reach:** 7/10 — P01, P02, P03, P04, P05, P08, P10 · **Severity:** max **3**, mean 1.8 · **Stage:** first value (plan, shop)
- **Evidence:** P01-M34, P02-M09, P02-M44, P03-M17, P03-M35, P04-M34, P05-M33, P08-M12, P08-M17 ·
  [P08 Shop "THIS WEEK" showing next week's 87 items](../screenshots/P08/032-tobuy.png) ·
  [next week's empty state says "this week"](../screenshots/P05/044-plan-next.png)
- **Quotes:** "It's Saturday, why would I plan this week?" (P02) · "Which list is this? I planned next week." (P04)
- **Added from P10:** **P10-M10, M30, M48 (Bug, Sev 3) — now a verified data bug, not just a default.** On a Sunday with a plan only for next week, Plan "THIS WEEK", Shop "THIS WEEK · Week of 21 September" (€210.12 = next week's cost) and Today all showed next week's plan; Today and Plan even showed two different "today" menus. [Shop this week = next week's items](../screenshots/P10/113-sw-shop.png) · [Today shows next week's Sunday](../screenshots/P10/082-today-scroll.png). ✔ **Cause (P10's claim confirmed):** `MealPlanRepository.findActiveWithDays` returns the newest ACTIVE plan by `createdAt` with no week filter (`packages/database/src/repositories/meal-plan.repository.ts` L309–315), and three readers use it for "now": the Plan fallback for offset 0 (`apps/api/src/application/meal-plan/meal-plan.service.ts` L934–937), the shopping-list fallback (`shopping-list.service.ts` L356–359) and Today (`apps/api/src/application/dashboard/dashboard.service.ts` L189). Creating a plan archives only the same week's plan (`meal-plan.service.ts` L521), so a future week's plan stays ACTIVE and wins. It will hit every user who plans ahead, which "Plan my week every Sunday" (default on) makes routine.
- **Observed:** Plan and Shop default to the current week on Saturday/Sunday; a plan generated on Saturday fills Mon–Fri already past (P03); next week's empty state reads "No meal plan for this week"; Shop "THIS WEEK · Week of 21 September" displayed next week's list and total when this week had no plan (P02, P08); Shop "covers Sat–Sun" next to a full-week total; "Save this week" in My Weeks saved an unstated week (P02-M44).
- **Root cause (✔):** with no plan for offset 0 the shopping-list service falls back to the newest active plan (`apps/api/src/application/shopping-list/shopping-list.service.ts` L356–359; `packages/database/src/repositories/meal-plan.repository.ts` L310–316), while mobile labels the list by offset and its own Monday (`apps/mobile/app/(food)/shopping-list.tsx` L236, L242).
- **Correction:** P05-M35 and P08-M06 say the Today "Weekly outlook" showed _last_ week on Sunday 27. The strip is Mon–Sun of the current week in local time, as horizontal 52-px chips (`apps/mobile/src/features/dashboard/components/week-outlook.tsx` L17–29, L42–57); Sunday (today) is clipped off the right edge, as P02 and P06 described. Real finding: today's chip is off-screen; not a wrong week.
- **Artifact:** all sessions ran on Sat 26 / Sun 27 (the weekend makes this worse than average).
- **Confidence:** High.

<a id="ci-14"></a>

### CI-14 — "The keyboard hides the button, and the number pad has no Done"

- **Type:** Frustration · **Reach:** 7/10 — P02, P04, P05, P06, P07, P08, P10 · **Severity:** max 2, mean 1.7 · **Stage:** onboarding, daily loop
- **Evidence:** P02-M07, P04-M05, P05-M39, P06-M06, P06-M25, P08-M03, P08-M21 · [P06 metrics pad covers Finish](../screenshots/P06/022-metrics-kbd.png) · [P04 typing blind into Allergies](../screenshots/P04/016-luca-allergy-focus.png)
- **Added from P07/P09:** P07-M30 (weight field hidden under the keypad, page jumps to top on first tap — Android, so this is not iOS-only), P07-M03 (register fields jump). [P07 weight field](../screenshots/P07/102-s2-weight-focus.png).
- **Added from P10:** P10-M06: keyboard stays up after adding a diet chip and hides Continue.
- **Observed:** Onboarding body metrics, household allergy/dislike fields, weight card, pantry qty and shop "Add item" all let the keyboard cover the field or the primary button; numeric pads have no Done/Next (except gym starting weights, which do — P02); first tap on "+" only dismisses the keyboard (P08).
- **Confidence:** High (first seen on iOS; P07 later showed it on Android too).

<a id="ci-15"></a>

### CI-15 — "Little things look unfinished" (visual and copy defects)

- **Type:** Bug · **Reach:** 8/10 — P02, P03, P04, P05, P07, P08, P09, P10 · **Severity:** max 2, mean 1.1 · **Stage:** throughout
- **Evidence:** P02-M03, P02-M15, P02-M16, P02-M21, P02-M22 / P03-M09 ("One last thing…" with nothing asked), P02-M36, P03-M32, P03-M46, P04-M43, P05-M02, P05-M06, P05-M21, P05-M23, P05-M55, P08-M18, P08-M25, P08-M38 ·
  [stock photo of people for a bagel](../screenshots/P02/029-thu-after-swap.png) · ["Nutrition Facts per 4 servings — 720 kcal"](../screenshots/P04/125-sw-rate.png)
- **Added from P07/P09:** P07-M14 (macro boxes lose their labels once filled), P07-M15 (6.5 g displayed as 7 g), P09-M15 (Stats "More" shows internal copy "research §6.1/§6.2": ✔ `apps/mobile/src/features/gym/stats/stats-tab.tsx` L52), P09-M22 (session detail numbers working sets from 2 when a warm-up exists: ✔ `apps/mobile/src/features/gym/history/session-detail-screen.tsx` L141–142 uses the array index incl. warm-ups).
- **Added from P10:** P10-M17 ("1.7 / 5" servings wrap; "3.1 ml cinnamon", "2 to taste salt"), P10-M18 (chickpea photo on a bread bed — alarming for a coeliac).
- **Observed:** Stale "Passwords do not match"; wrong stock photos (bagel = couple, red pepper = chilli, telemea = gadget); "Nutrition Facts per N servings" label follows the stepper while values stay per 1 serving (3 personas); two protein numbers on one recipe; truncated unit boxes ("piec", "tbs"); stuck spinner on Gym Today; spell-check on the email field; blank image for imported recipes; "?" boxes instead of icons.
- **Root cause (~):** the "?" boxes are Unicode emoji/dingbats rendered as text (`apps/mobile/src/features/preferences/types.ts` L30–51 via `goal-step.tsx` L59; `recipes.tsx` L346, L354). They appeared only on lane L1 (iPhone 16e, iOS 26 sim: P03, P05); P06 on L2 saw the emoji. **Likely a simulator glyph artifact — verify on a real device** before counting it.
- **Inferred:** Each defect is minor; together they matter for polish-sensitive personas (P02: "small things look unfinished") and for trust in numbers (CI-05).
- **Confidence:** High (per defect).

<a id="ci-16"></a>

### CI-16 — "My budget is a premium feature, and even then the plan goes over it"

- **Type:** Missing, Frustration · **Reach:** 3/10 — P01, P03, P08 · **Severity:** max 3, mean 3.0 · **Stage:** onboarding → first value
- **Evidence:** P01-M33, P03-M15, P03-M36, P03-M40, P08-M60 · [P03 typed $60, silently not saved](../screenshots/P03/078-budget-after.png) · [P03 premium plan $69.79, no warning](../screenshots/P03/089-regen-budget.png)
- **Quotes:** "So I typed it for nothing?" (P03) · "I literally told it 60. It says 69." (P03) · "531 lei? My Lidl food costs half." (P01)
- **Observed:** No budget or "cheap" question in onboarding; the weekly-budget field in Preferences is editable on free but has no save and stores nothing (DB-verified by P03); after upgrading and saving $60, the regenerated week cost $69.79 with no over-budget signal; no per-recipe price and no cost filter; P01's muscle-gain plan doubled to ≈531 RON with no "use my staples" option.
- **Root cause (✔):** see CI-02 (`preferences.tsx` L297–310; `preferences.router.ts` L102).
- **Artifact:** whether the real AI respects the budget is untestable under mock; the missing over-budget signal and the free-tier silent non-save are real.
- **Confidence:** High on UI; Low on real budget adherence.

<a id="ci-17"></a>

### CI-17 — "My partner can't see the list or the plan"

- **Type:** Missing · **Reach:** 3/10 — P02, P04, P08 · **Severity:** max 3, mean 2.8 · **Stage:** daily loop (shop)
- **Evidence:** P02-M30, P04-M27, P04-M48, P08-M54 · [P08 79-line list, no share](../screenshots/P08/119-s2-tobuy-bottom.png)
- **Quotes:** "How do I send this to Mihai?" (P04) · "79 lines won't fit on one screenshot." (P08) · "I'd screenshot it and send it to myself." (P02)
- **Observed:** No share/export/copy on To buy or In my kitchen; household members are profiles without login. Today's workflows (shared Google Keep, WhatsApp) cannot move in.
- **Root cause (✔):** the only `Share.share` uses are account-data export and gym CSV (`apps/mobile/src/features/profile/account-data-card.tsx` L25; `apps/mobile/src/features/gym/export/export-row.tsx` L30).
- **Confidence:** High.

<a id="ci-18"></a>

### CI-18 — "Regenerate wiped the meals I'd chosen, without asking"

- **Type:** Frustration · **Reach:** 3/10 — P02, P04, P05 · **Severity:** max 3, mean 2.7 · **Stage:** first value, daily loop
- **Evidence:** P02-M26, P04-M15, P05-M32 · [P05 her two imported dinners gone](../screenshots/P05/068-regen-mon.png) · [P02 week sheet](../screenshots/P02/069-nextweek-sheet.png)
- **Quotes:** "So I lost my edits." (P02) · "It threw away my recipes without asking." (P05)
- **Observed:** Regenerate Week replaces all 21–28 meals instantly; manual swaps and user-placed own recipes are lost; no confirmation, no "keep my picks", no undo. AI swap on a single meal also has no preview or undo (P02-M40; see CI-34).
- **Root cause (✔):** the button calls `onRegenerate` → `generateWithConsent` directly (`apps/mobile/src/features/meal-plan/week-summary-sheet.tsx` L77–84; `apps/mobile/app/(food)/meal-plan.tsx` L112–117, L472); the only gate is the one-time AI consent.
- **Confidence:** High.

<a id="ci-19"></a>

### CI-19 — "It never shows me it checked"

- **Type:** Trust, Missing · **Reach:** 4/10 — P04, P05, P06, P10 · **Severity:** max 3, mean 2.5 · **Stage:** onboarding → plan → shop → cook
- **Evidence:** P04-M04, P04-M08, P04-M23, P04-M26, P04-M29, P04-M36, P04-M40, P05-M04, P05-M30, P06-M04 ·
  [P04 shopping list: granola + dark chocolate, no warning](../screenshots/P04/072-shop-grains.png) ·
  [P05 omelette tagged "vegetarian", no conflict badge](../screenshots/P05/061-omelette-detail.png) ·
  [P06 "pre-diabetes" chip, no acknowledgement](../screenshots/P06/017-diet-added.png)
- **Quotes:** "I typed two words into a box. Does it know that means walnuts?" (P04) · "Put a green 'Safe for Luca — no tree nuts' badge on every recipe, and mean it." (P04)
- **Added from P10:** **P10-M05, M33, M55.** Vegan/gluten typed as free-text chips with no read-back ("Does it know gluten means barley and non-certified oats?"); the Replace list and Discover are filtered (or look filtered) but never say so, so she probed with "pasta" and "bread" to believe it; no "check the label is certified GF" on stock or curry powder (P10-M16). [Discover "pasta": generic no-match](../screenshots/P10/121-sw-discover-pasta.png).
- **Observed:** Allergies/diets are free text with no pick-list and no read-back of what they will exclude (P04, P05, P06). No plan card, recipe, swap row or shopping line says "checked for tree nuts / egg-free / safe for Luca". Discover _is_ silently filtered by the household list (P04-M40, verified by P04 with an "Almond Butter" search) but says nothing. The only place the allergy is visibly "known" is the mock AI Chef echo (P04-M29). The recipe description "nutty brown rice" and unflagged sesame alarmed P04 (M36). Allergies were asked twice in the household flow, the second time empty (P04-M08).
- **Inferred:** For EpiPen-level users the _display_ of the check is the product; without it they re-check every recipe and the app saves no effort (P04 exit: "then what's the point?"). Conflict badges exist (they appear for allergies: P05-M31), so the pattern is half-built.
- **Root cause (✔/~):** badges come from `findSafetyIssues` (`safety.ts` L256–267), which reports only allergies and _recognised_ restrictions and deliberately never dislikes (L252–255 comment). There is no positive "safe for" state anywhere. Free-text inputs: see CI-10.
- **Artifact:** none (all surfaces observed on real curated data).
- **Confidence:** High.
- **Validate:** which reassurance format allergy parents trust (badge per recipe vs per-plan statement vs ingredient-level), and liability wording (see stage 2 risks).

<a id="ci-20"></a>

### CI-20 — "Food and training feel like two apps" (and endurance training doesn't exist)

- **Type:** Missing, Confusion · **Reach:** 4/10 — P01, P02, P03, P10 · **Severity:** max 3, mean 2.5 · **Stage:** onboarding, daily loop
- **Evidence:** P01-M27, P01-M38, P02-M17, P02-M35, P02-M38, P02-M42, P03-M13 (counter-evidence: P02-M34, P03-M26, P03-M29 cross-links) ·
  [P02 M/W/F kcal lower than rest days](../screenshots/P02/095-nextweek-glance.png) ·
  [post-workout "30 g protein" → 12 g breakfast](../screenshots/P02/084-nextup-meal.png)
- **Quotes:** "So it knows I trained, but my calories didn't move." (P02) · "No. It doesn't know. Wednesday is my lowest day." (P02)
- **Added from P07/P09:** Counter-evidence: P09-M19 — the post-workout protein nudge was the one visible bridge and he liked it.
- **Added from P10:** **P10-M20 (Sev 3), P10-M51.** She told the gym wizard she lifts Tue/Fri; the food plan gives lift days, rest days and her 25 km long-run days identical targets; running/cardio isn't modelled anywhere. ✔ Per-day training fuel exists only for GAIN_MUSCLE (`hasTrainingDayBump`, `packages/utils/src/training-nutrition.ts` L60). The only visible effect of gym setup on food is the silent protein change (CI-06).
- **Observed:** Gym onboarding data (5×/week, Experienced) didn't reach food targets (P01); training days are asked only in gym setup; Today's target stays static after a session; training days are not marked in Plan; the training-day bump is shown locked to free users (P01). The post-workout nudge "Aim for ~30 g protein" links to the next planned meal regardless of its protein (12 g oats, P02). Good cross-links exist: the post-workout nudge and "Today's workout" card on Food Today (P03 liked both).
- **Root cause (✔):** `trainingNutrition` premium gate (see CI-02). The AI prompt does request a training-day bonus (`apps/api/src/lib/ai/prompts.ts` `buildTrainingDaysSection` L109, used at L188), so the flat AI week is a **mock artifact**; the free-tier absence and the missing UI marker are real.
- **Confidence:** Medium-High.

<a id="ci-21"></a>

### CI-21 — "It doesn't let me state my actual goal — or type my own targets"

- **Type:** Missing · **Reach:** 5/10 — P01, P02, P06, P07, P10 · **Severity:** max **4**, mean 2.8 · **Stage:** onboarding, return
- **Evidence:** P01-M30, P02-M05, P06-M05, P06-M33 · [P01 protein computed, no override](../screenshots/P01/105-calorie-card.png) · [P06 no goal weight in Progress](../screenshots/P06/101-s2-progress-2.png)
- **Quotes:** "I'd type 180 if it let me." (P01) · "Recomp isn't here." (P02) · "There's no line for where I'm meant to get to." (P06)
- **Added from P07/P09:** **P07-M05, P07-M06 (Sev 4), P07-M33.** A precision tracker with coach-set targets (2,000 kcal / 150 g) cannot enter them on any tier: onboarding and Preferences show a read-only computed 1,669 kcal / 146 g; the only lever is lying about activity; premium "Full setup: cuisine, cadence & targets" has no target step. Every downstream signal (ring, "73 over", orange bars) then judges her against a number she rejects. Also no goal weight (61 kg) or rate of loss (P07-M33). [read-only target](../screenshots/P07/018-tap-target.png) · ["Full setup … & targets" without targets](../screenshots/P07/039-setup-4.png). ✔ Verified: targets always come from `resolveDailyTargets` (`apps/api/src/application/preferences/preferences.service.ts` L177–222): computed from body metrics when present (L204–213), the stored `dailyCalorieTarget` only as a fallback when metrics are missing (L214), plus the coach dial with a 1,200 floor (L219). No procedure sets a manual kcal/protein target; premium `updateTargets` is goal/metrics/cuisine/cadence (`apps/api/src/routers/preferences.router.ts` L101–104). P07's claim "no way to set your own target on any tier" is **confirmed**.
- **Added from P10:** P10-M07: goals are weight-centric; nothing for endurance / "fuel my training".
- **Observed:** Goals are Lose / Maintain / Gain / Eat healthier; no recomposition, no target weight or pace, no own protein/kcal target.
- **Root cause (✔):** `ChefProfile` has `weightKg` and `goal` but no target weight or protein field (`packages/database/prisma/schema.prisma` L205–234); protein is always computed (`training-nutrition.ts` L35–42).
- **Confidence:** High.

<a id="ci-22"></a>

### CI-22 — "The shopping list itself creates waste"

- **Type:** Frustration, Trust · **Reach:** 3/10 — P02, P04, P08 · **Severity:** max 3, mean 2.4 · **Stage:** first value (shop)
- **Evidence:** P02-M13 (quantities), P04-M42, P08-M16, P08-M22 (list jumps on tick), P08-M24, P08-M41, P08-M62 · [P08 produce: 0.8 lemon, 3.5 g rosemary, duplicates](../screenshots/P08/035-produce2.png) · [P08 six cheeses in 20–150 g](../screenshots/P08/047-dairy.png)
- **Quotes:** "Nobody sells 0.8 of a lemon." · "That's a fridge full of half-open packets." (P08)
- **Observed:** 71–87 lines for one person; fractional counts (3.3 lemons, 1.4 avocados, 6.5 spring onions); micro-amounts (3.5 g rosemary, 60 g radishes); near-duplicates not merged (lemon + lemon juice + lime juice; baby + new potatoes); six different cheeses in tiny quantities; household portions rounded up (P04 3.25 → 4, P08 2.25 → 3), so kids' ½ portions don't shrink the list.
- **Root cause (✔ rounding):** `ceil(1 + Σ member portionFactor)` (`packages/utils/src/household.ts` L13–17). Aggregation by purchasable unit does not exist (observed).
- **Artifact:** AI-week recipe mixes are mock; the curated weeks show the same fractions and micro-amounts.
- **Confidence:** High.

<a id="ci-23"></a>

### CI-23 — "Settings are scattered, and some I can't reach at all"

- **Type:** Missing, Confusion · **Reach:** 6/10 — P01, P02, P06, P07, P09, P10 · **Severity:** max 3, mean 2.3 · **Stage:** return (change something)
- **Evidence:** P01-M50, P01-M51, P01-M54 (offline banner while online), P02-M46, P06-M36, P06-M38, P06-M41, P06-M47 (Sign out with no confirmation) · [Gym settings, reachable only by deep link](../screenshots/P01/181-sw-gym-settings.png) · [P06 red Delete next to exercises](../screenshots/P06/112-s2-wed.png)
- **Quote:** "Not here… maybe on the gym bit?" (P06)
- **Added from P07/P09:** **P09-M25, P09-M30 (Blockers), P09-M31**: Pause training and workout reminders exist in Gym Settings but can't be reached; two of P09's four S2 goals failed on this alone. The Stats legend mentions "Paused" and "Flex week" but nothing is tappable; the nearest control is a red "Archive" in My routines. P09-M07 (red Delete beside Add exercise, same as P06-M38). P07-M08 (Units & currency button reads "Saved ✓" before and after a change: ✔ label is `displayMutation.isSuccess`, not dirty state — `apps/mobile/app/preferences.tsx` L283). ✔ P09's claim confirmed: the only `router.push('/gym/settings')` is the outbox card (`today-screen.tsx` L444–456; P09 cites L448). [P09 My routines: only Archive](../screenshots/P09/069-s2-my-routines.png).
- **Added from P10:** P10-M40: she looked for data/AI settings in Preferences; they live in Profile ("Privacy stuff under Profile, food stuff under Preferences").
- **Observed:** Gym settings (units, weekly goal, equipment incl. dip belt, reminder, pause) have no entry point; training days live in Routine › Edit; currency/goal/diet in Food › More › Preferences; notification push toggle off although the OS permission was granted in gym setup (P02); equipment can't be changed after setup (P06); a large red "Delete" (day) sits under the exercise list in Edit routine and the save is silent.
- **Root cause (✔):** the only `router.push('/gym/settings')` is the outbox banner on Gym Today, shown only when workouts are waiting to sync (`apps/mobile/src/features/gym/today/today-screen.tsx` L444–456; route registered at `apps/mobile/app/_layout.tsx` L106).
- **Confidence:** High.

<a id="ci-24"></a>

### CI-24 — "Wrong money and wrong units for where I live"

- **Type:** Confusion, Trust · **Reach:** 4/10 — P01, P03, P06, P07 (+P05, P09, P10 environment only) · **Severity:** max 3, mean 2.1 · **Stage:** onboarding → first value
- **Evidence:** P01-M05, P01-M29, P03-M06, P03-M18, P03-M34, P03-M43, P06-M10, P06-M35 · [P03 RON prices for a US user](../screenshots/P03/068-shop.png) · [P03 200 °C for an imperial user](../screenshots/P03/100-sweep-salmon-celsius.png)
- **Quotes:** "265 what? Is that dollars?" (P03) · "Dollars? I'm in Romania." (P01)
- **Added from P07/P09:** P07-M07 (Sev 3): Imperial + USD for a Romanian on an English-US Android phone, right after she typed cm/kg in onboarding. Same mechanism (✔ `packages/utils/src/locale.ts` L54–60, L86–102); unlike the iOS simulators this is a realistic case — many Europeans run their phone in en-US. Units typed in onboarding don't override the region default. P09's RON is the en_RO simulator (environment).
- **Added from P10:** P10-M11: RON for a Munich user (en_RO simulator — environment); switching to EUR was one tap with "Saved ✓" and the plan pill updated (P10-M39).
- **Observed:** Currency defaulted from the device region and was never shown or asked in onboarding; changing it is 3–4 levels deep (More › Preferences › scroll › Units & currency). Imperial conversion is partial: °C oven temperatures, some grams left, false precision (0.2 oz chives), cm/kg in Preferences › Goal & body, 24-hour reminder picker.
- **Root cause (✔):** region from the Intl locale at sign-up (`apps/mobile/app/(auth)/register.tsx` L71–73; `packages/utils/src/locale.ts` L54–60, L86–102; seeded in `apps/api/src/application/auth/auth.service.ts` L55, L70).
- **Artifact:** **environment:** every iOS simulator ran region en_RO, so RON for P03 (US), P05 (UK) and P06 (UK) is a study artifact; a real US/UK phone would get USD/GBP. P01 (en-US Android) getting USD/lb in Romania is the same mechanism with a realistic cause (English-US phones are common in RO). Product findings that stand: currency never shown or asked; imperial gaps.
- **Confidence:** Medium (reach inflated by the environment).

<a id="ci-25"></a>

### CI-25 — "The zero-waste pantry I installed for can't hold my fridge" ⚑

- **Type:** Blocker, Missing · **Reach:** 2/10 — P08, P05 · **Severity:** max 4, mean 3.4 · **Stage:** first value → daily loop
- **Evidence:** P08-M07, P08-M08, P08-M09, P08-M19, P08-M26, P08-M42, P08-M43, P08-M47, P08-M48, P08-M50 (chat ignores "pork must be used", no tap-through), P08-M51, P08-M56, P08-M57, P08-M61 (no "use soon" notification), P05-M37, P05-M39 ·
  [free kitchen: no way to add](../screenshots/P08/022-kitchen.png) ·
  [premium list asks to re-buy "Half a cabbage 4 pcs"](../screenshots/P08/095-tobuy-premium2.png) ·
  [kitchen items all "bought today", read-only](../screenshots/P08/050-kitchen-list.png)
- **Quotes:** "This isn't a pantry, it's a receipt." (P08) · "Four half-cabbages? I told you I HAVE half a cabbage." (P08)
- **Observed:** The pantry is a sub-tab ("In my kitchen") under Shop; P08 found it on the third try, and P05 on a guess; the AI Chef calls it the "Pantry page" (P05-M37). On free it has no add/edit/remove: items arrive only by ticking an app-generated list, so P08 smuggled her fridge in as fake shopping items (which then inflated the shop cost). Premium adds "Add something you have" + a trash can, still no dates ("bought today" on a week-old cabbage), no "used vs thrown away", no partial use. Cooking a recipe does not deduct anything (P08-M51). After a premium regenerate, the list asked her to buy "Half a cabbage 4 pcs" and "Courgettes 4 pcs" with no "have it" mark, next to a header claiming "Saved ~389,80 RON".
- **Inferred:** The pantry is designed as a by-product of the shopping list, not as the entry point that "zero-waste" users expect. Without dates the app cannot answer "what goes off first", which is P08's reason to exist in the app (tomorrow-score 2).
- **Root cause:**
  - ✔ Free tier cannot write: `pantry.addItem` / `removeItem` / `markOutOfStock` / `confirmWeekly` are `premiumProcedure` (`apps/api/src/routers/pantry.router.ts` L18, L31, L43, L53); only `list` is `protectedProcedure` (L13).
  - ✔ No expiry in the data model (P08-M56: `pantry_items` has name/quantity/unit/source/updatedAt only).
  - ✘ **Corrected:** P08-M43/M55 claimed mobile never renders `pantryCovered` ("grep … → none"). Mobile _does_ render a "Have it" chip and "· in your kitchen" (`apps/mobile/app/(food)/shopping-list.tsx` L469–481). The cabbage/courgette lines were not covered because the pantry held **less** than the need: the matcher refuses partial coverage (`apps/api/src/application/pantry/pantry-match.ts` L73–97, "3 eggs don't cover a list line of 11"); read-only DB: P08 pantry has `half a cabbage 1 pcs`, `courgettes 2 pcs` vs list lines of 4. The real gap is that partial coverage is invisible: the line shows the full quantity with no "you have 1" hint. Custom (user-added) lines are also never covered by design (`shopping-list.service.ts` L264–275).
- **Artifact:** Which meals used the pantry after regeneration is mock output (the mock injected "minced pork 1000 g; half a cabbage 2 pcs" into a salmon recipe, P08-M40); the "4 pcs" quantity is therefore mock-driven. The partial-coverage and no-dates findings stand regardless.
- **Confidence:** High for the free-tier and data-model gaps; Medium for how much partial coverage matters with real AI plans.
- **Validate:** whether waste-averse users will enter use-by dates (and in what granularity: date vs "today / this week / later"), and whether a daily "use soon" prompt is welcome.

<a id="ci-26"></a>

### CI-26 — "Other parts of the app suggest food my diet rules out"

- **Type:** Trust, Bug · **Reach:** 3/10 — P04, P05, P10 · **Severity:** max 4, mean 3.3 · **Stage:** daily loop (swap, "what can I cook")
- **Evidence:** P04-M32, P05-M38, P05-M49, P05-M28 (egg dishes still offered in the Replace list) ·
  [AI Chef pantry matches: omelette + turkey frittata for a no-egg vegetarian](../screenshots/P05/094-s2-chat2.png) ·
  [Replace list offers cod/salmon to a no-fish household](../screenshots/P04/086-s2-swap.png)
- **Quotes:** "Turkey sausage. Eggs. Twice. I'm ordering a takeaway." (P05) · "Why does it offer me cod again, when Ana doesn't eat fish?" (P04)
- **Added from P10:** **P10-M47 — the replace picker is unsafe by construction (root cause now traced; P10's claim confirmed).** The manual Replace list is `recipe.list` → every recipe referenced by any of the user's plans plus their own (`apps/mobile/src/features/meal-plan/recipe-picker-sheet.tsx` L64–73 → `apps/api/src/application/recipe/recipe.service.ts` L28–44 → `favourite-recipe.repository.ts` L186–207), with no safety filter; `replaceRecipe` checks only that the recipe is visible to the user (`apps/api/src/application/meal-plan/meal-plan.service.ts` L1151ff, `findRecipeVisibleTo`). This explains P04's cod offer (cod was in her plan) and P05's egg dishes. P10's list looked safe only because all her plans were; one imported or AI recipe with gluten would be offered as a swap. The AI single-meal swap _is_ safety-checked and stayed vegan + GF (P10 S2 step 3).
- **Observed:** The planner filters the curated pool, but the "what can I make" matches in AI Chef listed Spinach & Feta Omelette and Turkey Sausage Frittata to a vegetarian with an egg allergy; the manual Replace sheet lists every recipe, including fish for a no-fish household and egg dishes for a no-egg user, with no marker.
- **Root cause (✔):** `PantryService.whatCanIMake` (`apps/api/src/application/pantry/pantry.service.ts` L188–233) ranks the **whole** `CURATED_POOL_BY_TYPE` plus plan recipes (L198–202) without `filterSafeRecipes`. That text is built server-side, so it is a product finding even under mock AI (the mock merely calls the real tool: `apps/api/src/lib/ai/mock.ts` L527–528). The Replace sheet's list: see the P10 addition — traced in v3, it is not safety-filtered at all.
- **Artifact:** the mock ignored the ingredients P05 typed in her message (a real model might use them); the unsafe _list_ is real.
- **Confidence:** High.

<a id="ci-27"></a>

### CI-27 — "Ten taps to set a reminder time"

- **Type:** Frustration · **Reach:** 5/10 — P01, P02, P03, P06, P09 · **Severity:** max 2, mean 1.7 · **Stage:** onboarding (gym)
- **Evidence:** P01-M06, P02-M19, P03-M06, P06-M20 · [stepper at 07:00](../screenshots/P03/012-reminder-time.png)
- **Quotes:** "Just give me a clock." (P01) · "What's 16, is that 4pm?" (P03)
- **Added from P07/P09:** P09-M33: the reminder model is one fixed time on planned weekdays; no "nudge me if I haven't trained by Thursday" for people without fixed days. P09-M08, P09-M32: the iOS notification prompt fires cold at the first workout start with no rationale — it is the rest-timer permission (✔ `apps/mobile/src/features/gym/use-active-workout.ts` L86 → `rest-timer.ts` L132); declining silently disables locked-phone rest alerts. P09 declined reminders in onboarding and then had no way back (CI-23).
- **Observed:** Reminder time is a ± one-hour stepper from 07:00; 9–11 taps to reach an evening slot; 24-hour format for a US user. The contextual notification prompt itself was praised (P03-M07).
- **Confidence:** High.

<a id="ci-28"></a>

### CI-28 — "I have to know the calories to log what I ate"

- **Type:** Missing, Frustration · **Reach:** 3/10 — P01, P06, P07 · **Severity:** max **4**, mean 3.0 · **Stage:** daily loop (tracking)
- **Evidence:** P01-M43, P06-M27 · ["Enter the calories."](../screenshots/P06/086-qa-log-nokcal.png) · [Quick add sheet](../screenshots/P01/139-quick-add.png)
- **Quotes:** "How would I know? I'm not a calculator. That's why I've got the app." (P06) · "MyFitnessPal would've found 'chicken breast'." (P01)
- **Added from P07/P09:** **P07-M12 (Sev 4), P07-M13.** For someone who logs every bite: no food search/database, barcode, grams/servings, recents, favourites or copy-day; ~50 s and 9 taps per item typed from memory; copy frames all logging as "off-plan… log it honestly… roughly". The fast path that exists — ticking _planned_ meals with ½×–2× portion chips (P07-M40, delight) — is invisible without a plan. ✔ P07's "no food database" confirmed: no food-search/barcode procedure in `apps/api/src/routers/tracker.router.ts` (L56–168: getDay, upsertDay, logRecipe, logCustomMeal, deleteCustomMeal, summaries, weight) and no barcode/food-search code in `apps/mobile`. [Quick add](../screenshots/P07/041-quick-add.png).
- **Observed:** Quick add requires kcal; no food search, barcode, recents or "log again"; the only estimators are Snap-to-log (photo) and the premium AI Chef, neither offered from the Quick add sheet. P07 (the tracking persona) is pending and will weigh heavily here.
- **Root cause (✔):** `packages/utils/src/quick-add.ts` L52 (empty → "Enter the calories."), L71, L75.
- **Confidence:** High.

<a id="ci-29"></a>

### CI-29 — "It can't tell me how I'm doing"

- **Type:** Missing, Trust · **Reach:** 3/10 — P02, P06, P07 · **Severity:** max 3, mean 2.9 · **Stage:** return
- **Evidence:** P02-M42, P06-M32, P06-M33, P06-M44, P06-M45 · [P06 Progress "−79 %"](../screenshots/P06/100-s2-progress.png) · [P02 Progress food-only](../screenshots/P02/096-progress.png)
- **Quotes:** "Minus seventy-nine percent — have I done something wrong?" (P06) · "I want one screen: Mon lunch, Mon gym, Mon dinner." (P02)
- **Added from P07/P09:** P07-M33 (weight chart is one dot: no goal line, trend or weekly rate; onboarding weight not plotted), P07-M34 (no weekly adherence view — days in range, weekly average — for a logger without a plan). The "Days logged 0" P07 saw is the UTC bug (CI-45).
- **Observed:** Progress is food-log only: no workouts, no plan adherence, no goal line, no start weight; "vs target −79 %" from one partial day; weight input placeholder "72.5"; two different body weights (Preferences 102 kg vs weigh-in 101.6). No combined meals + workouts week view anywhere.
- **Root cause (✔/~):** no target-weight field (CI-21). Progress counted the UTC-dated chat entry and not the local-dated quick add (P06-M44; see CI-45).
- **Confidence:** Medium-High.

<a id="ci-30"></a>

### CI-30 — "It picked my split for me and hid the one I run"

- **Type:** Missing, Confusion · **Reach:** 2/10 — P01, P02 · **Severity:** max 3, mean 2.6 · **Stage:** onboarding (gym)
- **Evidence:** P01-M07, P01-M09, P01-M10, P01-M12, P01-M14 (the default program trips the editor's own "narrow range" tip), P01-M49, P01-M50, P02-M20 ·
  [P01 program preview, bottom not reached](../screenshots/P01/017-onb-program-end.png) ·
  [P02 finds "Choose another program" at the very bottom](../screenshots/P02/044-gym-choose-program.png) ·
  [P01 PPL template, found in the sweep behind "My routines"](../screenshots/P01/158-sw-templates-2.png)
- **Quotes:** "I run PPL. And no deadlifts?" (P01) · "Glad I scrolled." (P02)
- **Observed:** 5 days + Experienced produced Upper/Lower 4× plus "an optional 5th day"; the weekly goal became 4. P01 rebuilt one day by hand and gave up. P02 found her Upper/Lower 3× under "Choose another program" at the bottom of a long page. Starting weights take one number per exercise, with no reps and no slot for a lift outside the program (P01's deadlift 150).
- **Root cause (✔, with a correction):**
  - 5 days maps to `ul4` for both experience levels (`packages/utils/src/gym/templates.ts` L55–59); weekly goal is `template.daysPerWeek` (L225), stored as-is (`apps/api/src/application/gym/gym-profile.service.ts` L284, L312, L349) — so the goal follows the template (4), not the user's 5 days.
  - ✘ **Correction to P01-M07** ("no way on this screen to pick PPL"): the "Choose another program" list offers the three closest same-experience templates, which for 5 days are PPL 6×, FB 3×, UL 3× (`templates.ts` L71–79; UI `apps/mobile/src/features/gym/setup/setup-wizard.tsx` L523–550). P01's last screenshot stops at "Abs" in Weekly balance, above that link. The finding is **discoverability** (below a long preview), not absence. The editor still has no template entry point (P01-M49).
- **Confidence:** High.

<a id="ci-31"></a>

### CI-31 — Bug: "Next time" targets drop after a back-off set or skipped sets

- **Type:** Bug, Trust · **Reach:** 3/10 — P01, P09 (wrong targets), P03 (copy only) · **Severity:** max 3, mean 2.4 · **Stage:** daily loop (gym)
- **Evidence:** P01-M20, P01-M26, P01-M40, P01-M41, P01-M42, P03-M28 ·
  [bench 90 → "80 kg — same weight"](../screenshots/P01/087-workout-summary.png) ·
  [deadlift "40 kg × 10" after 150 × 5](../screenshots/P01/134-lower-summary.png) ·
  [Adjust is stepper-only: 44 taps](../screenshots/P01/135-dl-adjust.png)
- **Quotes:** "80?! This is exactly why I don't trust auto-progression." · "Forty taps. And it thinks I deadlift 40." (P01)
- **Added from P07/P09:** **P09-M12**: dumbbell bench suggested 8 kg, he lifted 16 kg × 12 × 2 and stopped early → "8 kg × 12/12/12 — You skipped a set, so same targets next time". ✔ Same `INCOMPLETE → hold state.next` rule (`progression.ts` L604–631) as P01's deadlift: an incomplete exercise discards what was actually lifted, which hurts most when a user corrects an under-estimated starting guess. [P09 summary](../screenshots/P09/044-summary.png).
- **Observed:** Bench 90×6, 90×6, 90×5 + back-off 80×8 → next "80 kg × 6/6/6 — Tough day, so same weight". Deadlift (swapped in) logged 150×5 with 2 sets skipped → next "40 kg × 10/10/10 — You skipped 2 sets, so same targets". No compound gained load in two sessions. Adjust has ± steppers only (2.5 kg). Copy says "+2.5 kg today" / "+5 lb today" about _next_ session (P01-M26, P03-M28).
- **Root cause (✔, with a correction):**
  - The working weight is the _lightest_ completed working set: `W = working.map(weightKg).reduce(easierOf)` (`packages/utils/src/gym/progression.ts` L574–585); the 5-rep set triggers `MISSED_ONCE`, hold at W (L418–422); copy in `packages/utils/src/gym/reasons.ts` L124–127. So a lighter back-off set becomes next week's weight regardless of order. P01's hypothesis ("back-off set read as working weight") is right in effect; the mechanism is "lightest", not "last".
  - Skipped sets return the prescribed `state.next` unchanged (`INCOMPLETE`, `progression.ts` L604–631, copy `reasons.ts` L135–141); the lifted 150×5 is only stored as `lastWeightKg`.
  - ✘ **Correction to P01-M40** ("swap carried the RDL's 40 kg guess"): the swap builds a fresh prescription (`apps/mobile/src/features/gym/workout/workout-screen.tsx` L417–438, `workout-model.ts` L371–405); the Experienced lower-body starting guess is bar + 20 kg = 40 kg (`progression.ts` L146–150), which happens to equal RDL's. Same symptom, different cause.
- **Artifact:** none. Weekly load progression over real weeks is untestable in a same-day study.
- **Confidence:** High.

<a id="ci-32"></a>

### CI-32 — "What's a goblet squat? What's 3 × 8-12?" (jargon and unreachable explanations)

- **Type:** Confusion · **Reach:** 2/10 — P03, P06 · **Severity:** max 3, mean 2.2 · **Stage:** onboarding, first value (gym)
- **Evidence:** P03-M08, P03-M12, P03-M41, P03-M42, P06-M21 · [P06 exercise names not tappable](../screenshots/P06/065-tap-goblet.png) · [P03 "1.5 sets", delts](../screenshots/P03/016-program-scrolled.png)
- **Quotes:** "I don't know what any of these are." (P06) · "Half a set? What are delts?" (P03)
- **Observed:** "3 × 8-12", "Side/Rear delts", "1.5 sets", "Flex week", "Relative strength" are never explained. Exercise names are not tappable in the program preview or on Gym Today; in Routine a tap opens a "Next target" editor instead of technique. The excellent exercise detail (D4) is reachable only via Exercises › search or mid-workout thumbnail. Good counter-example: "How many more reps could you have done?" instead of RIR.
- **Confidence:** High.

<a id="ci-33"></a>

### CI-33 — "Importing my saved recipes: fast when it works, but the Link tab chokes on YouTube and I can't check what it understood"

- **Type:** Frustration, Confusion · **Reach:** 3/10 — P05, P08, P10 · **Severity:** max 3, mean 2.1 · **Stage:** first value (collectors)
- **Evidence:** P05-M16, P05-M17, P05-M19, P05-M20, P05-M44, P05-M45 (editing: no Edit on detail; servings change doesn't rescale; silent save), P05-M52, P08-M33, P08-M34, P08-M37, P08-M38, P08-M58, P08-M59 ·
  [YouTube link → "page is too large (over 1 MB)"](../screenshots/P08/064-importing.png) · [link/text preview: calorie banner, no ingredients](../screenshots/P05/024-link-preview.png)
- **Quotes:** "Too large? It's a normal YouTube video." (P08) · "Show me what you understood and let me fix it. Why only for videos?" (P05)
- **Added from P10:** P10-M52 (delight: pasting a wheat/egg/honey recipe stops with "could not fully remove: gluten, vegan, gluten-free. Only the original can be saved"), P10-M53 (but the primary orange CTA on that screen is "Save original recipe", restrictions are named as if ingredients, and a kcal-mismatch banner sits above the safety warning). [import fail-safe](../screenshots/P10/126-sw-import-preview.png).
- **Observed:** A YouTube URL pasted in the default Link tab fails with a technical size error; switching to Video drops the typed URL and keeps the stale error. Link/text previews lead with a calorie-discrepancy banner, pre-select a "Cheferized" copy rescaled to 1 serving (ignoring "serves 2"), and show no ingredients or steps before saving. Save lands on Profile or Cookbook with no confirmation; the source link isn't shown on the recipe; photo import is not offered on mobile although the API supports it. Video import's editable draft is the model to copy (D7).
- **Root cause (✔):** `isSupportedVideoUrl` is only checked on the Video tab (`apps/mobile/app/import-recipe.tsx` L123); the Link tab always calls `importPreview` (L126–128), which never detects video URLs (`apps/api/src/routers/import.router.ts` L67–75). The failed import logs via `console.error` → red LogBox in dev (P08-M59).
- **Artifact:** imported titles/ingredients are canned mock content; the flow is real.
- **Confidence:** High.

<a id="ci-34"></a>

### CI-34 — "Swapping a meal or an exercise gives me the wrong options"

- **Type:** Frustration, Confusion · **Reach:** 4/10 — P01, P02, P05, P10 · **Severity:** max 2, mean 1.7 · **Stage:** daily loop
- **Evidence:** P01-M15, P01-M22, P01-M23, P02-M12, P02-M40, P05-M29 · [P01 incline DB press → only decline push-up](../screenshots/P01/066-workout-swap-picker.png) · [P02 AI swap: no preview, no undo](../screenshots/P02/094-ai-swap-result.png)
- **Added from P10:** P10-M34 (duplicates, the meal being replaced, 700-kcal dinners offered as a snack: `buildPickerSections` dedupes by id only, `packages/utils/src/recipe-picker.ts` L8ff), P10-M35 (AI swap gives no reason; 11 g protein dinner).
- **Observed:** Exercise swap: with the keyboard up only ~2 results fit under 12 muscle chips; "similar" suggestions ignore equipment (bodyweight for a full-gym lifter); list lags and resizes so a tap lands on the wrong row. Meal Replace: search by name only, rows show kcal but not time, replacements land at 1× portion so meal-prep boxes differ; "Regenerate with AI" replaces instantly with no preview/choice/undo. (Unsafe options in the list: CI-26.)
- **Confidence:** High.

<a id="ci-35"></a>

### CI-35 — "Right after my workout it tells me to do the next one"

- **Type:** Confusion · **Reach:** 4/10 — P02, P03, P06, P09 · **Severity:** max 2, mean 1.8 · **Stage:** daily loop / re-entry (gym)
- **Evidence:** P02-M37, P02-M50, P03-M27, P06-M23 · [P03: Full Body B "Start workout" minutes after A](../screenshots/P03/057-after-done.png) · [P02 Food Today says "Lower" after Upper](../screenshots/P02/089-food-today-scroll.png)
- **Quote:** "Wait, do I have to do another one today?" (P03)
- **Added from P07/P09:** P09 timeline 23: right after an early finish of A, Today shows Full Body B (~48 min) the same day. The "0-week streak" beside "1 of 2" recurs (P09-M17, see CI-51).
- **Observed:** After finishing A, Gym Today and Food Today's workout card present B with a big Start button on the same day; on non-training days (Sunday for P02 M/W/F, Sunday for P06 Tue/Sat) a workout is offered with no "next session: Tuesday". "0-week streak" next to "1 of 3 this week" (P03).
- **Root cause (✔):** Today's card is the rotation pointer `nextDayId` (`packages/utils/src/gym/session.ts` L56–63, L374–397; `apps/api/src/application/gym/gym-bootstrap.service.ts` L156–157); `today-screen.tsx` L279–346 shows Start whenever a next workout exists, with no "done today" or planned-weekday check.
- **Confidence:** High.

<a id="ci-36"></a>

### CI-36 — "148 kg squat? I did 120" (stats that don't explain themselves)

- **Type:** Bug, Confusion · **Reach:** 4/10 — P01, P02, P03, P09 · **Severity:** max 2, mean 1.8 · **Stage:** return (progress)
- **Evidence:** P01-M46, P01-M47, P02-M49, P03-M42 · [P01 axis "55.4 / 148 / 40.6"](../screenshots/P01/148-gym-stats.png) · [P02 clipped labels](../screenshots/P02/111-sweep-gym-stats.png) · [P03 unlabelled stacked bar, "Flex week"](../screenshots/P03/093-sweep-stats2.png)
- **Added from P07/P09:** P09-M16: clipped y-axis ("ı.64 kg"), stacked bar without legend, lowercase "back" — a designer persona calls it out.
- **Observed:** Strength-trend y-axis labels clipped; values are e1RM but unlabelled; "No PRs yet" after real maxes; stacked sets-per-muscle bar with 9 colours and no legend; lowercase "back" chip; jargon ("Relative strength", "Flex week").
- **Root cause (✔):** fixed label column `AXIS_W = 38` (`packages/ui-mobile/src/components/charts/line-chart.tsx` L49), right-aligned labels (L147–154) for min/mid/max (L106): "55.4 kg" is almost certainly "255.4 kg" with the "2" cut off (labels cannot be out of order). The wide range comes from 8 % padding (`chart-utils.ts` L10–25) around a 40 kg guess next to a real lift. Plotted value is `p.e1rmKg` (`apps/mobile/src/features/gym/stats/strength-trend-view.tsx` L87), captioned only "Strength trend" (L121). ~ P01's "labels out of order" was a misreading of clipping.
- **Confidence:** High.

<a id="ci-37"></a>

### CI-37 — "Cook mode is lovely, but the steps are thin and the ending is wrong"

- **Type:** Missing, Bug · **Reach:** 3/10 — P03, P04, P08 · **Severity:** max 2, mean 1.4 · **Stage:** daily loop (cook)
- **Evidence:** P03-M31, P03-M32, P04-M38, P08-M52 · ["Enjoy your breakfast!" after a dinner](../screenshots/P08/115-s2-cook-done.png) · ["until just set"](../screenshots/P03/063-cook-step3.png)
- **Observed:** Steps don't repeat quantities, give no doneness cues or pictures (some have timers — P04); the finish screen says "Enjoy your dinner!" for eggs and "Enjoy your breakfast!" for a stir-fry, and nudges "log it so your nutrition stays honest" to a family cook. Cooking does not deduct from the pantry (CI-25).
- **Root cause (✔):** when cook mode opens without a `meal` param (from Cookbook/Discover) the word comes from the clock (`apps/mobile/app/cook/[id].tsx` L110, L311; `packages/utils/src/cook-mode.ts` L17–22: before 11 breakfast, before 16 lunch, else dinner). From Today/Plan the real meal type is passed.
- **Confidence:** High.

<a id="ci-38"></a>

### CI-38 — Bug: editing a recipe strips its diet tags and makes it "non-vegetarian" ⚑

- **Type:** Bug, Trust · **Reach:** 1/10 — P05 · **Severity:** 4 · **Stage:** daily loop (own recipes)
- **Evidence:** P05-M46, P05-M50 · [false "Contains non-vegetarian" on a chickpea recipe](../screenshots/P05/115-s2-edited-detail.png) · [banner repeated in cook mode](../screenshots/P05/116-s2-cook-step1.png)
- **Quote:** "Now I can't trust ANY of the warnings — the real ones or the fake ones." (P05)
- **Observed:** After changing one ingredient word on an imported vegetarian recipe, the "vegetarian" tag disappeared and a red conflict banner appeared on detail and on every cook step.
- **Root cause (✔):** the mobile recipe form always saves `dietaryTags: []` (`apps/mobile/app/recipe-form.tsx` L194); the vegetarian rule requires a `vegetarian`/`vegan` tag (`safety.ts` L172–175, L244), so any edited recipe fails it and will also be excluded from vegetarian plans.
- **Artifact:** the recipe's canned title/description mismatch ("chickpea curry" / "simple weeknight pasta") is mock import content.
- **Confidence:** High. A false positive this visible undermines the true positives (CI-10, CI-19).

<a id="ci-39"></a>

### CI-39 — Bug: the Food/Gym switch highlights the wrong side

- **Type:** Bug · **Reach:** 2/10 — P01, P02 · **Severity:** max 2, mean 2 · **Stage:** navigation
- **Evidence:** P01-M17, P02-M24 · [P02 "Gym" selected on Food › Plan](../screenshots/P02/056-regenerate-tap.png) · [P01 "Food" pill over Gym content](../screenshots/P01/046-today-push.png)
- **Quote:** "Am I in food or gym now?" (P02)
- **Root cause (✔):** the pill shows the persisted mode, not the current route (`apps/mobile/src/features/gym/components/mode-switch.tsx` L27, L74); mode only changes on `setMode`. Routes that cross sides without `setMode` (Food's workout card sets gym then pushes `/today`: `todays-workout-card.tsx` L25–28; the post-upgrade sheet pushes to Plan from Gym) leave the pill stale. P01's case followed a dev reload (may be partly dev artifact); P02's is reproducible.
- **Confidence:** High for P02's path.

<a id="ci-40"></a>

### CI-40 — "Do I need to press Save Day? Why is my lunch under Extras?"

- **Type:** Confusion · **Reach:** 3/10 — P01, P06, P07 · **Severity:** max 3, mean 2.2 · **Stage:** daily loop (tracking)
- **Evidence:** P01-M45, P06-M29 · [Tracker with Save Day](../screenshots/P06/096-s2-tracker-bottom.png)
- **Added from P07/P09:** **P07-M16, P07-M17, P07-M35 (Sev 3).** Her chosen Breakfast/Lunch/Snack is never shown (all entries under "Extras" with no macros); "Save Day" gives no feedback; in the sweep, planned-meal ticks update the bars instantly but are lost if Save Day isn't pressed. ✔ Confirms `apps/mobile/app/tracker.tsx` L142–160, L206–227 (see B-23). [P07 Extras list](../screenshots/P07/057-see-full-day.png).
- **Observed:** Quick-add entries save immediately (DB-verified by P01) but a big "Save Day" button suggests otherwise; a quick add chosen as "Lunch" lists under "Extras · quick add".
- **Root cause (✔):** only custom/off-plan entries auto-save; ticking planned meals is local state until "Save Day" (`apps/mobile/app/tracker.tsx` L142–153, L206–227, L484), which also un-logs when nothing is ticked (L174–179), and changing date discards unsaved ticks without warning (L155–160). Two save models on one screen.
- **Confidence:** High.

<a id="ci-41"></a>

### CI-41 — "Household setup: did it keep what I said, and am I counted?"

- **Type:** Confusion · **Reach:** 2/10 — P04, P08 · **Severity:** max 2, mean 1.8 · **Stage:** onboarding (household)
- **Evidence:** P04-M05, P04-M06, P04-M07, P04-M08, P04-M47 (can record who _liked_ a dish, not who refused it), P08-M03, P08-M04 · [P04 table without the owner; Ana's dislikes not shown](../screenshots/P04/023-table-all.png)
- **Observed:** Member cards show allergies but not dislikes (both saved); no row for the account owner ("Am I counted?"); allergies asked again, empty, in the next step; "+ My partner" still offered after adding one; "Add to my table" hidden behind the sticky footer.
- **Confidence:** High.

<a id="ci-42"></a>

### CI-42 — Logger papercuts that cost an experienced lifter trust

- **Type:** Frustration · **Reach:** 2/10 — P01, P03 · **Severity:** max 2, mean 1.8 · **Stage:** daily loop (gym)
- **Evidence:** P01-M19, P01-M24, P01-M25, P03-M25 · [RIR answer collapses the exercise](../screenshots/P01/050-rir-answered.png) · [reps not carried → 20-rep sets logged](../screenshots/P01/080-laterals-done.png) · [set delete only by long-press](../screenshots/P03/052-longpress-set.png)
- **Observed:** Answering the reps-in-reserve card collapses the exercise and jumps on, so an extra set means scrolling back; typed weight carries to later sets but typed reps don't; library bodyweight exercises can't take added load (custom "Bodyweight + load" exists; a "Dip belt" toggle hides in unreachable Gym settings); no visible delete for a set.
- **Root cause (✔ for reps):** `onWeight` propagates to later unticked sets (`apps/mobile/src/features/gym/workout/workout-screen.tsx` L218–236); `onReps` edits one set (L237–239).
- **Confidence:** High.

<a id="ci-43"></a>

### CI-43 — Large text: dense rows truncate into ambiguity

- **Type:** Bug · **Reach:** 3/10 — P06 (XXL), P01, P09 (default size, dense editor) · **Severity:** max 2, mean 1.6 · **Stage:** throughout
- **Evidence:** P06-M08, P06-M15, P06-M37, P01-M13 · [Edit routine "Dumbbe…" ×3](../screenshots/P06/111-s2-routine-edit.png) · [week sheet "MO / N"](../screenshots/P06/043-week-sheet.png)
- **Added from P07/P09:** P09-M05: at default text size on iPhone 16e the Edit routine rows read "Dumbb…" ×3 and the expanded row still hides the name; only the Remove confirmation reveals "Dumbbell Curl". [P09 editor](../screenshots/P09/020-routine-edit.png).
- **Observed:** At XXL most screens reflow well (§6). Failures: Edit routine exercise names cut to "Dumbbe…" ×3, clipped "Add exercis", week-sheet day labels broken mid-word, outlook clipping, Profile household line truncated. The editor truncates names even at default size on Android (P01).
- **Confidence:** High.

<a id="ci-44"></a>

### CI-44 — "I told it I'm prediabetic; it never said a word about sugar" (health conditions and AI disclaimers) ⚑ segment-critical

- **Type:** Missing, Trust · **Reach:** 2/10 — P06, P10 (AI disclaimer only) · **Severity:** max 3, mean 2.6 · **Stage:** onboarding → first value → daily loop
- **Evidence:** P06-M04, P06-M11, P06-M17, P06-M18, P06-M39 · ["pre-diabetes" chip](../screenshots/P06/017-diet-added.png) · [medical question in AI Chef, no disclaimer](../screenshots/P06/054-chat-up2.png)
- **Quotes:** "It just made a little label. I hope it knows what it means." · "For food, worse than the leaflet from the surgery." (P06)
- **Added from P10:** P10-M28: a coeliac asking the chat "is the stock safe?" sees no "AI can be wrong / check the label" and no provider on the chat screen. ✔ `CHAT_SYSTEM_PROMPT` has no health guardrail (`prompts.ts` L427–446).
- **Observed:** No health-condition input; the free-text "pre-diabetes" restriction changed nothing (CI-10); no carb/sugar/fibre framing, no "suitable for" tag, no per-meal rationale; the AI day raised carbs above target; he asked the chat a medical question and saw no "not medical advice / talk to your GP" anywhere.
- **Root cause (✔):** diet options are a fixed list without conditions (`apps/mobile/src/features/preferences/types.ts`, per P06 sweep); `CHAT_SYSTEM_PROMPT` has no health guardrail and invites "nutritional advice" (`apps/api/src/lib/ai/prompts.ts` L427–446, L429); the "chef, not a doctor" rule exists only in the weekly review prompt (L459–460); the chat intro mentions "nutrition doubts" with no disclaimer (`apps/mobile/app/chat.tsx` L118–120).
- **Artifact:** the chat reply itself is mock; the missing framing is real.
- **Confidence:** High for the gap; the size of the segment (prediabetes / "GP told me to") needs market data (stage 2).
- **Validate:** with real users with a GP instruction: what reassurance and what disclaimers they expect; regulatory/claims review before any "suitable for diabetics" wording.

<a id="ci-45"></a>

### CI-45 — Bug: server-side UTC dates put a chat-logged meal on yesterday and make Progress show "0 days logged" after midnight

- **Type:** Bug · **Reach:** 2/10 — P06, P07 · **Severity:** max 3, mean 2.7 · **Stage:** daily loop (tracking)
- **Evidence:** P06-M28, P06-M44 · ["Logged … as today's snack"](../screenshots/P06/088-s2-chat-reply.png) · [Today still 0 kcal](../screenshots/P06/089-s2-today-after-log.png)
- **Quote:** "It said it logged it. Where is it?" (P06)
- **Added from P07/P09:** **P07-M32 (second instance of the same class):** Progress showed "Days logged 0 · No log data yet" at 02:00 local while `daily_logs` held a 27 Sep row with 5 entries (P07 read-only check). ✔ `TrackerService.summary` builds its day window with `new Date()` + `setUTCDate` / `toISOString` — UTC days (`apps/api/src/application/tracker/tracker.service.ts` L383–392) — so between local midnight and the UTC offset the local "today" is outside the window. P07's claim is **confirmed**. The CI now covers every server-side UTC date: chat `logMeal` (P06) and Progress summaries (P06-M44, P07-M32). [P07 Progress "0"](../screenshots/P07/107-s2-progress.png).
- **Observed:** The chat confirmed "Logged … as today's snack" but Today stayed at 0; read-only DB (re-checked): `daily_logs` row dated **2026-09-26** (450 kcal, mealType snack) written at 21:55 UTC = 00:55 local; the manual quick add is dated 2026-09-27. Progress then counted the wrong day.
- **Root cause (✔):** `logMeal` uses `new Date().toISOString().split('T')[0]` — the server's UTC date (`apps/api/src/application/chat/chat.service.ts` L224) — while Today/Tracker use the device's local date. Meal type defaults to `snack` when the model doesn't pass one (L221–223); the mock never passes one (artifact), a real model might.
- **Impact window:** any user east of UTC logging between local midnight and their UTC offset (UK: 00:00–01:00 BST; RO: 00:00–03:00); west of UTC the entry lands on _tomorrow_ in the evening.
- **Confidence:** High.

<a id="ci-46"></a>

### CI-46 — "My whole phone is dark and this blinds me"

- **Type:** Frustration · **Reach:** 2/10 — P02 (iOS), P07 (Android) · **Severity:** max 2, mean 2.0 · **Stage:** throughout
- **Evidence:** P02-M01, P02-M43 · [light login on a dark-mode phone](../screenshots/P02/002-login-screen.png)
- **Added from P07/P09:** P07-M01, P07-M41: Android dark mode shows the same light app, and every Snap to log flips light → dark system sheet/picker → light. Now both OSes.
- **Observed:** Every screen stays light on a dark-mode phone; no appearance setting.
- **Root cause (✔):** no `useColorScheme` and no `dark:` classes in `apps/mobile` or `packages/ui-mobile`; colours are hard-coded, while `apps/mobile/app.config.js` L66 sets `userInterfaceStyle: 'automatic'`, so system chrome follows the OS and content doesn't.
- **Confidence:** High.

<a id="ci-47"></a>

### CI-47 — "The photo estimate is take-it-or-leave-it" (Snap to log can't be corrected)

- **Type:** Trust, Missing · **Reach:** 1/10 — P07 · **Severity:** max 3, mean 2.5 · **Stage:** daily loop (tracking) · _added with P07_
- **Evidence:** P07-M20, P07-M27, P07-M28, P07-M37, P07-M21 · [estimate card: no edit, "CONFIDENT" unexplained](../screenshots/P07/069-snap-result.png) · [wrong dish can only be discarded](../screenshots/P07/095-s2-discarded.png) · [camera denied: dead end](../screenshots/P07/121-sw-cam-denied.png)
- **Quotes:** "Restaurant Caesars are twice that and I can't fix it. 'Confident' based on what?" · "If it's wrong I can only throw it away. So I'm back to guessing." (P07)
- **Observed:** The estimate arrives in ~3 s with an assumed portion ("restaurant side-plate portion, dressing included") — praised (D21). But the card offers only meal chips, Discard and Log: no portion size, no macro edit, no item list, no "not this, it's salmon", no photo thumbnail; "CONFIDENT" is never explained. The meal slot defaults to Lunch at 01:45/02:00, while Quick add defaults to Snack. After "Don't allow" camera, the card shows a red "Camera access is needed" with no Settings link and no pointer to Photos (which still works). Today lagged the Tracker by ~8 s after a snap log (host under load).
- **Inferred:** Snap to log is the acquisition hook for eat-out trackers; without a correction step it is only as good as its first guess, so the user reverts to manual guessing — the job it was meant to replace. Combined with CI-48 (no edit after logging) there is no way to fix a scan at all.
- **Root cause (✔):** `apps/mobile/src/features/tracker/scan-meal-card.tsx`: meal slot state initialised to `'lunch'` (L39); confirm step renders the confidence label (L149–153) with no edit controls.
- **Artifact:** every scan returned the same canned "Caesar salad" (mock), so the _wrong dish_ is mock; the missing correction path is real.
- **Confidence:** High for the UI gap; Medium for how often real estimates need correcting (validate).
- **Validate:** accuracy of real-AI estimates on 20 restaurant plates vs weighed reference; which corrections (portion, remove item, swap protein) users reach for.

<a id="ci-48"></a>

### CI-48 — "I can't edit a logged entry, and the bin deletes instantly"

- **Type:** Missing, Frustration · **Reach:** 1/10 — P07 (same pattern in the pantry: P08-M47) · **Severity:** max 3, mean 2.3 · **Stage:** daily loop (tracking) · _added with P07_
- **Evidence:** P07-M24, P07-M25, P07-M38 · cross-ref P08-M47 · [tap/long-press do nothing](../screenshots/P07/081-s2-longpress.png) · [deleted, no undo](../screenshots/P07/083-s2-deleted.png)
- **Quote:** "There's no edit at all? In MacroFactor I tap the entry and change the grams." (P07)
- **Observed:** Quick-add and scan entries cannot be edited (tap and long-press do nothing); correcting means delete and re-type everything. The bin deletes with no confirmation or undo. Weight entries, by contrast, have ✎ edit. Quick add accepts nonsense (100 kcal with 500 g protein).
- **Root cause (✔):** the tracker router has `logCustomMeal` and `deleteCustomMeal` but no update procedure for food entries (`apps/api/src/routers/tracker.router.ts` L99, L118; weight has `updateWeight`, L150); mobile wires only delete (`apps/mobile/app/tracker.tsx` L138, L470–472). P07's claim is **confirmed**.
- **Confidence:** High.

<a id="ci-49"></a>

### CI-49 — "When the baby wakes up I can only finish or bin the workout — and the rest vanishes"

- **Type:** Missing · **Reach:** 1/10 — P09 · **Severity:** max 3, mean 2.5 · **Stage:** daily loop (gym) · _added with P09_
- **Evidence:** P09-M10, P09-M13 (and the regressed target, P09-M12 → CI-31) · [bottom of logger: Finish / Discard only](../screenshots/P09/042-scroll-bottom.png) · [summary silent about unstarted exercises](../screenshots/P09/044-summary.png) · [Today moves on to B](../screenshots/P09/045-today-after-workout.png)
- **Quotes:** "Baby's awake — I need 'back in 20 minutes', not finish-or-bin." · "So pulldowns and deadlifts just vanish?" (P09)
- **Observed:** Ending early offers "Finish workout" / "Discard workout" and a neutral "6 sets aren't ticked. Only ticked sets count." — no pause, "finish later" or "move the rest to next time". The never-started exercises are not mentioned in the summary and the rotation moves to the next day (B); in session history they appear as "(not done)". The half session _does_ count toward the week ("1 of 2"), which he loved (D22).
- **Root cause (✔, P09's claim refined):** the unstarted exercises aren't deleted — they stay in the session as not-done sets — but nothing carries them forward: the rotation pointer simply advances to the next day after any finished session (`packages/utils/src/gym/session.ts` `nextDayIdAfter` L56–63, applied at L374–377). So "vanish" is accurate from the user's point of view (not from the data's).
- **Confidence:** High.
- **Validate:** with time-poor lifters: "resume later" vs "carry to next session" vs "short version at Start" (see CI-50).

<a id="ci-50"></a>

### CI-50 — "Sessions are ~50 minutes and nobody asked how long I have"

- **Type:** Missing · **Reach:** 2/10 — P09, P06 (~50 min "feels a lot for a first go") · **Severity:** max 3, mean 2.0 · **Stage:** gym onboarding, daily loop · _added with P09_
- **Evidence:** P09-M03, P09-M04, P09-M06, P09-M26, P06 S1 step 21 · [Full Body 2× at ~50/48 min](../screenshots/P09/013-onb-step6.png) · ["Other programs" only adds days](../screenshots/P09/015-choose-program.png)
- **Quotes:** "I've got 35 minutes. It never asked." · "Tell me the minutes while I'm cutting, not after." (P09)
- **Observed:** Gym setup asks days, experience, equipment and weekdays but never session length; the proposed days are 48–54 min; "Choose another program" only offers more days. Days/week is a single number (no "2–3 / it varies"). To shorten, P09 removed two exercises in an editor that truncates names (CI-43) and hides the resulting duration until he's back on Today (~41 min); the Weekly-balance tip then nagged him to add back the lateral raise he'd cut on purpose.
- **Root cause (✔ partly):** program choice is by days/week and experience only (`packages/utils/src/gym/templates.ts` L55–79); no duration input exists in the setup wizard (observed across P01, P02, P03, P06, P09).
- **Confidence:** High.

<a id="ci-51"></a>

### CI-51 — "The kind mechanics are invisible; it leads with a 0-week streak and silent skips"

- **Type:** Confusion, Trust · **Reach:** 2/10 — P09, P03 ("0-week streak" beside "1 of 3", P03-M27) · **Severity:** max 2, mean 1.7 · **Stage:** first value, return (gym) · _added with P09_
- **Evidence:** P09-M17, P09-M24, P09-M34, cross-ref P09-M23 (CI-04) · [0-week streak on minute one](../screenshots/P09/018-after-onboarding.png) · [Consistency legend: Flex week / Paused, nothing tappable](../screenshots/P09/070-s2-stats-consistency.png) · ["Skip this day" swaps silently](../screenshots/P09/066-s2-skip-day.png)
- **Quotes:** "A zero streak on day one. That's the Headspace feeling." · "I have no idea what I just did. Can I undo?" (P09)
- **Observed:** Streaks are week-based with earned Flex weeks and neutral Pauses, and the app never marks days red — mechanics that exactly fit a lapsed parent — but the UI shows only "0-week streak" from minute one and a colour legend with no explanation. "Skip this day" instantly swaps the card with no message or undo.
- **Root cause (✔ per P09 sweep, spot-checked):** pauses neutral for the streak in `packages/utils/src/gym/weeks.ts`; "Never 'missed'/red (principle 3)" in `apps/mobile/src/features/gym/today/today-helpers.ts` L20; "Never 'missed'/red (principle 3)" in `apps/mobile/src/features/gym/today/today-helpers.ts` L20; no explanatory UI (observed).
- **Confidence:** Medium-High (one persona for whom streak tone is decisive; untestable over weeks).

<a id="ci-52"></a>

### CI-52 — "Where's the workout I just did?"

- **Type:** Missing, Confusion · **Reach:** 1/10 — P09 · **Severity:** max 2, mean 1.7 · **Stage:** return (gym)
- **Evidence:** P09-M14, P09-M21, P09-M22 · [the only history: an unlabelled card with an ISO date at the bottom of Today](../screenshots/P09/062-s2-today-bottom.png) · ["Set 2/3/4" for three sets](../screenshots/P09/063-s2-history-detail.png)
- **Quote:** "Oh — THAT's my workout. Yesterday I gave up looking." (P09)
- **Observed:** No history list in Stats, Profile or Exercises; the last session is an unlabelled "Full Body A · 2026-09-27 →" card below "Log a past workout". Session detail counts the warm-up as Set 1. P09 compares unfavourably with Strong's history tab.
- **Root cause (✔):** set label uses the array index including warm-ups (`apps/mobile/src/features/gym/history/session-detail-screen.tsx` L141–142).
- **Confidence:** High.

<a id="ci-53"></a>

### CI-53 — "Nothing syncs with Apple Health, and my weight lives in two places"

- **Type:** Missing · **Reach:** 2/10 — P09, P06 (two different body weights, P06-M45) · **Severity:** max 2, mean 1.5 · **Stage:** return
- **Evidence:** P09-M36, P06-M45 · [Food Progress weight](../screenshots/P09/094-sweep-progress.png) · [Gym Stats bodyweight](../screenshots/P09/049-stats-4.png)
- **Observed:** No HealthKit (or Health Connect) integration; bodyweight is entered separately in Gym Stats and in Food Progress, and Preferences keeps a third (profile) weight.
- **Root cause (✔):** no HealthKit/health dependency or code in `apps/mobile` (grep); profile `weightKg` vs weigh-ins are separate (P06 sweep).
- **Confidence:** High (feature absence); Low on its weight in retention (validate).

<a id="ci-54"></a>

### CI-54 — "Privacy is the best I've seen, with a few gaps a GDPR-aware user will find"

- **Type:** Trust · **Reach:** 2/10 — P10, P07 (opt-out email defaults, P07-M09) · **Severity:** max 2, mean 1.4 · **Stage:** sign-up, settings, account exit · _added with P10_
- **Evidence:** P10-M02, P10-M38, P10-M42, P10-M44, P10-M46, P10-M56, cross-ref P07-M09 · [register: consent by footer](../screenshots/P10/002-register.png) · [emails on by default](../screenshots/P10/094-s2-prefs-3.png) · [revoke: nothing about data already sent](../screenshots/P10/103-s2-ai-revoke.png)
- **Quotes:** "Emails opted-in by default — the one dark-ish pattern so far." · "Are the Groq logs deleted?" (P10)
- **Observed:** Against a strong baseline (D24, D6, D14) the privacy persona found: Terms/Privacy consent implied by a footer line, and the Privacy link leaves the app for Safari mid-signup; both weekly email digests and "Plan my week every Sunday" on by default; revoking AI consent says nothing about data already sent to Groq/Cloudflare; the export is a JSON text blob in the share sheet (no named file, no "copied" feedback) that omits the consent timestamp, email preferences, AI call logs and shopping lists; the delete sheet doesn't mention the premium subscription or AI-provider data.
- **Root cause (✔):** email digests and auto-plan default to `true` (`packages/database/prisma/schema.prisma` L118–119, L226); AI consent is one nullable `aiDataConsentAt` (L125) set to null on revoke, so there is no consent history to export or demonstrate (GDPR Art. 7(1)); export is `user.exportData` (`apps/api/src/routers/user.router.ts` L170) shared as `JSON.stringify` text (`apps/mobile/src/features/profile/account-data-card.tsx` L24–25).
- **Confidence:** High on the mechanics; the legal assessment (implied consent for health data, opt-out emails) needs a privacy/legal review, not user research.

---

## 3. Unmet jobs-to-be-done

What people came for that the app does not do (or only does behind a lock, invisibly, or unsafely). "Absent" =
verified not to exist; "Hidden" = exists but the persona could not find it; "Locked" = premium-only.

| #   | Job (in the user's words)                                                                                                                                            | Personas                                                                              | Status in `f8f7f74`                                                                                                                                                                                                                                                     | Linked CIs                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| J1  | "Tell it once what we can't eat, and never see it again — and show me you checked."                                                                                  | P04, P05, P06, P10                                                                    | Partly works: recognised allergies/diets hold in the planner (P10's vegan + GF week was clean); silent failures on granola, category dislikes, free-text diets, hidden gluten (stock, curry powder, spelt, malt); replace picker unfiltered; no positive "safe for" cue | CI-10, CI-19, CI-26, CI-38        |
| J2  | "Tell me what to cook tonight from what's in my fridge, before it goes off."                                                                                         | P08, P05                                                                              | Absent on free (can't enter fridge); no expiry model at all; premium chat answers with unsafe matches and no tap-through                                                                                                                                                | CI-25, CI-26                      |
| J3  | "Plan only the meals I actually cook: 4 quick weeknight dinners for 2 / dinners for 4 / one batch lunch Mon–Thu."                                                    | P02, P04, P05, P08                                                                    | Absent: plan is always 7 days × 3–4 meals at a kcal target; "Cook once, eat twice" is dinner→next-day leftovers only; meals-per-day only in premium onboarding                                                                                                          | CI-11                             |
| J4  | "Keep the week under my budget, in my money, with food I can afford."                                                                                                | P01, P03, P08                                                                         | Budget is premium and not enforced visibly (no over-budget signal); no per-recipe price, no cheap filter; currency not asked                                                                                                                                            | CI-16, CI-05, CI-24               |
| J5  | "Get me from 102 kg to 92 kg / eat right for my blood sugar — and explain why."                                                                                      | P06 (also P02 recomp, P01 own protein)                                                | Absent: no target weight, no health-condition input, no medical framing, no per-meal rationale                                                                                                                                                                          | CI-44, CI-21, CI-06               |
| J6  | "Turn my saved links and videos into a cookbook I actually cook from."                                                                                               | P05, P08                                                                              | Locked; video import is excellent, link/text lacks review, YouTube-in-Link fails; imports vanish from "All"; no folders, no source link                                                                                                                                 | CI-33, CI-02, CI-08               |
| J7  | "Share the list with my partner / let them see the plan."                                                                                                            | P02, P04, P08                                                                         | Absent: no share/export of the list; household members are profiles without login                                                                                                                                                                                       | CI-17                             |
| J8  | "Food and training in one app: eat more on training days, one week view of both."                                                                                    | P01, P02, P10 (+P03, P06 wanted both at sign-up; P09 gym-first, food shell elsewhere) | Training-day bump is premium-locked on Today; plan shows no training-day marker; no combined week view; intent is single-choice; training-day fuel exists only for muscle-gain lifters; running/endurance not modelled (P10)                                            | CI-20, CI-03, CI-29               |
| J9  | "Run my own split with my real numbers and tell me when to go heavier."                                                                                              | P01                                                                                   | Hidden (PPL below the fold / behind My routines); progression targets drop after back-off sets; no load increase shown in 2 sessions                                                                                                                                    | CI-30, CI-31                      |
| J10 | "Log what I ate without knowing the calories" / "find 'chicken breast' like MyFitnessPal."                                                                           | P07, P06, P01                                                                         | Absent in Quick add (kcal mandatory, no food search, no recents); estimate only via Snap-to-log / premium chat                                                                                                                                                          | CI-28, CI-47, CI-48               |
| J11 | "Tell me how I'm doing" (toward a weight goal / week at a glance / PRs).                                                                                             | P06, P02, P01, P07, P09                                                               | Progress is food-only, no goal line, "−79 %" from one day; no meals+workouts week view; "No PRs yet" after real maxes                                                                                                                                                   | CI-29, CI-36, CI-52, CI-45        |
| J12 | "Show me what a beginner needs to know" (sets × reps, what's an RDL, cheap/easy/≤15-min recipes).                                                                    | P03, P06, P05, P09                                                                    | Exercise detail is excellent but not reachable from the program; no glossary; no skill/time ≤15 filter                                                                                                                                                                  | CI-32, CI-11, CI-08               |
| J13 | "Let me set 2,000 kcal / 150 g myself and log what I eat precisely and fast — and fix it when I'm wrong."                                                            | P07 (also P01 own protein)                                                            | Absent: targets are computed-only on every tier; no food search/barcode/recents; no edit of logged entries; snap estimate can't be corrected; Snap to log invisible on free                                                                                             | CI-21, CI-28, CI-47, CI-48, CI-02 |
| J14 | "Fit training around a chaotic week: give me a session that fits the time I have, let me pause, resume a cut-short workout, and nudge me only when I've gone quiet." | P09 (also P06 on session length)                                                      | Pause and reminders built but unreachable; no time budget; no resume/carry-over; reminders fixed-weekday only; kind streak mechanics invisible                                                                                                                          | CI-23, CI-49, CI-50, CI-51, CI-27 |
| J15 | "Show me where every number comes from, and don't change it behind my back."                                                                                         | P10, P06, P07                                                                         | The one explanation (g/kg rule) sits four screens deep in Preferences; kcal formula nowhere; targets change silently after gym setup; plans miss their own targets without a fix action                                                                                 | CI-06, CI-21                      |
| J16 | "Handle my data like I would: ask before sending it, tell me who gets it, let me take it back and leave."                                                            | P10 (the privacy persona; D6 praised by 7 others)                                     | **Largely done** (per-action AI consent naming Groq/Cloudflare, one-tap revoke, JSON export, itemised delete); gaps: implied Terms consent, opt-out emails, no consent record, silence on data already sent                                                             | D6, D14, D24, CI-54               |

## 4. Delights / strengths to protect

These are the moments that earned the only positive scores in the study. Stage 3 must not regress them.

| #   | Strength                                                                                                                                                                                  | Personas (n/10)                                            | Evidence                                                                                                                                                                                                                                                                          | Why it matters                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Workout logger**: pre-filled real weights, one-tap ✓, auto rest timer (±15/Skip), plate calculator keypad, plain-English effort question, offline logging that syncs                    | P01, P02, P03, P06, P09 (5/10)                             | P01-M11, M16, M18, M48, M52, M53; P02-M32, M33; P03-M22, M23; P06-M42; P09-M09 ("One thumb, no typing. Better than Strong.") · [plate calc](../screenshots/P01/056-tap-weight-number.png)                                                                                         | Carries every tomorrow-score ≥ 5; "as fast as Strong" for an expert, "exactly what I needed" for a beginner                                                                                                                            |
| D2  | **"Why?" sheet and "Next time" with one-line reasons**, plus Adjust ("Your target wins")                                                                                                  | P01, P02, P03, P06, P09 (5/10)                             | P01-M21, M39; P02-M34; P03-M22, M26; P06-M42; P09-M19 (post-workout protein nudge) · [Why?](../screenshots/P03/045-why.png)                                                                                                                                                       | Honest calibration removes the beginner's "what weight?" fear; explainability is the trust pattern the food side lacks (CI-06)                                                                                                         |
| D3  | **Gym setup wizard**: one question per screen, plain definitions, "Consistency beats ambition", "Missing a session changes nothing", contextual notification prompt, Weekly-balance chart | P01, P02, P03, P06, P09, P10 (6/10)                        | P01-M08; P02-M18, M23; P03-M05, M07, M10; P06-M19; P09-M02 ("That last line is the reason I'd stay"); P10-M19 ("No reminder" preselected) · [P06 step 1](../screenshots/P06/057-gym-step1.png)                                                                                    | Best-rated onboarding in the app, including for a low-confidence 52-year-old at XXL text                                                                                                                                               |
| D4  | **Exercise detail**: animated demo, embedded technique video, "Focus on / Avoid" cues, reachable mid-workout                                                                              | P01, P03, P06 (3/10)                                       | P01-M55; P03-M11, M24; P06-M22 · [RDL detail](../screenshots/P03/025-rdl-cues.png)                                                                                                                                                                                                | "The car-door thing actually makes sense" — beginners' biggest gap closed (once found)                                                                                                                                                 |
| D5  | **Instant plan generation** with photos, time, portions, day totals                                                                                                                       | P01, P02, P03 (3/10; others used it without comment)       | P01-M28, M36 (macro chips on cards); P02-M10; P03-M14                                                                                                                                                                                                                             | Time-to-first-plan is one tap                                                                                                                                                                                                          |
| D6  | **AI data-consent sheet**: named providers, exactly what is sent, "not used to train", asked once in context                                                                              | P02, P03, P04, P05, P06, P07, P08, P10 (8/10)              | P02-M28; P03-M39 (read as a wall of text by a beginner, but only once); P04-M21; P05-M14; P06-M16; P08-M35; P07-M18; **P10-M25, M41** ("I'd put this in a GDPR talk"; revoke re-asks with a sheet scoped to the action) · [consent](../screenshots/P05/022-link-preview-wait.png) | "That's actually a proper disclosure" (P05). A trust asset for the privacy segment (P10 pending)                                                                                                                                       |
| D7  | **Video import draft** with "please check" flags and "What we guessed"                                                                                                                    | P05, P08 (2/10)                                            | P05-M15, M22; P08-M30, M36 · [draft](../screenshots/P08/068-video-import.png)                                                                                                                                                                                                     | "Like a student marking their own homework" (P08); both want it for every import type                                                                                                                                                  |
| D8  | **Household setup** ("Feed my household — allergies included", partner/kid presets, ½ portions) and honest Household copy about what premium scales                                       | P04, P08 (2/10)                                            | P04-M02, M03, M14, M16, M24 · [step 2](../screenshots/P04/019-luca-added.png)                                                                                                                                                                                                     | "It felt made for me" (P04)                                                                                                                                                                                                            |
| D9  | **Shopping list in store**: aisle groups, photos, whole-row tick, counters; ticked items flow into "In my kitchen"; natural-language "Add item"                                           | P04, P08, P02 (3/10)                                       | P04-M28, M35, M46; P08-M20, M46; P02-M31; P05-M40                                                                                                                                                                                                                                 | "Better than Keep, it has the amounts" (P04)                                                                                                                                                                                           |
| D10 | **Cook mode**: one big step, progress bar, thumb-height Back/Next, timers; "Log this meal" at the end                                                                                     | P03, P04, P05, P08 (4/10)                                  | P03-M30, M33; P04-M37; P05-M43, M47; P06-M12; P08-M53; P09-M29 (recipe detail "I can see exactly what I'm in for")                                                                                                                                                                | Consistently praised; defects are only in content and finish copy (CI-37)                                                                                                                                                              |
| D11 | **"Your recipes" first in Replace meal**; two-tap swaps (manual or AI) with instant cost recalculation                                                                                    | P04, P05 (2/10)                                            | P04-M31, M33; P05-M28                                                                                                                                                                                                                                                             | "That's the bit I wanted" (P05)                                                                                                                                                                                                        |
| D12 | **"Cook once, eat twice" leftover lunches**                                                                                                                                               | P08 (and P02 found it, though it didn't fit batch prep)    | P08-M39; P02-M47 ("Plan my week every Sunday")                                                                                                                                                                                                                                    | "Leftovers! That's me." Worth surfacing outside the hidden week sheet                                                                                                                                                                  |
| D13 | **Plain-language explanation of targets** in Preferences › Goal & body ("2.0 g/kg because you train")                                                                                     | P01, P02, P06, P10 (4/10)                                  | P01-M31; P02-M06; P06-M34; P10-M08, M15, M36 (each field says why; "Your plan has a 2× portion here — 700 kcal"; "THERE's the source")                                                                                                                                            | The one "why" on the food side; users found it only by accident (CI-06)                                                                                                                                                                |
| D14 | **Account hygiene**: instant sign-up with no email wall; inline password validation with Show; clear delete-account and forgot-password flows; Feedback on More                           | P01, P03, P06, P10 (4/10)                                  | P01-M03; P03-M03; P06-M02, M43, M46; P10-M43, M45 (instant JSON export; "Best delete flow I've seen in a food app")                                                                                                                                                               | Low-friction start; safe exits                                                                                                                                                                                                         |
| D15 | **Honest free-tier AI Chef lock** that points to free alternatives                                                                                                                        | P05, P06, P10 (3/10)                                       | P05-M54; P10-M21                                                                                                                                                                                                                                                                  | A model for the other locks (CI-02)                                                                                                                                                                                                    |
| D16 | **Recognised diets hold**: no meat or fish in any vegetarian slot across two weeks                                                                                                        | P05, P10 (2/10)                                            | P05-M26; P10-M12, M32 (vegan + GF clean at name and ingredient level: maple not honey, rice milk, no soy sauce; the replace list _looked_ filtered, but see CI-26)                                                                                                                | Shows the matcher works when the term is recognised; the fix for CI-10 is structured input, not a new engine                                                                                                                           |
| D17 | **Fast, honest logging where numbers are known**: Quick add for a shake, weight card in place                                                                                             | P01, P06, P07 (3/10)                                       | P01-M44; P06-M26; P07-M31                                                                                                                                                                                                                                                         | Keep the one-sheet speed when adding estimation (CI-28)                                                                                                                                                                                |
| D18 | **Skippable goal step** ("Optional — skip if you just want chef-picked meals") and frictionless one-tap upgrade with concrete next steps                                                  | P03, P04, P05, P08 (4/10)                                  | P05-M05; P08-M05; P03-M37; P04-M19                                                                                                                                                                                                                                                | Respecting opt-outs is what diet-sceptical users noticed; the next screen then undid it (CI-01)                                                                                                                                        |
| D19 | **AI Chef answers "what can I cook" from the real kitchen** with "uses X / missing Y"                                                                                                     | P08 (1/10)                                                 | P08-M49                                                                                                                                                                                                                                                                           | Right answer shape; needs safety filter (CI-26) and tap-through                                                                                                                                                                        |
| D20 | **Tracker home for a tracker**: ring with kcal left, three macro bars, Quick add and Snap to log right below                                                                              | P07 (1/10)                                                 | P07-M23                                                                                                                                                                                                                                                                           | The right home for the logging intent — evidence that Today should vary by intent (CI-01), not be removed                                                                                                                              |
| D21 | **Snap to log speed and framing**: ~3 s estimate, stated portion assumption ("dressing included"), system photo picker without a storage permission                                       | P07 (1/10)                                                 | P07-M19, M26 · [estimate](../screenshots/P07/069-snap-result.png)                                                                                                                                                                                                                 | "Faster than anything she has for restaurant meals"; needs a correction step (CI-47)                                                                                                                                                   |
| D22 | **Kindness that keeps its word**: half a session counts ("1 of 2 this week"), never red, no nagging on return, "Skip this day / Do another day / Log a past workout"                      | P09 (1/10; P06 echoed "missing a session changes nothing") | P09-M11, M20, M35 · [summary](../screenshots/P09/044-summary.png)                                                                                                                                                                                                                 | The reason a lapsed parent would stay; protect while making it visible (CI-51)                                                                                                                                                         |
| D23 | **Planned-meal ticking with portion chips** (½×–2×) on the Tracker                                                                                                                        | P07 (sweep)                                                | P07-M40                                                                                                                                                                                                                                                                           | The fastest logging path in the app; invisible to anyone without a plan (CI-28)                                                                                                                                                        |
| D24 | **Privacy by default**: no analytics SDK and no tracking/ATT prompt on mobile, AI consent off until asked, "We'll ask again before any AI feature sends your data"                        | P10 (1/10)                                                 | P10-M03, M22 · [Profile › AI & your data](../screenshots/P10/056-profile.png)                                                                                                                                                                                                     | "No dark patterns so far." ✔ Mobile ships no analytics SDK (`apps/mobile/package.json`; `apps/mobile/src/features/gym/analytics.ts` L3–7 is a deliberate no-op). Flip side for stage 2: the mobile funnel is currently unmeasured (§8) |
| D25 | **Import safety fail-safe**: an import that can't be adapted to the diet is refused as "Cheferized" and flagged                                                                           | P10 (sweep)                                                | P10-M52                                                                                                                                                                                                                                                                           | Right behaviour; fix its primary CTA (CI-33)                                                                                                                                                                                           |

## 5. Journey map

Stages per the pipeline. Churn risk is our judgement from the sessions (H = several personas would quit or
did not return in spirit; M = friction but recovered; L = works). Segments: **gym-only** (P01 leaning, P09), **tracker** (P07; rows note it where it differs), **both** (P02, P03, P06, P10 — P10 is a food-first athlete)
(P01, P02, P03, P06), **food-only** (P05, P08, and P04), **household** (P04, P08).

| Stage                               | What works                                                                        | Where people stall                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Churn risk: gym | both | food  | household |
| ----------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---- | ----- | --------- |
| **Discover** (store → first screen) | — (not observed; store listing out of scope)                                      | Store promises ("workouts + meals", "zero-waste pantry", "your week planned") are not echoed anywhere in sign-up (CI-09)                                                                                                                                                                                                                                                                                                                                                                                                              | L               | M    | M     | M         |
| **Sign-up**                         | Four fields, no email wall, instant (D14)                                         | Fresh install says "Welcome back / Sign in" (10/10); subtitle mentions only meal planning; Terms consent implied by footer and the Privacy link leaves the app (P10, CI-54)                                                                                                                                                                                                                                                                                                                                                           | L               | L    | L     | L         |
| **Onboarding**                      | Gym wizard (D3); household step (D8); skippable goal step                         | Single-choice intent (CI-03); free-text diet with no read-back (CI-10/19); allergies asked twice (CI-41); no budget/currency/time/meals-per-day questions (CI-11, CI-16, CI-24); keyboard hides buttons (CI-14); **gym:** no session-length question (CI-50, P09); **tracker:** no tracking intent and no way to type own targets (CI-03, CI-21, P07 — H)                                                                                                                                                                             | L               | M    | **H** | M         |
| **First value / "aha"**             | Gym: a ready workout with real weights (P01, P03, P06). Food: one-tap plan (D5)   | Food lands on an unexplained calorie ring, not on the plan or the job (CI-01, CI-06); first plan ignores household size, time, budget, fridge (CI-11); unsafe items for P04/P05 (CI-10); core feature locked at first touch for P05, P08, P04, and hidden for P07 (Snap to log, CI-02); tracker judged against a target she rejects (CI-21, P07 — H); **both/athlete:** the vegan + GF week was clean (P10 aha, D16) but protein-short, repetitive and blind to lift/run days (CI-06, CI-11, CI-20 — M)                               | L               | M    | **H** | **H**     |
| **Daily loop**                      | Logger (D1), Why?/Next time (D2), cook mode (D10), list ticking (D9), swaps (D11) | Wrong next-time targets (CI-31); same-day "next workout" (CI-35); regenerate hidden and destructive (CI-07, CI-18); off-plan logging needs kcal (CI-28); pantry can't be maintained (CI-25); unsafe suggestion surfaces (CI-26); **tracker:** no food search, no edit, uncorrectable scans (CI-28, CI-47, CI-48 — H for P07); **time-poor gym:** only finish-or-bin when interrupted, target regresses (CI-49, CI-31)                                                                                                                 | M               | M    | **H** | **H**     |
| **Return** (next evening)           | Cold start reopens the last mode; P02 landed straight on her workout (P02-M32)    | Evening re-entry shows "Next meal: breakfast", calories, weight, "Complete your profile" — nothing about tonight (CI-04); stats and Progress don't tell a story (CI-29, CI-36), Progress shows "0 days" after midnight (CI-45); **gym:** no acknowledgement of a missed day, pause and reminders unreachable, no history list (CI-04, CI-23, CI-52 — P09 M); P10 re-entered to "PLAN UNDER TARGET", targets changed since sign-up, and next week's plan shown as today's (CI-06, CI-13)                                               | M               | M    | **H** | **H**     |
| **Pay**                             | One-tap, instant, reversible upgrade; honest Household copy (D8)                  | Most upgrades were a lock on the core job, with a pitch about "AI meal plans / nutrition profile" that named none of those jobs, and "free for now" with no terms (CI-02, CI-12); premium payoff was often invisible (budget, pantry, household scaling, training-day bump); pitch names nothing for gym-first users (P01, P09 stayed free) or trackers (P07 upgraded on "nutrition profile" and got no targets); P10 upgraded for AI and saw "Regenerate this week" do nothing and an AI week worse than the free one (CI-07, CI-06) | M               | M    | **H** | M         |

**Aha moments observed:** gym — "it tells me the actual weight" on Gym Today (P03-M10, P01-M11) and "it figured out I
can go heavier" on the summary (P03-M26); food — only the instant plan (D5) and "my recipes on top" in Replace (P05-M28).
No food-only persona reached a moment that solved their stated job in session 1. P07's closest aha was the first snap estimate (D21), undone within a day by the missing correction step. P09's was "It counted!" on the summary of a half session (D22). P10's was the audit of a fully vegan + gluten-free week ("Honestly better than Yazio"), followed within the hour by silently changed targets.

## 6. Segment differences

| Dimension                              | What differed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Beginner vs expert (gym)**           | Beginners (P03, P06) loved the defaults, starting guesses and Why? sheet and needed jargon help and tappable exercise names (CI-32). The expert (P01) needed control: his split, his deadlift in setup, his protein number, heavier targets, typed Adjust (CI-30, CI-31, CI-21). The same auto-progression reads as "smart" to a beginner and "wrong" to an expert. A returning lifter (P09) sits between: loved the defaults, but self-corrected an under-estimated guess and was then regressed by the incomplete-set rule (CI-31). | P03-M22 vs P01-M20; P06-M19 vs P01-M07             |
| **Gym vs food**                        | Gym-involved personas scored higher on every metric (SUS 59.6 vs 50; tomorrow 5.7 vs 3.3; see §1). Food-only personas' core jobs were either locked (import, pantry, scaling) or unsafe (diet/allergy).                                                                                                                                                                                                                                                                                                                               | §1 aggregates                                      |
| **Household vs solo**                  | Household personas (P04, P08) hit portion rounding (CI-22), "for 1 portion" on free (CI-02), no partner access (CI-17) and per-person dislikes being ignored (CI-10). Solo food personas hit "4 dinners, not 28 meals" (CI-11).                                                                                                                                                                                                                                                                                                       | P04-M11, M42; P08-M13, M62                         |
| **Locale (RO / UK / US / DE)**         | Currency and some units leaked across locales (CI-24). Partly environment: every iOS simulator ran region en_RO, so RON for P03/P05/P06/P09/P10 is an environment artifact of the study; the product findings are that onboarding never shows or asks currency, USD appears for an RO user on an en-US Android (P01), and °C/24-h/cm stay for an imperial user (P03).                                                                                                                                                                 | P01-M29; P03-M34, M43; P06-M35                     |
| **iOS vs Android**                     | Few platform-specific differences in 10 sessions (8 iOS, 2 Android; P10 moved from Android to iOS). Android (P01, P07): en-US phone language → lb/imperial and USD defaults for Romanians, a realistic pattern (CI-24); keyboard hiding the weight field also on Android (P07-M30), so CI-14 is cross-platform; the Android photo picker needs no permission (D21); emulator ANRs and 2-minute cold starts were host load (environment). iOS: a cold notification prompt at first workout start (P09-M08, CI-27).                     | P01-M05; P07-M07, M30; P09-M08                     |
| **Large text (XXL)**                   | Holds up well: registration, recipe detail, logger, Preferences reflow. Failures are truncation in dense rows (Edit routine "Dumbbe…" ×3, week-sheet "MO/N", outlook clipping) and a red Delete next to exercise rows that frightened a low-confidence user (CI-43, CI-23).                                                                                                                                                                                                                                                           | P06-M08, M15, M37, M38                             |
| **Dark mode**                          | Not supported on either OS: every screen stays light on a dark phone (CI-46); on Android the dark system sheets and photo picker make each Snap to log flip light → dark → light (P07-M41).                                                                                                                                                                                                                                                                                                                                           | P02-M01, M43; P07-M01, M41                         |
| **Free-leaning vs premium-inclined**   | Free-leaning personas (P01, P03, P08) read the locks as "the good stuff is paid"; two of them upgraded anyway because it was free. Premium-inclined personas (P02, P04, P05) upgraded quickly but could not name a premium feature that solved their job afterwards.                                                                                                                                                                                                                                                                  | P01 exit; P02 exit; P08-M10                        |
| **Diet-sceptical users**               | P05 and P08 explicitly rejected calorie framing; both were shown calories first after skipping the goal step (CI-01).                                                                                                                                                                                                                                                                                                                                                                                                                 | P05-M07, M34; P08-M06, M45                         |
| **Precision tracker vs planner**       | P07 is the only persona who _wants_ the calorie-first home — and the only one for whom the counting is not precise enough: own targets, food search, grams, edit, remaining macros, trend weight. Planners (P02, P04, P05, P08) want the opposite: less counting. One Today cannot serve both without intent-specific layouts.                                                                                                                                                                                                        | P07-M05, M12, M23; CI-01, CI-21, CI-28             |
| **Time-poor / unpredictable schedule** | P09 (new parent) needs adaptation, not structure: session length at Start, resume later, pause, "nudge if I've gone quiet", a kind streak. The mechanics partly exist (pauses, flex weeks, backfill, skip day) but are unreachable or unexplained. P05 (15-min dinners) is the food-side twin: time is the primary constraint and nothing models it.                                                                                                                                                                                  | P09-M03, M10, M25, M30, M34; P05-M27; CI-11, CI-50 |
| **Athlete / endurance**                | P10 (runs 40 km/week, lifts 2×) and partly P02 (recomp): goals are weight-centric; training-day fuelling exists only for muscle-gain lifters; running isn't modelled; finishing gym setup silently _lowered_ her protein from 128 to 93 g (MAINTAIN 1.6 g/kg). The gym wizard itself suited her (D3).                                                                                                                                                                                                                                 | P10-M07, M20, M29, M50, M51; CI-06, CI-20, CI-21   |
| **Privacy-minded vs everyone else**    | Only P10 audited privacy deliberately, and it became her main reason to recommend (NPS 6). Seven other personas praised the AI consent sheet in passing (D6). For this segment, privacy is a differentiator worth marketing; the gaps (CI-54) are small and cheap.                                                                                                                                                                                                                                                                    | P10-M03, M22, M25, M41, M43, M45; CI-54            |
| **Restricted diets (4 personas)**      | Allergy parent (P04), lacto-vegetarian (P05), prediabetic (P06), vegan + coeliac (P10). The planner held for recognised terms (P05 vegetarian, P10 vegan + GF) and failed for unrecognised or category terms (P04 granola/fish, P05 "no eggs", P06 "pre-diabetes"). All four asked, in different words, for the app to _show_ what it excluded.                                                                                                                                                                                       | CI-10, CI-19, CI-26                                |

---

## 7. Tech bug list

Deduplicated from every researcher note, `Bug` moment row and LogBox report. **Only one red LogBox** appeared across
ten sessions (B-17); no yellow warnings were reported. Severity uses the brief's scale. "Verified" = root cause
read in source at `f8f7f74` or checked read-only in the DB.

| #    | Bug                                                                                                                                                                                             | Sev | Seen by                                       | Repro (short)                                                                                                                                         | Root cause                                                                                                                                                                                                                                                                                                                                  | CI           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| B-01 | Editing any recipe strips `dietaryTags` → false "Contains non-vegetarian" on detail and every cook step; recipe then excluded from vegetarian plans                                             | 4   | P05                                           | Cookbook › Mine › pencil on a vegetarian import › change any field › Save › open recipe                                                               | ✔ `apps/mobile/app/recipe-form.tsx` L194 hard-codes `dietaryTags: []`; vegetarian rule needs the tag (`safety.ts` L172–175, L244)                                                                                                                                                                                                           | CI-38        |
| B-02 | Tree-nut allergy doesn't exclude granola (parfait with almonds in photo planned twice)                                                                                                          | 4   | P04                                           | Household member allergy "tree nuts" › Generate curated plan › breakfasts                                                                             | ✔ `apps/api/src/lib/curated-recipes/safety.ts` L48–61 (no granola/muesli etc.)                                                                                                                                                                                                                                                              | CI-10        |
| B-03 | Unrecognised free-text restriction is a no-op ("no eggs", "pre-diabetes") and gives no feedback                                                                                                 | 4   | P05, P06                                      | Onboarding › Diet & safety › restriction "no eggs" › Generate → egg dishes, no badges                                                                 | ✔ `safety.ts` L237–242 literal match; `normalizeTerm` L198–201                                                                                                                                                                                                                                                                              | CI-10        |
| B-04 | Category dislikes don't expand ("fish" ≠ cod/salmon; "green vegetables" matches nothing)                                                                                                        | 3   | P04                                           | Member dislike "fish" › Generate → cod/salmon dinners                                                                                                 | ✔ `safety.ts` L233–235 (raw word; `FISH_PATTERNS` L96–107 used only for allergies)                                                                                                                                                                                                                                                          | CI-10        |
| B-05 | AI Chef "what can I make" ranks unsafe recipes (egg/meat for a vegetarian with egg allergy)                                                                                                     | 4   | P05                                           | Premium, allergy "eggs", diet vegetarian, pantry with spinach › chat "what can I cook…"                                                               | ✔ `apps/api/src/application/pantry/pantry.service.ts` L188–233 ranks the whole `CURATED_POOL_BY_TYPE` (L198–202) without `filterSafeRecipes`                                                                                                                                                                                                | CI-26        |
| B-06 | Chat `logMeal` writes to the server's UTC date → entry on yesterday (or tomorrow west of UTC); Progress counts the wrong day                                                                    | 3   | P06, P07                                      | Premium, local time 00:00–03:00 (UTC+3) › chat "I had X for lunch" › Today unchanged; DB row dated previous day                                       | ✔ `apps/api/src/application/chat/chat.service.ts` L224; DB re-checked (2026-09-26 vs 2026-09-27); same class as B-33                                                                                                                                                                                                                        | CI-45        |
| B-07 | Progression: lightest completed working set becomes next session's weight (back-off 80 after 90s → "80 kg, same weight")                                                                        | 3   | P01                                           | Bench 90×6, 90×6, 90×5, + set 80×8 › Finish → Next time 80 kg                                                                                         | ✔ `packages/utils/src/gym/progression.ts` L574–585 (`easierOf`), L418–422; copy `reasons.ts` L124–127                                                                                                                                                                                                                                       | CI-31        |
| B-08 | Progression: skipped sets repeat the _prescribed_ target and ignore what was lifted (150×5 → "40 kg × 10")                                                                                      | 3   | P01, P09                                      | Swap RDL → Deadlift, log 1 of 3 sets at 150×5 › Finish; or P09: DB bench suggested 8 kg, lift 16 kg × 12 × 2 of 3 › Finish anyway → "8 kg × 12/12/12" | ✔ `progression.ts` L604–631 (`INCOMPLETE`); copy `reasons.ts` L135–141                                                                                                                                                                                                                                                                      | CI-31        |
| B-09 | Post-upgrade "Regenerate this week →" only navigates to Plan (current week)                                                                                                                     | 3   | P02, P03, P04, P06, P10 (P05 variant)         | Profile › Upgrade › tap item "Regenerate this week"                                                                                                   | ✔ `apps/mobile/src/features/premium/post-upgrade-sheet.tsx` L23, L49; `meal-plan.tsx` L54                                                                                                                                                                                                                                                   | CI-07        |
| B-10 | Free weekly-budget field accepts input but has no save; value silently discarded                                                                                                                | 3   | P03                                           | Free › Preferences › Weekly budget › type 60 › leave; DB `weeklyBudgetEur` null                                                                       | ✔ `apps/mobile/app/preferences.tsx` L297–310                                                                                                                                                                                                                                                                                                | CI-16        |
| B-11 | Cookbook "All" omits user imports / own recipes until they are in a plan                                                                                                                        | 3   | P05                                           | Import a recipe, don't plan it › Cookbook › All                                                                                                       | ✔ `packages/database/src/repositories/favourite-recipe.repository.ts` L186–207                                                                                                                                                                                                                                                              | CI-08        |
| B-12 | Cookbook no-match search shows the first-run "No recipes yet" state; search text persists across tabs, so Mine says "arrives on mobile soon" beside "+ New"                                     | 2   | P01, P03, P04, P05, P08                       | Cookbook › All › search "cabbage"; Discover › search › tap Mine                                                                                       | ✔ `apps/mobile/app/(food)/recipes.tsx` L220–221, L346–355                                                                                                                                                                                                                                                                                   | CI-08        |
| B-13 | **Next week's plan shown as "this week" on Plan, Shop and Today** whenever the current week has no plan (e.g. planning ahead on a weekend); Today and Plan can show two different "today" menus | 3   | P02, P08, P10                                 | On a Sunday, generate a plan for next week only › Plan (this week), Shop (this week), Today                                                           | ✔ `packages/database/src/repositories/meal-plan.repository.ts` L309–315 (`findActiveWithDays`: newest ACTIVE by `createdAt`, no week filter) used as "current" by `meal-plan.service.ts` L934–937, `shopping-list.service.ts` L356–359, `dashboard.service.ts` L189; `createPlan` archives only the same week (`meal-plan.service.ts` L521) | CI-13        |
| B-14 | Food/Gym pill shows the persisted mode, not the current side                                                                                                                                    | 2   | P01, P02                                      | Gym › avatar › Upgrade › "Regenerate this week" → Food Plan with "Gym" selected                                                                       | ✔ `mode-switch.tsx` L27, L74; `todays-workout-card.tsx` L25–28                                                                                                                                                                                                                                                                              | CI-39        |
| B-15 | Gym Today offers the next workout on the same day and on non-training days                                                                                                                      | 2   | P02, P03, P06                                 | Finish workout A › Done → Today shows B with Start                                                                                                    | ✔ `packages/utils/src/gym/session.ts` L56–63, L374–397; `today-screen.tsx` L279–346                                                                                                                                                                                                                                                         | CI-35        |
| B-16 | Strength-trend y-axis labels clipped ("55.4" = "255.4"); e1RM unlabelled                                                                                                                        | 2   | P01, P02, P03, P09                            | Gym › Stats with one heavy logged lift                                                                                                                | ✔ `packages/ui-mobile/src/components/charts/line-chart.tsx` L49, L106, L147–154; `strength-trend-view.tsx` L87, L121                                                                                                                                                                                                                        | CI-36        |
| B-17 | **Red LogBox** "Console Error … recipe.importPreview" on an expected user-facing import failure; Link tab doesn't route video URLs                                                              | 2   | P08                                           | Premium › Import › Link › paste `youtu.be/…` › Preview                                                                                                | ✔ `apps/mobile/app/import-recipe.tsx` L123–128; `import.router.ts` L67–75; logger link `trpc-links.ts` L102 (per P08)                                                                                                                                                                                                                       | CI-33        |
| B-18 | Weekly goal = template days (4) not the chosen days (5)                                                                                                                                         | 2   | P01                                           | Gym setup 5 days › weekly goal 4                                                                                                                      | ✔ `packages/utils/src/gym/templates.ts` L225                                                                                                                                                                                                                                                                                                | CI-30        |
| B-19 | Gym settings unreachable except via the sync-outbox banner                                                                                                                                      | 3   | P01, P06, P09 (pause + reminder goals failed) | Look for reminder/equipment/weekly goal settings                                                                                                      | ✔ `apps/mobile/src/features/gym/today/today-screen.tsx` L444–456                                                                                                                                                                                                                                                                            | CI-23        |
| B-20 | Typed reps don't propagate to later unticked sets (weight does)                                                                                                                                 | 2   | P01                                           | Type reps 15 on set 1 › ✓✓ → later sets logged at old reps                                                                                            | ✔ `workout-screen.tsx` L218–239                                                                                                                                                                                                                                                                                                             | CI-42        |
| B-21 | Cook-mode finish says breakfast/lunch/dinner by clock when opened from Cookbook/Discover                                                                                                        | 1   | P03, P08                                      | Discover › recipe › Cook › finish at 01:00 → "Enjoy your breakfast!"                                                                                  | ✔ `apps/mobile/app/cook/[id].tsx` L110, L311; `packages/utils/src/cook-mode.ts` L17–22                                                                                                                                                                                                                                                      | CI-37        |
| B-22 | "Nutrition Facts per N servings" label follows the stepper; values stay per 1 serving                                                                                                           | 1   | P04, P05                                      | Recipe › stepper to 4 › Nutrition Facts                                                                                                               | Observed (not traced)                                                                                                                                                                                                                                                                                                                       | CI-15        |
| B-23 | Tracker: two save models (quick add auto-saves; planned ticks need "Save Day"; date change discards ticks silently)                                                                             | 3   | P01, P06, P07                                 | Tick planned meals › change date → ticks lost                                                                                                         | ✔ `apps/mobile/app/tracker.tsx` L142–160, L174–179, L206–227                                                                                                                                                                                                                                                                                | CI-40        |
| B-24 | Pantry partial coverage invisible: a line needing 4 with 1 in the kitchen shows the full 4 with no "have 1"                                                                                     | 3   | P08                                           | Premium, pantry "half a cabbage 1 pcs" › plan needs 4 → no "Have it"                                                                                  | ✔ `apps/api/src/application/pantry/pantry-match.ts` L73–97 (no partial cover); mobile _does_ render "Have it" for full cover (`shopping-list.tsx` L469–481)                                                                                                                                                                                 | CI-25        |
| B-25 | Stale "Passwords do not match" after fields match (confirm typed first)                                                                                                                         | 1   | P02                                           | Register › type Confirm, then Password                                                                                                                | Observed                                                                                                                                                                                                                                                                                                                                    | CI-15        |
| B-26 | Stuck spinner at top of Gym Today after "Done" (> 10 s)                                                                                                                                         | 2   | P02                                           | Finish workout › Done                                                                                                                                 | Observed (possibly host load)                                                                                                                                                                                                                                                                                                               | CI-15        |
| B-27 | "Cook once, eat twice" toggle not persisted across relaunch                                                                                                                                     | 1   | P02                                           | Toggle on › regenerate › cold start › week sheet                                                                                                      | Observed                                                                                                                                                                                                                                                                                                                                    | CI-11        |
| B-28 | Ticking a shop item reflows the list so the next tap hits another row                                                                                                                           | 2   | P08                                           | Expanded aisle › tick quickly twice                                                                                                                   | Observed                                                                                                                                                                                                                                                                                                                                    | CI-22        |
| B-29 | Routine banner "Editing routines needs a connection" while online                                                                                                                               | 1   | P01                                           | Android emulator under load                                                                                                                           | Observed (likely slow probe on an overloaded host)                                                                                                                                                                                                                                                                                          | CI-23        |
| B-30 | Wrong stock photos (bagel = people, red pepper = chilli, telemea = gadget); imported recipe has blank image                                                                                     | 1   | P02, P08                                      | Plan / Shop                                                                                                                                           | Observed                                                                                                                                                                                                                                                                                                                                    | CI-15        |
| B-31 | Spell-check on the email field                                                                                                                                                                  | 1   | P05                                           | Register                                                                                                                                              | Observed                                                                                                                                                                                                                                                                                                                                    | CI-15        |
| B-32 | Pantry qty unit defaults to "pcs" ("paneer 225 pcs"); items can't be edited                                                                                                                     | 2   | P05                                           | Shop › In my kitchen › add "paneer" 225                                                                                                               | Observed                                                                                                                                                                                                                                                                                                                                    | CI-25        |
| B-33 | Progress 28-day summary uses UTC days → "Days logged 0 / No log data yet" for 2–3 h after local midnight east of UTC                                                                            | 3   | P07 (P06-M44 related)                         | Log food at 00:00–03:00 EEST › More › Progress                                                                                                        | ✔ `apps/api/src/application/tracker/tracker.service.ts` L383–392 (`setUTCDate`, `toISOString`)                                                                                                                                                                                                                                              | CI-45        |
| B-34 | No edit for logged food entries; bin deletes instantly with no confirm/undo                                                                                                                     | 3   | P07                                           | Tracker › Extras › tap / long-press entry → nothing; bin → gone                                                                                       | ✔ no update procedure (`apps/api/src/routers/tracker.router.ts` L99, L118); mobile `tracker.tsx` L138, L470–472                                                                                                                                                                                                                             | CI-48        |
| B-35 | Snap to log card not rendered on free (feature invisible, not locked)                                                                                                                           | 3   | P07                                           | Free › Today → no Snap card; upgrade → card appears                                                                                                   | ✔ `apps/mobile/src/features/tracker/scan-meal-card.tsx` L102                                                                                                                                                                                                                                                                                | CI-02        |
| B-36 | Snap meal slot defaults to Lunch at any hour (Quick add defaults differently)                                                                                                                   | 1   | P07                                           | Scan at 02:00 → "Lunch" preselected                                                                                                                   | ✔ `scan-meal-card.tsx` L39                                                                                                                                                                                                                                                                                                                  | CI-47        |
| B-37 | Camera-denied Snap state: red text, no Settings link, no pointer to Photos                                                                                                                      | 2   | P07                                           | Snap › Camera › Don't allow › tap Camera again                                                                                                        | Observed                                                                                                                                                                                                                                                                                                                                    | CI-47        |
| B-38 | Units & currency button shows "Saved ✓" regardless of unsaved changes                                                                                                                           | 2   | P07                                           | Preferences › change Metric/RON before saving                                                                                                         | ✔ label = `displayMutation.isSuccess` (`apps/mobile/app/preferences.tsx` L283)                                                                                                                                                                                                                                                              | CI-23        |
| B-39 | Quick add has no sanity check (100 kcal with 500 g protein accepted); 6.5 g displayed as 7 g                                                                                                    | 2   | P07                                           | Quick add › 100 kcal, protein 500                                                                                                                     | Observed (validation in `packages/utils/src/quick-add.ts` checks kcal only, L52–75)                                                                                                                                                                                                                                                         | CI-48, CI-15 |
| B-40 | Rest-timer notification permission requested cold at first workout start, no rationale                                                                                                          | 2   | P09                                           | iOS fresh install › "No reminder" in setup › Start workout                                                                                            | ✔ `apps/mobile/src/features/gym/use-active-workout.ts` L86 → `rest-timer.ts` L132                                                                                                                                                                                                                                                           | CI-27        |
| B-41 | Session detail numbers working sets from 2 when a warm-up exists                                                                                                                                | 1   | P09                                           | Gym Today › last-session card                                                                                                                         | ✔ `apps/mobile/src/features/gym/history/session-detail-screen.tsx` L141–142                                                                                                                                                                                                                                                                 | CI-52        |
| B-42 | Internal spec copy in Stats "More": "research §6.1/§6.2"                                                                                                                                        | 1   | P09                                           | Gym › Stats › More                                                                                                                                    | ✔ `apps/mobile/src/features/gym/stats/stats-tab.tsx` L52                                                                                                                                                                                                                                                                                    | CI-15        |
| B-43 | Imperial + USD default for an en-US phone in Romania, not overridden by metric values typed in onboarding                                                                                       | 3   | P07 (P01 same)                                | Android en-US › register › enter cm/kg › Preferences                                                                                                  | ✔ `packages/utils/src/locale.ts` L54–60, L86–102                                                                                                                                                                                                                                                                                            | CI-24        |
| B-44 | Today lags the Tracker ~8 s after a snap log                                                                                                                                                    | 2   | P07                                           | Log a scan on Tracker › back to Today                                                                                                                 | Observed (host under load; may be refetch latency)                                                                                                                                                                                                                                                                                          | CI-47        |
| B-45 | "Skip this day" swaps the workout with no confirmation, feedback or undo                                                                                                                        | 2   | P09                                           | Gym Today › Skip this day                                                                                                                             | Observed                                                                                                                                                                                                                                                                                                                                    | CI-51        |
| B-46 | Manual Replace-meal picker is not safety-filtered (lists every recipe from any of the user's plans + own recipes); `replaceRecipe` checks visibility only                                       | 3   | P04, P05, P10                                 | User with an allergy › Plan › ⇄ › scroll All recipes (fish for a no-fish household, egg dishes for no-egg)                                            | ✔ `apps/mobile/src/features/meal-plan/recipe-picker-sheet.tsx` L64–73; `apps/api/src/application/recipe/recipe.service.ts` L28–44; `meal-plan.service.ts` L1151ff                                                                                                                                                                           | CI-26        |
| B-47 | Gluten matcher misses spelt, seitan, semolina, malt, stock/bouillon, curry powder; curated recipes carry hard-coded "gluten-free" tags despite stock/curry powder                               | 3   | P10                                           | Allergy "gluten" › curated plan › Vegetable Paella (600 ml stock) tagged GF                                                                           | ✔ `apps/api/src/lib/curated-recipes/safety.ts` L71–94; tags in `extra-pool.ts` (e.g. Vegetable Paella L740)                                                                                                                                                                                                                                 | CI-10        |
| B-48 | Macro targets change silently when gym setup completes (lifter g/kg rule replaces the goal split; carbs absorb the difference)                                                                  | 3   | P06, P10                                      | Food onboarding with metrics › note protein › complete gym setup › Today                                                                              | ✔ `training-nutrition.service.ts` L122–136 → `preferences.service.ts` L226 → `packages/utils/src/training-nutrition.ts` L35–42, L84–93 (behaviour by design; the missing notice is the bug)                                                                                                                                                 | CI-06        |
| B-49 | AI quota counters: the curated (non-AI) plan counts as "Meal plans generated"; an unsaved import counts toward imports                                                                          | 1   | P02, P10                                      | Free › Generate curated plan › Profile usage 1/3                                                                                                      | Per P10 sweep (`mealPlan.generate` reserves a MEAL_PLAN log); not re-traced                                                                                                                                                                                                                                                                 | CI-12        |
| B-50 | Replace list shows duplicates and the meal being replaced; no slot filter (700-kcal dinners for a snack)                                                                                        | 1   | P10                                           | Plan › ⇄ on a snack › scroll                                                                                                                          | ✔ `packages/utils/src/recipe-picker.ts` L8ff dedupes by id only                                                                                                                                                                                                                                                                             | CI-34        |
| B-51 | Unsafe import: the primary CTA is "Save original recipe" and restrictions are named as ingredients ("could not fully remove: vegan, gluten-free")                                               | 2   | P10                                           | Premium, allergy gluten › Import › paste a wheat/egg/honey recipe                                                                                     | Observed                                                                                                                                                                                                                                                                                                                                    | CI-33        |
| B-52 | Servings stepper wraps "1.75" as "1.7 / 5"; scaled units "3.1 ml cinnamon", "1.5 pinch", "2 to taste salt"                                                                                      | 1   | P10 (P05 "1.5 piece garlic")                  | Plan › a 1¾× recipe                                                                                                                                   | Observed                                                                                                                                                                                                                                                                                                                                    | CI-15        |
| B-53 | Export is a JSON text blob via the share sheet (no named file, no "copied" feedback) and omits consent state, email prefs, AI logs, shopping lists; no consent history exists                   | 1   | P10                                           | Profile › Export my data                                                                                                                              | ✔ `account-data-card.tsx` L24–25; `schema.prisma` L125 (`aiDataConsentAt` only)                                                                                                                                                                                                                                                             | CI-54        |

**Instrumentation note (for stage 2).** The mobile app has no analytics SDK at all (✔ `apps/mobile/package.json` has no PostHog/Sentry/analytics dependency; `apps/mobile/src/features/gym/analytics.ts` L3–7 is a documented no-op); only the web app ships `posthog-js` and the API runs Sentry with `tracesSampleRate: 1` (`apps/api/src/instrument.ts` L13). A strength for privacy (D24), but none of the funnel or retention metrics stage 2 will propose can be measured on mobile today, and any SDK added must respect the consent pattern P10 praised.

**Not bugs after verification:** "mobile ignores `pantryCovered`" (P08-M43/M55) — refuted, see B-24; "swap carries the
old exercise's starting weight" (P01-M40) — refuted, coincidence of equal starting guesses (CI-31); "Weekly outlook
shows last week" (P05-M35, P08-M06) — refuted, today's chip is clipped (CI-13); "y-axis labels out of order"
(P01-M46) — they are clipped, not misordered (CI-36); "unstarted exercises vanish" (P09-M13) — they stay in the
session as "(not done)"; what's missing is carry-over, the rotation simply advances (CI-49).

## 8. Excluded / untestable / needs real-user validation

**Mock-AI artifacts (excluded as findings; flow still judged):**

- All absolute prices and week totals: pseudo-prices hashed from ingredient names (`apps/api/src/lib/ai/mock.ts` L167–180). Trust impact is real (CI-05); accuracy is untested.
- AI-generated week contents (fish/granola repeats for P04, salmon for a pantry of pork for P08, 4 meals/day, flat training-day kcal for P02, $69.79 vs a $60 budget for P03). Only the curated (free) weeks count as evidence of filtering.
- AI Chef replies that echo the system prompt (P03, P04, P06), always log as "snack", or ignore typed ingredients (P05). _But_ verify the real chat can never surface its system prompt (P03 note).
- Imported recipe contents/titles (canned pasta for a curry link) and the "480 vs 862 kcal" banner values.
- Mock injection of pantry items into a salmon recipe (P08-M40).
- Every Snap-to-log estimate returned the same canned "Caesar salad with grilled chicken, 430 kcal" (P07), for a pixel-art camera scene and a salmon photo alike; the dish is mock, the uncorrectable card is real.
- P07's generated premium day "286 kcal over target · Protein short by 49 g" (mock content; the honest flags are real UI).
- P10's premium AI week 414–714 kcal under target on every day at 1× portions, the chat echoing its context (including "93g protein"), and the imported "pasta" for a pancake recipe: all mock content. The silently changed targets (CI-06) and the plan-week bug (CI-13) are **not** mock — both were traced in source.

**Dev-build / environment artifacts (excluded):**

- Expo "Tools" gear over top-right controls (Finish, next-week arrow, "+ New", avatar, cook-mode ingredients icon); Metro "Refreshing…" banners wiping form fields; dev-client reloads; white screen / "isn't responding" ANRs on the Android emulator under host load 60–80 (P01); Terms/Privacy on localhost.
- **iOS simulator region en_RO** on every iOS lane → RON for the US (P03) and UK (P05, P06) personas; the "EN RO" comma decimal keypad for P06. Product findings kept: currency is never shown or asked.
- P10: RON for a Munich user (en_RO simulator); the Privacy Policy page is a localhost dev page (content not judged; only the fact that the link leaves the app is).
- P07: Android "System UI isn't responding" at first launch, two blank reloads while typing, 2-minute blank cold starts (host load 20–33); P09: RON currency from the en_RO simulator.
- "?" glyph boxes seen only on lane L1 (iPhone 16e sim) — likely missing emoji glyphs in the simulator (CI-15); verify on hardware.
- Driver mis-taps (logged and excluded by each session); P05-M12 ("+ New" under the dev gear) is a dev-tool overlap, not a finding.

**Same-day limits (untestable here):**

- Notifications and reminders (17:00/18:00 gym reminders, the "missed" follow-up reminder kind, Sunday recap, Monday plan), streaks, flex weeks and pauses over real weeks, "missing a session changes nothing" over time, a real missed planned day (P09 role-played it on the same Sunday), weight trend over weeks (P07), the premium week-rebalance banner (P07 did not see it; not verified whether it needs a plan), weekly load progression, weekly coach review (needs logged data), "Still have these?" pantry check after 3 days, auto-plan "every Sunday", My Weeks "Follow this week".
- Sessions ran across local midnight on Sat 26 → Sun 27; "next evening" was role-played. Several weekend effects (CI-13) and the evening re-entry (CI-04) are amplified by this.

**What must be validated with real users (priority order):**

1. **Allergy/diet trust** (CI-10, CI-19, CI-26): how restricted eaters enter constraints and which reassurance they trust. Recruit parents of allergic children, vegetarians/vegans, coeliacs. Include a safety review before any "safe for" claim.
2. **Activation per segment** (CI-01, CI-03, CI-11): first-click / card sort on what "home" should be for households, collectors, zero-waste cooks, lifters, health-motivated users.
3. **Paywall placement and willingness to pay** (CI-02, CI-12): real prices, which first-touch lock converts vs churns; this study measured only free upgrades.
4. **Price estimate credibility** (CI-05): real AI prices vs shelf prices in RO/UK/US; effect of a confidence label.
5. **Pantry with dates** (CI-25): will people enter use-by dates; which granularity.
6. **Re-entry and notifications** (CI-04): a 1–2 week diary study; the in-app landing and push reminders together.
7. **Health-motivated segment** (CI-44): size and expectations; regulatory/claims review.
8. **Gym expert control** (CI-30, CI-31): 5–8 experienced lifters over 3–4 weeks for progression trust.
9. **Precision trackers** (CI-21, CI-28, CI-47, CI-48): 5–8 MacroFactor/Cronometer users logging for a week; snap-to-log accuracy on weighed restaurant plates with the real model.
10. **Time-poor lifters** (CI-49, CI-50, CI-51, CI-23): diary study with new parents / shift workers over 3–4 weeks, including a planned pause and missed days.
11. **Athletes and coeliacs** (CI-10, CI-20): 5–8 endurance athletes with dietary restrictions; a dietitian review of hidden-gluten ingredients and "may contain" wording.
12. **Privacy and legal review** (CI-54, CI-44): implied Terms consent for health data, opt-out email defaults, consent records (GDPR Art. 7(1)), retention at the AI processors, medical/AI disclaimers — for counsel, not users.
13. Accessibility on hardware: VoiceOver/TalkBack and Dynamic Type beyond XXL (only one XXL persona; no screen-reader persona).

---

## Appendix A — Changelog and inconsistencies across session files

### Changelog (for downstream stages 2–4)

**v1 (2026-09-27, n = 7):** P01, P02, P03, P04, P05, P06, P08 → CI-01 … CI-46.

**v3 (2026-09-27, n = 10, final): P10 (Lena) integrated; document finalised.** "(so far)" removed; all counts are
final n/10; executive summary added; table re-sorted by impact (IDs unchanged).

_New CI:_ **CI-54** — privacy gaps: implied Terms consent and an out-of-app Privacy link, opt-out email/auto-plan
defaults, no consent record in data or export, nothing said about data already sent to AI providers, delete sheet
silent on premium and AI data (2/10 · Sev 2; P10 + P07-M09).

_Material changes_

| CI                                                                                  | Change                                                                                                                                                                                                                 | Why                                                                                   |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **CI-13**                                                                           | Max Sev 2 → **3**; Bug; reach 6 → 7; retitled — now a verified **data bug** (next week's plan shown as this week on Plan, Shop and Today), not only a weekend default; rises to rank 6                                 | P10-M30, M48; `findActiveWithDays` by `createdAt` (B-13)                              |
| **CI-06**                                                                           | Reach 6 → 7; root cause **corrected**: the g/kg protein rule applies when gym setup is complete (lifter rule), not "once metrics exist"; it can lower protein (P10 128 → 93 g) or raise it (P06 184 → 204 g), silently | P10-M29, M50; `training-nutrition.service.ts` L122–136, `preferences.service.ts` L226 |
| **CI-26**                                                                           | Reach 2 → 3; manual Replace picker root cause **traced** (was "not traced"): no safety filter at all; explains P04/P05 cases retroactively                                                                             | P10-M47; B-46                                                                         |
| **CI-10**                                                                           | Reach 3 → 4; hidden-gluten gaps (spelt, seitan, semolina, malt, stock, curry powder; hard-coded GF tags)                                                                                                               | P10-M16, M49; B-47                                                                    |
| CI-19                                                                               | Reach 3 → 4 (silent filtering must be probed)                                                                                                                                                                          | P10-M05, M33, M55                                                                     |
| CI-20                                                                               | Reach 3 → 4; endurance/running not modelled; retitled                                                                                                                                                                  | P10-M20, M51                                                                          |
| CI-21                                                                               | Reach 4 → 5 (no endurance goal)                                                                                                                                                                                        | P10-M07                                                                               |
| CI-44                                                                               | Reach 1 → 2 (no AI disclaimer on a coeliac question); retitled to include AI disclaimers                                                                                                                               | P10-M28                                                                               |
| CI-07                                                                               | Reach 5 → 6                                                                                                                                                                                                            | P10-M24                                                                               |
| CI-03, CI-04, CI-09 (10/10), CI-11, CI-12 (9/10), CI-14, CI-15, CI-23, CI-33, CI-34 | Reach +1 each                                                                                                                                                                                                          | P10-M04, M31, M01, M13, M23/M54, M06, M17/M18, M40, M52/M53, M34/M35                  |

_Other sections:_ executive summary; §1 P10 row and final aggregates (SUS 56.5, tomorrow 4.6, NPS −90, goals 43 %);
§2 ⚑ note and themes 1, 6, 7; §3 J1, J8 extended, J15 (traceable numbers), J16 (data handled like mine); §4 D3, D6,
D13–D16 extended, D24 (privacy by default), D25 (import fail-safe); §5 sign-up, first value, return, pay rows; §6
athlete, privacy-minded and restricted-diet rows; §7 B-13 rewritten (data bug), B-46–B-53; §8 P10 artifacts,
instrumentation note, validation items 11–12; Appendix A A18–A21.

**v2 (2026-09-27, n = 9): P07 (Ioana) and P09 (Chris) integrated.** All counts rebased to n/9. IDs unchanged. _(Figures in this v2 entry are as they stood at n = 9; current values are in §1 and §2.)_

_New CIs_

| CI    | Title                                                                                                            | Reach / Sev | Source     |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| CI-47 | Snap-to-log estimate can't be corrected (portion, macros, dish); "CONFIDENT" unexplained; camera-denied dead end | 1/9 · 3     | P07        |
| CI-48 | Logged food entries can't be edited; the bin deletes instantly with no undo                                      | 1/9 · 3     | P07        |
| CI-49 | Interrupted workout: only finish or bin; unstarted exercises aren't carried forward                              | 1/9 · 3     | P09        |
| CI-50 | Sessions are ~50 min and nobody asks how long the user has                                                       | 2/9 · 3     | P09 (+P06) |
| CI-51 | Forgiving streak/pause/skip mechanics are invisible; "0-week streak" leads; silent "Skip this day"               | 2/9 · 2     | P09 (+P03) |
| CI-52 | Workout history is hidden (one unlabelled card; set numbering off)                                               | 1/9 · 2     | P09        |
| CI-53 | No Apple Health; body weight lives in two places                                                                 | 2/9 · 2     | P09 (+P06) |

_Material changes to existing CIs_

| CI                  | Change                                                                                               | Why                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **CI-21**           | Reach 3 → 4, **max Sev 3 → 4**, retitled "…or type my own targets"; moves from rank ~21 to ~8        | P07-M05/M06: coach-set targets impossible on any tier (verified)                  |
| **CI-28**           | Reach 2 → 3, **max Sev 3 → 4**; retitled scope to "no food search"                                   | P07-M12 (Sev 4): every entry typed from memory (verified: no food search/barcode) |
| **CI-23**           | Reach 3 → 5; two Sev-3 _Blocker_ rows; now the main reason P09 failed 2 of 4 S2 goals                | P09-M25/M30/M31: pause and reminder built but unreachable (verified)              |
| **CI-45**           | Reach 1 → 2; retitled — now covers all server-side UTC dates (chat logging **and** Progress summary) | P07-M32 (verified `tracker.service.ts` L383–392)                                  |
| **CI-31**           | Reach 2 → 3; incomplete-set rule now seen twice with real data loss                                  | P09-M12 (verified)                                                                |
| **CI-40**           | Max Sev 2 → 3                                                                                        | P07-M35: planned-meal ticks silently lost without Save Day                        |
| **CI-46**           | Reach 1 → 2; confirmed on Android                                                                    | P07-M01, M41                                                                      |
| CI-01               | Reach 7 → 8 (P09); P07 is a counter-case (D20)                                                       | P09-M27                                                                           |
| CI-02               | Reach 6 → 7; adds "hidden, not locked" (Snap to log on free)                                         | P07-M11                                                                           |
| CI-03               | Reach 6 → 7 (no tracking intent)                                                                     | P07-M04                                                                           |
| CI-04               | Reach 6 → 7 (silent after a missed day)                                                              | P09-M23                                                                           |
| CI-06               | Reach 5 → 6 (orange protein-over-target, no grams remaining)                                         | P07-M22, M29, M36, M39                                                            |
| CI-08               | Reach 5 → 6 (no quick/time filter)                                                                   | P09-M28                                                                           |
| CI-09               | Reach 7 → 9                                                                                          | P07-M02, P09-M01                                                                  |
| CI-12               | Reach 6 → 8 (pitch lured P07; nothing for gym-first P09)                                             | P07-M10, P09-M18                                                                  |
| CI-14               | Reach 5 → 6; now cross-platform (Android)                                                            | P07-M03, M30                                                                      |
| CI-15               | Reach 5 → 7                                                                                          | P07-M14, M15; P09-M15, M22                                                        |
| CI-24               | Reach 3 → 4; en-US Android in RO is a realistic case                                                 | P07-M07                                                                           |
| CI-27               | Reach 4 → 5; broadened to fixed-weekday model and cold permission prompt                             | P09-M08, M32, M33                                                                 |
| CI-29               | Reach 2 → 3 (no trend/goal line, no weekly adherence)                                                | P07-M33, M34                                                                      |
| CI-35, CI-36, CI-43 | Reach +1 each                                                                                        | P09 timeline 23, P09-M16, P09-M05                                                 |
| CI-20               | Counter-evidence only (P09 liked the protein nudge)                                                  | P09-M19                                                                           |

_Other sections:_ §1 rows P07, P09 and aggregates (SUS 55.8, tomorrow 4.6, NPS −89); §3 J13 (precision tracking), J14
(training around a chaotic week), J8/J10/J11/J12 personas; §4 D20–D23 and additions to D1–D3, D6, D10, D17; §5 tracker
and time-poor rows; §6 new "Precision tracker vs planner" and "Time-poor" rows, iOS vs Android and dark mode rewritten;
§7 B-33 to B-45 and B-06/08/16/19/23 extended; §8 new mock/env artifacts and validation items 9–10; cross-cutting
themes 2, 5 and new 6 (time handling).

### Inconsistencies across session files

| #   | Where                               | What conflicts                                                                                                                                                                                    | Resolution in this synthesis                                                                                                                                                 |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | P02-M13, P04-M25 vs P08-M15/M23     | P02/P04 log prices (eggs 142 / 568 RON) as Trust/Bug findings; P08 notes they come from mock `AI_ESTIMATE` rows                                                                                   | Verified mock (`mock.ts` L167–180). Absolute prices excluded; trust/no-confidence-cue kept (CI-05)                                                                           |
| A2  | P08-M43, P08-M55                    | Claims mobile never renders `pantryCovered` ("grep … → none")                                                                                                                                     | Refuted: mobile renders "Have it" (`shopping-list.tsx` L469–481). Real cause: no partial coverage (`pantry-match.ts` L73–97; DB 1 pcs vs 4)                                  |
| A3  | P01-M07 vs P02-M20                  | P01: "no way on this screen to pick PPL"; P02 found "Choose another program" at the bottom                                                                                                        | PPL 6× _is_ offered there for 5 days (`templates.ts` L71–79); P01's screenshots stop above it. Discoverability, not absence (CI-30)                                          |
| A4  | P01-M40                             | "Swap carried the RDL's 40 kg guess"                                                                                                                                                              | Refuted: fresh prescription; both starting guesses are 40 kg (`progression.ts` L146–150)                                                                                     |
| A5  | P01-M46                             | "Y-axis labels out of order"                                                                                                                                                                      | Clipped, not misordered (`line-chart.tsx` L49, L106)                                                                                                                         |
| A6  | P05-M35, P08-M06 vs P06 step 8      | "Weekly outlook shows last week" vs "Sunday's tile cut off"                                                                                                                                       | Current week; Sunday clipped (`week-outlook.tsx` L17–29, L42–57)                                                                                                             |
| A7  | Dates                               | P01–P04 ran Sat 26 (P01 crossed midnight); P05, P06, P08 ran Sun 27 after midnight. P05/P08 header dates read 2026-09-27, others 2026-09-26                                                       | Weekend effects noted per CI; not a data problem                                                                                                                             |
| A8  | Goal-scorecard vocabulary           | Outcomes mix "Done (slow)", "Done, but not trusted", "Partial / Gave up", "Upgraded (free)"; P02 S1 has 5 rows (4 goals + a premium decision), P08 S1 has 5 goals                                 | Normalised in §1 (Done variants = done; P02's decision row not counted as a goal)                                                                                            |
| A9  | P08 tier trigger                    | Header says the upgrade followed the Import wall; the driver's tap landed on Upgrade before the persona decided (acknowledged in P08 timeline 22)                                                 | Kept as in-character; P08's upgrade is weaker evidence than the others                                                                                                       |
| A10 | P05-M37                             | Treats "The pantry is empty… Pantry page" as partly mock                                                                                                                                          | That sentence is server copy (`pantry.service.ts` L191), not mock; the "Pantry page" naming mismatch with "In my kitchen" is a real finding (CI-25)                          |
| A11 | Severity calibration                | Similar issues got different severities across agents (e.g. "Welcome back" Sev 1 in P04/P05/P06/P08 vs Sev 2 in P01/P03; regenerate CTA Sev 3 in P02 vs Sev 2 in P03/P04/P06)                     | Max and mean both reported; ranks use max                                                                                                                                    |
| A13 | P09-M31 vs P01-M51                  | Same root cause (Gym Settings orphaned), logged as Bug Sev 3 by P09 and Missing Sev 3 by P01; P09 also logs its effects as Blockers (M25, M30)                                                    | One CI (CI-23), both verified (`today-screen.tsx` L444–456; P09 cites L448)                                                                                                  |
| A14 | P09-M13                             | "Unstarted exercises vanish"                                                                                                                                                                      | Partly: they remain in the session record as "(not done)"; they aren't carried forward because the rotation advances (`session.ts` L56–63). User-facing claim stands (CI-49) |
| A15 | P07 root-cause claims               | "No custom targets on any tier", "no edit of logged entries", "no food database", "Progress 0 days after midnight = UTC"                                                                          | All four **confirmed** in source (CI-21, CI-48, CI-28, CI-45)                                                                                                                |
| A16 | P07 timeline 8 vs P05-M35 / P08-M06 | P07 describes the Weekly outlook as "Mon 21–Sat 26 (today, Sunday, is cut off at the edge)"                                                                                                       | Independent confirmation of the A6 correction (clipping, not last week)                                                                                                      |
| A17 | Tier triggers                       | P07 upgraded on pitch copy ("personal nutrition profile") like P02, not on a lock                                                                                                                 | §1 now separates lock-triggered from copy-triggered upgrades                                                                                                                 |
| A18 | P10-M32 vs P10-M47                  | In session P10 logs the Replace list as a Delight ("only offers me things I can eat"); in the sweep the same agent finds it isn't safety-filtered                                                 | Both right: the list was safe only because her plans were. Verified unsafe by construction (CI-26, B-46)                                                                     |
| A19 | P10-M29 vs P10-M50                  | Session attributes the protein drop to "after upgrade + AI plan"; sweep attributes it to completing gym setup ("Premium is unrelated")                                                            | Sweep is right: lifter rule on `setupCompletedAt` (CI-06, B-48)                                                                                                              |
| A20 | P10-M50 wording                     | "protein 2.2 → 1.6 g/kg"                                                                                                                                                                          | 128 g at 58 kg is the goal _split_ (≈ 22 % of 2,284 kcal), not a 2.2 g/kg rule; after gym setup it is MAINTAIN 1.6 g/kg = 93 g (`training-nutrition.ts` L35–42)              |
| A21 | Earlier CIs vs P10                  | v1/v2 CI-13 attributed "THIS WEEK shows next week's list" to the shopping-list fallback only; CI-06 said the g/kg rule applies "once metrics exist"; CI-26 said the Replace list was "not traced" | All three corrected in v3 with traced causes                                                                                                                                 |
| A12 | P06 upgrade trigger vs tier line    | P06 lists the AI Chef lock but moments cite no specific lock row (S1 step 12 only)                                                                                                                | Cited by timeline step in CI-02                                                                                                                                              |

## Appendix B — Traceability for downstream stages

Every CI keeps its ID through stages 2–4 (`moment → CI → B → UX → T`). Evidence rows added after v1 are labelled
"Added from P07/P09" (v2) and "Added from P10" (v3) inside each CI, so a downstream document written against v1 or v2
can diff by those labels. No CI was merged, split or renumbered in any round.
