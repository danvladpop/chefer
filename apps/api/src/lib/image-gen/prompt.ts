/**
 * Builds an Imagen prompt designed to produce an appetising, consistent food photo.
 */
export function buildRecipeImagePrompt(
  recipeName: string,
  cuisineType: string,
  description: string,
): string {
  return (
    `Professional food photography of "${recipeName}", ${cuisineType} cuisine. ` +
    `${description} ` +
    `Shot from above at a slight angle on a clean white or wooden surface. ` +
    `Natural daylight, shallow depth of field, vibrant colours, highly detailed, ` +
    `appetising and restaurant-quality presentation. No text, no people, no cutlery overlaid.`
  );
}
