# Production follow-ups — issues found while testing on prod

> **Status:** open. Found during live production testing (browser automation against
> https://chefer.duckdns.org). Each entry is self-contained enough to start from cold.
> Add new findings here as prod testing continues; strike through when fixed.

---

## ~~1. `/meal-plan` sticks on the loading fallback (hydration error)~~

**FIXED 2026-08-22** (commit `0a82b30`, verified on prod after deploy). Root cause: pages under
a route-level `loading.tsx` hydrate **lazily**, so by hydration time the already-hydrated
dashboard shell had resolved shared react-query data (`user.me`) and the page's hydration render
(free-tier banner + grid) mismatched the SSR pending-spinner HTML → React #418, route stuck on
the Suspense fallback. The tier flip was incidental — any resolved query wins the race. Fix:
`useHasMounted()` gates the query-driven UI on `/meal-plan` and `/recipes/[id]` so the hydration
render is byte-identical to the SSR output. Prod verification: `funnel-test@chefer.dev`, repeated
hard reloads + upgrade→downgrade→revisit — grid renders every time, zero console errors.
**Rule for future pages:** a client page placed under a `loading.tsx` must not read react-query
data (or `new Date()`) in its hydration render — gate with `useHasMounted()`.

**Found:** 2026-08-22, fresh account `funnel-test@chefer.dev`. **Severity: high** —
it's the core page, and a beta user who hits this sees an infinite spinner.

The `/meal-plan` page intermittently never leaves the route-level Suspense fallback
("Loading your meal plan…" from `apps/web/src/app/(dashboard)/meal-plan/loading.tsx`),
even across a hard reload.

Evidence gathered:

- A direct `fetch('/trpc/mealPlan.getForWeek?batch=1', …)` with `weekOffset: 0` from the
  same session returned **200 with the full plan** (planId `cmt4daesf000bbs0i7zsk1pas`)
  — the API is fine; the stall is client-side.
- Browser console showed minified **React error #418 (hydration mismatch)**, captured by
  Sentry — the Sentry event has the stack.
- Observed twice: (a) first visit before any plan existed — eventually resolved on its
  own; (b) right after the account was upgraded to PREMIUM and downgraded back to FREE —
  did **not** resolve within ~30 s nor after `window.location.reload()`.

Suspects: server-rendered tier-dependent UI in the `(dashboard)` layout or meal-plan page
disagreeing with client state after a tier flip, or a suspended server component that
never resolves.

How to attack: reproduce with a fresh account (register → generate → upgrade → downgrade →
revisit `/meal-plan`); run `pnpm build && pnpm start` locally for unminified hydration
diffs, or pull the #418 event from Sentry. Page code:
`apps/web/src/app/(dashboard)/meal-plan/page.tsx`.

---

## Full E2E sweep 2026-08-22 (fresh account `e2e-fresh@chefer.dev`, downgraded to FREE after)

Full user journey on prod: register → onboarding (vegetarian + peanut allergy + mushroom
dislike) → free generation → swap → rate/save/pin → cook mode → tracker → shopping list →
chat → upgrade (targets M/30/180cm/75kg, gain muscle, Indian+Mediterranean, €60 budget) →
premium generation → AI shopping list → premium swap → mobile 375px sweep → logout/login.

**What held up** (recording so it isn't re-tested from scratch): zero safety violations in
21 curated + 19 AI recipes (allergen/diet/dislike all filtered, disliked dish not repeated);
per-recipe macro arithmetic within 15% everywhere sampled (often exact); day totals ≈ calorie
target; TDEE math exact (2,982 kcal computed vs 2,981 by hand); chat's "62g protein today"
matches the plan and dashboard exactly; cook-mode → tracker → progress all consistent
(700/2000 kcal, −65%); pin placed verbatim + personalisation banner correct; €60 budget
honoured (€29 plan); AI list consolidation 98 → 37 items, no dupes; premium swap honours
cuisine+diet; no horizontal overflow on any page at 375px; cook-mode timer counts down;
past-week read-only, 404 page, login/logout all fine.

## 3. Price estimator mishandles non-standard units · **medium**

Derived (free) shopping list: **"Red lentils, 100 g, dry" → €52.50** (the unit string is
`g, dry`, which the estimator fails to parse as grams) and **"Saffron, 1 pinch" → €22.50**
(a pinch priced like a bulk quantity). These two alone inflated the week estimate to €120.
Fix in `lib/ingredient-prices` unit parsing (strip qualifiers like ", dry"; map pinch/dash
to ~0). Curated fixture ingredients carry the odd units.

## 4. Tracker macro targets disagree with the dashboard's · **medium**

For the same default 2,000 kcal, `/tracker` showed targets **P150/C250/F70** (sums to
2,230 kcal — internally inconsistent) while the dashboard showed **P125/C225/F67** (sums to
2,003 ✓). The tracker appears to use its own hardcoded split instead of
`resolveDailyTargets()` — a P0-5 unification leftover.

## 5. Dead curated recipe image · **low**

"Lentil & Roasted Veg Salad" (swap pool, `photo-1540189549336-e6e99eb4f7c9`) 404s on
Unsplash → "Photo unavailable" on the plan card and detail hero. The only dead id out of
22 fixture images (all others verified 200).

## 6. Ingredient thumbnails repeat generic fallbacks · **low**

AI-plan shopping list: 20 of 37 items shared just 3 stock photos ("Rolled Oats", "Red
Lentils", "Basmati Rice", "Gram Flour" +7 more → one image; "Green Chili", "Mint Chutney",
"Whole Wheat Roti" → a salad photo; "Tomato Puree", "Ginger-Garlic Paste", "Potatoes" →
another). Rows of identical images in one section read as broken. `resolveIngredientImage`
coverage is thin outside common western ingredients.

## 7. Category inference weak — 40% of items land in "Other" · **low**

40 of 98 derived-list items were bucketed "Other", including obvious produce (blueberries,
raspberries, cherry tomatoes, courgette, sweet potato, mixed leaves), dairy (halloumi) and
grains (buckwheat groats, corn tortillas). Extend `application/shared/category-map.ts`.

## 8. Gain-muscle protein target unrealistic vs what plans deliver · **low, product**

The gain-muscle split yields **P261g at 2,982 kcal (3.5 g/kg)** — above evidence-based
ranges (~1.6–2.2 g/kg) — while the AI plans actually deliver 120–161g/day. So protein reads
~50% of target forever on the tracker/dashboard. The plans are the sane side; revisit the
macro split so targets and generation agree.

## 9. Minor / polish (batch when nearby)

- Auth pages still branded **"PersonalChef.ai"** (register heading/logo, sign-in metadata)
  while everything else says Chefer.
- Dashboard **"Generate My Week"** only navigates to /meal-plan — the user must click
  Generate again there; copy overpromises.
- "Nutrition Facts per **1 servings**" grammar on the recipe page.
- Pin placement doesn't rebalance the day: Monday came to 2,436 kcal vs the 2,982 target
  after the 540-kcal pinned soup replaced a bigger AI lunch. Acceptable tradeoff — maybe
  tell the AI the pinned dish's calories up front.

## 2. Chat send button ignored first synthetic click (low confidence)

**Found:** 2026-08-22, same session. Probably an automation artifact, **not** a product
bug — a JS-dispatched click on "Send message" did nothing (message stayed in the input),
while a real coordinate click submitted fine. Only worth a look if a real user ever
reports a dead send button; pair it with the P1-6 device sweep (`docs/device-checklist.md`).
