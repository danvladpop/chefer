import type { RecipeData } from '../types.js';

// ─── Swap Recipe Pool ─────────────────────────────────────────────────────────
// A pool of alternative recipes used by MockAIService.generateRecipeSwap.
// The mock cycles through this list deterministically.

const U = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&h=600&q=80`;

export const SWAP_BREAKFAST_POOL: RecipeData[] = [
  {
    id: 'swap-b-001',
    name: 'Banana Oat Pancakes',
    description: 'Fluffy flourless pancakes made with ripe bananas and rolled oats.',
    ingredients: [
      { name: 'ripe bananas', quantity: 2, unit: 'medium' },
      { name: 'rolled oats', quantity: 80, unit: 'g' },
      { name: 'eggs', quantity: 2, unit: 'large' },
      { name: 'cinnamon', quantity: 0.5, unit: 'tsp' },
      { name: 'coconut oil', quantity: 1, unit: 'tsp' },
    ],
    instructions: [
      'Mash bananas in a bowl until smooth.',
      'Blend oats into a flour using a blender.',
      'Mix bananas, oat flour, eggs, and cinnamon together.',
      'Heat coconut oil in a non-stick pan over medium heat.',
      'Cook small pancakes for 2–3 minutes per side until golden.',
    ],
    nutritionInfo: { calories: 360, protein: 14, carbs: 55, fat: 10, fiber: 6 },
    cuisineType: 'American',
    dietaryTags: ['gluten-free', 'vegetarian'],
    prepTimeMins: 5,
    cookTimeMins: 15,
    servings: 1,
    imageUrl: U('photo-1567620905732-2d1ec7ab7445'),
  },
  {
    id: 'swap-b-002',
    name: 'Smoked Salmon Bagel',
    description: 'Toasted whole-grain bagel with cream cheese, smoked salmon, and capers.',
    ingredients: [
      { name: 'whole-grain bagel', quantity: 1, unit: 'piece' },
      { name: 'light cream cheese', quantity: 40, unit: 'g' },
      { name: 'smoked salmon', quantity: 60, unit: 'g' },
      { name: 'capers', quantity: 1, unit: 'tbsp' },
      { name: 'red onion', quantity: 20, unit: 'g' },
      { name: 'fresh dill', quantity: 5, unit: 'g' },
    ],
    instructions: [
      'Toast the bagel until golden.',
      'Spread cream cheese on each half.',
      'Layer smoked salmon on top.',
      'Garnish with capers, red onion, and fresh dill.',
    ],
    nutritionInfo: { calories: 380, protein: 22, carbs: 42, fat: 12, fiber: 4 },
    cuisineType: 'European',
    dietaryTags: ['pescatarian'],
    prepTimeMins: 5,
    cookTimeMins: 3,
    servings: 1,
    imageUrl: U('photo-1606851091851-e8c8c0fca5ba'),
  },
];

export const SWAP_LUNCH_POOL: RecipeData[] = [
  {
    id: 'swap-l-001',
    name: 'Lentil & Roasted Veg Salad',
    description: 'Warm salad of green lentils, roasted seasonal vegetables, and tahini dressing.',
    ingredients: [
      { name: 'green lentils (cooked)', quantity: 150, unit: 'g' },
      { name: 'courgette', quantity: 100, unit: 'g' },
      { name: 'cherry tomatoes', quantity: 100, unit: 'g' },
      { name: 'red pepper', quantity: 80, unit: 'g' },
      { name: 'tahini', quantity: 20, unit: 'g' },
      { name: 'lemon juice', quantity: 2, unit: 'tbsp' },
      { name: 'garlic', quantity: 1, unit: 'clove' },
      { name: 'olive oil', quantity: 1, unit: 'tbsp' },
    ],
    instructions: [
      'Preheat oven to 200°C. Toss chopped veg with olive oil and roast 20 minutes.',
      'Whisk tahini, lemon juice, minced garlic, and 2 tbsp water into a dressing.',
      'Combine warm lentils and roasted veg in a bowl.',
      'Drizzle with tahini dressing and serve.',
    ],
    nutritionInfo: { calories: 420, protein: 22, carbs: 50, fat: 14, fiber: 14 },
    cuisineType: 'Mediterranean',
    dietaryTags: ['vegan', 'gluten-free', 'high-fiber'],
    prepTimeMins: 10,
    cookTimeMins: 25,
    servings: 1,
    imageUrl: U('photo-1540189549336-e6e99eb4f7c9'),
  },
  {
    id: 'swap-l-002',
    name: 'Tuna & Chickpea Bowl',
    description: 'Protein-packed bowl with tuna, chickpeas, cucumber, and lemon-herb dressing.',
    ingredients: [
      { name: 'canned tuna (in water)', quantity: 120, unit: 'g' },
      { name: 'canned chickpeas', quantity: 100, unit: 'g' },
      { name: 'cucumber', quantity: 100, unit: 'g' },
      { name: 'cherry tomatoes', quantity: 80, unit: 'g' },
      { name: 'parsley', quantity: 10, unit: 'g' },
      { name: 'olive oil', quantity: 1, unit: 'tbsp' },
      { name: 'lemon juice', quantity: 1, unit: 'tbsp' },
    ],
    instructions: [
      'Drain and rinse tuna and chickpeas.',
      'Dice cucumber and halve tomatoes.',
      'Combine all ingredients in a bowl.',
      'Dress with olive oil, lemon juice, salt, and pepper.',
    ],
    nutritionInfo: { calories: 390, protein: 35, carbs: 30, fat: 12, fiber: 8 },
    cuisineType: 'Mediterranean',
    dietaryTags: ['gluten-free', 'pescatarian', 'high-protein'],
    prepTimeMins: 10,
    cookTimeMins: 0,
    servings: 1,
    imageUrl: U('photo-1490645935967-10de6ba17061'),
  },
];

export const SWAP_DINNER_POOL: RecipeData[] = [
  {
    id: 'swap-d-001',
    name: 'Turkey & Vegetable Meatballs',
    description: 'Lean turkey meatballs in a light tomato sauce with courgette and spinach.',
    ingredients: [
      { name: 'lean turkey mince', quantity: 180, unit: 'g' },
      { name: 'courgette (grated)', quantity: 80, unit: 'g' },
      { name: 'egg', quantity: 1, unit: 'large' },
      { name: 'garlic', quantity: 2, unit: 'cloves' },
      { name: 'canned tomatoes', quantity: 200, unit: 'g' },
      { name: 'baby spinach', quantity: 60, unit: 'g' },
      { name: 'olive oil', quantity: 1, unit: 'tbsp' },
      { name: 'Italian seasoning', quantity: 1, unit: 'tsp' },
    ],
    instructions: [
      'Mix turkey, grated courgette, egg, garlic, and seasoning. Form into balls.',
      'Brown meatballs in olive oil over medium-high heat, 4 minutes per side.',
      'Add canned tomatoes and simmer 15 minutes.',
      'Stir in spinach until wilted and serve.',
    ],
    nutritionInfo: { calories: 460, protein: 42, carbs: 18, fat: 22, fiber: 5 },
    cuisineType: 'Italian',
    dietaryTags: ['gluten-free', 'high-protein'],
    prepTimeMins: 15,
    cookTimeMins: 25,
    servings: 1,
    imageUrl: U('photo-1529042410759-befb1204b468'),
  },
  {
    id: 'swap-d-002',
    name: 'Black Bean & Sweet Potato Tacos',
    description: 'Smoky black bean and roasted sweet potato tacos with avocado crema.',
    ingredients: [
      { name: 'corn tortillas', quantity: 3, unit: 'pieces' },
      { name: 'canned black beans', quantity: 150, unit: 'g' },
      { name: 'sweet potato', quantity: 200, unit: 'g' },
      { name: 'avocado', quantity: 0.5, unit: 'medium' },
      { name: 'Greek yogurt', quantity: 40, unit: 'g' },
      { name: 'lime juice', quantity: 1, unit: 'tbsp' },
      { name: 'smoked paprika', quantity: 1, unit: 'tsp' },
      { name: 'cumin', quantity: 0.5, unit: 'tsp' },
    ],
    instructions: [
      'Cube sweet potato, toss with paprika, cumin, oil, and roast at 200°C for 25 minutes.',
      'Warm black beans in a pan with cumin and salt.',
      'Blend avocado, yogurt, lime juice, and salt into crema.',
      'Warm tortillas and assemble with beans, sweet potato, and crema.',
    ],
    nutritionInfo: { calories: 490, protein: 18, carbs: 72, fat: 16, fiber: 16 },
    cuisineType: 'Mexican',
    dietaryTags: ['vegan', 'high-fiber'],
    prepTimeMins: 10,
    cookTimeMins: 30,
    servings: 1,
    imageUrl: U('photo-1565299585323-38d6b0865b47'),
  },
];

export const SWAP_SNACK_POOL: RecipeData[] = [
  {
    id: 'swap-s-001',
    name: 'Hummus & Veggie Sticks',
    description: 'Creamy hummus with crunchy carrot, celery, and cucumber sticks.',
    ingredients: [
      { name: 'hummus', quantity: 80, unit: 'g' },
      { name: 'carrots', quantity: 80, unit: 'g' },
      { name: 'celery', quantity: 60, unit: 'g' },
      { name: 'cucumber', quantity: 60, unit: 'g' },
    ],
    instructions: ['Cut vegetables into sticks.', 'Serve alongside hummus for dipping.'],
    nutritionInfo: { calories: 180, protein: 7, carbs: 22, fat: 8, fiber: 6 },
    cuisineType: 'Middle Eastern',
    dietaryTags: ['vegan', 'gluten-free', 'high-fiber'],
    prepTimeMins: 5,
    cookTimeMins: 0,
    servings: 1,
    imageUrl: U('photo-1540420773420-3366772f4999'),
  },
  {
    id: 'swap-s-002',
    name: 'Cottage Cheese & Pineapple',
    description: 'High-protein cottage cheese topped with fresh pineapple chunks.',
    ingredients: [
      { name: 'low-fat cottage cheese', quantity: 150, unit: 'g' },
      { name: 'fresh pineapple', quantity: 100, unit: 'g' },
      { name: 'chia seeds', quantity: 5, unit: 'g' },
    ],
    instructions: [
      'Scoop cottage cheese into a bowl.',
      'Top with pineapple chunks and chia seeds.',
    ],
    nutritionInfo: { calories: 190, protein: 18, carbs: 22, fat: 3, fiber: 2 },
    cuisineType: 'International',
    dietaryTags: ['vegetarian', 'gluten-free', 'high-protein'],
    prepTimeMins: 3,
    cookTimeMins: 0,
    servings: 1,
    imageUrl: U('photo-1546069901-ba9599a7e63c'),
  },
];

// Combined map for easy lookup by meal type
export const SWAP_POOL_BY_TYPE: Record<string, RecipeData[]> = {
  breakfast: SWAP_BREAKFAST_POOL,
  lunch: SWAP_LUNCH_POOL,
  dinner: SWAP_DINNER_POOL,
  snack: SWAP_SNACK_POOL,
};
