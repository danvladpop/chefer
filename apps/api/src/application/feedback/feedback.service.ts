import { TRPCError } from '@trpc/server';
import { feedbackRepository, type IFeedbackRepository } from '@chefer/database';
import type { IFeedbackNotifier } from './feedback-notifier.js';

// ─── Beta feedback (ux-fixes-plan.md 1.6, UX-PO-05) ───────────────────────────
// The review's biggest beta gap: testers had no way to tell us anything.
// Read via Prisma Studio / psql, and mailed to FEEDBACK_NOTIFY_EMAIL when set.
//
// The app's build, OS and screen ride along as optional fields. The Feedback
// table has no columns for them (and no schema change was wanted), so they are
// folded into `path` as one readable line: "gym/today · iOS 18.2 · Chefer …".

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 400;

export type FeedbackContext = {
  /** `CURRENT_BUILD` on mobile, e.g. "Chefer 1.0.1 · production · update 3f2a9c1e". */
  build?: string | null | undefined;
  /** e.g. "iOS 18.2", "Android 14". */
  os?: string | null | undefined;
  /** The screen the user was on (an expo-router pathname on mobile). */
  route?: string | null | undefined;
};

export type FeedbackSender = { email?: string | null | undefined };

/** The `path` column value: the screen (or legacy `path`), then OS, then build. */
export function formatFeedbackContext(
  path: string | null | undefined,
  context: FeedbackContext = {},
): string | null {
  const parts = [context.route ?? path, context.os, context.build]
    .map((part) => part?.replace(/\s+/g, ' ').trim())
    .filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ').slice(0, MAX_CONTEXT_LENGTH) : null;
}

export class FeedbackService {
  constructor(
    private readonly repo: IFeedbackRepository = feedbackRepository,
    private readonly notifier?: IFeedbackNotifier,
  ) {}

  async submit(
    userId: string,
    message: string,
    path?: string | null,
    context?: FeedbackContext,
    sender?: FeedbackSender,
  ): Promise<{ ok: true }> {
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Feedback message is empty.' });
    }
    const body = trimmed.slice(0, MAX_MESSAGE_LENGTH);
    const stored = formatFeedbackContext(path, context);
    await this.repo.create({ userId, message: body, path: stored });

    // Best effort: a mail outage must never fail (or delay) the submission.
    void this.notifier
      ?.notify({
        userId,
        userEmail: sender?.email ?? null,
        message: body,
        context: stored,
        createdAt: new Date(),
      })
      .catch((err: unknown) => {
        console.error('[Feedback] notification failed', err);
      });
    return { ok: true };
  }
}
