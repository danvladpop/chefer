# Chefer — Premium Expansion Plan: five features, three waves

> **Author:** 2026-08-23. Companion to [`launch_plan.md`](./launch_plan.md) (the shipped
> milestone) and [`docs/premium-feature-ideas.md`](./docs/premium-feature-ideas.md) (the
> research these five come from — read it for the _why_; this file is the _how_).
> Phase C (Stripe) remains gated on funnel metrics and is untouched by this plan.
>
> **Execution model:** one orchestrating session + parallel subagents in isolated git
> worktrees. The plan is structured around the codebase's actual contention points so
> agents don't collide — see §2 and §7 before spawning anything.

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
6. **Acceptance:** seeded user with 2 weeks of logs+weights gets a review whose
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
6. **Acceptance (dev, real Gemini):** photo of a plate → plausible estimate → confirmed
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
7. **Acceptance (dev):** real blog URL → preview matches page → cheferized for a
   peanut-allergic vegetarian → saved → pinned → appears in a generated week.

### Wave 1 integration (orchestrator, serial, ~1 session)

Merge order `coach` → `snap` → `import` (coach touches resolveDailyTargets — everyone
else rebases on it). Resolve registry-file conflicts; run full gates; e2e sweep of the
three features together (a snap log feeding a review; an imported recipe pinned);
per-feature §6/§8/business_flow/analytics docs; merge to master **one feature per push**
(each deploys + prod-verifies before the next), throwaway prod account per verification,
tiers restored. Prod verify checklist lives in each agent's handoff file.

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
5. Tests: merge logic, portion math, generation servings; acceptance: 2-member household
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
6. Tests: seeding from check-offs (staples excluded), subtraction math, savings counter,
   leftover slot pairing; acceptance: buy week 1 → check off → week 2 generation uses
   ≥2 pantry items, list shows "have it" chips and a savings figure.

### Wave 2 integration

Merge `household` → `pantry`; wire the pantry provider into the household-owned loader;
combined e2e (household of 2 + pantry from last week's check-offs → one compliant,
scaled, pantry-aware week); docs; merge to master per feature with prod verification.

## 6. Verification protocol (every wave)

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
   business_flow flows, analytics dictionary, this file's §9 progress table).

## 7. Parallelization mechanics (read before spawning agents)

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

## 8. Rough sizing

| Phase                      | Wall-clock estimate                         |
| -------------------------- | ------------------------------------------- |
| Wave 0                     | ½ day (one session)                         |
| Wave 1 (3 agents parallel) | 1–2 days + ½–1 day integration/prod-verify  |
| Wave 2 (2 agents parallel) | 1½–2 days + ½–1 day integration/prod-verify |
| **Total**                  | **~4–6 working days** vs ~9–12 serial       |

## 9. Progress

| Step                      | Status |
| ------------------------- | ------ |
| Wave 0 foundations        | ⬜     |
| W1-A coach                | ⬜     |
| W1-B snap                 | ⬜     |
| W1-C import               | ⬜     |
| Wave 1 integration + prod | ⬜     |
| W2-D household            | ⬜     |
| W2-E pantry               | ⬜     |
| Wave 2 integration + prod | ⬜     |
