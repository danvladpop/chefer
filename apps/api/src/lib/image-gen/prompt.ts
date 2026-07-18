/**
 * Builds an image prompt designed to produce an appetising, consistent food photo.
 *
 * Deliberately built ONLY from the recipe name and cuisine — never the free-text
 * description. The description varies between LLM runs for the same dish, and the
 * prompt is part of the Pollinations URL: keeping it stable means the same dish
 * always resolves to the same (CDN-cached) image across plan regenerations.
 */
export function buildRecipeImagePrompt(recipeName: string, cuisineType: string): string {
  return (
    `Professional food photography of "${recipeName}", ${cuisineType} cuisine. ` +
    `Shot from above at a slight angle on a clean white or wooden surface. ` +
    `Natural daylight, shallow depth of field, vibrant colours, highly detailed, ` +
    `appetising and restaurant-quality presentation. No text, no people, no cutlery overlaid.`
  );
}
