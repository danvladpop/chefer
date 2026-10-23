import { describe, expect, it, vi } from 'vitest';
import type { ActiveHouseholdLink, HouseholdInviteWithMember } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { HouseholdAccessService, type HouseholdAccessDeps } from './household-access.service.js';

// ADR 0002: the one seam that decides whose plan a request touches, the kill
// switch, the one entitlement check, and the order of invite states.

const NOW = new Date('2026-10-22T12:00:00Z');

const user = (id: string, planTier: 'FREE' | 'PREMIUM' = 'FREE'): UserProfile => ({
  id,
  email: `${id}@x.dev`,
  name: null,
  firstName: id === 'owner' ? 'Dan' : 'Maria',
  role: 'USER',
  planTier,
  image: null,
});

const member = {
  id: 'm1',
  userId: 'owner',
  name: 'Maria',
  portionFactor: 0.75,
  isKid: false,
  ageBand: null,
  allergies: ['Peanuts'],
  dietaryRestrictions: [],
  dislikedIngredients: [],
  claimedBy: null as string | null,
};

const link = (over: Partial<ActiveHouseholdLink> = {}): ActiveHouseholdLink =>
  ({
    id: 'l1',
    ownerId: 'owner',
    partnerId: 'partner',
    memberId: 'm1',
    status: 'ACTIVE',
    inviteCode: 'CODE',
    startedAt: NOW,
    endedAt: null,
    endedBy: null,
    owner: { id: 'owner', firstName: 'Dan', name: null },
    partner: { id: 'partner', firstName: 'Maria', name: null },
    member: { ...member },
    ...over,
  }) as ActiveHouseholdLink;

const invite = (over: Partial<HouseholdInviteWithMember> = {}): HouseholdInviteWithMember =>
  ({
    code: 'ABCDEFGHJK',
    ownerId: 'owner',
    memberId: 'm1',
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    usedAt: null,
    usedById: null,
    revokedAt: null,
    member: { ...member },
    owner: { id: 'owner', firstName: 'Dan', name: null },
    ...over,
  }) as HouseholdInviteWithMember;

function service(over: Partial<HouseholdAccessDeps> = {}, links: ActiveHouseholdLink[] = []) {
  const sharing = {
    activeAsPartner: vi.fn(async (id: string) => links.find((l) => l.partnerId === id) ?? null),
    activeAsOwner: vi.fn(async (id: string) => links.filter((l) => l.ownerId === id)),
    countActiveAsOwner: vi.fn(async (id: string) => links.filter((l) => l.ownerId === id).length),
    findInvite: vi.fn(async () => invite()),
  };
  return new HouseholdAccessService({
    sharing: sharing as unknown as HouseholdAccessDeps['sharing'],
    members: { findByUserId: vi.fn(async () => [{ ...member }]) },
    enabled: async () => true,
    appUrl: async () => 'https://chefer.test',
    now: () => NOW,
    ...over,
  });
}

describe('householdAccess.scope', () => {
  it('a partner touches the owner’s plan, at their profile’s portion', async () => {
    const s = service({}, [link()]);
    expect(await s.scope('partner')).toMatchObject({
      role: 'PARTNER',
      planUserId: 'owner',
      ownerName: 'Dan',
      portion: 0.75,
    });
    expect(await s.scope('owner')).toEqual({
      role: 'OWNER',
      planUserId: 'owner',
      partnerIds: ['partner'],
    });
    expect(await s.scope('someone')).toEqual({ role: 'SOLO', planUserId: 'someone' });
  });

  it('the flag off makes everyone SOLO without reading a link (kill switch)', async () => {
    const s = service({ enabled: async () => false }, [link()]);
    expect(await s.scope('partner')).toEqual({ role: 'SOLO', planUserId: 'partner' });
    expect(await s.people('owner')).toBeNull();
    expect(await s.sameHousehold('owner', 'partner')).toBe(false);
  });

  it('owner-only actions refuse a partner by name', async () => {
    const s = service({}, [link()]);
    expect(() => s.assertNotPartner({ role: 'SOLO', planUserId: 'x' })).not.toThrow();
    const scope = await s.scope('partner');
    expect(() => s.assertNotPartner(scope)).toThrow(/Only Dan can do this/);
  });

  it('names people only when the household has a partner', async () => {
    const s = service({}, [link()]);
    expect([...((await s.people('owner')) ?? new Map())]).toEqual([
      ['owner', 'Dan'],
      ['partner', 'Maria'],
    ]);
    expect(await s.people('someone')).toBeNull();
    expect(await s.sameHousehold('owner', 'partner')).toBe(true);
    expect(await s.sameHousehold('partner', 'someone')).toBe(false);
  });
});

describe('householdAccess.canInvite — the one entitlement check', () => {
  it('caps partners by PLAN_FEATURES.householdPartners on both tiers', () => {
    const s = service();
    expect(s.canInvite(user('owner'), 3)).toBe(true);
    expect(s.canInvite(user('owner'), 4)).toBe(false);
    expect(s.canInvite(user('owner', 'PREMIUM'), 4)).toBe(false);
  });
});

describe('householdAccess.preview — state order', () => {
  it.each([
    ['NOT_FOUND', { findInvite: null }],
    ['SELF', { asUser: 'owner' }],
    ['REVOKED', { invite: { revokedAt: NOW } }],
    ['USED', { invite: { usedAt: NOW } }],
    ['EXPIRED', { invite: { expiresAt: NOW } }],
  ] as const)('%s', async (state, setup) => {
    const s = service({
      sharing: {
        activeAsPartner: vi.fn(async () => null),
        activeAsOwner: vi.fn(async () => []),
        countActiveAsOwner: vi.fn(async () => 0),
        findInvite: vi.fn(async () =>
          'findInvite' in setup ? null : invite('invite' in setup ? setup.invite : {}),
        ),
      } as unknown as HouseholdAccessDeps['sharing'],
    });
    const who = 'asUser' in setup ? setup.asUser : 'newcomer';
    expect((await s.preview(who, 'ABCDEFGHJK')).state).toBe(state);
  });

  it('OK shows the owner’s name and the profile’s safety terms; a taken profile says so', async () => {
    const s = service();
    expect(await s.preview('newcomer', 'ABCDEFGHJK')).toMatchObject({
      state: 'OK',
      ownerName: 'Dan',
      profile: { name: 'Maria', allergies: ['Peanuts'], portionFactor: 0.75 },
    });
    const taken = service({
      members: { findByUserId: vi.fn(async () => [{ ...member, claimedBy: 'other' }]) },
    });
    expect((await taken.preview('newcomer', 'ABCDEFGHJK')).state).toBe('PROFILE_TAKEN');
  });

  it('someone already in another household is told to leave first; an owner with partners cannot join', async () => {
    const other = link({ ownerId: 'third', owner: { id: 'third', firstName: 'Ana', name: null } });
    const s = service({}, [other]);
    expect(await s.preview('partner', 'ABCDEFGHJK')).toEqual({
      state: 'IN_OTHER_HOUSEHOLD',
      currentOwnerName: 'Ana',
    });
    const owner = service({}, [link({ ownerId: 'newcomer', partnerId: 'p2' })]);
    expect((await owner.preview('newcomer', 'ABCDEFGHJK')).state).toBe('HAS_PARTNERS');
  });
});
