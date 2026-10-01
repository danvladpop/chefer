import type { FriendsMeDto } from '@chefer/types';

// ─── The `{sections}` of the Public confirm (UX §11.2) ─────────────────────────
// `Anyone on Chefer will be able to follow you without asking, and then see
// what you share: {sections}.` — the list names what is switched on right now
// ("meals, recipes and workouts"; with targets on: "meals, recipes, workouts
// and daily targets"). FRIENDS_COPY takes the list pre-joined and has no
// fragments for it, so the nouns live here; with nothing shared, the profile
// itself (name and photo) is what's left to see.
// TODO(copy owner): move the fragments into FRIENDS_COPY.public.confirm.

const SECTION_NOUNS = [
  ['sharePlan', 'meals'],
  ['shareRecipes', 'recipes'],
  ['shareWorkouts', 'workouts'],
  ['shareTargets', 'daily targets'],
] as const;

export function sharedSectionsList(settings: NonNullable<FriendsMeDto['settings']>): string {
  const nouns: string[] = SECTION_NOUNS.filter(([key]) => settings[key]).map(([, noun]) => noun);
  if (nouns.length === 0) return 'your name and photo';
  if (nouns.length === 1) return nouns[0] ?? '';
  return `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`;
}
