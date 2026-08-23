/**
 * fix-ingredient-images.ts
 *
 * ONE-TIME REPAIR SCRIPT — 2026-08-23 ingredient-catalog image audit.
 *
 * A visual audit of every Unsplash-cached ingredient thumbnail (contact sheet
 * of ingredient_images, dev + prod) found ~60 rows whose photo does not show
 * the ingredient (avocado → sushi rolls, dijon mustard → a pancake-syrup
 * bottle, pine nuts → pine cones, one wok photo shared by every ground meat,
 * dev's legacy shared category fallbacks, …). Macros were audited in the same
 * pass and are healthy (0 range violations; the only Atwater outliers are
 * spices/extracts whose fiber/alcohol energy is legitimately non-4/4/9).
 *
 * Deleting the bad cache rows is NOT enough: any env with UNSPLASH_ACCESS_KEY
 * would re-resolve the same wrong top hit. So this script emits SQL that
 * OVERWRITES each flagged name with the deterministic per-ingredient
 * Pollinations product shot (the exact URL the resolver's keyless fallback
 * generates — see apps/api/src/lib/ingredient-images/index.ts), and NULLs any
 * matching global ingredient_prices.imageUrl so the repaired cache row wins.
 * Custom (creatorId) rows are never touched. Running it twice is a no-op
 * (same deterministic URLs).
 *
 * Usage (emit SQL, then apply per environment):
 *   npx tsx scripts/fix-ingredient-images.ts > /tmp/fix-images.sql
 *   # extra per-DB names (one per line), e.g. rows sharing one URL:
 *   npx tsx scripts/fix-ingredient-images.ts --extra-file /tmp/names.txt > /tmp/fix-images.sql
 *
 *   dev:  docker exec -i chefer-postgres psql -U postgres -d chefer_dev < /tmp/fix-images.sql
 *   prod: ssh chefer "docker exec -i chefer-postgres psql -U chefer -d chefer" < /tmp/fix-images.sql
 */

import { readFileSync } from 'node:fs';
import { buildPollinationsUrl } from '../apps/api/src/lib/image-gen/pollinations';

// Names flagged by the 2026-08-23 visual audit of the prod contact sheet.
// Kept verbatim (normalized lowercase, matching the ingredient_images PK).
const FLAGGED: string[] = [
  // wrong subject entirely
  'avocado', // sushi rolls
  'basmati rice (dry)', // spoon of spice powder
  'brown rice (dry)', // spoon of spice powder
  'bell pepper', // autumn pumpkin decor
  'carrots', // stems in a glass vase
  'cauliflower mash', // person holding flowers
  'cauliflower pizza crust', // half-eaten plate
  'cauliflower rice', // ornamental cabbage
  'celery', // parsley sprigs
  'celery stalks', // parsley sprigs
  'chives (chopped)', // dough on a board
  'cinnamon', // seasonal decor
  'corn', // a corn field landscape
  'cumin', // wildflowers and sky
  'dijon mustard', // branded pancake-syrup bottle
  'dill', // two cucumbers
  'fresh basil', // a plated pasta dish
  'ginger dressing', // branded BBQ-sauce bottles
  'ginger, grated', // shredded coconut
  'maple syrup', // dark dessert plate
  'marinara sauce (no sugar added)', // crate of raw tomatoes
  'mixed seeds (pumpkin, sunflower)', // sunflower field
  'nutritional yeast (optional, for cheesy flavor)', // grocery shelf
  'olive oil', // cosmetics bottle
  'parsley', // seafood platter
  'parsnips', // white wildflowers
  'pine nuts', // pine cones
  'rice vinegar', // spoon of grains
  'tamari', // bowl of curry powder
  'tempeh', // bitter gourds
  'thyme', // flowering heather
  'vegetable broth', // deconstructed-vegetable art
  'water', // dark abstract
  // branded packaging / product shots of the wrong product
  'greek yogurt',
  'greek yogurt (full-fat)',
  'vanilla protein powder',
  'mayonnaise',
  'mayonnaise (paleo)',
  'mayonnaise (paleo-friendly)',
  'paleo mayonnaise',
  'light cream cheese',
  'collagen peptides',
  // one shared photo across a whole family (near-duplicates)
  'almond butter',
  'almond flour',
  'almond flour tortilla',
  'almond milk',
  'ground beef',
  'ground beef (lean)',
  'ground lamb',
  'ground pork',
  'ground tempeh',
  'ground turkey',
  'lean turkey mince',
  'cod fillet',
  'cod fillets',
  'cooked turkey breast',
  // misleading enough to replace
  'basil', // ornamental purple plant
  'broccoli', // bolted/flowering broccoli
  'broccoli florets',
  'cherry tomatoes', // plated composition
  'cooked shrimp', // plate of leftover shells
  'shrimp (peeled, deveined)',
  'fajita seasoning (paleo)', // night-time mortar scene
  'green curry paste', // stir-fry pan
  'green curry paste (paleo)',
  'mixed greens', // blurry moss
  'paprika', // fresh chili
  'pepper', // fresh chili (row is the spice)
  'salt and pepper', // raw steak
  'sesame oil', // sesame seeds
];

// Pollinations rows whose deterministic render came out off-prompt: same
// prompt, different seed (the " v2" suffix only changes the seed input).
const RESEED: string[] = ['blueberries', 'canned tomatoes'];

// Hard cases where the generic prompt produced the wrong subject on the first
// generation pass (verified visually): a more literal subject description
// beats a reseed. Changing the prompt changes the URL, so these re-render.
const PROMPT_OVERRIDES: Record<string, string> = {
  'bell pepper': 'a whole fresh red bell pepper',
  cumin: 'ground cumin spice powder in a small ceramic bowl',
  dill: 'a bunch of fresh dill herb fronds',
  thyme: 'fresh thyme herb sprigs',
  paprika: 'red paprika spice powder in a small ceramic bowl',
  pepper: 'ground black pepper in a small ceramic bowl',
  tamari: 'a small glass bottle of dark tamari soy sauce',
  'tamari (paleo)': 'a small glass bottle of dark tamari soy sauce',
  'soy sauce (or tamari)': 'a small glass bottle of dark soy sauce',
  'fajita seasoning (paleo)': 'fajita spice seasoning mix in a small ceramic bowl',
  'ground lamb': 'raw ground minced lamb meat on butcher paper',
  'ground pork': 'raw ground minced pork meat on butcher paper',
  'ground tempeh': 'crumbled tempeh pieces in a small bowl',
  'lean turkey mince': 'raw ground minced turkey meat on butcher paper',
  'green lentils (cooked)': 'cooked green lentils in a small ceramic bowl',
};

function productShotUrl(name: string, seedSuffix = ''): string {
  const subject = PROMPT_OVERRIDES[name] ?? name;
  const prompt =
    `A clean product photo of ${subject}, single food ingredient on a plain light background, ` +
    'top-down, soft natural light, no text, no hands, no packaging branding.';
  return buildPollinationsUrl(prompt, name + seedSuffix, 'ingredient', 256, 256);
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const extraIdx = process.argv.indexOf('--extra-file');
const extra =
  extraIdx >= 0 && process.argv[extraIdx + 1]
    ? readFileSync(process.argv[extraIdx + 1]!, 'utf8')
        .split('\n')
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0)
    : [];

const statements: string[] = ['BEGIN;'];
const seen = new Set<string>();
for (const raw of [...FLAGGED, ...extra]) {
  const name = raw.toLowerCase().trim();
  if (seen.has(name) || RESEED.includes(name)) continue;
  seen.add(name);
  const url = productShotUrl(name);
  statements.push(
    `INSERT INTO ingredient_images ("ingredientName","imageUrl","resolvedAt") VALUES (${sqlString(name)}, ${sqlString(url)}, now()) ON CONFLICT ("ingredientName") DO UPDATE SET "imageUrl" = EXCLUDED."imageUrl", "resolvedAt" = now();`,
    `UPDATE ingredient_prices SET "imageUrl" = NULL WHERE "ingredientName" = ${sqlString(name)} AND "creatorId" IS NULL AND "imageUrl" IS NOT NULL;`,
  );
}
for (const name of RESEED) {
  const url = productShotUrl(name, ' v2');
  statements.push(
    `INSERT INTO ingredient_images ("ingredientName","imageUrl","resolvedAt") VALUES (${sqlString(name)}, ${sqlString(url)}, now()) ON CONFLICT ("ingredientName") DO UPDATE SET "imageUrl" = EXCLUDED."imageUrl", "resolvedAt" = now();`,
  );
}
statements.push('COMMIT;');

console.log(statements.join('\n'));
console.error(`[fix-ingredient-images] ${seen.size + RESEED.length} names → SQL on stdout`);
