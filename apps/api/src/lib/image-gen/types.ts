export interface RecipeImageInput {
  recipeId: string;
  recipeName: string;
  cuisineType: string;
}

export interface IRecipeImageService {
  readonly name: string;
  /** Returns the public image URL for the recipe. */
  generate(input: RecipeImageInput): Promise<string>;
}
