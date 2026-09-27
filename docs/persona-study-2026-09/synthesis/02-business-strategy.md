# Persona Study 2026-09 — Stage 2: Business & product strategy

**Status: final (rev 3), built on the final synthesis** (`01-research-synthesis.md` v3: all ten personas, P01–P10).
**`B-xx` IDs are stable:** items can change bucket, score or scope, but they are never renumbered, and new items are
numbered after the last one. Reach counts read "n/10". Every change since rev 1 is listed in the
[Revision log](#revision-log) at the end, for stages 3 and 4, together with a consolidated list for the UX designer.

Role: senior product owner and market researcher (consumer health, fitness and food). Date: 2026-09-27.
Inputs: [`01-research-synthesis.md`](./01-research-synthesis.md) (insights `CI-01`…`CI-54`, delights `D-xx`, jobs
`J-xx`, bugs `B-nn` in its §7 — written here as **bug B-nn** to avoid a clash with backlog IDs),
[`00-market-research.md`](./00-market-research.md) (competitor sources `[Sx]`), [`../personas.md`](../personas.md),
the session exit interviews (P01–P10), `packages/types/src/plan-features.ts`, `business_flow.md` §9–§26,
`docs/ai-providers.md`, `docs/analytics-funnel.md`, `launch_plan.md` §3, and the draft store listing
(`docs/app-store/ios-drafts-2026-09-26/metadata.md`).

> **Caveat (carried from stage 1).** The users are synthetic: an LLM method-acting each persona on the real app.
> Treat every finding as a strong hypothesis. Counts are indicative (the personas were _designed_ to span
> segments, so "4/10" means "four segments hit it", not "40 % of users"). Stated willingness to pay is role-play:
> **premium was free in this build, so no upgrade in the study is evidence of conversion.** §8 says what to
> validate with real users before money or liability rides on it.

**How evidence and opinion are separated.** Blocks and table columns headed **Evidence** hold only what was observed
in the sessions, verified in the repo, or sourced in the dossier. Blocks headed **Recommendation** or **Opinion** are
my judgement. Where a recommendation touches one of the owner's standing decisions, it is flagged **⚖ Owner
decision** and is never assumed.

**Owner's standing decisions (respected throughout):** per-user AI is premium-only · all gym features are free ·
the beta has a soft paywall and no payment integration · production AI runs free-only on Groq then Cloudflare ·
Romania is the home market · the audience is solo cooks, households and gym-goers.

Contents: [1 Executive summary](#1-executive-summary) · [2 Who Chefer is for](#2-who-chefer-is-for) ·
[3 Competitive landscape](#3-competitive-landscape) · [4 JTBD, activation and habit](#4-jobs-activation-habit-and-retention) ·
[5 Monetisation](#5-monetisation) · [6 Opportunity backlog](#6-opportunity-backlog-b-xx) ·
[7 Metrics & instrumentation](#7-success-metrics--instrumentation) · [8 Validation & risks](#8-validation-plan-and-risks) ·
[9 Owner decisions](#9-decisions-for-the-owner) · [Appendix: CI → B map](#appendix-a--ci--b-coverage-map) ·
[Revision log](#revision-log)

---

## 1. Executive summary

**Where the product stands (evidence, final, indicative).** Across ten personas the mean SUS is **56.5** (only 1 of 10
at or above the 68 "average" mark). Willingness to open the app tomorrow unprompted averages **4.6/10**, and NPS
likelihood averages 4.6/10 (0 promoters, 9 detractors, **NPS −90**). **34 of 80 goals (43 %)** were completed. Eight of
ten upgraded, but only because "Upgrade — free for now" cost nothing. Gym-involved personas averaged SUS 59.6 and a
tomorrow-score of 5.7; food-only personas averaged SUS 50 and 3.3.

### The three biggest reasons people would not use Chefer, or would stop

**1. Safety and numbers are asserted, not shown, and sometimes they are wrong.**
_Evidence:_ the "someone gets hurt" Sev-4 moments are all diet and allergy failures. A tree-nut family was planned a
granola parfait with almonds in the photo; "no eggs" and "no fish" were ignored; a coeliac's "gluten-free" paella
carried stock and curry powder with no caveat, and the matcher misses spelt, seitan, semolina and malt (CI-10, 4/10).
The manual Replace picker is **not safety-filtered at all**, and neither is the AI Chef's "what can I make" list
(CI-26, 3/10). Editing a recipe labelled a chickpea curry "non-vegetarian" (CI-38). Nothing on any surface says what
was checked (CI-19, 4/10). Around this, targets **change silently** (protein 128 → 93 g after gym setup for one
persona, 184 → 204 g for another) and have no visible "why" (CI-06, 7/10). **Next week's plan shows as "this week"** on
Plan, Shop and Today, a verified data bug (CI-13, 7/10, Sev 3). And nobody believed the prices (CI-05, 5/10; the
absolute prices are mock). _So what:_ a restricted eater has to re-check every recipe, so the app saves no effort
("then what's the point?", P04). The data-literate user leaves on moving numbers ("numbers I can't trust are worse
than no numbers", P10). One visible miss becomes a one-star review and, once the EU product-liability directive
applies to software (9 Dec 2026 [S70]), a liability question.

**2. Everyone gets the same product, and it rarely matches the job they came for.**
_Evidence:_ one single-choice intent question (CI-03, 8/10), then a calorie-ring home (CI-01, 8/10), a 7-day ×
3–4-meal plan (CI-11, 5/10) and a _computed_ kcal target that nobody can override on any tier (CI-21, **Sev 4**, 5/10).
This applies equally to households, collectors, zero-waste cooks, lifters, a prediabetic, a precision tracker and an
endurance athlete. Evening re-entry doesn't surface tonight's dinner or workout (CI-04, 8/10). The tracker has no food
search (CI-28, Sev 4) and can't edit an entry (CI-48). The runner's long-run days aren't modelled (CI-20, 4/10).

**3. The job that brought people in is locked, hidden or unreachable at first touch, and the pitch names none of it.**
_Evidence:_ import, the pantry, household scaling, budget, Snap to log (invisible on free), your own targets
(impossible on any tier), and gym pause and reminders (built, with no entry point: CI-23, 6/10) (CI-02, 7/10). The
"See Premium" card sells "AI meal plans… nutrition profile" (CI-12, 9/10). The two gym-first personas stayed free
because the pitch "was all about meal plans". Several of these locks are **not AI at all**: household scaling,
training-day targets, pantry add/remove and budget storage are deterministic (`plan-features.ts`; `pantry.router.ts`).

**What already works and must be protected (evidence).** The **gym** logger, "Why? / Next time", the setup wizard and
its no-guilt tone (D1–D3, D22) carry every tomorrow-score ≥ 5: P09 calls it "the nicest logger I've used". **Privacy**
is the second asset: the consent sheet naming Groq and Cloudflare, one-tap revoke, clean export and delete, and no
tracking SDK (D6, D14, D24). The privacy persona's only recommendation was for that side ("I'd tell my vegan running
group about the privacy side", P10). On **food**: video-import review (D7), cook mode (D10), list ticking (D9), the
household setup (D8), and a planner whose recognised diets held (D16: P10's vegan + GF week was clean).

### The bet we recommend

> **Recommendation (final).** Make Chefer **the free gym log that bends to your week and also plans your food around
> your training, budget and time, and shows its work**. Win **Romanian people who train and cook for themselves
> (alone or for one other person)** first. Use the gym side, which already delivers an "aha" in session 1, as the
> acquisition and habit engine, and make it bend to real life (pause, finish later, "I've got 30 minutes"). Make the
> food side earn its place with: your own targets, numbers you can tap to their rule, a plan that fits how you cook,
> food that visibly follows training days (lifts _and_ runs), and a budget in lei. At the same time, build a **trust
> floor** that every segment needs: one safety filter on every surface, a visible "checked for…" read-back, and
> privacy gaps closed. **Households with allergies are the secondary segment.** They become the next acquisition push
> once the trust floor has passed a real-user safety validation (§8). **Precision trackers are not a target segment**,
> but their table stakes (own targets, edit and undo, recents) are in Now because the beachhead needs them too.

Why this bet, in one line each (details in §2):

- It starts from the only place the product already retains people (gym, D1–D3, D22), not from a promise it doesn't keep yet.
- The time-poor lifter's blockers are cheap: much of it is **built and unreachable** (CI-23).
- "Food that follows training" is something Hevy and Strong cannot do, and MacroFactor charges $89.99/yr for its
  bundle [S5]. That validates the combination and names the rival. P10 would pay €5–8 a month for exactly this, plus
  traceable numbers.
- "Shows its work" turns the two things that already earn praise, the gym "Why?" (D2) and the privacy disclosures
  (D6, D24), into the brand, and answers the category's #1 churn driver: data people don't trust [S58][S59].
- The training cook's food job (protein, budget, prep) carries **less allergen liability** than a nut-allergy family.
- Everything in the trust floor also unlocks the household segment next.

### Now (next ~8 weeks) at a glance

| Track                       | Items                                                                                                                                                                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trust floor (every segment) | **B-01** One safety filter on every surface · **B-02** Show the check · **B-11** Explain every number, never change it silently _(↑ rev 3)_ · **B-39** Privacy gaps closed _(new, rev 3)_ · **B-22** Wellness and AI guardrails · **B-26** Compliance pack before charging                                 |
| Beachhead activation        | **B-25** Store listing and first screen say what Chefer really does · **B-03** Onboarding by job · **B-04** "Tonight" home and context-aware return · **B-05** Protect the gym engine · **B-36** Training that bends to a chaotic week · **B-06** Food that follows training · **B-35** Set my own targets |
| Planning and logging core   | **B-08** Week mechanics you can trust (incl. the "next week shown as this week" data bug) · **B-07** Plan the meals I actually cook · **B-10** A paywall that names the job · **B-19** Log fast, fix mistakes · **B-13** Send the list to my partner                                                       |
| Enablers                    | **B-12** Mobile analytics with consent, privacy by default · **B-21** Bug sweep (Sev ≥ 3)                                                                                                                                                                                                                  |

**Stop doing now:** calorie ring as everyone's home, except for users who chose tracking (B-31); "AI meal plans" as
the premium headline under free-only AI (B-32); unitemised "Saved ~389,80 RON" claims (B-33); the unfiltered Replace
picker and "what can I make" list until B-01 lands (B-34, now a verified Sev-4 exposure).
**Don't:** race MyFitnessPal on a branded-food database or barcode (B-29, re-examined and kept); make medical or
diabetes claims (B-30).

### Top decisions for the owner (full list in §9)

1. **⚖ What premium is, given free-only AI.** Groq and Cloudflare free tiers give roughly **8 + 4 AI meal plans a
   day for the whole organisation** (`docs/ai-providers.md`, "Capacity per day"). Premium's headline, "AI meal plans
   tailored to you", cannot be served past a few dozen users; no persona asked for it; and the one persona who
   upgraded for it (P10) found the AI week further off target than the free one (mock content, real flow gap).
   Recommendation: rebuild premium around deterministic **"planning power"** (optimised curated plans for budget,
   pantry, batch-prep and training days, auto-planned week, household scaling), with AI (import, chat, swaps,
   correctable photo scan) as capped extras. The alternative is to fund paid AI before any launch.
2. **⚖ Take non-AI activation features off the paywall.** Your own kcal/protein targets (today they can't be typed on
   _any_ tier, CI-21), training-day targets on Today, manual pantry add/remove with dates, and a saved budget with an
   over-budget flag are not per-user AI, and competitors give most of them away [S1][S8][S9]. The per-user-AI rule
   stays intact.
3. **⚖ Confirm the beachhead, and decide whether the gym will ever carry a premium.** The beachhead is training cooks
   first and households second (gated on safety validation). Collectors, zero-waste cooks, health-motivated users and
   trackers get retention features, not acquisition pushes. Both gym-first personas found nothing to pay for, while
   P09 would pay for _adaptive training_ and P10 for _training-aware fuelling_. My recommendation keeps everything in
   the gym free and tests an "adaptive week" gym premium in the pricing research (V4) before touching your gym-free
   decision (D-11).

---

## 2. Who Chefer is for

### 2.1 Segment attractiveness vs current fit

Scores are 1–5. **Attractiveness** = size × willingness to pay × how open the competition is × how much risk we
carry. **Fit** = how well the build at `f8f7f74` already does that segment's core job. The evidence columns are
facts; the scores and the verdict are my judgement.

| Segment                                                                                                                                             | Personas                                                                                               | Evidence: what happened in the study                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence: market                                                                                                                                                                                                                                                         | Attract.           | Fit now               | Verdict (opinion)                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Training cooks**: lift (or run and lift) 2–5×/wk and cook for themselves or a partner (incl. time-poor, lapsed lifters and endurance athletes) | P01, P02, P03, P06 (both halves); P09 (gym-first, new parent); P10 (runner who lifts, vegan + coeliac) | The highest scores in the study: tomorrow 5 · 6 · 7 · 5 · 6 · 5 and SUS 60 · 55 · 70 · 45 · 65 · 62.5 (gym-involved average SUS 59.6, tomorrow 5.7). Gym "aha" in session 1 (P03-M10, P01-M11, P09-M09); P10 called the 2-day setup calm (P10-M19). Endurance and long-run fuelling are not modelled (CI-20, P10). Gym side: expert control (CI-30, CI-31) and adaptation for busy lives (CI-23 pause/reminders unreachable, CI-49 finish later, CI-50 time available). Food side: no training-day link (CI-20), no meal-prep (CI-11), budget locked (CI-16), own targets impossible (CI-21), jargon for beginners (CI-32). Both gym-first personas stayed free: nothing in the pitch for them (CI-12). | 75.5M European gym members, 9.3 % penetration [S49]. Loggers are free or cheap and cap routines (Hevy 4, Strong) [S15][S17]. MacroFactor sells a nutrition + workouts bundle at $89.99/yr [S5]. No competitor checked offers plan + list + train in Romanian [S4]–[S21]. | **4**              | **3** (gym 4, food 2) | **Primary beachhead**                                                                                                                |
| **B. Households**: feed a family, often with an allergy                                                                                             | P04 (family of 4, tree nut); P08 (two people)                                                          | The highest stated willingness to pay ("one Glovo order a month", P04). The household setup delighted (D8). But: an unsafe item was planned (CI-10), the check is never shown (CI-19), partners can't see the list (CI-17), and the list over-buys (CI-22). NPS 4.                                                                                                                                                                                                                                                                                                                                                                                                                                      | Family AI planning is thin: Ollie (US only) [S28], Kaufland's recipes + shared list [S30]. Mealime closes on 21 Oct 2026 [S22]. Romania has the EU's highest inflation [S51]. EU product liability covers software from 9 Dec 2026 [S70].                                | **5**              | **2**                 | **Secondary: next push, gated on the trust floor**                                                                                   |
| **C. Recipe collectors**: turn saved links and reels into dinners                                                                                   | P05 (P08 partly)                                                                                       | Import is fast and the video review draft delighted (D7). But import is locked at first touch (CI-02), link imports have no review (CI-33), imports vanish from "All" (CI-08), and diet safety broke three ways (CI-10, CI-26, CI-38). Tomorrow 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Samsung Food imports for free, social links included [S24]. Paprika is $4.99 one-off [S25]. Plan to Eat $49/yr [S27].                                                                                                                                                    | **2**              | **2**                 | Retention feature, not an acquisition wedge                                                                                          |
| **D. Zero-waste / thrifty cooks**: use up the fridge                                                                                                | P08 (P05 partly)                                                                                       | The worst score in the study: SUS 37.5, tomorrow 2. The pantry can't be written on free and has no dates (CI-25), the list itself creates waste (CI-22), and savings claims are not itemised (CI-05).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | No competitor in the sample does pantry-with-dates planning well. EU households waste 69 kg per person a year [S52]. Romania: inflation [S51].                                                                                                                           | **3**              | **1**                 | Later wedge; build its parts as retention (B-14, B-15)                                                                               |
| **E. Health-motivated**: "my GP told me to"                                                                                                         | P06                                                                                                    | Gym onboarding is excellent for a novice (D3). Food: no condition input, no framing, no disclaimer (CI-44); unexplained numbers (CI-06); no goal-weight line (CI-21, CI-29).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Large: prediabetes affects 16.5 % of Romanian adults ⏳ [N1]. But the claims decide medical-device status [S63], Apple 1.4.1 scrutiny applies [S64], and GLP-1s are reshaping the category [S13][S60].                                                                   | **3** (big, risky) | **2**                 | Serve with wellness framing only; **don't** build medical features                                                                   |
| **F. Precision trackers**                                                                                                                           | P07 (also P01 for own protein)                                                                         | SUS 57.5 but tomorrow 2, NPS 2: "easy to use" and "For what? My targets are wrong." Can't type targets on any tier (CI-21, Sev 4); no food search (CI-28, Sev 4); no edit, instant delete (CI-48); snap estimate can't be corrected (CI-47) and is hidden on free (bug B-35). Delights: tracker home (D20), 3-second snap with a stated portion (D21), planned-meal ticking with portion chips (D23, "something MacroFactor doesn't do").                                                                                                                                                                                                                                                               | The most contested space: MyFitnessPal plus Cal AI [S3], MacroFactor, Cronometer, Yazio. P07 already pays MacroFactor.                                                                                                                                                   | **2**              | **1**                 | **Don't target as a segment.** Do ship its table stakes, which the beachhead also needs (B-35, B-19); snap correction is Next (B-37) |

**Reading the grid (opinion).** Households are the most attractive segment and the worst-fitting today, and the gap
is mostly trust (CI-10/19/26) and planning shape (CI-11/17/22). Training cooks are the best-fitting segment and
attractive enough, and their food gaps (CI-11, CI-16, CI-20, CI-21) are cheaper and carry less liability. P09
widens segment A with the most common real-life lifter (time-poor, lapsed, allergic to guilt), whose blockers are
mostly built but unreachable (CI-23). So I would start with A and let every trust-floor item double as B's entry
ticket. C, D, E and F then get what they need as features inside that product (import, pantry, goal line, own
targets, edit and recents), not as separate positioning.

**P10 widens it again (rev 3):** a runner who lifts wants the plan to fuel her lift days and long-run days
differently (CI-20, CI-21), and would pay €5–8 a month for that plus traceable numbers. The beachhead's food promise
is therefore "follows your training", not only "follows your lifts" (B-06 scope).

**Re-examined at n/9 (P07), confirmed at n/10:** should precision tracking move up? The Sev-4 findings (CI-21, CI-28) are real, but most
of their reach sits inside the beachhead already (P01 wants his own 180 g protein; P06 can't log a sandwich). Their
fix is table stakes: type your target, edit an entry, log again. That goes to **Now** (B-35, B-19). Competing with
MacroFactor or MFP for people who weigh every gram does not (B-29 stays Don't). P07 herself names the one wedge Chefer
could own for trackers, "snap-to-log for restaurants" that she can correct, and that is Next (B-37).

### 2.2 Why not lead with households? (the strongest counter-argument, answered)

_For households:_ the clearest white space in Romania [00 §5.2 #1], the highest stated willingness to pay, a
delightful setup (D8), and a family-plan price point competitors are not filling.
_Against, for now:_ (1) the Sev-4 "someone gets hurt" moments in the study are allergy and diet misses (4/10,
including P10's hidden gluten), and the fix (B-01, B-02) needs a real-user safety validation before we market
"safe for your family" (§8); (2) the EU product-liability
directive makes an allergen miss a product-defect question from 9 Dec 2026 [S70]; (3) the household's aha also needs
dinners-only planning (B-07), a list that doesn't over-buy (B-14) and partner access (B-13, B-27), which is roughly
two quarters of work. **Recommendation:** build the trust floor now (it is needed anyway), run the safety validation in
parallel, and make households the acquisition push once B-01, B-02, B-07 and B-13 have shipped and validated. The
point is sequencing; households stay a target.

### 2.3 Positioning

> **For people who train and cook for themselves (or for one other person)**, Chefer is **the free gym log that bends
> to your week and also plans your food around your training days, budget and cooking time**, with one shopping list
> and a reason behind every number. **Unlike Hevy or Strong**, which only log, and **unlike MyFitnessPal**, which makes
> you log food but never decides it, **Chefer decides what to lift and what to cook, tells you why, and asks before
> your data goes anywhere.**

Supporting claims we can make **today** (evidence): free unlimited routines with explainable progression (D1–D3,
`plan-features.ts` `gymTraining`), allergies and household members respected free on every tier (`safetyPreferences`,
`householdMembers`), one-tap weekly plans (D5), aisle-grouped list (D9), cook mode (D10), and **privacy by default**:
no tracking SDK, per-action AI consent naming the providers, one-tap revoke, export and delete (D6, D14, D24).
Claims to **earn first** (Now items): "food that follows your training" (B-06), "plans that fit how you cook" (B-07),
"shows you it checked" (B-02), "pause, finish later, fit the time you have" (B-36; pause is built and unreachable today),
"your targets, not ours" (B-35), "tap any number to see its rule" (B-11). The draft store listing already promises time, budget and pantry planning; B-25 brings
it back in line with what works.

**Secondary positioning (households, once validated):** "Tell Chefer once who's at your table and what they can't
eat. Get a week of dinners that shows it checked, one list your partner can see, and portions for everyone."

## 3. Competitive landscape

**Evidence base.** Prices and facts come from the dossier [`00-market-research.md`](./00-market-research.md). Its
sources were accessed on **2026-09-26** (one day before this document), so the prices are date-checked to that day.
US prices are from US storefronts; RON prices were read from the Romanian App Store and are ranges because Apple lists
every price point. ⚠️ = a secondary source, often a competitor's blog. I added one new source ([N1], below) to fill
a gap stage 1 left open: the size of the health-motivated segment.

### 3.1 Who wins on what

| App                                  | Wins on (evidence)                                                                            | Price (US mo / yr)                                | Price RO App Store (lei)             | Chefer vs it (opinion)                                                                                                                                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MyFitnessPal**                     | Largest food DB; now plans too (Meal Planner in Premium+); bought Cal AI in Mar 2026 [S2][S3] | $19.99 / $79.99; Premium+ $24.99 / $99.99 [S1] ⚠️ | 39.99–409.99 [S4]                    | Don't fight on logging (B-29). Win on "decides the week, doesn't make you log" (P02: "better than MyFitnessPal because it plans instead of making me log")                                                                                                                                      |
| **MacroFactor**                      | Adaptive expenditure algorithm; **Workouts app + bundle** (Jan 2026) [S5][S7]                 | $11.99 / $71.99; bundle $89.99/yr [S5] ⚠️         | 294.99–354.99/yr; bundle 499.99 [S6] | **The closest rival to the beachhead thesis.** It has no free tier, no meal _plans_, no list, no RO UI. Chefer: free gym, plus plans that cook for your training days. P07 (a MacroFactor user) would not switch for tracking; she valued the planned-meal ticking that MacroFactor lacks (D23) |
| **Cronometer**                       | Accuracy; generous free tier incl. barcode [S8]                                               | Gold $10.99 / $59.99 [S8]                         | n/a                                  | Not the beachhead's rival                                                                                                                                                                                                                                                                       |
| **YAZIO**                            | EU mass market, fasting, regional discounts [S9] ⚠️                                           | ~€4.99–5.99 / ~€29.99 [S9] ⚠️                     | 34.99–149.99 [S10]                   | Owns the "diet" frame Chefer should step away from (B-31)                                                                                                                                                                                                                                       |
| **Lose It!**                         | Simple, gamified [S11] ⚠️                                                                     | $39.99/yr ❓ [S11]                                | 29.99–399.99 [S12]                   | —                                                                                                                                                                                                                                                                                               |
| **Hevy**                             | Free unlimited workouts, social feed; **caps routines at 4** on free [S17] ⚠️                 | $2.99 / $23.99 / $74.99 lifetime [S17] ⚠️         | 14.99–22.99/mo; 122.99/yr [S18]      | Logger parity (D1: "as fast as Strong", P01). Chefer's free tier is more generous (no routine cap) and adds food. Gaps: watch app, Health sync, social (out of scope, `gym_plan.md`)                                                                                                            |
| **Strong**                           | Minimal, fast logger; routine cap on free [S15]                                               | $4.99 / $29.99 / $99.99 [S15] ⚠️                  | 109.99–142.99/yr [S16]               | P01 and P09 come from Strong; P09 already rates the logger above it ("Better than Strong", P09-M09). Chefer must match its split setup, PRs and history tab (CI-30, CI-36, CI-52)                                                                                                               |
| **Fitbod**                           | Auto-generated workouts; price up in Aug 2026 [S20] ⚠️                                        | $15.99 / $95.99 [S20] ⚠️                          | 399.99–499.99/yr [S21]               | Chefer's free explainable progression is the cheaper answer for beginners (D2, P03)                                                                                                                                                                                                             |
| **Mealime**                          | Simple quick plans and lists; **closing 21 Oct 2026** [S22]                                   | Pro $5.99 / $49.99 [S23] ⚠️                       | n/a                                  | Its displaced users want what Chefer's _free_ tier does. Only worth courting once B-07 ships (quick dinners, fewer meals)                                                                                                                                                                       |
| **Samsung Food**                     | Free import incl. social links; manual planning [S24] ⚠️                                      | Food+ $6.99 / $59.99 ❓ [S24]                     | n/a                                  | Beats Chefer on free import (CI-02 for P05). B-17 is the answer                                                                                                                                                                                                                                 |
| **Paprika / Plan to Eat**            | Owning your recipes, cheap [S25][S27]                                                         | $4.99 one-off / $49 yr                            | n/a                                  | Collectors pay little; don't build the wedge here                                                                                                                                                                                                                                               |
| **Eat This Much**                    | Auto plans to hit macros; repetition by week 3–4 [S26] ⚠️                                     | $14.99 / $59.99 [S26] ⚠️                          | n/a                                  | Same risk for Chefer's curated pool; watch variety                                                                                                                                                                                                                                              |
| **Ollie**                            | AI family planner (US) [S28]                                                                  | $9.99 · $28.99 · $79.99 (tiers not mapped)        | n/a                                  | Nearest analogue for segment B; not in RO                                                                                                                                                                                                                                                       |
| **RO: Kaufland app**                 | 4,000+ recipes with diet filters, one tap to a shared list, Romanian [S30]                    | free                                              | free                                 | The real local competitor for households. No goals, no plan, one retailer                                                                                                                                                                                                                       |
| **RO: FitDiary / Eat & Track**       | Romanian food photo diary / RO store product DB [S34][S35]                                    | small                                             | small                                | Trackers; not the beachhead's rival                                                                                                                                                                                                                                                             |
| **RO: Carrefour / Freshful / Glovo** | Prices, loyalty, delivery [S31][S32][S33]                                                     | —                                                 | —                                    | Partners, not rivals (price data, fulfilment). Later                                                                                                                                                                                                                                            |

**Price anchors (evidence) for the monetisation section:** gym loggers $24–30/yr (lifetime $75–100); mass trackers
$30–80/yr; AI/coaching apps $60–100/yr; meal planners $49–60/yr [00 §2.3]. H&F median price $9.99/mo and $39.94/yr;
Western-Europe median $39.44/yr; 68 % of H&F subscriptions are annual [S46]. In lei, the RO App Store tiers of the
leaders run from about 15 lei/mo (Hevy) to 500 lei/yr (MacroFactor bundle) [S6][S18]. Romania's purchasing power is 79 %
of the EU average and its price level 40–50 % below it [S50], but app prices in lei are not discounted to match.

### 3.2 Where Chefer can differentiate (opinion, ranked)

1. **Food that follows training, with a free gym side.** A lifter gets Hevy-level logging free, and the plan knows
   Mon/Wed/Fri are training days. Nobody in the sample offers the combination free, and in Romanian nobody offers it at
   all. _Evidence it matters:_ P01, P02 and P03 all asked for it unprompted (CI-20, J8), and P01's only upsell refusal
   was this feature.
2. **Explainability as the brand.** The gym "Why?" sheet (D2) is the most-praised pattern in the study. Extending it
   to food numbers, prices and safety (B-02, B-11) answers the #1 churn driver in the category, inaccurate or
   unexplained data [S58][S59], and it lines up with 2026–27 regulation (AI Act Art. 50, product liability).
   **Privacy is the other half of "shows its work"** (rev 3): P10, who reads privacy policies, rated Chefer's consent,
   revoke, export and delete better than Cronometer and Yazio (D6, D14, D24), and it was the one thing she'd recommend.
   In a category where apps share health data widely and GDPR reads health data broadly [S66], "no tracking, we ask
   before your data leaves" is a claim few competitors can make. Close the gaps first (B-39).
3. **Weekly rhythm, no shame.** Weekly streaks, "missing a session changes nothing" (D3), no red days. This matches
   the UCL evidence on shame and streak loss [S55] and P03's and P09's deal-breakers.
4. **Romanian context:** lei, Carrefour prices, Romanian staples (cabbage, pork, _telemea_, which are missing today:
   CI-08), and possibly a Romanian UI (B-24, validate first). No global app in the sample has a Romanian UI [S4]–[S21].
5. **Households with visible safety** (secondary segment). Free per-member allergies already exist (`householdMembers`);
   showing the check (B-02) would make it unique.

### 3.3 Where Chefer should not fight (opinion)

| Fight                                  | Why not                                                                                                                                                                       | Backlog                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Food database, barcode, branded foods  | MFP (20M foods + Cal AI [S3]), Cronometer, Yazio, and in RO Eat & Track's store DB [S35]. It is a data business, not a feature. Re-examined after P07 (CI-28 now Sev 4): kept | **B-29 Don't**; answer CI-28 with recents, edit, catalogue search in grams and "log a planned meal" (B-19, now Now) |
| Photo-logging accuracy                 | Industry-wide ~40 % energy error [S58]; Cal AI owns the brand                                                                                                                 | Keep Snap-to-log premium and as-is; don't market it                                                                 |
| Adaptive TDEE algorithm vs MacroFactor | Its core product and brand [S7]                                                                                                                                               | Keep the weekly review as one feature                                                                               |
| Medical nutrition (diabetes)           | Device-status and claims risk [S63][S64]                                                                                                                                      | **B-30 Don't**                                                                                                      |
| Social feed                            | Hevy's moat [S17]; out of scope                                                                                                                                               | Not in backlog                                                                                                      |

## 4. Jobs, activation, habit and retention

### 4.1 JTBD ranking

Jobs are the unmet jobs `J1–J16` from stage 1 §3. The rank is my judgement and combines reach, severity, how well
the job fits the beachhead, and whether it is a precondition for other jobs. (Rev 2 added J13 and J14; rev 3 adds J15
and J16 and extends J1 and J8 with P10.)

| Rank | Job (user's words, stage 1)                                                                                  | Personas (n/10)                                                            | Segment               | Status at `f8f7f74` (evidence)                                                                                                          | Why this rank (opinion)                                                              | Backlog          |
| ---- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------- |
| 1    | **J1** "Tell it once what we can't eat, never see it again, and show me you checked"                         | P04, P05, P06, P10 (4)                                                     | All with restrictions | Planner holds for recognised diets (D16); silent misses (granola, "no eggs", hidden gluten); Replace picker unfiltered; no positive cue | A floor, not a feature: it gates households, restricted eaters and store reviews     | B-01, B-02, B-34 |
| 2    | **J8** "Food and training in one app: eat more on training days (lift _and_ long-run days), one week view"   | P01, P02, P10 (+P03, P06 at sign-up) (5)                                   | A                     | Bump locked; lifter-only rule; no plan marker; single-choice intent                                                                     | The beachhead's reason to pick Chefer over Hevy + MFP; P10's no-brainer              | B-06, B-03       |
| 3    | **J15** "Show me where every number comes from, and don't change it behind my back"                          | P10, P06, P07 (3; CI-06 reach 7)                                           | All, esp. A and F     | The one explanation sits four screens deep; targets change silently after gym setup; plans miss their own targets with no fix           | Trust in numbers is the second half of "shows its work"; cheap relative to its reach | **B-11**, B-35   |
| 4    | **J14** "Fit training around a chaotic week: time I have, pause, resume, nudge me only when I've gone quiet" | P09 (+P06 session length; CI-23 reach 6)                                   | A (time-poor)         | Pause and reminders built but unreachable; no time budget; no resume; kind mechanics invisible                                          | Cheapest retention win in the study: much of it is already built                     | B-36             |
| 5    | **J9** "Run my own split with my real numbers, tell me when to go heavier"                                   | P01 (+P09 and P03 on the incomplete-set rule, CI-31 3/10) + beginners' J12 | A                     | Split hidden; wrong Next-time targets                                                                                                   | Protects the retention engine; an expert who distrusts it leaves ("back to Strong")  | B-05             |
| 6    | **J3** "Plan only the meals I actually cook" (4 dinners, dinners only, batch lunch)                          | P02, P04, P05, P08, P10 (5)                                                | A, B, C, D            | Absent                                                                                                                                  | The most-shared food blocker, and meal-prep is the beachhead's food job              | B-07, B-09       |
| 7    | **J13** "Let me set my own targets, log fast, and fix it when I'm wrong"                                     | P07 (+P01 own protein, P10 athlete goal; CI-21 5/10, Sev 4)                | F, and A              | Targets computed-only on every tier; no edit; no recents; snap not correctable                                                          | Table stakes the beachhead also needs; the precision _segment_ is still not a target | B-35, B-19, B-37 |
| 8    | **J4** "Keep the week under my budget, in my money"                                                          | P01, P03, P08 (3)                                                          | A, D                  | Locked; not saved on free; no over-budget flag                                                                                          | Romania: inflation [S51]; two beachhead personas asked                               | B-16, B-03       |
| 9    | **J7** "Share the list with my partner"                                                                      | P02, P04, P08 (3)                                                          | A (couples), B        | Absent                                                                                                                                  | Cheap, and the only referral loop found                                              | B-13, B-27       |
| 10   | **J11** "Tell me how I'm doing"                                                                              | P06, P02, P01, P07, P09 (5)                                                | A, E, F               | Progress is food-only; "−79 %"; UTC "0 days"; no PRs, trend or history list                                                             | Reward side of the habit loop                                                        | B-20, B-05, B-36 |
| 11   | **J12** "Show me what a beginner needs to know"                                                              | P03, P06, P05, P09 (4)                                                     | A (beginners)         | Detail excellent but unreachable; jargon                                                                                                | Cheap wins inside B-05                                                               | B-05, B-18       |
| 12   | **J10** "Log what I ate without knowing the calories"                                                        | P07, P06, P01 (3)                                                          | A, E, F               | Absent in Quick add; no search                                                                                                          | Needed to "good enough", not to MFP depth (B-29 Don't)                               | B-19             |
| 13   | **J16** "Handle my data like I would: ask first, tell me who gets it, let me take it back and leave"         | P10 (D6 praised by 7 others)                                               | All                   | **Largely done**; gaps: implied Terms consent, opt-out emails, no consent record, export gaps, silence on data already sent             | Protect and close the gaps; it's a positioning asset (§3.2)                          | **B-39**, B-26   |
| 14   | **J2** "Cook tonight from my fridge before it goes off"                                                      | P08, P05 (2)                                                               | D                     | Absent on free; no dates                                                                                                                | Big build, narrow segment; strong retention hook later                               | B-15             |
| 15   | **J6** "Turn my saved links into a cookbook I cook from"                                                     | P05, P08 (2)                                                               | C                     | Locked; link import has no review                                                                                                       | Competitors give it free; do the cheap parts                                         | B-17             |
| 16   | **J5** "Get me to my goal weight / eat right for my blood sugar"                                             | P06 (+P02, P01, P07 goal parts) (4)                                        | E                     | Absent                                                                                                                                  | Goal line yes (B-20); medical framing no (B-30)                                      | B-20, B-22, B-30 |

### 4.2 The activation ("aha") moment per segment

**Evidence.** The observed aha moments: gym, "it tells me the actual weight" (P03-M10, P01-M11), "it figured out
I can go heavier" (P03-M26), and for P09, a half session still counting as "1 of 2" (P09-M11, D22); food, only the
instant plan (D5) and "my recipes on top" in Replace (P05-M28); tracking, the 3-second snap estimate (D21), which then
could not be corrected. No food-only persona reached an aha in session 1 (stage 1 §5).

**Recommendation: activation definitions** (the event names are in §7; the time windows are hypotheses to tune
once real data exists).

| Segment                                         | The aha, in the user's terms                                                                 | Activation = within the window…                                                                                   | Window  | Blocked today by                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------- |
| **A. Training cook** (primary)                  | "It knows my training _and_ my week of food knows my training days" (lift or long-run days). | ≥ 1 `workout_finished` **and** ≥ 1 plan viewed with training days marked (`plan_viewed{trainingDaysMarked:true}`) | 7 days  | CI-03 (never asked about food), CI-20 (no marker), CI-01 |
| A, gym-only sub-case                            | "It told me what to lift and got smarter."                                                   | ≥ 2 `workout_finished`                                                                                            | 7 days  | CI-31 (wrong targets for experts)                        |
| A, time-poor sub-case                           | "It fit the time I had, and a cut-short session still counted."                              | ≥ 2 `workout_finished` (either may be partial) **and** reminder or pause set up                                   | 10 days | CI-23, CI-49, CI-50, CI-51                               |
| **B. Household**                                | "A week of dinners for all of us, and it shows it checked for Luca."                         | household ≥ 2 members with ≥ 1 safety item + plan generated + `safety_checks_viewed` + `list_shared`              | 3 days  | CI-19, CI-11, CI-17, CI-02 (scaling)                     |
| C. Collector                                    | "My saved recipe is in this week's plan."                                                    | ≥ 1 recipe imported **and** placed in a plan                                                                      | 3 days  | CI-02 (lock), CI-08, CI-18                               |
| D. Zero-waste                                   | "It told me what to cook first."                                                             | ≥ 5 pantry items with a use-by + 1 "use soon" meal cooked                                                         | 7 days  | CI-25 (no writes, no dates)                              |
| E. Health-motivated                             | "I can see the line from 102 to 92."                                                         | goal weight set + 2 weigh-ins                                                                                     | 14 days | CI-21, CI-29                                             |
| F. Tracker (not a target; measured to catch it) | "My targets, my numbers, and I can fix a mistake."                                           | own targets set + ≥ 3 days with ≥ 3 logged entries                                                                | 7 days  | CI-21, CI-28, CI-48, CI-47                               |

### 4.3 The habit loop that fits Chefer

**Evidence to design from:** tracking fatigue and shame drive churn [S54][S55]; well-timed, personalised nudges help
[S57]; the gym side already runs weekly goals and flex weeks without red misses (`business_flow.md` §21, D3); the
personas' natural rhythm was weekly (a Sunday prep or shop: P02, P04, P08) plus evenings (tonight's dinner or workout:
CI-04). Category retention is low: D1 20–27 %, D7 ~7 %, D30 ~3 %, with leading fitness apps at D30 8–12 % ⚠️ [S48].

**Recommendation: two nested loops, both weekly-first.**

```
WEEKLY LOOP (Sun/Mon)                         EVENING LOOP (training days + dinner days)
Trigger  "Your week is ready" push/email     Trigger  reminder at the user's time + Tonight card on open (B-04)
Action   check the week, fix 1–2 meals,       Action   log the workout / cook tonight's dinner
         send the list to the partner (B-13)
Reward   list in lei, training days covered,  Reward   Next-time target, PR, weekly ring;
         "checked for…" (B-02)                         "done" on the plan
Invest   ratings, kept picks, pantry          Invest   history, routines, ratings → better next week
```

**Retention mechanics that fit (opinion, with the evidence behind each):**

- **Context-aware landing** (B-04): the app already knows the planned training day, tonight's planned dinner and,
  later, expiring items. It currently uses "last mode" (CI-04, 8/10). This is one of the two cheapest retention levers in the study.
- **Make the kindness visible** (B-36): weekly streaks, flex weeks, neutral pauses and "half a session counts" are
  built and fit exactly what P09 needs, but the UI leads with "0-week streak" from minute one (CI-51). Say what the
  rules are, lead with the weekly ring, and after a missed day say something kind and useful (P09-M23). This is the
  other cheap lever.
- **Life-proof sessions** (B-36): "finish later" or carrying unstarted exercises to next time (CI-49), and "how long
  have you got?" (CI-50). P09: "if I stop halfway, keep the rest for next time".
- **Weekly goals, never daily streaks, for food too.** Extend D3's tone. Evidence: [S55]; P03's delete trigger was
  "if it guilt-trips me with the streak", and P09's was "You broke your streak!"
- **Progress you can feel:** Next-time targets and PRs for lifters (CI-31, CI-36: currently "No PRs yet" after real
  maxes); a goal line for weight (B-20).
- **Switching costs that come from usefulness:** ratings that shape next week, kept picks, routines and history.
- **Partner loop** (B-13, later B-27): the only referral mechanism the study surfaced; today the list goes back to
  WhatsApp or Keep (P04, P08).
- **Avoid:** calorie-first framing for people who skipped the goal (CI-01; B-31), nag notifications (the web nudge cap
  of one per day stays; port it), and fake urgency (already a rule).

## 5. Monetisation

Scope: **mechanics only**. Real prices are out of scope. Competitor price anchors are in §3.1.

### 5.1 Evidence: what the personas said they would pay for

All ten exit interviews asked "Would you pay? For what? What would make it a no-brainer?" Remember that this is
role-play and premium cost nothing.

| Persona                                                     | Would pay for (verbatim or close)                                                                                                                                                                                   | Stated anchor                                                  | Would **not** pay for                                                                                | Upgraded in study? (trigger)                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| P01 Andrei (lifter)                                         | "a meal plan that hits 180 g protein at a Lidl budget … and a food search"                                                                                                                                          | —                                                              | "AI meal plans? Don't care." Training-day calories: "That should be free"                            | No; the one lock "felt like a penalty"                               |
| P02 Maria (lifts + preps)                                   | "if it gave me back my Sunday": batch lunch, one list, more food on gym days, automatically                                                                                                                         | "what I paid for MyFitnessPal" (MFP Premium $79.99/yr [S1] ⚠️) | Faster swaps and leftovers ("which isn't that")                                                      | Yes (the pitch)                                                      |
| P03 Jake (beginner)                                         | "a week of food for under 60 bucks … and it stayed under 60"                                                                                                                                                        | "like 3 bucks a month"                                         | —                                                                                                    | Yes (budget lock)                                                    |
| P04 Elena (family)                                          | dinners only, "never puts nuts in, and tells me so on every recipe", respects "no fish", "Mihai can see the list"                                                                                                   | "one Glovo order a month"                                      | Paying "for something I still have to double-check"                                                  | Yes (household scaling)                                              |
| P05 Priya (collector)                                       | "turning my saved reels and links into a cookbook I actually use", then 4 × 15-min dinners for 2                                                                                                                    | "a few pounds a month"                                         | "calorie targets or an AI that 'adapts recipes to my goals'"                                         | Yes (import lock)                                                    |
| P06 Tom (health)                                            | "something my GP would nod at": what to eat for blood sugar and why, a line to 92 kg, log without calories                                                                                                          | "a few pounds a month"                                         | Anything charged "that I hadn't agreed"                                                              | Yes (AI Chef lock)                                                   |
| P07 Ioana (precision tracker)                               | "if the photo estimate became a starting point I can correct … Plus my own targets and a food search. Then snap-to-log for restaurants is the no-brainer I came for."                                               | pays for MacroFactor today (294.99–354.99 lei/yr in RO [S6])   | Anything while "my targets are wrong"                                                                | Yes (pitch: "personal nutrition profile", hoping for custom targets) |
| P08 Daniela (zero-waste)                                    | "type or scan my fridge in, it tells me what goes off first, two dinners that use those things"; video import                                                                                                       | "10, 15 lei a month"                                           | "I'd never put my card in for a list that tells me to buy four half-cabbages"                        | Yes (import / pantry)                                                |
| P10 Lena (vegan + coeliac runner who lifts; privacy-minded) | "a plan that knows Tuesday is a lift day and Saturday is my 25 km long run, and fuels them differently … 'gluten-free' that comes with a 'certified GF stock/oats' note … every number tappable down to its source" | "€5–8 a month"                                                 | An AI week that misses its own target ("Today Cronometer gives me the trustworthy numbers for free") | Yes (curiosity about the AI chef and "tailored" plans)               |
| P09 Chris (time-poor lifter)                                | "the training side if it did the adapting for me: 'you've got 25 minutes? here's the short version', 'you missed Wednesday — do B on Friday', pause for holidays, and a reminder that's smart about my week"        | "a Headspace-ish amount"                                       | "Not for what I saw — Premium was all about meal plans"; "Meal plans are a bonus"                    | No (nothing for training in the pitch)                               |

**Patterns (evidence, 10/10):** nobody named AI chat or AI meal plans as the thing worth paying for; the one persona
who upgraded for AI plans (P10) was disappointed by them, and the one AI feature anyone named (P07's photo logging)
was wanted only **if it can be corrected**. Every "no-brainer" is **a plan, or a tool, that does my specific job under
my constraints**: budget (P01, P03, P08), time or meal shape (P02, P04, P05, P09), people (P04), fridge (P08),
training (P01, P02, P09, P10), goal (P06), my own targets (P07). And, 5/10 say it outright, it must be **trustworthy
first** (P02 prices, P04 nuts, P05 eggs, P07 "my targets are wrong", P10 "every number tappable"). Stated anchors
cluster low: about 10–15 lei, $3 or a few pounds a month. The exceptions are the premium-inclined: P02 at MFP level,
P04 at "a Glovo order", P07 at MacroFactor level, P09 at "Headspace-ish" and P10 at €5–8 a month.

**Tension (evidence → ⚖).** Both gym-first personas (P01, P09) stayed free because the pitch offered nothing for
training. P09's willingness to pay is for **adaptive training**, which the gym-free decision puts out of reach, while
P10's is for **training-aware food**, which is a food feature and fits premium without touching the gym decision. Recommendation in §5.3 and D-11: keep the reliability features free (pause, finish later, history, reminders:
table stakes that Strong and Hevy give away), and test an "adaptive week" gym premium in V4 before deciding anything.

### 5.2 Constraints that shape premium (evidence)

1. **Free-only AI capacity.** On Groq and Cloudflare free tiers: roughly **8 AI week plans a day on Groq + ~4 on
   Cloudflare, for the whole organisation**, "enough for development and a small group of testers, not for launch
   traffic"; a Cloudflare plan takes ~7 minutes (`docs/ai-providers.md`, "Capacity per day", measured 2026-09-26).
   Swaps (~275/day), imports (~165/day) and chat turns (~100/day) all draw from the same pool.
2. **Per-user AI is premium-only** (owner, 2026-09-25), so AI can't be a free taste.
3. **Several current locks are not AI:** `householdPlans` (portion scaling), `trainingNutrition` ("Deterministic — no
   extra AI call"), `profilePersonalisation` (targets), `pantry.addItem/removeItem` (plain writes), and budget storage
   (`plan-features.ts`; `pantry.router.ts` L18–53; `preferences.router.ts` L102).
4. **Phase C gate** (`launch_plan.md` §3): no price until ≥ 25 % of active free users hit an upgrade touchpoint weekly
   **and** premium W4 retention clearly beats free. That can't be measured on mobile today, because mobile ships no
   analytics SDK (`docs/analytics-funnel.md`; `mobile_parity_backlog.md`; confirmed in synthesis v3 §7). That absence is
   also a praised privacy strength (D24), so whatever B-12 adds must keep it: anonymous by default, no tracking prompt.
5. **Market:** freemium converts 2.1 % of downloads to paid by D35, against 10.7 % for a hard paywall; longer trials
   convert better (17–32 days: 42.5 % trial→paid, against 25.5 % for ≤ 4 days ⚠️); Western Europe converts below the H&F
   median [S46]. Competitors give away logging and basic targets and charge for AI and automation [00 §1.1].

### 5.3 Recommendation: premium = "the chef does the planning work"

**Opinion.** Premium should sell **outcomes that save the planning hour**, most of them deterministic so they scale on
free-only AI, with AI features as capped extras. Free should sell **the tools and the trust**: a user who never pays
still gets a safe, explained, useful week, and still logs every workout.

| `plan-features.ts` key (today)                                                                          | Today                                     | Recommended                                                                                                                                                                                              | Why (evidence → opinion)                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `safetyPreferences`                                                                                     | free                                      | **free**, extended to _every_ surface plus the visible check (B-01, B-02)                                                                                                                                | CI-10/19/26/38; trust floor                                                                                                                                      |
| `householdMembers`                                                                                      | free (5)                                  | free                                                                                                                                                                                                     | D8                                                                                                                                                               |
| `gymTraining`                                                                                           | free                                      | free, including everything in B-36 (pause, reminders, finish later, time-fit session, history)                                                                                                           | D1–D4, D22; owner decision; Strong and Hevy give these away [S15][S17]                                                                                           |
| _(candidate, ⚖ D-11)_ "adaptive week" gym premium                                                       | —                                         | **Test only (V4), don't build yet:** auto-reschedule after a missed day, smart reminders, adaptive session length over weeks                                                                             | P09's no-brainer; would be the first premium gym feature, so it touches the gym-free decision                                                                    |
| `trainingNutrition`                                                                                     | premium                                   | **⚖ free on Today** (the deterministic bump, shown with its "why", for lift _and_ run days, never changing targets silently); premium keeps "weeks built around your training days"                      | P01 refused over exactly this; P10's €5–8 no-brainer is the premium half; CI-20, CI-06; the owner's gym-free principle arguably covers the free half; no AI cost |
| `profilePersonalisation`                                                                                | premium                                   | **⚖ free**: own kcal/protein target (**today it exists on no tier**: `resolveDailyTargets` has no manual override), goal weight, recomp                                                                  | CI-21 (Sev 4, 5/10), CI-06; free in MFP, Yazio, Lose It!, Cronometer [00 §5.3]; deterministic                                                                    |
| `pantryPlanning`                                                                                        | premium (writes too)                      | **⚖ split:** free = add/remove/use-by + "use soon" card; premium = plans that cook from the pantry                                                                                                       | CI-25 (free user can't enter her fridge); writes aren't AI                                                                                                       |
| `budgetAwarePlanning`                                                                                   | premium                                   | **⚖ split:** free = save the budget, see the week cost vs budget, over-budget flag, per-recipe cost; premium = budget-_optimised_ generation                                                             | CI-16, bug B-10 (silent non-save); J4                                                                                                                            |
| `householdPlans`                                                                                        | premium                                   | **premium**, with the **first planned week scaled free** as a taste (then "keep portions for your table")                                                                                                | The only lock that converted on its honest copy (P04-M16–M20); CI-02                                                                                             |
| `recipeImport` / `recipeImportsPerDay`                                                                  | premium, 5/day                            | premium; **⚖ opinion:** a no-AI import for links with schema.org Recipe data, free, if stage 4 confirms it can run without the model (today the JSON-LD is forwarded to the model: `extract-content.ts`) | Samsung Food imports for free [S24]; CI-02 for P05; respects the per-user-AI rule                                                                                |
| `aiMealPlans`                                                                                           | premium                                   | premium, **not the headline**, quota sized to real AI capacity (B-32)                                                                                                                                    | §5.2 (1)                                                                                                                                                         |
| `weeklyAutoGeneration`                                                                                  | premium                                   | premium, **promoted to the headline**: "Your week, ready every Monday: built around your training days, budget and fridge"                                                                               | Saves the Sunday hour (P02); can run on the curated engine                                                                                                       |
| _(new)_ batch-prep planner (B-09)                                                                       | —                                         | premium                                                                                                                                                                                                  | P02's no-brainer                                                                                                                                                 |
| `photoLogging`                                                                                          | premium, **invisible on free** (bug B-35) | premium, **shown on free as a locked card with a sample** (taste, not hidden), and **correctable** (portion, remove item, "not this", B-37)                                                              | P07's no-brainer, _if correctable_ (CI-47); vision on Groq is ~1K requests/day (`ai-providers.md`)                                                               |
| `aiMealSwaps`, `chatMessagesPerDay`, `adaptiveCoaching`, `aiShoppingList`, `aiNutritionEstimatesPerDay` | premium                                   | premium (AI), capped to capacity                                                                                                                                                                         | Owner decision; none was named as worth paying for (§5.1)                                                                                                        |

**What must stay free, always (trust and safety):** allergies, restrictions and dislikes, and **showing that they were
checked**, on every surface, AI output and chat included; explanations of numbers; account deletion, data export and
consent controls; wellness disclaimers; the gym; sending the list to a partner (it is the referral loop).

### 5.4 Paywall moments

**Principles (opinion, from CI-02, CI-12 and D15):**

1. **Lock after first value, never at first touch** of the job the user installed for. Every lock gets a free
   alternative or a taste, as the AI Chef lock already does (D15).
2. **The lock names the job** ("Keep portions for your table of 4"), not "AI meal plans… nutrition profile" (CI-12).
3. **Show what you get and what you lose** at upgrade and downgrade, with terms in plain words instead of "free for
   now" (P05, P06, P08 all worried; P08: "If it asks for a card later, I delete it").
4. **Never accept input you won't save** (bug B-10).
5. **One nudge a day at most** across sources, as on web today (`nudge-cap.ts`); port it to mobile.

| Job               | Current moment (evidence)                                                                          | Recommended moment (opinion)                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Household scaling | First plan and list "for 1 portion" (P04-M11)                                                      | Week 1 scaled free; the lock appears when week 2 is planned, naming the table                                     |
| Import            | Whole form replaced by a lock at first tap (P05-M09)                                               | Free structured-link import (if feasible) or show the review draft of a sample; lock on video, text and Cheferize |
| Pantry            | Kitchen read-only; lock on add (P08-M08)                                                           | Manual pantry free; the lock appears on "Plan my week around these"                                               |
| Training-day food | Locked card on Food Today (P01-M38)                                                                | Bump free on Today; the lock appears on "Build my week around my training days"                                   |
| Budget            | Field accepts input, silently discarded (P03)                                                      | Budget saved and flagged free; the lock appears on "Make my week fit the budget"                                  |
| AI Chef           | Locked preview with free alternatives (D15)                                                        | Keep: it is the model for the others                                                                              |
| Snap to log       | Not rendered on free at all (bug B-35, P07-M11)                                                    | A locked card with a sample estimate; the lock names the job ("log a restaurant meal from a photo")               |
| Gym-first users   | No premium surface names anything for training (P01, P09)                                          | The pitch leads with "your week of food built around your training" (B-06) for users who chose Train              |
| Post-upgrade      | "Regenerate this week" regenerates nothing (CI-07, 6/10; every persona who tapped it was confused) | Its first action does the job that triggered the upgrade (B-10)                                                   |

### 5.5 Beta mechanics while there is no payment integration

**Evidence:** every beta upgrade is free and one tap; the study shows upgrades measure curiosity, not value (CI-02).
**Opinion:** during the beta a lock costs activation and earns nothing, and it produces no pricing data except
"people tap free buttons".
**⚖ Owner decision (B-28, Next):** consider a **reverse trial**: new accounts get the _deterministic_ premium
features for 14 days (scaling, budget- and pantry-optimised curated plans, auto-week, batch-prep), with AI features
still quota-gated. After that, a "here's what you'll keep and what you'll lose" downgrade. This fits the soft paywall
(no payment needed), respects the per-user-AI rule and free-only capacity, and gives the Phase C gate the data it asks
for: premium vs free W4 retention on the same cohort. Precondition: B-12 (mobile analytics). Before any price, add a
disclosed **price-intent** step ("Premium will cost X lei a month after the beta: would you keep it?") that records
the answer and charges nothing (§8).

### 5.6 Packaging hypotheses for Phase C (to test, not decide)

- **Annual-first in lei**, anchored between gym loggers (~110–140 lei/yr in the RO store [S16][S18]) and
  AI/planning apps (~300 lei/yr [S6]). Persona anchors sit at the low end (§5.1).
- **A household plan** (one payer, the partner gets co-access once B-27 exists). P04's anchor is per household, not per person.
- **The trial before the hard ask** runs 14 days or more [S46].
- **⚠ iOS:** charging for digital features inside the iOS app generally requires Apple in-app purchase (App Review
  Guideline 3.1.1). `launch_plan.md` Phase C plans Stripe (web). Verify the EU (DMA) options with counsel before
  choosing a payment architecture. (This is my knowledge of Apple's rules, not a dossier source.)

## 6. Opportunity backlog (`B-xx`)

**RICE convention.** **Reach** = personas affected out of 10 (final; the segment note says who else it serves). **Impact** is
on the Intercom scale: 3 massive · 2 high · 1 medium · 0.5 low · 0.25 minimal. **Confidence** in %. **Effort**: S = 1,
M = 2, L = 4, XL = 8 (relative; stage 4 sizes it properly). **Score** = R × I × C ÷ E. ◆ = a **floor** item: bucketed
Now regardless of score, because the risk is safety, legal or store rejection. Buckets: **Now** (next ~8 weeks), **Next**
(the quarter after), **Later**, **Don't**, and **Stop** (remove or hide now; cheap by definition). Stage 3 writes a
`UX-xx` spec for every Now and Next item, using the same number.

### 6.1 Summary table

Final (n/10). **Δ2** / **Δ3** mark rows whose reach, score, scope or bucket changed in rev 2 / rev 3. Details are in
the [Revision log](#revision-log).

| ID                      | Title                                                                                                                                                                 | Bucket                                 | CI (and D/J)                                                   | Outcome moved              | R   | I   | C    | E   | Score |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------- | -------------------------- | --- | --- | ---- | --- | ----- |
| **B-01** ◆ Δ3           | One safety filter on every surface (incl. hidden gluten, GF tags)                                                                                                     | **Now**                                | CI-10, CI-26, CI-38 (J1)                                       | Trust                      | 4   | 3   | 90 % | L   | 2.7   |
| **B-02** ◆ Δ3           | Show the check (read-back, "checked for…", label caveats)                                                                                                             | **Now**                                | CI-19, CI-41, CI-10 (J1)                                       | Trust, activation (B)      | 4   | 2   | 70 % | M   | 2.8   |
| **B-03** Δ2 Δ3          | Onboarding by job (incl. "Track what I eat")                                                                                                                          | **Now**                                | CI-03, CI-09, CI-24, CI-20, CI-01                              | Activation                 | 8   | 2   | 80 % | M   | 6.4   |
| **B-04** Δ2 Δ3          | "Tonight" home and context-aware return (incl. after a missed day)                                                                                                    | **Now**                                | CI-04, CI-01, CI-35, CI-51                                     | Retention                  | 8   | 2   | 60 % | M   | 4.8   |
| **B-05** Δ2             | Protect the gym engine (expert control, beginner clarity)                                                                                                             | **Now**                                | CI-31, CI-30, CI-35, CI-36, CI-42, CI-32, CI-34, CI-43 (D1–D4) | Retention, trust           | 5   | 2   | 85 % | M   | 4.3   |
| **B-06** Δ3             | Food that follows training (lift _and_ run days)                                                                                                                      | **Now**                                | CI-20, CI-03, CI-29, CI-02 (J8)                                | Activation (A), conversion | 5   | 2   | 60 % | M   | 3.0   |
| **B-07** Δ3             | Plan the meals I actually cook                                                                                                                                        | **Now**                                | CI-11, CI-18 (J3)                                              | Activation                 | 5   | 3   | 80 % | L   | 3.0   |
| **B-08** Δ2 Δ3          | Week mechanics you can trust (incl. the "next week shown as this week" data bug)                                                                                      | **Now**                                | CI-13, CI-07, CI-18, CI-34                                     | Activation, trust          | 7   | 2   | 90 % | M   | 6.3   |
| **B-09**                | Batch-prep planner ("cook once, eat Mon–Thu")                                                                                                                         | Next                                   | CI-11 (D12, J3)                                                | Conversion (A)             | 2   | 2   | 50 % | M   | 1.0   |
| **B-10** Δ2 Δ3          | A paywall that names the job (Snap visible on free, a pitch for gym-first users, a visible premium payoff)                                                            | **Now**                                | CI-02, CI-12, CI-16, CI-07 (D15)                               | Conversion, trust          | 9   | 2   | 60 % | M   | 5.4   |
| **B-11** Δ2 Δ3          | Explain every number, and never change it silently                                                                                                                    | **Now** ↑ from Next (rev 3)            | CI-06, CI-05, CI-21 (J15, D2, D13)                             | Trust                      | 7   | 2   | 80 % | M   | 5.6   |
| **B-12** Δ2 Δ3          | Mobile analytics with consent, privacy by default                                                                                                                     | **Now** (enabler)                      | CI-01, CI-02, CI-04 (D24; validation needs, stage 1 §8)        | Enables every metric       | 10  | 1   | 90 % | M   | 4.5   |
| **B-13**                | Send the list (and plan) to my partner                                                                                                                                | **Now**                                | CI-17 (J7)                                                     | Referral, retention (B)    | 3   | 1   | 80 % | S   | 2.4   |
| **B-14**                | A list that doesn't create waste                                                                                                                                      | Next                                   | CI-22, CI-25, CI-05                                            | Trust, retention (B, D)    | 3   | 1   | 70 % | L   | 0.5   |
| **B-15**                | Use-it-up pantry (free entry, dates, "use soon")                                                                                                                      | Next                                   | CI-25, CI-04, CI-26 (J2)                                       | Activation (D), retention  | 2   | 3   | 50 % | L   | 0.8   |
| **B-16**                | Budget-true weeks in my money                                                                                                                                         | Next                                   | CI-16, CI-24, CI-05 (J4)                                       | Activation (A), conversion | 3   | 2   | 50 % | M   | 1.5   |
| **B-17** Δ3             | Import that respects the collector (incl. a safe primary action on unsafe imports)                                                                                    | Next                                   | CI-33, CI-02, CI-08 (D7, D25, J6)                              | Activation (C), conversion | 3   | 2   | 60 % | M   | 1.8   |
| **B-18** Δ2             | Cookbook findability and Romanian staples                                                                                                                             | Next                                   | CI-08, CI-37                                                   | Retention                  | 6   | 1   | 70 % | M   | 2.1   |
| **B-19** Δ2             | Log fast, fix mistakes (edit and undo, recents, catalogue search in grams, one save model)                                                                            | **Now** ↑ from Next (rev 2)            | CI-28, CI-48, CI-40, CI-45 (J10, J13, D17, D23)                | Retention (A, E, F), trust | 3   | 2   | 70 % | M   | 2.1   |
| **B-20** Δ2             | Your goal and your progress (goal weight, trend, weekly adherence, one body weight)                                                                                   | Next                                   | CI-29, CI-21, CI-06, CI-36, CI-53 (J11)                        | Retention                  | 4   | 1   | 70 % | M   | 1.4   |
| **B-21** Δ2 Δ3          | Bug sweep: every Sev ≥ 3 study bug not owned elsewhere                                                                                                                | **Now**                                | CI-45, CI-08, CI-25, CI-15, CI-39, CI-14, CI-37, CI-47         | Trust                      | 8   | 1   | 90 % | M   | 3.6   |
| **B-22** ◆ Δ3           | Wellness and AI guardrails (not medical)                                                                                                                              | **Now**                                | CI-44                                                          | Trust, compliance          | 2   | 2   | 80 % | S   | 3.2   |
| **B-23** Δ2             | Dark mode and large-text polish                                                                                                                                       | Next ↑ from Later (rev 2)              | CI-46, CI-43, CI-14                                            | Retention                  | 2   | 1   | 80 % | L   | 0.4   |
| **B-24**                | Romanian UI (validate, then build)                                                                                                                                    | Later (validation in Next)             | CI-24                                                          | Activation (RO)            | 4   | 1   | 30 % | XL  | 0.15  |
| **B-25** Δ2             | Store listing and first screen say what Chefer really does                                                                                                            | **Now**                                | CI-09, CI-11, CI-16, CI-25, CI-01                              | Activation, trust          | 10  | 1   | 80 % | S   | 8.0   |
| **B-26** ◆ Δ3           | Compliance pack before charging                                                                                                                                       | **Now** (gate)                         | CI-10, CI-19, CI-44, CI-54, CI-12 (D6)                         | Trust, legal               | 10  | 3   | 90 % | M   | 13.5  |
| **B-27**                | Household co-access (partner signs in to the same household)                                                                                                          | Later                                  | CI-17, CI-41                                                   | Referral, retention (B)    | 3   | 2   | 50 % | XL  | 0.4   |
| **B-28** Δ2             | Reverse trial of the deterministic premium ⚖                                                                                                                          | Next                                   | CI-02, CI-12                                                   | Conversion, activation     | 7   | 2   | 40 % | M   | 2.8   |
| **B-29**                | Race MyFitnessPal on a branded-food database or barcode                                                                                                               | **Don't** (re-examined in rev 2, kept) | CI-28                                                          | —                          |     |     |      |     |       |
| **B-30**                | Medical or diabetes-management features and claims                                                                                                                    | **Don't**                              | CI-44                                                          | —                          |     |     |      |     |       |
| **B-31** Δ2             | Calorie ring as everyone's home (kept for users who chose tracking); body-metric nags for goal-skippers                                                               | **Stop**                               | CI-01 (D20)                                                    | Activation                 |     |     |      |     |       |
| **B-32** Δ3             | "AI meal plans" as the premium headline; 4-meal AI default                                                                                                            | **Stop**                               | CI-12, CI-11                                                   | Trust, conversion          |     |     |      |     |       |
| **B-33**                | Unitemised savings and precise-looking prices                                                                                                                         | **Stop**                               | CI-05, CI-25                                                   | Trust                      |     |     |      |     |       |
| **B-34** Δ3             | Unfiltered Replace picker and "what can I make" list (filter or hide until B-01)                                                                                      | **Stop** (hotfix)                      | CI-26                                                          | Trust                      |     |     |      |     |       |
| **B-35** _new rev 2_ Δ3 | Set my own targets (kcal, protein, optional carbs/fat; recomp and performance goals)                                                                                  | **Now**                                | CI-21, CI-06 (J13, J5)                                         | Activation (A, F), trust   | 5   | 3   | 90 % | M   | 6.8   |
| **B-36** _new rev 2_    | Training that bends to a chaotic week (gym settings reachable, pause, flexible reminders, finish later / carry over, time available, visible kind mechanics, history) | **Now**                                | CI-23, CI-27, CI-49, CI-50, CI-51, CI-52 (J14, D22)            | Retention (A)              | 6   | 2   | 80 % | M   | 4.8   |
| **B-37** _new rev 2_    | Correctable snap-to-log (portion, remove item, "not this"; explained confidence; camera-denied path)                                                                  | Next                                   | CI-47, CI-02 (D21)                                             | Retention (F), conversion  | 1   | 2   | 60 % | M   | 0.6   |
| **B-38** _new rev 2_    | Apple Health / Health Connect sync ⚖                                                                                                                                  | Later                                  | CI-53                                                          | Retention                  | 2   | 1   | 60 % | XL  | 0.15  |
| **B-39** ◆ _new rev 3_  | Privacy gaps closed (explicit consent, opt-in emails, consent record, honest revoke, better export and delete)                                                        | **Now**                                | CI-54 (J16, D6, D14, D24)                                      | Trust, compliance          | 2   | 1   | 80 % | S   | 1.6   |

**Now, in build order (opinion):** B-34 and B-31 (hours) → B-01 + B-21's Sev-4 overlap → B-08's data bug (it corrupts
Plan, Shop and Today on every Sunday planner) → B-25 → B-12 → B-36's entry point to gym settings (S: it unlocks built
features) → B-35 + B-11's "no silent change" slice → B-03 → B-05 → B-19 → B-02 → B-39 → B-04 → B-36's remainder →
B-06 → B-10 → B-07 → B-11's remainder → B-13 → B-22 → B-26 (legal work runs in parallel from day one; deadline 9 Dec 2026).
**If capacity forces a cut:** cut B-13 first, then B-04's "Tonight" card (keep the "open Gym on a training evening"
landing), then B-36's time-available session builder (keep the entry point, pause, finish later and history), then
B-07's time cap, then B-11 beyond targets (keep the change notice and tappable targets). Never cut B-01, B-02, B-22,
B-26, B-39 or B-35.

### 6.2 Item cards

Each card: **Problem** (evidence) · **Outcome** · **Scope** (opinion: what is in and out) · **RICE notes** · flags and
dependencies. The file:line references are from stage 1 and were verified there.

#### Trust floor

<a id="b-01"></a>
**B-01 ◆ One safety filter on every surface** · Now · CI-10, CI-26, CI-38

- **Problem:** a tree-nut household was planned granola twice (bug B-02); "no eggs" and "pre-diabetes" as free-text
  restrictions were silent no-ops (bug B-03); "fish" didn't expand to cod or salmon (bug B-04); the AI Chef ranked
  unfiltered recipes (bug B-05, `pantry.service.ts` L188–233); the manual Replace picker is **not safety-filtered at
  all**, since `replaceRecipe` checks visibility only (bug B-46, traced in v3; CI-26 3/10); editing a recipe strips
  `dietaryTags` (bug B-01); the gluten matcher misses spelt, seitan, semolina, malt, stock/bouillon and curry powder,
  and curated recipes carry hard-coded "gluten-free" tags despite stock (bug B-47, P10). Sev 4 for P04, P05 and P10's
  segment.
- **Outcome:** trust (the floor for segments B, C and P10's segment).
- **Scope:** structured pickers for diets (incl. lacto-vegetarian, egg-free, vegan, gluten-free/coeliac), allergies
  (the EU Annex II 14 as the taxonomy [S61]) and dislike categories, with free text kept only as "other" and read back
  (B-02); category expansion for dislikes, as allergies already do; "may contain" patterns (granola, muesli, pesto,
  praline, baked goods) and hidden-gluten patterns (spelt, seitan, semolina, malt, stock, curry powder, regular oats);
  diet tags **derived** from ingredients rather than hard-coded; **one** filter function called by plan, swap, Replace,
  AI Chef tools, import/Cheferize and the shopping list; fix the recipe-form tag bug; an automated **safety regression suite** (profile × recipe matrix)
  run in CI.
- **RICE:** Reach 4/10 (P04, P05, P06, P10), but exposure is every user with a restriction. Effort L,
  because of the taxonomy migration of existing free-text data.
- **Depends on:** nothing. It unblocks B-02 and the household push.

<a id="b-02"></a>
**B-02 ◆ Show the check** · Now · CI-19, CI-41, CI-10

- **Problem:** no surface ever says what was checked; users typed words into boxes with no read-back; allergies were
  asked twice; member cards hide dislikes; Discover is filtered silently (P04: "Put a green 'Safe for Luca' badge on
  every recipe, and mean it").
- **Outcome:** trust; the activation event for households.
- **Scope:** read-back at entry ("We'll keep out: tree nuts incl. almonds, walnuts, granola…"); a per-plan statement and
  a per-recipe line "Checked for: tree nuts (Luca) · no fish (Ana)"; the same on swap rows and list lines; conflict
  badges stay; a "filtered for vegan + gluten-free" line wherever a list is filtered, so users don't have to probe it
  (P10-M33, M55); **label caveats** where the risk sits in a bought product ("check the label: certified GF stock /
  oats"; P10: "'gluten-free' is a label, not a promise"). **Wording:** "checked for", never "safe" or "allergen-free". The liability wording goes to counsel
  (B-26) and is tested with allergy parents (§8).
- **Depends on:** B-01.

<a id="b-11"></a>
**B-11 ◆ Explain every number, and never change it silently** · **Now** (↑ from Next in rev 3) · CI-06, CI-05, CI-21 (J15)

- **Problem:** targets have no visible source (the one explanation, D13, sits four screens deep in Preferences, and
  the kcal formula is shown nowhere); **targets change silently**: completing gym setup switches on the lifter g/kg
  rule, which moved P10's protein 128 → 93 g and carbs 272 → 307 g, and P06's protein 184 → 204 g (bug B-48,
  `training-nutrition.service.ts` L122–136; root cause corrected in synthesis v3); the plan says "add a snack" to a
  man told to lose weight; AI weeks miss their own target with no fix action; "−79 %" from one partial day; prices
  with no confidence cue; "Saved ~389 RON" without lines. CI-06 is now 7/10. P10's "ONE thing": "Make every number
  tappable: 'why 93 g?', 'why 2,284?', 'why is this gluten-free?'."
- **Outcome:** trust (the second half of "shows its work"), retention of data-literate users (P07, P10).
- **Scope (Now):** (1) a change notice whenever a target changes, saying what changed and why, with "keep my old
  targets"; (2) tap any target (kcal, protein, carbs, fat) → its rule and inputs, the gym "Why?" pattern (D2) on food;
  (3) when a plan misses its target, say so and offer a fix, instead of "add a snack"; (4) sanity rules (protein on
  lean or adjusted weight for high BMI, no "eat more" nudges on a loss goal); (5) price ranges labelled "rough
  estimate", and totals saying which days they cover.
- **Scope (can trail):** tap-through on every other number (progress %, plan-on-track, savings), itemised savings or
  none (B-33).
- **Why Now (rev 3, opinion):** CI-06 reached 7/10, it was the top frustration of the data-literate personas, and
  without it B-35 (own targets) can still be undermined by the next silent recalculation. ◆ because a silent change
  to a health-related target is also a trust and complaint risk.
- **Validate:** real AI prices vs shelf prices (V5). Absolute prices in the study are mock.
- **RICE:** Reach 7/10, Impact 2, Confidence 80 %, Effort M.

<a id="b-22"></a>
**B-22 ◆ Wellness and AI guardrails, not medical** · Now · CI-44

- **Problem:** "pre-diabetes" typed as a restriction changed nothing, silently; the chat system prompt invites
  "nutritional advice" with no health guardrail (`prompts.ts` L427–446); there is no "not medical advice" anywhere
  (P06-M18). Rev 3: a coeliac's safety question to the AI Chef got no AI disclaimer or "check the label" either
  (P10-M28; CI-44 now 2/10).
- **Outcome:** trust, compliance (MDR intended purpose [S63], Apple 1.4.1 [S64], Play "not a medical device" [S65]).
- **Scope:** a chat guardrail ("chef, not a doctor"; talk to your GP for medical questions; for allergy and coeliac
  questions, "AI can be wrong, check the label"), which also covers the AI Act Art. 50 label; a disclaimer on the chat
  intro, on the goal step and in the store listings; when a user types a condition, acknowledge it honestly ("Chefer
  can't adjust plans for medical conditions; here's what it can do…") instead of making a chip that does nothing.
  Low-sugar or high-fibre as a _preference_ is optional and Next. No condition-specific plans (B-30).

<a id="b-26"></a>
**B-26 ◆ Compliance pack before charging** · Now (gate for Phase C and the Dec 2026 deadlines) · CI-10, CI-19, CI-44, CI-54, CI-12

- **Problem (evidence):** the dossier's list [00 §4, §5.4]: explicit GDPR Art. 9 consent for profiling on health data
  and a DPIA; the AI Act Art. 50 chat label (applies since 2 Aug 2026); the Play "not a medical device" statement; an
  age gate at 16 (RO); a withdrawal button for web payments; transfer terms (SCCs) for Groq and Cloudflare; a
  product-liability evidence trail for allergen filtering before **9 Dec 2026** [S66]–[S70]. Plus "free for now" with
  no terms (CI-12). Rev 3 (CI-54): the legal questions behind the privacy gaps: is footer-implied Terms consent
  enough when health data is processed; must the weekly digests be opt-in; what consent record GDPR Art. 7(1)
  requires; what happens to data already sent to Groq and Cloudflare after revoke or deletion (retention under their
  DPAs).
- **Scope:** counsel review + DPIA + consent copy + the evidence trail from B-01 (logged filter decisions and the
  regression suite as documentation). D6 (the consent sheet) is the model and is already strong. The _product_ side
  of CI-54 is B-39; B-26 supplies its legal answers.
- **Note:** Reach 10/10 because it applies to everyone. The score reflects risk, not user delight.

<a id="b-39"></a>
**B-39 ◆ Privacy gaps closed** _(new in rev 3)_ · Now · CI-54 (J16; protects D6, D14, D24)

- **Problem (evidence):** against a baseline the privacy persona called the best she had seen, she found: Terms and
  Privacy consent implied by a footer line, with the Privacy link leaving the app mid-signup; weekly email digests and
  "Plan my week every Sunday" **on by default** (`schema.prisma` L118–119, L226; P07 noticed the emails too); AI
  consent stored as one nullable timestamp, so revoking erases the record and there is no consent history (L125,
  GDPR Art. 7(1)); revoke says nothing about data already sent to Groq and Cloudflare; the export is an unnamed JSON
  text blob in the share sheet that omits consent state, email preferences, AI logs and shopping lists (bug B-53);
  the delete sheet is silent on the premium state and AI-provider data (CI-54, 2/10, Sev 2).
- **Outcome:** trust and compliance; protects a positioning asset (§3.2).
- **Scope:** explicit Terms/Privacy acceptance at sign-up, with in-app viewing; email digests opt-in (⚖ D-13 for the
  Sunday auto-plan default); a consent **log** (granted/revoked with timestamps and provider list), included in the
  export; revoke and delete copy that says what happens to data already sent to the providers (answer from B-26 and
  the providers' DPAs); the export as a named file (`chefer-export-YYYY-MM-DD.json`) with the missing sections.
- **Why ◆ Now:** small (S), and the consent record is a legal duty, not a nicety. Doing it before B-12 adds analytics
  keeps the privacy story intact.
- **RICE:** Reach 2/10, Impact 1, Confidence 80 %, Effort S.

#### Beachhead activation

<a id="b-25"></a>
**B-25 Store listing and first screen say what Chefer really does** · Now · CI-09, CI-11, CI-16, CI-25, CI-01

- **Problem:** the draft listing promises plans built around "budget and the time you have to cook" and "Pantry mode
  remembers what you already have, so plans use it up" (`metadata.md`). Time and meal shape don't exist (CI-11),
  budget is locked and silently unsaved (CI-16), and the pantry can't be written on free (CI-25). A fresh install says
  "Welcome back" and the register subtitle mentions only meal planning (CI-09, 10/10).
- **Outcome:** activation (the right expectations), fewer one-star reviews from promise gaps.
- **Scope:** rewrite the listing around the positioning (§2.3), and mark premium features as premium; first screen =
  a value statement + "Create account" as the primary action; name training in the subtitle. Revisit the listing each
  time a Now or Next item ships.

<a id="b-03"></a>
**B-03 Onboarding by job** · Now · CI-03, CI-09, CI-24, CI-20, CI-01

- **Problem:** the intent step is single-choice and TRAIN skips all food setup (`household.ts` L55); no card fits
  "use up my fridge", "cook my saved recipes" or "track what I eat" (P07-M04); currency is never asked and an en-US
  phone in Romania gets USD/lb even after typing cm/kg (CI-24, bug B-43); five of ten wanted _both_ halves.
- **Outcome:** activation.
- **Scope (rev 2: adds the tracking job and units from typed values):** multi-select jobs (Train · Plan my meals ·
  Feed my household · Use what I have · Cook my saved recipes · Track what I eat)
  that decide which setups run and which home cards show; currency and units confirmed in onboarding; training
  days asked once and shared by both halves (feeds B-06); the goal step stays skippable (D18) and **skipping means no
  calorie home** (B-31), while choosing "Track what I eat" **keeps** the tracker home (D20) and asks for the user's own
  targets (B-35); units follow the values the user typed.
- **Protect:** the gym wizard (D3) and the household step (D8) as they are.

<a id="b-04"></a>
**B-04 "Tonight" home and context-aware return** · Now · CI-04, CI-01, CI-35, CI-51

- **Problem:** cold start reopens the last-used side (`mode-store.ts`); evening re-entry shows "Next meal: breakfast",
  the kcal ring, weight and "Complete your profile" (8/10). Gym Today offers the next workout minutes after finishing
  one (CI-35), and says nothing after a missed day (P09-M23).
- **Outcome:** retention (D1, D7).
- **Scope:** open Gym Today on a planned training day before the session is logged (S; the cheapest win); a
  "Tonight" card on Food Today = tonight's planned dinner → cook mode, and tomorrow's shop if a shop is due; once B-15
  ships, "use soon" items. "Done today, next session Tue" after a workout (shared with B-05). After a missed planned
  day, a kind next step ("Still time for one this week: do B on Friday?"), never "you missed" (rev 2, P09). No
  calorie ring unless the user chose tracking or a goal.
- **Validate:** real re-entry times and what users want first (diary study, §8).

<a id="b-05"></a>
**B-05 Protect the gym engine** · Now · CI-31, CI-30, CI-35, CI-36, CI-42, CI-32, CI-34, CI-43

- **Problem:** a back-off set becomes next week's weight and skipped sets ignore the lifted load (bugs B-07, B-08; P01:
  "This is exactly why I don't trust auto-progression"; P09 was sent back to 8 kg dumbbells after pressing 16s,
  CI-31 now 3/10); the lifter's split is hidden below the fold and the weekly
  goal follows the template, not the chosen days (bug B-18); stats are
  clipped and unlabelled and show "No PRs yet" after real maxes; jargon, and exercise names that can't be tapped
  (CI-32); Adjust is stepper-only (44 taps).
- **Outcome:** retention (the engine of the beachhead), trust.
- **Scope:** progression fixes (top set, or heaviest completed working set, and honour lifted loads); a split picker
  in setup plus "which split do you run?"; weekly goal = the user's days; typed Adjust;
  stats labelled with PRs; tappable exercise names → detail (D4); a glossary for "3 × 8–12", RIR, delts; the logger
  papercuts (RIR collapse, reps carry-over, set delete); exercise swap suggestions that respect equipment and fit
  above the keyboard (CI-34); untruncated exercise names in the routine editor (CI-43).
- **Rev 2 scope move:** the gym-settings entry point (CI-23) and reminders (CI-27) moved to **B-36**, which groups
  everything the time-poor lifter needs. B-05 keeps control and clarity.
- **Protect:** D1–D4 exactly; the beginner's "Why?" tone.

<a id="b-06"></a>
**B-06 Food that follows training** · Now · CI-20, CI-03, CI-29, CI-02

- **Problem:** gym onboarding data never reaches food targets (P01); the training-day bump is shown locked on Food
  Today; the plan has no training-day marker; the post-workout "~30 g protein" nudge points to a 12 g breakfast (P02);
  there is no week view with both meals and workouts. (The flat AI week is a mock artifact; the missing UI is real.)
  Rev 3: endurance isn't modelled at all; the training-day rule applies only to lifters, so a runner's 25 km long
  run gets rest-day food (CI-20, 4/10, P10); and finishing gym setup _silently_ rewrites macros (bug B-48, handled
  in B-11).
- **Outcome:** activation for segment A (the aha in §4.2), conversion (the premium "weeks built around your training").
- **Scope:** training days marked in Plan and in the week sheet; the Today target moves on training days with a "why"
  (like D2); the post-workout nudge links to a protein-appropriate meal or a snack idea; a combined week glance (meals
  - sessions) for users who chose both jobs; **run and long-run days** as training days (entered manually: carbs up on
    long-run days, protein on lift days), without any wearable integration (B-38 stays Later).
- **⚖ Owner decision:** make the deterministic bump free (§5.3). If the owner keeps it premium, it still needs a
  taste (show the number, lock the "build my week around it" action) rather than a locked card on the home screen.

<a id="b-35"></a>
**B-35 Set my own targets** _(new in rev 2)_ · Now · CI-21, CI-06 (J13, J5)

- **Problem:** targets are computed-only on **every tier**: `resolveDailyTargets` uses body metrics when present and
  has no manual override (`preferences.service.ts` L177–222); premium `updateTargets` has no target step
  (`preferences.router.ts` L101–104). P07's coach-set 2,000 kcal / 150 g became a read-only 1,669 / 146 g, and
  every screen then judged her against it (CI-21, **Sev 4**, 5/10). P01 wanted 180 g protein, P02 recomposition. The
  premium pitch promised a "personal nutrition profile" (CI-12).
- **Outcome:** activation (A and F), trust.
- **Scope:** "Use my own targets" in onboarding (when the job is Track or Train) and in Preferences: kcal + protein,
  optional carbs/fat, with the computed suggestion shown beside it and its "why" (D13); recomposition and a
  **performance** goal ("fuel my training", for P10's athlete who has no weight goal: CI-21 now 5/10) as goal
  options; plans and the ring respect the override; the weekly coach review proposes changes and never silently
  overwrites them. Goal weight and pace stay in B-20.
- **⚖ Owner decision:** free on every tier (D-2). It isn't AI, and every major tracker gives it away [00 §5.3]. If the
  owner keeps `profilePersonalisation` premium, the override must still exist on premium, because today it doesn't.
- **RICE:** Reach 5/10, Impact 3 (a Sev-4 blocker for a whole job), Confidence 90 % (verified in code), Effort M.

<a id="b-36"></a>
**B-36 Training that bends to a chaotic week** _(new in rev 2)_ · Now · CI-23, CI-27, CI-49, CI-50, CI-51, CI-52 (J14, D22)

- **Problem:** pause, reminders, weekly goal, units and equipment are **built but unreachable**: the only link to gym
  settings is the offline-sync card (CI-23, now 6/10; two of P09's four goals failed on this alone). Reminders take ten
  taps, follow fixed weekdays, and the rest-timer permission is asked cold (CI-27, 5/10, bug B-40). A cut-short workout
  can only be finished or binned, and the unstarted exercises aren't carried forward (CI-49). Sessions are ~50 min
  and nobody asks how long the user has (CI-50, P09 and P06). The kind mechanics (weekly streaks, flex weeks, neutral
  pauses, half sessions count) are invisible behind a "0-week streak" and a silent "Skip this day" (CI-51, bug B-45).
  History is one unlabelled card with off-by-one set numbers (CI-52, bug B-41).
- **Outcome:** retention for segment A. This is the lapsed-lifter archetype, probably the most common real one (opinion).
- **Scope, in order:** (1) a gear icon on Gym Today and Routine, plus a Profile row, opening gym settings (S; unlocks
  pause, reminders, weekly goal, equipment); (2) a clock-time reminder picker and a "nudge me if I've gone quiet for N
  days" option, with notification permission asked in context; (3) "Finish later" and "Move the rest to next time" on
  an interrupted workout; (4) a visible explanation of the rules ("Missing a session changes nothing", flex weeks,
  pause) and the weekly ring leading instead of "0-week streak"; "Skip this day" with feedback and undo; (5) a
  history list in Stats with correct set numbering; (6) "How long have you got?" in setup and at Start, producing a
  short version of the day (the L part; it may trail).
- **⚖ Owner decision:** all of this stays **free** under the gym-free decision, and I recommend keeping it free.
  P09 would pay for the _adaptive week_ on top of it; that is a separate question (D-11).
- **Protect:** D1–D3 and D22 exactly (the tone is the reason he'd stay: "That last line is the reason I'd stay").
- **RICE:** Reach 6/10, Impact 2, Confidence 80 %, Effort M for (1)–(5), L with (6).

#### Planning and logging core

<a id="b-07"></a>
**B-07 Plan the meals I actually cook** · Now · CI-11, CI-18

- **Problem:** Generate asks nothing and always gives 7 × 3–4 meals at a kcal target; meals-per-day exists only in
  the premium onboarding branch (`cuisine-step.tsx`); there is no nights, time cap or servings input; dinners came
  back at 27–45 min for a 15-minute cook (5/10).
- **Outcome:** activation (A, B, C, D all need it).
- **Scope:** free, in onboarding and Preferences: which meals (e.g. dinners only), which nights, time cap (≤ 15 / 30 /
  45), servings (outside household scaling for solo and couple cooks: check against the `householdPlans` gate, ⚖ if
  it collides); "keep my picks" and pinned own recipes survive regenerate. Batch lunches → B-09.
- **Note:** runs on the curated engine, so it needs no AI capacity.

<a id="b-08"></a>
**B-08 Week mechanics you can trust** · Now · CI-13, CI-07, CI-18, CI-34

- **Problem:** on a weekend, Plan and Shop default to the week that is ending. **A verified data bug (rev 3, CI-13 now
  Sev 3, 7/10):** with a plan only for next week, Plan, Shop _and_ Today all show it as "this week", so Today and Plan
  can show two different "today" menus. `findActiveWithDays` returns the newest ACTIVE plan by `createdAt` with no
  week filter (bug B-13, `meal-plan.repository.ts` L309–315), and three readers use it for "now". It hits every user
  who plans on a Sunday, which the product encourages. Regenerate hides behind a chevron; the post-upgrade "Regenerate this week" only navigates (bug
  B-09; every persona who tapped it was confused, CI-07 6/10); Regenerate wipes edits without asking (CI-18).
- **Outcome:** activation, trust.
- **Scope:** **fix the plan-for-now query first** (select by `weekStartDate`, never by `createdAt`) in Plan, Shop and
  Today, with a regression test; Friday–Sunday default to next week; list labels match the plan's dates; a visible Regenerate with a
  confirm and "keep my changes"; the post-upgrade action does the job that triggered the upgrade (with B-10); AI
  meal swap shows the proposal with Undo; Replace lands at the slot's portion, without duplicates or the meal being
  replaced, filtered to the slot (CI-34, bug B-50).
  Price labels ("rough estimate", "covers Mon–Sun") ship with B-11.
- **RICE (rev 3):** Reach 7/10, Impact 2 (a data bug now, not only a default), Confidence 90 %, Effort M.

<a id="b-10"></a>
**B-10 A paywall that names the job** · Now · CI-02, CI-12, CI-16, CI-07

- **Problem:** see §5.4. Locks at first touch, a pitch about the "nutrition profile", "free for now" with no terms,
  instant downgrade with no "you'll lose", and a free field that accepts input it won't save. Rev 2: Snap to log is
  not rendered at all on free, so the tracker never learns it exists (bug B-35, P07-M11); the pitch offered the two
  gym-first personas nothing, and both stayed free (P01, P09-M18); P07 upgraded on "personal nutrition profile" and
  found no targets; P10 upgraded out of curiosity (CI-12, 9/10).
- **Outcome:** conversion (in Phase C), trust (now).
- **Scope:** the §5.4 principles and table on mobile (the web already has source-aware dialogs,
  `SOURCE_FEATURE_PRIORITY`: port it); plain-language beta terms; upgrade/downgrade summaries; a nudge cap on mobile;
  Snap to log shown on free as a locked card with a sample; the pitch varies by the jobs chosen in B-03 (Train →
  training-day food first); never promise a perk that doesn't exist ("nutrition profile" → targets, until B-35 ships);
  rev 3: after upgrading, **show what premium changed** (what the new plan does differently, and that it meets its
  target, or why not), because P10 upgraded for "tailored" plans and saw a worse week (P10-M24, M26); AI quota
  counters must not count curated plans or unsaved imports (bug B-49).
  The ⚖ tier moves in §5.3 are separate owner decisions: B-10 ships the mechanics whichever way they go.

<a id="b-13"></a>
**B-13 Send the list (and plan) to my partner** · Now · CI-17

- **Problem:** no share or export on To buy, In my kitchen or Plan; the only `Share.share` uses are data export and gym
  CSV; today's workflows (Keep, WhatsApp) can't move in (P04: "Mihai not being able to use it — then I'm back to Keep").
- **Outcome:** referral (every share carries the Chefer name), household retention.
- **Scope:** the OS share sheet with plain-text lists grouped by aisle (WhatsApp-friendly) and a short "this week's
  dinners" text. Co-access is B-27 (Later).

<a id="b-19"></a>
**B-19 Log fast, fix mistakes** · **Now** (↑ from Next in rev 2) · CI-28, CI-48, CI-40, CI-45 (D17, D23)

- **Problem:** Quick add needs kcal and has no search, recents or "log again" (CI-28, **now Sev 4**, 3/10: P07 spent
  ~50 s and 9 taps per item typed from memory); a logged entry can't be edited and the bin deletes with no undo
  (CI-48, bug B-34); planned-meal ticks are silently lost without "Save Day" (CI-40, now Sev 3); nonsense values are
  accepted (bug B-39). The fastest path, ticking planned meals with ½×–2× chips (D23), is invisible without a plan.
- **Outcome:** retention for A, E and F; trust.
- **Scope:** edit any entry, undo on delete; recents, "log again" and copy-day; "log a planned or cookbook recipe"
  with a portion; search over Chefer's own ingredient catalogue **in grams**; "not sure: estimate for me" routed to
  Snap-to-log or chat on premium; one save model (autosave ticks); sanity checks on macros vs kcal. **Not** a
  branded-food database or barcode (B-29).
- **Why Now, against the beachhead focus:** the fixes are table stakes that also serve beachhead personas (P01's
  shake and chicken, P06's sandwich); only the MFP-depth database stays out. Effort M: tracker `update` procedure +
  mobile UI + recents query.

#### Enablers

<a id="b-12"></a>
**B-12 Mobile analytics with consent, privacy by default** · Now · CI-01, CI-02, CI-04, D24 (supports every metric)

- **Problem (evidence):** "mobile ships no analytics SDK" (`mobile_parity_backlog.md`; `docs/analytics-funnel.md`);
  gym events on mobile are `__DEV__` console no-ops. The product is mobile-first, so none of §7, the Phase C gate or
  the reverse-trial test can be measured.
- **Scope:** a PostHog RN SDK with the web's P0-6 rules (anonymous and in-memory by default, opt-in to link to the
  account); the existing typed event maps; the §7 events. **Never send health data** (allergy names, conditions,
  weights) as event properties; send counts and booleans only.
- **Rev 3 constraint (evidence → opinion):** today's _absence_ of any analytics SDK is a praised strength (D24: "no
  dark patterns so far", P10). So: no advertising identifiers and no App Tracking Transparency prompt; EU hosting (as
  on web); a visible "Usage analytics" switch in Profile, with a plain explanation; the privacy page and the App
  Privacy questionnaire updated in the same release. If the owner prefers, an **opt-in** default is acceptable: it
  costs sample size, not the funnel's shape.

<a id="b-21"></a>
**B-21 Bug sweep: Sev ≥ 3 study bugs not owned elsewhere** · Now · CI-45, CI-08, CI-25, CI-15, CI-39, CI-14, CI-37, CI-47

- **Scope:** **one local-day contract for every server-side date** (CI-45, 2/10): chat `logMeal` (bug B-06) and the
  Progress summary window (bug B-33, "0 days logged" for 2–3 h after midnight in Romania); "All" omits imports (bug
  B-11); partial pantry coverage is invisible (bug B-24); plus Sev-2 papercuts where they are cheap: Food/Gym pill state
  (bug B-14), keyboard covers primary buttons, now on Android too (CI-14), the cook-mode meal word (bug B-21), "per N
  servings" label (bug B-22), "Saved ✓" regardless of changes (bug B-38), Snap meal slot by clock and the camera-denied
  dead end (bugs B-36, B-37), internal "research §6.1" copy (bug B-42), servings "1.7 / 5" wrap and "3.1 ml cinnamon"
  units (bug B-52). Sev-4 bugs B-01–B-05 belong to B-01, gym bugs to
  B-05, week bugs (incl. the rev-3 data bug B-13 and Replace duplicates B-50) to B-08, silent target changes (bug B-48)
  to B-11, Replace safety (bug B-46) to B-34/B-01, hidden gluten (bug B-47) to B-01, unsafe-import CTA (bug B-51) to
  B-17, quota counters (bug B-49) to B-10, export and consent-record gaps (bug B-53) to B-39, tracker save models and entry edit (bugs B-23, B-34, B-39) to B-19, locale defaults (bug B-43)
  to B-03, "Skip this day" and history numbering (bugs B-40, B-41, B-45) to B-36, and Snap visibility (bug B-35) to B-10.

#### Next

<a id="b-09"></a>
**B-09 Batch-prep planner** · Next · CI-11 (D12)

- **Problem:** "This is a restaurant menu, not a meal-prep plan. I cook lunch ONCE on Sunday" (P02); Cook-once only
  turns a dinner into the next day's lunch and is hidden; hand-built prep landed at mismatched portions; the toggle
  isn't persisted (bug B-27).
- **Scope:** "same lunch Mon–Thu", scaled as one batch with one list line ("chicken bowl × 4"); surface D12 outside
  the week sheet. A premium candidate (P02's no-brainer). Confidence 50 %: one persona, but it is the archetypal
  meal-prep lifter.

<a id="b-14"></a>
**B-14 A list that doesn't create waste** · Next · CI-22, CI-25, CI-05

- **Problem:** 71–87 lines for one or two people; 0.8 lemon, 3.5 g rosemary; near-duplicates; household portions
  rounded up (`household.ts` L13–17); items you have reappear.
- **Scope:** aggregate by purchasable unit, merge synonyms, round sensibly, show "you have 1 of 4" (bug B-24's
  partner), and bias plans toward shared ingredients across the week (a curated-engine rule).

<a id="b-15"></a>
**B-15 Use-it-up pantry** · Next · CI-25, CI-04, CI-26

- **Problem:** free users can't add, edit or remove; there are no dates in the data model; cooking deducts nothing;
  "what can I make" is unsafe (fixed by B-01 and B-34).
- **Scope:** ⚖ free manual entry with a use-by of "today / this week / later"; a "use soon" card feeding B-04;
  deduction when cooking; premium = plans that cook from the pantry. The P08 exit answer is the spec.
- **Validate:** will people enter dates, and at what granularity (concierge test, §8).

<a id="b-16"></a>
**B-16 Budget-true weeks in my money** · Next · CI-16, CI-24, CI-05

- **Scope:** ⚖ free = budget saved, week cost vs budget, over-budget flag, per-recipe cost, a "cheap" filter;
  premium = budget-optimised generation. A Lidl/Carrefour "staples" mode for high-protein-on-a-budget (P01). Currency
  itself ships in B-03.
- **Artifact caveat:** real AI adherence to a budget is untested (mock).

<a id="b-17"></a>
**B-17 Import that respects the collector** · Next · CI-33, CI-02, CI-08

- **Scope:** the video review draft (D7) for every import type; the Link tab routes video URLs (bug B-17); imports
  appear in "All" (bug B-11); keep the source link; simple tags ("weeknight"); when an import can't be adapted to the
  diet, the primary action is _not_ "Save original recipe", and restrictions aren't named as ingredients (bug B-51;
  protect the fail-safe itself, D25); ⚖ opinion: a no-AI structured-link import
  as the free taste (§5.3), if stage 4 confirms it is feasible.

<a id="b-18"></a>
**B-18 Cookbook findability and Romanian staples** · Next · CI-08, CI-37

- **Scope:** correct empty states for no-match searches (bug B-12); synonyms (pasta ↔ spaghetti); filters for
  ≤ 15 min, cheap and beginner; **Romanian staples in the curated pool** (cabbage, pork, _telemea_, _ciorbă_; missing
  today: P08, "the two things every Romanian kitchen has"); cook-mode steps with quantities and doneness cues.

<a id="b-20"></a>
**B-20 Your goal and your progress** · Next · CI-29, CI-21, CI-06, CI-36, CI-53

- **Rev 2 scope change:** own kcal/protein targets moved to **B-35** (Now). B-20 keeps the rest.
- **Scope:** ⚖ free goal weight and pace (`ChefProfile` has no target weight: `schema.prisma` L205–234); a weight
  trend and goal line on Progress; weekly adherence (days in range, weekly average: P07-M34); no percentage from a
  partial day; workouts on Progress (a combined week); **one body weight** shared by Food Progress, Gym Stats and the
  profile (CI-53, S slice).

<a id="b-28"></a>
**B-28 Reverse trial of the deterministic premium** · Next · ⚖ · CI-02, CI-12

- See §5.5. Needs B-12 so the cohorts can be compared. Changes paywall mechanics, so it is the owner's call.

<a id="b-37"></a>
**B-37 Correctable snap-to-log** _(new in rev 2)_ · Next · CI-47, CI-02 (D21)

- **Problem:** the ~3 s estimate with a stated portion is praised (D21), but the card offers only Log or Discard: no
  portion, no macro edit, no item list, no "not this, it's salmon"; "CONFIDENT" is unexplained; camera-denied is a
  dead end (CI-47). Combined with CI-48, a scan can't be fixed at all. (The wrong dish is mock; the missing correction
  path is real.)
- **Scope:** portion slider (smaller / as shown / bigger), remove or add an item, "not this" with a one-line
  correction, then a re-estimate within quota; explained confidence; a photo thumbnail on the entry; a Settings link
  and a Photos fallback when the camera is denied.
- **Why Next, not Now (opinion):** it serves the tracker segment we don't target (1/10), and it spends vision
  capacity (Groq ~1K requests/day, `ai-providers.md`). But it is the one AI feature any persona said she'd pay for,
  so it is the premium AI feature to invest in first, ahead of AI meal plans (B-32).
- **Validate:** real-AI accuracy on 20 weighed restaurant plates; which corrections users reach for (stage 1 §8).

<a id="b-23"></a>
**B-23 Dark mode and large-text polish** · **Next** (↑ from Later in rev 2) · CI-46, CI-43, CI-14

- **Evidence:** no dark mode support at all (`app.config.js` "automatic" while the content is hard-coded light); now
  confirmed on Android too (P07: every Snap flips light → dark system sheet → light). Both personas are
  premium-inclined and polish-sensitive (P02, P07). XXL holds up except dense rows. In Romania, 80 % of mobile web
  traffic is Android [S45].
- **Why Next and not Later (opinion):** a theme-token pass costs less before more screens ship (B-35, B-36, B-19
  all add UI). Still below the Now items: nobody quit over it.

#### Later

<a id="b-24"></a>
**B-24 Romanian UI** · Later (validation in Next) · CI-24

- **Evidence:** no global competitor in the sample has a Romanian UI [S4]–[S21]; Chefer has none; the study tested
  English only, and the Romanian personas were comfortable in English (synthetic, so weak evidence).
- **Scope:** Next = a cheap test (a Play store-listing experiment RO vs EN; §8). Build only if it moves installs or
  activation. Meanwhile keep new copy in string tables so it stays localisation-ready.

<a id="b-27"></a>
**B-27 Household co-access** · Later · CI-17, CI-41

- The partner signs in to the same household, plan and list. Unlocks a household plan (§5.6). XL: identity, sharing
  and permissions across the API.

<a id="b-38"></a>
**B-38 Apple Health / Health Connect sync** _(new in rev 2)_ · Later · ⚖ · CI-53

- **Evidence:** no HealthKit or Health Connect code; body weight lives in three places (CI-53, P09 and P06). P09
  asked for Apple Health. Wearables and health sync are _out of scope_ in `gym_plan.md` (the owner's decision).
- **Scope:** the "one body weight" part is cheap and moves into **B-20** (Next). Health sync (weight in and out,
  workouts out) stays Later and needs the owner to reopen the gym plan's scope. Note that it also adds health-data
  processing to the DPIA (B-26).

#### Don't

<a id="b-29"></a>
**B-29 Don't race MyFitnessPal on a branded-food database or barcode** · CI-28. **Re-examined in rev 2** after CI-28
became Sev 4 (P07): kept. The data moat belongs to MFP and Cal AI [S3], and in Romania to Eat & Track's store DB [S35];
P07 already pays MacroFactor and said she'd switch only for correctable restaurant snaps (B-37). Answer the job with
B-19 (edit, recents, catalogue search in grams). Revisit only if V2 shows beachhead users abandoning over logging.

<a id="b-30"></a>
**B-30 Don't build medical or diabetes-management features, or make such claims** · CI-44. Intended purpose decides
medical-device status [S63]. "Suitable for pre-diabetes" is exactly the claim P06 asked for and exactly the one we
can't make without a regulatory path. Serve the segment through B-22 + B-20 + B-11. **Owner may revisit** only with
counsel and a clinical partner.

#### Stop doing (now)

<a id="b-31"></a>
**B-31 Stop: calorie ring as everyone's home; body-metric nags for goal-skippers** · CI-01 (8/10). Hide the ring and
"Complete your profile" unless the user chose tracking or a goal. The counter-case confirms the rule: for the tracker
(P07) the ring _is_ the right home (D20), so the fix is "home by job", not "remove the ring"; drop "log it so your nutrition stays honest" for
household cooks. P05: "I didn't ask to be counted."

<a id="b-32"></a>
**B-32 Stop: "AI meal plans tailored to you" as the premium headline; the 4-meal AI default** · CI-12, CI-11. It is
the top perk in the pitch every persona saw, nobody wanted it (§5.1), the one persona who upgraded for it found the
AI week 400–700 kcal under target with nothing explaining what improved (P10-M26; the content is mock, the flow gap
is real), and free-only AI can't serve it at scale (§5.2).
Lead with the job the user was blocked on (B-10) and "your week, ready every Monday" (§5.3).

<a id="b-33"></a>
**B-33 Stop: unitemised savings and precise-looking prices** · CI-05, CI-25. "Saved ~389,80 RON" on a 2,908 RON list,
with no lines behind it, made P08 disbelieve every number. Show savings per line or not at all; show prices as rough
ranges (B-08 slice).

<a id="b-34"></a>
**B-34 Stop (hotfix): the unfiltered "what can I make" list and Replace picker** · CI-26 (3/10). Rev 3 traced the
Replace picker: it has **no** safety filter (`replaceRecipe` checks visibility only; bug B-46), which retroactively
explains P04's fish and P05's egg dishes. Until B-01 lands, run both through the existing `filterSafeRecipes`, or hide
unsafe entries. A verified Sev-4 exposure with a small fix: ship it first.

## 7. Success metrics & instrumentation

**Evidence about today's measurement:** the web fires the PW-2/PW-3 funnel and gym events to PostHog EU, anonymous
unless the user opts in (`docs/analytics-funnel.md`, `business_flow.md` §26). **The mobile app sends nothing** (its gym
analytics module is a `__DEV__` no-op; confirmed in synthesis v3 §7: no analytics dependency in `apps/mobile`).
The privacy persona praised exactly that absence (D24), which is why B-12 must stay anonymous by default. Baselines
for every mobile metric below are therefore unknown. The first two
weeks after B-12 ships set them, and targets marked "Δ" are relative to that baseline.

### 7.1 North-star metric

> **Weekly Plan-Doers (WPD):** accounts that, in a local calendar week, **act on their Chefer plan at least twice**:
> finish a workout from their routine, cook (cook mode finished) or log a planned meal, or tick ≥ 5 items on the list.

Why this one (opinion): it counts value delivered, not opens. It rewards both halves of the product without forcing
either, so a gym-only user and a household cook both count. It matches the weekly rhythm (§4.3) and the no-shame
stance (no daily requirement). It also leads revenue: Phase C's gate is W4 retention. **Companion ratio:** the share of
WPD who act on **both** sides (the beachhead thesis in one number).

### 7.2 Funnel metrics

| Stage              | Metric                                                                                                                                                                                                            | Primary B-items        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Discover → account | store page → install (store consoles); first screen → account created                                                                                                                                             | B-25                   |
| Onboarding         | completion rate; jobs chosen (distribution, multi-select share); drop-off step                                                                                                                                    | B-03                   |
| First value        | time to first plan or first workout; % reaching first value in session 1                                                                                                                                          | B-03, B-07             |
| Activation         | per-segment activation (§4.2) within its window                                                                                                                                                                   | B-06, B-02, B-07       |
| Return             | D1, W1 (days 7–13), W4 by segment and tier; evening opens landing on the right side                                                                                                                               | B-04, B-05             |
| Habit              | WPD; both-sides share; weekly goal met (gym)                                                                                                                                                                      | all                    |
| Monetisation       | share of active free users meeting an upgrade touchpoint weekly (the Phase C gate is ≥ 25 %); prompt → click → complete **by source and job**; premium first use within 24 h of upgrade; downgrade within 14 days | B-10, B-28             |
| Trust guardrails   | safety conflicts shown and reported; unrecognised-restriction rate; `suggestion_overridden` rate; crash-free sessions                                                                                             | B-01, B-02, B-05, B-21 |

### 7.3 PostHog events to add

All mobile events go through B-12 (consent rules as on web). **No health data in properties:** no allergy names,
conditions, weights or food text. Use counts, booleans and enums. Existing web event names are reused on mobile so the
dashboards merge.

| Event (new unless noted)                                                           | Properties                                                                                   | Fired when                                                                            | For              |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------- |
| `app_opened`                                                                       | `landing: food_today\|gym_today\|other`, `localHourBucket`, `trainingDayPlanned`, `fromPush` | Cold or warm start                                                                    | B-04             |
| `home_card_tapped`                                                                 | `card: tonight_dinner\|tonight_workout\|use_soon\|shop_due\|…`                               | A home card is tapped                                                                 | B-04             |
| `onboarding_step_completed`                                                        | `step`, `skipped`                                                                            | Each step                                                                             | B-03             |
| `onboarding_completed`                                                             | `jobs[]`, `householdSize`, `hasRestrictions`, `currency`                                     | Wizard finished                                                                       | B-03             |
| `onboarding_intent` (existing on web)                                              | `intent` → extend to `jobs[]`                                                                | Step 0 answered                                                                       | B-03             |
| `safety_readback_viewed`                                                           | `itemsCount`, `unrecognisedCount`                                                            | Read-back shown at entry                                                              | B-01, B-02       |
| `safety_checks_viewed`                                                             | `surface: plan\|recipe\|swap\|list`                                                          | "Checked for…" expanded or seen                                                       | B-02             |
| `safety_conflict_shown`                                                            | `surface`, `kind: allergy\|diet\|dislike`                                                    | A conflict badge renders                                                              | B-01             |
| `safety_issue_reported`                                                            | `surface`                                                                                    | User reports "this shouldn't be here"                                                 | B-01             |
| `plan_configured`                                                                  | `slots[]`, `nights`, `timeCap`, `servings`                                                   | Plan preferences saved                                                                | B-07             |
| `plan_generated` (existing on web)                                                 | add `slotsCount`, `keptPicks`, `trainingDaysMarked`                                          | Generate or regenerate                                                                | B-07, B-06, B-08 |
| `plan_viewed`                                                                      | `weekOffset`, `trainingDaysMarked`                                                           | Plan screen opened                                                                    | B-06, B-08       |
| `regenerate_confirmed`                                                             | `keptPicksCount`                                                                             | Regenerate confirmed                                                                  | B-08             |
| `list_shared`                                                                      | `channel: share_sheet`, `linesCount`                                                         | Share completed                                                                       | B-13             |
| `workout_finished` (existing on web)                                               | as web                                                                                       | Finish                                                                                | B-05, WPD        |
| `suggestion_overridden` (existing on web)                                          | as web                                                                                       | Next-time target changed                                                              | B-05             |
| `split_chosen`                                                                     | `template`, `wasDefault`                                                                     | Gym setup program chosen                                                              | B-05             |
| `training_target_viewed`                                                           | `tier`                                                                                       | Training-day target or its "why" seen on Today                                        | B-06             |
| `number_why_opened`                                                                | `metric: kcal\|protein\|price\|savings\|progress`                                            | A "why" sheet opened                                                                  | B-11             |
| `cook_finished`                                                                    | `fromPlan`                                                                                   | Cook mode completed                                                                   | WPD              |
| `meal_logged`                                                                      | `via: plan\|quick_add\|recent\|scan\|chat`, `planned`                                        | A log is saved                                                                        | WPD, B-19        |
| `upgrade_prompt_shown` / `upgrade_clicked` / `upgrade_completed` (existing on web) | add `job` alongside `source`                                                                 | Paywall surfaces                                                                      | B-10             |
| `premium_feature_first_used`                                                       | `feature` (a `PlanFeatureKey`)                                                               | First use after upgrade                                                               | B-10, B-28       |
| `downgrade_completed` (existing on web)                                            | add `daysSinceUpgrade`                                                                       | Downgrade                                                                             | B-10             |
| `trial_started` / `trial_ended`                                                    | `kept: boolean`                                                                              | Reverse-trial lifecycle                                                               | B-28             |
| `price_intent_answered`                                                            | `answer: keep\|drop\|unsure`, `pricePoint`                                                   | Disclosed price-intent step                                                           | B-28, §8         |
| `targets_set` _(rev 2)_                                                            | `source: onboarding\|preferences`, `mode: own\|computed`, `hasMacros`                        | Targets saved (never the values)                                                      | B-35             |
| `food_entry_edited` / `food_entry_delete_undone` _(rev 2)_                         | `via`                                                                                        | An entry is edited / a delete is undone                                               | B-19             |
| `gym_settings_opened` _(rev 2)_                                                    | `from: gear\|profile\|outbox`                                                                | Gym settings opened                                                                   | B-36             |
| `training_paused` (existing on web) / `reminder_set` _(rev 2)_                     | `weeks` / `mode: time\|quiet_days`                                                           | Pause confirmed / reminder saved                                                      | B-36             |
| `workout_saved_for_later` / `workout_rest_carried` _(rev 2)_                       | `unstartedCount`                                                                             | Interrupted workout kept or carried forward                                           | B-36             |
| `session_time_chosen` _(rev 2)_                                                    | `minutes`, `where: setup\|start`                                                             | "How long have you got?" answered                                                     | B-36             |
| `snap_estimate_corrected` _(rev 2)_                                                | `kind: portion\|item\|not_this`                                                              | A scan estimate is adjusted before logging                                            | B-37             |
| `target_change_notice_viewed` _(rev 3)_                                            | `reason: gym_setup\|metrics\|goal\|coach`, `kept: boolean`                                   | A target-change notice is shown and answered                                          | B-11             |
| `plan_shown` _(rev 3, diagnostic)_                                                 | `surface: plan\|shop\|today`, `weekMatches: boolean`                                         | A plan is rendered for "this week" (catches the B-13 data bug class in production)    | B-08             |
| `consent_changed` _(rev 3)_                                                        | `kind: terms\|ai\|analytics\|email`, `granted: boolean`                                      | Any consent is granted or revoked (the event only; the record itself lives in the DB) | B-39, B-12       |
| `data_exported` _(rev 3)_                                                          | —                                                                                            | Export completed                                                                      | B-39             |

### 7.4 Targets for each Now item

The targets are **hypotheses** to be tuned after the first two weeks of mobile data. Where the baseline is unknown,
the target is relative (Δ) or absolute on the engineering side.

| Item | Target                                                                                                                                                                                                                                 | How measured                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| B-01 | **0** failures in the safety regression suite (every profile × every curated recipe, incl. "may contain" and category dislikes) · 0 unsafe items on any AI Chef or Replace list · unrecognised free-text restrictions < 5 % of entries | CI suite; `safety_readback_viewed.unrecognisedCount` |
| B-02 | In the §8 allergy test, ≥ 8 of 10 parents say they would **not** re-check every recipe · `safety_checks_viewed` in ≥ 50 % of household sessions                                                                                        | Moderated test; event                                |
| B-03 | Onboarding completion ≥ 80 % · ≥ 70 % of users who pick Train + a food job finish both setups                                                                                                                                          | Events                                               |
| B-04 | Evening opens (17:00–22:00) on a planned training day land on Gym ≥ 90 % · a return after a missed planned day shows a next step 100 % of the time · "Tonight" card tap-through ≥ 25 % of evening opens · W1 Δ +15 % relative          | `app_opened`, `home_card_tapped`                     |
| B-05 | `suggestion_overridden` on < 15 % of exercise summaries · 0 "Next time" targets below the heaviest completed working set without a stated reason · ≥ 20 % of experienced users choose a non-default split                              | Events; unit tests                                   |
| B-06 | ≥ 70 % of both-sides users see a plan with training days marked in week 1 · segment-A activation (§4.2) Δ +20 % relative · W4 of both-sides users > W4 of gym-only                                                                     | Events                                               |
| B-07 | ≥ 40 % of plans use a non-default configuration · regenerate within 10 min of generate Δ −30 %                                                                                                                                         | `plan_configured`, `plan_generated`                  |
| B-08 | 0 week/label mismatches and **0 "next week shown as this week"** renders (automated + `plan_shown.weekMatches`) · the post-upgrade action completes its job for 100 % of taps                                                          | Tests; events                                        |
| B-11 | 0 target changes without a notice (tests) · `number_why_opened` in ≥ 20 % of weekly active food users · in V2, ≥ 80 % can say where their protein target comes from                                                                    | Tests; events; V2                                    |
| B-39 | Consent log complete for 100 % of consent changes and present in the export · digests opt-in · a privacy/legal reviewer signs off the sign-up consent                                                                                  | Tests; review                                        |
| B-10 | ≥ 25 % of active free users meet a touchpoint weekly (the launch-plan gate) · premium first use within 24 h ≥ 60 % of upgrades · downgrade within 14 days < 20 %                                                                       | Funnel                                               |
| B-12 | Events flowing from ≥ 95 % of mobile sessions (anonymous) · 0 health-data properties (a schema check in CI) · 0 tracking prompts or advertising identifiers                                                                            | PostHog; lint rule; review                           |
| B-13 | ≥ 20 % of household or two-person users share a list in week 1                                                                                                                                                                         | `list_shared`                                        |
| B-19 | Median time to log a repeat food ≤ 10 s (recents); ≥ 10 % of entries edited rather than deleted and re-typed; 0 lost ticks (autosave)                                                                                                  | Events; tests                                        |
| B-35 | ≥ 60 % of users who chose Track or Train with a known target set their own; 0 screens showing a target other than the user's override                                                                                                  | `targets_set`; tests                                 |
| B-36 | ≥ 30 % of gym users open gym settings in the first 14 days (from ~0 today); ≥ 50 % of interrupted workouts are saved for later or carried forward rather than discarded; time-poor activation (§4.2) Δ +20 % relative                  | Events                                               |
| B-21 | Every Sev ≥ 3 study bug closed with a regression test · crash-free sessions ≥ 99.5 %                                                                                                                                                   | Sentry, tests                                        |
| B-22 | Chat labelled as AI and carrying the wellness line on 100 % of first messages · 0 medical claims in listings                                                                                                                           | Review checklist                                     |
| B-25 | Every listing claim maps to a working flow on the stated tier · the "Welcome back" first screen is gone                                                                                                                                | Review checklist                                     |
| B-26 | DPIA signed off; consent, age gate, Art. 50 label and Play declaration live **before 9 Dec 2026** and before any price                                                                                                                 | Counsel checklist                                    |

## 8. Validation plan and risks

### 8.1 What to test with real users

The study was synthetic, so every Now item ships as a hypothesis. These tests turn the load-bearing ones into
evidence. The sample sizes are for qualitative signal unless stated otherwise.

| #             | Question                                                                                                                                                                                      | Method                                                                                                                                                                                                                                                                  | Sample                                                                                                                                                                                | Informs                     | When / gate                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| V1            | Do restricted eaters trust the check, and do they enter restrictions correctly? Which wording ("checked for…" vs a badge per recipe vs a per-plan statement) reassures without over-claiming? | Moderated usability on a build with B-01 + B-02; a concept test of the wording variants; a dietitian's review of the allergen taxonomy and "may contain" list                                                                                                           | 10 parents of children with food allergies (≥ 5 tree nut or peanut), 6 vegetarians/vegans, 5 coeliacs (rev 3: include "label caveat" wording for stock and oats, per P10); RO + UK/DE | B-01, B-02, B-26            | **Gate for the household acquisition push** and for any public safety copy |
| V2            | Does the beachhead activate, and does food follow training for them?                                                                                                                          | 5-day diary + telemetry after B-03, B-05, B-06, B-35, B-36                                                                                                                                                                                                              | 12–15 Romanians who lift 2–5×/wk and cook for themselves: ≥ 10 on Android, a beginner/experienced mix, 3–4 couples, **≥ 4 time-poor (parents, shift workers)**                        | B-03–B-07, B-35, B-36, §4.2 | Before marketing spend                                                     |
| V3            | What do people look for on evening re-entry, and do reminders help?                                                                                                                           | 2-week diary with notifications on                                                                                                                                                                                                                                      | 12 across segments A and B                                                                                                                                                            | B-04                        | After B-04                                                                 |
| V4            | Willingness to pay, and what for                                                                                                                                                              | Van Westendorp + Gabor-Granger survey in lei and GBP with a feature-bundle choice (MaxDiff over the §5.3 premium candidates, **including the "adaptive week" gym premium and correctable snap-to-log**, rev 2); then the in-app disclosed price-intent step during B-28 | Survey n ≈ 200 RO (lifters + household cooks), n ≈ 100 UK; in-app ≥ 300 trial completers per arm (directional)                                                                        | §5, B-10, B-28              | Before Phase C                                                             |
| V5            | Are real AI price estimates close enough, and does a range label keep trust?                                                                                                                  | Desk check: 20 staples × 3 markets vs shelf prices (Carrefour/Lidl RO, Tesco UK, Kroger US) with **real** AI; a 5-second test of label variants                                                                                                                         | 20 × 3 items; n ≈ 30 for the label test                                                                                                                                               | B-11, B-16, B-33            | Before any "cost in lei" marketing                                         |
| V6            | Will waste-averse cooks enter use-by dates, and at what granularity?                                                                                                                          | Concierge / Wizard-of-Oz: they send their fridge, we reply "use soon" over WhatsApp for 2 weeks                                                                                                                                                                         | 8 P08-type cooks                                                                                                                                                                      | B-15                        | Before building B-15                                                       |
| V7            | Do experienced lifters trust the fixed progression over weeks?                                                                                                                                | Longitudinal use of the build with B-05                                                                                                                                                                                                                                 | 5–8 lifters, 3–4 weeks                                                                                                                                                                | B-05                        | After B-05                                                                 |
| V8            | Does a Romanian UI move installs or activation?                                                                                                                                               | Play Console store-listing experiment RO vs EN copy; 5 interviews with RO users aged 45+                                                                                                                                                                                | Until significance (~2–4 weeks); 5 interviews                                                                                                                                         | B-24                        | In Next                                                                    |
| V10 _(rev 2)_ | How often are real snap estimates wrong, and which corrections do people reach for?                                                                                                           | 20 weighed restaurant plates vs real-AI estimates; a moderated test of the correction step                                                                                                                                                                              | 20 plates; 6 eat-out trackers                                                                                                                                                         | B-37                        | Before B-37 ships                                                          |
| V11 _(rev 2)_ | Do time-poor lifters prefer "finish later", "carry the rest over" or "short version at Start"?                                                                                                | Prototype test + 3-week diary                                                                                                                                                                                                                                           | 8 parents or shift workers who lift                                                                                                                                                   | B-36                        | Before building step (6) of B-36                                           |
| V9            | Accessibility on hardware                                                                                                                                                                     | VoiceOver/TalkBack and Dynamic Type beyond XXL; check the "?" glyph on devices                                                                                                                                                                                          | 3–5 users; 2 devices                                                                                                                                                                  | B-21, B-23                  | Before store launch                                                        |

Also: fold P07, P09 and P10 into this document (Appendix B). They are synthetic too and do not replace V1–V9.

### 8.2 Risks

| Risk                                                | Evidence                                                                                                                                                                                                                                                                                                  | Likelihood / impact (opinion) | Mitigation                                                                                                                                                                                | Items                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Allergen miss harms a user; product liability**   | Granola planned to a tree-nut family on the free tier (CI-10); the EU product-liability directive covers software and AI from 9 Dec 2026, no-fault [S70]                                                                                                                                                  | Medium / severe               | One filter + regression suite; "checked for" wording, never "safe"; decision logs as the evidence trail; counsel review; hotfix now                                                       | B-01, B-02, B-34, B-26 |
| **Medical claims** (device status, store rejection) | P06 asked for "suitable for pre-diabetes"; the chat invites "nutritional advice" with no guardrail (CI-44); the intended purpose decides MDR status [S63]; Apple 1.4.1, Play health declaration [S64][S65]                                                                                                | Medium / high                 | Wellness framing; disclaimers; no condition plans; listing review                                                                                                                         | B-22, B-30, B-25       |
| **GDPR Art. 9 and AI data transfers**               | Weight, allergies and goals are health data, read broadly (_Lindenapotheke_) [S66]; profiling on health data needs explicit consent in RO (Law 190/2018), and the digital consent age is 16 [S67]; AI goes to Groq (US) and Cloudflare                                                                    | High / high                   | Explicit separate consent, DPIA, SCCs/DPA with both providers (EU endpoint claim unverified [S71]), age gate; **no health data in analytics**; a consent record and opt-in emails (CI-54) | B-26, B-39, B-12       |
| **AI Act Art. 50**                                  | Chat must be disclosed as AI (since 2 Aug 2026); marking of generated content (grace to 2 Dec 2026) [S68]                                                                                                                                                                                                 | High / medium                 | Label the chat; counsel on whether generated recipe text or images need marking                                                                                                           | B-22, B-26             |
| **App-store policy**                                | 5.1.2(i) AI consent already built (D6); listing accuracy (the draft over-promises pantry, time and budget); "beta" wording removed on the store-readiness branch (`mobile_native_plan.md` M4-3) but seen in this study as "free for now"; IAP for digital purchases on iOS (3.1.1, unverified for the EU) | Medium / high                 | B-25 before submission; payment architecture decided with counsel                                                                                                                         | B-25, B-10, D-9        |
| **Free-only AI cannot carry the premium promise**   | ~8 + 4 AI plans a day org-wide; a Cloudflare plan takes ~7 min (`docs/ai-providers.md`)                                                                                                                                                                                                                   | High / high at launch         | Deterministic premium (§5.3), AI capped, headline changed                                                                                                                                 | B-32, D-1              |
| **Dark-pattern and consumer-law exposure**          | Noom's $62M settlement [S14]; the EU withdrawal button since 19 Jun 2026 [S69]; instant downgrade with no summary (CI-12)                                                                                                                                                                                 | Low now / high at Phase C     | Plain terms, summaries, no fake urgency, withdrawal flow                                                                                                                                  | B-10, B-26             |
| **Synthetic-research bias**                         | All findings come from LLM personas; mock AI                                                                                                                                                                                                                                                              | Certain / medium              | V1–V9; the counts treated as indicative                                                                                                                                                   | §8.1                   |
| **Breadth dilutes the product**                     | Ten modules; the dossier rates "breadth itself" a high risk [00 §5.3]                                                                                                                                                                                                                                     | Medium / high                 | Beachhead focus; Stop items; retention features kept out of the pitch                                                                                                                     | B-31–B-34              |
| **Competitive squeeze on the thesis**               | MacroFactor's nutrition + workouts bundle [S5]; MFP adding plans [S2]                                                                                                                                                                                                                                     | Medium / medium               | Free gym + plans + list + Romanian context; ship B-06 fast                                                                                                                                | B-06, B-24             |
| **Price-data staleness**                            | RO inflation 6.3–9.5 % in 2026 [S51]; AI estimates are converted from EUR (CI-05)                                                                                                                                                                                                                         | High / medium                 | Range labels; refresh cadence; V5                                                                                                                                                         | B-11, B-33             |

---

## 9. Decisions for the owner

Each item is a recommendation that touches a standing decision or needs the owner's call. Nothing here has been
assumed in the backlog's scope beyond the "⚖" flag.

| #                  | Decision                                        | Recommendation (opinion)                                                                                                                                                                                                                                 | Standing decision touched                                          | Items                        |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| **D-1**            | What premium is, given free-only AI capacity    | Re-anchor premium on deterministic planning power (auto-week, budget-, pantry-, batch- and training-optimised curated plans, household scaling); keep AI features premium but capped and not headlined. Alternative: fund paid AI before launch          | AI free-only on Groq/Cloudflare; per-user AI premium-only (kept)   | B-32, §5.3                   |
| **D-2**            | Move non-AI activation features off the paywall | Free: the training-day bump on Today, own kcal/protein targets (B-35; today they exist on no tier) + goal weight, manual pantry with dates, a saved budget with an over-budget flag. Premium: the _optimised generation_ around each                     | Soft-paywall line; gym-free (the bump is arguably covered already) | B-35, B-06, B-15, B-16, B-20 |
| **D-3**            | Beachhead and audience sequencing               | Training cooks (RO) first; households second, gated on V1; collectors, zero-waste and health as retention features, not acquisition, for two quarters; listing aligned                                                                                   | Audience = solo cooks, households, gym-goers (kept, sequenced)     | §2, B-25                     |
| **D-4**            | Reverse trial in the beta                       | Yes, 14 days of the deterministic premium, AI still quota-gated, once B-12 exists                                                                                                                                                                        | Soft paywall                                                       | B-28                         |
| **D-5**            | Safety posture                                  | Structured input (migrating existing free text), "checked for", never "safe", counsel-approved wording, a regression suite as part of release                                                                                                            | —                                                                  | B-01, B-02, B-26             |
| **D-6**            | Free no-AI import for structured recipe links   | Yes, if stage 4 confirms it needs no model call                                                                                                                                                                                                          | Per-user AI premium-only (respected)                               | B-17                         |
| **D-7**            | A taste of household scaling                    | First planned week scaled free, then the lock names the table                                                                                                                                                                                            | Soft paywall                                                       | B-10                         |
| **D-8**            | Romanian UI                                     | Test first (V8); build only on signal                                                                                                                                                                                                                    | Romania home market                                                | B-24                         |
| **D-9**            | Payment architecture for Phase C                | Decide IAP vs web checkout with counsel (EU/DMA) before building; annual-first, lei, a household plan to test                                                                                                                                            | No payment integration yet                                         | §5.6                         |
| **D-10**           | Medical segment                                 | Stay wellness-only; revisit only with counsel and a clinical partner                                                                                                                                                                                     | —                                                                  | B-22, B-30                   |
| **D-11** _(rev 2)_ | Will the gym ever carry a premium?              | Keep every current and B-36 gym feature free. Test an "adaptive week" premium (auto-reschedule after a miss, smart reminders, adaptive length) in V4 before deciding. The only change to `plan-features.ts` would be a new key; `gymTraining` stays free | All gym features free                                              | B-36, §5.1                   |
| **D-12** _(rev 2)_ | Health sync                                     | Keep it out of scope for now (your `gym_plan.md` decision); ship one shared body weight instead                                                                                                                                                          | Wearables and health sync out of scope                             | B-38, B-20                   |
| **D-13** _(rev 3)_ | Email digests and the Sunday auto-plan default  | Digests **opt-in** (legal review in B-26); ask about "Plan my week every Sunday" once, in onboarding, instead of defaulting it on. Trade-off: fewer Monday plans, more trust                                                                             | —                                                                  | B-39, B-26                   |

---

## Appendix A — CI → B coverage map

Every stage-1 insight (CI-01 to CI-54, final) maps to at least one backlog item (the **primary** owner first). Rev 2
added CI-47 to CI-53 and re-homed CI-21, CI-23 and CI-27; rev 3 adds CI-54 and moves CI-06's primary owner to B-11
(now Now).

| CI    | B-items                          | CI    | B-items                    | CI    | B-items              |
| ----- | -------------------------------- | ----- | -------------------------- | ----- | -------------------- |
| CI-01 | **B-31**, B-03, B-04             | CI-19 | **B-02**, B-26             | CI-37 | **B-18**, B-21       |
| CI-02 | **B-10**, B-28, B-06, B-17, B-37 | CI-20 | **B-06**, B-03             | CI-38 | **B-01**             |
| CI-03 | **B-03**, B-06                   | CI-21 | **B-35**, B-20, B-11       | CI-39 | **B-21**             |
| CI-04 | **B-04**, B-15                   | CI-22 | **B-14**                   | CI-40 | **B-19**             |
| CI-05 | **B-11**, B-33, B-08, B-14, B-16 | CI-23 | **B-36**                   | CI-41 | **B-02**, B-27       |
| CI-06 | **B-11**, B-35, B-20             | CI-24 | **B-03**, B-16, B-24       | CI-42 | **B-05**             |
| CI-07 | **B-08**, B-10                   | CI-25 | **B-15**, B-14, B-33, B-21 | CI-43 | **B-05**, B-23, B-21 |
| CI-08 | **B-18**, B-17, B-21             | CI-26 | **B-34**, B-01, B-15       | CI-44 | **B-22**, B-30, B-26 |
| CI-09 | **B-25**, B-03                   | CI-27 | **B-36**                   | CI-45 | **B-21**, B-19       |
| CI-10 | **B-01**, B-02, B-26             | CI-28 | **B-19**, B-29             | CI-46 | **B-23**             |
| CI-11 | **B-07**, B-09, B-32             | CI-29 | **B-20**, B-06             | CI-47 | **B-37**, B-21       |
| CI-12 | **B-10**, B-32, B-28, B-26       | CI-30 | **B-05**                   | CI-48 | **B-19**             |
| CI-13 | **B-08**                         | CI-31 | **B-05**                   | CI-49 | **B-36**             |
| CI-14 | **B-21**, B-23                   | CI-32 | **B-05**                   | CI-50 | **B-36**             |
| CI-15 | **B-21**                         | CI-33 | **B-17**                   | CI-51 | **B-36**, B-04       |
| CI-16 | **B-16**, B-10                   | CI-34 | **B-05**, B-08             | CI-52 | **B-36**             |
| CI-17 | **B-13**, B-27                   | CI-35 | **B-05**, B-04             | CI-53 | **B-20**, B-38       |
| CI-18 | **B-08**, B-07                   | CI-36 | **B-05**, B-20             | CI-54 | **B-39**, B-26       |

**Delights protected** (stage 1 §4) and the items that must not regress them: D1–D4 → B-05, B-36; D6 → B-26; D7 → B-17;
D8 → B-03, B-02; D9 → B-14; D10 → B-18; D11 → B-07, B-08; D12 → B-09; D13 → B-11, B-35; D15 → B-10; D17 → B-19;
D18 → B-03, B-31; D20 → B-03, B-31; D21 → B-37; D22 → B-36, B-04; D23 → B-19; D24 → B-12, B-39; D25 → B-17.

## Appendix B — Status and future evidence

This document is **final** against the final synthesis (v3, n/10). If real-user evidence arrives (§8, V1–V11) or the
synthesis is amended: (1) update reach, RICE and the §1 reasons; (2) new problems get **new** IDs from **B-40** upward,
and existing IDs keep their numbers even when the bucket changes; (3) re-check the beachhead explicitly and say so if
it changes; (4) add a revision to the log below. Real-user data replaces synthetic counts; it doesn't average with them.

## Sources added in this document

Everything else is cited from [`00-market-research.md`](./00-market-research.md) as `[Sx]` (accessed 2026-09-26).

- [N1] Mota M. et al., "Prevalence of diabetes mellitus and prediabetes in the adult Romanian population: PREDATORR
  study", _Journal of Diabetes_ (2016); fieldwork 2012–2014, n = 2,728, prediabetes 16.5 % (95 % CI 14.8–18.2) ⏳ —
  https://onlinelibrary.wiley.com/doi/abs/10.1111/1753-0407.12297 (accessed 2026-09-27)
- Repo sources (read-only, `master` @ `f8f7f74`): `packages/types/src/plan-features.ts`; `docs/ai-providers.md`
  ("Free-only mode", "Capacity per day"); `docs/analytics-funnel.md`; `business_flow.md` §9, §17, §18, §26;
  `launch_plan.md` §3 (Phase C gate); `mobile_parity_backlog.md` (mobile has no analytics);
  `docs/app-store/ios-drafts-2026-09-26/metadata.md` (listing copy); `apps/api/src/lib/recipe-import/extract-content.ts`.

---

## Revision log

For stages 3 (UX) and 4 (tech): update the specs and tasks of every item listed here. IDs never change.

### Consolidated for the UX designer: everything added, re-bucketed or scope-changed since rev 1

| ID       | What changed since rev 1                                                                                                                                   | Final bucket |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **B-35** | **New** (rev 2): set my own targets; rev 3 adds a performance ("fuel my training") goal                                                                    | Now          |
| **B-36** | **New** (rev 2): training that bends to a chaotic week (took CI-23 and CI-27 from B-05)                                                                    | Now          |
| **B-37** | **New** (rev 2): correctable snap-to-log                                                                                                                   | Next         |
| **B-38** | **New** (rev 2): Apple Health / Health Connect sync ⚖                                                                                                      | Later        |
| **B-39** | **New** (rev 3): privacy gaps closed (consent, opt-in emails, consent log, revoke/delete copy, export)                                                     | Now          |
| **B-11** | Re-bucketed Next → **Now** (rev 3); rescoped to "explain every number, never change it silently" (change notice, tappable targets, plan-misses-target fix) | Now          |
| **B-19** | Re-bucketed Next → **Now** (rev 2); rescoped to "log fast, fix mistakes" (edit/undo, recents, gram search, one save model)                                 | Now          |
| **B-23** | Re-bucketed Later → **Next** (rev 2)                                                                                                                       | Next         |
| B-01     | Scope (rev 3): hidden-gluten patterns, derived diet tags, Replace picker in the single filter                                                              | Now          |
| B-02     | Scope (rev 3): "filtered for…" lines, label caveats ("check certified GF stock/oats")                                                                      | Now          |
| B-03     | Scope (rev 2): "Track what I eat" job; units follow typed values                                                                                           | Now          |
| B-04     | Scope (rev 2): kind next step after a missed planned day                                                                                                   | Now          |
| B-05     | Scope (rev 2): lost gym settings and reminders to B-36; gained editor truncation (CI-43)                                                                   | Now          |
| B-06     | Scope (rev 3): run and long-run days as training days; no silent macro rewrite (with B-11)                                                                 | Now          |
| B-08     | Scope (rev 3): the "next week shown as this week" data bug on Plan, Shop and Today; Replace duplicates and slot filter; price labels moved to B-11         | Now          |
| B-10     | Scope (rev 2, 3): Snap visible on free; pitch by job incl. gym-first; show what premium changed after upgrading; quota counters                            | Now          |
| B-12     | Scope (rev 3): privacy by default, with no tracking prompt or advertising identifiers and a visible switch                                                 | Now          |
| B-17     | Scope (rev 3): a safe primary action on unsafe imports (protect D25)                                                                                       | Next         |
| B-20     | Scope (rev 2): lost own targets to B-35; gained weekly adherence, trend, one body weight                                                                   | Next         |
| B-21     | Scope (rev 2, 3): one local-day date contract; more small bugs (B-33, B-36–B-38, B-42, B-52)                                                               | Now          |
| B-22     | Scope (rev 3): AI disclaimers on allergy/coeliac questions ("check the label")                                                                             | Now          |
| B-26     | Scope (rev 3): legal answers behind CI-54                                                                                                                  | Now          |
| B-31     | Scope (rev 2): the ring stays home for users who chose tracking                                                                                            | Stop         |
| B-32     | Evidence added (rev 3): the AI week under-delivered for the one persona who upgraded for it                                                                | Stop         |
| B-34     | Evidence added (rev 3): Replace picker verified unfiltered; ship first                                                                                     | Stop         |

### Rev 3 — 2026-09-27, final synthesis v3 (n/10: P10 Lena added)

**Added**
| ID | Title | Bucket | From |
|---|---|---|---|
| B-39 ◆ | Privacy gaps closed | **Now** | CI-54 (new); product side of the gaps, with the legal side in B-26 |

**Re-bucketed**
| ID | Was → now | Why |
|---|---|---|
| B-11 | Next → **Now**, retitled "Explain every number, and never change it silently" | CI-06 7/10 with a corrected root cause (silent change after gym setup, bug B-48); P10's "ONE thing"; protects B-35 |

**Scope changed (same bucket):** B-01 (hidden gluten, derived tags, Replace picker, bugs B-46/B-47) · B-02 (filtered-for
lines, label caveats) · B-06 (endurance and long-run days) · B-08 (the CI-13 data bug, Sev 3; Replace duplicates, bug
B-50; effort S → M) · B-10 (visible premium payoff; quota counters, bug B-49) · B-12 (privacy-by-default constraints,
D24) · B-17 (unsafe-import CTA, bug B-51) · B-21 (bug B-52; routing table for bugs B-46–B-53) · B-22 (AI disclaimers on
diet questions) · B-26 (CI-54 legal questions) · B-32, B-34 (evidence) · B-35 (performance goal).

**Re-scored** (reach rebased to n/10): B-01 2.7 · B-02 2.8 · B-03 6.4 · B-04 4.8 · B-06 3.0 · B-07 3.0 · B-08 6.3 ·
B-10 5.4 · B-11 5.6 · B-12 4.5 · B-17 1.8 · B-21 3.6 · B-22 3.2 · B-25 8.0 · B-26 13.5 · B-35 6.8 · B-36 4.8.

**Other sections:** the header marked final; §1 rewritten with final numbers (SUS 56.5, tomorrow 4.6, NPS −90, goals
43 %) and the synthesis's three reasons; privacy added as a protected asset and to the positioning (§2.3, §3.2);
segment A widened to endurance athletes; §4 adds J15 and J16; §5 adds P10's willingness to pay; §7 adds four events
and targets for B-08, B-11, B-39; §8 V1 wording and the GDPR risk row; §9 adds D-13 (email and auto-plan defaults);
Appendix A adds CI-54, D24, D25; Appendix B is now a status note (next new ID: B-40).

### Rev 2 — 2026-09-27, synthesis v2 (n/9: P07 Ioana, P09 Chris added)

**Added**
| ID | Title | Bucket | From |
|---|---|---|---|
| B-35 | Set my own targets | **Now** | CI-21 (now Sev 4, 4/9); scope split out of B-20 |
| B-36 | Training that bends to a chaotic week | **Now** | CI-23 (5/9), CI-27, CI-49, CI-50, CI-51, CI-52; CI-23 and CI-27 moved from B-05 |
| B-37 | Correctable snap-to-log | Next | CI-47 |
| B-38 | Apple Health / Health Connect sync ⚖ | Later | CI-53 |

**Re-bucketed**
| ID | Was → now | Why |
|---|---|---|
| B-19 | Next → **Now**, retitled "Log fast, fix mistakes" | CI-28 Sev 4, CI-48 (no edit / undo), CI-40 Sev 3; table stakes for the beachhead too |
| B-23 | Later → **Next** | CI-46 on both OSes (P07); cheaper before B-35/B-36/B-19 add screens |

**Scope changed (same bucket)**
| ID | Change |
|---|---|
| B-03 | Adds a "Track what I eat" job (keeps the tracker home, asks for own targets); units follow the typed values (bug B-43) |
| B-04 | Adds a kind next step after a missed planned day (P09-M23) |
| B-05 | Loses CI-23 and CI-27 to B-36; gains CI-43 (editor truncation) and P09's incomplete-set evidence (CI-31 3/9) |
| B-10 | Snap to log shown on free as a locked taste (bug B-35); the pitch varies by job (gym-first users); no promise of non-existent perks |
| B-20 | Own targets moved to B-35; adds weekly adherence, weight trend and one shared body weight (CI-53) |
| B-21 | One local-day contract for all server dates (Progress UTC, bug B-33); adds bugs B-36, B-37, B-38, B-42 |
| B-29 | Re-examined after CI-28 went to Sev 4: **kept as Don't** |
| B-31 | Exception: the ring stays home for users who chose tracking (D20) |

**Re-scored only** (reach rebased to n/9, bucket unchanged): B-03 5.6 · B-04 4.2 · B-05 4.3 · B-10 4.8 · B-11 2.4 ·
B-12 4.1 · B-18 2.1 · B-21 3.2 · B-25 7.2 · B-26 12.2 · B-28 2.8.

**Other sections:** §1 exec summary refreshed (reason 2 now covers trackers; Now table; decision 3 adds the gym
premium question). §2 segments A and F rewritten with evidence and a precision-tracking re-examination. §4 JTBD adds J13
and J14 and time-poor and tracker activation definitions. §5 adds P07 and P09 willingness to pay, a `photoLogging` row,
and the "adaptive week" candidate. §7 adds eight events and targets for B-19, B-35, B-36. §8 adds V10 and V11 and
widens V2 and V4. §9 adds D-11 (gym premium) and D-12 (health sync).

### Rev 1 — 2026-09-27, synthesis v1 (n/7)

Initial backlog B-01 to B-34.

### Rev 4 — 2026-09-27, owner feedback 2026-09-27 (first real-user evidence)

Appended after rev 1 so no earlier section is edited. The full evaluation (21 atomic items O-01…O-21, conflicts,
wave placement and validation) is in [`05-owner-feedback-po.md`](./05-owner-feedback-po.md). §6.1, §9 and the
consolidated UX table above are **not** updated in place. Read them together with this entry until the next full revision
folds it in.

**Added**
| ID | Title | Bucket | RICE (R/I/C/E → score) | From |
|---|---|---|---|---|
| B-40 | A recipe form you can finish (mobile parity: name + 1 ingredient required, `*` and a reason on the disabled Create, cuisine and unit pickers, ingredient search, auto-macros, no fiber input) | **Now** | 2+O / 2 / 90 % / M → 1.8 | O-13, O-14, O-16, O-17, O-19, O-21; CI-02 (P05-M11), CI-15 |
| B-41 | Curated generic-ingredient catalogue (licensed source, admin-verified, EU-14 allergen and diet tags per ingredient, canonical units, private custom rows on mobile) | Next (enabler) | 5 / 1 / 60 % / L → 0.75 | O-20; builds on the existing `IngredientPrice` catalogue |
| B-42 | Cardio as a first-class exercise type (`trackingType`, a ~30-entry cardio catalogue, time/distance/RPE rows, a deterministic progression) | Next (Now slice inside B-05; optional minimal W2 slice, D-20) | 2+O / 2 / 80 % / L → 0.8 | O-01, O-03, O-04 (`06-cardio-research.md`); CI-20 |
| B-43 | A governed exercise library (authoring by admins or a trainer role, `Request an exercise`, gap-filling; existing customs kept) ⚖ | Next (only after B-42's catalogue) | 5 / 1 / 60 % / M → 1.5 | O-08 (the owner's updated decision) |
| B-44 | Correct a past workout (edit, swap, remove; delete with confirmation and Undo; recompute with a B-11 notice) | **Now** (cut-able) | 3+O / 1 / 80 % / M → 1.2 | O-12; CI-52, CI-31 |

**Scope changed (same bucket):** **B-05**: grouped kg and reps steppers, delete any set (swipe + Undo), no kg or "Aim for 1 s"
nonsense on timed or custom exercises (O-02, O-05, O-06); confidence 85 → 90 %, score 4.3 → 4.5 · **B-36**: a Resume
card with time in, exercises done/left and the current exercise (O-09); Gym Today `Recent` 3–5 workouts with same-day
grouping, times and `Show more` (O-10, O-11); confidence 80 → 90 %, score 4.8 → 5.4 · **B-21**: the recipe photo
upload failure and `[object Object]` (O-18), and tiny set values in `ValueStepper` (O-07), via a W0-D hotfix PR ·
**B-01, B-06, B-11, B-19**: hooks that activate once B-41 or B-42 land (no change to their Now scope) · **B-29**:
boundary clarified and **kept as Don't**. A curated generic-ingredient catalogue with private user rows (B-41) is not
the MyFitnessPal race; brands, barcodes and public user entries remain Don't.

**Standing decision updated (owner):** library exercise authoring moves from every user to admins or a trainer role
(B-43). `gym_plan.md` D5 (routine, session and target editing at every level) is unchanged, and all gym features stay
free (a role is not a tier).

**New owner decisions** (listed in 05 §5, continuing §9): **D-14** who authors exercises (admin / trainer / moderator)
· **D-15** the fate of existing custom exercises (recommend: keep, never delete, offer to map) · **D-16** ingredient data
source and licence (recommend USDA FDC + CIQUAL, counsel to confirm; no Open Food Facts) · **D-17** cardio calories
(recommend a range on the summary only) · **D-18** fiber (remove from input and display, keep the data) · **D-19**
minimum recipe fields (name + 1 ingredient) · **D-20** cardio timing (recommend a minimal slice in W2) · **D-21**
editing past workouts (any session, with a change notice).

**Waves:** a new **W0-D** hotfix PR before W1 is cut · W1 L-GYM (T-05.7, T-36.3, T-36.5 amended) and L-SAFE (B-40 slice 1
with T-01.6) · W2 L-GYM (B-44, optional B-42 minimal) and a new W2 lane **L-RECIPE** (B-40 slice 2) · a new **W5 "Data
foundations"** (W5-0 contracts, L-INGR for B-41, L-GYMDATA for B-42 and B-43) · W4's native batch gains image resizing.

**Process note:** the web recipe form's ingredient search, units, cuisine presets and auto-macros never reached mobile,
and `mobile_parity_backlog.md` has no row for them. Add the row now (B-40 slice 2 drains it). Next new ID: **B-45**.

**Addendum (same day, O-22…O-26; see 05 §1.2b–§1.2c):** **B-05** scope += an animated chip collapse and a readable
placeholder on the swap sheet (O-22, T-05.8), a lighter routine-editor card with the full name (O-23, T-05.3), and an
exercise-image audit (O-26, new T-05.11). The file scan found all 138 photos present and valid, so the fault lies in
fit, crop, content or the 8 photo-less exercises. **B-43**: Hyperextension and Incline Barbell Bench Press
(O-24, O-25; both confirmed missing from the 77-entry catalogue) are pulled forward into W1 L-GYM as new T-05.10. New
decision **D-22**: keep free-exercise-db photos and fix fit, versus commissioning art for flagged and photo-less
exercises.
