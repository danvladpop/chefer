/**
 * Rows exempt from the §4.5 energy check, each with the reason the published
 * energy legitimately differs from 4P + 4C + 9F + 2Fiber. Allow-listed rows are
 * still reported (severity "info") so a reviewer sees them.
 *
 * Accepted reasons:
 *   - alcohol: ethanol supplies 7 kcal/g and is not a term of the formula;
 *   - polyols: 2.4 kcal/g (0 for erythritol), not a term of the formula;
 *   - spices / dried herbs: the source applies Atwater specific factors to a
 *     fiber-dominated composition;
 *   - organic acids (vinegar): acetic acid supplies 3 kcal/g (Regulation
 *     1169/2011 Annex XIV) and is not a term of the formula;
 *   - cocoa / carob: FDC applies Atwater specific factors (cocoa protein
 *     1.83 kcal/g, carbohydrate 1.33 kcal/g) that the EU formula does not.
 * The last two reasons extend the plan's list (alcohol, polyols, spices) and
 * need the owner's sign-off. Keep the list sorted by slug.
 */
const ALCOHOL = 'contains ethanol (7 kcal/g), which the macro formula does not count';
const SPICE =
  'dried spice: FDC energy uses Atwater specific factors on a fiber-dominated composition';
const ACETIC =
  'vinegar: acetic acid (3 kcal/g, EU 1169/2011 Annex XIV) is not a term of the macro formula';
const COCOA =
  'FDC energy uses Atwater specific factors for cocoa/carob (protein 1.83, carbohydrate 1.33 kcal/g)';

export const ENERGY_ALLOW_LIST: Readonly<Record<string, string>> = {
  allspice: SPICE,
  beer: ALCOHOL,
  'beer-light': ALCOHOL,
  'carob-powder': COCOA,
  'cocoa-powder': COCOA,
  'cocoa-powder-dutch': COCOA,
  'dill-seed': SPICE,
  'liqueur-coffee': ALCOHOL,
  marsala: ALCOHOL,
  sake: ALCOHOL,
  'spirits-80': ALCOHOL,
  'vanilla-extract': ALCOHOL,
  'vinegar-cider': ACETIC,
  'vinegar-distilled': ACETIC,
  'vinegar-wine': ACETIC,
  'wine-cooking': ALCOHOL,
  'wine-dessert': ALCOHOL,
  'wine-red': ALCOHOL,
  'wine-white': ALCOHOL,
};
