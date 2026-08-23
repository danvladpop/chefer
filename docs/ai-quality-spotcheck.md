# AI quality spot-check + secondary-provider research (Wave 3)

Working doc for premium_plan.md §5.5. Part 1 records the W3-A secondary-provider
research; part 2 will hold the W3-B live-quality findings once the failover is
deployed.

---

## 1. Secondary free-tier provider — comparison (researched 2026-08-23)

Scope guard: NO paid AI spend. Candidates were evaluated on the §5.5 criteria in
order: sustained free quota (not trial credit) → vision → JSON/structured
output → context → ToS fit. Numbers verified against provider docs where
possible; aggregator numbers marked as such.

| Criterion              | **Groq** (chosen)                                                                                         | OpenRouter `:free`                                                                                                               | Mistral (Experiment plan)                                                                                                                | Cerebras                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sustained free quota   | ✅ Real dev tier, no card. `gpt-oss-120b`: 30 RPM / **1,000 req/day** / 8K TPM / 200K TPD (official docs) | ⚠️ **50 req/day** without a credit purchase; the 1,000/day tier requires buying $10 credits once — blocked by the no-spend guard | ⚠️ Free tier exists (~1B tokens/mo) but Mistral no longer publishes limits; third parties report **1–2 RPM**, too tight for bursty calls | ❌ Official docs describe the free tier as a **$5 credit trial expiring in 30 days** (5 RPM, 1M TPD, 2 models) — trial credit, disqualified by criterion 1 |
| Vision                 | ❌ Current model list has no vision model (the Llama-4 vision previews are gone)                          | ⚠️ Some `:free` vision models, but availability rotates and is provider-throttled                                                | ✅ Pixtral/small-vision on paper                                                                                                         | ⚠️ `gemma-4-31b` takes images (2/request) but the tier is a trial                                                                                          |
| JSON/structured output | ✅ OpenAI-compatible `response_format`                                                                    | ✅ Varies per underlying model                                                                                                   | ✅                                                                                                                                       | ✅                                                                                                                                                         |
| Context                | ✅ 128K on `gpt-oss-120b` (free TPM 8K is the practical cap per minute)                                   | Varies                                                                                                                           | OK                                                                                                                                       | ❌ 8K context cap on free                                                                                                                                  |
| ToS / fit              | ✅ Standard dev tier; OpenAI-compatible base URL `https://api.groq.com/openai/v1`                         | ⚠️ Aggregator layer; free models "subject to additional provider-side limits during peak hours"                                  | ⚠️ Explicitly "for evaluation, not production"; free tier historically tied to data-training opt-in — poor fit for user meal/photo data  | ⚠️ Trial framing                                                                                                                                           |

**Decision: Groq, model `openai/gpt-oss-120b`, as the OpenAI-compatible
secondary.** 1,000 requests/day is 50× the Gemini free tier (20/day) and it is a
genuinely sustained tier. **Vision stays Gemini-routed** — `analyzeMealPhoto`
and photo-based recipe import do NOT fail over; when Gemini's quota is gone,
those return the friendly capacity error as before. The 8K tokens/minute cap is
the practical constraint for the largest call (week-plan generation); smaller
call types (chat, ingredient prices, list consolidation) fit comfortably.

Sources: [Groq rate limits](https://console.groq.com/docs/rate-limits),
[Groq models](https://console.groq.com/docs/models),
[OpenRouter limits](https://openrouter.ai/docs/api-reference/limits),
[Cerebras rate limits](https://inference-docs.cerebras.ai/support/rate-limits),
aggregators for Mistral (limits unpublished):
[pricepertoken](https://pricepertoken.com/endpoints/mistral/free),
[costbench](https://costbench.com/software/llm-api-providers/mistral-ai/free-plan/).

---

## 2. Live-quality spot-check findings (W3-B, run 2026-08-23)

Fresh prod throwaway `w3b-spot@chefer.dev` (upgraded via the onboarding
soft paywall, downgraded to FREE afterwards). Profile: male 38, 178 cm/82 kg,
lightly active, lose weight (target computed 1,903 kcal/day), dislikes
mushrooms, allergy peanuts (added before the import test); household member
Maria (vegan, peanut allergy, 1 portion); pantry seeded with basmati rice,
chickpeas, coconut milk, spinach; "cook once, eat twice" on.

**Budget used:** 8 Gemini calls (plan generation, 2× extract, 2× cheferize,
1 prompt-fix verification, 2 scans) of 20/day; ~7 Groq requests (prod chat
tool-loop + dev failover verification) of 1,000/day. Provider per call from
the `[AI] <method>: served by <provider>` server log.

### What was tested, per provider

| #   | Test                                                           | Provider                                 | Verdict                                                      |
| --- | -------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| 1   | Household-compliant premium generation (vegan+peanut member)   | gemini                                   | ✅ strong                                                    |
| 2   | Pantry use-first in the same generation                        | gemini                                   | ✅ strong                                                    |
| 3   | Recipe import ×2 (BBC satay salad, RecipeTin mushroom risotto) | gemini                                   | ✅ extraction / ⚠️ nutrition-rescale bug (fixed)             |
| 4   | Real meal-photo scan + non-meal honesty probe                  | gemini (vision)                          | ✅ excellent                                                 |
| 5   | Chat with a tool call (logMeal)                                | **groq** (secondary-first, live on prod) | ✅ works / ⚠️ two nits                                       |
| —   | Coach weekly-review text                                       | —                                        | skipped: needs weeks of logged history, not cheap to trigger |

### Details + findings (severity: high/med/low)

**Generation (gemini) — strong.** Full 7-day plan, every meal vegan (merged
household safety over an omnivore owner), zero mushrooms, day totals
1,700–1,950 kcal against a 1,903 target. €67.72/week with a correct
€33.86/person for 2. All four pantry items woven into real dinners (banner:
"uses 4 things you already have") and leftovers pairing produced Mon→Tue,
Wed→Thu, Fri→Sat chips. Recipes open with servings=2 and household-scaled
quantities.

- **MED (gemini, generation):** "Vegan Pad Thai with Tofu" uses 100 ml of
  "pad thai sauce" — a compound ingredient that in real products routinely
  contains peanut (and fish sauce). The peanut allergy is respected in
  _named_ ingredients only; opaque compound sauces slip past both the
  prompt and the P1-2 string matcher. Deferred: extend the P1-2 matcher
  with a compound-ingredient blocklist (satay/pad-thai/hoisin/worcestershire
  …) or prompt the model to expand sauces into components.
- **LOW (gemini, generation):** with leftovers mode on, the model ALSO
  names some lunches "X Leftovers" on top of the deterministic
  `pairLeftovers` chips — two overlapping mechanisms, cosmetic only.

**Import (gemini) — extraction faithful, one real bug (now fixed).**
Both URLs extracted accurately (satay: tamari, curry powder, honey, chicken,
crunchy peanut butter…; risotto: both mushroom quantities from the page).
Cheferize swapped peanut butter → sunflower seed butter (allergy) and
mushrooms → chickpeas (dislike), renamed the dishes sensibly, and the saved
recipe used the blog's own photo.

- **HIGH → FIXED (gemini, cheferize):** per-serving nutrition was divided
  by the serving count when rescaling (BBC satay 353 kcal/serving → "177
  kcal"; risotto 649 → "162 kcal" — implausible). The CHEFERIZE prompt said
  "stays PER SERVING" too weakly. Prompt strengthened (never scale
  nutritionInfo with servings + worked example) and re-verified live:
  4→1 servings now keeps 649 kcal/serving while quantities scale 300 g→75 g.
- **LOW (design note):** import Cheferize targets the OWNER's preferences
  and serving size (1), not the household merge — plan generation and
  import adapt to different scopes. Intentional per wave-1 spec, but worth
  a product decision eventually.

**Scan (gemini vision) — excellent.** Restaurant spaghetti-bolognese photo:
"Spaghetti Bolognese with Parmesan", confidence high, 750 kcal / 40 P /
80 C / 30 F (macros sum exactly to the kcal), itemised portion note. Honesty
probe with a raw-ingredient display photo: "Assortment of raw ingredients",
confidence low, all zeros, explicit "not a prepared meal" note.

**Chat (groq `gpt-oss-120b`, secondary-first — live on prod).** "I just ate
a croissant with jam, log it" → correct `logMeal` tool call (≈250 kcal,
4 P/30 C/12 F — slightly lean but plausible), entry landed in the tracker
under Also logged, dashboards updated.

- **MED (chat context design, seen on groq):** the reply summed today's
  _planned_ meals plus the croissant ("2,130 kcal — you're over target")
  while the tracker correctly showed 250/1,903 consumed. The chat context
  lists today's planned meals with macros and the model reads them as eaten.
  Deferred: label planned-vs-logged explicitly in `contextSummary`.
- **LOW (groq, chat):** answers arrive with raw markdown (`**bold**`) which
  the chat widget renders literally. Gemini tends to emit plain text.
  Deferred: strip markdown server-side or note "plain text only" in
  CHAT_SYSTEM_PROMPT.

### App bug found in passing (not AI)

- **MED (web, onboarding):** upgrading via the soft paywall at the END of
  free onboarding drops the user into the premium wizard at step 2 of 4 —
  the goal step (1) is skipped, and Finish then silently no-ops because
  `handleFinish` requires a non-null goal. Worked around by going Back to
  the goal step. Fix deferred: `onboarding-wizard.tsx` should return to
  step 1 after a mid-flow upgrade, or Finish should surface the missing
  goal instead of doing nothing.

### Provider comparison verdict

Gemini remains the right primary: vision quality and structured generation
were consistently strong. Groq gpt-oss-120b handled the chat tool loop
correctly on the first try and is a credible failover for text calls; its
8K TPM cap makes full week-plan failover unreliable (expected, documented in
§1), which is acceptable — the failover exists to keep the high-volume small
calls alive when Gemini's 20/day runs out.
