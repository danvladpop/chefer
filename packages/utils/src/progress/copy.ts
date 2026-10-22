import type {
  AchievementId,
  PlanSlotMealType,
  QuestKind,
  RankId,
  ReceiptLineCode,
  TodaysThreeQuest,
} from '@chefer/types';

// ─── Kitchen progress copy (docs/gamification-2026-10/README.md §2) ───────────
// Every user-facing Kitchen progress string, shared by mobile and web. Scanned
// by `chefer/no-forbidden-copy` and `copy-lint.test.ts`. Rules: invitational,
// never shame ("missed", "lost", "broke", "0-week"), never praise eating less
// or weighing less, no medical/safety claims ("safe" is banned, so a pilot
// light never "keeps your streak safe").

export const PROGRESS_COPY = {
  stripTitleFallback: 'Kitchen progress',
  xpToRank: 'XP to', // "340 / 500 XP to Chef de Partie"
  maxRank: 'Top rank reached',
  activeDays: 'active days',
  todaysThreeTitle: "Today's three",
  todaysThreeFooter: 'Finish all three for a bonus.',
  todaysThreeAllDone: 'All three done. Nice work.',
  receiptTitle: 'Kitchen receipt',
  softCapNote: 'Busy day: extra actions still count, at half XP.',
  levelUpTitle: 'Level up!',
  levelUpContinue: 'Keep cooking',
  flameTitle: 'Your flame',
  flameActiveDayExplainer:
    'An active day is any day you cook, log a meal or train. Reach your goal this week and the flame grows. Rest days never break it.',
  flameZero: 'Your flame lights up when you reach this week’s goal.',
  pilotLightsTitle: 'Pilot lights',
  pilotLightsBody:
    'Keep the flame lit through a busy or sick week. They’re used automatically, and you earn one every 4 good weeks.',
  flameMilestonesTitle: 'Flame milestones',
  changeGoal: 'Change weekly goal',
  pauseTitle: 'Pause my flame',
  pauseBody: 'Holiday, illness, life. Your flame waits until you’re back, for up to 4 weeks.',
  pauseCta: 'Pause from today',
  pausedUntil: 'Paused until',
  resumeCta: 'I’m back',
  trainingRow: 'Training streak',
  achievementsTitle: 'Achievements',
  closestNext: 'Closest next',
  toGo: 'to go',
  newBadge: 'New',
  settingsTitle: 'Rewards & motivation',
  celebrationsTitle: 'Celebrations',
  celebrationsFull: 'Full party',
  celebrationsSubtle: 'Subtle',
  celebrationsOff: 'Off',
  celebrationsOffNote: 'Off still saves your XP and badges, just quietly.',
  showXpTitle: 'Show XP & levels',
  showXpBody: 'On Today and You',
  goalTitle: 'Weekly active-day goal',
  goalBody: 'What keeps your flame growing',
  biscuitTitle: 'Biscuit companion',
  biscuitBody: 'Reactions on wins and recaps',
  flameOnTodayTitle: 'Show my flame on Today',
  flameOnTodayBody: 'Off hides the strip; progress still counts',
  reminderTitle: 'Gentle reminder',
  reminderBody: 'At most one a day, only if you haven’t opened Chefer',
  introTitle: 'Welcome to the kitchen',
  introBody: 'Everything you’ve already done counts. Here’s what your history earned.',
  introCta: 'Let’s cook',
  recapBanner: 'Your week, unwrapped',
  recapBannerCta: 'Open',
  recapPlanNext: 'Plan next week',
  quietSupportTitle: 'We’re here for the whole you',
  // D9: owner reviews this before the flag flips.
  quietSupportBody:
    'Food rewards are taking a short break. If eating feels hard right now, talking to your GP or someone you trust can help.',
  cookYouMadeIt: 'You made it!',
  reminderOff: 'Off',
} as const;

const RANK_TITLES: Record<RankId, string> = {
  KITCHEN_PORTER: 'Kitchen Porter',
  COMMIS: 'Commis',
  LINE_COOK: 'Line Cook',
  CHEF_DE_PARTIE: 'Chef de Partie',
  SOUS_CHEF: 'Sous Chef',
  HEAD_CHEF: 'Head Chef',
  EXECUTIVE_CHEF: 'Executive Chef',
  IRON_CHEF: 'Iron Chef',
  THREE_STAR: 'Three-Star',
};

export function rankTitle(id: RankId): string {
  return RANK_TITLES[id];
}

const RECEIPT_LABELS: Record<ReceiptLineCode, string> = {
  WELCOME: 'Welcome to the kitchen',
  LOGGED: 'Meal logged',
  ON_PLAN: 'From your plan',
  FULL_DAY: 'Full day logged',
  PROTEIN_GOAL: 'Protein goal reached',
  COOKED_AT_HOME: 'Cooked at home',
  FIRST_TIME: 'First time making this recipe',
  WORKOUT_DONE: 'Workout finished',
  PR_E1RM: 'New best estimated max',
  PR_WEIGHT: 'Heaviest set yet',
  PR_REPS: 'Most reps at this weight',
  SHOP_DONE: 'Shopping list done',
  TODAYS_THREE: "Today's three: all done",
  WEEK_GOAL: 'Weekly goal reached',
};

/** "Cooked at home", "Heaviest set yet · Bench press". */
export function receiptLineLabel(code: ReceiptLineCode, detail?: string): string {
  const label = RECEIPT_LABELS[code];
  return detail ? `${label} · ${detail}` : label;
}

/** "+25 XP". */
export function xpLabel(xp: number): string {
  return `${xp >= 0 ? '+' : ''}${xp} XP`;
}

const MEAL_NAMES: Record<PlanSlotMealType, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'a snack',
};

/** The quest's main line ("Log breakfast", "Cook dinner at home"). */
export function questLabel(
  quest: Pick<TodaysThreeQuest, 'kind' | 'mealType' | 'proteinTargetG'>,
): string {
  const kind: QuestKind = quest.kind;
  switch (kind) {
    case 'LOG_SLOT':
      return `Log ${quest.mealType ? MEAL_NAMES[quest.mealType] : 'a meal'}`;
    case 'COOK':
      return `Cook ${quest.mealType && quest.mealType !== 'snack' ? quest.mealType : 'a meal'} at home`;
    case 'PROTEIN':
      return quest.proteinTargetG
        ? `Reach ${quest.proteinTargetG} g protein`
        : 'Reach your protein goal';
    case 'WORKOUT':
      return 'Finish today’s workout';
    case 'SHOP':
      return 'Finish the shopping list';
    case 'LOG_ANY':
      return 'Log any meal';
  }
}

/** The quest's quiet second part ("Lemon Herb Salmon", "62 g so far"). */
export function questDetail(quest: TodaysThreeQuest): string | null {
  if (quest.kind === 'COOK' && quest.recipeName) return quest.recipeName;
  if (quest.kind === 'PROTEIN' && quest.progress)
    return `${Math.round(quest.progress.current)} g so far`;
  return null;
}

/** "6 weeks" / "1 week". Zero has its own line (`PROGRESS_COPY.flameZero`). */
export function flameWeeksLabel(weeks: number): string {
  return weeks === 1 ? '1 week' : `${weeks} weeks`;
}

/** "2 of 3 days". */
export function activeDaysLabel(activeDays: number, goal: number): string {
  return `${Math.min(activeDays, goal)} of ${goal} days`;
}

/** "Best: 9 weeks." — shown instead of any "you lost it" message. */
export function flameBestLabel(best: number): string {
  return `Best: ${flameWeeksLabel(best)}.`;
}

/** "Lv 7". */
export function levelLabel(level: number): string {
  return `Lv ${level}`;
}

const TIER_NUMERALS = ['I', 'II', 'III', 'IV', 'V'];

/** 1 → "I". */
export function tierNumeral(tier: number): string {
  return TIER_NUMERALS[tier - 1] ?? String(tier);
}

type AchievementCopy = { title: string; icon: string; describe: (target: number) => string };

/** Titles, icons and "what the next tier asks" — thresholds live in `achievements.ts`. */
export const ACHIEVEMENT_COPY: Record<AchievementId, AchievementCopy> = {
  WELCOME: { title: 'Welcome to the kitchen', icon: '👋', describe: () => 'Open Kitchen progress' },
  HOME_CHEF: { title: 'Home Chef', icon: '🍳', describe: (n) => `Cook ${n} meals in cook mode` },
  RECIPE_EXPLORER: {
    title: 'Recipe Explorer',
    icon: '🧭',
    describe: (n) => `Cook ${n} different recipes`,
  },
  HONEST_LOGGER: { title: 'Honest Logger', icon: '📒', describe: (n) => `Log meals on ${n} days` },
  FULL_DAY: { title: 'Full Day', icon: '✅', describe: (n) => `Log ${n} full days` },
  PROTEIN_PRO: {
    title: 'Protein Pro',
    icon: '🥚',
    describe: (n) => `Reach your protein goal ${n} times`,
  },
  PR_MACHINE: { title: 'PR Machine', icon: '🏅', describe: (n) => `Set ${n} personal records` },
  IRON_WEEKS: {
    title: 'Iron Weeks',
    icon: '🏋️',
    describe: (n) => `Reach a ${n}-week training streak`,
  },
  FLAME: { title: 'Flame', icon: '🔥', describe: (n) => `Keep your flame going for ${n} weeks` },
  CLEAN_SWEEP: { title: 'Clean Sweep', icon: '🛒', describe: (n) => `Finish ${n} shopping lists` },
  TODAYS_THREE: {
    title: "Today's Three",
    icon: '🎯',
    describe: (n) => `Finish all three on ${n} days`,
  },
};

// ─── Biscuit's cameo (idea 44): one warm line, never sad, never guilt ─────────

export type BiscuitMoment = 'cookFinished' | 'levelUp' | 'flameMilestone' | 'recap' | 'workoutPr';

const BISCUIT_LINES: Record<BiscuitMoment, readonly string[]> = {
  cookFinished: [
    'Smells amazing. I’ll guard the leftovers.',
    'Chef’s kiss. Mine’s a tiny portion, please.',
    'Home-cooked! My nose approves.',
  ],
  levelUp: ['New rank, same apron. Proud of you.', 'Look at you go, chef.'],
  flameMilestone: ['That flame is cosy. Can I nap by it?', 'Week after week. Lovely.'],
  recap: ['What a week in the kitchen.', 'I kept count. You did lots.', 'Same time next week?'],
  workoutPr: ['Stronger than last time. Zoomies!', 'New best! I’m doing a happy wiggle.'],
};

/** A deterministic line for a moment: the same seed always gets the same line. */
export function biscuitLine(moment: BiscuitMoment, seed: string): string {
  const lines = BISCUIT_LINES[moment];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return lines[Math.abs(hash) % lines.length] ?? lines[0] ?? '';
}

// ─── Gentle reminders (idea 58): invitational only ───────────────────────────

export const REMINDER_LINES: readonly { title: string; body: string }[] = [
  { title: 'The kitchen’s open', body: 'Anything good on the menu tonight?' },
  { title: 'Quick check-in', body: 'Log a meal or start a workout, whenever suits you.' },
  { title: 'Your flame says hi', body: 'One small thing today keeps it glowing.' },
];

/** Every static string above, for `copy-lint.test.ts`. */
export function allProgressCopyStrings(): string[] {
  const out: string[] = [...Object.values(PROGRESS_COPY), ...Object.values(RANK_TITLES)];
  out.push(...Object.values(RECEIPT_LABELS));
  for (const c of Object.values(ACHIEVEMENT_COPY)) out.push(c.title, c.describe(10));
  for (const lines of Object.values(BISCUIT_LINES)) out.push(...lines);
  for (const r of REMINDER_LINES) out.push(r.title, r.body);
  return out;
}
