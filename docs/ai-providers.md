# AI providers: routing, eval, shadow mode

How Chefer picks an AI provider per feature, and the runbook for moving a feature off Gemini.
The background and the provider comparison are in
[`docs/audit-2026-09/ai-provider-research.md`](audit-2026-09/ai-provider-research.md) §5. Code
lives in `apps/api/src/lib/ai/`; every env var is listed in `infrastructure.md` §10.

## Providers and workloads

Three live providers can be configured:

- **`gemini`** — `GeminiAIService`, available when `AI_PROVIDER=gemini` and `GEMINI_API_KEY` is set
  (never in free-only mode).
- **`groq`** — the OpenAI-compatible secondary (`AI_SECONDARY_BASE_URL`, `AI_SECONDARY_MODEL`,
  Groq's `openai/gpt-oss-120b` by default), available when `AI_SECONDARY_API_KEY` is set. Photo
  calls use `AI_VISION_MODEL` (`qwen/qwen3.8-27b`) on the same endpoint.
- **`cloudflare`** — Cloudflare Workers AI through the same OpenAI-compatible client
  (`CF_TEXT_MODEL`, `CF_VISION_MODEL`, `CF_ACCOUNT_ID` + `CF_API_TOKEN`). Built only when
  `AI_FREE_ONLY=true` or a route names `cloudflare`: the CF keys that serve recipe images change no
  text routing on their own. See [Free-only mode](#free-only-mode).

Every AI call belongs to a workload. Each workload has an ordered chain: the first provider serves
the call, and the next one retries it only on a capacity/quota error or an HTTP 413. Any other
error (a validation failure, a bad input) is returned straight away.

| Workload     | Calls                                       | Env var                | Default (= behaviour before this change) |
| ------------ | ------------------------------------------- | ---------------------- | ---------------------------------------- |
| `mealPlan`   | week plan (manual + Sunday auto-plan)       | `AI_ROUTE_MEAL_PLAN`   | `gemini>groq`                            |
| `swap`       | meal swap                                   | `AI_ROUTE_SWAP`        | `gemini>groq`                            |
| `cheferize`  | adapt an imported recipe                    | `AI_ROUTE_CHEFERIZE`   | `gemini>groq`                            |
| `importText` | recipe extraction from page or pasted text  | `AI_ROUTE_IMPORT_TEXT` | `gemini>groq`                            |
| `vision`     | meal-photo scan, photo recipe import        | `AI_ROUTE_VISION`      | `gemini`                                 |
| `chat`       | AI chef chat (with tools)                   | `AI_ROUTE_CHAT`        | `groq>gemini`                            |
| `review`     | weekly coach review prose                   | `AI_ROUTE_REVIEW`      | `gemini>groq`                            |
| `prices`     | ingredient price + macro estimates (worker) | `AI_ROUTE_PRICES`      | `groq>gemini`                            |
| `shopping`   | AI shopping-list consolidation              | `AI_ROUTE_SHOPPING`    | `groq>gemini`                            |

- A provider without a key is dropped from every chain. With no `AI_SECONDARY_API_KEY`, every
  workload is Gemini alone, as before. An override naming a missing provider logs a warning at
  startup.
- **No provider is sent video (2026-09-26).** Video links (in-app "Video" import and
  `pnpm recipes:from-video`) are read from their words — caption, subtitles, or a Groq Whisper
  transcript (`WHISPER_MODEL`) — and extracted as TEXT on the `importText` route, so
  `AI_ROUTE_IMPORT_TEXT` covers them. Gemini's video input is no longer used anywhere; see
  infrastructure.md §7 "VideoRecipeService".
- **Meal plans on Groq are chunked.** When `groq` leads `AI_ROUTE_MEAL_PLAN`, the week is
  generated as 7 sequential per-day calls with strict JSON schema, then assembled and validated.
  The meal-plan service applies macro reconciliation, the day-total retry and allergen enforcement
  to it exactly as it does for Gemini. Behind Gemini (the default), Groq keeps the single call.
  How a day is kept reliable:
  - **Reasoning effort `low`.** `openai/gpt-oss-120b` is a reasoning model. At its default effort
    ("medium") one day spent **~5,600 hidden reasoning tokens** before writing any JSON (measured
    2026-09-26). That used up the old 3,000-token budget, and Groq answered
    `400 json_validate_failed` with an empty `failed_generation`: the cause of every failed day
    in the first Groq eval. `AI_SECONDARY_REASONING_EFFORT` (default `auto`, which means `low`
    for gpt-oss) brings this down to ~300–2,600 reasoning tokens. The day budget is 4,000.
  - **Fallback ladder.** If strict mode still fails to generate a day (a `json_validate_failed`
    400, including truncation), that day is retried once in `json_object` mode, with 1.5× the
    budget when it was truncated. If the JSON is malformed or fails the Zod schema, the model gets
    one repair retry that shows it its rejected output and the error. Zod stays the gate
    throughout. The repair retry applies to every structured call, not only plans.
  - **Pacing.** Groq admits a request against its tokens-per-minute budget by **input +
    `max_tokens`**. A day was refused with "Requested 4967", which is ~950 input plus 4,000
    `max_tokens`. Before each day the client reads the last `x-ratelimit-*` headers and waits
    until that much fits. Each wait is at most 60 s. The total is 120 s per plan when a user is
    waiting, and 300 s for the Sunday auto-plan and the eval. On a paid tier the budget always
    fits, so it never waits.
- **429s.** Background calls wait out one 429 of up to 10 s (from `Retry-After`, or the body's
  "try again in Xs") and retry once. Background calls are prices, shopping list, coach review,
  anything outside a user request (workers) and shadow replays. Interactive calls fail over to
  the next provider straight away, as before. With Groq as the only provider there is no next
  provider, so the user gets the friendly "over capacity" message.
- **Photos on Groq:** JPEG, PNG, WebP and GIF are sent as base64 data URLs. HEIC moves to the next
  provider in the chain. Groq counts each image as 2,048 input tokens against its 8K
  tokens/minute free limit.

## Moving each workload to Groq (the exact env lines)

Set these in `.env.production` on the VM, then recreate the API container:

```bash
docker compose --env-file .env.production -f docker-compose.deploy.yml up -d api
```

Keeping Gemini as the failover (recommended while it is still paid for):

```env
AI_SECONDARY_API_KEY=<groq key>        # already set in prod
AI_ROUTE_REVIEW=groq>gemini
AI_ROUTE_SWAP=groq>gemini
AI_ROUTE_CHEFERIZE=groq>gemini
AI_ROUTE_IMPORT_TEXT=groq>gemini
AI_ROUTE_VISION=groq>gemini
AI_ROUTE_MEAL_PLAN=groq>gemini
# chat, prices and shopping already default to groq>gemini
```

Dropping Gemini entirely for a workload means a single-provider chain, for example
`AI_ROUTE_CHAT=groq`. Leave `AI_PROVIDER=gemini` set for as long as any chain still names
`gemini`, and for video.

## Running without Gemini

The exact `.env.production` AI block for running every in-app AI call on Groq. **Delete the
`GEMINI_API_KEY` line.** `AI_PROVIDER=openai` means "no Gemini", so the key is not required
(`apps/api/src/lib/env.test.ts` validates exactly these lines).

```env
AI_MOCK_ENABLED=false
AI_PROVIDER=openai
AI_SECONDARY_API_KEY=<groq key>
AI_SECONDARY_BASE_URL=https://api.groq.com/openai/v1
AI_SECONDARY_MODEL=openai/gpt-oss-120b
AI_SECONDARY_REASONING_EFFORT=low
AI_VISION_MODEL=qwen/qwen3.8-27b
AI_ROUTE_MEAL_PLAN=groq
AI_ROUTE_SWAP=groq
AI_ROUTE_CHEFERIZE=groq
AI_ROUTE_IMPORT_TEXT=groq
AI_ROUTE_VISION=groq
AI_ROUTE_CHAT=groq
AI_ROUTE_REVIEW=groq
AI_ROUTE_PRICES=groq
AI_ROUTE_SHOPPING=groq
AI_SHADOW_ROUTE=
AI_SHADOW_SAMPLE=0
```

- With only one provider configured, every `AI_ROUTE_*` resolves to `groq` even when unset. The
  explicit lines document the intent. The meal plan is chunked because `groq` leads its route.
- At startup the API logs `[AI] Using OpenAICompatibleAIService (api.groq.com/openai/gpt-oss-120b) standalone`.
- **What stops working:**
  - Video recipe extraction (`pnpm recipes:from-video`, dataset tooling only, not an in-app
    feature). It is Gemini-only; run it with `GEMINI_API_KEY` set in the shell.
  - There is no failover. A Groq outage or rate limit reaches users as the friendly
    "over capacity" message.
- The admin AI-usage card on the web profile names the provider serving most workloads
  (`profile.getAiUsage` `primaryProvider`).
- **Rollback:** restore `AI_PROVIDER=gemini` and `GEMINI_API_KEY`, delete the `AI_ROUTE_*`
  lines, and recreate the container.

## Free-only mode

**Owner decision (2026-09-26):** all AI must be free — no card, nothing paid — and Gemini is off
every in-app path, because its free tier is not offered to EEA users. `AI_FREE_ONLY=true` runs every
workload on **Groq's free tier first, then Cloudflare Workers AI's free plan**:

- Every workload, vision included, defaults to `groq>cloudflare` (`FREE_ONLY_AI_ROUTES` in
  `routing.ts`). Each provider uses its own vision model.
- Gemini is never built, `GEMINI_API_KEY` is not required, and the API **refuses to start** if any
  `AI_ROUTE_*` or `AI_SHADOW_ROUTE` line still names `gemini` (`env.test.ts` validates the lines
  below).
- The consent sheet, the Profile "AI & your data" switch, the web privacy page and the support FAQ
  name **Groq and Cloudflare Workers AI** automatically. They read `profile.aiProviders`, which is
  derived from the live route table, so the copy cannot drift from the config.
- Unset (the default), nothing changes: prod stays on `gemini>groq` until the switch is flipped.

### The exact `.env.production` lines

Add or set:

```env
AI_MOCK_ENABLED=false
AI_FREE_ONLY=true
AI_SECONDARY_API_KEY=<groq key>                  # already set in prod
AI_SECONDARY_BASE_URL=https://api.groq.com/openai/v1
AI_SECONDARY_MODEL=openai/gpt-oss-120b
AI_SECONDARY_REASONING_EFFORT=auto               # = low for gpt-oss
AI_VISION_MODEL=qwen/qwen3.8-27b
CF_ACCOUNT_ID=<cloudflare account id>            # already set if IMAGE_PROVIDER=cloudflare
CF_API_TOKEN=<token with Workers AI Read + Edit>
CF_TEXT_MODEL=@cf/openai/gpt-oss-120b
CF_VISION_MODEL=@cf/google/gemma-4-26b-a4b-it
CF_TEXT_NEURON_BUDGET=8000
```

**Delete:** the `GEMINI_API_KEY` line, and every `AI_ROUTE_*` / `AI_SHADOW_ROUTE` line that names
`gemini` (or all of them — unset means `groq>cloudflare`). `AI_PROVIDER` may stay as it is; it is
ignored in free-only mode. Then recreate the API container:

```bash
docker compose --env-file .env.production -f docker-compose.deploy.yml up -d api
```

At startup the API logs `[AI] free-only mode: groq, cloudflare (Cloudflare text budget 8000
neurons/day)` and `[AI] Provider chains: mealPlan=groq>cloudflare …`. Signed out,
`/trpc/profile.aiProviders` answers `{"primary":"groq","backups":["cloudflare"]}`.

**Rollback:** set `AI_FREE_ONLY=false` (or delete it), restore `GEMINI_API_KEY`, recreate the
container. The copy switches back to Gemini on the next request.

### How Cloudflare is called (verified 2026-09-26)

- **Endpoint:** `POST https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/v1/chat/completions`
  with `Authorization: Bearer {CF_API_TOKEN}` (Workers AI "OpenAI compatibility" page). Live probe:
  200 OK.
- **`response_format`:** the model schema accepts `json_object` and `json_schema`; both returned
  valid JSON in the probe. Strict per-day plan chunks use `json_schema` as on Groq.
- **`reasoning_effort`:** not in the published gpt-oss-120b input schema, but honoured by the
  endpoint: the same prompt cost 57 completion tokens at `low` and 186 without it. Sent as `low`
  (`AI_SECONDARY_REASONING_EFFORT=auto`).
- **Cost reporting:** every response carries `usage.neurons` and a `cf-ai-neurons` header. The
  probe (92 in / 57 out) reported 6.81 neurons — exactly the pricing-page rates
  (31,818 / 68,182 per M). The budget counts the reported value; the rate table
  (`CF_NEURON_RATES`) is only a fallback.
- **Vision:** `@cf/google/gemma-4-26b-a4b-it` takes `image_url` parts with base64 data URLs on the
  same endpoint (probe: a test PNG read correctly, 294 in / 10 out = 2.95 neurons). Gemma 4 thinks
  by default, so photo calls send `chat_template_kwargs: { enable_thinking: false }`.
  **Not Llama 3.2 11B Vision:** it needs a Meta licence "agree" call, and the Llama 3.2 and Llama 4
  acceptable-use policies withhold the multimodal models from EU-domiciled individuals and
  companies — the same kind of EEA problem as Gemini. Gemma 4 is Apache 2.0.
- **Errors:** the free plan answers **429, code 3036** ("You have used up your daily free allocation
  of 10,000 neurons") and 429, code 3040 when out of capacity; both are capacity errors, so the chain
  fails over or the user gets the friendly message. The free plan never bills.
- **Plans on Cloudflare are always chunked** (7 strict per-day calls), even as the failover:
  Workers AI has no per-minute token cap and a 128K context, and a single 7-day call would outgrow
  its output budget.

### Neuron budget

- Text and recipe images share Cloudflare's 10,000 free neurons per UTC day. The API keeps one
  in-memory ledger per UTC day for both. Text stops at `CF_TEXT_NEURON_BUDGET` (8,000): the next
  text call throws a 429 capacity error without calling Cloudflare. Images keep the rest.
- Each call logs `"neurons"` and `"neuronsToday"` on its `[ai.usage]` line.
- **A restart resets the count** (in memory, per UTC day). After a restart text may spend up to the
  budget again. Cloudflare's own hard cap still holds: past 10K it fails, it never bills.
- **Images, corrected estimate:** flux-1-schnell costs 4.80 neurons per 512×512 tile **plus 9.60 per
  step**. The client sends 4 steps, so a 1024×1024 image is ~58 neurons. The ~2K neurons left for
  images is therefore **~35 images a day**, not ~400 (the per-step cost dominates). _Estimate:_ the
  image size is not pinned in the request; images log their real `cf-ai-neurons` when present.

### Capacity per day (free tiers)

| Source                                        | Limit                                     | Status                                               |
| --------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Groq gpt-oss-120b / gpt-oss-20b / qwen3.8-27b | 30 RPM, 1K RPD, 8K TPM, 200K TPD each     | verified (Groq rate-limit page)                      |
| Groq buckets per model?                       | "limits apply at the organization level"  | **unverified** whether each model has its own bucket |
| Cloudflare Workers AI                         | 10,000 neurons/day, then 429 (not billed) | verified                                             |

Per day, per workload (**measured** = from the 2026-09-26 eval, `apps/api/eval/results/free-chain-2026-09-26.txt`):

| Workload (one call / one plan) | Groq cost                        | Groq free/day (200K TPD)     | Cloudflare cost                      | Cloudflare/day (8K text budget) |
| ------------------------------ | -------------------------------- | ---------------------------- | ------------------------------------ | ------------------------------- |
| Meal plan (7 day-chunks)       | ~24–25K tokens (measured)        | ~8 (estimate)                | **~1,870 neurons, 409 s** (measured) | **~4** (estimate)               |
| Swap                           | ~720 tokens (measured)           | ~275 (estimate)              | 35 neurons (measured)                | ~230                            |
| Cheferize / text import        | ~1.2K tokens (measured)          | ~165 (estimate)              | 60–65 neurons (measured)             | ~125                            |
| Photo scan                     | ~2.2K tokens (measured)          | 1K RPD / ~7K input TPM binds | 7 neurons on Gemma 4 (measured)      | ~1,100                          |
| Chat turn (tools)              | ~2K tokens (estimate)            | ~100 (estimate)              | ~80 neurons (estimate)               | ~100                            |
| Price batch (40 ingredients)   | ~1.5K tokens (measured, 1 batch) | ~130 (estimate)              | 140 neurons, 35 s (measured)         | ~55                             |
| Recipe image (flux-1-schnell)  | —                                | —                            | ~58 neurons (estimate)               | ~35 in the 2K image share       |

- **Estimates, not measurements, unless marked "measured".** Groq's figure is the 200K tokens/day
  divided by ~25K per plan. Cloudflare's per-workload figures come from the measured
  neurons in the eval below where available, else from the rate table and typical prompt sizes.
- The rows are alternatives, not a sum: every workload draws from the same Groq 200K tokens/day
  (if the per-model buckets are shared) and the same Cloudflare 8K neurons.
- **What this means:** roughly **8 plans a day on Groq plus ~4 on Cloudflare**, for the whole
  organisation, before plans run out — fewer when other features run. It is enough for development
  and a small group of testers, not for launch traffic.
- **A Cloudflare plan is slow: ~7 minutes** (409 s measured; 35–70 s per day, sequential). As the
  failover for a user who is waiting, that follows whatever time Groq already spent. It works (no
  server timeout cuts it), but the wait is poor. Background plans (the Sunday auto-plan) do not
  mind. A follow-up could run Cloudflare's days in parallel waves (it has no per-minute token cap),
  at some risk of repeated dishes within a wave; it is not done here.

### Cheaper model for the simple workloads (optional, off)

`AI_SECONDARY_FAST_MODEL=openai/gpt-oss-20b` (Groq) and `CF_FAST_MODEL=@cf/openai/gpt-oss-20b`
(Cloudflare) move **ingredient prices, the shopping-list tidy-up and the weekly review prose** to the
smaller model. Chat stays on the main model because its tools write data.

- **Why it might help:** if Groq counts each model against its own 200K tokens/day, these
  background workloads stop eating the meal-plan budget. On Cloudflare, gpt-oss-20b costs about 40 %
  of gpt-oss-120b's neurons per output token.
- **Why it is off:** Groq says limits apply at the organisation level, and whether each model has
  its own bucket is unverified. The tasks are simple (flat JSON, one paragraph), but the eval has
  not scored gpt-oss-20b on them yet. Turn it on after `pnpm ai:eval --route=prices,shopping,review`
  passes with `AI_SECONDARY_MODEL=openai/gpt-oss-20b`, and check in the Groq console whether the
  120b daily counter stops moving when those workloads run.

### What users see when capacity runs out

- **Interactive calls** (plan, swap, import, scan, chat, shopping list, nutrition estimate): the chain
  fails over from Groq to Cloudflare. When both are out, the user sees **"The chef is over capacity
  right now — give it a minute and try again."** Never a raw provider error. Chat on mobile shows the
  same sentence (HTTP 503 with that `error`).
- **Quota refunds:** plans, swaps, recipe imports (link, text, photo, video) and ingredient
  estimates are refunded on any failure. Chat messages and meal scans are refunded on a capacity
  failure (other failed attempts still count, as before).
- **Background jobs:** the Sunday auto-plan stops asking for premium plans for the rest of the tick
  and retries them on the next hourly tick (they still have no plan for next week). The
  ingredient-price worker backs off 90 s, then doubles up to 1 h. The weekly review falls back to
  its template text. Nothing retries in a tight loop.
- **Daily reset:** Groq's daily window and Cloudflare's UTC day reset on their own. Nothing needs
  a restart.

### Free-chain eval (2026-09-26)

Raw output: `apps/api/eval/results/free-chain-2026-09-26.txt`. Calls used: 38 Groq, 19 Cloudflare
(15 eval + 4 endpoint probes).

`pnpm ai:eval --route=all --provider=groq>cloudflare --limit=2 --delay-ms=3000` (Groq served every
case, so this measures Groq inside the chain):

| workload   | cases | errors | schema | allergen | kcal err | macro err | p50 ms | p95 ms  | gate |
| ---------- | ----- | ------ | ------ | -------- | -------- | --------- | ------ | ------- | ---- |
| mealPlan   | 2     | 1      | 50%    | 0        | 2.7%     | 13.4%     | 75,794 | 135,218 | FAIL |
| swap       | 2     | 0      | 100%   | 0        | —        | —         | 1,027  | 1,389   | PASS |
| cheferize  | 2     | 0      | 100%   | 0        | —        | —         | 1,081  | 1,428   | PASS |
| importText | 2     | 0      | 100%   | 0        | 0%       | —         | 3,791  | 7,243   | PASS |
| vision     | 2     | 0      | 100%   | 0        | —        | —         | 681    | 952     | PASS |
| review     | 2     | 0      | 100%   | 0        | —        | —         | 485    | 740     | PASS |
| prices     | 2     | 0      | 100%   | 0        | 13.7%    | —         | 2,052  | 2,146   | PASS |
| shopping   | 2     | 0      | 100%   | 0        | —        | —         | 563    | 9,120   | PASS |

The mealPlan error was a bug, now fixed (`d4bff59`): Groq rejected a strict day with "Generated
JSON does not match the expected schema", and because the logged error text is cut at 300
characters the `json_validate_failed` code was missing, so the day skipped its `json_object` retry.
It was not re-run, to stay inside the call budget; a unit test pins the fix.

`pnpm ai:eval --route=all --provider=cloudflare --limit=1 --delay-ms=1000` (Cloudflare alone):

| workload   | cases | errors | schema | allergen | kcal err | macro err | ms      | neurons | gate |
| ---------- | ----- | ------ | ------ | -------- | -------- | --------- | ------- | ------- | ---- |
| mealPlan   | 1     | 0      | 100%   | 0        | 8.8%     | 10.9%     | 409,241 | 1,870   | PASS |
| swap       | 1     | 0      | 100%   | 0        | —        | —         | 6,840   | 35      | PASS |
| cheferize  | 1     | 0      | 100%   | 0        | —        | —         | 11,162  | 65      | PASS |
| importText | 1     | 0      | 100%   | 0        | 0%       | —         | 13,143  | 60      | PASS |
| vision     | 1     | 0      | 100%   | 0        | —        | —         | 840     | 7       | PASS |
| review     | 1     | 0      | 100%   | 0        | —        | —         | 3,296   | 26      | PASS |
| prices     | 1     | 0      | 100%   | 0        | 10.7%    | —         | 35,261  | 140     | PASS |
| shopping   | 1     | 0      | 100%   | 0        | —        | —         | 5,386   | 30      | PASS |

Total 2,231 neurons. One plan day came back truncated and was fixed by the repair retry. One case
per workload is a plumbing and cost check, not a quality verdict. Chat was not evaluated (its tools
write data), so tool calling on Workers AI is **unverified**.

## Groq limits and production capacity

Limits for the models Chefer uses, from Groq's rate-limit page
(<https://console.groq.com/docs/rate-limits>, fetched 2026-09-26). The limits are per
organisation, so every user, worker and eval run shares them.

| Model (free plan)     | Requests/min | Requests/day | Tokens/min | Tokens/day |
| --------------------- | ------------ | ------------ | ---------- | ---------- |
| `openai/gpt-oss-120b` | 30           | 1K           | 8K         | 200K       |
| `qwen/qwen3.8-27b`    | 30           | 1K           | 8K         | 200K       |

The page also says some organisations get separate input and output token limits per minute. Our
vision calls hit such a limit: "input tokens per minute (ITPM): Limit 7000" on
`qwen/qwen3.8-27b`, in the 2026-09-26 eval.

**Measured cost of one meal plan on Groq** (eval of 2026-09-26, `reasoning_effort=low`, see
`apps/api/eval/results/groq-2026-09-26.txt`):

- **~25K tokens per plan.** The two plans used 24,320 and 25,396 tokens: ~6.9K prompt and ~18K output each. The output includes ~9–10K hidden reasoning tokens.
- Per day: ~900–1,050 prompt tokens and 900–4,000 output tokens. 270–3,600 of the output tokens
  are hidden reasoning, and this varies a lot from day to day.
- Groq admits each day by prompt + `max_tokens`, so a day needs ~5,000 tokens of free budget to
  start.
- The meal-plan service may ask for a whole second plan when day totals miss the target (the
  calorie-correction retry). That doubles the cost of that plan.

**What the free tier means in production:**

- **Per minute (8K tokens):**
  - Sustained, at most **one plan every ~3 minutes** for the whole organisation, with nothing
    else running.
  - One plan alone took **142 s and 223 s** of wall time (100 s and 169 s of that was pacing).
    The second plan started on a budget the first had drained.
  - A second user asking for a plan in the same minute waits behind the first. Past the 120 s
    interactive wait budget, they get the "over capacity" message.
  - Each photo scan is about 2,400 input tokens, so the ~7K input-token limit allows about 2–3
    scans per minute.
- **Per day (200K tokens):** roughly **8 plans a day** in total, or 4 when the correction retry
  runs, before every other feature is refused until the window resets. Requests (1K/day) are not
  the binding limit.
- **Conclusion:** the free tier is fine for development, the eval (with `--limit`) and a handful
  of testers. **It cannot carry launch traffic for meal plans.**

**Recommendation: move to Groq's paid Developer plan before launch.**

- The rate-limit page says its tables are "the base limits for the Developer plan" and that
  higher limits are available.
- **Unverified:** the page as fetched showed only the free-plan table, so the Developer plan's
  per-model numbers could not be confirmed. Read them in the Groq console (Settings → Limits)
  after upgrading, and redo the capacity maths above with them.
- The pacing code reads the real budget from the `x-ratelimit-*` headers. On a higher tier it
  stops waiting without any config change.
- Price (verified on <https://console.groq.com/docs/model/openai/gpt-oss-120b>, 2026-09-26):
  `gpt-oss-120b` costs $0.15 per 1M input tokens and $0.60 per 1M output tokens. That is **≈ $0.012 per plan**, or about $12 per 1,000 plans. It is roughly double for a plan that triggers the calorie-correction retry.

Recipe images move separately, and need only the two Cloudflare values:

```env
IMAGE_PROVIDER=cloudflare
CF_ACCOUNT_ID=<account id>
CF_API_TOKEN=<token with the Workers AI permission>
```

The image bytes are stored on the `uploads` volume and served at `/uploads/recipes/*`.

**Rollback:** delete the line (or set the old chain) and recreate the container. Nothing is
stored per provider.

## Latest Groq eval (2026-09-26)

This run used `pnpm ai:eval --route=all --provider=groq --limit=2 --delay-ms=3000` on the free
tier. The raw output and JSON are in `apps/api/eval/results/groq-2026-09-26.txt`.

| workload   | cases | errors | schema | allergen | kcal err | macro err | p50 ms  | p95 ms  | gate |
| ---------- | ----- | ------ | ------ | -------- | -------- | --------- | ------- | ------- | ---- |
| mealPlan   | 2     | 0      | 100%   | 1        | 7.8%     | 20.2%     | 141,664 | 223,255 | FAIL |
| swap       | 2     | 0      | 100%   | 0        | —        | —         | 1,064   | 1,406   | PASS |
| cheferize  | 2     | 0      | 100%   | 1        | —        | —         | 1,038   | 1,373   | FAIL |
| importText | 2     | 0      | 100%   | 0        | 0%       | —         | 1,023   | 1,579   | PASS |
| vision     | 2     | 0      | 100%   | 0        | —        | —         | 491     | 540     | PASS |
| review     | 2     | 0      | 100%   | 0        | —        | —         | 359     | 775     | PASS |
| prices     | 2     | 0      | 100%   | 0        | 13.7%    | —         | 2,517   | 7,382   | PASS |
| shopping   | 2     | 0      | 100%   | 0        | —        | —         | 821     | 5,895   | PASS |

The first Groq run, before this fix, had 20/20 plan errors and 429s everywhere, yet the gate
said PASS. In this run:

- Every case produced schema-valid output.
- One plan day fell back from strict mode to `json_object` and succeeded.
- One 429 on prices and one on shopping were waited out and retried.

**Two allergen violations failed the gate:**

- one dish in the peanut-allergy plan;
- the pad-thai cheferize case (peanut + shellfish). The same case was clean when re-run once.

This run did not record which dish failed. The scorer now does (`allergenDetails`, shown on the
case line). These are raw model outputs: production still re-checks every plan dish
(`enforcePlanSafety` swaps unsafe slots) and every cheferized recipe with the same matcher. But
the rollout gate asks for 0, and 2 cases per workload is far too small a sample to call Groq
safe.

## Runbook: switching a workload off Gemini

The rollout order, lowest risk first (research §5.4 step 4): images → chat, shopping, prices,
review → swap, cheferize, text import → vision → meal plan last. Each workload goes through three
steps.

### 1. Run the eval

Run the golden set in `apps/api/eval/golden` against the candidate and against today's provider.
This calls the real providers and **costs money**; use `--limit` for a first look.

```bash
cd apps/api   # reads apps/api/.env if present; shell variables win
GEMINI_API_KEY=… pnpm ai:eval --route=swap --provider=gemini --out=eval-swap-gemini.json
AI_SECONDARY_API_KEY=… pnpm ai:eval --route=swap --provider=groq --out=eval-swap-groq.json
# plumbing check, no keys and no cost:
pnpm ai:eval --route=all --provider=mock
```

On Groq's free tier, pace the run and cap it. A full `--route=all` run needs ~170 calls. The 20
plans alone need more tokens than the free tier's 200K per day.

```bash
AI_SECONDARY_API_KEY=… pnpm ai:eval --route=all --provider=groq --limit=2 --delay-ms=3000
```

Rate-limit flags:

- `--delay-ms` pauses between cases.
- `--concurrency` sets how many cases run at once (default 1).
- A 429 is waited out (`Retry-After`, or "try again in Xs", up to 60 s) and the case is retried,
  twice at most. A longer wait, such as a daily quota, counts as an error.
- Plans also pace themselves inside the client (see above).

The table reports, per workload:

- schema-valid %;
- **allergen violations**: dishes containing one of the profile's allergies, checked by the
  production P1-2 matcher. **This must be 0**;
- restriction violations (reported, not gated: a missing diet tag also counts);
- kcal and macro error against the target;
- p50 and p95 latency;
- tokens;
- per-workload checks (seven days, meal count, unique dishes, ingredient recall, coverage…).

**The command's own gate** (exit code 1, with the reasons printed under the table) fails a
workload when any of these is true:

- **any case errored**, because a provider that cannot answer is not ready. Before 2026-09-26 a
  run with 20/20 errors reported PASS;
- there is any allergen violation;
- schema-valid is below `--min-schema`, which defaults to 95;
- no case ran.

**Gate to move on:**

- 0 allergen violations;
- schema-valid ≥ 98% (run with `--min-schema=98`);
- kcal and macro error no more than 5 points worse than Gemini's run;
- p95 latency acceptable for the screen: the meal plan already takes 30–60 s on Gemini.

Chat is not evaluated offline, because its tools write data. The mock provider ignores
allergies, so `--provider=mock` fails the gate by design.

### 2. Shadow it for a week

```env
AI_SHADOW_ROUTE=swap:groq
AI_SHADOW_SAMPLE=0.1
```

What shadow mode does:

- It replays 10% of calls on the candidate chain in the background, after the user already has
  Gemini's answer, then discards the candidate's output.
- It only replays premium users' own requests. Free users' calls, background jobs (Sunday
  auto-plan, coach sweep, price worker) and chat are never shadowed.
- It only replays for users with AI data consent. The consent column arrives with PR #45; until
  `lib/ai/consent.ts` is wired to it (a TODO with the exact code), **shadow mode never runs**.
- At most 2 replays run at once.
- Several workloads can be shadowed together: `AI_SHADOW_ROUTE=swap:groq,review:groq`.

Read the results from the API logs. Each sampled call writes one `[ai.shadow]` line with scores
for the served and the candidate output. The candidate's model calls also write `[ai.usage]` lines
tagged `"shadow":true`.

```bash
docker logs --since 168h chefer-api 2>&1 | grep '\[ai.shadow\]' | sed 's/^.*\[ai.shadow\] //' \
  | jq -s 'group_by(.workload) | map({workload: .[0].workload, n: length,
      candidateOk: (map(select(.candidate.ok)) | length),
      candidateAllergen: (map(.candidate.scores.allergenViolations // 0) | add),
      servedAllergen: (map(.primary.scores.allergenViolations // 0) | add),
      candidateMs: (map(.candidate.ms) | add / length),
      servedMs: (map(.primary.ms) | add / length)})'
```

**Gate:** a clean week, meaning:

- no candidate allergen violations;
- candidate `ok` ≥ 98%;
- schema-valid on par with the served provider;
- no latency regression that users would notice.

### 3. Flip the route

Set the workload's `AI_ROUTE_*` line from the list above, recreate the API container, and remove
it from `AI_SHADOW_ROUTE`. Watch the `[AI] <op>: served by …` and `[ai.usage]` lines for a day.
Roll back by deleting the line.

## Golden set

Everything the eval needs is in `apps/api/eval/golden/`. Nothing is fetched live.

| File                             | Contents                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles.json`                  | 20 preference profiles: allergies (incl. multi-allergy and coeliac), diets, € budgets, households of 2–4, a lifter with training days. Also used for the swap cases              |
| `imports.json` + `imports/*.txt` | 8 recipe pages stored as text, with expectations: name words, key ingredients, kcal per serving, servings. Includes a JSON-LD page, a handwritten card and a page with no recipe |
| `cheferize.json`                 | 5 recipes paired with allergy and diet preferences                                                                                                                               |
| `photos.json` + `photos/`        | Meal photos with labels                                                                                                                                                          |
| `prices.json`                    | 20 ingredients in 2 batches, with reference kcal per 100 g                                                                                                                       |
| `shopping.json`, `reviews.json`  | Shopping-list and coach-review inputs                                                                                                                                            |

**Photos still to add.** The three committed images are generated in-repo and show no food. They
test the vision plumbing and the prompt's "Not a meal" honesty rule.

Real labelled meal photos need the owner to pick and add them. Each one needs:

- public domain or CC0, for example from Wikimedia Commons or USDA ARS;
- a size of 200 KB or less;
- an entry in `photos.json` with `source`, `licence` and `expected.kcal` (and optionally
  `dishIncludes`).

The loader validates every file, and `runner.test.ts` checks that the set loads.
