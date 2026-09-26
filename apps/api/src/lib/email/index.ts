import { env } from '../env.js';
import type { EmailConfig } from './config.js';
import { createSmtpTransporter, SmtpEmailService } from './smtp.js';
import type { EmailMessage, IEmailService } from './types.js';

export { EmailQuotaError, type EmailMessage, type IEmailService } from './types.js';

// ─── Email service ────────────────────────────────────────────────────────────
// EMAIL_PROVIDER picks the transport (lib/email/config.ts): the console mock
// (the default — local dev never sends real mail, and the mock prints the
// reset link, which is also the local testing workflow), Resend, or SMTP
// (a Gmail account with an App Password).
//
// Two exports:
// - `emailService` — for one-off, user-triggered mail (password reset,
//   address confirmation). Always sent; each send is recorded so the weekly
//   sweep's budget leaves room for them.
// - `emailTransport` — the raw transport, for the weekly sweep, which counts
//   its own sends in email_sends and stops at its budget
//   (WeeklyEmailService, EMAIL_DAILY_CAP).

class MockEmailService implements IEmailService {
  send(message: EmailMessage): Promise<void> {
    console.log(
      `📧 [EmailMock] To: ${message.to}\n   Subject: ${message.subject}${message.html ? ` (+ HTML, ${message.html.length} chars)` : ''}\n   ${message.text.replaceAll('\n', '\n   ')}`,
    );
    return Promise.resolve();
  }
}

class ResendEmailService implements IEmailService {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html && { html: message.html }),
        ...(message.headers && { headers: message.headers }),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend rejected the email (${res.status}): ${body.slice(0, 300)}`);
    }
  }
}

export function createEmailTransport(
  config: Pick<EmailConfig, 'provider' | 'from' | 'smtp'>,
  resendApiKey?: string,
): IEmailService {
  switch (config.provider) {
    case 'smtp':
      if (!config.smtp) throw new Error('EMAIL_PROVIDER=smtp needs SMTP_USER and SMTP_PASS');
      return new SmtpEmailService(createSmtpTransporter(config.smtp), config.from);
    case 'resend':
      return new ResendEmailService(resendApiKey ?? '', config.from);
    case 'mock':
      return new MockEmailService();
  }
}

// ─── Daily cap (EMAIL_DAILY_CAP) ──────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Timestamps of recent sends in a rolling 24-hour window (in memory). */
export class SendLog {
  private stamps: number[] = [];

  record(at = Date.now()): void {
    this.prune(at);
    this.stamps.push(at);
  }

  countLastDay(at = Date.now()): number {
    this.prune(at);
    return this.stamps.length;
  }

  private prune(at: number): void {
    const cutoff = at - DAY_MS;
    if ((this.stamps[0] ?? Infinity) <= cutoff) {
      this.stamps = this.stamps.filter((s) => s > cutoff);
    }
  }
}

/**
 * Records every successful send. Never blocks one: a password-reset link is
 * worth more than the cap, and the cap sits below Gmail's own limit — it only
 * warns once the day's total passes it.
 */
export class PriorityEmailService implements IEmailService {
  constructor(
    private readonly inner: IEmailService,
    private readonly log: SendLog,
    private readonly dailyCap: number | null,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await this.inner.send(message);
    this.log.record();
    const count = this.log.countLastDay();
    if (this.dailyCap !== null && count > this.dailyCap) {
      console.warn(
        `[Email] ${count} transactional sends in 24h — past EMAIL_DAILY_CAP=${this.dailyCap}`,
      );
    }
  }
}

export const emailTransport: IEmailService = createEmailTransport(
  {
    provider: env.EMAIL_PROVIDER,
    from: env.EMAIL_FROM,
    smtp:
      env.EMAIL_PROVIDER === 'smtp' && env.SMTP_USER && env.SMTP_PASS
        ? {
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : null,
  },
  env.RESEND_API_KEY,
);

/** Password-reset and confirmation sends in the last 24 hours (this process). */
export const transactionalSendLog = new SendLog();

export const emailService: IEmailService = new PriorityEmailService(
  emailTransport,
  transactionalSendLog,
  env.EMAIL_DAILY_CAP,
);
