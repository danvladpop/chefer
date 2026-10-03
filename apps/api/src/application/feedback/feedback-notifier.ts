import { emailService } from '../../lib/email/index.js';
import type { IEmailService } from '../../lib/email/types.js';
import { env } from '../../lib/env.js';

// ─── Feedback notification (UX-PO-05) ─────────────────────────────────────────
// Every submission is mailed to the owner through the EXISTING email path
// (EMAIL_PROVIDER: console mock in dev, Gmail SMTP / Resend in prod). Inert
// when FEEDBACK_NOTIFY_EMAIL is unset — the row is still stored either way.

export type FeedbackNotification = {
  userId: string;
  userEmail?: string | null | undefined;
  message: string;
  /** The stored context line: screen · OS · build. */
  context: string | null;
  createdAt: Date;
};

export interface IFeedbackNotifier {
  notify(notification: FeedbackNotification): Promise<void>;
}

const SUBJECT_PREVIEW_LENGTH = 60;

/** One line, no control characters — safe for a mail Subject header. */
function subjectPreview(message: string): string {
  const oneLine = message.replace(/\s+/g, ' ').trim();
  return oneLine.length > SUBJECT_PREVIEW_LENGTH
    ? `${oneLine.slice(0, SUBJECT_PREVIEW_LENGTH - 1)}…`
    : oneLine;
}

export class EmailFeedbackNotifier implements IFeedbackNotifier {
  constructor(
    private readonly email: IEmailService,
    private readonly to: string | undefined,
  ) {}

  async notify(n: FeedbackNotification): Promise<void> {
    if (!this.to) return;
    await this.email.send({
      to: this.to,
      subject: `[Chefer feedback] ${subjectPreview(n.message)}`,
      text: [
        n.message,
        '',
        '—',
        `From: ${n.userEmail ?? 'unknown email'} (${n.userId})`,
        `Context: ${n.context ?? 'none sent'}`,
        `Sent: ${n.createdAt.toISOString()}`,
      ].join('\n'),
    });
  }
}
