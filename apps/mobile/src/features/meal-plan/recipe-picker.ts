// Section builder for the replace-recipe picker sheet: the user's own
// recipes (created + favourited) surface above the general catalog.
export interface PickerSection<T> {
  title: string;
  data: T[];
}

export function buildPickerSections<T extends { id: string; isFavourite?: boolean }>(
  mine: T[] | undefined,
  all: T[] | undefined,
): PickerSection<T>[] {
  const seen = new Set<string>();
  const yours: T[] = [];
  for (const recipe of mine ?? []) {
    if (!seen.has(recipe.id)) {
      seen.add(recipe.id);
      yours.push(recipe);
    }
  }
  for (const recipe of all ?? []) {
    if (recipe.isFavourite && !seen.has(recipe.id)) {
      seen.add(recipe.id);
      yours.push(recipe);
    }
  }
  const rest = (all ?? []).filter((recipe) => !seen.has(recipe.id));

  const sections: PickerSection<T>[] = [];
  if (yours.length > 0) {
    sections.push({ title: 'Your recipes', data: yours });
  }
  if (rest.length > 0) {
    sections.push({ title: 'All recipes', data: rest });
  }
  return sections;
}
