import { TRPCError } from '@trpc/server';
import {
  householdDisplayName,
  householdMemberRepository,
  householdNoticeRepository,
  householdSharingRepository,
  userRepository,
  type HouseholdNoticeRepository,
  type IHouseholdMemberRepository,
  type IHouseholdSharingRepository,
} from '@chefer/database';
import {
  HOUSEHOLD_SHARING_COPY,
  HOUSEHOLD_SHARING_LIMITS,
  householdInviteUrl,
  type HouseholdInvitePreview,
  type HouseholdNoticeDto,
  type HouseholdNoticeKind,
  type HouseholdSharingStatus,
  type JoinHouseholdInput,
  type UserProfile,
} from '@chefer/types';
import { getLimit } from '../../lib/entitlements.js';
import { generateInviteCode } from '../../lib/invite-code.js';

// ─── Household access (ADR 0003) ──────────────────────────────────────────────
// THE seam that answers "whose plan and list does this request touch?" plus the
// invite → join → leave lifecycle. A partner (own account) claims one of the
// owner's member profiles; the owner's plans and lists are the household's.
// Plan and list procedures resolve `scope` once and call the existing services
// with `planUserId` — the services themselves stay single-person.

const DAY_MS = 24 * 60 * 60 * 1000;

export type HouseholdScope =
  | { role: 'SOLO'; planUserId: string }
  | { role: 'OWNER'; planUserId: string; partnerIds: string[] }
  | {
      role: 'PARTNER';
      /** The owner's id: every plan/list lookup uses it. */
      planUserId: string;
      linkId: string;
      ownerName: string;
      memberId: string | null;
      /** What the partner eats of each meal: the claimed profile's portionFactor. */
      portion: number;
    };

/** A household participant's display name, for "Ticked by Maria". */
export type HouseholdPeople = Map<string, string>;

export interface HouseholdAccessDeps {
  sharing: IHouseholdSharingRepository;
  members: Pick<IHouseholdMemberRepository, 'findByUserId'>;
  notices: Pick<HouseholdNoticeRepository, 'upsert' | 'list' | 'markRead'>;
  enabled: () => Promise<boolean>;
  appUrl: () => Promise<string>;
  newCode: () => string;
  now: () => Date;
  loadUser: (id: string) => Promise<UserProfile | null>;
}

async function loadUserProfile(id: string): Promise<UserProfile | null> {
  const u = await userRepository.findById(id);
  if (!u) return null;
  const { email, name, firstName, role, planTier, image } = u;
  return { id: u.id, email, name, firstName, role, planTier, image };
}

const defaultDeps: HouseholdAccessDeps = {
  sharing: householdSharingRepository,
  members: householdMemberRepository,
  notices: householdNoticeRepository,
  // Lazy: lib/flags and lib/env validate the env at load, and this seam sits
  // under services whose unit tests run without one (the recipe-access pattern).
  // Fails CLOSED: no env, no sharing.
  enabled: async () => {
    try {
      return (await import('../../lib/flags.js')).isFlagEnabled('householdSharing');
    } catch {
      return false;
    }
  },
  appUrl: async () => (await import('../../lib/env.js')).env.APP_URL,
  newCode: () => generateInviteCode(HOUSEHOLD_SHARING_LIMITS.inviteCodeLength),
  now: () => new Date(),
  loadUser: loadUserProfile,
};

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && (err as { code?: unknown } | null)?.code === 'P2002';
}

const nameOf = (p: { firstName: string | null; name: string | null }) =>
  householdDisplayName(p, 'Someone');

export class HouseholdAccessService {
  private readonly deps: HouseholdAccessDeps;

  constructor(deps: Partial<HouseholdAccessDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /** Whether household sharing is on (the `householdSharing` flag). Off = everyone is SOLO. */
  isEnabled(): Promise<boolean> {
    return this.deps.enabled();
  }

  /**
   * Whose plan and list a request by `userId` touches. With the flag off every
   * account is SOLO — the kill switch hands every partner their own plans back
   * without touching a row.
   */
  async scope(userId: string): Promise<HouseholdScope> {
    if (!(await this.deps.enabled())) return { role: 'SOLO', planUserId: userId };
    const asPartner = await this.deps.sharing.activeAsPartner(userId);
    if (asPartner) {
      return {
        role: 'PARTNER',
        planUserId: asPartner.ownerId,
        linkId: asPartner.id,
        ownerName: nameOf(asPartner.owner),
        memberId: asPartner.memberId,
        portion: asPartner.member?.portionFactor ?? 1,
      };
    }
    const asOwner = await this.deps.sharing.activeAsOwner(userId);
    if (asOwner.length > 0) {
      return { role: 'OWNER', planUserId: userId, partnerIds: asOwner.map((l) => l.partnerId) };
    }
    return { role: 'SOLO', planUserId: userId };
  }

  /** The account whose plan a partner edits, as a UserProfile (tier decides premium swaps). */
  async planUser(user: UserProfile, scope: HouseholdScope): Promise<UserProfile> {
    if (scope.role !== 'PARTNER') return user;
    const owner = await this.deps.loadUser(scope.planUserId);
    if (!owner) throw new TRPCError({ code: 'NOT_FOUND', message: 'Household not found.' });
    return owner;
  }

  /** FORBIDDEN for a partner: the action is driven by the owner's goals (ADR 0003). */
  assertNotPartner(scope: HouseholdScope): void {
    if (scope.role === 'PARTNER') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: HOUSEHOLD_SHARING_COPY.ownerOnly(scope.ownerName),
      });
    }
  }

  /**
   * Everyone in the household whose plan `planUserId` owns, id → first name —
   * for "Ticked by Maria". Only the owner and ACTIVE partners; a single-person
   * household returns null (no hints shown).
   */
  async people(planUserId: string): Promise<HouseholdPeople | null> {
    if (!(await this.deps.enabled())) return null;
    const links = await this.deps.sharing.activeAsOwner(planUserId);
    const first = links[0];
    if (!first) return null;
    const people: HouseholdPeople = new Map();
    people.set(planUserId, nameOf(first.owner));
    for (const l of links) people.set(l.partnerId, nameOf(l.partner));
    return people;
  }

  /**
   * Whether two accounts share a household (owner ↔ partner, or two partners of
   * one owner). Opens each other's own recipes inside the shared week.
   */
  async sameHousehold(a: string, b: string): Promise<boolean> {
    if (a === b || !(await this.deps.enabled())) return false;
    const [scopeA, scopeB] = await Promise.all([this.scope(a), this.scope(b)]);
    return scopeA.role !== 'SOLO' && scopeA.planUserId === scopeB.planUserId;
  }

  /**
   * The ONE entitlement check for partners (ADR 0003): PLAN_FEATURES
   * .householdPartners on the owner's tier. Paid seats would change only that entry.
   */
  canInvite(owner: UserProfile, activePartners: number): boolean {
    const cap = getLimit(owner, 'householdPartners');
    return cap === null || activePartners < cap;
  }

  /** `household.sharing` — the Household screen's view of sharing. */
  async status(user: UserProfile): Promise<HouseholdSharingStatus> {
    const enabled = await this.deps.enabled();
    const empty: HouseholdSharingStatus = {
      enabled,
      role: 'SOLO',
      canInvite: false,
      partners: [],
      invites: [],
    };
    if (!enabled) return empty;
    const asPartner = await this.deps.sharing.activeAsPartner(user.id);
    if (asPartner) {
      return {
        ...empty,
        role: 'PARTNER',
        owner: { name: nameOf(asPartner.owner) },
        ...(asPartner.member && {
          myProfile: {
            memberId: asPartner.member.id,
            name: asPartner.member.name,
            portionFactor: asPartner.member.portionFactor,
          },
        }),
      };
    }
    const now = this.deps.now();
    const appUrl = await this.deps.appUrl();
    const [links, invites] = await Promise.all([
      this.deps.sharing.activeAsOwner(user.id),
      this.deps.sharing.listOpenInvites(user.id, now),
    ]);
    return {
      enabled,
      role: links.length > 0 ? 'OWNER' : 'SOLO',
      canInvite: this.canInvite(user, links.length),
      partners: links.map((l) => ({
        linkId: l.id,
        memberId: l.memberId,
        name: nameOf(l.partner),
        since: l.startedAt.toISOString(),
      })),
      invites: invites.map((i) => ({
        code: i.code,
        memberId: i.memberId,
        url: householdInviteUrl(appUrl, i.code),
        expiresAt: i.expiresAt.toISOString(),
      })),
    };
  }

  /** `household.invites.create` — one open invite per profile; a new one replaces the old. */
  async createInvite(
    owner: UserProfile,
    memberId: string,
  ): Promise<{ code: string; url: string; expiresAt: string }> {
    await this.assertEnabled();
    const scope = await this.scope(owner.id);
    if (scope.role === 'PARTNER') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: HOUSEHOLD_SHARING_COPY.ownerOnly(scope.ownerName),
      });
    }
    const members = await this.deps.members.findByUserId(owner.id);
    const member = members.find((m) => m.id === memberId);
    if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Household member not found.' });
    if (member.claimedBy) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `${member.name} has already joined.` });
    }
    const partners = scope.role === 'OWNER' ? scope.partnerIds.length : 0;
    if (!this.canInvite(owner, partners)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Your household is full. Remove someone to invite another person.',
      });
    }
    const now = this.deps.now();
    await this.deps.sharing.revokeInvitesForMember(owner.id, memberId, now);
    if (
      (await this.deps.sharing.countOpenInvites(owner.id, now)) >=
      HOUSEHOLD_SHARING_LIMITS.maxOpenInvites
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Too many open invites. Cancel one first.',
      });
    }
    const expiresAt = new Date(now.getTime() + HOUSEHOLD_SHARING_LIMITS.inviteTtlDays * DAY_MS);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const invite = await this.deps.sharing.createInvite({
          code: this.deps.newCode(),
          ownerId: owner.id,
          memberId,
          expiresAt,
        });
        return {
          code: invite.code,
          url: householdInviteUrl(await this.deps.appUrl(), invite.code),
          expiresAt: invite.expiresAt.toISOString(),
        };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new TRPCError({ code: 'CONFLICT', message: 'Could not create an invite. Try again.' });
  }

  async revokeInvite(ownerId: string, code: string): Promise<{ ok: true }> {
    await this.assertEnabled();
    const ok = await this.deps.sharing.revokeInvite(ownerId, code, this.deps.now());
    if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found.' });
    return { ok: true };
  }

  /** `household.previewInvite` — what the join screen shows. Names only for OK / ALREADY_JOINED. */
  async preview(userId: string, code: string): Promise<HouseholdInvitePreview> {
    await this.assertEnabled();
    const invite = await this.deps.sharing.findInvite(code);
    if (!invite) return { state: 'NOT_FOUND' };
    if (invite.ownerId === userId) return { state: 'SELF' };
    const asPartner = await this.deps.sharing.activeAsPartner(userId);
    if (asPartner?.ownerId === invite.ownerId) {
      return { state: 'ALREADY_JOINED', ownerName: nameOf(invite.owner) };
    }
    if (invite.revokedAt) return { state: 'REVOKED' };
    if (invite.usedAt) return { state: 'USED' };
    if (invite.expiresAt <= this.deps.now()) return { state: 'EXPIRED' };
    if (asPartner)
      return { state: 'IN_OTHER_HOUSEHOLD', currentOwnerName: nameOf(asPartner.owner) };
    if ((await this.deps.sharing.countActiveAsOwner(userId)) > 0) return { state: 'HAS_PARTNERS' };
    const members = await this.deps.members.findByUserId(invite.ownerId);
    const member = members.find((m) => m.id === invite.memberId);
    if (!member) return { state: 'NOT_FOUND' };
    if (member.claimedBy) return { state: 'PROFILE_TAKEN' };
    return {
      state: 'OK',
      ownerName: nameOf(invite.owner),
      profile: {
        name: member.name,
        portionFactor: member.portionFactor,
        isKid: member.isKid,
        allergies: member.allergies,
        dietaryRestrictions: member.dietaryRestrictions,
        dislikedIngredients: member.dislikedIngredients,
      },
    };
  }

  /** `household.join` — the consent screen's "Join household". */
  async join(
    user: UserProfile,
    input: JoinHouseholdInput,
  ): Promise<{ ownerName: string; profileName: string }> {
    await this.assertEnabled();
    const invite = await this.deps.sharing.findInvite(input.code);
    const owner = invite ? await this.deps.loadUser(invite.ownerId) : null;
    if (!invite || !owner) throw invalidInvite('NOT_FOUND');
    const result = await this.deps.sharing.join({
      code: input.code,
      partnerId: user.id,
      now: this.deps.now(),
      maxPartners: getLimit(owner, 'householdPartners') ?? Number.MAX_SAFE_INTEGER,
      safety: {
        allergies: input.allergies,
        dietaryRestrictions: input.dietaryRestrictions,
        dislikedIngredients: input.dislikedIngredients,
      },
    });
    switch (result.status) {
      case 'joined':
        await this.notify(owner.id, 'HOUSEHOLD_PARTNER_JOINED', user.id, nameOf(user));
        return { ownerName: nameOf(owner), profileName: result.memberName };
      case 'self':
        throw invalidInvite('SELF');
      case 'in_other_household':
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: HOUSEHOLD_SHARING_COPY.inviteState.IN_OTHER_HOUSEHOLD('another person'),
        });
      case 'has_partners':
        throw invalidInvite('HAS_PARTNERS');
      case 'profile_taken':
        throw invalidInvite('PROFILE_TAKEN');
      case 'partner_limit':
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This household is full. Ask the owner to make room.',
        });
      case 'conflict':
        throw new TRPCError({ code: 'CONFLICT', message: 'Something changed. Try again.' });
      case 'invite_unavailable':
        throw invalidInvite('USED');
    }
  }

  /** `household.leave` — a partner leaves. Their profile stays with its safety terms. */
  async leave(user: UserProfile): Promise<{ ok: true }> {
    const link = await this.deps.sharing.activeAsPartner(user.id);
    if (!link) return { ok: true };
    const ended = await this.deps.sharing.end(link.id, 'PARTNER', this.deps.now());
    if (ended) await this.notify(ended.ownerId, 'HOUSEHOLD_PARTNER_LEFT', user.id, nameOf(user));
    return { ok: true };
  }

  /** `household.removePartner` — the owner removes a partner (only their own links). */
  async removePartner(owner: UserProfile, linkId: string): Promise<{ ok: true }> {
    const links = await this.deps.sharing.activeAsOwner(owner.id);
    const link = links.find((l) => l.id === linkId);
    if (!link) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not in your household.' });
    const ended = await this.deps.sharing.end(link.id, 'OWNER', this.deps.now());
    if (ended) await this.notify(ended.partnerId, 'HOUSEHOLD_REMOVED', owner.id, nameOf(owner));
    return { ok: true };
  }

  /**
   * Before the owner deletes a member profile: a claimed profile's partner is
   * removed first (link ENDED, notice), so the profile delete never strands a link.
   */
  async beforeMemberDeleted(owner: UserProfile, memberId: string): Promise<void> {
    const links = await this.deps.sharing.activeAsOwner(owner.id);
    const link = links.find((l) => l.memberId === memberId);
    if (link) await this.removePartner(owner, link.id);
  }

  /**
   * Account deletion (business_flow §24). As owner: every partner keeps a
   * HOUSEHOLD_ENDED notice whose actor is the partner (so it survives this
   * account's cascade). As partner: the owner gets HOUSEHOLD_PARTNER_LEFT with
   * the owner as actor. The links themselves cascade with the account.
   */
  async beforeAccountDeleted(userId: string): Promise<void> {
    // With sharing off nobody reads the links; they cascade with the account.
    if (!(await this.deps.enabled())) return;
    const now = this.deps.now();
    const [asOwner, asPartner] = await Promise.all([
      this.deps.sharing.activeAsOwner(userId),
      this.deps.sharing.activeAsPartner(userId),
    ]);
    for (const link of asOwner) {
      await this.deps.sharing.end(link.id, 'SYSTEM', now);
      await this.notify(link.partnerId, 'HOUSEHOLD_ENDED', link.partnerId, nameOf(link.owner));
    }
    if (asPartner) {
      await this.deps.sharing.end(asPartner.id, 'PARTNER', now);
      await this.notify(
        asPartner.ownerId,
        'HOUSEHOLD_PARTNER_LEFT',
        asPartner.ownerId,
        nameOf(asPartner.partner),
      );
    }
  }

  /** `household.notices` — join / leave / removal notices, recent and unread. */
  async notices(userId: string): Promise<HouseholdNoticeDto[]> {
    if (!(await this.deps.enabled())) return [];
    const since = new Date(
      this.deps.now().getTime() - HOUSEHOLD_SHARING_LIMITS.noticeDays * DAY_MS,
    );
    const rows = await this.deps.notices.list(userId, since, 20);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as HouseholdNoticeKind,
      name: ((r.payload as { name?: unknown } | null)?.name as string | undefined) ?? 'Someone',
      createdAt: r.createdAt.toISOString(),
      read: r.readAt !== null,
    }));
  }

  async dismissNotice(userId: string, id: string): Promise<{ ok: true }> {
    await this.deps.notices.markRead(userId, id);
    return { ok: true };
  }

  private async assertEnabled(): Promise<void> {
    if (!(await this.deps.enabled())) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Household sharing is not available.' });
    }
  }

  /** Best effort: a notice never fails the action that caused it. */
  private async notify(
    userId: string,
    kind: HouseholdNoticeKind,
    actorId: string,
    name: string,
  ): Promise<void> {
    try {
      await this.deps.notices.upsert({ userId, kind, actorId, name });
    } catch (err) {
      console.error(`[household] ${kind} notice write failed:`, err);
    }
  }
}

function invalidInvite(state: keyof typeof HOUSEHOLD_SHARING_COPY.inviteState): TRPCError {
  const copy = HOUSEHOLD_SHARING_COPY.inviteState[state];
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: typeof copy === 'function' ? copy('another person') : copy,
  });
}

export const householdAccess = new HouseholdAccessService();
