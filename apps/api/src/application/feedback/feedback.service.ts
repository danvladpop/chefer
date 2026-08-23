import { TRPCError } from '@trpc/server';
import { feedbackRepository, type IFeedbackRepository } from '@chefer/database';

// ─── Beta feedback (ux-fixes-plan.md 1.6) ─────────────────────────────────────
// The review's biggest beta gap: testers had no way to tell us anything.
// Write-only from the app; read via Prisma Studio / psql for now.

const MAX_MESSAGE_LENGTH = 2000;

export class FeedbackService {
  constructor(private readonly repo: IFeedbackRepository = feedbackRepository) {}

  async submit(userId: string, message: string, path?: string | null): Promise<{ ok: true }> {
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Feedback message is empty.' });
    }
    await this.repo.create({
      userId,
      message: trimmed.slice(0, MAX_MESSAGE_LENGTH),
      path: path?.slice(0, 200) ?? null,
    });
    return { ok: true };
  }
}

export const feedbackService = new FeedbackService();
