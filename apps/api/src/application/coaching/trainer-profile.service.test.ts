import { describe, expect, it, vi } from 'vitest';
import type { TrainerProfile } from '@chefer/database';
import { LEGAL_VERSIONS } from '@chefer/types';
import { TrainerProfileService } from './trainer-profile.service.js';

// trainer-profile.service.ts → lib/coaching-flags.ts → lib/env.ts (throws without secrets).
vi.mock('../../lib/env.js', () => ({ env: {} }));

const NOW = new Date('2026-10-04T12:00:00Z');
const ME = { id: 'ctrainer0000000000000001', email: 'ana@x.dev' };

function setup(opts: { allowed?: boolean; profile?: TrainerProfile | null } = {}) {
  let profile = opts.profile ?? null;
  const trainers = {
    find: vi.fn(),
    findActive: vi.fn(async () => (profile?.disabledAt === null ? profile : null)),
    findMany: vi.fn(),
    activate: vi.fn(async (userId: string, displayName: string) => {
      profile = { userId, displayName, activatedAt: NOW, disabledAt: null };
      return profile;
    }),
    updateName: vi.fn(async (_u: string, displayName: string) => {
      if (profile?.disabledAt !== null) return null;
      profile = { ...profile, displayName };
      return profile;
    }),
    deactivate: vi.fn(async () => ({ endedClientIds: ['c1'] })),
  };
  const service = new TrainerProfileService({
    trainers,
    canBeTrainer: () => opts.allowed ?? true,
    now: () => NOW,
  });
  return { service, trainers };
}

describe('TrainerProfileService', () => {
  it('status: a user off the allowlist can not activate; a trainer shows their name', async () => {
    expect(await setup({ allowed: false }).service.status(ME)).toEqual({
      canActivate: false,
      active: false,
      displayName: null,
    });
    const on = setup({
      profile: { userId: ME.id, displayName: 'Ana', activatedAt: NOW, disabledAt: null },
    });
    expect(await on.service.status(ME)).toEqual({
      canActivate: true,
      active: true,
      displayName: 'Ana',
    });
  });

  it('activate turns tools on with the trimmed display name and answers with the status', async () => {
    const { service, trainers } = setup();
    expect(await service.activate(ME, { displayName: '  Ana  ' }, 'web')).toEqual({
      canActivate: true,
      active: true,
      displayName: 'Ana',
    });
    expect(trainers.activate).toHaveBeenCalledWith(ME.id, 'Ana');
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
      profile: { userId: ME.id, displayName: 'Ana', activatedAt: NOW, disabledAt: null },
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
});
