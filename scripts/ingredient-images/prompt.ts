/**
 * Shared product-shot prompt for ingredient thumbnails (used by
 * scripts/ingredient-images/vendor.ts and scripts/fix-ingredient-images.ts).
 * Pure — no env, no network.
 */

// Hard cases where the generic prompt produced the wrong subject on the first
// generation pass (verified visually): a more literal subject description
// beats a reseed. Keyed by the lowercase ingredient name / canonical key.
export const PROMPT_OVERRIDES: Record<string, string> = {
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
  // R-21: the generic prompt rendered a lime / a tart. Literal subjects, with
  // the colour and shape spelled out so the model cannot drift to citrus or pastry.
  cucumber: 'a whole long dark green cucumber vegetable',
  cucumbers: 'two whole long dark green cucumber vegetables',
  radishes: 'a small bunch of fresh round red radish root vegetables with green leaves',
  radish: 'a few fresh round red radish root vegetables with green leaves',
};

/**
 * Extra subjects found while reviewing the vendored thumbnails (WP-24, 2026-10-07):
 * the terse prompt drifted (chicken breast → bread, olive oil → abstract bowl,
 * canned tuna → sushi…). Vendor-only, so the legacy fix script's URLs stay stable.
 */
export const VENDOR_PROMPT_OVERRIDES: Record<string, string> = {
  'boneless chicken thighs': 'raw boneless skinless chicken thighs on a white plate',
  'canned tuna': 'an open tin can of tuna chunks',
  'canned black beans': 'black beans in a small white bowl',
  'cayenne pepper': 'red cayenne pepper powder in a small ceramic bowl',
  'chia seeds': 'chia seeds in a small white bowl',
  'buckwheat groats': 'raw buckwheat groats in a small white bowl',
  'arborio rice': 'dry short-grain arborio rice in a small white bowl',
  'coconut oil': 'a small glass jar of white coconut oil',
  'cooked sushi rice': 'a white bowl of cooked sticky white rice',
  courgette: 'a whole fresh green zucchini',
  'olive oil': 'a glass bottle of golden olive oil',
  'cooked king prawns': 'cooked pink shrimp on a white plate',
  'balsamic vinegar': 'a glass bottle of dark balsamic vinegar',
  // Second review pass (full sheet, 215 images).
  besan: 'yellow chickpea gram flour in a small white bowl',
  'boiled potato': 'a few whole boiled potatoes on a white plate',
  'chestnut mushrooms': 'fresh brown chestnut mushrooms',
  'coconut yogurt': 'a white bowl of coconut yogurt',
  'corn tortillas': 'a stack of round corn tortillas',
  'dark chocolate': 'broken pieces of dark chocolate bar',
  'dijon mustard': 'a small glass jar of dijon mustard',
  'dried apricots': 'dried orange apricots in a small bowl',
  'egg yolk': 'a single raw egg yolk in a small white bowl',
  'firm tofu': 'a block of white firm tofu',
  'plain flour': 'white wheat flour in a small bowl',
  'frozen banana': 'frozen banana slices on a plate',
  'frozen strawberries': 'frozen strawberries in a small bowl',
  'ground ginger': 'ground ginger spice powder in a small ceramic bowl',
  halloumi: 'grilled halloumi cheese slices on a plate',
  honey: 'a glass jar of golden honey with a honey dipper',
  hummus: 'a bowl of creamy hummus',
  'kalamata olives': 'dark purple kalamata olives in a small bowl',
  'lemon zest': 'finely grated yellow lemon zest in a small bowl',
  mango: 'a whole ripe yellow mango',
  'maple syrup': 'a glass bottle of maple syrup',
  'medjool dates': 'sticky brown medjool dates in a small bowl',
  'mixed leaves': 'a bowl of mixed green salad leaves',
  'miso paste': 'a small bowl of brown miso paste',
  'pumpkin seeds': 'green pumpkin seeds in a small white bowl',
  'peanut butter': 'a glass jar of peanut butter',
  potato: 'three whole raw brown potatoes',
  rocket: 'fresh arugula rocket leaves',
  'rye bread': 'a loaf of dark rye bread',
  'sauerkraut leaves': 'a bowl of sauerkraut',
  'sirloin steak': 'a raw sirloin beef steak on a white plate',
  'snap peas': 'fresh green snap pea pods',
  'sour pickles': 'dill pickles in a glass jar',
  sriracha: 'a red bottle of sriracha hot chili sauce',
  'sushi-grade salmon': 'a raw salmon fillet on a white plate',
  tahini: 'a glass jar of tahini sesame paste',
  'vanilla protein powder': 'a white scoop of protein powder',
  'vegetable oil': 'a glass bottle of yellow vegetable oil',
  'whole-wheat couscous': 'dry couscous grains in a small bowl',
  'whole-wheat tortilla': 'a stack of round flour tortillas',
  'wholewheat tortillas': 'a stack of round flour tortillas',
  'wholemeal bread': 'a loaf of wholemeal bread',
  zacusca: 'a small glass jar of red roasted vegetable spread',
  'fresh ginger': 'raw ginger root (hand of ginger), knobby light-brown rhizome, grocery produce',
  ginger: 'raw ginger root (hand of ginger), knobby light-brown rhizome, grocery produce',
  onion:
    'a whole yellow onion with golden-brown papery skin next to a halved onion showing white rings',
  cashews: 'raw kidney-shaped cashew nuts in a small white bowl',
  'ground pork': 'raw minced pork meat in a white bowl',
  'lean beef mince': 'raw minced beef meat in a white bowl',
  'lean turkey mince': 'raw minced turkey meat in a white bowl',
  'chicken breast': 'a raw pale pink chicken breast fillet on a white plate',
  'ground coriander': 'light brown ground coriander powder in a small white bowl',
};

/** The literal subject to draw for an ingredient (override, else the name itself). */
export function productShotSubject(
  name: string,
  alternateKey?: string,
  overrides: Record<string, string> = PROMPT_OVERRIDES,
): string {
  const keys = [name, alternateKey].flatMap((k) => (k ? [k.toLowerCase().trim()] : []));
  for (const k of keys) if (overrides[k]) return overrides[k];
  return name;
}

/**
 * Deterministic product-shot prompt for an ingredient name. Deliberately terse:
 * Pollinations' anonymous Flux tier drifted to abstract discs / people / pill
 * shapes with the older long "single food ingredient … top-down … no text"
 * wording (apple → a white disc), while "<subject>, food photography, white
 * background" is reliably on-subject.
 */
export function productShotPrompt(name: string, alternateKey?: string): string {
  return `${productShotSubject(name, alternateKey, { ...PROMPT_OVERRIDES, ...VENDOR_PROMPT_OVERRIDES })}, food photography, centered on a plain white background, studio lighting`;
}

/**
 * The long prompt the API's generated fallback and scripts/fix-ingredient-images.ts
 * use. Kept byte-for-byte so those deterministic Pollinations URLs stay valid.
 */
export function legacyProductShotPrompt(name: string): string {
  return (
    `A clean product photo of ${productShotSubject(name)}, single food ingredient on a plain light background, ` +
    'top-down, soft natural light, no text, no hands, no packaging branding.'
  );
}
