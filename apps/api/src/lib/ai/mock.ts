import { SWAP_POOL_BY_TYPE } from './fixtures/swap-recipes.fixture.js';
import { WEEK_PLAN_FIXTURE } from './fixtures/week-plan.fixture.js';
import type {
  ChatContext,
  ChatMessage,
  CheferizedRecipe,
  CheferizeInput,
  ExtractedRecipe,
  IAIService,
  IngredientPriceEstimate,
  MealPhotoEstimate,
  MealPlanInput,
  RecipeData,
  RecipeExtractionSource,
  ShoppingListInput,
  ShoppingListResponse,
  SwapInput,
  WeekPlanResponse,
} from './types.js';

// ─── Mock AI Service ──────────────────────────────────────────────────────────
// Deterministic fixture-based implementation used in development and testing.
// No external API calls; returns pre-baked data instantly.
//
// ── Scenario steering (premium_plan.md §4.5) ─────────────────────────────────
// Defaults are frozen — with no steering keyword every method returns exactly
// what it always has, so existing tests and dev flows are untouched. Steering
// only ADDS reachable scenarios so every AI branch can be driven without live
// calls (the Gemini key is free-tier, 20 requests/day):
//
// - `extractRecipe` — keyed off the source url/text (case-insensitive):
//     "satay" or "peanut" → allergen-bearing chicken satay (peanut butter),
//                           so Cheferize emits allergen/restriction changes;
//     "unsafe"           → the satay fixture named with the UNSAFE magic
//                           word (see cheferizeRecipe below) — drives the
//                           fail-closed demo from the import UI;
//     "beef"             → meaty beef-steak fixture (vegetarian conflicts);
//     "no-recipe"        → the NO_RECIPE_FOUND sentinel (import rejects it);
//     anything else      → the classic tomato-basil pasta (unchanged default).
//     Photo sources have no text to steer with → default pasta.
// - `cheferizeRecipe` — real deterministic adapter (substitution map, serving
//     rescale, accurate changes[]). Magic name: when the ORIGINAL recipe name
//     contains "UNSAFE", the allergen/dislike swaps are skipped so the P1-2
//     matcher's fail-closed path is demonstrable end-to-end (the import
//     service flags the surviving allergen; importSave rejects the variant).
// - `analyzeMealPhoto` — scenario picked from a 5-entry table by
//     `imageBase64.length % 5` (a deterministic function of the image bytes;
//     base64 lengths are multiples of 4, so every residue is reachable by
//     padding the file — 3 raw bytes = 4 base64 chars ⇒ residue −1 mod 5).
//     Index 4 is the ~2310 kcal feast: logged on top of an on-target day it
//     pushes a 2000 kcal/day week >+15% over and triggers `rebalanceWeek`.
//     The table covers low/med/high confidence.
// - `generateMealPlan` — honors the wave-0 seam fields minimally (wave-2
//     agents develop against this): `householdContext.portionSum` rescales
//     every recipe to that serving count (ingredient quantities scaled,
//     per-serving macros untouched); `useFirstIngredients` are injected into
//     successive dinner slots' ingredient lists. Without seam fields the
//     response is the untouched WEEK_PLAN_FIXTURE, byte-identical to before.

export class MockAIService implements IAIService {
  // Cycle index for swap recipe pool — increments per call to avoid always
  // returning the first alternative.
  private swapIndex = 0;

  async generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse> {
    // Simulate a brief AI "thinking" delay so the UI loading state is visible
    await delay(600);

    const household = input.householdContext;
    const useFirst = input.useFirstIngredients;
    // No seam fields → the frozen default, untouched (wave-1 behavior).
    if (!household && !useFirst?.length) return WEEK_PLAN_FIXTURE;

    // Seam handling (§4.5): clone before mutating — the fixture is shared.
    const plan = structuredClone(WEEK_PLAN_FIXTURE);

    if (household) {
      const servings = Math.max(1, Math.round(household.portionSum));
      // The fixture reuses recipe objects across days; structuredClone keeps
      // those shared within the clone, so scale each object exactly once.
      const scaled = new Set<RecipeData>();
      for (const day of plan.days) {
        for (const meal of day.meals) {
          const recipe = meal.recipe;
          if (scaled.has(recipe)) continue;
          scaled.add(recipe);
          const factor = servings / Math.max(1, recipe.servings);
          recipe.ingredients = recipe.ingredients.map((ing) => ({
            ...ing,
            quantity: Math.round(ing.quantity * factor * 100) / 100,
          }));
          recipe.servings = servings;
        }
      }
    }

    if (useFirst?.length) {
      // Inject each pantry item into a successive dinner's ingredient list so
      // "did the plan use my pantry?" checks pass deterministically.
      const dinners = plan.days
        .map((day) => day.meals.find((m) => m.type === 'dinner')?.recipe)
        .filter((r): r is RecipeData => r !== undefined);
      useFirst.forEach((item, i) => {
        const recipe = dinners[i % dinners.length];
        if (!recipe) return;
        const has = recipe.ingredients.some(
          (ing) => ing.name.toLowerCase() === item.name.toLowerCase(),
        );
        if (!has) {
          recipe.ingredients.unshift({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
          });
        }
      });
    }

    return plan;
  }

  async generateRecipeSwap(input: SwapInput): Promise<RecipeData> {
    await delay(300);

    const pool = SWAP_POOL_BY_TYPE[input.mealType] ?? SWAP_POOL_BY_TYPE['breakfast'] ?? [];
    const recipe = pool[this.swapIndex % (pool.length || 1)];
    this.swapIndex += 1;

    if (!recipe) {
      throw new Error(`No swap recipes available for meal type: ${input.mealType}`);
    }

    // Return the recipe with a fresh ID so repeated swaps don't collide
    return { ...recipe, id: `swap-${Date.now()}` };
  }

  async generateShoppingList(input: ShoppingListInput): Promise<ShoppingListResponse> {
    await delay(400);
    // Merge duplicates by name+unit, return with simple category inference
    const merged = new Map<string, { quantity: number; unit: string }>();
    for (const ing of input.ingredients) {
      const key = `${ing.name.toLowerCase().trim()}|${ing.unit}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += ing.quantity;
      } else {
        merged.set(key, { quantity: ing.quantity, unit: ing.unit });
      }
    }
    return {
      items: [...merged.entries()].map(([key, data]) => {
        const name = key.split('|')[0] ?? key;
        return {
          ingredientName: name.charAt(0).toUpperCase() + name.slice(1),
          quantity: Number.isInteger(data.quantity)
            ? String(data.quantity)
            : data.quantity.toFixed(1),
          unit: data.unit,
          category: 'other' as const,
        };
      }),
    };
  }

  async estimateIngredientPrices(ingredientNames: string[]): Promise<IngredientPriceEstimate[]> {
    await delay(200);
    // Deterministic pseudo-prices derived from the name hash so dev renders
    // stable, plausible-looking values without any API call.
    return ingredientNames.map((name) => {
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
      const base = 0.3 + (Math.abs(hash) % 250) / 100; // €0.30 – €2.79
      const round = (v: number) => Math.round(v * 100) / 100;
      return {
        ingredientName: name,
        pricePer100gEur: round(base),
        pricePer100mlEur: round(base * 0.8),
        pricePerPieceEur: round(base * 1.2),
        caloriesPer100g: Math.round(40 + (Math.abs(hash) % 300)),
        proteinPer100g: round(2 + (Math.abs(hash) % 20)),
        carbsPer100g: round(5 + (Math.abs(hash) % 40)),
        fatPer100g: round(1 + (Math.abs(hash) % 15)),
        fiberPer100g: round(Math.abs(hash) % 8),
        gramsPerPiece: 50 + (Math.abs(hash) % 150),
      };
    });
  }

  async analyzeMealPhoto(imageBase64: string, _mimeType: string): Promise<MealPhotoEstimate> {
    await delay(400);
    // Scenario derived from the image bytes (§4.5): `base64 length % 5` picks
    // from the table, so different photos land on different estimates while
    // any given photo is stable. Index 0 is the original wave-1 fixture;
    // index 4 is the ~1620 kcal feast that trips the rebalance threshold.
    const scenario = MEAL_PHOTO_SCENARIOS[imageBase64.length % MEAL_PHOTO_SCENARIOS.length];
    return { ...(scenario ?? DEFAULT_MEAL_PHOTO_SCENARIO) };
  }

  async extractRecipe(source: RecipeExtractionSource): Promise<ExtractedRecipe> {
    await delay(400);
    // Keyword-steered fixture library (§4.5): the source url/text picks the
    // scenario; anything unmatched (including photo sources, which carry no
    // text) returns the original pasta default so F5's preview/edit sheet
    // renders exactly as before.
    const via = source.url ? 'link' : source.imageBase64 ? 'photo' : 'text';
    const steer = `${source.url ?? ''} ${source.text ?? ''}`.toLowerCase();

    if (steer.includes('no-recipe')) {
      // Sentinel shape — the recipe-import service rejects it with a friendly
      // BAD_REQUEST ("couldn't find a recipe"), same as the live prompt's.
      return {
        name: 'NO_RECIPE_FOUND',
        description: 'No recipe found in the provided content.',
        ingredients: [],
        instructions: [],
        nutritionInfo: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        cuisineType: 'International',
        dietaryTags: [],
        prepTimeMins: 0,
        cookTimeMins: 0,
        servings: 1,
      };
    }

    if (steer.includes('satay') || steer.includes('peanut') || steer.includes('unsafe')) {
      // Allergen-bearing fixture: peanut butter + chicken, so Cheferize for a
      // peanut-allergic/vegetarian user produces a real diff, and the P1-2
      // matcher flags the original. An "unsafe" keyword in the source marks
      // the name with the UNSAFE magic word, so cheferizeRecipe skips its
      // swaps and the whole fail-closed path is drivable from the import UI.
      return {
        name: `${steer.includes('unsafe') ? 'UNSAFE ' : ''}Chicken Peanut Satay Skewers (imported via ${via})`,
        description: 'Grilled chicken skewers with a rich peanut dipping sauce.',
        ingredients: [
          { name: 'chicken breast', quantity: 500, unit: 'g' },
          { name: 'peanut butter', quantity: 120, unit: 'g' },
          { name: 'coconut milk', quantity: 200, unit: 'ml' },
          { name: 'soy sauce', quantity: 2, unit: 'tbsp' },
          { name: 'lime', quantity: 1, unit: 'piece' },
        ],
        instructions: [
          'Marinate the chicken in soy sauce and lime juice for 20 minutes.',
          'Thread onto skewers and grill until charred and cooked through.',
          'Whisk peanut butter with coconut milk into a sauce; serve alongside.',
        ],
        nutritionInfo: { calories: 460, protein: 38, carbs: 12, fat: 28, fiber: 3 },
        cuisineType: 'Thai',
        dietaryTags: [],
        prepTimeMins: 25,
        cookTimeMins: 10,
        servings: 4,
      };
    }

    if (steer.includes('beef')) {
      return {
        name: `Seared Beef Steak with Garlic Butter (imported via ${via})`,
        description: 'Pan-seared steak basted in garlic-thyme butter.',
        ingredients: [
          { name: 'beef sirloin steak', quantity: 400, unit: 'g' },
          { name: 'butter', quantity: 40, unit: 'g' },
          { name: 'garlic', quantity: 2, unit: 'piece' },
          { name: 'thyme', quantity: 4, unit: 'sprigs' },
          { name: 'potatoes', quantity: 500, unit: 'g' },
        ],
        instructions: [
          'Parboil then roast the potatoes until crisp.',
          'Sear the steak 3 minutes per side in a screaming-hot pan.',
          'Baste with butter, garlic and thyme; rest 5 minutes and serve.',
        ],
        nutritionInfo: { calories: 640, protein: 45, carbs: 38, fat: 34, fiber: 4 },
        cuisineType: 'French',
        dietaryTags: [],
        prepTimeMins: 15,
        cookTimeMins: 30,
        servings: 2,
      };
    }

    return {
      name: `Rustic Tomato Basil Pasta (imported via ${via})`,
      description: 'Simple weeknight pasta with a fresh tomato sauce.',
      ingredients: [
        { name: 'spaghetti', quantity: 400, unit: 'g' },
        { name: 'tomato', quantity: 600, unit: 'g' },
        { name: 'garlic', quantity: 3, unit: 'piece' },
        { name: 'olive oil', quantity: 3, unit: 'tbsp' },
        { name: 'basil', quantity: 20, unit: 'g' },
      ],
      instructions: [
        'Cook the spaghetti in salted water until al dente.',
        'Soften garlic in olive oil, add chopped tomatoes and simmer 10 minutes.',
        'Toss the pasta with the sauce and torn basil; season and serve.',
      ],
      nutritionInfo: { calories: 480, protein: 14, carbs: 82, fat: 11, fiber: 6 },
      cuisineType: 'Italian',
      dietaryTags: ['vegetarian'],
      prepTimeMins: 10,
      cookTimeMins: 20,
      servings: 4,
    };
  }

  async cheferizeRecipe(input: CheferizeInput): Promise<CheferizedRecipe> {
    await delay(300);
    // Deterministic adaptation: naive term-matching swaps + serving rescale,
    // so the diff UI and the service's re-validation path exercise real
    // change lists without live calls. (The REAL safety check is the P1-2
    // matcher in the recipe-import service — this only produces plausible
    // adapted output.)
    const { recipe, targetServings, preferences } = input;
    const changes: CheferizedRecipe['changes'] = [];
    const hardTerms = [
      ...preferences.allergies.map((t) => ({ term: t.toLowerCase(), kind: 'allergen' as const })),
      ...preferences.dislikedIngredients.map((t) => ({
        term: t.toLowerCase(),
        kind: 'dislike' as const,
      })),
    ];

    const SUBSTITUTES: Record<string, string> = {
      peanut: 'toasted sunflower seeds',
      nut: 'toasted sunflower seeds',
      milk: 'oat milk',
      cheese: 'nutritional yeast',
      egg: 'chia gel',
    };
    const substituteFor = (term: string): string => {
      const match = Object.keys(SUBSTITUTES).find((key) => term.includes(key));
      return (match && SUBSTITUTES[match]) ?? 'chickpeas';
    };

    const factor = targetServings > 0 ? targetServings / Math.max(1, recipe.servings) : 1;
    const round = (v: number) => Math.round(v * 100) / 100;

    // Magic "UNSAFE" name (§4.5): simulate the AI silently missing the
    // allergen — swaps are skipped, only the rescale happens. The P1-2
    // matcher in the recipe-import service then flags the surviving terms:
    // the fail-closed path, demonstrable without a live model.
    const skipSwaps = recipe.name.includes('UNSAFE');
    if (skipSwaps) {
      changes.push({
        kind: 'other',
        description: 'Mock UNSAFE scenario: adaptation left the flagged ingredients untouched',
      });
    }

    // Naive containment, with a plural-tolerant fallback so "peanuts"
    // matches "peanut butter" the way the P1-2 matcher's vocabulary does.
    const termMatches = (term: string, ingredientName: string): boolean => {
      if (term.length === 0) return false;
      if (ingredientName.includes(term)) return true;
      const singular = term.endsWith('s') ? term.slice(0, -1) : '';
      return singular.length >= 3 && ingredientName.includes(singular);
    };

    const swappedTerms = new Set<string>();
    const ingredients = recipe.ingredients.map((ing) => {
      const lower = ing.name.toLowerCase();
      const hit = skipSwaps ? undefined : hardTerms.find(({ term }) => termMatches(term, lower));
      const name = hit ? substituteFor(hit.term) : ing.name;
      if (hit) {
        swappedTerms.add(hit.term);
        changes.push({
          kind: hit.kind,
          description: `Swapped ${ing.name} for ${name}`,
        });
      }
      return { name, quantity: round(ing.quantity * factor), unit: ing.unit };
    });

    // The real AI renames adapted dishes ("Peanut Satay" → "Satay"); the P1-2
    // matcher scans the name too, so a swapped term must not survive there.
    let adaptedName = recipe.name;
    for (const term of swappedTerms) {
      const singular = term.endsWith('s') ? term.slice(0, -1) : term;
      const escaped = singular.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      adaptedName = adaptedName.replace(new RegExp(`\\b${escaped}\\w*\\s*`, 'gi'), '');
    }
    adaptedName = adaptedName.replace(/\s{2,}/g, ' ').trim() || recipe.name;

    if (factor !== 1) {
      changes.push({
        kind: 'servings',
        description: `Rescaled from ${recipe.servings} to ${targetServings} servings`,
      });
    }

    return {
      adapted: {
        ...recipe,
        name: adaptedName,
        ingredients,
        servings: targetServings || recipe.servings,
      },
      changes,
    };
  }

  async chat(messages: ChatMessage[], context: ChatContext): Promise<ReadableStream> {
    await delay(200);

    // The mock echoes the REAL per-message context and exercises the same
    // tool handlers the live path uses (P1-4) — so local dev tests the whole
    // pipeline, not a canned regex script.
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const question = lastUserMessage?.content ?? '';

    let response: string;
    const importUrlMatch = /\bimport\b[\s\S]*?(https?:\/\/\S+)/i.exec(question);
    if (importUrlMatch?.[1] && context.tools) {
      const result = await context.tools.importRecipe({ url: importUrlMatch[1] });
      response = `(Mock) ${result}`;
    } else if (/swap/i.test(question) && context.tools) {
      const dayMatch =
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)\b/i.exec(
          question,
        );
      const jsDay = new Date().getDay();
      const today = jsDay === 0 ? 6 : jsDay - 1;
      const DAY_INDEX: Record<string, number> = {
        monday: 0,
        tuesday: 1,
        wednesday: 2,
        thursday: 3,
        friday: 4,
        saturday: 5,
        sunday: 6,
        today,
        tomorrow: (today + 1) % 7,
      };
      const dayOfWeek = DAY_INDEX[dayMatch?.[1]?.toLowerCase() ?? 'today'] ?? today;
      const mealType =
        /\b(breakfast|lunch|dinner|snack)\b/i.exec(question)?.[1]?.toLowerCase() ?? 'lunch';
      const result = await context.tools.swapMeal({ dayOfWeek, mealType });
      response = `(Mock) ${result}`;
    } else if (/\bi (just )?(ate|had)\b/i.test(question) && context.tools) {
      // "I ate a burger" → exercises the real logMeal tool handler (F4) with
      // a deterministic estimate; the point is the pipeline, not NLP.
      const dish = question
        .replace(/^.*?\bi (just )?(ate|had)\b/i, '')
        .replace(/[.!?].*$/, '')
        .trim();
      const result = await context.tools.logMeal({
        name: dish.length > 0 ? dish : 'mock meal',
        kcal: 450,
        protein: 20,
        carbs: 45,
        fat: 18,
        mealType: 'snack',
      });
      response = `(Mock) ${result}`;
    } else if (/add\b.*\b(shopping|grocery) list/i.test(question) && context.tools) {
      // "add milk and 2 kg flour to my shopping list" → name-only items; the
      // point is exercising the real tool handler, not NLP.
      const itemsText = question
        .replace(/^.*?\badd\b/i, '')
        .replace(/\b(to|on)\b.*\b(shopping|grocery) list.*$/i, '');
      const items = itemsText
        .split(/,|\band\b/i)
        .map((s) => ({ name: s.trim() }))
        .filter((i) => i.name.length > 0);
      const result = await context.tools.addToShoppingList({
        items: items.length > 0 ? items : [{ name: 'mock item' }],
      });
      response = `(Mock) ${result}`;
    } else if (/\breview\b|\bcheck.?in\b/i.test(question) && context.tools) {
      // "what did my review say" — exercises the real getMyReview handler (F1).
      const result = await context.tools.getMyReview();
      response = `(Mock) ${result}`;
    } else if (question) {
      response = `(Mock) You asked: "${question}". Here is what I know about your day:\n${context.contextSummary}`;
    } else {
      response = '(Mock) Hi! I am Chefer, your personal chef AI. How can I help you today?';
    }

    return stringToReadableStream(response);
  }
}

// ─── Meal-photo scenario table (§4.5) ────────────────────────────────────────
// Picked by `imageBase64.length % 5`. Base64 lengths are multiples of 4, so
// every residue is reachable — padding a file by 3 raw bytes adds 4 base64
// chars, shifting the residue by −1 (mod 5). Index 0 is the original wave-1
// fixture; index 4 is the rebalance-trigger feast: ±15% of a 2000 kcal/day
// week is 2100 kcal, so a 2310 kcal log on top of an on-target day trips
// `rebalanceWeek` while a normal meal never does.

const DEFAULT_MEAL_PHOTO_SCENARIO: MealPhotoEstimate = {
  dishName: 'Grilled chicken with rice and vegetables',
  confidence: 'med',
  kcal: 520,
  protein: 38,
  carbs: 55,
  fat: 14,
  portionNote: 'assuming a standard 350 g plate',
};

export const MEAL_PHOTO_SCENARIOS: readonly MealPhotoEstimate[] = [
  DEFAULT_MEAL_PHOTO_SCENARIO,
  {
    dishName: 'Caesar salad with grilled chicken',
    confidence: 'high',
    kcal: 430,
    protein: 32,
    carbs: 18,
    fat: 26,
    portionNote: 'restaurant side-plate portion, dressing included',
  },
  {
    dishName: 'Margherita pizza, whole',
    confidence: 'high',
    kcal: 890,
    protein: 34,
    carbs: 110,
    fat: 33,
    portionNote: 'a full 30 cm pizza — halve if you shared it',
  },
  {
    dishName: 'Vegetable soup with bread',
    confidence: 'low',
    kcal: 240,
    protein: 9,
    carbs: 34,
    fat: 7,
    portionNote: 'hard to judge what is under the surface — wide range',
  },
  {
    dishName: 'Double bacon cheeseburger with large fries and a milkshake',
    confidence: 'low',
    kcal: 2310,
    protein: 62,
    carbs: 210,
    fat: 128,
    portionNote: 'XL fast-food combo — could be anywhere from 1900 to 2600 kcal',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringToReadableStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      // Emit word-by-word with a tiny gap to simulate streaming
      const words = text.split(' ');
      let i = 0;
      const push = () => {
        if (i < words.length) {
          controller.enqueue(encoder.encode((i === 0 ? '' : ' ') + (words[i] ?? '')));
          i += 1;
          setTimeout(push, 30);
        } else {
          controller.close();
        }
      };
      push();
    },
  });
}
