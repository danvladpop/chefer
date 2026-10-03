import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { ConsentKind, prisma } from '@chefer/database';
import { ACCOUNT_EXISTS_MESSAGE, type AuthResult, type MobileSession } from '@chefer/types';
import { defaultsForRegion } from '@chefer/utils';
import { consentService } from '../privacy/consent.service.js';

/** A valid bcrypt hash (cost 12) of a random string: login's timing decoy. */
const DUMMY_PASSWORD_HASH = '$2b$12$qZC9DEJlYpJdBOlrTJu.OOnTjzpY1TBuTh.s6KARjC.Sn6ECa.RAq';

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'chefer_session';
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  /** Device region, e.g. "US" — seeds units + currency (P2-6). */
  region?: string | undefined;
  /**
   * Explicit sign-up consent (T-39.1, T-26.5). All optional at the schema
   * level so a client below `clientApiLevel` 2 — a wave-0 client already out
   * on OTA (level 1, no consent checkboxes) or an older installed binary
   * (level 0) — still registers unchanged (CLAUDE.md Platform Parity: API
   * changes stay additive). `AuthService.register` is what requires them
   * once the caller declares level ≥ 2 (the first level whose UI renders the
   * boxes).
   */
  acceptedTerms?: boolean | undefined;
  ageConfirmed?: boolean | undefined;
  /** The `LEGAL_VERSIONS` (`@chefer/types`) version string the box refers to. */
  acceptedTermsVersion?: string | undefined;
}

export interface LoginInput {
  email: string;
  password: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface AuthOptions {
  /** Include the session token in the response body (mobile clients only). */
  includeSession?: boolean;
  /**
   * `ctx.clientApiLevel` (register only) — level ≥ 2 must send explicit
   * consent; level 0/1 (a wave-0 OTA client or an older installed binary)
   * registers as it always has.
   */
  clientApiLevel?: number;
  /** `ctx.isMobileClient` (register only) — the consent log's `source`. */
  consentSource?: 'web' | 'mobile';
}

export class AuthService {
  async register(input: RegisterInput, res: Response, options?: AuthOptions): Promise<AuthResult> {
    const { email, password, firstName, lastName, region, acceptedTerms, ageConfirmed } = input;
    const acceptedTermsVersion = input.acceptedTermsVersion;

    // T-39.1 / T-26.5: a level ≥ 2 client (this wave's mobile + web builds,
    // §2.8) must tick both boxes in its UI before it ever reaches here — this
    // is the server backstop, not the primary control. Level 0/1 — a wave-0
    // client already out on OTA (level 1: understands the health-consent
    // error, but has no consent checkboxes yet) or an older installed binary
    // (level 0) — sends neither field and registers exactly as it always
    // has (AC1 compat). Gating on 2, not 1, is deliberate: bumping the
    // header on 1 would have locked out every wave-0 phone the moment this
    // API deployed, since their JS runtime already sends level 1 and cannot
    // take this wave's OTA on a changed native runtime.
    const clientApiLevel = options?.clientApiLevel ?? 0;
    if (clientApiLevel >= 2) {
      if (!acceptedTerms || !acceptedTermsVersion) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You must agree to the Terms and the Privacy Policy.',
        });
      }
      if (!ageConfirmed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You must confirm you are 16 or older.',
        });
      }
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: ACCOUNT_EXISTS_MESSAGE,
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const name = [firstName, lastName].filter(Boolean).join(' ') || null;
    const display = region ? defaultsForRegion(region) : null;

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        name,
        // S15, rev 2 (T-39.3): every NEW account starts with both weekly
        // digests off — written explicitly here (not left to the column
        // default) so registration is the one place this default is visible
        // in code. Existing accounts are never touched by this path.
        weeklyEmailReady: false,
        weeklyEmailRecap: false,
        ...(acceptedTermsVersion && { termsAcceptedVersion: acceptedTermsVersion }),
        // Location defaults (backlog P2-6): a US signup starts imperial + USD,
        // a UK one in GBP, and so on. Only when the client sent a region —
        // otherwise the schema defaults (METRIC, EUR) apply as before. The
        // row carries no goal, so preferences.hasProfile stays false.
        ...(display && {
          chefProfile: {
            create: { preferredUnits: display.preferredUnits, deliveryCurrency: display.currency },
          },
        }),
      },
    });

    const session = await this.createSession(user.id, res);

    // T-39.2 consent log — best effort: a logging failure must never turn a
    // successful registration into an error response.
    await this.recordRegistrationConsent(user.id, {
      acceptedTerms,
      ageConfirmed,
      acceptedTermsVersion,
      source: options?.consentSource ?? 'web',
    }).catch((err: unknown) => {
      console.error('Failed to record registration consent:', err);
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      role: user.role,
      planTier: user.planTier,
      image: user.image,
      ...(options?.includeSession ? { session } : {}),
    };
  }

  async login(input: LoginInput, res: Response, options?: AuthOptions): Promise<AuthResult> {
    const { email, password } = input;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Always run one bcrypt compare, so the response time doesn't reveal
    // whether the email has an account (11 ms vs 295 ms — audit F-AUTH-2-2).
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user?.passwordHash || !valid) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }

    const session = await this.createSession(user.id, res);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      role: user.role,
      planTier: user.planTier,
      image: user.image,
      ...(options?.includeSession ? { session } : {}),
    };
  }

  async logout(sessionToken: string | null, res: Response): Promise<void> {
    if (sessionToken) {
      await prisma.session.deleteMany({ where: { sessionToken } }).catch(() => {
        // Ignore errors — cookie is cleared regardless
      });
    }
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /**
   * T-39.2: every consent write goes through `ConsentService.record` so the
   * log is complete. TERMS/PRIVACY/AGE are only recorded when the caller
   * actually sent them (a level ≥ 2 client) — a level 0/1 registration's
   * pre-existing static disclaimer text is never claimed as an explicit
   * acceptance event. The email/auto-plan defaults, below, are recorded for
   * every registration regardless of level, since the column defaults apply
   * unconditionally.
   */
  private async recordRegistrationConsent(
    userId: string,
    input: {
      acceptedTerms: boolean | undefined;
      ageConfirmed: boolean | undefined;
      acceptedTermsVersion: string | undefined;
      source: 'web' | 'mobile';
    },
  ): Promise<void> {
    const { acceptedTerms, ageConfirmed, acceptedTermsVersion, source } = input;
    const writes: Promise<unknown>[] = [];

    if (acceptedTerms && acceptedTermsVersion) {
      writes.push(
        consentService.record({
          userId,
          kind: ConsentKind.TERMS,
          granted: true,
          source,
          documentVersion: acceptedTermsVersion,
        }),
        consentService.record({
          userId,
          kind: ConsentKind.PRIVACY,
          granted: true,
          source,
          documentVersion: acceptedTermsVersion,
        }),
      );
    }
    if (ageConfirmed) {
      writes.push(consentService.record({ userId, kind: ConsentKind.AGE, granted: true, source }));
    }
    // T-39.3 (⚖ D-13): the email/auto-plan defaults a brand-new account
    // starts with, logged so the choice is provable — for EVERY new
    // registration, regardless of client level. The Prisma column defaults
    // apply the same `false` values whether or not the client sent explicit
    // consent, so a level 0/1 registration (no consent boxes yet) gets these
    // three rows too; it just never gets TERMS/PRIVACY/AGE rows, since it
    // never actually agreed to anything — the re-accept sheet catches that
    // account once it's on a level ≥ 2 client.
    writes.push(
      consentService.record({ userId, kind: ConsentKind.EMAIL_WEEK_READY, granted: false, source }),
      consentService.record({ userId, kind: ConsentKind.EMAIL_RECAP, granted: false, source }),
      consentService.record({ userId, kind: ConsentKind.AUTO_PLAN, granted: false, source }),
    );

    await Promise.all(writes);
  }

  private async createSession(userId: string, res: Response): Promise<MobileSession> {
    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + SESSION_EXPIRY_MS);

    await prisma.session.create({
      data: { sessionToken, userId, expires },
    });

    const isProd = process.env['NODE_ENV'] === 'production';
    const securePart = isProd ? '; Secure' : '';
    // Strict, not Lax: the app has no legitimate cross-site navigation that
    // needs the session (no OAuth callbacks, no cross-site links into
    // authenticated pages that can't survive one extra login redirect).
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_EXPIRY_MS / 1000)}${securePart}`,
    );

    return { token: sessionToken, expires };
  }
}

export const authService = new AuthService();
