import { describe, expect, it, vi } from 'vitest';
import type { TrainerProfile } from '@chefer/database';
import { LEGAL_VERSIONS } from '@chefer/types';
import { TrainerProfileService } from './trainer-profile.service.js';

// trainer-profile.service.ts → lib/coaching-flags.ts → lib/env.ts (throws without secrets).
vi.mock('../../lib/env.js', () => ({ env: {} }));

const NOW = new Date('2026-10-04T12:00:00Z');
const ME = { id: 'ctrainer0000000000000001', email: 'ana@x.dev' };

function setup(
  opts: {
    allowed?: boolean;
    profile?: TrainerProfile | null;
    following?: boolean;
    allowlistApplies?: boolean;
    clients?: number;
  } = {},
) {
  let profile = opts.profile ?? null;
  const trainers = {
    find: vi.fn(async () => profile),
    searchFindable: vi.fn(),
    findFindable: vi.fn(),
    listActiveWithEmail: vi.fn(),
    findActive: vi.fn(async () => (profile?.disabledAt === null ? profile : null)),
    findMany: vi.fn(),
    activate: vi.fn(async (userId: string, displayName: string, gymLine?: string | null) => {
      profile = {
        userId,
        displayName,
        activatedAt: NOW,
        gymLine: gymLine ?? null,
        disabledAt: null,
      };
      return profile;
    }),
    updateName: vi.fn(async (_u: string, displayName: string, gymLine?: string | null) => {
      if (profile?.disabledAt !== null) return null;
      profile = { ...profile, displayName, ...(gymLine !== undefined && { gymLine }) };
      return profile;
    }),
    deactivate: vi.fn(async () => ({ endedClientIds: ['c1', 'c2'], declinedClientIds: ['c3'] })),
  };
  let following = opts.following ?? true;
  const socialProfiles = {
    find: vi.fn(async () => (following ? { forcedPrivateAt: null } : null)),
    findUsers: vi.fn(async () => [{ id: ME.id, firstName: 'Ana', lastName: 'Pop', name: null }]),
  };
  const activateFollowing = vi.fn(async () => {
    following = true;
  });
  const notices = { ended: vi.fn(), requestAnswered: vi.fn() };
  const service = new TrainerProfileService({
    trainers,
    links: { countActiveForTrainer: vi.fn(async () => opts.clients ?? 0) },
    socialProfiles: socialProfiles as never,
    activateFollowing,
    notices,
    canBeTrainer: () => opts.allowed ?? true,
    allowlistApplies: () => opts.allowlistApplies ?? true,
    now: () => NOW,
  });
  return { service, trainers, activateFollowing, notices };
}

describe('TrainerProfileService', () => {
  it('status: a user off the allowlist can not activate; a trainer shows their name', async () => {
    expect(await setup({ allowed: false }).service.status(ME)).toMatchObject({
      canActivate: false,
      active: false,
      displayName: null,
      findable: false,
    });
    const on = setup({
      profile: {
        userId: ME.id,
        displayName: 'Ana',
        activatedAt: NOW,
        gymLine: 'Iron Gym, Cluj',
        disabledAt: null,
      },
      clients: 3,
    });
    expect(await on.service.status(ME)).toEqual({
      canActivate: true,
      active: true,
      displayName: 'Ana',
      gymLine: 'Iron Gym, Cluj',
      activeClients: 3,
      findable: true,
    });
  });

  it('activate turns tools on with the trimmed display name and answers with the status', async () => {
    const { service, trainers } = setup();
    expect(await service.activate(ME, { displayName: '  Ana  ' }, 'web')).toMatchObject({
      canActivate: true,
      active: true,
      displayName: 'Ana',
    });
    expect(trainers.activate).toHaveBeenCalledWith(ME.id, 'Ana', undefined);
  });

  it('activate turns on a PRIVATE Following profile when there is none (PRD §4.1), with the account names', async () => {
    const { service, activateFollowing } = setup({ following: false });
    const status = await service.activate(
      ME,
      { displayName: 'Ana', gymLine: ' Iron Gym ' },
      'mobile',
    );
    expect(activateFollowing).toHaveBeenCalledWith(
      ME.id,
      { firstName: 'Ana', lastName: 'Pop' },
      'mobile',
    );
    expect(status).toMatchObject({ gymLine: 'Iron Gym', findable: true });
  });

  it('activate leaves an existing Following profile alone (public stays public)', async () => {
    const { service, activateFollowing } = setup({ following: true });
    await service.activate(ME, { displayName: 'Ana' }, 'web');
    expect(activateFollowing).not.toHaveBeenCalled();
  });

  it('the gym line is word-filtered and blank clears it', async () => {
    const { service, trainers } = setup();
    await expect(
      service.activate(ME, { displayName: 'Ana', gymLine: 'Chefer HQ' }, 'web'),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await service.activate(ME, { displayName: 'Ana', gymLine: '   ' }, 'web');
    expect(trainers.activate).toHaveBeenLastCalledWith(ME.id, 'Ana', null);
  });

  it('activate is refused for a user who is not on TRAINER_ALLOWLIST (Q-1)', async () => {
    const { service, trainers } = setup({ allowed: false });
    await expect(service.activate(ME, { displayName: 'Ana' }, 'web')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(trainers.activate).not.toHaveBeenCalled();
  });

  it.each([['fuck'], ['Chefer Support'], ['chefer'], ['   ']])(
    'a name that fails the word filter or passes itself off as Chefer is rejected: %j',
    async (name) => {
      const { service, trainers } = setup();
      await expect(service.activate(ME, { displayName: name }, 'web')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(trainers.activate).not.toHaveBeenCalled();
    },
  );

  it('updateProfile renames; with tools off it is FORBIDDEN', async () => {
    const on = setup({
      profile: {
        userId: ME.id,
        displayName: 'Ana',
        activatedAt: NOW,
        gymLine: null,
        disabledAt: null,
      },
    });
    expect((await on.service.updateProfile(ME, { displayName: 'Ana P.' })).displayName).toBe(
      'Ana P.',
    );
    await expect(setup().service.updateProfile(ME, { displayName: 'Ana' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('deactivate hands the repository the platform, the privacy version and the time', async () => {
    const { service, trainers } = setup();
    await expect(service.deactivate(ME.id, 'mobile')).resolves.toEqual({ ok: true });
    expect(trainers.deactivate).toHaveBeenCalledWith(ME.id, {
      source: 'mobile',
      documentVersion: LEGAL_VERSIONS.privacy,
      now: NOW,
    });
  });

  it('the trainer stops: every client gets a notice; pending requests hear "declined" (PRD §4.3)', async () => {
    const { service, notices } = setup();
    await service.deactivate(ME.id, 'web');
    expect(notices.ended.mock.calls).toEqual([
      ['c1', ME.id, 'TRAINER', 'SYSTEM', {}],
      ['c2', ME.id, 'TRAINER', 'SYSTEM', {}],
    ]);
    expect(notices.requestAnswered).toHaveBeenCalledWith('c3', ME.id, false);
  });

  it('account deletion: the notices keep the trainer name so they survive the cascade', async () => {
    const { service, notices } = setup({
      profile: {
        userId: ME.id,
        displayName: 'Ana',
        activatedAt: NOW,
        gymLine: null,
        disabledAt: null,
      },
    });
    await service.deactivate(ME.id, 'web', { accountDeleted: true });
    expect(notices.ended).toHaveBeenCalledWith('c1', ME.id, 'TRAINER', 'SYSTEM', {
      otherGoneName: 'Ana',
    });
    expect(notices.requestAnswered).not.toHaveBeenCalled();
  });

  describe('enforceAllowlist (removed from TRAINER_ALLOWLIST = stops being a trainer)', () => {
    const active: TrainerProfile = {
      userId: ME.id,
      displayName: 'Ana',
      activatedAt: NOW,
      gymLine: null,
      disabledAt: null,
    };

    it('turns trainer tools off for an active trainer who is no longer listed', async () => {
      const { service, trainers } = setup({ allowed: false, profile: active });
      await expect(service.enforceAllowlist(ME)).resolves.toBe(true);
      expect(trainers.deactivate).toHaveBeenCalled();
    });

    it('never runs while the user is still listed (no query at all)', async () => {
      const { service, trainers } = setup({ allowed: true, profile: active });
      await expect(service.enforceAllowlist(ME)).resolves.toBe(false);
      expect(trainers.findActive).not.toHaveBeenCalled();
    });

    it('never runs when the allowlist is unset or coaching is off for them (a misconfiguration ends nothing)', async () => {
      const { service, trainers } = setup({
        allowed: false,
        profile: active,
        allowlistApplies: false,
      });
      await expect(service.enforceAllowlist(ME)).resolves.toBe(false);
      expect(trainers.deactivate).not.toHaveBeenCalled();
    });
  });
});
