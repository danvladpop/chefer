import { z } from 'zod';
import {
  DEFAULT_PROGRESS_SETTINGS,
  localDateSchema,
  progressSettingsSchema,
  todaysThreeQuestSchema,
  type GoalHistoryEntry,
  type PauseRange,
  type ProgressSettings,
  type TodaysThreeQuest,
} from '@chefer/types';

// ─── The JSON columns of Kitchen progress, parsed safely ──────────────────────
// `ProgressState.settings / goalHistory / pauses` and `ProgressQuestDay.quests`
// are JSON. A malformed or older value never throws: it falls back to defaults.

const goalHistorySchema = z.array(
  z.object({ fromWeek: localDateSchema, goal: z.number().int().min(1).max(7) }),
);
const pausesSchema = z.array(z.object({ startDate: localDateSchema, endDate: localDateSchema }));
const questsSchema = z.array(todaysThreeQuestSchema);

export function parseGoalHistory(value: unknown): GoalHistoryEntry[] {
  const parsed = goalHistorySchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parsePauses(value: unknown): PauseRange[] {
  const parsed = pausesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseQuests(value: unknown): TodaysThreeQuest[] {
  const parsed = questsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** Stored settings merged over the defaults (the reminder merges field by field). */
export function parseSettings(value: unknown): ProgressSettings {
  const stored =
    typeof value === 'object' && value !== null ? (value as Partial<ProgressSettings>) : {};
  const merged = {
    ...DEFAULT_PROGRESS_SETTINGS,
    ...stored,
    reminder: { ...DEFAULT_PROGRESS_SETTINGS.reminder, ...stored.reminder },
  };
  const parsed = progressSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_PROGRESS_SETTINGS;
}
