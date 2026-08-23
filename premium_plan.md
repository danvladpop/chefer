# Chefer — Premium Expansion Plan: five features, three waves

> **Author:** 2026-08-23. Companion to [`launch_plan.md`](./launch_plan.md) (the shipped
> milestone) and [`docs/premium-feature-ideas.md`](./docs/premium-feature-ideas.md) (the
> research these five come from — read it for the _why_; this file is the _how_).
> Phase C (Stripe) remains gated on funnel metrics and is untouched by this plan.
>
> **Execution model:** one orchestrating session + parallel subagents in isolated git
> worktrees. The plan is structured around the codebase's actual contention points so
> agents don't collide — see §2 and §8 before spawning anything.

---

## 1. Goal

Ship the five researched premium features behind the existing PLAN_FEATURES matrix:

| #   | Feature                                                    | Codename    | Wave |
| --- | ---------------------------------------------------------- | ----------- | ---- |
| F1  | The Adaptive Chef — weekly review + self-adjusting targets | `coach`     | 1    |
| F4  | Snap-to-Log — photo logging + week rebalance               | `snap`      | 1    |
| F5  | Cheferize Anything — recipe import + adaptation            | `import`    | 1    |
| F2  | Feed the Whole Table — household profiles                  | `household` | 2    |
| F3  | Zero-Waste Kitchen — pantry-aware plans + leftovers        | `pantry`    | 2    |

Order rationale (from the ideas doc): `coach` targets the Phase C retention gate directly;
`snap` feeds `coach` its adherence data; `import` is independent and self-contained. The
wave-2 pair both rework plan generation and shopping lists, so they come after the seams
land and are the only two that need close coordination.

Every feature ships: matrix key + entitlement enforcement, upgrade touchpoint with a
`source` tag, PW-3 events, unit tests, docs (per CLAUDE.md's table), and a live
verification in dev before merge.

## 2. Contention analysis — why this wave structure

Files/domains that more than one feature wants to touch:

| Contended asset                               | F1           | F4           | F5       | F2      | F3       | Resolution                                                                                                                                                |
| --------------------------------------------- | ------------ | ------------ | -------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma`                               | ✓            | —            | ✓        | ✓       | ✓        | **Wave 0 lands ALL schema. Frozen after.**                                                                                                                |
| `plan-features.ts` matrix                     | ✓            | ✓            | ✓        | ✓       | ✓        | Wave 0 adds all five keys + perk copy.                                                                                                                    |
| `MealPlanInput` + Gemini plan prompt          | targets only | —            | —        | ✓       | ✓        | Wave 0 adds optional seam fields; each feature fills only its own.                                                                                        |
| `meal-plan.service.ts` (generation)           | —            | rebalance    | pin path | ✓       | ✓        | F4 gets a seam (`rebalanceWeek` lives in its own module); F2/F3 partitioned by seam fields; final overlap handled in wave-2 integration.                  |
| `shopping-list.service.ts`                    | —            | —            | —        | scaling | ✓✓       | F2 only multiplies servings (small); F3 owns the file in wave 2.                                                                                          |
| `tracker` / `DailyLog`                        | reads        | writes       | —        | —       | —        | Wave 0 defines the logged-meal entry shape incl. custom entries; F1 treats entries as opaque totals.                                                      |
| `chat` tools                                  | review Q&A   | "I ate this" | —        | —       | pantry Q | Each adds its OWN tool in its own wave; tool registry pattern already additive (types + gemini + mock + buildTools). Merge conflicts here are mechanical. |
| `routers/index.ts`, docs §6/§8, analytics doc | ✓ all        |              |          |         |          | One-line-per-feature conflicts — integration pass resolves; agents note additions in their handoff instead of racing.                                     |

Conclusion: with a serial foundations commit and seam fields, **wave 1 has effectively
zero overlap** between its three agents, and wave 2's two agents overlap only in the
prompt-assembly function and the §8/§6 doc tables — cheap to integrate.

## 3. Wave 0 — Foundations (serial, one session, ~half a day)

Everything schema- and interface-shaped, landed as one deployable commit so parallel
agents never touch shared contracts.

### 3.1 Schema (single `db push`)

```prisma
model WeightLog {            // F1
  id       String   @id @default(cuid())
  userId   String
  date     DateTime // UTC midnight
  weightKg Float
  @@unique([userId, date])
  @@map("weight_logs")
}

model ChefReview {           // F1 — one row per user-week
  id             String   @id @default(cuid())
  userId         String
  weekStart      DateTime
  adherencePct   Int
  avgDailyKcal   Int
  weightTrendKg  Float?   // EWMA delta over the window; null until enough data
  adjustmentKcal Int      // applied on top of computed TDEE from this week on
  reviewText     String
  createdAt      DateTime @default(now())
  @@unique([userId, weekStart])
  @@map("chef_reviews")
}
// ChefProfile: add  targetAdjustmentKcal Int @default(0)   (coach's cumulative dial)

model HouseholdMember {      // F2
  id                  String  @id @default(cuid())
  userId              String
  name                String
  portionFactor       Float   @default(1) // 0.5 kid … 1.5 big eater
  isKid               Boolean @default(false)
  allergies           String[] @default([])
  dietaryRestrictions String[] @default([])
  dislikedIngredients String[] @default([])
  @@map("household_members")
}

model PantryItem {           // F3
  id             String    @id @default(cuid())
  userId         String
  ingredientName String    // normalized (normalizeIngredientName)
  quantity       Float
  unit           String
  source         String    @default("PURCHASE") // PURCHASE | MANUAL
  updatedAt      DateTime  @updatedAt
  @@unique([userId, ingredientName, unit])
  @@map("pantry_items")
}
// Recipe: add  sourceUrl String?          (F5 provenance)
```

F4 needs no schema: `DailyLog.loggedMeals` is Json — wave 0 documents the extended entry
shape instead: `{ recipeId?, custom?: { name, estimatedBy: 'vision'|'manual' }, mealType,
portionMultiplier, kcal, protein, carbs, fat }`. Existing readers must treat entries
without `recipeId` as valid (fix the tracker page's keying in wave 0 — it currently keys
on `recipeId:mealType`).

### 3.2 Feature matrix + entitlements

Add to `PLAN_FEATURES`: `adaptiveCoaching`, `photoLogging` (premium, limit `mealScansPerDay:
10`), `recipeImport` (premium, limit `recipeImportsPerDay: 5`), `householdPlans` (premium,
limit `householdMembers: 5`), `pantryPlanning`. Perk labels/descriptions now (UpgradeButton
copy renders from the matrix, so marketing copy exists before the features do — that's
fine, they read "coming to premium" only if we choose to gate visibility; default: keys
present, UI appears per wave).

### 3.3 Seams (the parallelization contract)

- `MealPlanInput` gains **optional** fields, each owned by exactly one feature:
  `householdContext?: { memberCount, portionSum, mergedSafety, dislikeNotes[] }` (F2),
  `useFirstIngredients?: { name, quantity, unit, reason }[]` (F3),
  `targetAdjustmentKcal` folds into `resolveDailyTargets` (F1 — no input change).
  `prompts.ts` gets one clearly-marked section builder per seam, no-op when the field is
  absent — wave-2 agents each edit only their own builder.
- `IAIService` gains `analyzeMealPhoto(imageBase64, mimeType): Promise<MealPhotoEstimate>`
  and `extractRecipe(source: { url?|text?|imageBase64? }): Promise<ExtractedRecipe>` —
  implemented as typed stubs in mock (deterministic fixtures) in wave 0; Gemini
  implementations land with F4/F5.
- `rebalanceWeek(userId, planId): Promise<RebalanceResult>` declared in a NEW module
  `application/meal-plan/rebalance.ts` (F4 owns it) so F4 never edits meal-plan.service.
- Chat `ChatTools` stays per-wave additive (each feature appends its tool in all four
  places; integration pass resolves the mechanical adjacent-line conflicts).

### 3.4 Analytics dictionary (PW-3 extension, documented in wave 0)

`weight_logged`, `chef_review_viewed`, `meal_scanned {confirmed}`, `week_rebalanced`,
`recipe_imported {via: url|photo|text}`, `recipe_cheferized`, `household_member_added`,
`pantry_confirmed`, `plan_used_pantry {itemCount}` — plus upgrade sources: `coach-review`,
`snap-scan`, `recipe-import`, `household`, `pantry`.

### 3.5 Merchandising baseline

Per §6.2/§6.3: the `/premium` showcase page (skeleton + matrix-driven comparison table +
existing five pillars' cards), the source-aware upgrade dialog v2, the nudge
frequency-cap helper, and the `premium_page_viewed` event. Wave agents plug their cards
and ghost states into these rails.

**Wave 0 exit gate:** typecheck/test/lint green, `db push` applied in dev + deployed
(schema is additive — zero behavior change), doc tables updated (§6 schema, §8 no new
procedures yet), THEN branches for wave 1 are cut.

## 4. Wave 1 — three parallel workstreams

Spawn three subagents in **worktree isolation**, branches `feat/coach`, `feat/snap`,
`feat/import`. File-ownership per agent listed below is exclusive — an agent needing a
file it doesn't own must note it in its handoff instead of editing (except the mechanical
registry files: routers/index.ts, chat tool plumbing, analytics.ts — conflicts there are
expected and resolved at integration).

### W1-A · `coach` (F1 Adaptive Chef) — effort M

**Owns:** `application/coach/**` (new), `routers/coach.router.ts` (new), `WeightLog`/
`ChefReview` repositories (new files in packages/database), dashboard weight card +
review banner components (new files), tracker read-only usage.

1. **Weight log:** `coach.logWeight { date, weightKg }` (upsert), `coach.weightHistory`.
   Dashboard card: today's weight quick-entry + 30-day sparkline (dataviz conventions).
   Free users can log weight (it's data honesty); _coaching_ is premium.
2. **Review engine** (`application/coach/review.service.ts`): pure function over inputs →
   `{ adherencePct, avgDailyKcal, weightTrendKg, adjustmentKcal }`.
   - Adherence: days with ≥1 logged meal / 7; calorie balance: Σ logged vs Σ target.
   - Weight trend: EWMA (α≈0.25) over ≥5 points spanning ≥10 days; else null.
   - Adjustment policy (deterministic, unit-tested, conservative):
     goal LOSE + trend ≥ −0.1 kg/wk for 2 consecutive reviews → −100 kcal (floor:
     BMR×1.1); goal GAIN + trend ≤ +0.05 → +100 (ceiling: TDEE+500); adherence <50% →
     adjust nothing, coach the habit instead. Cumulative dial stored in
     `ChefProfile.targetAdjustmentKcal`; `resolveDailyTargets` adds it AFTER the goal
     adjustment, THEN the protein cap runs (ordering test required).
   - Review text: Gemini with the numbers + last week's dishes; mock = template string.
     Non-medical tone rules in the prompt; never mention BMR/algorithms.
3. **Scheduling:** extend `WeeklyPlanWorker`'s Sunday tick: reviews run BEFORE plan
   generation (so the new targets shape the new week) for premium users with ≥3 logged
   days; row written idempotently (`@@unique(userId, weekStart)`).
4. **Surfaces:** Monday banner upgraded: review summary + "see full review" sheet;
   free users with ≥3 logged days get the teaser ("your chef noticed a trend —
   upgrade to read the review", source `coach-review`). Chat tool `getMyReview`.
5. **Tests:** adjustment policy table-driven (≥10 cases incl. floors/plateau/low
   adherence); EWMA; worker idempotency; targets-ordering with protein cap.
6. **Merchandising (§6.4):** blurred-review ghost state + /premium card.
7. **Acceptance:** seeded user with 2 weeks of logs+weights gets a review whose
   adjustment propagates to dashboard/tracker targets AND the next generated week's
   calorie budget; second worker run same Sunday = no-op.

### W1-B · `snap` (F4 Snap-to-Log) — effort M

**Owns:** `routers/scan.router.ts` (new express route `/api/scan-meal`, multipart ≤5 MB,
session-auth like chat.router), `lib/ai/gemini.ts#analyzeMealPhoto` + mock impl,
`application/meal-plan/rebalance.ts`, tracker page custom-entry UI + camera button,
chat "I ate this" flow.

1. **Vision call:** Gemini multimodal → `{ dishName, confidence, kcal, protein, carbs,
fat, portionNote }`. Prompt demands ranges honesty; response includes `low|med|high`
   confidence surfaced in UI. Metered via quotas.ts (`mealScansPerDay` from matrix,
   AiCallLog type `SCAN` — add enum value in wave 0 schema… **correction: enum additions
   are schema; wave 0 includes `AiCallType.SCAN`**).
2. **Logging:** confirm sheet (editable numbers) → `tracker.logCustomMeal` appends a
   custom entry (wave-0 shape) to today's DailyLog; tracker page renders custom rows
   (name + "estimated" chip, deletable). Caddy: `/api/scan-meal` → api (remember: route
   list + deploy-verify untouched; Caddyfile change deploys fine — deploy.sh restarts
   caddy).
3. **Rebalance:** after any log (custom or cook-mode), if week-to-date consumed+planned
   projects >±15% off weekly target, `rebalanceWeek` swaps up to 2 FUTURE meals for
   closer-calorie pool alternatives (premium path may call AI swap; free = no rebalance).
   Never touches today/past. Banner on meal-plan: "I adjusted Thursday dinner to keep
   your week on track" + undo (restores previous recipeId — rebalance stores the swap
   pairs it made).
4. **Free tier:** manual quick-add (name+kcal only) is FREE (fills the honesty gap);
   photo scan + rebalance premium (source `snap-scan` on the camera button for free
   users).
5. **Tests:** rebalance selection logic (fixtures), quota, custom-entry rendering, undo.
6. **Merchandising (§6.4):** demo-scan sheet for free users + /premium card.
7. **Acceptance (dev, real Gemini):** photo of a plate → plausible estimate → confirmed
   → tracker + progress reflect it; overshoot triggers exactly one rebalance with undo.

### W1-C · `import` (F5 Cheferize) — effort M

**Owns:** `routers/import.router.ts` (tRPC: `recipe.importPreview`, `recipe.importSave`),
`lib/ai/gemini.ts#extractRecipe` + mock impl, `lib/recipe-import/**` (new: URL fetch +
readability strip, size caps, SSRF guard — http(s) only, no private IPs), import UI on
/recipes (button + preview/edit sheet), "Cheferize" diff view.

1. **Extract:** URL → fetch (10s timeout, 1 MB cap, user-agent set) → main-content strip
   → Gemini structured extraction (RecipeData minus id/image). Photo path: vision on an
   uploaded image. Text path: paste. All metered (`recipeImportsPerDay`).
2. **Cheferize:** second pass adapts to the user: allergen swaps (then re-validated by
   the P1-2 allergen matcher — AI output never trusted for safety), servings normalize,
   macro estimate cross-checked against the ingredient macro vocabulary (flag >25%
   disagreement as "estimate uncertain"). Diff UI: original vs adapted, changes listed.
3. **Save:** `source: MANUAL`, `sourceUrl`, image via Pollinations pipeline (name-seeded)
   unless the page had an og:image that passes a HEAD check. Saved recipes are rateable
   and pinnable → they flow into P1-1 generation placement with zero extra work.
4. **Entry points:** /recipes "Import" button (premium; free sees it as touchpoint
   `recipe-import`), chat tool `importRecipe(url)`.
5. **Copyright stance:** personal-collection only, provenance kept, never served to
   other users, no full-text republication. Note in business_flow.
6. **Tests:** extractor fixtures (2–3 saved HTML pages), allergen re-validation (the
   "AI missed the peanut" case MUST fail closed), quota, macro cross-check.
7. **Merchandising (§6.4):** free preview-then-blurred-diff flow + /premium card.
8. **Acceptance (dev):** real blog URL → preview matches page → cheferized for a
   peanut-allergic vegetarian → saved → pinned → appears in a generated week.

### Wave 1 integration (orchestrator, serial, ~1 session)

Merge order `coach` → `snap` → `import` (coach touches resolveDailyTargets — everyone
else rebases on it). Resolve registry-file conflicts; run full gates; e2e sweep of the
three features together (a snap log feeding a review; an imported recipe pinned);
per-feature §6/§8/business_flow/analytics docs; merge to master **one feature per push**
(each deploys + prod-verifies before the next), throwaway prod account per verification,
tiers restored. Prod verify checklist lives in each agent's handoff file.

## 4.5 Interlude W1.5 — mock realism + AI-error polish (single session, BEFORE wave 2)

Added 2026-08-23 after wave-1 integration (see §10 deviation 6): the Gemini key
stays on the free tier (hard 20 requests/day on gemini-2.5-flash) until real
users justify upgrading, so dev/UI/Playwright testing must be able to drive
every AI branch without live calls. One session, orchestrator-safe (no agent
ownership conflicts; wave 2 must not start until this lands because W2 agents
develop against the mock's seam handling).

1. **Scenario-steerable MockAIService** (defaults unchanged — existing tests
   keep passing): keyword-steered `extractRecipe` fixture library (satay/peanut
   → allergen-bearing fixture, beef → meaty, "no-recipe" → NO_RECIPE_FOUND,
   else current pasta); `cheferizeRecipe` becomes a real deterministic adapter
   (substitution map + serving rescale + accurate changes[], with a magic
   "UNSAFE" name that leaves the allergen in to demo the P1-2 fail-closed
   path); `analyzeMealPhoto` derives estimate + confidence from an image-byte
   hash with a reachable ~1500+ kcal case (demoes rebalance); `generateMealPlan`
   honors the wave-0 seam fields minimally (portionSum servings scaling,
   useFirstIngredients injection) — **wave-2 agents depend on this**. Steering
   conventions documented in mock.ts + infrastructure.md §7.
2. **Friendly AI-failure errors**: map upstream AI failures (429/timeouts) in
   the recipe-import + scan services to a friendly TRPCError ("The chef is
   over capacity…"), raw error kept in server logs — the import sheet
   currently renders the raw 429 JSON blob.

Gates + push per §7; mock changes are inert in prod (`AI_MOCK_ENABLED=false`
there). Update §10 when done.

## 5. Wave 2 — two parallel workstreams

Branches `feat/household`, `feat/pantry`. These two share the generation prompt; the
wave-0 seams mean each edits only its own prompt section + its own seam field. The ONE
file both touch meaningfully is `meal-plan.service.ts` (loading their context into
`MealPlanInput`): **household owns the file**; pantry delivers its context via a small
provider function (`application/pantry/pantry-context.ts`) that household's loader calls
— pantry's agent writes the provider, integration wires the one call.

### W2-D · `household` (F2) — effort M–L

**Owns:** household repository/service/router (new), preferences "My household" section,
`meal-plan.service.ts` context loading, prompt's household section, per-person portion
display (recipe page, cook mode servings default, shopping list multiplier).

1. CRUD (max from matrix), member chips UI with per-member safety editors (reuse the
   onboarding safety components).
2. Generation: merged safety = union (hard, reuses `filterSafeRecipes` unchanged — unit
   test proving a member's allergen excludes a recipe); dislikes soft-balanced in prompt
   ("avoid X for Maria, or note who it's for"); servings = ceil(Σ portionFactor);
   free-tier curated path also gets the union filter (safety is never premium — matrix
   gates the _members UI_, but if members exist the filter still applies).
3. Lists/cook mode: scaled quantities; cook mode servings pre-set to household size;
   week cost shows per-household + per-person.
4. Ratings: optional "who liked it" chips on rate → stored in notes (v1 — no schema).
5. Merchandising (§6.4): ghost member chips + sample merged week + /premium card.
6. Tests: merge logic, portion math, generation servings; acceptance: 2-member household
   (one vegan+nut allergy) generates a compliant week, list scales, cook mode defaults.

### W2-E · `pantry` (F3) — effort L (v1 scoped)

**Owns:** pantry repository/service/router (new), `shopping-list.service.ts`, pantry
page/sheet UI, prompt's use-first section via provider, chat tool `whatCanIMake`.

1. **Seeding:** on `toggleItems(checked=true)` → upsert PantryItem from the item's
   name/qty/unit (PURCHASE). Staples denylist (salt, pepper, oil, water…) never tracked.
   Unchecking does NOT remove (you bought it last week and still have it).
2. **Depletion v1 — honest and simple:** no automatic per-recipe depletion. Weekly
   60-second confirm sheet (Sunday/first visit): "still have these?" with tap-to-clear;
   quantities decay to "some" state rather than fake grams. (Full depletion modeling is
   v2 — the plan explicitly defers it.)
3. **Planning:** provider returns top N use-first items (oldest first); prompt section
   instructs Gemini to prefer them (soft constraint, like budget); response
   `personalisation` extended with `usedPantryItems` → banner "uses 4 things you already
   have". Free tier: pantry page visible read-only with upsell (source `pantry`).
4. **List subtraction:** derived+AI list marks pantry-covered items ("have it" chip,
   excluded from est. total, one tap to re-add); savings counter = Σ estimated prices of
   covered items ("saved ~€X this week") on the list header + review (coach reads it —
   wave-1 seam: reviews include optional `savedEur`).
5. **Leftovers toggle:** generation option "cook once eat twice" → prompt pairs 2–3
   dinner→next-lunch slots with doubled servings; slots labeled "Leftovers from Tuesday"
   (MealSlot gains optional `leftoverOf` — Json, no schema change).
6. Merchandising (§6.4): post-check-off savings tease + /premium card.
7. Tests: seeding from check-offs (staples excluded), subtraction math, savings counter,
   leftover slot pairing; acceptance: buy week 1 → check off → week 2 generation uses
   ≥2 pantry items, list shows "have it" chips and a savings figure.

### Wave 2 integration

Merge `household` → `pantry`; wire the pantry provider into the household-owned loader;
combined e2e (household of 2 + pantry from last week's check-offs → one compliant,
scaled, pantry-aware week); docs; merge to master per feature with prod verification.

## 6. Merchandising — make premium visible, attractive, and obviously worth it

Building the features is half the job; the funnel only moves if free users can _see_ what
they're missing. Five principles, then concrete surfaces with owners.

### 6.1 Principles

1. **Demo on their data, never stock screenshots.** The highest-converting paywall
   pattern is a "ghost state": the feature actually runs on the user's own data and shows
   a real, partially-revealed result. "Your chef noticed something about your Tuesdays…"
   beats any bullet list.
2. **Every locked state is a mini-demo, one tap from unlock.** Value first, lock second —
   a locked surface must show what it _would_ do before it says "premium".
3. **One honest comparison, generated from the matrix.** The free-vs-premium table
   renders from `PLAN_FEATURES` (the PW-1 principle extended to marketing) so pricing
   copy and enforcement can never drift.
4. **Quantify in euros wherever possible.** Pantry savings, budget adherence, "what these
   tools cost as separate apps" (MacroFactor $72/yr + MFP $80/yr + Samsung Food $30/yr —
   the anchor stack from the research doc).
5. **Beta framing with a price anchor.** "Free during the beta" converts curiosity but
   anchors the product at €0. Show the future price on the showcase page ("€6.99/month
   after beta — beta members lock in early-bird pricing") so the eventual Phase C price
   is an expected event, not a rug-pull. _(Exact price and whether to promise early-bird
   pricing = product owner's call before this text ships.)_

### 6.2 The `/premium` showcase page — NEW, wave 0 (orchestrator)

Today the entire pitch is one Sheet dialog with a bullet list. Build a real page:

- Hero: one sentence ("A chef that knows you — and your week") + primary CTA.
- **Feature cards**, one per premium pillar (existing five + the new five as they land):
  small illustrative mock or live mini-widget, outcome-phrased one-liner, "see it in
  action" scroll anchor. Each wave agent ships their card with their feature.
- **Free vs Premium comparison table** rendered from `PLAN_FEATURES` (labels,
  descriptions, limits — e.g. "Chat: 5/day → unlimited").
- The euro anchor stack (principle 4) and beta price framing (principle 5).
- FAQ: cancel anytime, what happens on downgrade (nothing is deleted), beta terms.
- Every entry point deep-links here preserving its `source`
  (`/premium?source=chat-quota`), CTA fires the standard funnel events.
- The upgrade dialog gains a "See everything premium does →" link to this page.

### 6.3 Upgrade dialog v2 — wave 0 (orchestrator)

Keep the Sheet (it converts in-context) but make it **source-aware**: the perk list
reorders so the feature that triggered it comes first with its description expanded, the
rest collapse to a compact row. From the shopping-list touchpoint you see the AI list +
pantry first; from chat-quota, unlimited chat + the chef's tools. Pure presentation —
reads the same matrix, keyed off the existing `source` prop.

### 6.4 Per-feature ghost states (the money-makers)

Each feature agent builds their own ghost state as part of their workstream — it is a
deliverable, not a nice-to-have. All fire `upgrade_prompt_shown {source}`.

| Feature   | Free-tier ghost state                                                                                                                                                                                | Surface                        | `source`        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------- |
| coach     | Free users with ≥3 logged days get a REAL review generated — first line visible, rest blurred: "Your chef noticed something about your week…" Weight logging itself stays free (it feeds the tease). | Monday banner + dashboard card | `coach-review`  |
| snap      | Camera button visible in tracker; tap opens a demo sheet (sample scan animating → macros appear) + "scan your own meals with premium".                                                               | Tracker + chat                 | `snap-scan`     |
| import    | Import button visible; free users get the extraction PREVIEW (1/day) on their own URL — then the Cheferize diff renders blurred with the changes count visible ("3 adaptations for your allergies"). | /recipes                       | `recipe-import` |
| household | Preferences shows "My household" with ghost member chips ("+ add your partner"); tapping renders a sample merged week using their own diet + one fictional member.                                   | Preferences                    | `household`     |
| pantry    | After any check-off session: "You now have 14 items in your kitchen — premium plans cook from them" + a REAL computed savings figure ("this week that would have saved ~€6").                        | Shopping list header           | `pantry`        |

### 6.5 Moment-based nudges (copy triggers on existing surfaces)

- After a rating is saved (free user): "Premium turns your ratings into next week's menu"
  — the P1-1 pitch at the exact moment they generated the signal. `source: post-rating`.
- Monday, free users with a stale week: "Premium members woke up to a fresh week today."
  `source: monday-nudge`.
- **Frequency + taste rules (hard):** max one contextual nudge per day, every nudge
  dismissible and the dismissal remembered (localStorage per source, 7-day cooldown),
  nudges never interrupt a task in progress, no fake urgency/countdown patterns. The
  soft paywall's credibility is a launch asset — don't spend it.

### 6.6 Onboarding

The existing "You're all set / Go further" step (step 2) swaps its static perk list for
the same feature cards (compact carousel) + the comparison-table link. Source stays
`onboarding`.

### 6.7 Instrumentation & success criteria

New events: `premium_page_viewed {source}`, `teaser_engaged {feature}`; new sources
listed above join the funnel-by-source insight automatically (PostHog breakdown picks up
new values). Success = the existing Phase C gate metrics, now measurable per
merchandising surface: which ghost state actually converts, which nudge gets dismissed.
Kill or rework any surface with high impressions and near-zero clicks within two weeks
of data — merchandising that doesn't convert is just noise.

### 6.8 Ownership summary

| Deliverable                                                                                               | Owner                        | When                |
| --------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------- |
| `/premium` page skeleton + matrix comparison table + dialog v2 + nudge cap helper + `premium_page_viewed` | Orchestrator                 | Wave 0              |
| Ghost state + `/premium` feature card + sources, per feature                                              | That feature's agent         | Their wave          |
| Post-rating + Monday nudges, onboarding carousel                                                          | Orchestrator                 | Wave 1 integration  |
| Funnel review of new sources (kill/keep)                                                                  | Product owner + orchestrator | 2 weeks post-launch |

## 7. Verification protocol (every wave)

1. `pnpm lint && pnpm typecheck && pnpm test` green (agents run this before handoff;
   integrator re-runs on the merge result) + `pnpm --filter @chefer/web build`.
2. Dev e2e with browser tools on the acceptance script above; real Gemini for AI-path
   acceptance, mock for iteration (`AI_MOCK_ENABLED` — dev API currently runs REAL
   Gemini; flip it while iterating, restore before the acceptance run).
3. Playwright mobile sweep after UI-heavy features (`cd tests && pnpm exec playwright
test --project=mobile`).
4. Merge to master one feature per push; deploy is push-to-master; prod verify with a
   throwaway account (register fresh; restore/downgrade after; seed data via psql on the
   VM only when unavoidable and clean it up).
5. Docs in the SAME commit as the feature (CLAUDE.md table: §6 schema, §8 procedures,
   business_flow flows, analytics dictionary, this file's §10 progress table).

## 8. Parallelization mechanics (read before spawning agents)

- **Worktrees:** every wave-1/2 agent runs with `isolation: worktree` on its own branch.
  Agents commit to their branch; they NEVER push, NEVER touch master, NEVER run
  `git merge`.
- **Schema freeze:** `schema.prisma` and `plan-features.ts` are wave-0 property. An agent
  that believes it needs a schema change stops and reports instead of editing.
- **Shared dev DB:** one Postgres serves all worktrees. Schema already applied in wave 0,
  so no agent runs `db push`. Each agent uses its own throwaway account
  (`agent-<codename>@chefer.dev`) — never the seed accounts, never another agent's.
- **Dev servers:** only the orchestrator runs dev servers/browser verification. Agents
  develop against unit tests + typecheck; anything needing a browser goes in the handoff
  as a verification note. (Two Next dev servers on one port cannot coexist; don't try.)
- **Registry files** (routers/index.ts, chat tool plumbing, analytics event helper,
  doc tables): agents append their lines and EXPECT conflicts; integrator resolves.
  Everything else follows the ownership lists — if two agents edited a non-registry file,
  that's a plan bug to flag, not silently merge.
- **Handoff artifact:** each agent's final message must contain: branch name, files
  added/changed, registry additions, test names added, acceptance script for the
  integrator, and any deviations from this plan.
- **AI cost:** agents default to mock AI; the integrator's acceptance runs use real
  Gemini. Vision/import prompts get fixture-based tests so quality iteration doesn't
  burn live calls.

## 9. Rough sizing

| Phase                      | Wall-clock estimate                         |
| -------------------------- | ------------------------------------------- |
| Wave 0                     | ½ day (one session)                         |
| Wave 1 (3 agents parallel) | 1–2 days + ½–1 day integration/prod-verify  |
| Wave 2 (2 agents parallel) | 1½–2 days + ½–1 day integration/prod-verify |
| **Total**                  | **~4–6 working days** vs ~9–12 serial       |

## 10. Progress

| Step                             | Status                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave 0 foundations               | ✅ 2026-08-23 (commits c2e4a3c + ae72b2e; deployed + prod-verified; deviations below)                                                                                                                                                                                                                                        |
| W1-A coach                       | ✅ 2026-08-23 — feat/coach handoff (engine/worker/router/banner/teaser, 40 tests)                                                                                                                                                                                                                                            |
| W1-B snap                        | ✅ 2026-08-23 — feat/snap handoff (scan route, vision, rebalance, custom rows, ghost)                                                                                                                                                                                                                                        |
| W1-C import                      | ✅ 2026-08-23 — feat/import handoff (SSRF-guarded extract, Cheferize, blurred-diff ghost, 67 tests)                                                                                                                                                                                                                          |
| Wave 1 integration + prod        | ✅ 2026-08-23 — three deploys (2cc6f75 coach, 13051d2 snap, 9005e52 import+fix), each prod-verified via throwaway (weight log + review eligibility; /api/scan-meal 403 through Caddy + live quick-add; SSRF rejection + import quota + all /premium cards). Real-Gemini quality spot-check pending quota reset (deviation 6) |
| W1.5 mock realism + error polish | ⬜ — spec in §4.5; run in a fresh session BEFORE wave 2                                                                                                                                                                                                                                                                      |
| W2-D household                   | ⬜                                                                                                                                                                                                                                                                                                                           |
| W2-E pantry                      | ⬜                                                                                                                                                                                                                                                                                                                           |
| Wave 2 integration + prod        | ⬜                                                                                                                                                                                                                                                                                                                           |

### Wave-0 deviations (found against the real code, 2026-08-23)

1. **No `WeightLog` model.** `WeightEntry` already exists with
   `tracker.logWeight` / `tracker.weightHistory` procedures AND a working
   weight quick-entry + chart on `/progress`. The coach reads
   `weightEntryRepository` (multiple entries per day are fine for EWMA) and
   W1-A's "dashboard weight card" scope shrinks to: reuse/link the existing
   `/progress` entry, add a dashboard surface only if the review needs it.
2. **`AiCallType.RECIPE_IMPORT` added** alongside `SCAN` — import metering
   (`recipeImportsPerDay`) needs a countable call type and the schema freezes
   after wave 0.
3. **`ChefReview.savedEur Float?` added now** — §5's W2-E seam ("reviews
   include optional savedEur") is schema, so it must land in wave 0.
4. **`recipeImportsPerDay` free tier = 1** (not false) — encodes §6.4's
   free extraction-preview ghost state in the matrix.
5. **No future-price copy on `/premium`** — §6.1 principle 5 marks exact
   price/early-bird wording as the product owner's call; the page ships the
   anchor stack + "free during beta" only.

### Wave-1 integration deviations (2026-08-23)

6. **Dev e2e ran on MOCK AI, not real Gemini** (§7.2 deviation). The Gemini
   key is free tier with a hard **20 requests/day** limit on gemini-2.5-flash
   (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`), and the day's bucket
   was exhausted mid-acceptance. Everything mechanical was verified live in
   dev (import preview→cheferize→save→pin→generation placement, scan→confirm
   →tracker custom row, coach two-review plateau → −100 kcal dial →
   target propagation → idempotency, all three §6.4 ghost states, chat
   logMeal/getMyReview/import tools, quotas, 59-test mobile sweep);
   AI-output _quality_ is spot-checked on prod during per-feature
   verification instead. **Operational follow-up for the product owner: the
   shared Gemini key's 20 RPD cannot support real usage — upgrade the
   Google AI plan (or add a billing-enabled key) before promoting the AI
   features.** Also note the extraction call succeeded and the quality of
   the import flow's error surface for AI failures is poor (raw 429 JSON
   rendered in the sheet) — small polish candidate.
7. **Integration fix:** imported recipes keep any-domain og:images;
   next/image's dev loader crashes on unconfigured hosts —
   `getRecipeImageProps` now marks non-allowlisted hosts `unoptimized`
   (prod already renders unoptimized globally).
8. Agents' own deviations are recorded in their handoffs (summarised: coach
   reuses WeightEntry + free users get real reviews with
   `applyAdjustment=false`; snap uses raw-body upload, pool-based
   deterministic rebalance with client-side undo; import runs the Cheferize
   pass for free previews (2 AI calls, capped 1/day) and added
   `IAIService.cheferizeRecipe` + `CreateManualRecipeData.sourceUrl`).
