import { TRPCError } from '@trpc/server';
import { weeklyEmailRepository, type IWeeklyEmailRepository } from '@chefer/database';
import { emailService, type IEmailService } from '../../lib/email/index.js';
import { renderVerifyEmail } from '../../lib/email/templates.js';
import {
  readUnsubscribeToken,
  readVerifyEmailToken,
  verifyEmailUrl,
  type UnsubscribeScope,
} from '../../lib/email/tokens.js';
import { consentService } from '../privacy/consent.service.js';

/** 'web' | 'mobile' | 'migration' — see ConsentService.record. */
export type ConsentSource = 'web' | 'mobile' | 'migration';

// ─── Weekly-email preferences, confirmation and unsubscribe (audit P2-5) ─────
// Weekly emails only go to a CONFIRMED address. Chefer had no confirmation
// step (emailVerified stayed null for every signup), so this adds the
// smallest one that works: a signed 7-day link, sent at registration and
// re-sendable from Preferences. Completing a password reset also confirms
// the address — the user just proved they read that inbox.

export interface EmailPreferencesDto {
  /** Monday "your week is ready". */
  weekReady: boolean;
  /** Sunday "your week in review". */
  weeklyRecap: boolean;
  /** Weekly emails only go out once the address is confirmed. */
  emailConfirmed: boolean;
  email: string;
}

const INVALID_LINK = 'This link is invalid or has expired.';

function toDto(prefs: {
  weeklyEmailReady: boolean;
  weeklyEmailRecap: boolean;
  emailVerified: Date | null;
  email: string;
}): EmailPreferencesDto {
  return {
    weekReady: prefs.weeklyEmailReady,
    weeklyRecap: prefs.weeklyEmailRecap,
    emailConfirmed: prefs.emailVerified !== null,
    email: prefs.email,
  };
}

export class EmailPreferencesService {
  constructor(
    private readonly repo: IWeeklyEmailRepository = weeklyEmailRepository,
    private readonly email: IEmailService = emailService,
    private readonly verifyUrl: (userId: string, email: string) => string = verifyEmailUrl,
  ) {}

  async get(userId: string): Promise<EmailPreferencesDto> {
    const prefs = await this.repo.getPreferences(userId);
    if (!prefs) throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
    return toDto(prefs);
  }

  async set(
    userId: string,
    input: { weekReady?: boolean | undefined; weeklyRecap?: boolean | undefined },
    source: ConsentSource = 'web',
  ): Promise<EmailPreferencesDto> {
    const prefs = await this.repo.setPreferences(userId, {
      ...(input.weekReady !== undefined && { weeklyEmailReady: input.weekReady }),
      ...(input.weeklyRecap !== undefined && { weeklyEmailRecap: input.weeklyRecap }),
    });
    if (!prefs) throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
    // §2.13: every email-preference write is a consent event — the digest
    // itself is the "product", so switching it off IS withdrawing consent.
    if (input.weekReady !== undefined) {
      await consentService.record({
        userId,
        kind: 'EMAIL_WEEK_READY',
        granted: input.weekReady,
        source,
      });
    }
    if (input.weeklyRecap !== undefined) {
      await consentService.record({
        userId,
        kind: 'EMAIL_RECAP',
        granted: input.weeklyRecap,
        source,
      });
    }
    return toDto(prefs);
  }

  /** Emails a confirmation link; a no-op for an already-confirmed address. */
  async sendConfirmation(
    userId: string,
    firstName: string | null,
  ): Promise<{ alreadyConfirmed: boolean }> {
    const prefs = await this.repo.getPreferences(userId);
    if (!prefs) throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
    if (prefs.emailVerified) return { alreadyConfirmed: true };
    const rendered = renderVerifyEmail({
      firstName,
      verifyUrl: this.verifyUrl(userId, prefs.email),
    });
    await this.email.send({ to: prefs.email, ...rendered });
    return { alreadyConfirmed: false };
  }

  /** Registration hook: best effort, never fails the signup. */
  sendConfirmationInBackground(userId: string, firstName: string | null): void {
    this.sendConfirmation(userId, firstName).catch((err: unknown) => {
      console.error('[EmailPreferences] confirmation email failed:', err);
    });
  }

  async confirm(token: string): Promise<{ confirmed: true }> {
    const payload = readVerifyEmailToken(token);
    if (!payload) throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_LINK });
    const ok = await this.repo.markEmailVerified(payload.userId, payload.email);
    if (!ok) throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_LINK });
    return { confirmed: true };
  }

  /**
   * One-click unsubscribe from an email link — no session. `resubscribe`
   * undoes it from the same page ("Changed your mind?").
   */
  async unsubscribe(
    token: string,
    resubscribe = false,
  ): Promise<{ scope: UnsubscribeScope; weekReady: boolean; weeklyRecap: boolean }> {
    const payload = readUnsubscribeToken(token);
    if (!payload) throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_LINK });
    const prefs = await this.repo.setPreferences(payload.userId, {
      ...(payload.scope !== 'WEEKLY_RECAP' && { weeklyEmailReady: resubscribe }),
      ...(payload.scope !== 'WEEK_READY' && { weeklyEmailRecap: resubscribe }),
    });
    // A deleted account: nothing left to email, so the outcome is the same.
    if (!prefs) throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_LINK });
    // Never echo the address: whoever holds the link may not be the owner.
    return {
      scope: payload.scope,
      weekReady: prefs.weeklyEmailReady,
      weeklyRecap: prefs.weeklyEmailRecap,
    };
  }
}

export const emailPreferencesService = new EmailPreferencesService();
