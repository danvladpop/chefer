import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import type { CoachingLink, CoachingNote, TrainerProfile } from '@chefer/database';
import { COACHING_COPY } from '@chefer/types';
import {
  CoachingAccessMemo,
  CoachingAccessService,
  type CoachingScope,
  type CoachingTrainer,
} from './coaching-access.service.js';

// The module's singleton imports lib/coaching-flags.ts → lib/env.ts (which
// throws without secrets). The service under test gets its flag as a dependency.
vi.mock('../../lib/coaching-flags.js', () => ({ isCoachingEnabledFor: () => true }));

// ─── THE AUTHORIZATION ORACLE (spec §8.1) ─────────────────────────────────────
// CoachingAccessService against the rules, row by row: flag off, trainer tools
// off, yourself, no link, an ENDED link, an ACTIVE link, for every scope. Every
// denial is the SAME error (NOT_FOUND "This client isn't available"), never a
// reason, so a trainer can't probe who is somebody's client. `expectedFor` is
// written from the spec, NOT from the service's code.

const TRAINER: CoachingTrainer = { id: 'ctrainer0000000000000001', email: 'ana@x.dev' };
const CLIENT = 'cclient00000000000000001';
const STRANGER = 'cstranger000000000000001';

type LinkState = 'none' | 'ended' | 'active';
type NoteState = 'none' | 'visible' | 'hidden';

/** Lane K1: which of the client's sharing switches are on (on the ACTIVE link). */
type ShareState = 'none' | 'food' | 'weight' | 'both';

interface World {
  flag: boolean;
  trainerOn: boolean;
  link: LinkState;
  note: NoteState;
  share: ShareState;
}

function setup(world: World) {
  const profile: TrainerProfile = {
    userId: TRAINER.id,
    displayName: 'Ana',
    activatedAt: new Date('2026-10-01T00:00:00Z'),
    gymLine: null,
    disabledAt: null,
    checkInEnabled: false,
    checkInDay: 6,
    checkInQuestions: [],
  };
  const link: CoachingLink = {
    id: 'link1',
    trainerId: TRAINER.id,
    clientId: CLIENT,
    status: 'ACTIVE',
    inviteCode: null,
    trainerLabel: null,
    requestId: null,
    startedAt: new Date('2026-10-02T00:00:00Z'),
    startedOn: null,
    endedAt: null,
    endedBy: null,
    consentCopyVersion: 2,
    shareFoodAt:
      world.share === 'food' || world.share === 'both' ? new Date('2026-10-02T00:00:00Z') : null,
    shareWeightAt:
      world.share === 'weight' || world.share === 'both' ? new Date('2026-10-02T00:00:00Z') : null,
  };
  const note: CoachingNote = {
    trainerId: TRAINER.id,
    clientId: CLIENT,
    body: 'x',
    updatedAt: new Date('2026-10-03T00:00:00Z'),
    hiddenAt: world.note === 'hidden' ? new Date('2026-10-04T00:00:00Z') : null,
  };
  const trainers = {
    findActive: vi.fn(async (id: string) =>
      world.trainerOn && id === TRAINER.id ? profile : null,
    ),
  };
  // The repository only ever returns ACTIVE links: an ENDED row is invisible to it.
  const links = {
    findActivePair: vi.fn(async (t: string, c: string) =>
      world.link === 'active' && t === TRAINER.id && c === CLIENT ? link : null,
    ),
  };
  const notes = {
    find: vi.fn(async (t: string, c: string) =>
      world.note !== 'none' && t === TRAINER.id && c === CLIENT ? note : null,
    ),
  };
  const service = new CoachingAccessService({
    trainers,
    links,
    notes,
    enabledFor: () => world.flag,
  });
  return { service, trainers, links, notes, link };
}

const SCOPES: CoachingScope[] = ['read', 'write', 'note', 'food', 'weight'];

function expectedFor(world: World, scope: CoachingScope, clientId: string): boolean {
  if (!world.flag || !world.trainerOn) return false; // rules 0, 1
  if (clientId === TRAINER.id) return false; // rule 2
  if (clientId !== CLIENT) return false; // a stranger has no link
  // rule 3b (lane K1): food / weight need the ACTIVE link AND the client's matching switch
  if (scope === 'food') return world.link === 'active' && ['food', 'both'].includes(world.share);
  if (scope === 'weight')
    return world.link === 'active' && ['weight', 'both'].includes(world.share);
  if (world.link === 'active') return true; // rule 3
  if (scope === 'note') return world.note === 'visible'; // note scope: an existing visible note
  return false;
}

async function outcome(
  service: CoachingAccessService,
  clientId: string,
  scope: CoachingScope,
): Promise<'allowed' | TRPCError> {
  try {
    await service.assert(TRAINER, clientId, scope);
    return 'allowed';
  } catch (err) {
    if (err instanceof TRPCError) return err;
    throw err;
  }
}

describe('CoachingAccessService: the access matrix', () => {
  const worlds: World[] = [];
  for (const flag of [true, false]) {
    for (const trainerOn of [true, false]) {
      for (const link of ['none', 'ended', 'active'] as const) {
        for (const note of ['none', 'visible', 'hidden'] as const) {
          for (const share of ['none', 'food', 'weight', 'both'] as const) {
            worlds.push({ flag, trainerOn, link, note, share });
          }
        }
      }
    }
  }

  it.each(worlds.map((w) => [JSON.stringify(w), w] as const))(
    'world %s: every scope matches the spec, every denial is the one uniform error',
    async (_name, world) => {
      const { service } = setup(world);
      for (const scope of SCOPES) {
        for (const clientId of [CLIENT, TRAINER.id, STRANGER]) {
          const result = await outcome(service, clientId, scope);
          if (expectedFor(world, scope, clientId)) {
            expect(result, `${scope} ${clientId}`).toBe('allowed');
          } else {
            expect(result, `${scope} ${clientId}`).toBeInstanceOf(TRPCError);
            expect(result).toMatchObject({
              code: 'NOT_FOUND',
              message: COACHING_COPY.server.clientUnavailable,
            });
          }
        }
      }
    },
  );

  it('returns the resolved access: the trainer, the client and the ACTIVE link', async () => {
    const { service, link } = setup({
      flag: true,
      trainerOn: true,
      link: 'active',
      note: 'none',
      share: 'none',
    });
    await expect(service.assert(TRAINER, CLIENT, 'write')).resolves.toEqual({
      trainerId: TRAINER.id,
      clientId: CLIENT,
      scope: 'write',
      link,
    });
  });

  it('a note-only access (no link, a visible note) carries no link, so it can read but never write', async () => {
    const { service } = setup({
      flag: true,
      trainerOn: true,
      link: 'none',
      note: 'visible',
      share: 'none',
    });
    expect(await service.assert(TRAINER, CLIENT, 'note')).toMatchObject({ link: null });
  });

  it('checks the link on the very next request: no cross-request cache', async () => {
    const world: World = {
      flag: true,
      trainerOn: true,
      link: 'active',
      note: 'none',
      share: 'none',
    };
    const { service } = setup(world);
    expect(await outcome(service, CLIENT, 'read')).toBe('allowed');
    world.link = 'ended';
    expect(await outcome(service, CLIENT, 'read')).toBeInstanceOf(TRPCError);
  });

  it('a per-request memo asks the repositories once per (trainer, client, scope)', async () => {
    const { service, trainers, links } = setup({
      flag: true,
      trainerOn: true,
      link: 'active',
      note: 'none',
      share: 'none',
    });
    const memo = new CoachingAccessMemo();
    await service.assert(TRAINER, CLIENT, 'read', memo);
    await service.assert(TRAINER, CLIENT, 'read', memo);
    expect(links.findActivePair).toHaveBeenCalledTimes(1);
    expect(trainers.findActive).toHaveBeenCalledTimes(1);
    memo.clear();
    await service.assert(TRAINER, CLIENT, 'read', memo);
    expect(links.findActivePair).toHaveBeenCalledTimes(2);
  });

  it('a failed lookup is not memoised: a retry asks again', async () => {
    const { service, links } = setup({
      flag: true,
      trainerOn: true,
      link: 'active',
      note: 'none',
      share: 'none',
    });
    links.findActivePair.mockRejectedValueOnce(new Error('db down'));
    const memo = new CoachingAccessMemo();
    await expect(service.assert(TRAINER, CLIENT, 'read', memo)).rejects.toThrow('db down');
    await expect(service.assert(TRAINER, CLIENT, 'read', memo)).resolves.toMatchObject({
      clientId: CLIENT,
    });
  });

  it('trainerProfile: null when tools are off', async () => {
    const { service } = setup({
      flag: true,
      trainerOn: false,
      link: 'none',
      note: 'none',
      share: 'none',
    });
    expect(await service.trainerProfile(TRAINER.id)).toBeNull();
  });
});

describe('CoachingAccessService: food and weight sharing (lane K1)', () => {
  it('a revoke denies on the very next check: the switch is read from the link every time', async () => {
    const world: World = {
      flag: true,
      trainerOn: true,
      link: 'active',
      note: 'none',
      share: 'both',
    };
    const { service, link } = setup(world);
    await expect(service.assert(TRAINER, CLIENT, 'food')).resolves.toMatchObject({ scope: 'food' });
    // The client turns food sharing off (the repository returns the updated row).
    link.shareFoodAt = null;
    const denied = await outcome(service, CLIENT, 'food');
    expect(denied).toBeInstanceOf(TRPCError);
    expect((denied as TRPCError).code).toBe('NOT_FOUND');
    expect((denied as TRPCError).message).toBe(COACHING_COPY.server.clientUnavailable);
    await expect(service.assert(TRAINER, CLIENT, 'weight')).resolves.toMatchObject({
      scope: 'weight',
    });
  });

  it('sharing never outlives the coaching: no ACTIVE link, no food or weight', async () => {
    const world: World = {
      flag: true,
      trainerOn: true,
      link: 'ended',
      note: 'visible',
      share: 'both',
    };
    const { service } = setup(world);
    expect(await outcome(service, CLIENT, 'food')).toBeInstanceOf(TRPCError);
    expect(await outcome(service, CLIENT, 'weight')).toBeInstanceOf(TRPCError);
  });
});
