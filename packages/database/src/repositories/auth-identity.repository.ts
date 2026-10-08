import type { AuthIdentity, Prisma, User } from '@prisma/client';
import { prisma } from '../client';

// ─── Linked sign-in identities (WP-22: Sign in with Google / Apple) ───────────
// One row per (provider, provider subject). Everything that has to be atomic —
// creating the user together with its first identity, or linking to an
// existing account while hardening it — lives here so the service stays free
// of Prisma (CLAUDE.md layering).

export type IdentityWithUser = AuthIdentity & { user: User };

export interface CreateIdentityData {
  provider: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  refreshTokenEnc?: string | null;
  tokenClientId?: string | null;
}

export interface UpdateIdentityData {
  email?: string | null;
  emailVerified?: boolean;
  refreshTokenEnc?: string | null;
  tokenClientId?: string | null;
  lastSignInAt?: Date;
}

export interface IAuthIdentityRepository {
  findByProviderSubject(provider: string, subject: string): Promise<IdentityWithUser | null>;
  findByUserProvider(userId: string, provider: string): Promise<AuthIdentity | null>;
  listByUser(userId: string): Promise<AuthIdentity[]>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  /** Creates the user and its first identity in one transaction. */
  createUserWithIdentity(
    user: Prisma.UserCreateInput,
    identity: CreateIdentityData,
  ): Promise<{ user: User; identity: AuthIdentity }>;
  /** Links an identity to an existing user (no other change). */
  createIdentity(userId: string, data: CreateIdentityData): Promise<AuthIdentity>;
  /**
   * Links an identity to an existing account whose email address was never
   * verified: the password (which may have been set by someone who does not
   * own the inbox — "pre-hijacking") is cleared, every existing session is
   * revoked and the email is marked verified (the provider just proved it).
   */
  createIdentityAndSecureUnverifiedUser(
    userId: string,
    data: CreateIdentityData,
  ): Promise<AuthIdentity>;
  update(id: string, data: UpdateIdentityData): Promise<AuthIdentity>;
  delete(id: string): Promise<void>;
}

export class AuthIdentityRepository implements IAuthIdentityRepository {
  async findByProviderSubject(provider: string, subject: string): Promise<IdentityWithUser | null> {
    return prisma.authIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      include: { user: true },
    });
  }

  async findByUserProvider(userId: string, provider: string): Promise<AuthIdentity | null> {
    return prisma.authIdentity.findUnique({ where: { userId_provider: { userId, provider } } });
  }

  async listByUser(userId: string): Promise<AuthIdentity[]> {
    return prisma.authIdentity.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async createUserWithIdentity(
    user: Prisma.UserCreateInput,
    identity: CreateIdentityData,
  ): Promise<{ user: User; identity: AuthIdentity }> {
    const created = await prisma.user.create({
      data: { ...user, authIdentities: { create: { ...identity, lastSignInAt: new Date() } } },
      include: { authIdentities: true },
    });
    const { authIdentities, ...rest } = created;
    const first = authIdentities[0];
    if (!first) throw new Error('Identity was not created with the user');
    return { user: rest, identity: first };
  }

  async createIdentity(userId: string, data: CreateIdentityData): Promise<AuthIdentity> {
    return prisma.authIdentity.create({ data: { ...data, userId, lastSignInAt: new Date() } });
  }

  async createIdentityAndSecureUnverifiedUser(
    userId: string,
    data: CreateIdentityData,
  ): Promise<AuthIdentity> {
    const [identity] = await prisma.$transaction([
      prisma.authIdentity.create({ data: { ...data, userId, lastSignInAt: new Date() } }),
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: null, emailVerified: new Date() },
      }),
      prisma.session.deleteMany({ where: { userId } }),
    ]);
    return identity;
  }

  async update(id: string, data: UpdateIdentityData): Promise<AuthIdentity> {
    return prisma.authIdentity.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.authIdentity.delete({ where: { id } });
  }
}

export const authIdentityRepository = new AuthIdentityRepository();
