import type { Prisma, ProgressState } from '@prisma/client';
import { prisma } from '../client';

// ─── ProgressStateRepository (tech-plan.md §2) ────────────────────────────────
// One row per user: settings, the active-day goal history, Flame pauses and
// the "seen" cursors. `totalXp` is only ever changed by
// `ProgressEventRepository.append`, in the same transaction as the event.

export type ProgressStatePatch = {
  settings?: unknown;
  goalHistory?: unknown;
  pauses?: unknown;
  backfillVersion?: number | null;
  introducedAt?: Date | null;
  seenCursor?: Date | null;
  lastSeenLevel?: number;
  recapSeenWeek?: string | null;
};

export interface IProgressStateRepository {
  find(userId: string): Promise<ProgressState | null>;
  /** The row, created with its defaults when the user has none yet. */
  ensure(userId: string): Promise<ProgressState>;
  update(userId: string, patch: ProgressStatePatch): Promise<ProgressState>;
  /** Moves the cursor forward only: an older ack never un-sees a moment. */
  advanceSeenCursor(userId: string, upTo: Date): Promise<void>;
  /** Raises `lastSeenLevel` only: a level never goes down. */
  raiseLastSeenLevel(userId: string, level: number): Promise<void>;
}

export class ProgressStateRepository implements IProgressStateRepository {
  async find(userId: string): Promise<ProgressState | null> {
    return prisma.progressState.findUnique({ where: { userId } });
  }

  async ensure(userId: string): Promise<ProgressState> {
    return prisma.progressState.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async update(userId: string, patch: ProgressStatePatch): Promise<ProgressState> {
    const { settings, goalHistory, pauses, ...rest } = patch;
    const data = {
      ...rest,
      ...(settings !== undefined && { settings: settings as Prisma.InputJsonValue }),
      ...(goalHistory !== undefined && { goalHistory: goalHistory as Prisma.InputJsonValue }),
      ...(pauses !== undefined && { pauses: pauses as Prisma.InputJsonValue }),
    };
    return prisma.progressState.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async advanceSeenCursor(userId: string, upTo: Date): Promise<void> {
    await prisma.progressState.updateMany({
      where: { userId, OR: [{ seenCursor: null }, { seenCursor: { lt: upTo } }] },
      data: { seenCursor: upTo },
    });
  }

  async raiseLastSeenLevel(userId: string, level: number): Promise<void> {
    await prisma.progressState.updateMany({
      where: { userId, lastSeenLevel: { lt: level } },
      data: { lastSeenLevel: level },
    });
  }
}

export const progressStateRepository = new ProgressStateRepository();
