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

## 2. Live-quality spot-check findings (W3-B)

_Pending — runs after the failover deploys and the Groq key lands in prod._
