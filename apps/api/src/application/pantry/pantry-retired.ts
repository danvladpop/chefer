/**
 * WP-24 / FB7-10: the "In my kitchen" pantry is retired from the product.
 *
 * The ONE switch. While `true`:
 *  - the shopping list no longer applies the pantry (nothing is marked "Have it",
 *    nothing is subtracted, `pantry` on the list is the neutral zero value);
 *  - ticking a list item no longer seeds the pantry (and unticking no longer reverts it);
 *  - plan generation gets no "use first" hint and reports no used-pantry items;
 *  - the chat `whatCanIMake` tool and the coach's weekly `savedEur` stop reading the pantry.
 *
 * Nothing is deleted: the `PantryItem` table, the `pantry.*` procedures and every
 * output field stay, so shipped app binaries keep working and the whole feature
 * comes back by flipping this to `false` (the pantry tests pin that path with a mock).
 */
export const PANTRY_RETIRED = true;
