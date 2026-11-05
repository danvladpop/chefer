import {
  Prisma,
  type HouseholdInvite,
  type HouseholdLink,
  type HouseholdMember,
} from '@prisma/client';
import { prisma } from '../client';

// ─── Household sharing (ADR 0003) ─────────────────────────────────────────────
// A partner (own account) joins the owner's household by redeeming a single-use
// invite for one member profile. Access is decided ONLY from ACTIVE links; the
// partial unique indexes in ensure-indexes.sql are the database-level backstop
// for "one household per partner" and "one partner per profile".

export interface CreateHouseholdInviteData {
  code: string;
  ownerId: string;
  memberId: string;
  expiresAt: Date;
}

export type HouseholdInviteWithMember = HouseholdInvite & {
  member: HouseholdMember;
  owner: { id: string; firstName: string | null; name: string | null };
};

export type PersonName = { id: string; firstName: string | null; name: string | null };

export type ActiveHouseholdLink = HouseholdLink & {
  owner: PersonName;
  partner: PersonName;
  member: HouseholdMember | null;
};

/** The confirmed safety terms the partner agreed to on the join screen. */
export interface ConfirmedSafety {
  allergies: string[];
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
}

export interface JoinHouseholdData {
  code: string;
  partnerId: string;
  now: Date;
  maxPartners: number;
  safety: ConfirmedSafety;
}

export type JoinHouseholdResult =
  | { status: 'joined'; link: HouseholdLink; ownerId: string; memberName: string }
  | { status: 'invite_unavailable' }
  | { status: 'self' }
  | { status: 'in_other_household' }
  | { status: 'has_partners' }
  | { status: 'profile_taken' }
  | { status: 'partner_limit' }
  | { status: 'conflict' };

class JoinAbort extends Error {
  constructor(readonly result: JoinHouseholdResult) {
    super(result.status);
  }
}

export type EndedBy = 'OWNER' | 'PARTNER' | 'SYSTEM';

export interface IHouseholdSharingRepository {
  /** Throws a Prisma P2002 when the code already exists (the service retries with a new code). */
  createInvite(data: CreateHouseholdInviteData): Promise<HouseholdInvite>;
  findInvite(code: string): Promise<HouseholdInviteWithMember | null>;
  /** The owner's invites that are still usable. */
  listOpenInvites(ownerId: string, now: Date): Promise<HouseholdInvite[]>;
  countOpenInvites(ownerId: string, now: Date): Promise<number>;
  /** True when an unused, unrevoked invite of this owner was revoked. */
  revokeInvite(ownerId: string, code: string, now: Date): Promise<boolean>;
  /** Revokes every open invite for one profile (a new invite replaces them). */
  revokeInvitesForMember(ownerId: string, memberId: string, now: Date): Promise<number>;
  deleteExpiredInvitesBefore(cutoff: Date): Promise<number>;

  /** The ACTIVE link where this user is the partner, or null. */
  activeAsPartner(partnerId: string): Promise<ActiveHouseholdLink | null>;
  /** The owner's ACTIVE partner links, oldest first. */
  activeAsOwner(ownerId: string): Promise<ActiveHouseholdLink[]>;
  countActiveAsOwner(ownerId: string): Promise<number>;

  /** Redeems an invite: claim, checks, link, profile + own-preference safety, in one transaction. */
  join(data: JoinHouseholdData): Promise<JoinHouseholdResult>;
  /**
   * Ends one ACTIVE link and snapshots the profile's live safety union (profile ∪
   * the partner's own preferences) into the profile, so the table stays safe once
   * the overlay is gone. Returns null when the link is not ACTIVE.
   */
  end(linkId: string, by: EndedBy, now: Date): Promise<ActiveHouseholdLink | null>;
}

const NAME_SELECT = { select: { id: true, firstName: true, name: true } } as const;
const LINK_INCLUDE = { owner: NAME_SELECT, partner: NAME_SELECT, member: true } as const;

/** Case-insensitive union that keeps each term's first-seen casing. */
export function unionSafetyTerms(...lists: readonly string[][]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const term of list) {
      const key = term.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, term.trim());
    }
  }
  return [...seen.values()];
}

/** First name, else the first word of the full name, else `fallback` (blank counts as missing). */
function displayName(p: { firstName: string | null; name: string | null }, fallback: string) {
  const candidates = [p.firstName?.trim(), p.name?.trim().split(/\s+/)[0]];
  return candidates.find((c): c is string => c !== undefined && c.length > 0) ?? fallback;
}

async function endTx(
  tx: Prisma.TransactionClient,
  linkId: string,
  by: EndedBy,
  now: Date,
): Promise<ActiveHouseholdLink | null> {
  const link = await tx.householdLink.findFirst({
    where: { id: linkId, status: 'ACTIVE' },
    include: LINK_INCLUDE,
  });
  if (!link) return null;
  await tx.householdLink.update({
    where: { id: link.id },
    data: { status: 'ENDED', endedAt: now, endedBy: by },
  });
  if (link.member) {
    const prefs = await tx.dietaryPreferences.findUnique({ where: { userId: link.partnerId } });
    if (prefs) {
      await tx.householdMember.update({
        where: { id: link.member.id },
        data: {
          allergies: unionSafetyTerms(link.member.allergies, prefs.allergies),
          dietaryRestrictions: unionSafetyTerms(
            link.member.dietaryRestrictions,
            prefs.dietaryRestrictions,
          ),
          dislikedIngredients: unionSafetyTerms(
            link.member.dislikedIngredients,
            prefs.dislikedIngredients,
          ),
        },
      });
    }
  }
  return link;
}

export class HouseholdSharingRepository implements IHouseholdSharingRepository {
  async createInvite(data: CreateHouseholdInviteData): Promise<HouseholdInvite> {
    return prisma.householdInvite.create({ data });
  }

  async findInvite(code: string): Promise<HouseholdInviteWithMember | null> {
    return prisma.householdInvite.findUnique({
      where: { code },
      include: { member: true, owner: NAME_SELECT },
    });
  }

  async listOpenInvites(ownerId: string, now: Date): Promise<HouseholdInvite[]> {
    return prisma.householdInvite.findMany({
      where: { ownerId, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async countOpenInvites(ownerId: string, now: Date): Promise<number> {
    return prisma.householdInvite.count({
      where: { ownerId, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
    });
  }

  async revokeInvite(ownerId: string, code: string, now: Date): Promise<boolean> {
    const res = await prisma.householdInvite.updateMany({
      where: { code, ownerId, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    return res.count > 0;
  }

  async revokeInvitesForMember(ownerId: string, memberId: string, now: Date): Promise<number> {
    const res = await prisma.householdInvite.updateMany({
      where: { ownerId, memberId, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    return res.count;
  }

  async deleteExpiredInvitesBefore(cutoff: Date): Promise<number> {
    const res = await prisma.householdInvite.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    return res.count;
  }

  async activeAsPartner(partnerId: string): Promise<ActiveHouseholdLink | null> {
    return prisma.householdLink.findFirst({
      where: { partnerId, status: 'ACTIVE' },
      include: LINK_INCLUDE,
    });
  }

  async activeAsOwner(ownerId: string): Promise<ActiveHouseholdLink[]> {
    return prisma.householdLink.findMany({
      where: { ownerId, status: 'ACTIVE' },
      include: LINK_INCLUDE,
      orderBy: { startedAt: 'asc' },
    });
  }

  async countActiveAsOwner(ownerId: string): Promise<number> {
    return prisma.householdLink.count({ where: { ownerId, status: 'ACTIVE' } });
  }

  async join(data: JoinHouseholdData): Promise<JoinHouseholdResult> {
    try {
      // SERIALIZABLE: the partner cap is a count-then-insert.
      return await prisma.$transaction(
        async (tx) => {
          const invite = await tx.householdInvite.findUnique({ where: { code: data.code } });
          if (!invite) throw new JoinAbort({ status: 'invite_unavailable' });
          if (invite.ownerId === data.partnerId) throw new JoinAbort({ status: 'self' });
          // Atomic claim: exactly one of two racing joins with the same code wins.
          const claimed = await tx.householdInvite.updateMany({
            where: { code: data.code, usedAt: null, revokedAt: null, expiresAt: { gt: data.now } },
            data: { usedAt: data.now, usedById: data.partnerId },
          });
          if (claimed.count === 0) throw new JoinAbort({ status: 'invite_unavailable' });

          const [asPartner, asOwner, memberTaken, partners] = await Promise.all([
            tx.householdLink.count({ where: { partnerId: data.partnerId, status: 'ACTIVE' } }),
            tx.householdLink.count({ where: { ownerId: data.partnerId, status: 'ACTIVE' } }),
            tx.householdLink.count({ where: { memberId: invite.memberId, status: 'ACTIVE' } }),
            tx.householdLink.count({ where: { ownerId: invite.ownerId, status: 'ACTIVE' } }),
          ]);
          if (asPartner > 0) throw new JoinAbort({ status: 'in_other_household' });
          if (asOwner > 0) throw new JoinAbort({ status: 'has_partners' });
          if (memberTaken > 0) throw new JoinAbort({ status: 'profile_taken' });
          if (partners >= data.maxPartners) throw new JoinAbort({ status: 'partner_limit' });

          const member = await tx.householdMember.update({
            where: { id: invite.memberId },
            data: {
              allergies: data.safety.allergies,
              dietaryRestrictions: data.safety.dietaryRestrictions,
              dislikedIngredients: data.safety.dislikedIngredients,
            },
          });
          // Union into the partner's own preferences: their own searches and
          // scans are safe too. Never removes a term they already had.
          const own = await tx.dietaryPreferences.findUnique({ where: { userId: data.partnerId } });
          if (own) {
            await tx.dietaryPreferences.update({
              where: { userId: data.partnerId },
              data: {
                allergies: unionSafetyTerms(own.allergies, data.safety.allergies),
                dietaryRestrictions: unionSafetyTerms(
                  own.dietaryRestrictions,
                  data.safety.dietaryRestrictions,
                ),
                dislikedIngredients: unionSafetyTerms(
                  own.dislikedIngredients,
                  data.safety.dislikedIngredients,
                ),
              },
            });
          } else {
            await tx.dietaryPreferences.create({
              data: {
                userId: data.partnerId,
                cuisinePreferences: [],
                allergies: data.safety.allergies,
                dietaryRestrictions: data.safety.dietaryRestrictions,
                dislikedIngredients: data.safety.dislikedIngredients,
              },
            });
          }
          const link = await tx.householdLink.create({
            data: {
              ownerId: invite.ownerId,
              partnerId: data.partnerId,
              memberId: invite.memberId,
              inviteCode: invite.code,
              startedAt: data.now,
            },
          });
          return {
            status: 'joined',
            link,
            ownerId: invite.ownerId,
            memberName: member.name,
          } satisfies JoinHouseholdResult;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (err) {
      if (err instanceof JoinAbort) return err.result;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === 'P2002' || err.code === 'P2034')
      ) {
        return { status: 'conflict' };
      }
      throw err;
    }
  }

  async end(linkId: string, by: EndedBy, now: Date): Promise<ActiveHouseholdLink | null> {
    return prisma.$transaction((tx) => endTx(tx, linkId, by, now));
  }
}

export { displayName as householdDisplayName };

export const householdSharingRepository = new HouseholdSharingRepository();
