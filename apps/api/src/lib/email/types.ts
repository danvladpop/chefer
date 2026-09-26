export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body — always sent, the fallback for text-only clients. */
  text: string;
  /** Optional branded HTML body (weekly emails, templates.ts). */
  html?: string;
  /** Extra headers, e.g. List-Unsubscribe on the weekly emails. */
  headers?: Record<string, string>;
}

export interface IEmailService {
  send(message: EmailMessage): Promise<void>;
}

/**
 * The provider refused the send because a sending limit was reached (Gmail:
 * "550 5.4.5 Daily user sending limit exceeded", or a 421/454 4.7.x
 * throttle). Bulk senders stop for the day instead of retrying every user.
 */
export class EmailQuotaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EmailQuotaError';
  }
}
