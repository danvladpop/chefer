import nodemailer from 'nodemailer';
import { EmailQuotaError, type EmailMessage, type IEmailService } from './types.js';

// ─── SMTP transport (EMAIL_PROVIDER=smtp) ─────────────────────────────────────
// Built for a Gmail account with an App Password (smtp.gmail.com:465, TLS),
// but any SMTP server works. Same contract as the Resend transport: a text
// part, an optional HTML part and pass-through headers (List-Unsubscribe).

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

/** The slice of a nodemailer transporter this service uses (mockable). */
export interface SmtpTransporter {
  sendMail(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    headers?: Record<string, string>;
  }): Promise<unknown>;
}

export function createSmtpTransporter(settings: SmtpSettings): SmtpTransporter {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.user, pass: settings.pass },
    // Password-reset requests await the send: fail in seconds, not minutes,
    // when the server is unreachable (nodemailer defaults to 2 min / 10 min).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/**
 * Gmail's sending-limit replies: "550-5.4.5 Daily user sending limit
 * exceeded" and the 421/454 "4.7.x try again later" throttles.
 */
export function isSmtpQuotaError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { responseCode, response } = err as { responseCode?: unknown; response?: unknown };
  const text = typeof response === 'string' ? response : '';
  if (/\b5\.4\.5\b/.test(text) || /sending limit/i.test(text)) return true;
  return (responseCode === 421 || responseCode === 454) && /\b4\.7\.\d+\b/.test(text);
}

export class SmtpEmailService implements IEmailService {
  constructor(
    private readonly transporter: SmtpTransporter,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html && { html: message.html }),
        ...(message.headers && { headers: message.headers }),
      });
    } catch (err) {
      if (isSmtpQuotaError(err)) {
        throw new EmailQuotaError('SMTP sending limit reached', { cause: err });
      }
      throw err;
    }
  }
}
