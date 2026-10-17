import { randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import {
  coachingInviteRepository,
  coachingLinkRepository,
  gymProfileRepository,
  trainerProfileRepository,
  type ICoachingInviteRepository,
  type ICoachingLinkRepository,
  type IGymProfileRepository,
  type ITrainerProfileRepository,
} from '@chefer/database';
import {
  COACHING_COPY,
  COACHING_LIMITS,
  type InviteDto,
  type InvitePreviewDto,
} from '@chefer/types';
import { env } from '../../lib/env.js';
import { inviteStateOf, toInviteDto } from './coaching-dto.mappers.js';

// ─── Trainer coaching: invites (spec §2.2, §7.2, §7.3) ────────────────────────
// A single-use link `APP_URL/coaching/join/<code>`, 14 days, revocable. The
// code is the only secret: 10 characters of Crockford base32 from crypto random
// (50 bits; the rate limits on previewInvite/join make guessing hopeless).

/** Crockford base32: no I, L, O, U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DAY_MS = 24 * 60 * 60 * 1000;

/** `length` characters of Crockford base32 from crypto random (32 symbols: a byte's low 5 bits, no modulo bias). */
export function generateInviteCode(
  length: number = COACHING_LIMITS.inviteCodeLength,
  bytes: (n: number) => Uint8Array = randomBytes,
): string {
  const random = bytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) code += ALPHABET.charAt((random[i] ?? 0) & 31);
  return code;
}

export interface CoachingInviteDeps {
  invites: ICoachingInviteRepository;
  links: Pick<ICoachingLinkRepository, 'findActiveForClient' | 'countActiveForTrainer'>;
  trainers: Pick<ITrainerProfileRepository, 'find' | 'findActive'>;
  gymProfiles: Pick<IGymProfileRepository, 'findByUserId'>;
  appUrl: () => string;
  newCode: () => string;
  now: () => Date;
}

const defaultDeps: CoachingInviteDeps = {
  invites: coachingInviteRepository,
  links: coachingLinkRepository,
  trainers: trainerProfileRepository,
  gymProfiles: gymProfileRepository,
  appUrl: () => env.APP_URL,
  newCode: () => generateInviteCode(),
  now: () => new Date(),
};

/** A Prisma unique-constraint failure (the code already exists). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && (err as { code?: unknown } | null)?.code === 'P2002';
}

export class CoachingInviteService {
  private readonly deps: CoachingInviteDeps;

  constructor(deps: Partial<CoachingInviteDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /** `trainer.invites.list`: the trainer's invites from the last 30 days. */
  async list(trainerId: string): Promise<InviteDto[]> {
    const now = this.deps.now();
    const since = new Date(now.getTime() - COACHING_LIMITS.inviteListDays * DAY_MS);
    const rows = await this.deps.invites.listForTrainer(trainerId, since);
    return rows.map((r) => toInviteDto(r, now, this.deps.appUrl()));
  }

  /** `trainer.invites.create`: at most 20 open invites, and none once the trainer is at the client cap. */
  async create(trainerId: string, label: string | undefined): Promise<InviteDto> {
    const now = this.deps.now();
    const [open, clients] = await Promise.all([
      this.deps.invites.countOpen(trainerId, now),
      this.deps.links.countActiveForTrainer(trainerId),
    ]);
    if (open >= COACHING_LIMITS.maxOpenInvites) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.openInviteLimit });
    }
    if (clients >= COACHING_LIMITS.maxActiveClients) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.clientLimit });
    }
    const cleanLabel = label?.trim() ? label.trim() : null;
    const expiresAt = new Date(now.getTime() + COACHING_LIMITS.inviteTtlDays * DAY_MS);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const row = await this.deps.invites.create({
          code: this.deps.newCode(),
          trainerId,
          label: cleanLabel,
          expiresAt,
        });
        return toInviteDto(row, now, this.deps.appUrl());
      } catch (err) {
        // A (vanishingly rare) code collision: draw another code.
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not create the invite.' });
  }

  /** `trainer.invites.revoke`: a used, already revoked or foreign invite is just "not found". */
  async revoke(trainerId: string, code: string): Promise<{ ok: true }> {
    if (!(await this.deps.invites.revoke(trainerId, code, this.deps.now()))) {
      throw new TRPCError({ code: 'NOT_FOUND', message: COACHING_COPY.server.notFound });
    }
    return { ok: true };
  }

  /**
   * `coaching.previewInvite`: what the consent screen needs. States, in order:
   * NOT_FOUND (unknown code), SELF, ALREADY_YOURS, REVOKED (also: the trainer
   * turned trainer tools off), USED, EXPIRED, OK. The trainer's name is only
   * disclosed for OK and ALREADY_YOURS.
   */
  async preview(clientId: string, code: string): Promise<InvitePreviewDto> {
    const now = this.deps.now();
    const [invite, current, profile] = await Promise.all([
      this.deps.invites.find(code),
      this.deps.links.findActiveForClient(clientId),
      this.deps.gymProfiles.findByUserId(clientId),
    ]);
    const needsGymSetup = !profile?.setupCompletedAt;
    const currentTrainerName = current
      ? ((await this.deps.trainers.find(current.trainerId))?.displayName ?? null)
      : null;
    const base = { trainerName: null, currentTrainerName, needsGymSetup } as const;
    if (!invite) return { state: 'NOT_FOUND', ...base };
    if (invite.trainerId === clientId) return { state: 'SELF', ...base };

    const trainer = await this.deps.trainers.find(invite.trainerId);
    if (current?.trainerId === invite.trainerId) {
      return { state: 'ALREADY_YOURS', ...base, trainerName: trainer?.displayName ?? null };
    }
    const state = inviteStateOf(invite, now);
    if (state === 'OPEN' && trainer?.disabledAt !== null) {
      return { state: 'REVOKED', ...base };
    }
    if (state !== 'OPEN') return { state, ...base };
    return { state: 'OK', ...base, trainerName: trainer?.displayName ?? null };
  }
}

export const coachingInviteService = new CoachingInviteService();
