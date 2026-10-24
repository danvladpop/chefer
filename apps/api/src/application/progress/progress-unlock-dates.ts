import { ACHIEVEMENTS, type AchievementMetric } from '@chefer/utils';
import type { DatedValue } from './progress-flame.js';

// ─── When each badge tier was earned, from the ledger's history (tech-plan.md §7) ─
// Back-dating inserts achievements with the date the threshold was crossed, not
// "today". The ledger-driven metrics are replayed in date order; the Flame and
// the gym streak come in as their best-so-far at the end of each week.

type LedgerFact = { kind: string; localDate: string; meta: Record<string, unknown> };

/** First date each tier's threshold was reached in a non-decreasing series, or undefined. */
function firstReached(tiers: readonly number[], series: DatedValue[]): (string | undefined)[] {
  return tiers.map((tier) => series.find((point) => point.value >= tier)?.date);
}

/** The running value of each ledger metric, one point per date it rose. */
function ledgerSeries(events: LedgerFact[]): Partial<Record<AchievementMetric, DatedValue[]>> {
  const sorted = [...events].sort((a, b) => a.localDate.localeCompare(b.localDate));
  const out: Partial<Record<AchievementMetric, DatedValue[]>> = {};
  const push = (metric: AchievementMetric, date: string, value: number) => {
    (out[metric] ??= []).push({ date, value });
  };
  let cooks = 0;
  let fullDays = 0;
  let proteinDays = 0;
  let prs = 0;
  let shops = 0;
  let threes = 0;
  const recipes = new Set<string>();
  const loggedDays = new Set<string>();
  for (const e of sorted) {
    switch (e.kind) {
      case 'COOK_FINISHED': {
        cooks += 1;
        push('cooks', e.localDate, cooks);
        const recipeId = e.meta['recipeId'];
        if (typeof recipeId === 'string' && !recipes.has(recipeId)) {
          recipes.add(recipeId);
          push('distinctRecipesCooked', e.localDate, recipes.size);
        }
        break;
      }
      case 'MEAL_LOGGED':
        if (!loggedDays.has(e.localDate)) {
          loggedDays.add(e.localDate);
          push('daysLogged', e.localDate, loggedDays.size);
        }
        break;
      case 'FULL_DAY':
        fullDays += 1;
        push('fullDays', e.localDate, fullDays);
        break;
      case 'PROTEIN_GOAL':
        proteinDays += 1;
        push('proteinDays', e.localDate, proteinDays);
        break;
      case 'WORKOUT_PRS': {
        const n = e.meta['prCount'];
        prs += typeof n === 'number' ? n : 0;
        push('prs', e.localDate, prs);
        break;
      }
      case 'SHOP_DONE':
        shops += 1;
        push('shopsDone', e.localDate, shops);
        break;
      case 'TODAYS_THREE':
        threes += 1;
        push('todaysThreeDays', e.localDate, threes);
        break;
      default:
        break;
    }
  }
  return out;
}

/** `"<ACHIEVEMENT_ID>:<tier>"` → the local date that tier was first reached. */
export function buildUnlockDates(input: {
  events: LedgerFact[];
  flameBest: DatedValue[];
  trainingBest: DatedValue[];
}): Map<string, string> {
  const series = ledgerSeries(input.events);
  series.flameBest = input.flameBest;
  series.trainingStreakBest = input.trainingBest;
  const dates = new Map<string, string>();
  for (const achievement of ACHIEVEMENTS) {
    const points = series[achievement.metric] ?? [];
    firstReached(achievement.tiers, points).forEach((date, i) => {
      if (date) dates.set(`${achievement.id}:${i + 1}`, date);
    });
  }
  return dates;
}
