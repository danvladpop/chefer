import { createHash, randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@chefer/database';
import { emailService } from '../../lib/email/index.js';
import { env } from '../../lib/env.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_COST = 12; // matches auth.service registration

/**
 * Only the SHA-256 of the token is stored — a database leak must not let an
 * attacker reset arbitrary passwords with the stolen rows.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PasswordResetService {
  /**
   * Issues a reset token and emails the reset link. Deliberately succeeds
   * whether or not the email belongs to an account — the response must not
   * reveal which addresses are registered (account enumeration).
   */
  async requestReset(email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user) return; // same outward behaviour as success

    const token = randomBytes(32).toString('hex');

    // One live token per account: issuing a new link invalidates older ones.
    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { identifier: `reset:${normalized}` } }),
      prisma.verificationToken.create({
        data: {
          identifier: `reset:${normalized}`,
          token: hashToken(token),
          expires: new Date(Date.now() + TOKEN_TTL_MS),
        },
      }),
    ]);

    const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;
    await emailService.send({
      to: normalized,
      subject: 'Reset your Chefer password',
      text: [
        'Someone requested a password reset for your Chefer account.',
        '',
        `Reset your password (link valid for 1 hour):`,
        resetUrl,
        '',
        "If this wasn't you, ignore this email — your password is unchanged.",
      ].join('\n'),
    });
  }

  /**
   * Consumes a reset token: sets the new password and signs the user out
   * everywhere — any session an attacker (or old device) holds dies with
   * the old password.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const row = await prisma.verificationToken.findUnique({
      where: { token: hashToken(token) },
    });

    if (!row || !row.identifier.startsWith('reset:') || row.expires < new Date()) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This reset link is invalid or has expired. Request a new one.',
      });
    }

    const email = row.identifier.slice('reset:'.length);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This reset link is invalid or has expired. Request a new one.',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      // Single-use: the consumed token (and any siblings) disappears.
      prisma.verificationToken.deleteMany({ where: { identifier: row.identifier } }),
      // Invalidate every existing session.
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
  }
}

export const passwordResetService = new PasswordResetService();
