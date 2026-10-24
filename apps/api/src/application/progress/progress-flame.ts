import type { IProgressEventRepository, IProgressStateRepository } from '@chefer/database';
import {
  ACTIVE_DAY_KINDS,
  type FlameInfo,
  type GoalHistoryEntry,
  type PauseRange,
} from '@chefer/types';
import { summarizeFlame } from '@chefer/utils';
import { parseGoalHistory, parsePauses } from './progress-state-json.js';

// ─── Reading the Flame (tech-plan.md §5) ──────────────────────────────────────
// The Flame is derived, never stored: the active dates come from the ledger,
// the goal history and pauses from `ProgressState`, and the same
// `settleWeeks` the gym streak uses does the rest (`summarizeFlame`).

/** The gym weekly streak, or null without a gym profile. */
export interface IGymStreakReader {
  trainingStreak(userId: string, today: string): Promise<{ current: number; best: number } | null>;
  /** The gym streak's best as it stood at the end of each given week (back-dated badge dates). */
  trainingBestAt(userId: string, weekEnds: string[]): Promise<DatedValue[]>;
}

/** A counter's value on a local date. */
export type DatedValue = { date: string; value: number };

export type FlameRead = ReturnType<typeof summarizeFlame> & {
  activeDates: string[];
  goalHistory: GoalHistoryEntry[];
  pauses: PauseRange[];
};

export class FlameReader {
  constructor(
    private readonly deps: {
      events: Pick<IProgressEventRepository, 'activeDates'>;
      states: Pick<IProgressStateRepository, 'find'>;
      gym: IGymStreakReader;
    },
  ) {}

  /**
   * The Flame as of `today`. `cutoff` ignores active dates after it (the
   * weekly recap's "as it stood on Sunday"); `withTraining` adds the gym row.
   */
  async read(
    userId: string,
    today: string,
    level: number,
    opts: {
      cutoff?: string;
      withTraining?: boolean;
      overrides?: Partial<Pick<FlameRead, 'goalHistory' | 'pauses'>>;
    } = {},
  ): Promise<FlameRead> {
    const [dates, state, training] = await Promise.all([
      this.deps.events.activeDates(userId, ACTIVE_DAY_KINDS),
      this.deps.states.find(userId),
      opts.withTraining ? this.deps.gym.trainingStreak(userId, today) : Promise.resolve(null),
    ]);
    const { cutoff } = opts;
    const activeDates = cutoff ? dates.filter((d) => d <= cutoff) : dates;
    const goalHistory = opts.overrides?.goalHistory ?? parseGoalHistory(state?.goalHistory);
    const pauses = opts.overrides?.pauses ?? parsePauses(state?.pauses);
    const flame = summarizeFlame({ activeDates, goalHistory, pauses, today, level, training });
    return { ...flame, activeDates, goalHistory, pauses };
  }
}

/** The `FlameInfo` DTO: the Flame without the per-week settlement. */
export function toFlameInfo(read: FlameRead): FlameInfo {
  const {
    weeks: _weeks,
    activeDates: _dates,
    goalHistory: _goals,
    pauses: _pauses,
    ...info
  } = read;
  return info;
}
