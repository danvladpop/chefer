# AI providers: routing, eval, shadow mode

How Chefer picks an AI provider per feature, and the runbook for moving a feature off Gemini.
The background and the provider comparison are in
[`docs/audit-2026-09/ai-provider-research.md`](audit-2026-09/ai-provider-research.md) §5. Code
lives in `apps/api/src/lib/ai/`; every env var is listed in `infrastructure.md` §10.

## Providers and workloads

Two live providers can be configured:

- **`gemini`** — `GeminiAIService`, available when `AI_PROVIDER=gemini` and `GEMINI_API_KEY` is set.
- **`groq`** — the OpenAI-compatible secondary (`AI_SECONDARY_BASE_URL`, `AI_SECONDARY_MODEL`,
  Groq's `openai/gpt-oss-120b` by default), available when `AI_SECONDARY_API_KEY` is set. Photo
  calls use `AI_VISION_MODEL` (`qwen/qwen3.8-27b`) on the same endpoint.

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
- **Video stays Gemini-only.** Video recipe extraction (`pnpm recipes:from-video`) is not a
  workload and cannot be routed: no OpenAI-compatible provider takes video input. The research
  doc (§5.3) describes the keyframes + Whisper pipeline that would replace it.
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
- The profile screen's AI-usage card still labels its totals "Gemini" (`profile.router.ts`
  `GEMINI_FREE_LIMITS`). This is cosmetic.
- **Rollback:** restore `AI_PROVIDER=gemini` and `GEMINI_API_KEY`, delete the `AI_ROUTE_*`
  lines, and recreate the container.

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
