import type { Translator } from '@chefer/i18n';
import type { FriendsMeDto } from '@chefer/types';

// ─── The `{sections}` of the Public confirm (UX §11.2) ─────────────────────────
// `Anyone on Chefer will be able to follow you without asking, and then see
// what you share: {sections}.` — the list names what is switched on right now
// ("meals, recipes and workouts"; with targets on: "meals, recipes, workouts
// and daily targets"). The Public confirm message takes the list pre-joined;
// the nouns are `friends.public.sections.*` and the last join is
// `friends.public.sectionsAnd`. With nothing shared, the profile itself (name
// and photo) is what's left to see.

const SECTION_NOUNS = [
  ['sharePlan', 'friends.public.sections.meals'],
  ['shareRecipes', 'friends.public.sections.recipes'],
  ['shareWorkouts', 'friends.public.sections.workouts'],
  ['shareTargets', 'friends.public.sections.targets'],
] as const;

/** The sections a new Public profile shares by default: meals, recipes and workouts. */
export function turnOnSectionsList(t: Translator['t']): string {
  return t('friends.public.sectionsAnd', {
    head: `${t('friends.public.sections.meals')}, ${t('friends.public.sections.recipes')}`,
    last: t('friends.public.sections.workouts'),
  });
}

export function sharedSectionsList(
  settings: NonNullable<FriendsMeDto['settings']>,
  t: Translator['t'],
): string {
  const nouns: string[] = SECTION_NOUNS.filter(([key]) => settings[key]).map(([, noun]) => t(noun));
  if (nouns.length === 0) return t('friends.public.sections.profileOnly');
  if (nouns.length === 1) return nouns[0] ?? '';
  return t('friends.public.sectionsAnd', {
    head: nouns.slice(0, -1).join(', '),
    last: nouns[nouns.length - 1] ?? '',
  });
}
