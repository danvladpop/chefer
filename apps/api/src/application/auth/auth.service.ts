import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';

import { prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'chefer_session';
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AuthService {
  async register(input: RegisterInput, res: Response): Promise<UserProfile> {
    const { email, password, firstName, lastName } = input;

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'An account with this email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const name = [firstName, lastName].filter(Boolean).join(' ') || null;

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        name,
      },
    });

    await this.createSession(user.id, res);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserProfile['role'],
      image: user.image,
    };
  }

  async login(input: LoginInput, res: Response): Promise<UserProfile> {
    const { email, password } = input;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user?.passwordHash) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }

    await this.createSession(user.id, res);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserProfile['role'],
      image: user.image,
    };
  }

  async logout(sessionToken: string | null, res: Response): Promise<void> {
    if (sessionToken) {
      await prisma.session.deleteMany({ where: { sessionToken } }).catch(() => {
        // Ignore errors — cookie is cleared regardless
      });
    }
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async createSession(userId: string, res: Response): Promise<void> {
    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + SESSION_EXPIRY_MS);

    await prisma.session.create({
      data: { sessionToken, userId, expires },
    });

    const isProd = process.env['NODE_ENV'] === 'production';
    const securePart = isProd ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_EXPIRY_MS / 1000)}${securePart}`,
    );
  }
}

export const authService = new AuthService();
