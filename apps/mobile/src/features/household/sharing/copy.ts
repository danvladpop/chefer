// Mobile-only strings of household sharing (ADR 0002) that have no shared `HOUSEHOLD_SHARING_COPY`
// entry: app chrome the web flow draws differently (the in-app signed-out step, the way back to the
// Meals tab, offline lines). Everything a partner reads about the sharing itself comes from the
// shared copy.

export const HOUSEHOLD_MOBILE_COPY = {
  goToMeals: 'Go to Meals',
  offlineJoin: 'Connect to the internet to join.',
  // Signed-out visitors in the app (the invite preview needs an account).
  signedOutBody:
    'Sign in or create a free account to join. You’ll come straight back to this invite.',
  signIn: 'Sign in',
  createAccount: 'Create account',
} as const;

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };

/**
 * The `portion` argument of `HOUSEHOLD_SHARING_COPY.joinPortion` ("You eat ¾ of each meal."):
 * a fraction for less than one, "a full portion" for one, "1½ portions" above.
 */
export function joinPortionPhrase(portionFactor: number): string {
  const whole = Math.floor(portionFactor);
  const frac = Math.round((portionFactor - whole) * 100) / 100;
  const glyph = FRACTIONS[String(frac)];
  if (portionFactor === 1) return 'a full portion';
  if (whole === 0 && glyph) return glyph;
  const amount = glyph ? `${whole}${glyph}` : String(Math.round(portionFactor * 100) / 100);
  return `${amount} portions`;
}
