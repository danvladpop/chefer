# Premium feature ideas — top 5 candidates

> **Author:** 2026-08-23, product research session. Inputs: competitor research (sources at
> the bottom), the PW-1 feature matrix ("premium = it knows you"), and what the codebase
> already has to build on. These are candidates for the post-launch roadmap — nothing here
> is committed. Phase C (Stripe) stays gated on funnel metrics regardless.

## The filter applied

Every idea had to pass four tests:

1. **The knows-me rule** (launch plan §2): does it get better because the app knows you?
   If not, it's a free feature or not worth building.
2. **Would someone pay?** There must be a competitor or adjacent product where people
   demonstrably pay for this exact job — not a hypothetical.
3. **Retention, not just conversion.** Phase C gates on premium W4 retention beating free.
   A feature that converts but doesn't build a habit fails the gate.
4. **Buildable on what exists.** Gemini (text + vision), the tracker, ratings/pins,
   check-off data, the budget engine, weekly auto-generation. No native app, no
   partnerships required.

**The strongest market signal found:** MacroFactor charges $72/year with _no free tier_
and holds 4.8★ by doing one thing — adapting to the user every week ("an app that thinks
for you"). People pay most for software that closes a loop on their behalf. Chefer is
unusually well positioned for this because it already owns both sides of the loop: what
you _planned_ and what you _ate_.

---

## 1. The Adaptive Chef — weekly check-in that steers your plan 🏆

**Gist:** Every Sunday, the chef reviews your week (logged meals vs plan, weight trend if
you log it), tells you what actually happened in plain language, adjusts your calorie/macro
targets, and bakes the adjustment into the next auto-generated week. Plateau? It reacts.
Overshot three dinners? Next week compensates. You never re-do onboarding math again.

- **The user & pain:** anyone with a goal. Static targets are wrong within weeks —
  metabolism, adherence and life drift. Every other app makes the user notice the plateau
  and re-configure; that's the moment they churn instead.
- **Why premium:** it is the purest possible "knows me" feature — it literally re-learns
  you weekly. Free keeps static targets.
- **Why they'd pay:** MacroFactor ($11.99/mo or $71.99/yr, no free tier, 4.8★) proves
  adaptive weekly coaching alone carries a subscription. Noom charges multiples of that
  for human-flavoured versions of the same loop. Chefer's twist nobody else has: the
  adjustment doesn't just change a number on a dashboard — **it changes what's on your
  plate next week**, automatically, through the existing PW-5 Sunday generation.
- **How it works:** new weight quick-log (one number, dashboard card). Sunday worker
  computes: adherence % (tracker vs plan), calorie balance, weight trend (EWMA like
  MacroFactor). Gemini writes a 5-line "Chef's Review" (warm, specific: "you logged 5 of
  7 dinners, breakfast adherence is your weak spot — I've made next week's breakfasts
  faster"); targets shift ±100–200 kcal within safe bounds; next week's generation uses
  the new targets. Review lands as the Monday banner (extends "your week is ready").
- **Already in the codebase:** tracker daily logs + totals, `resolveDailyTargets` (single
  source, just fixed), the WeeklyPlanWorker Sunday tick, plan/eaten comparison data, the
  Monday banner surface. New: a `WeightLog` table, the trend math (well-documented
  algorithms), the review prompt.
- **Effort:** M. **Risks:** needs users to log ≥4 days/week to be credible — degrade
  gracefully to "log 2 more days and I can start coaching you" (which is itself an
  engagement loop). Health-adjacent copy must stay non-medical.
- **Metric to watch:** W4 retention of users who received ≥2 reviews vs those who didn't.
  This is the feature most directly aimed at the Phase C retention gate.

## 2. Feed the Whole Table — household profiles

**Gist:** Add your partner and kids. Each gets their own allergies, dislikes and portion
size. Chefer generates **one dinner everyone can eat** — safety constraints merged as hard
rules, preferences balanced across the week ("Maria's pick on Tuesday") — and one shopping
list scaled to real portions per person.

- **The user & pain:** the household cook — the actual buyer persona for meal planning.
  "One's vegetarian, one's gluten-free, the kids want plain pasta" is the named, unsolved
  problem; nearly every planner (Chefer included) models exactly one eater.
- **Why premium:** "it knows _us_" — the knows-me rule extended to the people you cook
  for. Single-profile stays free; the moment a second mouth enters, that's the upgrade.
- **Why they'd pay:** an entire cohort of 2025–26 apps exists _only_ to solve this
  (Forks in Common, SummitPlate, Ollie); Eat This Much and PlateJoy market family plans
  as their paid tier. Family cooks also churn less — the plan is load-bearing
  infrastructure for four people, not an experiment for one.
- **How it works:** `HouseholdMember` rows (name, safety prefs, dislikes, portion factor,
  optional kid flag). Generation: union of allergies/restrictions as hard constraints
  (reuses the P1-2 safety filter exactly as-is), disliked-ingredient balancing in the
  prompt, servings = sum of portion factors. Recipe pages and cook mode show per-person
  portions; the shopping list scales automatically. Ratings can be tagged per member
  ("the kids loved it") and feed P1-1 learning.
- **Already in the codebase:** the safety filter takes a prefs object (works unchanged on
  a merged one), the servings scaler, cost-per-week (family cost visibility is a bonus
  selling point), ratings/pins.
- **Effort:** M–L (schema + generation prompt + a household settings page). Ship v1 as
  "everyone eats the same dinner, scaled" — per-member meal _variants_ are a later phase.
- **Metric:** % of premium users adding ≥1 member; their W4 retention vs solo users.

## 3. Zero-Waste Kitchen — pantry-aware plans & leftovers

**Gist:** Chefer knows what's already in your kitchen — because when you check items off
the shopping list, _it knows what you bought_. Next week's plan uses up what you have,
"cook once, eat twice" turns Tuesday's dinner into Wednesday's lunch on purpose, and the
shopping list subtracts your pantry. The € you save is shown next to the € you spend.

- **The user & pain:** everyone who has thrown away a wilted bag of spinach. Households
  waste meaningful money on food; standalone pantry apps (KitchenPal, PantryWise, Your
  Food) exist because planners ignore the kitchen's current state — but standalone
  trackers die of manual data entry.
- **Why premium:** "it knows my kitchen." And it compounds the existing premium money
  story: budget caps what you spend, pantry-awareness cuts what you waste.
- **Why they'd pay:** it's the only feature on this list with a direct, countable euro
  return — "Chefer saved you ~€11 this week (6 items you already had, 2 use-it-ups)" is a
  subscription that visibly pays for itself. That counter is the upsell copy.
- **How it works — the trick is zero data entry:** checking off "Onions 600 g" on the
  synced list (P1-5) seeds the pantry automatically. Generated recipes deplete it
  (estimates are fine — this is planning, not accounting). A 60-second weekly confirm
  ("still have these?") replaces manual inventory. Generation prompt gets "prioritise:
  spinach (expiring), rice 400 g, feta"; the derived list subtracts pantry quantities;
  a leftovers toggle plans deliberate double-batches into named slots. Chat gets a
  natural entry too: "what can I make with what I have?"
- **Already in the codebase:** the check-off flow (the data source!), ingredient
  price/quantity vocabulary, the budget prompt constraint pattern (P2-4) to copy for
  "use these first", custom-items overlay, the estimated-cost engine for the savings
  counter.
- **Effort:** L — the depletion model wants careful fudge-factors (always-have staples
  like salt/oil must not pollute it). Ship v1 as leftovers-toggle + "use these up" chips
  the user taps, before full auto-depletion.
- **Metric:** shopping-list € total trend for pantry users; feature usage vs retention.

## 4. Snap-to-Log — photo logging + self-healing week

**Gist:** Ate off-plan? Photograph it. Gemini vision estimates the meal and macros, you
confirm with one tap, it lands in the tracker — and the rest of the week quietly
rebalances so your weekly target survives the burger. The plan bends instead of breaking.

- **The user & pain:** tracking dies the first time life doesn't match the plan. Chefer's
  tracker is currently plan-only — there is literally no way to log a restaurant meal.
  That's not just a premium gap, it's the biggest hole in the data the Adaptive Chef
  (idea 1) needs.
- **Why premium:** the _logging_ fills a free-tier gap (a manual "quick add kcal" should
  arguably be free), but AI photo estimation + automatic week rebalancing is pure
  personalised intelligence — premium.
- **Why they'd pay:** photo logging is the flagship of MyFitnessPal Premium ($79.99/yr)
  and the entire product of Cal AI and friends. Chefer has a structural accuracy
  advantage: competitors need photos for _every_ meal (and benchmark at ~71% id accuracy,
  ±18% portions); Chefer only needs them for _exceptions_, because planned meals carry
  exact known macros. Smaller problem, better result, and the rebalance ("I moved
  Thursday to a lighter dinner") is something no photo-calorie app does.
- **How it works:** camera/upload button in tracker + chat ("I ate this"). Gemini vision
  returns dish guess + macro estimate + confidence; user confirms/edits (always editable
  — trust). Off-plan entries append to the DailyLog like cook-mode's "Made it!" does.
  Rebalancer: if the week-to-date balance drifts past a threshold, swap 1–2 upcoming
  meals for lighter/heavier pool options and say so on the meal-plan banner.
- **Already in the codebase:** DailyLog append path (cook mode uses it), Gemini client
  (add a vision call), the swap machinery for rebalancing, the AI-quota middleware for
  metering scans.
- **Effort:** M. **Risks:** estimation credibility — show ranges, never fake precision;
  meter scans/day via the PW-1 matrix like other AI quotas.
- **Metric:** logging-streak length for users with snap access vs without (feeds idea 1's
  adherence requirement directly).

## 5. Cheferize Anything — import a recipe, make it yours

**Gist:** Paste a link (or photo of a cookbook page / grandma's card) and Chefer imports
the recipe — then _adapts_ it: peanut-free, portioned to your macros, scaled to your
servings, priced like everything else. One more tap pins it into next week's plan or
swaps it in tonight.

- **The user & pain:** meal inspiration lives on TikTok, Instagram and food blogs, not
  inside any planner. Today that recipe either never enters Chefer or breaks your
  targets/allergies when it does. This is the bridge from "saw it" to "it's on my plan,
  safely".
- **Why premium:** raw import is commoditised (Samsung Food does it free) — the paid
  layer everywhere is _personalisation_: Samsung Food+ charges ($29.99/yr) exactly for
  "customise recipes to your diet & goals". Adapting to YOUR allergies, macros and
  household is the knows-me part; it's also the feature that makes ideas 1–3 stronger
  (your real taste flows into the learning loop instead of only pool recipes).
- **Why they'd pay:** it converts the app from "the chef's recipes" to "MY cookbook,
  supervised by a chef" — ownership is a powerful retention hook, and every imported
  recipe is data the user won't want to abandon (the classic switching cost, earned
  honestly).
- **How it works:** URL → fetch + Gemini extraction (ingredients/steps/nutrition
  estimate); photo → same via vision. Show original vs Cheferized side by side with the
  changes explained ("swapped peanuts → sunflower butter; 2→4 servings; est. 610 kcal").
  Saved into My Recipes (`source: MANUAL` already exists), rateable, **pinnable** — so
  P1-1 places it into generated weeks. Safety check runs the existing allergen matcher
  and warns loudly rather than silently trusting extraction.
- **Already in the codebase:** My Recipes + Create Recipe page (manual entry exists —
  import is an autofill for it), the pin-to-next-plan mechanic, the allergen synonym
  matcher (P1-2), nutrition estimation via the ingredient macro vocabulary as a
  cross-check on Gemini's guess.
- **Effort:** M. **Risks:** extraction quality on messy blogs (mitigate: editable
  preview before save); copyright — store for personal use, keep the source link, don't
  republish to other users.
- **Metric:** imports/user/week; retention of users with ≥3 imported recipes.

---

## How they fit together

These aren't five islands — they're one story: **Chefer runs your food life, not a menu.**

- Snap-to-Log (4) feeds the adherence data the Adaptive Chef (1) coaches on.
- Cheferized recipes (5) and household ratings (2) feed the P1-1 learning that generation
  already uses.
- Pantry (3) and the existing budget engine make the money story: _spend less, waste
  less, and see it in euros._

Suggested order: **1 → 4 → 5 → 2 → 3.** Start with the Adaptive Chef because it targets
the Phase C retention gate directly and is buildable mostly from existing data; Snap-to-Log
next because the coach is only as good as the logs; pantry last because its v1 scope needs
the most care.

Pricing anchors from the research: MyFitnessPal Premium $79.99/yr, MacroFactor $71.99/yr,
PlateJoy $99/yr, Samsung Food+ $29.99/yr, Mealime Pro ~$36/yr. A Chefer premium carrying
even three of these pillars sits comfortably at **€4.99–7.99/month** — above Samsung
Food/Mealime (it does far more) and deliberately under the MFP/MacroFactor anchor while
the brand is young.

## Honourable mentions (evaluated, cut)

- **Grocery delivery hand-off** — the dormant Carrefour/grocery-ai infra could power it,
  but it's partnership/ops-heavy and the money story is covered by 3. Revisit post-launch.
- **Apple Health / wearable sync** — strong for idea 1's energy model, but needs native
  packaging; not while Chefer is web-only.
- **Voice-controlled cook mode** ("next step", hands covered in dough) — delightful, small,
  but a UX polish rather than a subscription reason; do it as a premium garnish someday.
- **Micronutrient tracking** — differentiates poorly; the audience that cares already
  uses a dedicated tracker.

## Sources

- [MacroFactor — adaptive coaching, pricing, positioning](https://macrofactor.com/macrofactor/) · [review](https://fitnesstoolsreviewed.com/app-reviews/macrofactor-review-is-this-nutrition-app-worth-it/) · [worth-it analysis](https://nutriscan.app/blog/posts/is-macrofactor-worth-it-2026-529e4f7d46)
- [MyFitnessPal Meal Scan accuracy benchmark (71.2%, ±18% portions)](https://ai-food-tracker.com/reviews/myfitnesspal/) · [Meal Scan announcement](https://blog.myfitnesspal.com/meal-scan/)
- [PlateJoy vs Mealime vs eMeals — pricing & paid features](https://finvsfin.com/platejoy-vs-mealime-vs-emeals/) · [best meal-planning apps 2025](https://www.digitaltrends.com/phones/best-meal-planning-apps/)
- [Family multi-diet planners: SummitPlate](https://www.summitplate.com/best-meal-planning-app-for-families) · [Ollie AI on family apps](https://www.ollie.ai/2025/10/09/the-best-meal-planning-apps-for-busy-families-in-2025/) · [Eat This Much family planning](https://www.eatthismuch.com/family-meal-planning-app) · [Forks in Common](https://apps.apple.com/app/id6752518389)
- [Pantry/waste apps: KitchenPal](https://kitchenpalapp.com/en/) · [PantryWise](https://pantrywiseapp.com/pantry-inventory-app) · [best food inventory apps](https://sously.app/blog/best-food-inventory-apps/)
- [Samsung Food — free import, paid personalisation ($29.99/yr)](https://samsungfood.com/) · [social-recipe import apps](https://www.foodieprep.ai/blog/best-apps-for-saving-recipes-from-social-media)
- [Why meal planners get abandoned (Reddit synthesis)](https://home.organizeat.com/blog/meal-planner-app-reddit/)
- [Willingness to pay for AI features](https://www.cimigo.com/en/trends/unlocking-consumers-willingness-to-pay-for-ai/)
