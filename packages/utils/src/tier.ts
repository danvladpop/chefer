// GLOSSARY "Tier": Free or Premium. An admin has every feature without a
// Premium plan (the API's `isPremiumUser` grants them all), so the UI shows
// them as Premium — but with no plan to switch off, so it is its own case.
export type Tier = 'free' | 'premium' | 'admin';

export function tierOf(user: { role: string; planTier: string }): Tier {
  if (user.role === 'ADMIN') return 'admin';
  return user.planTier === 'PREMIUM' ? 'premium' : 'free';
}
