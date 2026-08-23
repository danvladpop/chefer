import type { Feedback } from '@prisma/client';
import { prisma } from '../client';

// Beta feedback channel (docs/ux-fixes-plan.md 1.6): write-only from the app;
// read via psql/Prisma Studio for now.

export interface CreateFeedbackData {
  userId: string;
  message: string;
  path?: string | null | undefined;
}

export interface IFeedbackRepository {
  create(data: CreateFeedbackData): Promise<Feedback>;
}

export class FeedbackRepository implements IFeedbackRepository {
  async create(data: CreateFeedbackData): Promise<Feedback> {
    return prisma.feedback.create({
      data: {
        userId: data.userId,
        message: data.message,
        path: data.path ?? null,
      },
    });
  }
}

export const feedbackRepository = new FeedbackRepository();
