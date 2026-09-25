import type { TrainingPause } from '@prisma/client';
import { prisma } from '../client';

// ─── Training pauses (gym_plan.md §1.4) ──────────────────────────────────────
// Date ranges (device-local "YYYY-MM-DD", inclusive) that freeze the streak.

export interface CreateTrainingPauseData {
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface ITrainingPauseRepository {
  listForUser(userId: string): Promise<TrainingPause[]>;
  findByIdForUser(userId: string, id: string): Promise<TrainingPause | null>;
  create(userId: string, data: CreateTrainingPauseData): Promise<TrainingPause>;
  updateEndDate(id: string, endDate: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export class TrainingPauseRepository implements ITrainingPauseRepository {
  async listForUser(userId: string): Promise<TrainingPause[]> {
    return prisma.trainingPause.findMany({ where: { userId }, orderBy: { startDate: 'asc' } });
  }

  async findByIdForUser(userId: string, id: string): Promise<TrainingPause | null> {
    return prisma.trainingPause.findFirst({ where: { id, userId } });
  }

  async create(userId: string, data: CreateTrainingPauseData): Promise<TrainingPause> {
    return prisma.trainingPause.create({ data: { userId, ...data } });
  }

  async updateEndDate(id: string, endDate: string): Promise<void> {
    await prisma.trainingPause.update({ where: { id }, data: { endDate } });
  }

  async delete(id: string): Promise<void> {
    await prisma.trainingPause.delete({ where: { id } });
  }
}

export const trainingPauseRepository = new TrainingPauseRepository();
