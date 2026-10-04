import { describe, expect, it, vi } from 'vitest';
import type { CoachingInvite, CoachingLink, GymProfile, TrainerProfile } from '@chefer/database';
import { COACHING_LIMITS } from '@chefer/types';
import { CoachingInviteService, generateInviteCode } from './coaching-invite.service.js';

// coaching-invite.service.ts → lib/env.ts (throws without secrets).
vi.mock('../../lib/env.js', () => ({ env: { APP_URL: 'https://chefer.example' } }));

const NOW = new Date('2026-10-04T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const TRAINER = 'ctrainer0000000000000001';
const OTHER_TRAINER = 'ctrainer0000000000000002';
const CLIENT = 'cclient00000000000000001';

const invite = (over: Partial<CoachingInvite> = {}): CoachingInvite => ({
  code: 'ABCDEFGHJK',
  trainerId: TRAINER,
  label: null,
  createdAt: new Date(NOW.getTime() - DAY),
  expiresAt: new Date(NOW.getTime() + 13 * DAY),
  usedAt: null,
  usedById: null,
  revokedAt: null,
  ...over,
});
const trainer = (over: Partial<TrainerProfile> = {}): TrainerProfile => ({
  userId: TRAINER,
  displayName: 'Ana',
  activatedAt: NOW,
  disabledAt: null,
  ...over,
});
const link = (trainerId: string): CoachingLink => ({
  id: 'l1',
  trainerId,
  clientId: CLIENT,
  status: 'ACTIVE',
  inviteCode: null,
  trainerLabel: null,
  startedAt: NOW,
  endedAt: null,
  endedBy: null,
});

interface Opts {
  invites?: CoachingInvite[];
  open?: number;
  clients?: number;
  current?: CoachingLink | null;
  trainers?: TrainerProfile[];
  gymSetup?: boolean;
}

function setup(opts: Opts = {}) {
  const store = [...(opts.invites ?? [])];
  const invites = {
    create: vi.fn(
      async (d: { code: string; trainerId: string; label: string | null; expiresAt: Date }) => {
        const row = invite({ ...d, createdAt: NOW });
        store.push(row);
        return row;
      },
    ),
    find: vi.fn(async (code: string) => store.find((i) => i.code === code) ?? null),
    listForTrainer: vi.fn(async (trainerId: string, since: Date) =>
      store.filter((i) => i.trainerId === trainerId && i.createdAt >= since),
    ),
    countOpen: vi.fn(async () => opts.open ?? 0),
    revoke: vi.fn(async () => true),
    deleteExpiredBefore: vi.fn(),
  };
  const trainers = {
    find: vi.fn(
      async (id: string) => (opts.trainers ?? [trainer()]).find((t) => t.userId === id) ?? null,
    ),
    findActive: vi.fn(),
  };
  const service = new CoachingInviteService({
    invites,
    links: {
      findActiveForClient: vi.fn(async () => opts.current ?? null),
      countActiveForTrainer: vi.fn(async () => opts.clients ?? 0),
    },
    trainers,
    gymProfiles: {
      findByUserId: vi.fn(async () =>
        opts.gymSetup === false ? null : ({ setupCompletedAt: NOW } as GymProfile),
      ),
    },
    appUrl: () => 'https://chefer.example/',
    newCode: () => 'ABCDEFGHJK',
    now: () => NOW,
  });
  return { service, invites };
}

describe('generateInviteCode', () => {
  it('is 10 characters of Crockford base32 (no I, L, O, U)', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateInviteCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    }
  });

  it('maps every byte through its low 5 bits: all 32 symbols are reachable, none twice as likely', () => {
    const seen = new Map<string, number>();
    for (let b = 0; b < 256; b += 1) {
      const code = generateInviteCode(1, () => Uint8Array.of(b));
      seen.set(code, (seen.get(code) ?? 0) + 1);
    }
    expect(seen.size).toBe(32);
    expect(new Set(seen.values())).toEqual(new Set([8]));
  });
});

describe('create', () => {
  it('stores a 14-day invite with a trimmed private label and returns the share URL', async () => {
    const { service, invites } = setup();
    const out = await service.create(TRAINER, '  Maria, Tue/Thu  ');
    expect(invites.create).toHaveBeenCalledWith({
      code: 'ABCDEFGHJK',
      trainerId: TRAINER,
      label: 'Maria, Tue/Thu',
      expiresAt: new Date(NOW.getTime() + COACHING_LIMITS.inviteTtlDays * DAY),
    });
    expect(out).toMatchObject({
      code: 'ABCDEFGHJK',
      url: 'https://chefer.example/coaching/join/ABCDEFGHJK',
      label: 'Maria, Tue/Thu',
      state: 'OPEN',
    });
  });

  it('a blank label is stored as none', async () => {
    const { service, invites } = setup();
    await service.create(TRAINER, '   ');
    expect(invites.create).toHaveBeenCalledWith(expect.objectContaining({ label: null }));
  });

  it('at most 20 open invites', async () => {
    const { service, invites } = setup({ open: COACHING_LIMITS.maxOpenInvites });
    await expect(service.create(TRAINER, undefined)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(invites.create).not.toHaveBeenCalled();
  });

  it('no new invites once the trainer is at 50 clients', async () => {
    const { service } = setup({ clients: COACHING_LIMITS.maxActiveClients });
    await expect(service.create(TRAINER, undefined)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('draws another code when one collides (unique violation), up to three times', async () => {
    const { service, invites } = setup();
    invites.create
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.create(TRAINER, undefined)).resolves.toMatchObject({ state: 'OPEN' });
    expect(invites.create).toHaveBeenCalledTimes(3);
    invites.create.mockReset().mockRejectedValue({ code: 'P2002' });
    await expect(service.create(TRAINER, undefined)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('any other error is rethrown, not retried', async () => {
    const { service, invites } = setup();
    invites.create.mockRejectedValueOnce(new Error('db down'));
    await expect(service.create(TRAINER, undefined)).rejects.toThrow('db down');
    expect(invites.create).toHaveBeenCalledTimes(1);
  });
});

describe('list and revoke', () => {
  it('lists the last 30 days with each invite state (USED > REVOKED > EXPIRED > OPEN)', async () => {
    const { service, invites } = setup({
      invites: [
        invite({ code: 'OPEN000001' }),
        invite({ code: 'USED000001', usedAt: NOW, revokedAt: NOW }),
        invite({ code: 'REVOKED001', revokedAt: NOW }),
        invite({ code: 'EXPIRED001', expiresAt: new Date(NOW.getTime() - 1) }),
        invite({ code: 'ANCIENT001', createdAt: new Date(NOW.getTime() - 31 * DAY) }),
        invite({ code: 'FOREIGN001', trainerId: OTHER_TRAINER }),
      ],
    });
    const out = await service.list(TRAINER);
    expect(Object.fromEntries(out.map((i) => [i.code, i.state]))).toEqual({
      OPEN000001: 'OPEN',
      USED000001: 'USED',
      REVOKED001: 'REVOKED',
      EXPIRED001: 'EXPIRED',
    });
    expect(invites.listForTrainer).toHaveBeenCalledWith(
      TRAINER,
      new Date(NOW.getTime() - COACHING_LIMITS.inviteListDays * DAY),
    );
  });

  it('revoking something that is not yours, used or already revoked is NOT_FOUND', async () => {
    const { service, invites } = setup();
    invites.revoke.mockResolvedValueOnce(false);
    await expect(service.revoke(TRAINER, 'ABCDEFGHJK')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.revoke(TRAINER, 'ABCDEFGHJK')).resolves.toEqual({ ok: true });
  });
});

describe('preview: every state', () => {
  it('OK: names the trainer, says whether gym setup is needed, and who the client has now', async () => {
    const { service } = setup({
      invites: [invite()],
      current: link(OTHER_TRAINER),
      trainers: [trainer(), trainer({ userId: OTHER_TRAINER, displayName: 'Ion' })],
      gymSetup: false,
    });
    expect(await service.preview(CLIENT, 'ABCDEFGHJK')).toEqual({
      state: 'OK',
      trainerName: 'Ana',
      currentTrainerName: 'Ion',
      needsGymSetup: true,
    });
  });

  it.each([
    ['NOT_FOUND', [] as CoachingInvite[], CLIENT],
    ['SELF', [invite()], TRAINER],
    ['USED', [invite({ usedAt: NOW })], CLIENT],
    ['REVOKED', [invite({ revokedAt: NOW })], CLIENT],
    ['EXPIRED', [invite({ expiresAt: new Date(NOW.getTime() - 1) })], CLIENT],
  ] as const)('%s: no trainer name is disclosed', async (state, invites, who) => {
    const { service } = setup({ invites: [...invites] });
    expect(await service.preview(who, 'ABCDEFGHJK')).toEqual({
      state,
      trainerName: null,
      currentTrainerName: null,
      needsGymSetup: false,
    });
  });

  it('ALREADY_YOURS: you are coached by this trainer, whichever invite you hold', async () => {
    const { service } = setup({
      invites: [invite({ usedAt: NOW, usedById: OTHER_TRAINER })],
      current: link(TRAINER),
    });
    expect(await service.preview(CLIENT, 'ABCDEFGHJK')).toMatchObject({
      state: 'ALREADY_YOURS',
      trainerName: 'Ana',
      currentTrainerName: 'Ana',
    });
  });

  it('an open invite of a trainer who turned tools off reads REVOKED', async () => {
    const { service } = setup({
      invites: [invite()],
      trainers: [trainer({ disabledAt: NOW })],
    });
    expect(await service.preview(CLIENT, 'ABCDEFGHJK')).toMatchObject({
      state: 'REVOKED',
      trainerName: null,
    });
  });
});
