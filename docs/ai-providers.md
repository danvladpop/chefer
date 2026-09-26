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
  generated as 7 per-day calls with strict JSON schema, then assembled and validated. The
  meal-plan service applies macro reconciliation, the day-total retry and allergen enforcement to
  it exactly as it does for Gemini. Behind Gemini (the default), Groq keeps the single call.
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

Recipe images move separately, and need only the two Cloudflare values:

```env
IMAGE_PROVIDER=cloudflare
CF_ACCOUNT_ID=<account id>
CF_API_TOKEN=<token with the Workers AI permission>
```

The image bytes are stored on the `uploads` volume and served at `/uploads/recipes/*`.

**Rollback:** delete the line (or set the old chain) and recreate the container. Nothing is
stored per provider.

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

The table reports, per workload:

- schema-valid %;
- **allergen violations**: dishes containing one of the profile's allergies, checked by the
  production P1-2 matcher. **This must be 0**, and the command exits 1 when it is not;
- restriction violations (reported, not gated: a missing diet tag also counts);
- kcal and macro error against the target;
- p50 and p95 latency;
- tokens;
- per-workload checks (seven days, meal count, unique dishes, ingredient recall, coverage…).

**Gate to move on:**

- 0 allergen violations;
- schema-valid ≥ 98%;
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
