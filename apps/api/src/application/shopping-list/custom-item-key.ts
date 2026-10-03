/**
 * The stable key of a user-added shopping-list line. One definition shared by
 * the service (which stores it) and the AI chat tool (which reports it, so the
 * app can offer Undo through `shoppingList.removeCustomItem`).
 */
export function customItemKey(planId: string, name: string, unit: string): string {
  return `${planId}-custom-${name.toLowerCase().trim().replace(/\s+/g, '-')}-${unit.toLowerCase().trim()}`;
}
