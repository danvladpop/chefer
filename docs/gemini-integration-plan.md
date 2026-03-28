# Gemini Flash Integration Plan — AI Meal Plan Generation

**Date:** 2026-03-28
**Author:** Claude Code
**Scope:** Replace the mocked `generateMealPlan` / `generateRecipeSwap` with a real Gemini Flash AI provider, while keeping the architecture provider-agnostic.

---

## 1. Free Tier Confirmation

**✅ Gemini Flash is free.**

| Model                             | RPM | RPD   | TPM     |
| --------------------------------- | --- | ----- | ------- |
| `gemini-2.5-flash` ✅ recommended | 10  | 250   | 250,000 |
| `gemini-2.5-flash-lite`           | 15  | 1,000 | 250,000 |

> **Note:** `gemini-2.0-flash` was deprecated March 3, 2026 (shutdown September 2026) — do not use it for new work. Use `gemini-2.5-flash`.

**How to get an API key:** Sign in at [aistudio.google.com](https://aistudio.google.com) → Create project → Generate API key. No credit card required.

**Free tier caveats:**

- Prompts and responses **are used by Google to improve their products**. If this becomes a concern (e.g. real user health data in production), switch to the paid Tier 1 (pay-as-you-go) which explicitly opts out.
- Free tier is **unavailable in the EU, EEA, UK, and Switzerland** due to GDPR.
- No batch API or context caching on the free tier.
- The 250 RPD limit is the practical ceiling for small-scale use. At 1 plan/user/week this supports ~35 active users per day before hitting the daily limit.

**Correct npm package:** `@google/genai` (the new unified SDK, GA since May 2025).
⚠️ Do **not** use `@google/generative-ai` — it is officially deprecated and archived (December 2025).

---

## 2. Current Architecture Overview

The AI layer is already cleanly abstracted. Key files:

```
apps/api/src/lib/ai/
├── types.ts          ← IAIService interface + all shared types (DO NOT CHANGE)
├── mock.ts           ← MockAIService (fixture data, keep as-is)
├── openai.ts         ← LiveAIService stub (rename/repurpose later)
├── index.ts          ← Factory: reads AI_MOCK_ENABLED + AI_PROVIDER env vars
└── prompts.ts        ← System prompts and user prompt builders (improve)
```

The `IAIService` interface in `types.ts` is the **only contract** the rest of the application knows about:

```typescript
export interface IAIService {
  generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse>;
  generateRecipeSwap(input: SwapInput): Promise<RecipeData>;
  chat(messages: ChatMessage[], context: ChatContext): Promise<ReadableStream>;
}
```

Any provider (Gemini, OpenAI, Anthropic, Mistral, etc.) is just an implementation of this interface — nothing else in the codebase changes when you switch providers.

---

## 3. Target Architecture

```
apps/api/src/lib/ai/
├── types.ts          ← unchanged
├── mock.ts           ← unchanged
├── openai.ts         ← kept for future use (already stubbed)
├── gemini.ts         ← NEW: GeminiAIService implements IAIService
├── index.ts          ← UPDATED: factory adds 'gemini' branch
└── prompts.ts        ← IMPROVED: richer prompts + swap-context enhancements
```

**Switching providers** in the future = create a new `<provider>.ts` file implementing `IAIService`, add a branch in `index.ts`, add the corresponding env var. Zero changes to routers, services, or the frontend.

---

## 4. Step-by-Step Implementation Plan

### Step 1 — Install the SDK

```bash
pnpm --filter @chefer/api add @google/genai
```

No other packages needed. `@google/genai` ships its own TypeScript types.

### Step 2 — Update `env.ts`

Add `'gemini'` to the `AI_PROVIDER` enum and the new `GEMINI_API_KEY` field:

```typescript
// apps/api/src/lib/env.ts  (diff)

  AI_PROVIDER: z.enum(['openai', 'anthropic', 'gemini']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
+ GEMINI_API_KEY: z.string().optional(),
```

Add a startup guard so the app fails fast if Gemini is selected without a key:

```typescript
// inside validateEnv(), after parsing:
if (parsed.data.AI_PROVIDER === 'gemini' && !parsed.data.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
}
```

Update `.env.example`:

```dotenv
# AI provider — options: openai | anthropic | gemini
AI_PROVIDER=gemini
AI_MOCK_ENABLED=false

# Gemini (free tier via Google AI Studio — https://aistudio.google.com)
GEMINI_API_KEY=your_key_here
```

### Step 3 — Update `index.ts` (factory)

```typescript
// apps/api/src/lib/ai/index.ts

import { env } from '../env.js';
import { GeminiAIService } from './gemini.js'; // NEW
import { MockAIService } from './mock.js';
import { LiveAIService } from './openai.js'; // kept for future use

import type { IAIService } from './types.js';

function createAIService(): IAIService {
  if (env.AI_MOCK_ENABLED) {
    console.info('[AI] Using MockAIService (fixture data)');
    return new MockAIService();
  }

  switch (env.AI_PROVIDER) {
    case 'gemini':
      console.info('[AI] Using GeminiAIService (gemini-2.5-flash)');
      return new GeminiAIService(env.GEMINI_API_KEY!);

    case 'anthropic':
      console.info('[AI] Using LiveAIService (Anthropic) — not yet implemented');
      return new LiveAIService(env.ANTHROPIC_API_KEY ?? '');

    case 'openai':
    default:
      console.info('[AI] Using LiveAIService (OpenAI) — not yet implemented');
      return new LiveAIService(env.OPENAI_API_KEY ?? '');
  }
}

export const aiService: IAIService = createAIService();
```

### Step 4 — Improve `prompts.ts`

The existing prompts are functional but need improvement for real LLM usage. With Gemini's structured output mode (JSON schema enforcement), we don't need to ask for JSON in the prompt — Gemini guarantees it. The prompt can focus purely on the culinary/nutritional task:

```typescript
// apps/api/src/lib/ai/prompts.ts  (replacement)

import type { MealPlanInput, SwapInput } from './types.js';

export const MEAL_PLAN_SYSTEM_PROMPT = `\
You are Chefer, an expert nutritionist and personal chef.
Your job is to design complete, realistic 7-day meal plans tailored to a person's goals, \
body metrics, dietary needs, and cuisine tastes.

Rules you must follow absolutely:
- NEVER include ingredients the user is allergic to — this is a safety requirement.
- NEVER include ingredients the user dislikes.
- Honour every dietary restriction (vegan, gluten-free, halal, etc.) without exception.
- Each recipe must have accurate, realistic nutritional information.
- Spread calories across the day according to meal type: \
  breakfast 20–25%, lunch 30–35%, dinner 35–40%, snack 10–15%.
- Ensure variety: no recipe name should repeat across the 7 days.
- Adapt portion sizes to the serving size multiplier provided.
- Prefer the user's listed cuisines while ensuring the week stays nutritionally balanced.
- Every recipe must be practical to prepare at home (real ingredients, real techniques).
- prepTimeMins and cookTimeMins must be realistic for the dish.
- Leave imageUrl as null — it will be filled in separately.
- Generate a stable, deterministic id for each recipe using the format: \
  "recipe_<slug_of_name>" (e.g. "recipe_grilled_salmon_bowl").`;

export function buildMealPlanUserPrompt(input: MealPlanInput): string {
  const goalLabel: Record<string, string> = {
    LOSE_WEIGHT: 'lose weight (caloric deficit, high protein, low refined carbs)',
    MAINTAIN: 'maintain current weight (balanced macros)',
    GAIN_MUSCLE: 'gain muscle (caloric surplus, very high protein)',
    EAT_HEALTHIER: 'eat healthier (whole foods, micronutrient-rich, minimally processed)',
  };

  const activityLabel: Record<string, string> = {
    SEDENTARY: 'sedentary (desk job, little or no exercise)',
    LIGHTLY_ACTIVE: 'lightly active (light exercise 1–3 days/week)',
    MODERATELY_ACTIVE: 'moderately active (moderate exercise 3–5 days/week)',
    VERY_ACTIVE: 'very active (hard exercise 6–7 days/week)',
    ATHLETE: 'athlete (twice-daily training or physical job)',
  };

  const mealTypes = ['breakfast', 'lunch', 'dinner'];
  if (input.mealsPerDay >= 4) mealTypes.push('snack');

  return `\
Create a personalised 7-day meal plan for this person:

PROFILE
  Goal:            ${goalLabel[input.goal] ?? input.goal}
  Sex:             ${input.biologicalSex}
  Age:             ${input.age} years
  Height:          ${input.heightCm} cm
  Weight:          ${input.weightKg} kg
  Activity level:  ${activityLabel[input.activityLevel] ?? input.activityLevel}

NUTRITION TARGETS
  Daily calories:  ${input.dailyCalorieTarget} kcal
  Meals per day:   ${input.mealsPerDay} (${mealTypes.join(', ')})
  Serving size:    ${input.servingSize} ${input.servingSize === 1 ? 'person' : 'people'}

DIETARY CONSTRAINTS (non-negotiable)
  Allergies:             ${input.allergies.length ? input.allergies.join(', ') : 'none'}
  Dietary restrictions:  ${input.dietaryRestrictions.length ? input.dietaryRestrictions.join(', ') : 'none'}
  Disliked ingredients:  ${input.dislikedIngredients.length ? input.dislikedIngredients.join(', ') : 'none'}

PREFERENCES
  Preferred cuisines: ${input.cuisinePreferences.length ? input.cuisinePreferences.join(', ') : 'no preference — vary widely'}

Generate all 7 days (dayOfWeek 0 = Monday … 6 = Sunday). \
Each day must have exactly ${input.mealsPerDay} meal(s): ${mealTypes.join(', ')}. \
Total daily calories across all meals should sum to approximately ${input.dailyCalorieTarget} kcal ± 100 kcal.`;
}

export const SWAP_SYSTEM_PROMPT = `\
You are Chefer, an expert nutritionist and personal chef.
When swapping a recipe, provide a single alternative that:
- Is a different dish (different name, different primary ingredients)
- Has a similar calorie count (±150 kcal) and macro profile
- Fits the same meal type
- Strictly respects all dietary restrictions and allergies
- Leaves imageUrl as null`;

export function buildSwapUserPrompt(input: SwapInput): string {
  return `\
Swap this ${input.mealType} recipe: "${input.originalRecipeName}"

Constraints:
  Allergies:             ${input.preferences.allergies.join(', ') || 'none'}
  Dietary restrictions:  ${input.preferences.dietaryRestrictions.join(', ') || 'none'}
  Preferred cuisines:    ${input.preferences.cuisinePreferences.join(', ') || 'any'}

Return one alternative ${input.mealType} recipe with similar nutrition. \
Use id format "recipe_<slug_of_name>".`;
}

export const CHAT_SYSTEM_PROMPT = `\
You are Chefer, a friendly and knowledgeable personal chef AI assistant.
Help users with recipe substitutions, cooking techniques, nutritional advice, and meal planning questions.
Keep responses concise, practical, and encouraging.
Use the user's active meal plan as context when relevant.`;
```

### Step 5 — Create `gemini.ts`

This is the main implementation file. Key decisions:

- Use **`generateContent`** with `responseMimeType: 'application/json'` and `responseSchema` — this forces Gemini to return valid JSON matching the schema without any prompt hacks.
- Parse the JSON response and validate it against the `WeekPlanResponse` shape using Zod.
- Use `gemini-2.5-flash` as the model.
- Set `temperature: 0.7` for creative but consistent meal variety.
- Set `maxOutputTokens: 8192` — a full 7-day plan with 4 meals/day needs ~4–6k tokens.

```typescript
// apps/api/src/lib/ai/gemini.ts

import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import {
  buildMealPlanUserPrompt,
  buildSwapUserPrompt,
  CHAT_SYSTEM_PROMPT,
  MEAL_PLAN_SYSTEM_PROMPT,
  SWAP_SYSTEM_PROMPT,
} from './prompts.js';
import type {
  ChatContext,
  ChatMessage,
  IAIService,
  MealPlanInput,
  RecipeData,
  SwapInput,
  WeekPlanResponse,
} from './types.js';

const MODEL = 'gemini-2.5-flash';

// ─── Zod validation schemas (parse + validate the AI response) ────────────────

const nutritionSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number(),
});

const ingredientSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
});

const recipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  ingredients: z.array(ingredientSchema),
  instructions: z.array(z.string()),
  nutritionInfo: nutritionSchema,
  cuisineType: z.string(),
  dietaryTags: z.array(z.string()),
  prepTimeMins: z.number(),
  cookTimeMins: z.number(),
  servings: z.number(),
  imageUrl: z.string().nullable(),
});

const weekPlanResponseSchema = z.object({
  days: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      meals: z.array(
        z.object({
          type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
          recipe: recipeSchema,
        }),
      ),
    }),
  ),
});

// ─── Gemini response schema (used for structured output enforcement) ──────────
// This mirrors weekPlanResponseSchema but uses the @google/genai Type format.

const GEMINI_NUTRITION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    calories: { type: Type.NUMBER },
    protein: { type: Type.NUMBER },
    carbs: { type: Type.NUMBER },
    fat: { type: Type.NUMBER },
    fiber: { type: Type.NUMBER },
  },
  required: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
};

const GEMINI_INGREDIENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    quantity: { type: Type.NUMBER },
    unit: { type: Type.STRING },
  },
  required: ['name', 'quantity', 'unit'],
};

const GEMINI_RECIPE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    ingredients: { type: Type.ARRAY, items: GEMINI_INGREDIENT_SCHEMA },
    instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
    nutritionInfo: GEMINI_NUTRITION_SCHEMA,
    cuisineType: { type: Type.STRING },
    dietaryTags: { type: Type.ARRAY, items: { type: Type.STRING } },
    prepTimeMins: { type: Type.NUMBER },
    cookTimeMins: { type: Type.NUMBER },
    servings: { type: Type.NUMBER },
    imageUrl: { type: Type.STRING, nullable: true },
  },
  required: [
    'id',
    'name',
    'description',
    'ingredients',
    'instructions',
    'nutritionInfo',
    'cuisineType',
    'dietaryTags',
    'prepTimeMins',
    'cookTimeMins',
    'servings',
    'imageUrl',
  ],
};

const GEMINI_WEEK_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    days: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          dayOfWeek: { type: Type.INTEGER },
          meals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
                recipe: GEMINI_RECIPE_SCHEMA,
              },
              required: ['type', 'recipe'],
            },
          },
        },
        required: ['dayOfWeek', 'meals'],
      },
    },
  },
  required: ['days'],
};

// ─── GeminiAIService ──────────────────────────────────────────────────────────

export class GeminiAIService implements IAIService {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('GeminiAIService: GEMINI_API_KEY is required');
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse> {
    const result = await this.client.models.generateContent({
      model: MODEL,
      config: {
        systemInstruction: MEAL_PLAN_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_WEEK_PLAN_SCHEMA,
        temperature: 0.7,
        maxOutputTokens: 8192,
      },
      contents: buildMealPlanUserPrompt(input),
    });

    const raw = result.text;
    if (!raw) throw new Error('GeminiAIService: empty response from generateMealPlan');

    const parsed = weekPlanResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(`GeminiAIService: invalid meal plan shape — ${parsed.error.message}`);
    }

    return parsed.data;
  }

  async generateRecipeSwap(input: SwapInput): Promise<RecipeData> {
    const result = await this.client.models.generateContent({
      model: MODEL,
      config: {
        systemInstruction: SWAP_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RECIPE_SCHEMA,
        temperature: 0.8,
        maxOutputTokens: 2048,
      },
      contents: buildSwapUserPrompt(input),
    });

    const raw = result.text;
    if (!raw) throw new Error('GeminiAIService: empty response from generateRecipeSwap');

    const parsed = recipeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(`GeminiAIService: invalid recipe shape — ${parsed.error.message}`);
    }

    return parsed.data;
  }

  async chat(messages: ChatMessage[], _context: ChatContext): Promise<ReadableStream> {
    // Streaming chat — convert our ChatMessage format to Gemini's content format,
    // then return a ReadableStream that emits text chunks.
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const streamResult = await this.client.models.generateContentStream({
      model: MODEL,
      config: {
        systemInstruction: CHAT_SYSTEM_PROMPT,
        temperature: 0.9,
        maxOutputTokens: 1024,
      },
      contents,
    });

    return new ReadableStream({
      async start(controller) {
        for await (const chunk of streamResult) {
          const text = chunk.text;
          if (text) {
            controller.enqueue(new TextEncoder().encode(text));
          }
        }
        controller.close();
      },
    });
  }
}
```

### Step 6 — Update `.env` (local development)

```dotenv
# apps/api/.env
AI_MOCK_ENABLED=false
AI_PROVIDER=gemini
GEMINI_API_KEY=your_actual_key_from_aistudio
```

To revert to mock at any time: `AI_MOCK_ENABLED=true` — no other changes needed.

---

## 5. The Prompt — Design Rationale

### Why this prompt works

| Design choice                                          | Reason                                                                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate system + user prompts                         | System prompt sets the persona/rules once; user prompt carries the per-request data. Gemini's `systemInstruction` is cached separately and cheaper on paid tier. |
| Absolute language for allergies ("safety requirement") | LLMs respond more reliably to explicit severity signals.                                                                                                         |
| Human-readable goal/activity labels in the prompt      | "lose weight (caloric deficit, high protein...)" gives the model nutritional context it needs to distribute macros correctly.                                    |
| Calorie distribution percentages per meal type         | Without this, the model tends to distribute calories unevenly.                                                                                                   |
| "No recipe name should repeat across 7 days"           | Prevents the common LLM failure of looping the same recipes.                                                                                                     |
| Stable id format `"recipe_<slug>"`                     | Lets the database upsert work reliably on re-generation (idempotent).                                                                                            |
| `imageUrl: null` in the prompt                         | We fetch images separately (current behaviour in `meal-plan.service.ts`). Telling the model this avoids hallucinated URLs.                                       |
| `±100 kcal` calorie tolerance                          | Gives the model enough flexibility to produce realistic recipes rather than force-fitting arbitrary numbers.                                                     |
| Structured output (`responseSchema`)                   | Guarantees valid JSON that matches our schema without any "return JSON" instructions in the prompt. Eliminates the entire class of JSON parsing errors.          |

### Token estimate for a 4-meal/day plan

| Component                                        | Tokens (approx.) |
| ------------------------------------------------ | ---------------- |
| System prompt                                    | ~250             |
| User prompt                                      | ~200             |
| Response (7 days × 4 meals × ~220 tokens/recipe) | ~6,200           |
| **Total per generation**                         | **~6,650**       |

Well within the 250,000 TPM free tier limit.

---

## 6. Error Handling Strategy

| Failure mode          | Handling                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API key missing       | Fails at startup with clear error message (env validation in Step 2)                                                                                                       |
| Rate limit hit (429)  | Wrap `generateContent` in a retry with exponential backoff (max 3 attempts, 2s/4s/8s). On final failure, throw a TRPCError `TOO_MANY_REQUESTS` with user-friendly message. |
| Invalid JSON returned | Caught by Zod parse — extremely unlikely with structured output mode, but handled.                                                                                         |
| Schema mismatch       | Caught by `weekPlanResponseSchema.safeParse()` with descriptive error logged server-side.                                                                                  |
| Model timeout         | `@google/genai` respects the default 60s timeout. Log and throw `INTERNAL_SERVER_ERROR`.                                                                                   |
| Empty response        | Explicit null check on `result.text` before parsing.                                                                                                                       |

---

## 7. Environment Variables Summary

| Variable            | Required when           | Description                                 |
| ------------------- | ----------------------- | ------------------------------------------- |
| `AI_MOCK_ENABLED`   | always                  | `true` uses fixtures; `false` calls real AI |
| `AI_PROVIDER`       | `AI_MOCK_ENABLED=false` | `gemini` \| `openai` \| `anthropic`         |
| `GEMINI_API_KEY`    | `AI_PROVIDER=gemini`    | Key from Google AI Studio                   |
| `OPENAI_API_KEY`    | `AI_PROVIDER=openai`    | For future use                              |
| `ANTHROPIC_API_KEY` | `AI_PROVIDER=anthropic` | For future use                              |

---

## 8. Switching Providers in the Future

The architecture makes provider switching a 3-step process:

1. **Create** `apps/api/src/lib/ai/<provider>.ts` implementing `IAIService`
2. **Add** a branch in `index.ts` factory for the new provider
3. **Add** the API key env var to `env.ts` and `.env.example`

**Nothing else changes** — no router changes, no service changes, no frontend changes.

To switch from Gemini to (e.g.) Claude Sonnet:

```dotenv
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Then implement `anthropic.ts` using the `@anthropic-ai/sdk`.

---

## 9. Files to Create / Modify

| File                             | Action     | Notes                                             |
| -------------------------------- | ---------- | ------------------------------------------------- |
| `apps/api/src/lib/ai/gemini.ts`  | **Create** | GeminiAIService implementation                    |
| `apps/api/src/lib/ai/prompts.ts` | **Update** | Improved prompts (Step 4)                         |
| `apps/api/src/lib/ai/index.ts`   | **Update** | Add gemini branch to factory                      |
| `apps/api/src/lib/env.ts`        | **Update** | Add `gemini` to AI_PROVIDER enum + GEMINI_API_KEY |
| `apps/api/.env.example`          | **Update** | Document new env vars                             |
| `apps/api/.env`                  | **Update** | Set local dev values (not committed)              |
| `infrastructure.md`              | **Update** | §8 (new provider), §10 (new env var)              |

> `types.ts`, `mock.ts`, `openai.ts`, and all routers/services remain unchanged.

---

## 10. Rollout Order

```
Step 1  pnpm --filter @chefer/api add @google/genai
Step 2  Update env.ts  (add gemini to enum + GEMINI_API_KEY field)
Step 3  Update index.ts  (add gemini factory branch)
Step 4  Update prompts.ts  (improved prompts)
Step 5  Create gemini.ts  (GeminiAIService)
Step 6  Set AI_MOCK_ENABLED=false + AI_PROVIDER=gemini + GEMINI_API_KEY in .env
Step 7  pnpm dev  — test generation in the browser
Step 8  Verify response shape matches mock (planId, days[7], meals per day, nutrition totals)
Step 9  Update infrastructure.md §8 and §10
Step 10 Commit
```

---

## 11. Testing Checklist

- [ ] `pnpm typecheck` passes with no new errors
- [ ] Setting `AI_MOCK_ENABLED=true` still returns fixture data (regression test)
- [ ] Setting `AI_MOCK_ENABLED=false, AI_PROVIDER=gemini` without `GEMINI_API_KEY` throws at startup
- [ ] Generate plan with no dietary restrictions → 7 days, correct meal count per day
- [ ] Generate plan with `allergies: ['peanuts']` → zero peanut ingredients in any recipe
- [ ] Generate plan with `dietaryRestrictions: ['vegan']` → no meat, dairy, or eggs
- [ ] Calorie totals per day within ±150 kcal of `dailyCalorieTarget`
- [ ] No duplicate recipe names across the 7 days
- [ ] Swap recipe returns a different recipe name from the original
- [ ] Frontend renders the generated plan without errors (same shape as mock)
