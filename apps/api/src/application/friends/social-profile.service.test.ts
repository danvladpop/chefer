import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Prisma,
  type SocialDbClient,
  type SocialProfile,
  type SocialUserRow,
} from '@chefer/database';
import { FRIENDS_COPY, LEGAL_VERSIONS } from '@chefer/types';
import { TextRejectedCause } from '../../lib/friends-errors.js';
import type { SocialTx } from './activity.service.js';
import {
  isReservedName,
  prefillNames,
  SocialProfileService,
  type ProfileServiceProfileRepository,
} from './social-profile.service.js';

// Turn on / settings / turn off (PRD E1, FR-02–FR-05; plan §9 "Services":
// activate/deactivate transactions, deactivate keeps reports and log, Public
// auto-accept, forced private refuses Public).

const ME = 'cme000000000000000000001';
const A = 'ca0000000000000000000001';
const B = 'cb0000000000000000000001';
const T0 = new Date('2026-09-30T10:00:00.000Z');

function profileRow(over: Partial<SocialProfile> = {}): SocialProfile {
  return {
    userId: ME,
    visibility: 'PRIVATE',
    searchName: 'maria pop',
    sharePlan: true,
    shareRecipes: true,
    shareWorkouts: true,
    shareTargets: false,
    forcedPrivateAt: null,
    featured: false,
    activatedAt: T0,
    updatedAt: T0,
    ...over,
  };
}

/** A curse word guaranteed to be in the bundled list (whole-word match). */
const BLOCKED = 'fuck';

function makeWorld(
  initial: { profile?: SocialProfile | null; user?: Partial<SocialUserRow> } = {},
) {
  const state: { profile: SocialProfile | null; user: SocialUserRow; pending: string[] } = {
    profile: initial.profile ?? null,
    user: {
      id: ME,
      firstName: null,
      lastName: null,
      name: 'Maria Pop',
      image: null,
      ...initial.user,
    },
    pending: [],
  };
  const txs: SocialDbClient[] = [];
  const profiles = {
    find: vi.fn(() => Promise.resolve(state.profile)),
    findUsers: vi.fn(() => Promise.resolve([state.user])),
    create: vi.fn(
      (data: { userId: string; searchName: string; visibility?: 'PUBLIC' | 'PRIVATE' }) => {
        if (state.profile) {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 't' }),
          );
        }
        state.profile = profileRow({ ...data, visibility: data.visibility ?? 'PRIVATE' });
        return Promise.resolve(state.profile);
      },
    ),
    update: vi.fn((_id: string, data: Partial<SocialProfile>) => {
      state.profile = { ...(state.profile ?? profileRow()), ...data };
      return Promise.resolve(state.profile);
    }),
    updateUserNames: vi.fn((_id: string, firstName: string, lastName: string) => {
      state.user = { ...state.user, firstName, lastName, name: `${firstName} ${lastName}` };
      return Promise.resolve(state.user);
    }),
    deleteCascadeSocial: vi.fn(() => {
      const had = state.profile !== null;
      state.profile = null;
      return Promise.resolve({
        follows: 0,
        blocks: 0,
        dismissals: 0,
        notifications: 0,
        profile: had,
      });
    }),
  } satisfies ProfileServiceProfileRepository;
  const follows = {
    counts: vi.fn(() =>
      Promise.resolve({ followers: 4, following: 3, pendingRequests: state.pending.length }),
    ),
    acceptAllPendingTo: vi.fn(() => {
      const ids = state.pending;
      state.pending = [];
      return Promise.resolve(ids);
    }),
  };
  const blocks = { countMade: vi.fn(() => Promise.resolve(1)) };
  const activity = {
    notify: vi.fn(() => Promise.resolve()),
    unreadCount: vi.fn(() => Promise.resolve(2)),
  };
  const moderationLog = { log: vi.fn(() => Promise.resolve({} as never)) };
  const moderation = { hideFilteredRecipes: vi.fn(() => Promise.resolve(2)) };
  const consent = { record: vi.fn(() => Promise.resolve({} as never)) };
  const suggestions = { invalidate: vi.fn(), invalidateAll: vi.fn() };
  const tx: SocialTx = (fn) => {
    const t = { n: txs.length } as unknown as SocialDbClient;
    txs.push(t);
    return fn(t);
  };
  const service = new SocialProfileService(
    profiles,
    follows,
    blocks,
    activity,
    moderationLog,
    moderation,
    consent,
    suggestions,
    tx,
  );
  return {
    service,
    state,
    profiles,
    follows,
    activity,
    moderationLog,
    moderation,
    consent,
    suggestions,
    txs,
  };
}

let w: ReturnType<typeof makeWorld>;
beforeEach(() => {
  w = makeWorld();
});

async function rejection(promise: Promise<unknown>): Promise<TRPCError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(TRPCError);
  return err as TRPCError;
}

describe('prefillNames (FR-02.6)', () => {
  it('uses first/last, else splits the account name', () => {
    expect(prefillNames({ firstName: 'Ana', lastName: 'Pop', name: 'x' })).toEqual({
      firstName: 'Ana',
      lastName: 'Pop',
    });
    expect(prefillNames({ firstName: null, lastName: null, name: 'Ana Maria Pop' })).toEqual({
      firstName: 'Ana',
      lastName: 'Maria Pop',
    });
    expect(prefillNames({ firstName: ' ', lastName: null, name: null })).toEqual({
      firstName: null,
      lastName: null,
    });
    expect(prefillNames(undefined)).toEqual({ firstName: null, lastName: null });
  });
});

describe('me', () => {
  it('not activated: prefilled names, no settings, zero counts, no count queries', async () => {
    await expect(w.service.me(ME)).resolves.toEqual({
      activated: false,
      firstName: 'Maria',
      lastName: 'Pop',
      settings: null,
      counts: { followers: 0, following: 0, pendingRequests: 0, unreadActivity: 0, blocked: 0 },
      badgeCount: 0,
    });
    expect(w.follows.counts).not.toHaveBeenCalled();
  });

  it('activated: settings, counts and badge = pending requests + unread activity', async () => {
    w = makeWorld({
      profile: profileRow({ forcedPrivateAt: T0 }),
      user: { firstName: 'Maria', lastName: 'Pop' },
    });
    w.state.pending = [A, B];
    const me = await w.service.me(ME);
    expect(me).toEqual({
      activated: true,
      firstName: 'Maria',
      lastName: 'Pop',
      settings: {
        visibility: 'PRIVATE',
        forcedPrivate: true,
        sharePlan: true,
        shareRecipes: true,
        shareWorkouts: true,
        shareTargets: false,
      },
      counts: { followers: 4, following: 3, pendingRequests: 2, unreadActivity: 2, blocked: 1 },
      badgeCount: 4,
    });
  });
});

describe('activate', () => {
  const input = { visibility: 'PRIVATE' as const, firstName: 'Ștefan', lastName: 'Pop' };

  it('names + profile in ONE transaction, then SOCIAL_SHARING consent, then the recipe filter', async () => {
    const result = await w.service.activate(ME, input, 'mobile');
    expect(w.txs).toHaveLength(1);
    expect(w.profiles.updateUserNames).toHaveBeenCalledWith(ME, 'Ștefan', 'Pop', w.txs[0]);
    expect(w.profiles.create).toHaveBeenCalledWith(
      { userId: ME, visibility: 'PRIVATE', searchName: 'stefan pop' },
      w.txs[0],
    );
    expect(w.consent.record).toHaveBeenCalledWith({
      userId: ME,
      kind: 'SOCIAL_SHARING',
      granted: true,
      source: 'mobile',
      documentVersion: LEGAL_VERSIONS.privacy,
    });
    expect(w.moderation.hideFilteredRecipes).toHaveBeenCalledWith(ME);
    expect(result).toMatchObject({
      activated: true,
      firstName: 'Ștefan',
      lastName: 'Pop',
      filterHiddenRecipes: 2,
      settings: { visibility: 'PRIVATE', shareTargets: false },
    });
  });

  it('records the document version the client sent', async () => {
    await w.service.activate(
      ME,
      { ...input, visibility: 'PUBLIC', documentVersion: '2026-10-01' },
      'web',
    );
    expect(w.consent.record).toHaveBeenCalledWith(
      expect.objectContaining({ documentVersion: '2026-10-01', source: 'web' }),
    );
    expect(w.state.profile?.visibility).toBe('PUBLIC');
  });

  it('is idempotent: an activated user gets their state back and nothing is written', async () => {
    await w.service.activate(ME, input, 'mobile');
    const again = await w.service.activate(ME, { ...input, visibility: 'PUBLIC' }, 'mobile');
    expect(again).toMatchObject({ activated: true, filterHiddenRecipes: 0 });
    expect(w.profiles.create).toHaveBeenCalledTimes(1);
    expect(w.consent.record).toHaveBeenCalledTimes(1);
    expect(w.state.profile?.visibility).toBe('PRIVATE');
  });

  it('a concurrent activate (P2002) returns the state without a second consent event', async () => {
    w.profiles.find.mockResolvedValueOnce(null);
    w.state.profile = profileRow();
    await expect(w.service.activate(ME, input, 'mobile')).resolves.toMatchObject({
      activated: true,
      filterHiddenRecipes: 0,
    });
    expect(w.consent.record).not.toHaveBeenCalled();
  });

  it('a blocked word in either name is rejected with ONE NAME_REJECTED row and nothing created', async () => {
    for (const names of [
      { firstName: BLOCKED, lastName: 'Pop' },
      { firstName: 'Maria', lastName: 'fuuuuck' }, // repeated-letter evasion
      { firstName: 'Maria', lastName: BLOCKED.toUpperCase() },
    ]) {
      w = makeWorld();
      const err = await rejection(w.service.activate(ME, { ...input, ...names }, 'mobile'));
      expect(err.code).toBe('BAD_REQUEST');
      expect(err.message).toBe(FRIENDS_COPY.intro.nameRejected);
      expect(err.cause).toBeInstanceOf(TextRejectedCause);
      expect(w.moderationLog.log).toHaveBeenCalledTimes(1);
      expect(w.moderationLog.log).toHaveBeenCalledWith({
        action: 'NAME_REJECTED',
        targetUserId: ME,
        reason: 'blocked term in name',
        actor: 'system',
      });
      expect(w.profiles.create).not.toHaveBeenCalled();
      expect(w.consent.record).not.toHaveBeenCalled();
    }
  });

  it('F3.1: a name passing itself off as Chefer is rejected like a blocked word (one NAME_REJECTED row)', async () => {
    for (const names of [
      { firstName: 'Chefer', lastName: 'Kitchen' },
      { firstName: 'Chéfer_Team', lastName: 'Official' },
      { firstName: 'Maria', lastName: 'CheferSupport' },
    ]) {
      w = makeWorld();
      const err = await rejection(w.service.activate(ME, { ...input, ...names }, 'mobile'));
      expect(err.code).toBe('BAD_REQUEST');
      expect(err.message).toBe(FRIENDS_COPY.intro.nameRejected);
      expect(err.cause).toBeInstanceOf(TextRejectedCause);
      expect(w.moderationLog.log).toHaveBeenCalledWith({
        action: 'NAME_REJECTED',
        targetUserId: ME,
        reason: 'reserved name',
        actor: 'system',
      });
      expect(w.profiles.create).not.toHaveBeenCalled();
    }
    expect(isReservedName('Ana', 'Popescu')).toBe(false);
    expect(isReservedName('Ana', 'Che Fer')).toBe(false);
  });

  it('F3.1: the ops script may use the reserved name, and a featured profile may keep renaming', async () => {
    await expect(
      w.service.activate(ME, { ...input, firstName: 'Chefer', lastName: 'Kitchen' }, 'mobile', {
        allowReservedName: true,
      }),
    ).resolves.toMatchObject({ activated: true });
    w.state.profile = profileRow({ featured: true });
    await expect(
      w.service.updateSettings(ME, { lastName: 'Kitchen Team' }, 'mobile'),
    ).resolves.toMatchObject({ activated: true });
    // Not featured: the rename is refused.
    w.state.profile = profileRow();
    const err = await rejection(w.service.updateSettings(ME, { firstName: 'Chefer' }, 'mobile'));
    expect(err.cause).toBeInstanceOf(TextRejectedCause);
  });

  it('Scunthorpe-style names pass', async () => {
    await expect(
      w.service.activate(ME, { ...input, firstName: 'Dickens', lastName: 'Scunthorpe' }, 'mobile'),
    ).resolves.toMatchObject({ activated: true });
    expect(w.moderationLog.log).not.toHaveBeenCalled();
  });

  it('a failed consent write removes the profile again and surfaces the error', async () => {
    w.consent.record.mockRejectedValueOnce(new Error('db down'));
    await expect(w.service.activate(ME, input, 'mobile')).rejects.toThrow('db down');
    expect(w.profiles.deleteCascadeSocial).toHaveBeenCalledWith(ME);
    expect(w.state.profile).toBeNull();
    expect(w.moderation.hideFilteredRecipes).not.toHaveBeenCalled();
  });
});

describe('updateSettings', () => {
  beforeEach(() => {
    w = makeWorld({ profile: profileRow(), user: { firstName: 'Maria', lastName: 'Pop' } });
  });

  it('Private → Public accepts every pending request, tells each requester, logs consent', async () => {
    w.state.pending = [A, B];
    const result = await w.service.updateSettings(ME, { visibility: 'PUBLIC' }, 'mobile');
    expect(result.autoAccepted).toBe(2);
    expect(w.follows.acceptAllPendingTo).toHaveBeenCalledWith(ME, w.txs[0]);
    expect(w.activity.notify.mock.calls).toEqual([
      [A, 'REQUEST_ACCEPTED', ME, w.txs[0]],
      [B, 'REQUEST_ACCEPTED', ME, w.txs[0]],
    ]);
    expect(w.consent.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'SOCIAL_SHARING', granted: true }),
    );
    expect(result.settings?.visibility).toBe('PUBLIC');
    expect(result.counts.pendingRequests).toBe(0);
  });

  it('already public: no auto-accept, no consent, no autoAccepted key', async () => {
    w.state.profile = profileRow({ visibility: 'PUBLIC' });
    const result = await w.service.updateSettings(ME, { visibility: 'PUBLIC' }, 'mobile');
    expect(result).not.toHaveProperty('autoAccepted');
    expect(w.follows.acceptAllPendingTo).not.toHaveBeenCalled();
    expect(w.consent.record).not.toHaveBeenCalled();
  });

  it('forced private refuses Public (FR-03.5) and changes nothing', async () => {
    w.state.profile = profileRow({ forcedPrivateAt: T0 });
    const err = await rejection(
      w.service.updateSettings(ME, { visibility: 'PUBLIC', sharePlan: false }, 'mobile'),
    );
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe(FRIENDS_COPY.settings.forcedPrivate);
    expect(w.profiles.update).not.toHaveBeenCalled();
    // Other settings still work for a forced-private profile.
    await expect(
      w.service.updateSettings(ME, { visibility: 'PRIVATE', sharePlan: false }, 'mobile'),
    ).resolves.toMatchObject({ settings: { sharePlan: false, forcedPrivate: true } });
  });

  it('Public → Private keeps followers (no follow writes)', async () => {
    w.state.profile = profileRow({ visibility: 'PUBLIC' });
    await w.service.updateSettings(ME, { visibility: 'PRIVATE' }, 'mobile');
    expect(w.follows.acceptAllPendingTo).not.toHaveBeenCalled();
    expect(w.profiles.update).toHaveBeenCalledWith(ME, { visibility: 'PRIVATE' }, w.txs[0]);
  });

  it('targets off → on logs consent; on → on does not', async () => {
    await w.service.updateSettings(ME, { shareTargets: true }, 'mobile');
    expect(w.consent.record).toHaveBeenCalledTimes(1);
    await w.service.updateSettings(ME, { shareTargets: true }, 'mobile');
    expect(w.consent.record).toHaveBeenCalledTimes(1);
  });

  it('recipes off → on re-runs the word filter; other changes report 0', async () => {
    w.state.profile = profileRow({ shareRecipes: false });
    await expect(
      w.service.updateSettings(ME, { shareRecipes: true }, 'mobile'),
    ).resolves.toMatchObject({ filterHiddenRecipes: 2 });
    await expect(
      w.service.updateSettings(ME, { shareRecipes: true }, 'mobile'),
    ).resolves.toMatchObject({ filterHiddenRecipes: 0 });
    expect(w.moderation.hideFilteredRecipes).toHaveBeenCalledTimes(1);
  });

  it('a name change rewrites names + searchName in one transaction, after the filter', async () => {
    await w.service.updateSettings(ME, { firstName: 'Ana-Maria' }, 'mobile');
    expect(w.profiles.updateUserNames).toHaveBeenCalledWith(ME, 'Ana-Maria', 'Pop', w.txs[0]);
    expect(w.profiles.update).toHaveBeenCalledWith(ME, { searchName: 'ana maria pop' }, w.txs[0]);
    const err = await rejection(w.service.updateSettings(ME, { lastName: BLOCKED }, 'mobile'));
    expect(err.cause).toBeInstanceOf(TextRejectedCause);
    expect(w.moderationLog.log).toHaveBeenCalledTimes(1);
    expect(w.profiles.updateUserNames).toHaveBeenCalledTimes(1);
  });

  it('not activated → PRECONDITION_FAILED', async () => {
    w.state.profile = null;
    expect(
      (await rejection(w.service.updateSettings(ME, { sharePlan: true }, 'mobile'))).code,
    ).toBe('PRECONDITION_FAILED');
  });
});

describe('deactivate', () => {
  it('logs the withdrawal, deletes everything social, drops suggestion caches', async () => {
    w = makeWorld({ profile: profileRow() });
    await expect(w.service.deactivate(ME, 'mobile')).resolves.toEqual({ ok: true });
    expect(w.consent.record).toHaveBeenCalledWith({
      userId: ME,
      kind: 'SOCIAL_SHARING',
      granted: false,
      source: 'mobile',
      documentVersion: LEGAL_VERSIONS.privacy,
    });
    expect(w.profiles.deleteCascadeSocial).toHaveBeenCalledWith(ME);
    expect(w.suggestions.invalidateAll).toHaveBeenCalled();
    // Idempotent: a second turn-off writes nothing.
    await expect(w.service.deactivate(ME, 'mobile')).resolves.toEqual({ ok: true });
    expect(w.consent.record).toHaveBeenCalledTimes(1);
    expect(w.profiles.deleteCascadeSocial).toHaveBeenCalledTimes(1);
  });

  it('the cascade keeps reports and the moderation log (FD-14)', () => {
    // deleteCascadeSocial is the only delete deactivate runs; its body must
    // never touch user_reports or moderation_log.
    const src = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../packages/database/src/repositories/social-profile.repository.ts',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    const start = src.indexOf('async deleteCascadeSocial(');
    const body = src.slice(start, src.indexOf('async searchByName(', start));
    expect(start).toBeGreaterThan(0);
    expect(body).not.toMatch(/userReport|moderationLog/);
    expect(body).toMatch(/tx\.follow\.deleteMany/);
    expect(body).toMatch(/tx\.notification\.deleteMany/);
  });
});
