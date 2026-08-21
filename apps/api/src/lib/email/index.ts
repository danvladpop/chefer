import { env } from '../env.js';

// ─── Email service ────────────────────────────────────────────────────────────
// Mirrors the AI_MOCK_ENABLED pattern: EMAIL_MOCK_ENABLED (default true)
// selects a console-logging mock so local dev never sends real mail — the
// mock prints the reset link, which is also the local testing workflow.

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text body. Kept text-only until there's a designed template. */
  text: string;
}

export interface IEmailService {
  send(message: EmailMessage): Promise<void>;
}

class MockEmailService implements IEmailService {
  send(message: EmailMessage): Promise<void> {
    console.log(
      `📧 [EmailMock] To: ${message.to}\n   Subject: ${message.subject}\n   ${message.text.replaceAll('\n', '\n   ')}`,
    );
    return Promise.resolve();
  }
}

class ResendEmailService implements IEmailService {
  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend rejected the email (${res.status}): ${body.slice(0, 300)}`);
    }
  }
}

export const emailService: IEmailService = env.EMAIL_MOCK_ENABLED
  ? new MockEmailService()
  : new ResendEmailService();
