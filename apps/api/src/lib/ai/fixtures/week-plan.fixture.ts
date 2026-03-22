import type { WeekPlanResponse } from '../types.js';

// ─── Recipe Library ───────────────────────────────────────────────────────────
// 14 distinct recipes cycling across 7 days × 4 meals.
// Total daily kcal targets ~2000 (B≈400 L≈580 D≈700 S≈300).
//
// Images: curated Unsplash photo IDs (stable CDN, no auth required).
// All served at 800×600 (4:3) via the recipe-image utility.
// To migrate to Cloudinary, run `pnpm upload:images` with your credentials.

const U = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&h=600&q=80`;

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
export const RECIPE_LIBRARY = {
  // ── BREAKFASTS ──────────────────────────────────────────────────────────────
  greekYogurtParfait: {
    id: 'fix-r-001',
    name: 'Greek Yogurt Parfait with Berries',
    description:
      'Creamy Greek yogurt layered with fresh seasonal berries, crunchy granola, and a drizzle of honey. A protein-packed start to your day.',
    ingredients: [
      { name: 'Greek yogurt (full-fat)', quantity: 200, unit: 'g' },
      { name: 'Mixed berries (strawberries, blueberries, raspberries)', quantity: 100, unit: 'g' },
      { name: 'Granola', quantity: 40, unit: 'g' },
      { name: 'Honey', quantity: 15, unit: 'ml' },
      { name: 'Chia seeds', quantity: 5, unit: 'g' },
    ],
    instructions: [
      'Spoon half the Greek yogurt into a glass or bowl.',
      'Add half the berries, then half the granola.',
      'Repeat the layers with remaining yogurt, berries, and granola.',
      'Drizzle honey over the top and sprinkle chia seeds.',
      'Serve immediately or refrigerate overnight for a thicker texture.',
    ],
    nutritionInfo: { calories: 385, protein: 22, carbs: 52, fat: 9, fiber: 5 },
    cuisineType: 'Mediterranean',
    dietaryTags: ['vegetarian', 'gluten-free'],
    prepTimeMins: 5,
    cookTimeMins: 0,
    servings: 1,
    imageUrl: U('photo-1488477181946-6428a0291777'),
  },

  avocadoToast: {
    id: 'fix-r-002',
    name: 'Avocado Toast with Poached Eggs',
    description:
      'Thick sourdough toast topped with smashed avocado, perfectly poached eggs, and chilli flakes. A balanced, satiating breakfast.',
    ingredients: [
      { name: 'Sourdough bread', quantity: 2, unit: 'slices' },
      { name: 'Ripe avocado', quantity: 1, unit: 'medium' },
      { name: 'Eggs', quantity: 2, unit: 'large' },
      { name: 'Lemon juice', quantity: 10, unit: 'ml' },
      { name: 'Chilli flakes', quantity: 1, unit: 'pinch' },
      { name: 'Salt and black pepper', quantity: 1, unit: 'to taste' },
    ],
    instructions: [
      'Toast the sourdough slices until golden and crisp.',
      'Halve and stone the avocado; scoop flesh into a bowl. Mash with lemon juice, salt, and pepper.',
      'Bring a pan of water to a gentle simmer. Add a splash of white vinegar. Crack each egg into a cup then slide into the water. Poach for 3 minutes.',
      'Spread mashed avocado generously over the toast.',
      'Top each slice with a poached egg, season, and finish with chilli flakes.',
    ],
    nutritionInfo: { calories: 420, protein: 21, carbs: 38, fat: 22, fiber: 8 },
    cuisineType: 'American',
    dietaryTags: ['vegetarian'],
    prepTimeMins: 5,
    cookTimeMins: 8,
    servings: 1,
    imageUrl: U('photo-1525351484163-7529414344d8'),
  },

  overnightOats: {
    id: 'fix-r-003',
    name: 'Overnight Oats with Banana and Almond Butter',
    description:
      'Rolled oats soaked overnight in oat milk, topped with sliced banana and a swirl of almond butter. Ready to grab and go.',
    ingredients: [
      { name: 'Rolled oats', quantity: 80, unit: 'g' },
      { name: 'Oat milk', quantity: 180, unit: 'ml' },
      { name: 'Banana', quantity: 1, unit: 'medium' },
      { name: 'Almond butter', quantity: 20, unit: 'g' },
      { name: 'Maple syrup', quantity: 10, unit: 'ml' },
      { name: 'Cinnamon', quantity: 1, unit: 'pinch' },
    ],
    instructions: [
      'Combine oats and oat milk in a jar or container. Stir well.',
      'Add maple syrup and cinnamon; stir again.',
      'Seal and refrigerate overnight (minimum 6 hours).',
      'In the morning, slice the banana and arrange on top.',
      'Swirl in almond butter and serve cold.',
    ],
    nutritionInfo: { calories: 395, protein: 12, carbs: 62, fat: 12, fiber: 7 },
    cuisineType: 'American',
    dietaryTags: ['vegan', 'dairy-free'],
    prepTimeMins: 5,
    cookTimeMins: 0,
    servings: 1,
    imageUrl: U('photo-1517673408408-cb25f2e0fb8a'),
  },

  spinachOmelette: {
    id: 'fix-r-004',
    name: 'Spinach and Feta Omelette',
    description:
      'Fluffy three-egg omelette packed with wilted spinach, crumbled feta, and cherry tomatoes. High protein and ready in 10 minutes.',
    ingredients: [
      { name: 'Eggs', quantity: 3, unit: 'large' },
      { name: 'Baby spinach', quantity: 60, unit: 'g' },
      { name: 'Feta cheese', quantity: 30, unit: 'g' },
      { name: 'Cherry tomatoes', quantity: 5, unit: 'halved' },
      { name: 'Olive oil', quantity: 10, unit: 'ml' },
      { name: 'Salt and black pepper', quantity: 1, unit: 'to taste' },
    ],
    instructions: [
      'Beat eggs with a pinch of salt and pepper until combined.',
      'Heat olive oil in a non-stick pan over medium heat.',
      'Add spinach and toss until wilted (about 1 minute). Remove and set aside.',
      'Pour egg mixture into the pan. Let the edges set, then gently push from the edges inward.',
      'When almost set, add spinach, feta, and tomatoes to one half.',
      'Fold omelette in half and slide onto a plate.',
    ],
    nutritionInfo: { calories: 350, protein: 28, carbs: 6, fat: 24, fiber: 2 },
    cuisineType: 'Mediterranean',
    dietaryTags: ['vegetarian', 'gluten-free', 'keto'],
    prepTimeMins: 5,
    cookTimeMins: 8,
    servings: 1,
    imageUrl: U('photo-1510693206972-df098062cb71'),
  },

  // ── LUNCHES ─────────────────────────────────────────────────────────────────
  chickenCaesarSalad: {
    id: 'fix-r-005',
    name: 'Grilled Chicken Caesar Salad',
    description:
      'Classic Caesar salad with a grilled chicken breast, crunchy romaine lettuce, parmesan shavings, and whole-grain croutons.',
    ingredients: [
      { name: 'Chicken breast', quantity: 150, unit: 'g' },
      { name: 'Romaine lettuce', quantity: 120, unit: 'g' },
      { name: 'Parmesan cheese', quantity: 20, unit: 'g' },
      { name: 'Whole-grain croutons', quantity: 30, unit: 'g' },
      { name: 'Caesar dressing (light)', quantity: 30, unit: 'ml' },
      { name: 'Lemon juice', quantity: 5, unit: 'ml' },
    ],
    instructions: [
      'Season chicken with salt and pepper. Grill on a ridged pan for 5–6 minutes per side until cooked through.',
      'Rest chicken for 3 minutes, then slice diagonally.',
      'Tear lettuce into pieces and toss with Caesar dressing and lemon juice.',
      'Top with sliced chicken, parmesan shavings, and croutons.',
      'Serve immediately.',
    ],
    nutritionInfo: { calories: 580, protein: 48, carbs: 28, fat: 28, fiber: 4 },
    cuisineType: 'American',
    dietaryTags: ['high-protein'],
    prepTimeMins: 10,
    cookTimeMins: 15,
    servings: 1,
    imageUrl: U('photo-1550304943-4f24f54ddde9'),
  },

  quinoaBowl: {
    id: 'fix-r-006',
    name: 'Quinoa and Roasted Vegetable Bowl',
    description:
      'Hearty quinoa base topped with oven-roasted seasonal vegetables, chickpeas, and a lemon-tahini drizzle.',
    ingredients: [
      { name: 'Quinoa (dry)', quantity: 80, unit: 'g' },
      { name: 'Courgette', quantity: 100, unit: 'g' },
      { name: 'Red pepper', quantity: 100, unit: 'g' },
      { name: 'Cherry tomatoes', quantity: 80, unit: 'g' },
      { name: 'Canned chickpeas (drained)', quantity: 100, unit: 'g' },
      { name: 'Tahini', quantity: 20, unit: 'g' },
      { name: 'Lemon juice', quantity: 15, unit: 'ml' },
      { name: 'Olive oil', quantity: 15, unit: 'ml' },
    ],
    instructions: [
      'Preheat oven to 200°C. Toss chopped vegetables and chickpeas with olive oil, salt, and cumin. Roast for 25 minutes.',
      'Cook quinoa according to package directions (usually 15 minutes).',
      'Whisk tahini with lemon juice and 2 tbsp water until smooth. Season.',
      'Assemble bowl: quinoa base, roasted veg and chickpeas on top.',
      'Drizzle tahini dressing over everything.',
    ],
    nutritionInfo: { calories: 520, protein: 22, carbs: 72, fat: 18, fiber: 14 },
    cuisineType: 'Middle Eastern',
    dietaryTags: ['vegan', 'gluten-free', 'high-fiber'],
    prepTimeMins: 10,
    cookTimeMins: 25,
    servings: 1,
    imageUrl: U('photo-1512621776951-a57141f2eefd'),
  },

  turkeyWrap: {
    id: 'fix-r-007',
    name: 'Turkey and Avocado Whole-Wheat Wrap',
    description:
      'A satisfying wrap with lean turkey slices, ripe avocado, crisp romaine, and a tangy Dijon mustard spread.',
    ingredients: [
      { name: 'Whole-wheat tortilla', quantity: 1, unit: 'large' },
      { name: 'Turkey breast slices', quantity: 100, unit: 'g' },
      { name: 'Avocado', quantity: 0.5, unit: 'medium' },
      { name: 'Romaine lettuce', quantity: 40, unit: 'g' },
      { name: 'Tomato', quantity: 1, unit: 'medium, sliced' },
      { name: 'Dijon mustard', quantity: 10, unit: 'g' },
      { name: 'Red onion', quantity: 20, unit: 'g, thinly sliced' },
    ],
    instructions: [
      'Warm the tortilla for 20 seconds in a dry pan or microwave.',
      'Spread Dijon mustard over the surface.',
      'Layer lettuce, turkey slices, avocado slices, tomato, and red onion.',
      'Season with salt and pepper.',
      'Fold in the sides and roll tightly. Cut diagonally to serve.',
    ],
    nutritionInfo: { calories: 610, protein: 40, carbs: 58, fat: 22, fiber: 10 },
    cuisineType: 'American',
    dietaryTags: ['high-protein', 'dairy-free'],
    prepTimeMins: 10,
    cookTimeMins: 0,
    servings: 1,
    imageUrl: U('photo-1626700051175-6818013e1d4f'),
  },

  // ── DINNERS ──────────────────────────────────────────────────────────────────
  herbSalmon: {
    id: 'fix-r-008',
    name: 'Herb-Crusted Salmon with Roasted Asparagus',
    description:
      'Pan-seared salmon fillet with a fresh herb and lemon crust, served alongside tender roasted asparagus spears.',
    ingredients: [
      { name: 'Salmon fillet', quantity: 180, unit: 'g' },
      { name: 'Asparagus spears', quantity: 200, unit: 'g' },
      { name: 'Fresh parsley', quantity: 15, unit: 'g, chopped' },
      { name: 'Fresh dill', quantity: 10, unit: 'g, chopped' },
      { name: 'Lemon zest', quantity: 1, unit: 'lemon' },
      { name: 'Garlic', quantity: 2, unit: 'cloves, minced' },
      { name: 'Olive oil', quantity: 20, unit: 'ml' },
    ],
    instructions: [
      'Preheat oven to 200°C. Toss asparagus with half the olive oil, salt, and pepper. Spread on a baking tray.',
      'Mix herbs, lemon zest, and garlic with remaining oil.',
      'Press herb mixture firmly onto the flesh side of the salmon.',
      'Heat an ovenproof pan over high heat. Sear salmon skin-side down for 3 minutes.',
      'Transfer to oven alongside asparagus. Roast for 8–10 minutes until salmon is just cooked through.',
      'Serve salmon on a bed of asparagus with lemon wedges.',
    ],
    nutritionInfo: { calories: 680, protein: 52, carbs: 12, fat: 46, fiber: 6 },
    cuisineType: 'Mediterranean',
    dietaryTags: ['gluten-free', 'pescatarian', 'high-protein', 'keto'],
    prepTimeMins: 10,
    cookTimeMins: 20,
    servings: 1,
    imageUrl: U('photo-1467003909585-2f8a72700288'),
  },

  chickenStirFry: {
    id: 'fix-r-009',
    name: 'Chicken and Vegetable Stir-Fry with Brown Rice',
    description:
      'Quick Asian-inspired stir-fry with tender chicken strips, colourful vegetables, and a sesame-ginger sauce over nutty brown rice.',
    ingredients: [
      { name: 'Chicken breast', quantity: 150, unit: 'g, sliced' },
      { name: 'Brown rice (dry)', quantity: 70, unit: 'g' },
      { name: 'Broccoli florets', quantity: 100, unit: 'g' },
      { name: 'Snap peas', quantity: 80, unit: 'g' },
      { name: 'Carrot', quantity: 60, unit: 'g, julienned' },
      { name: 'Soy sauce (low-sodium)', quantity: 30, unit: 'ml' },
      { name: 'Sesame oil', quantity: 10, unit: 'ml' },
      { name: 'Fresh ginger', quantity: 5, unit: 'g, grated' },
      { name: 'Garlic', quantity: 2, unit: 'cloves, minced' },
    ],
    instructions: [
      'Cook brown rice according to package instructions.',
      'Mix soy sauce, sesame oil, ginger, and garlic for the sauce.',
      'Heat a wok or large pan over high heat. Add a little oil and stir-fry chicken for 5–6 minutes until golden.',
      'Add vegetables and stir-fry for 3–4 minutes until tender-crisp.',
      'Pour sauce over the stir-fry and toss to coat.',
      'Serve over brown rice.',
    ],
    nutritionInfo: { calories: 720, protein: 48, carbs: 82, fat: 18, fiber: 8 },
    cuisineType: 'Asian',
    dietaryTags: ['high-protein', 'dairy-free'],
    prepTimeMins: 15,
    cookTimeMins: 25,
    servings: 1,
    imageUrl: U('photo-1512058564366-18510be2db19'),
  },

  mediterraneanCod: {
    id: 'fix-r-010',
    name: 'Mediterranean Baked Cod with Tomatoes',
    description:
      'Flaky baked cod in a rich tomato, olive, and caper sauce. Serve with crusty bread or over couscous.',
    ingredients: [
      { name: 'Cod fillet', quantity: 180, unit: 'g' },
      { name: 'Cherry tomatoes', quantity: 150, unit: 'g, halved' },
      { name: 'Kalamata olives', quantity: 30, unit: 'g, pitted' },
      { name: 'Capers', quantity: 15, unit: 'g' },
      { name: 'Garlic', quantity: 3, unit: 'cloves, sliced' },
      { name: 'Olive oil', quantity: 20, unit: 'ml' },
      { name: 'Whole-wheat couscous (dry)', quantity: 70, unit: 'g' },
      { name: 'Fresh basil', quantity: 10, unit: 'g' },
    ],
    instructions: [
      'Preheat oven to 190°C. Cook couscous with boiling water or stock for 5 minutes.',
      'Sauté garlic in olive oil for 1 minute. Add tomatoes and cook until softened (5 minutes).',
      'Stir in olives and capers. Season well.',
      'Place cod in a baking dish, spoon tomato mixture over the top.',
      'Bake for 15–18 minutes until cod flakes easily.',
      'Scatter fresh basil over and serve with couscous.',
    ],
    nutritionInfo: { calories: 650, protein: 50, carbs: 60, fat: 18, fiber: 6 },
    cuisineType: 'Mediterranean',
    dietaryTags: ['pescatarian', 'dairy-free', 'high-protein'],
    prepTimeMins: 10,
    cookTimeMins: 25,
    servings: 1,
    imageUrl: U('photo-1519708227418-c8fd9a32b7a2'),
  },

  lentilCurry: {
    id: 'fix-r-011',
    name: 'Red Lentil and Spinach Curry',
    description:
      'Warming, aromatic red lentil curry with coconut milk, fresh spinach, and fragrant Indian spices. Served with basmati rice.',
    ingredients: [
      { name: 'Red lentils', quantity: 100, unit: 'g, dry' },
      { name: 'Baby spinach', quantity: 80, unit: 'g' },
      { name: 'Coconut milk', quantity: 150, unit: 'ml' },
      { name: 'Canned chopped tomatoes', quantity: 200, unit: 'g' },
      { name: 'Basmati rice (dry)', quantity: 70, unit: 'g' },
      { name: 'Onion', quantity: 1, unit: 'medium, diced' },
      { name: 'Garlic', quantity: 3, unit: 'cloves' },
      { name: 'Fresh ginger', quantity: 10, unit: 'g' },
      { name: 'Curry powder', quantity: 15, unit: 'g' },
      { name: 'Coconut oil', quantity: 15, unit: 'ml' },
    ],
    instructions: [
      'Cook rice according to package instructions.',
      'Sauté onion in coconut oil until soft (5 minutes). Add garlic, ginger, and curry powder. Cook 2 minutes.',
      'Add rinsed lentils, tomatoes, and 300ml water. Bring to a boil.',
      'Simmer for 20 minutes, stirring occasionally, until lentils are completely soft.',
      'Stir in coconut milk and spinach. Simmer 3 more minutes.',
      'Season and serve over basmati rice.',
    ],
    nutritionInfo: { calories: 700, protein: 30, carbs: 95, fat: 20, fiber: 18 },
    cuisineType: 'Indian',
    dietaryTags: ['vegan', 'gluten-free', 'dairy-free', 'high-fiber'],
    prepTimeMins: 10,
    cookTimeMins: 30,
    servings: 1,
    imageUrl: U('photo-1585937421612-70a008356fbe'),
  },

  // ── SNACKS ───────────────────────────────────────────────────────────────────
  appleAlmondButter: {
    id: 'fix-r-012',
    name: 'Apple Slices with Almond Butter',
    description:
      'Crisp apple slices paired with natural almond butter — a simple, satisfying snack with the perfect balance of fibre and healthy fats.',
    ingredients: [
      { name: 'Apple', quantity: 1, unit: 'large' },
      { name: 'Natural almond butter', quantity: 30, unit: 'g' },
      { name: 'Cinnamon', quantity: 1, unit: 'pinch' },
    ],
    instructions: [
      'Wash and core the apple, then slice into even wedges.',
      'Spoon almond butter into a small dipping bowl.',
      'Dust apple slices with cinnamon.',
      'Serve immediately.',
    ],
    nutritionInfo: { calories: 280, protein: 7, carbs: 34, fat: 15, fiber: 6 },
    cuisineType: 'American',
    dietaryTags: ['vegan', 'gluten-free', 'dairy-free'],
    prepTimeMins: 3,
    cookTimeMins: 0,
    servings: 1,
    imageUrl: U('photo-1568702846914-96b305d2aaeb'),
  },

  proteinSmoothie: {
    id: 'fix-r-013',
    name: 'Banana Protein Smoothie',
    description:
      "Creamy blended smoothie with frozen banana, vanilla protein powder, oat milk, and a handful of spinach. You won't taste the greens!",
    ingredients: [
      { name: 'Frozen banana', quantity: 1, unit: 'medium' },
      { name: 'Vanilla protein powder', quantity: 30, unit: 'g' },
      { name: 'Oat milk', quantity: 240, unit: 'ml' },
      { name: 'Baby spinach', quantity: 30, unit: 'g' },
      { name: 'Almond butter', quantity: 10, unit: 'g' },
    ],
    instructions: [
      'Add all ingredients to a blender.',
      'Blend on high for 60 seconds until completely smooth.',
      'Pour into a glass and serve immediately.',
    ],
    nutritionInfo: { calories: 320, protein: 32, carbs: 38, fat: 6, fiber: 4 },
    cuisineType: 'American',
    dietaryTags: ['gluten-free', 'dairy-free', 'high-protein'],
    prepTimeMins: 5,
    cookTimeMins: 0,
    servings: 1,
    imageUrl: U('photo-1553530666-ba11a7da3888'),
  },

  mixedNuts: {
    id: 'fix-r-014',
    name: 'Mixed Nuts and Medjool Dates',
    description:
      'A handful of mixed raw nuts paired with sweet Medjool dates — nutrient-dense and deeply satisfying.',
    ingredients: [
      { name: 'Mixed raw nuts (almonds, walnuts, cashews)', quantity: 40, unit: 'g' },
      { name: 'Medjool dates', quantity: 2, unit: 'pitted' },
    ],
    instructions: [
      'Portion nuts into a small bowl.',
      'Halve and pit the dates if not already done.',
      'Serve together as a snack.',
    ],
    nutritionInfo: { calories: 300, protein: 8, carbs: 30, fat: 18, fiber: 4 },
    cuisineType: 'Mediterranean',
    dietaryTags: ['vegan', 'gluten-free', 'dairy-free'],
    prepTimeMins: 1,
    cookTimeMins: 0,
    servings: 1,
    imageUrl: U('photo-1508061253366-f7da158b6d46'),
  },
};

// ─── Week Plan Fixture ────────────────────────────────────────────────────────

const R = RECIPE_LIBRARY;

export const WEEK_PLAN_FIXTURE: WeekPlanResponse = {
  days: [
    {
      dayOfWeek: 0, // Monday
      meals: [
        { type: 'breakfast', recipe: R.greekYogurtParfait },
        { type: 'lunch', recipe: R.chickenCaesarSalad },
        { type: 'dinner', recipe: R.herbSalmon },
        { type: 'snack', recipe: R.appleAlmondButter },
      ],
    },
    {
      dayOfWeek: 1, // Tuesday
      meals: [
        { type: 'breakfast', recipe: R.avocadoToast },
        { type: 'lunch', recipe: R.turkeyWrap },
        { type: 'dinner', recipe: R.chickenStirFry },
        { type: 'snack', recipe: R.proteinSmoothie },
      ],
    },
    {
      dayOfWeek: 2, // Wednesday
      meals: [
        { type: 'breakfast', recipe: R.overnightOats },
        { type: 'lunch', recipe: R.quinoaBowl },
        { type: 'dinner', recipe: R.mediterraneanCod },
        { type: 'snack', recipe: R.mixedNuts },
      ],
    },
    {
      dayOfWeek: 3, // Thursday
      meals: [
        { type: 'breakfast', recipe: R.spinachOmelette },
        { type: 'lunch', recipe: R.chickenCaesarSalad },
        { type: 'dinner', recipe: R.lentilCurry },
        { type: 'snack', recipe: R.appleAlmondButter },
      ],
    },
    {
      dayOfWeek: 4, // Friday
      meals: [
        { type: 'breakfast', recipe: R.greekYogurtParfait },
        { type: 'lunch', recipe: R.turkeyWrap },
        { type: 'dinner', recipe: R.herbSalmon },
        { type: 'snack', recipe: R.proteinSmoothie },
      ],
    },
    {
      dayOfWeek: 5, // Saturday
      meals: [
        { type: 'breakfast', recipe: R.avocadoToast },
        { type: 'lunch', recipe: R.quinoaBowl },
        { type: 'dinner', recipe: R.chickenStirFry },
        { type: 'snack', recipe: R.mixedNuts },
      ],
    },
    {
      dayOfWeek: 6, // Sunday
      meals: [
        { type: 'breakfast', recipe: R.overnightOats },
        { type: 'lunch', recipe: R.chickenCaesarSalad },
        { type: 'dinner', recipe: R.lentilCurry },
        { type: 'snack', recipe: R.appleAlmondButter },
      ],
    },
  ],
};
