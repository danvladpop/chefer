// ─── Email provider configuration (pure — env.ts calls it at startup) ─────────
// Three transports: the console mock (local dev), Resend (HTTP API, needs a
// verified domain for real users) and SMTP (e.g. a Gmail account with an App
// Password). EMAIL_PROVIDER picks one; when it is unset the legacy switch
// still applies — EMAIL_MOCK_ENABLED=true (the default) means mock, false
// means Resend — so existing .env files keep today's behaviour exactly.

export type EmailProvider = 'mock' | 'resend' | 'smtp';

export const GMAIL_SMTP_HOST = 'smtp.gmail.com';
/** Gmail allows ~500 messages a day; stay well under it (see infrastructure.md §10). */
export const DEFAULT_SMTP_DAILY_CAP = 400;
/**
 * Sends kept free for password-reset and confirmation emails: the weekly
 * sweep stops at `cap - PRIORITY_RESERVE`, so a big sweep can never use up
 * the day's allowance before someone needs a reset link.
 */
export const PRIORITY_RESERVE = 50;
const RESEND_SHARED_FROM = 'Chefer <onboarding@resend.dev>';

export interface EmailEnvInput {
  EMAIL_PROVIDER?: EmailProvider | undefined;
  EMAIL_MOCK_ENABLED: boolean;
  RESEND_API_KEY?: string | undefined;
  EMAIL_FROM?: string | undefined;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string | undefined;
  SMTP_PASS?: string | undefined;
  EMAIL_DAILY_CAP?: number | undefined;
}

export interface EmailConfig {
  provider: EmailProvider;
  from: string;
  /** Max sends per rolling 24 hours, or null for no cap. */
  dailyCap: number | null;
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string } | null;
}

export interface EmailConfigResult {
  config: EmailConfig;
  /** Fatal — the API refuses to start. */
  errors: string[];
  /** Logged at startup; the API still starts. */
  warnings: string[];
}

export function resolveEmailProvider(
  input: Pick<EmailEnvInput, 'EMAIL_PROVIDER' | 'EMAIL_MOCK_ENABLED'>,
): EmailProvider {
  if (input.EMAIL_PROVIDER) return input.EMAIL_PROVIDER;
  return input.EMAIL_MOCK_ENABLED ? 'mock' : 'resend';
}

/** The bare address of a From header: `Chefer <a@b.c>` → `a@b.c`, lowercased. */
export function addressOf(from: string): string {
  const match = /<([^>]+)>/.exec(from);
  return (match?.[1] ?? from).trim().toLowerCase();
}

const isGmailHost = (host: string) => host.trim().toLowerCase() === GMAIL_SMTP_HOST;

export function resolveEmailConfig(input: EmailEnvInput): EmailConfigResult {
  const provider = resolveEmailProvider(input);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (provider === 'resend' && !input.RESEND_API_KEY) {
    errors.push(
      input.EMAIL_PROVIDER
        ? 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend'
        : 'RESEND_API_KEY is required when EMAIL_MOCK_ENABLED=false',
    );
  }

  let smtp: EmailConfig['smtp'] = null;
  if (provider === 'smtp') {
    if (!input.SMTP_USER || !input.SMTP_PASS) {
      errors.push('SMTP_USER and SMTP_PASS are required when EMAIL_PROVIDER=smtp');
    } else {
      smtp = {
        host: input.SMTP_HOST,
        port: input.SMTP_PORT,
        secure: input.SMTP_SECURE,
        user: input.SMTP_USER,
        // Google shows App Passwords as four space-separated groups; the spaces are
        // display-only, so a pasted value works either way.
        pass: isGmailHost(input.SMTP_HOST) ? input.SMTP_PASS.replace(/\s+/g, '') : input.SMTP_PASS,
      };
    }
    if (input.SMTP_SECURE && input.SMTP_PORT === 587) {
      warnings.push('SMTP_PORT=587 uses STARTTLS — set SMTP_SECURE=false (or use port 465)');
    }
    if (!input.SMTP_SECURE && input.SMTP_PORT === 465) {
      warnings.push('SMTP_PORT=465 expects implicit TLS — set SMTP_SECURE=true');
    }
  }

  const from =
    input.EMAIL_FROM ??
    (provider === 'smtp' && input.SMTP_USER ? `Chefer <${input.SMTP_USER}>` : RESEND_SHARED_FROM);

  if (
    provider === 'smtp' &&
    input.SMTP_USER &&
    isGmailHost(input.SMTP_HOST) &&
    addressOf(from) !== input.SMTP_USER.trim().toLowerCase()
  ) {
    warnings.push(
      `EMAIL_FROM (${addressOf(from)}) differs from SMTP_USER (${input.SMTP_USER}) — Gmail ` +
        'rewrites the From address to the signed-in account unless it is a verified ' +
        '"Send mail as" alias, and mismatched senders are likelier to land in spam',
    );
  }

  const dailyCap = input.EMAIL_DAILY_CAP ?? (provider === 'smtp' ? DEFAULT_SMTP_DAILY_CAP : null);
  if (dailyCap !== null && dailyCap <= PRIORITY_RESERVE) {
    warnings.push(
      `EMAIL_DAILY_CAP=${dailyCap} leaves no room for weekly emails — the first ${PRIORITY_RESERVE} ` +
        'sends a day are reserved for password-reset and confirmation emails',
    );
  }

  return { config: { provider, from, dailyCap, smtp }, errors, warnings };
}

/** How many weekly (bulk) emails fit in a rolling day under `cap`. */
export function bulkDailyAllowance(cap: number): number {
  return Math.max(0, cap - PRIORITY_RESERVE);
}
