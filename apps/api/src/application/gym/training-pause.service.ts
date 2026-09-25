import { TRPCError } from '@trpc/server';
import { trainingPauseRepository, type ITrainingPauseRepository } from '@chefer/database';
import { addDaysLocal } from '@chefer/utils';
import { serverToday } from './mappers.js';

// ─── TrainingPauseService (gym_plan.md §1.4) ─────────────────────────────────
// "Pause (1–4 weeks) freezes the streak". Ranges are device-local dates,
// inclusive. Overlapping pauses are rejected so week judging stays simple.

/** Longest single pause: 4 weeks (plus the partial week it starts in). */
export const MAX_PAUSE_DAYS = 35;

export class TrainingPauseService {
  constructor(private readonly repo: ITrainingPauseRepository = trainingPauseRepository) {}

  async create(
    userId: string,
    input: { startDate: string; endDate: string; reason: string | null },
  ): Promise<{ id: string }> {
    if (input.endDate < input.startDate) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'The pause ends before it starts.' });
    }
    if (input.endDate > addDaysLocal(input.startDate, MAX_PAUSE_DAYS - 1)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `A pause can last at most ${MAX_PAUSE_DAYS} days.`,
      });
    }
    const existing = await this.repo.listForUser(userId);
    if (existing.some((p) => p.startDate <= input.endDate && input.startDate <= p.endDate)) {
      throw new TRPCError({ code: 'CONFLICT', message: 'That overlaps an existing pause.' });
    }
    const row = await this.repo.create(userId, input);
    return { id: row.id };
  }

  /** Ends a pause early (endDate = today); a pause that hasn't started yet is removed. */
  async end(userId: string, id: string, today: string = serverToday()): Promise<{ ok: true }> {
    const pause = await this.repo.findByIdForUser(userId, id);
    if (!pause) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pause not found.' });
    if (pause.startDate > today) {
      await this.repo.delete(id);
    } else if (pause.endDate > today) {
      await this.repo.updateEndDate(id, today);
    }
    return { ok: true };
  }
}

export const trainingPauseService = new TrainingPauseService();
