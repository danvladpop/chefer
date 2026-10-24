import type {
  ProgressEvent as ProgressEventRow,
  ProgressUnlock as ProgressUnlockRow,
} from '@chefer/database';
import {
  achievementIdSchema,
  progressEventKindSchema,
  receiptLineSchema,
  receiptMetaSchema,
  type LevelUp,
  type Receipt,
  type ReceiptLine,
  type Unlock,
} from '@chefer/types';
import { ACHIEVEMENT_COPY, levelForXp, rankFor } from '@chefer/utils';

// ─── Ledger rows → DTOs (tech-plan.md §4.3) ───────────────────────────────────

const parseLines = (value: unknown): ReceiptLine[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line): ReceiptLine[] => {
    const parsed = receiptLineSchema.safeParse(line);
    return parsed.success ? [parsed.data] : [];
  });
};

const parseMeta = (value: unknown) => {
  const parsed = receiptMetaSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
};

const sumLines = (lines: ReceiptLine[]) => lines.reduce((n, l) => n + l.xp, 0);

/** A ledger row as the client sees it. `capped` = the soft cap took something off. */
export function toReceipt(row: ProgressEventRow): Receipt {
  const lines = parseLines(row.lines);
  const kind = progressEventKindSchema.safeParse(row.kind);
  return {
    id: row.id,
    // A kind this build doesn't know (a later rules version) is shown as a plain log.
    kind: kind.success ? kind.data : 'MEAL_LOGGED',
    sourceId: row.sourceId,
    localDate: row.localDate,
    xp: row.xp,
    lines,
    capped: row.xp < sumLines(lines),
    meta: parseMeta(row.meta),
    createdAt: row.createdAt,
  };
}

/**
 * One receipt for a finished workout: the session's `WORKOUT_COMPLETED` row,
 * with the lines and XP of its `WORKOUT_PRS` row folded in.
 */
export function toWorkoutReceipt(
  completed: ProgressEventRow,
  prs: ProgressEventRow | null,
): Receipt {
  const base = toReceipt(completed);
  if (!prs) return base;
  const extra = toReceipt(prs);
  return {
    ...base,
    xp: base.xp + extra.xp,
    lines: [...base.lines, ...extra.lines],
    capped: base.capped || extra.capped,
    meta: { ...base.meta, ...extra.meta },
  };
}

export function toUnlock(row: ProgressUnlockRow): Unlock | null {
  const id = achievementIdSchema.safeParse(row.achievementId);
  if (!id.success) return null; // an achievement this build doesn't know
  const copy = ACHIEVEMENT_COPY[id.data];
  return {
    id: row.id,
    achievementId: id.data,
    tier: row.tier,
    title: copy.title,
    icon: copy.icon,
    unlockedAt: row.unlockedAt,
  };
}

export function toUnlocks(rows: ProgressUnlockRow[]): Unlock[] {
  return rows.flatMap((row) => {
    const unlock = toUnlock(row);
    return unlock ? [unlock] : [];
  });
}

/** The level-up between two lifetime totals, or null when the level did not rise. */
export function levelUpFromTo(from: number, to: number): LevelUp | null {
  if (to <= from) return null;
  const rank = rankFor(to);
  return { from, to, rank, rankChanged: rankFor(from).id !== rank.id };
}

export const levelOf = (totalXp: number): number => levelForXp(totalXp).level;
