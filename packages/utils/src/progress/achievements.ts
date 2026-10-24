import type {
  AchievementGroup,
  AchievementId,
  AchievementItem,
  AchievementsDto,
} from '@chefer/types';
import { ACHIEVEMENT_GROUPS } from '@chefer/types';
import { ACHIEVEMENT_COPY } from './copy';

// ─── Achievements (ideas 38–39, tech-plan §9) ────────────────────────────────
// A tiered catalogue over counters the server reads from the ledger and the
// gym. No metric describes eating less or weighing less.

export type AchievementMetric =
  | 'welcome'
  | 'cooks'
  | 'distinctRecipesCooked'
  | 'daysLogged'
  | 'fullDays'
  | 'proteinDays'
  | 'prs'
  | 'trainingStreakBest'
  | 'flameBest'
  | 'shopsDone'
  | 'todaysThreeDays';

export type ProgressCounters = Record<AchievementMetric, number>;

export const ACHIEVEMENTS: {
  id: AchievementId;
  group: AchievementGroup;
  metric: AchievementMetric;
  tiers: number[];
}[] = [
  { id: 'WELCOME', group: 'KITCHEN', metric: 'welcome', tiers: [1] },
  { id: 'HOME_CHEF', group: 'KITCHEN', metric: 'cooks', tiers: [10, 50, 150] },
  { id: 'RECIPE_EXPLORER', group: 'KITCHEN', metric: 'distinctRecipesCooked', tiers: [5, 15, 40] },
  { id: 'HONEST_LOGGER', group: 'TABLE', metric: 'daysLogged', tiers: [7, 30, 100] },
  { id: 'FULL_DAY', group: 'TABLE', metric: 'fullDays', tiers: [10, 30, 90] },
  { id: 'PROTEIN_PRO', group: 'TABLE', metric: 'proteinDays', tiers: [5, 20, 60] },
  { id: 'PR_MACHINE', group: 'GYM', metric: 'prs', tiers: [5, 25, 75] },
  { id: 'IRON_WEEKS', group: 'GYM', metric: 'trainingStreakBest', tiers: [4, 12, 26] },
  { id: 'FLAME', group: 'FLAME', metric: 'flameBest', tiers: [4, 8, 12, 26, 52] },
  { id: 'CLEAN_SWEEP', group: 'PLAN', metric: 'shopsDone', tiers: [1, 10, 30] },
  { id: 'TODAYS_THREE', group: 'PLAN', metric: 'todaysThreeDays', tiers: [3, 15, 50] },
];

/** How many tiers `value` has reached (0 = none). */
export function tierFor(tiers: readonly number[], value: number): number {
  return tiers.filter((t) => value >= t).length;
}

/** Every tier reached and not already held, lower tiers included when skipped. */
export function newUnlocks(
  counters: ProgressCounters,
  existing: { achievementId: AchievementId; tier: number }[],
): { achievementId: AchievementId; tier: number }[] {
  const held = new Set(existing.map((e) => `${e.achievementId}:${e.tier}`));
  const out: { achievementId: AchievementId; tier: number }[] = [];
  for (const a of ACHIEVEMENTS) {
    const reached = tierFor(a.tiers, counters[a.metric]);
    for (let tier = 1; tier <= reached; tier += 1) {
      if (!held.has(`${a.id}:${tier}`)) out.push({ achievementId: a.id, tier });
    }
  }
  return out;
}

type UnlockRow = {
  id: string;
  achievementId: AchievementId;
  tier: number;
  unlockedAt: Date;
  seenAt: Date | null;
};

/** The shelf: every achievement with its tier, progress and next target. */
export function buildAchievements(
  counters: ProgressCounters,
  unlocks: UnlockRow[],
): AchievementsDto {
  const items: AchievementItem[] = ACHIEVEMENTS.map((a) => {
    const copy = ACHIEVEMENT_COPY[a.id];
    const progress = Math.floor(counters[a.metric]);
    const mine = unlocks.filter((u) => u.achievementId === a.id);
    // A badge is never taken back: a held unlock outranks a counter that later fell.
    const tier = Math.max(tierFor(a.tiers, progress), ...mine.map((u) => u.tier));
    const nextTarget = a.tiers[tier] ?? null;
    const latest = mine.reduce<Date | null>(
      (acc, u) => (acc === null || u.unlockedAt > acc ? u.unlockedAt : acc),
      null,
    );
    return {
      id: a.id,
      group: a.group,
      title: copy.title,
      description: copy.describe(nextTarget ?? a.tiers[a.tiers.length - 1] ?? 0),
      icon: copy.icon,
      tier,
      tiers: a.tiers,
      progress,
      nextTarget,
      unlockedAt: latest,
      isNew: mine.some((u) => u.seenAt === null),
    };
  });

  let closestNext: AchievementItem | null = null;
  for (const item of items) {
    if (item.nextTarget === null) continue;
    if (closestNext === null || closer(item, closestNext)) closestNext = item;
  }

  return {
    earned: items.reduce((n, i) => n + i.tier, 0),
    total: items.reduce((n, i) => n + i.tiers.length, 0),
    closestNext,
    groups: ACHIEVEMENT_GROUPS.map((group) => ({
      group,
      items: items.filter((i) => i.group === group),
    })),
  };
}

/** True when `a` is closer to its next tier than `b`: higher fraction, then fewer left. */
function closer(a: AchievementItem, b: AchievementItem): boolean {
  const at = a.nextTarget ?? 1;
  const bt = b.nextTarget ?? 1;
  const diff = a.progress * bt - b.progress * at; // sign of a.p/at − b.p/bt
  if (diff !== 0) return diff > 0;
  return at - a.progress < bt - b.progress;
}
