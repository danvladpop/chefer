import type { RecipeData } from '../ai/types.js';
import { buildPollinationsUrl } from '../image-gen/pollinations.js';
import { buildRecipeImagePrompt } from '../image-gen/prompt.js';

// ─── Romanian staples (WP-14 lane B) ──────────────────────────────────────────
// 15 classic Romanian dishes, vegetarian and vegan variants first: they also
// close the vegan / vegetarian lunch and dinner gaps of the curated pool.
// Authored as structured data (no AI): every line carries a catalog `slug`, the
// served nutrition is computed from the catalog (index.ts → `curated()`), and
// the nutritionInfo below is only a rough estimate that the pool overrides.
// dietaryTags are load-bearing — tag a dish only when its ingredients (and
// method text, which the safety filter also scans) genuinely comply: no honey
// or dairy in vegan, no bread/flour/oats/stock in gluten-free.
//
// Same shape and image pipeline as extra-pool.ts.

const img = (name: string, cuisine: string) =>
  buildPollinationsUrl(buildRecipeImagePrompt(name, cuisine), name, cuisine);

type R = Omit<RecipeData, 'imageUrl'> & { imageUrl?: string };

const withImage = (r: R): RecipeData => ({ ...r, imageUrl: img(r.name, r.cuisineType) });

// ── Breakfasts ────────────────────────────────────────────────────────────────

export const ROMANIAN_BREAKFAST_POOL: RecipeData[] = (
  [
    {
      id: 'cur-ro-001',
      name: 'Omletă țărănească',
      description:
        'Peasant-style omelette: eggs set over fried onion, boiled potato, sweet pepper and tomato, finished with crumbled telemea cheese and parsley.',
      ingredients: [
        { name: 'eggs', quantity: 2, unit: 'large', slug: 'egg-whole-raw' },
        { name: 'boiled potato, diced', quantity: 100, unit: 'g', slug: 'potato-boiled' },
        { name: 'onion', quantity: 40, unit: 'g', slug: 'onion-raw' },
        { name: 'red pepper', quantity: 60, unit: 'g', slug: 'bell-pepper-red-raw' },
        { name: 'tomato', quantity: 60, unit: 'g', slug: 'tomato-raw' },
        { name: 'telemea cheese', quantity: 25, unit: 'g', slug: 'telemea-cow' },
        { name: 'sunflower oil', quantity: 1, unit: 'tbsp', slug: 'sunflower-oil' },
        { name: 'fresh parsley', quantity: 5, unit: 'g', slug: 'parsley-fresh' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
        { name: 'Black pepper', quantity: 1, unit: 'to taste', slug: 'black-pepper' },
      ],
      instructions: [
        'Heat the oil in a non-stick pan and fry the chopped onion and pepper for 4 minutes.',
        'Add the diced potato and tomato and cook for 3 minutes until the tomato softens.',
        'Beat the eggs with salt and pepper and pour them over the vegetables.',
        'Cook gently, lifting the edges, until just set. Crumble the telemea on top and scatter with parsley.',
      ],
      nutritionInfo: { calories: 460, protein: 22, carbs: 22, fat: 30, fiber: 3 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegetarian', 'gluten-free', 'high-protein'],
      prepTimeMins: 10,
      cookTimeMins: 12,
      servings: 1,
    },
    {
      id: 'cur-ro-002',
      name: 'Zacuscă pe pâine cu roșii și castraveți',
      description:
        'Wholemeal bread spread with zacuscă, the Romanian roasted eggplant and pepper relish, piled with fresh tomato, cucumber and onion. A plant-based classic.',
      ingredients: [
        { name: 'wholemeal bread', quantity: 3, unit: 'slice', slug: 'bread-whole-wheat' },
        { name: 'zacuscă (eggplant and pepper spread)', quantity: 80, unit: 'g', slug: 'zacusca' },
        { name: 'tomato', quantity: 100, unit: 'g', slug: 'tomato-raw' },
        { name: 'cucumber', quantity: 80, unit: 'g', slug: 'cucumber-raw' },
        { name: 'onion', quantity: 20, unit: 'g', slug: 'onion-raw' },
        { name: 'fresh parsley', quantity: 3, unit: 'g', slug: 'parsley-fresh' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
      ],
      instructions: [
        'Toast the bread lightly if you like.',
        'Spread each slice generously with zacuscă.',
        'Top with slices of tomato and cucumber and a few thin rings of onion.',
        'Season with a pinch of salt and scatter with parsley.',
      ],
      nutritionInfo: { calories: 420, protein: 14, carbs: 62, fat: 12, fiber: 10 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegan', 'dairy-free', 'high-fiber'],
      prepTimeMins: 8,
      cookTimeMins: 0,
      servings: 1,
    },
    {
      id: 'cur-ro-003',
      name: 'Mămăligă dulce cu lapte de soia, nuci și mere',
      description:
        'Creamy cornmeal porridge (mămăligă) simmered in soy milk, topped with grated apple, cinnamon, walnuts and a little maple syrup. A warming plant-based breakfast.',
      ingredients: [
        { name: 'cornmeal (polenta)', quantity: 60, unit: 'g', slug: 'polenta-dry' },
        { name: 'unsweetened soy milk', quantity: 250, unit: 'ml', slug: 'soy-milk-unsweetened' },
        { name: 'apple', quantity: 1, unit: 'medium', slug: 'apple-raw' },
        { name: 'walnuts', quantity: 15, unit: 'g', slug: 'walnuts' },
        { name: 'cinnamon', quantity: 0.5, unit: 'tsp', slug: 'cinnamon' },
        { name: 'maple syrup', quantity: 10, unit: 'ml', slug: 'maple-syrup' },
      ],
      instructions: [
        'Bring the soy milk to a gentle simmer with the cinnamon.',
        'Whisk in the cornmeal in a thin stream and cook for 8–10 minutes, stirring, until thick and smooth.',
        'Grate half the apple into the porridge and spoon it into a bowl.',
        'Top with the remaining apple in slices, the chopped walnuts and the maple syrup.',
      ],
      nutritionInfo: { calories: 500, protein: 14, carbs: 78, fat: 15, fiber: 8 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegan', 'gluten-free', 'dairy-free', 'high-fiber'],
      prepTimeMins: 5,
      cookTimeMins: 12,
      servings: 1,
    },
  ] satisfies R[]
).map(withImage);

// ── Lunches ───────────────────────────────────────────────────────────────────

export const ROMANIAN_LUNCH_POOL: RecipeData[] = (
  [
    {
      id: 'cur-ro-004',
      name: 'Ciorbă de legume',
      description:
        'Romanian sour vegetable soup: potato, carrot, celeriac, parsnip, pepper and green beans with a little rice, soured with lemon juice and finished with fresh dill and parsley.',
      ingredients: [
        { name: 'potatoes', quantity: 120, unit: 'g', slug: 'potato-raw' },
        { name: 'carrot', quantity: 60, unit: 'g', slug: 'carrot-raw' },
        { name: 'celeriac', quantity: 50, unit: 'g', slug: 'celeriac-raw' },
        { name: 'parsnip', quantity: 40, unit: 'g', slug: 'parsnip-raw' },
        { name: 'onion', quantity: 60, unit: 'g', slug: 'onion-raw' },
        { name: 'red pepper', quantity: 50, unit: 'g', slug: 'bell-pepper-red-raw' },
        { name: 'green beans', quantity: 50, unit: 'g', slug: 'green-beans-frozen' },
        { name: 'tomato passata', quantity: 60, unit: 'g', slug: 'tomato-puree' },
        { name: 'long-grain rice', quantity: 25, unit: 'g', slug: 'rice-white-dry' },
        { name: 'sunflower oil', quantity: 1, unit: 'tbsp', slug: 'sunflower-oil' },
        { name: 'lemon juice', quantity: 2, unit: 'tbsp', slug: 'lemon-juice' },
        { name: 'fresh dill', quantity: 8, unit: 'g', slug: 'dill-fresh' },
        { name: 'fresh parsley', quantity: 8, unit: 'g', slug: 'parsley-fresh' },
        { name: 'bay leaf', quantity: 1, unit: 'g', slug: 'bay-leaf' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
        { name: 'Black pepper', quantity: 1, unit: 'to taste', slug: 'black-pepper' },
      ],
      instructions: [
        'Dice the onion, carrot, celeriac, parsnip and pepper; cube the potatoes.',
        'Soften the onion, carrot, celeriac and parsnip in the oil for 5 minutes.',
        'Add 600 ml water, the bay leaf and the potatoes; bring to the boil and simmer for 10 minutes.',
        'Add the rice, pepper, green beans and passata and simmer for 12 minutes more.',
        'Season, stir in the lemon juice, remove the bay leaf and serve scattered with dill and parsley.',
      ],
      nutritionInfo: { calories: 460, protein: 9, carbs: 78, fat: 14, fiber: 10 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegan', 'gluten-free', 'dairy-free', 'high-fiber'],
      prepTimeMins: 15,
      cookTimeMins: 30,
      servings: 1,
    },
    {
      id: 'cur-ro-005',
      name: 'Ciorbă de perișoare',
      description:
        'Sour soup with small pork and rice meatballs, root vegetables and lemon, enriched at the end with an egg yolk and sour cream and scented with dill.',
      ingredients: [
        { name: 'ground pork', quantity: 100, unit: 'g', slug: 'ground-pork-raw' },
        { name: 'long-grain rice', quantity: 20, unit: 'g', slug: 'rice-white-dry' },
        { name: 'onion', quantity: 80, unit: 'g', slug: 'onion-raw' },
        { name: 'carrot', quantity: 50, unit: 'g', slug: 'carrot-raw' },
        { name: 'celeriac', quantity: 40, unit: 'g', slug: 'celeriac-raw' },
        { name: 'potato', quantity: 80, unit: 'g', slug: 'potato-raw' },
        { name: 'red pepper', quantity: 40, unit: 'g', slug: 'bell-pepper-red-raw' },
        { name: 'tomato passata', quantity: 50, unit: 'g', slug: 'tomato-puree' },
        { name: 'egg yolk', quantity: 1, unit: 'large', slug: 'egg-yolk-raw' },
        { name: 'sour cream (smântână)', quantity: 30, unit: 'g', slug: 'sour-cream-20' },
        { name: 'lemon juice', quantity: 2, unit: 'tbsp', slug: 'lemon-juice' },
        { name: 'sunflower oil', quantity: 1, unit: 'tsp', slug: 'sunflower-oil' },
        { name: 'fresh dill', quantity: 8, unit: 'g', slug: 'dill-fresh' },
        { name: 'fresh parsley', quantity: 8, unit: 'g', slug: 'parsley-fresh' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
        { name: 'Black pepper', quantity: 1, unit: 'to taste', slug: 'black-pepper' },
      ],
      instructions: [
        'Grate half the onion and mix it with the pork, the rice, parsley, salt and pepper; shape into small balls.',
        'Soften the remaining onion, carrot, celeriac and pepper in the oil for 5 minutes, then add 600 ml water and the potato.',
        'Simmer 10 minutes, then drop in the meatballs with the passata and cook for 20 minutes until the rice is tender.',
        'Whisk the yolk with the sour cream and a ladle of hot soup, then stir it into the pot off the heat.',
        'Sour with lemon juice and serve with dill.',
      ],
      nutritionInfo: { calories: 620, protein: 27, carbs: 50, fat: 33, fiber: 6 },
      cuisineType: 'Romanian',
      dietaryTags: ['gluten-free', 'high-protein'],
      prepTimeMins: 20,
      cookTimeMins: 35,
      servings: 1,
    },
    {
      id: 'cur-ro-006',
      name: 'Fasole bătută',
      description:
        'Silky beaten white bean purée with garlic and oil, topped with golden fried onion and served with crunchy sour pickles and fresh tomato.',
      ingredients: [
        { name: 'cooked white beans', quantity: 250, unit: 'g', slug: 'white-beans-cooked' },
        { name: 'garlic', quantity: 2, unit: 'clove', slug: 'garlic-raw' },
        { name: 'sunflower oil', quantity: 1, unit: 'tbsp', slug: 'sunflower-oil' },
        { name: 'onion', quantity: 60, unit: 'g', slug: 'onion-raw' },
        { name: 'sour pickles', quantity: 1, unit: 'medium', slug: 'pickles-sour' },
        { name: 'tomato', quantity: 100, unit: 'g', slug: 'tomato-raw' },
        { name: 'paprika', quantity: 0.5, unit: 'tsp', slug: 'paprika' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
      ],
      instructions: [
        'Warm the beans in a little of their cooking water, then mash or blend them with the garlic and salt to a smooth, thick purée.',
        'Fry the sliced onion in the oil over medium heat for 8 minutes until golden, stirring in the paprika at the very end.',
        'Spoon the purée onto a plate and top with the fried onion and its oil.',
        'Serve with sliced pickles and fresh tomato.',
      ],
      nutritionInfo: { calories: 520, protein: 22, carbs: 70, fat: 16, fiber: 20 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegan', 'gluten-free', 'dairy-free', 'high-fiber', 'high-protein'],
      prepTimeMins: 10,
      cookTimeMins: 12,
      servings: 1,
    },
    {
      id: 'cur-ro-007',
      name: 'Salată de vinete cu pâine',
      description:
        'Smoky roasted eggplant salad beaten with sunflower oil and raw onion, served with tomato and rye bread. The vegan way Romanians eat it during fasting.',
      ingredients: [
        { name: 'eggplant', quantity: 350, unit: 'g', slug: 'eggplant-raw' },
        { name: 'onion', quantity: 40, unit: 'g', slug: 'onion-raw' },
        { name: 'sunflower oil', quantity: 2, unit: 'tbsp', slug: 'sunflower-oil' },
        { name: 'lemon juice', quantity: 1, unit: 'tsp', slug: 'lemon-juice' },
        { name: 'tomato', quantity: 100, unit: 'g', slug: 'tomato-raw' },
        { name: 'rye bread', quantity: 2, unit: 'slice', slug: 'bread-rye' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
      ],
      instructions: [
        'Char the whole eggplants over a flame or under a hot grill, turning, for 20 minutes until soft and blackened.',
        'Peel them, let the juices drain for 10 minutes, then chop the flesh finely with a wooden or plastic knife.',
        'Gradually beat in the oil with the lemon juice and salt until pale and fluffy, then fold in the finely chopped onion.',
        'Serve with sliced tomato and the bread.',
      ],
      nutritionInfo: { calories: 510, protein: 10, carbs: 52, fat: 29, fiber: 14 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegan', 'dairy-free', 'high-fiber'],
      prepTimeMins: 15,
      cookTimeMins: 20,
      servings: 1,
    },
  ] satisfies R[]
).map(withImage);

// ── Dinners ───────────────────────────────────────────────────────────────────

export const ROMANIAN_DINNER_POOL: RecipeData[] = (
  [
    {
      id: 'cur-ro-008',
      name: 'Mămăligă cu brânză, smântână și ou ochi',
      description:
        'Firm cornmeal mămăligă served with salty telemea cheese, a spoonful of sour cream and a fried egg. Romania’s comfort-food plate.',
      ingredients: [
        { name: 'cornmeal (polenta)', quantity: 80, unit: 'g', slug: 'polenta-dry' },
        { name: 'telemea cheese', quantity: 50, unit: 'g', slug: 'telemea-cow' },
        { name: 'sour cream (smântână)', quantity: 40, unit: 'g', slug: 'sour-cream-20' },
        { name: 'fried egg', quantity: 1, unit: 'large', slug: 'egg-fried' },
        { name: 'fresh dill', quantity: 5, unit: 'g', slug: 'dill-fresh' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
        { name: 'Black pepper', quantity: 1, unit: 'to taste', slug: 'black-pepper' },
      ],
      instructions: [
        'Bring 350 ml salted water to the boil and rain in the cornmeal, whisking.',
        'Cook over low heat for 15 minutes, stirring often with a wooden spoon, until it pulls away from the pot.',
        'Turn out onto a board and slice, or spoon into a bowl.',
        'Serve with crumbled telemea, sour cream, the fried egg, dill and pepper.',
      ],
      nutritionInfo: { calories: 620, protein: 24, carbs: 68, fat: 28, fiber: 5 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegetarian', 'gluten-free'],
      prepTimeMins: 5,
      cookTimeMins: 20,
      servings: 1,
    },
    {
      id: 'cur-ro-009',
      name: 'Sarmale în foi de varză cu mămăligă',
      description:
        'Pickled-cabbage rolls stuffed with pork, rice and onion and slowly simmered in a paprika-tomato broth, served with mămăligă.',
      ingredients: [
        { name: 'ground pork', quantity: 100, unit: 'g', slug: 'ground-pork-raw' },
        { name: 'long-grain rice', quantity: 25, unit: 'g', slug: 'rice-white-dry' },
        { name: 'onion', quantity: 60, unit: 'g', slug: 'onion-raw' },
        { name: 'sauerkraut leaves', quantity: 200, unit: 'g', slug: 'sauerkraut' },
        { name: 'tomato paste', quantity: 1, unit: 'tbsp', slug: 'tomato-paste' },
        { name: 'paprika', quantity: 1, unit: 'tsp', slug: 'paprika' },
        { name: 'dried thyme', quantity: 0.5, unit: 'tsp', slug: 'thyme-dried' },
        { name: 'bay leaf', quantity: 1, unit: 'g', slug: 'bay-leaf' },
        { name: 'sunflower oil', quantity: 1, unit: 'tsp', slug: 'sunflower-oil' },
        { name: 'cornmeal (polenta)', quantity: 50, unit: 'g', slug: 'polenta-dry' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
        { name: 'Black pepper', quantity: 1, unit: 'to taste', slug: 'black-pepper' },
      ],
      instructions: [
        'Soften the chopped onion in the oil, then mix it with the pork, rinsed rice, paprika, thyme, salt and pepper.',
        'Roll a spoonful of filling in each pickled cabbage leaf, tucking the sides in to make tight parcels.',
        'Pack the rolls into a pot on a bed of shredded sauerkraut, add the bay leaf and tomato paste stirred into 300 ml water.',
        'Cover and simmer gently for 1 hour 15 minutes.',
        'Meanwhile cook the cornmeal in 200 ml salted water for 15 minutes, stirring, and serve it alongside the rolls.',
      ],
      nutritionInfo: { calories: 660, protein: 26, carbs: 78, fat: 26, fiber: 7 },
      cuisineType: 'Romanian',
      dietaryTags: ['gluten-free', 'dairy-free'],
      prepTimeMins: 30,
      cookTimeMins: 80,
      servings: 1,
    },
    {
      id: 'cur-ro-010',
      name: 'Sarmale vegetariene cu orez și ciuperci',
      description:
        'Plant-based sarmale: pickled-cabbage rolls filled with rice, mushrooms, carrot and dill, simmered in paprika-tomato broth and served with mămăligă.',
      ingredients: [
        { name: 'long-grain rice', quantity: 50, unit: 'g', slug: 'rice-white-dry' },
        { name: 'white mushrooms', quantity: 150, unit: 'g', slug: 'mushroom-white-raw' },
        { name: 'onion', quantity: 70, unit: 'g', slug: 'onion-raw' },
        { name: 'carrot', quantity: 40, unit: 'g', slug: 'carrot-raw' },
        { name: 'sauerkraut leaves', quantity: 200, unit: 'g', slug: 'sauerkraut' },
        { name: 'fresh dill', quantity: 5, unit: 'g', slug: 'dill-fresh' },
        { name: 'tomato paste', quantity: 1, unit: 'tbsp', slug: 'tomato-paste' },
        { name: 'paprika', quantity: 1, unit: 'tsp', slug: 'paprika' },
        { name: 'sunflower oil', quantity: 1, unit: 'tbsp', slug: 'sunflower-oil' },
        { name: 'bay leaf', quantity: 1, unit: 'g', slug: 'bay-leaf' },
        { name: 'cornmeal (polenta)', quantity: 50, unit: 'g', slug: 'polenta-dry' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
        { name: 'Black pepper', quantity: 1, unit: 'to taste', slug: 'black-pepper' },
      ],
      instructions: [
        'Finely chop the onion, carrot and mushrooms and cook them in the oil for 10 minutes until the liquid has evaporated.',
        'Stir in the rinsed rice, paprika, dill, salt and pepper and cook for 2 minutes.',
        'Roll a spoonful of filling in each pickled cabbage leaf, tucking the sides in.',
        'Pack the rolls into a pot on a bed of shredded sauerkraut, add the bay leaf and tomato paste stirred into 300 ml water; cover and simmer for 50 minutes.',
        'Cook the cornmeal in 200 ml salted water for 15 minutes, stirring, and serve it with the rolls.',
      ],
      nutritionInfo: { calories: 600, protein: 15, carbs: 100, fat: 16, fiber: 11 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegan', 'gluten-free', 'dairy-free', 'high-fiber'],
      prepTimeMins: 30,
      cookTimeMins: 60,
      servings: 1,
    },
    {
      id: 'cur-ro-011',
      name: 'Tocăniță de pui cu cartofi',
      description:
        'Chicken thighs braised with onion, sweet pepper, tomato paste, paprika and garlic, with potatoes cooked in the sauce.',
      ingredients: [
        { name: 'boneless chicken thighs', quantity: 180, unit: 'g', slug: 'chicken-thigh-raw' },
        { name: 'potatoes', quantity: 200, unit: 'g', slug: 'potato-raw' },
        { name: 'onion', quantity: 70, unit: 'g', slug: 'onion-raw' },
        { name: 'red pepper', quantity: 80, unit: 'g', slug: 'bell-pepper-red-raw' },
        { name: 'tomato paste', quantity: 1, unit: 'tbsp', slug: 'tomato-paste' },
        { name: 'paprika', quantity: 1, unit: 'tsp', slug: 'paprika' },
        { name: 'garlic', quantity: 2, unit: 'clove', slug: 'garlic-raw' },
        { name: 'sunflower oil', quantity: 1, unit: 'tbsp', slug: 'sunflower-oil' },
        { name: 'fresh parsley', quantity: 5, unit: 'g', slug: 'parsley-fresh' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
        { name: 'Black pepper', quantity: 1, unit: 'to taste', slug: 'black-pepper' },
      ],
      instructions: [
        'Brown the chicken pieces in the oil in a heavy pot, then set aside.',
        'Soften the chopped onion and pepper in the same pot for 5 minutes, then stir in the tomato paste, paprika and garlic.',
        'Return the chicken, add 250 ml water, cover and simmer for 20 minutes.',
        'Add the cubed potatoes and simmer for 20 minutes more until tender and the sauce is thick.',
        'Season and serve scattered with parsley.',
      ],
      nutritionInfo: { calories: 600, protein: 35, carbs: 50, fat: 28, fiber: 7 },
      cuisineType: 'Romanian',
      dietaryTags: ['gluten-free', 'dairy-free', 'high-protein'],
      prepTimeMins: 15,
      cookTimeMins: 50,
      servings: 1,
    },
    {
      id: 'cur-ro-012',
      name: 'Tocăniță de ciuperci cu mămăligă',
      description:
        'Mushroom stew with onion, green pepper, paprika and tomato paste, spooned over soft mămăligă. A hearty meat-free fasting dish.',
      ingredients: [
        { name: 'brown mushrooms', quantity: 250, unit: 'g', slug: 'mushroom-brown-raw' },
        { name: 'onion', quantity: 80, unit: 'g', slug: 'onion-raw' },
        { name: 'green pepper', quantity: 80, unit: 'g', slug: 'bell-pepper-green-raw' },
        { name: 'tomato paste', quantity: 1.5, unit: 'tbsp', slug: 'tomato-paste' },
        { name: 'paprika', quantity: 1, unit: 'tsp', slug: 'paprika' },
        { name: 'dried thyme', quantity: 0.5, unit: 'tsp', slug: 'thyme-dried' },
        { name: 'garlic', quantity: 2, unit: 'clove', slug: 'garlic-raw' },
        { name: 'sunflower oil', quantity: 1, unit: 'tbsp', slug: 'sunflower-oil' },
        { name: 'cornmeal (polenta)', quantity: 80, unit: 'g', slug: 'polenta-dry' },
        { name: 'fresh parsley', quantity: 5, unit: 'g', slug: 'parsley-fresh' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
        { name: 'Black pepper', quantity: 1, unit: 'to taste', slug: 'black-pepper' },
      ],
      instructions: [
        'Cook the cornmeal in 350 ml salted water for 15 minutes, stirring often, until thick.',
        'Meanwhile soften the sliced onion and pepper in the oil for 5 minutes.',
        'Add the quartered mushrooms and cook for 8 minutes until golden, then stir in the paprika, thyme, garlic and tomato paste with 100 ml water.',
        'Simmer for 10 minutes until the sauce clings to the mushrooms; season.',
        'Serve over the mămăligă with parsley.',
      ],
      nutritionInfo: { calories: 540, protein: 16, carbs: 82, fat: 17, fiber: 10 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegan', 'gluten-free', 'dairy-free', 'high-fiber'],
      prepTimeMins: 10,
      cookTimeMins: 25,
      servings: 1,
    },
    {
      id: 'cur-ro-013',
      name: 'Iahnie de fasole',
      description:
        'Slow-cooked Romanian white bean stew with plenty of onion, carrot, paprika, thyme and tomato, finished with fresh parsley. Fasting-friendly and filling.',
      ingredients: [
        { name: 'cooked white beans', quantity: 300, unit: 'g', slug: 'white-beans-cooked' },
        { name: 'onion', quantity: 120, unit: 'g', slug: 'onion-raw' },
        { name: 'carrot', quantity: 50, unit: 'g', slug: 'carrot-raw' },
        { name: 'tomato paste', quantity: 1, unit: 'tbsp', slug: 'tomato-paste' },
        { name: 'paprika', quantity: 1, unit: 'tsp', slug: 'paprika' },
        { name: 'dried thyme', quantity: 0.5, unit: 'tsp', slug: 'thyme-dried' },
        { name: 'garlic', quantity: 2, unit: 'clove', slug: 'garlic-raw' },
        { name: 'bay leaf', quantity: 1, unit: 'g', slug: 'bay-leaf' },
        { name: 'sunflower oil', quantity: 1, unit: 'tbsp', slug: 'sunflower-oil' },
        { name: 'fresh parsley', quantity: 8, unit: 'g', slug: 'parsley-fresh' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
        { name: 'Black pepper', quantity: 1, unit: 'to taste', slug: 'black-pepper' },
      ],
      instructions: [
        'Cook the sliced onion and diced carrot in the oil over low heat for 12 minutes until very soft and sweet.',
        'Stir in the tomato paste, paprika, thyme and garlic for 1 minute.',
        'Add the beans, bay leaf and 200 ml water; simmer for 20 minutes, mashing a few beans against the pot to thicken the sauce.',
        'Season, remove the bay leaf and serve with parsley.',
      ],
      nutritionInfo: { calories: 640, protein: 28, carbs: 90, fat: 17, fiber: 24 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegan', 'gluten-free', 'dairy-free', 'high-fiber', 'high-protein'],
      prepTimeMins: 10,
      cookTimeMins: 35,
      servings: 1,
    },
    {
      id: 'cur-ro-014',
      name: 'Tocăniță de dovlecei cu cartofi și mămăligă',
      description:
        'Summer courgette and potato stew with tomato, garlic and plenty of dill, served with a slice of mămăligă.',
      ingredients: [
        { name: 'courgette', quantity: 300, unit: 'g', slug: 'zucchini-raw' },
        { name: 'potatoes', quantity: 150, unit: 'g', slug: 'potato-raw' },
        { name: 'onion', quantity: 70, unit: 'g', slug: 'onion-raw' },
        { name: 'tomato', quantity: 150, unit: 'g', slug: 'tomato-raw' },
        { name: 'garlic', quantity: 2, unit: 'clove', slug: 'garlic-raw' },
        { name: 'fresh dill', quantity: 8, unit: 'g', slug: 'dill-fresh' },
        { name: 'sunflower oil', quantity: 1, unit: 'tbsp', slug: 'sunflower-oil' },
        { name: 'paprika', quantity: 0.5, unit: 'tsp', slug: 'paprika' },
        { name: 'cornmeal (polenta)', quantity: 50, unit: 'g', slug: 'polenta-dry' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
        { name: 'Black pepper', quantity: 1, unit: 'to taste', slug: 'black-pepper' },
      ],
      instructions: [
        'Soften the chopped onion in the oil for 4 minutes, then add the cubed potato and 100 ml water; simmer for 10 minutes.',
        'Add the diced courgette, chopped tomato, garlic and paprika and cook for 15 minutes until everything is tender.',
        'Cook the cornmeal in 200 ml salted water for 15 minutes, stirring, and slice or spoon it onto the plate.',
        'Season the stew, stir in the dill and serve with the mămăligă.',
      ],
      nutritionInfo: { calories: 560, protein: 13, carbs: 90, fat: 16, fiber: 11 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegan', 'gluten-free', 'dairy-free', 'high-fiber'],
      prepTimeMins: 10,
      cookTimeMins: 35,
      servings: 1,
    },
    {
      id: 'cur-ro-015',
      name: 'Ardei umpluți cu orez și legume',
      description:
        'Green peppers stuffed with rice, carrot, mushrooms and dill, baked in a fresh tomato sauce. A meat-free take on the Romanian classic.',
      ingredients: [
        { name: 'green peppers', quantity: 2, unit: 'large', slug: 'bell-pepper-green-raw' },
        { name: 'long-grain rice', quantity: 50, unit: 'g', slug: 'rice-white-dry' },
        { name: 'onion', quantity: 60, unit: 'g', slug: 'onion-raw' },
        { name: 'carrot', quantity: 40, unit: 'g', slug: 'carrot-raw' },
        { name: 'white mushrooms', quantity: 60, unit: 'g', slug: 'mushroom-white-raw' },
        { name: 'tomato passata', quantity: 200, unit: 'g', slug: 'tomato-puree' },
        { name: 'fresh dill', quantity: 6, unit: 'g', slug: 'dill-fresh' },
        { name: 'sunflower oil', quantity: 1, unit: 'tbsp', slug: 'sunflower-oil' },
        { name: 'paprika', quantity: 0.5, unit: 'tsp', slug: 'paprika' },
        { name: 'Salt', quantity: 1, unit: 'to taste', slug: 'salt' },
        { name: 'Black pepper', quantity: 1, unit: 'to taste', slug: 'black-pepper' },
      ],
      instructions: [
        'Cut the tops off the peppers and remove the seeds.',
        'Cook the chopped onion, carrot and mushrooms in the oil for 8 minutes, then stir in the rinsed rice, paprika, dill, salt and pepper.',
        'Fill the peppers about three-quarters full with the mixture and stand them upright in a pot.',
        'Pour in the passata mixed with 150 ml water, cover and simmer for 40 minutes until the rice and peppers are tender.',
      ],
      nutritionInfo: { calories: 480, protein: 12, carbs: 82, fat: 14, fiber: 11 },
      cuisineType: 'Romanian',
      dietaryTags: ['vegan', 'gluten-free', 'dairy-free', 'high-fiber'],
      prepTimeMins: 20,
      cookTimeMins: 50,
      servings: 1,
    },
  ] satisfies R[]
).map(withImage);
