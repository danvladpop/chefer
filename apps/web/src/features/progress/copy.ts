import type { AchievementGroup, PlanSlotMealType } from '@chefer/types';

// Kitchen progress: the strings that only the web app needs (page chrome,
// labels around the shared rewards copy). Everything about the rewards system
// itself (receipts, ranks, the Flame, achievements, Biscuit) lives in
// `@chefer/utils` `progress/copy.ts`, shared with mobile. Scanned by
// `chefer/no-forbidden-copy` (`features/*/copy.ts`). Same rules: invitational,
// never shame, never praise eating less, no safety claims.

export const PROGRESS_WEB_COPY = {
  notAvailableTitle: 'Not available yet',
  notAvailableBody: 'Kitchen progress isn’t switched on for your account. Check back soon.',
  backToToday: 'Back to Today',
  thisWeek: 'This week',
  bonus: 'bonus',
  next: 'next',
  newBest: 'New best',
  newBadge: 'New badge',
  levelUpToast: 'Level up',
  levelLabel: 'Level',
  closeFlame: 'Close',
  weeklyGoalSuffix: 'days',
  weeksAbbrev: 'wk',
  tapForDetails: 'Open details',
  openFlame: 'Open your flame',
  achievementsAll: 'All',
  achievementsFilter: 'Filter by group',
  achievementsLoadError: 'Couldn’t load your achievements.',
  achievementsEmpty: 'Nothing here yet. Cook, log or train and badges start to appear.',
  achievementTier: 'Tier',
  achievementDone: 'Every tier earned',
  recapTitle: 'Weekly recap',
  recapEyebrow: 'Your week',
  recapSteps: 'Recap cards',
  recapLoadError: 'Couldn’t load this recap.',
  recapBadWeek: 'That week isn’t one we can show.',
  recapHeadline: 'The kitchen was busy this week.',
  recapHeadlineQuiet: 'A calm week in the kitchen.',
  recapCooked: 'meals cooked at home',
  recapWorkouts: 'workouts',
  recapWorkoutsGoalMet: 'workouts · goal met',
  recapPrs: 'new PRs',
  recapNewRecipes: 'new recipes tried',
  recapDish: 'Dish of the week',
  recapFlame: 'Flame',
  recapXp: 'XP earned',
  recapBiscuit: 'Biscuit’s take',
  recapNext: 'Next',
  recapBack: 'Back',
  recapClose: 'Close recap',
  settingsLoadError: 'Couldn’t load your rewards settings.',
  celebrationsLabel: 'Celebrations',
  goalDaysOption: (n: number): string => (n === 1 ? '1 day' : `${n} days`),
  pauseWeeksLabel: 'For how long',
  pauseWeeksOption: (n: number): string => (n === 1 ? '1 week' : `${n} weeks`),
  introHistory: (xp: number, badges: number): string =>
    `Your history earned ${xp.toLocaleString()} XP and ${badges} ${badges === 1 ? 'badge' : 'badges'}.`,
  cookCountLine: (count: number, mealType: PlanSlotMealType | undefined): string =>
    `Home-cooked ${mealType && mealType !== 'snack' ? mealType : 'meal'} #${count}`,
  xpToLevel: (xp: number, forLevel: number): string => `${xp} / ${forLevel}`,
  badgesCount: (earned: number): string => `${earned}`,
  youProgress: 'Your progress',
} as const;

export const ACHIEVEMENT_GROUP_LABELS: Record<AchievementGroup, string> = {
  KITCHEN: 'Kitchen',
  TABLE: 'Table',
  GYM: 'Gym',
  FLAME: 'Flame',
  PLAN: 'Plan',
};

export const ACHIEVEMENT_GROUP_ICONS: Record<AchievementGroup, string> = {
  KITCHEN: '🍳',
  TABLE: '🥗',
  GYM: '🏋️',
  FLAME: '🔥',
  PLAN: '🗓️',
};
