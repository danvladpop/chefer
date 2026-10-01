/**
 * Rows exempt from the §4.5 energy check, each with the reason the published
 * energy legitimately differs from 4P + 4C + 9F + 2Fiber. Allow-listed rows are
 * still reported (severity "info") so a reviewer sees them.
 *
 * Only three reasons are acceptable (plan §4.5): the row contains alcohol
 * (7 kcal/g, not in the formula), polyols (2.4 kcal/g, or 0 for erythritol), or
 * it is a spice/dried herb whose source uses specific Atwater factors on a
 * fiber-dominated composition. Keep the list sorted by slug.
 */
export const ENERGY_ALLOW_LIST: Readonly<Record<string, string>> = {};
