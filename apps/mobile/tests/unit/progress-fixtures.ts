import { configure } from '@testing-library/react-native';
import { ALL_FEATURE_FLAGS_OFF, DEFAULT_PROGRESS_SETTINGS } from '@chefer/types';
import type {
  AchievementsDto,
  FeatureFlags,
  ProgressInbox,
  ProgressSummary,
  Receipt,
  WeeklyRecap,
} from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import { setShellV2Preview } from '../../src/features/shell/shell-store';
import type { Handlers } from './friends-core-harness';

// Kitchen progress fixtures (Lane C): the numbers of mockup 01 — Line Cook,
// level 7, 340 / 500 XP to Chef de Partie, a 6-week flame, 2 of 3 active days.

// Several queries chain before a card shows (flags → availability → summary); give a busy CI box room.
configure({ asyncUtilTimeout: 8000 });
jest.setTimeout(30_000);

export const TODAY = localDateStr();

export function summaryFixture(over: Partial<ProgressSummary> = {}): ProgressSummary {
  return {
    xp: { total: 1840, level: 7, xpIntoLevel: 340, xpForLevel: 500 },
    rank: { id: 'LINE_COOK', title: 'Line Cook', minLevel: 4 },
    nextRank: { id: 'CHEF_DE_PARTIE', title: 'Chef de Partie', minLevel: 8 },
    flame: {
      current: 6,
      best: 9,
      pilotLights: 2,
      pilotLightMax: 3,
      goal: 3,
      thisWeek: {
        weekStart: '2026-10-19',
        activeDays: 2,
        goal: 3,
        met: false,
        days: ['active', 'active', 'rest', 'today', 'future', 'future', 'future'],
      },
      pausedUntil: null,
      nextMilestone: 12,
      training: null,
    },
    todaysThree: {
      localDate: TODAY,
      bonusXp: 40,
      allDone: false,
      quests: [
        { id: 'LOG_SLOT:breakfast', kind: 'LOG_SLOT', xp: 10, mealType: 'breakfast', done: true },
        {
          id: 'COOK:dinner',
          kind: 'COOK',
          xp: 25,
          mealType: 'dinner',
          recipeId: 'salmon',
          recipeName: 'Lemon Herb Salmon',
          done: false,
        },
        {
          id: 'PROTEIN',
          kind: 'PROTEIN',
          xp: 10,
          proteinTargetG: 140,
          done: false,
          progress: { current: 62, target: 140 },
        },
      ],
    },
    settings: { ...DEFAULT_PROGRESS_SETTINGS },
    quiet: false,
    intro: null,
    recap: null,
    ...over,
  };
}

export function receiptFixture(over: Partial<Receipt> = {}): Receipt {
  return {
    id: 'r1',
    kind: 'COOK_FINISHED',
    sourceId: 'cook-1',
    localDate: TODAY,
    xp: 45,
    lines: [
      { code: 'COOKED_AT_HOME', xp: 25 },
      { code: 'FIRST_TIME', xp: 10 },
      { code: 'TODAYS_THREE', xp: 10 },
    ],
    capped: false,
    meta: { cookCount: 37 },
    createdAt: new Date(2026, 9, 22, 19, 0),
    ...over,
  };
}

export function inboxFixture(over: Partial<ProgressInbox> = {}): ProgressInbox {
  return {
    receipts: [],
    unlocks: [],
    levelUp: null,
    cursor: new Date(2026, 9, 22, 19, 5),
    ...over,
  };
}

export function achievementsFixture(): AchievementsDto {
  const homeChef = {
    id: 'HOME_CHEF' as const,
    group: 'KITCHEN' as const,
    title: 'Home Chef',
    description: 'Cook 50 meals in cook mode',
    icon: '🍳',
    tier: 2,
    tiers: [10, 25, 50],
    progress: 37,
    nextTarget: 50,
    unlockedAt: new Date(2026, 8, 1),
    isNew: true,
  };
  const prMachine = {
    id: 'PR_MACHINE' as const,
    group: 'GYM' as const,
    title: 'PR Machine',
    description: 'Set 5 personal records',
    icon: '🏅',
    tier: 0,
    tiers: [5, 15],
    progress: 2,
    nextTarget: 5,
    unlockedAt: null,
    isNew: false,
  };
  return {
    earned: 23,
    total: 64,
    closestNext: prMachine,
    groups: [
      { group: 'KITCHEN', items: [homeChef] },
      { group: 'GYM', items: [prMachine] },
    ],
  };
}

export function recapFixture(over: Partial<WeeklyRecap> = {}): WeeklyRecap {
  return {
    weekStart: '2026-10-13',
    weekEnd: '2026-10-19',
    cooked: 9,
    mealsLogged: 21,
    activeDays: 6,
    workouts: 3,
    workoutGoal: 3,
    prs: 2,
    newRecipes: 4,
    dishOfWeek: {
      recipeId: 'salmon',
      name: 'Lemon Herb Salmon',
      imageUrl: null,
      timesCooked: 2,
      rating: 5,
    },
    flame: { from: 5, to: 6 },
    xp: 640,
    level: { from: 6, to: 7 },
    ...over,
  };
}

/** Handlers for a signed-in user with Kitchen progress on (flag, availability, summary). */
export function progressOnHandlers(
  summary: ProgressSummary = summaryFixture(),
  extra: Handlers = {},
): Handlers {
  const flags: FeatureFlags = { ...ALL_FEATURE_FLAGS_OFF, gamification: true };
  return {
    'profile.flags': () => flags,
    'progress.availability': () => ({ enabled: true }),
    'progress.summary': () => summary,
    'progress.inbox': () => inboxFixture(),
    ...extra,
  };
}

/** The revamp shell on (D7), like a production user. */
export function turnShellV2On(): void {
  setShellV2Preview(true);
}

export function turnShellV2Off(): void {
  setShellV2Preview(false);
}
