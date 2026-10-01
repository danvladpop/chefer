import { describe, expect, it, vi } from 'vitest';
import type { Follow, Notification, SocialDbClient, SocialUserRow } from '@chefer/database';
import { decodeCursor, encodeCursor } from '@chefer/utils';
import {
  ActivityService,
  FriendSummaryHydrator,
  toFriendUserSummary,
  type ActivityNotificationRepository,
} from './activity.service.js';

// Activity inbox (PRD §12, FR-20; UX §7.2) and the shared person-row
// hydration every graph list uses (INV-2, INV-6).

const ME = 'cme000000000000000000001';
const ANA = 'cana00000000000000000001';
const BOB = 'cbob00000000000000000001';
const CAT = 'ccat00000000000000000001';

const T0 = new Date('2026-09-30T10:00:00.000Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function user(id: string, firstName: string | null, lastName: string | null): SocialUserRow {
  return { id, firstName, lastName, name: null, image: null };
}

function edge(followerId: string, followeeId: string, status: Follow['status']): Follow {
  return {
    id: `${followerId}>${followeeId}`,
    followerId,
    followeeId,
    status,
    createdAt: T0,
    acceptedAt: status === 'ACCEPTED' ? T0 : null,
  };
}

function notification(
  id: string,
  kind: Notification['kind'],
  actorId: string,
  createdAt: Date,
): Notification {
  return { id, userId: ME, kind, actorId, createdAt, readAt: null };
}

function hydratorWith(users: SocialUserRow[], edges: Follow[]) {
  const profiles = {
    findUsers: vi.fn((ids: string[]) => Promise.resolve(users.filter((u) => ids.includes(u.id)))),
  };
  const follows = {
    findEdgesWith: vi.fn((viewer: string, ids: string[]) =>
      Promise.resolve(
        edges.filter(
          (e) =>
            (e.followerId === viewer && ids.includes(e.followeeId)) ||
            (e.followeeId === viewer && ids.includes(e.followerId)),
        ),
      ),
    ),
  };
  return { hydrator: new FriendSummaryHydrator(profiles, follows), profiles, follows };
}

function notificationRepo(rows: Notification[]): ActivityNotificationRepository & {
  calls: { list: unknown[][] };
} {
  const calls = { list: [] as unknown[][] };
  return {
    calls,
    upsertSocial: vi.fn((data: { userId: string; kind: Notification['kind']; actorId: string }) =>
      Promise.resolve(notification('upserted', data.kind, data.actorId, T0)),
    ),
    withdraw: vi.fn(() => Promise.resolve(1)),
    list: vi.fn((userId: string, cursor: { createdAt: Date; id: string } | null, limit: number) => {
      calls.list.push([userId, cursor, limit]);
      const sorted = [...rows].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1),
      );
      const after = cursor
        ? sorted.filter(
            (n) =>
              n.createdAt < cursor.createdAt ||
              (n.createdAt.getTime() === cursor.createdAt.getTime() && n.id < cursor.id),
          )
        : sorted;
      return Promise.resolve(after.slice(0, limit));
    }),
    unreadCount: vi.fn(() => Promise.resolve(2)),
    markReadUpTo: vi.fn(() => Promise.resolve(3)),
  };
}

describe('toFriendUserSummary (INV-2 / INV-6)', () => {
  it('builds exactly the FriendUserSummary keys — an email on the row never leaks', () => {
    const leaky = { ...user(ANA, 'Ana', 'Pop'), email: 'ana@x.dev', passwordHash: 'h' };
    const summary = toFriendUserSummary(leaky, ME, []);
    expect(Object.keys(summary).sort()).toEqual(
      [
        'displayName',
        'firstName',
        'followsYou',
        'id',
        'imageUrl',
        'relation',
        'requestedYou',
      ].sort(),
    );
    expect(JSON.stringify(summary)).not.toContain('ana@x.dev');
  });

  it('derives relation, followsYou and requestedYou from the edges both ways', () => {
    const u = user(ANA, 'Ana', 'Pop');
    expect(toFriendUserSummary(u, ME, [])).toMatchObject({
      displayName: 'Ana Pop',
      firstName: 'Ana',
      relation: 'none',
      followsYou: false,
      requestedYou: false,
    });
    expect(toFriendUserSummary(u, ME, [edge(ME, ANA, 'PENDING')]).relation).toBe('requested');
    expect(toFriendUserSummary(u, ME, [edge(ME, ANA, 'ACCEPTED')]).relation).toBe('following');
    expect(toFriendUserSummary(u, ME, [edge(ANA, ME, 'ACCEPTED')])).toMatchObject({
      followsYou: true,
      requestedYou: false,
    });
    expect(toFriendUserSummary(u, ME, [edge(ANA, ME, 'PENDING')])).toMatchObject({
      followsYou: false,
      requestedYou: true,
    });
    expect(toFriendUserSummary(user(ME, 'Me', 'Self'), ME, []).relation).toBe('self');
  });

  it('falls back to the account name, then "Chefer user"', () => {
    expect(
      toFriendUserSummary({ ...user(ANA, null, null), name: 'Ana Maria' }, ME, []),
    ).toMatchObject({ displayName: 'Ana Maria', firstName: 'Ana' });
    expect(toFriendUserSummary(user(ANA, null, null), ME, []).displayName).toBe('Chefer user');
  });
});

describe('FriendSummaryHydrator', () => {
  it('hydrates a page in two queries and keeps the requested order, dropping missing users', async () => {
    const { hydrator, profiles, follows } = hydratorWith(
      [user(ANA, 'Ana', 'Pop'), user(BOB, 'Bob', 'Ionescu')],
      [edge(ME, BOB, 'ACCEPTED')],
    );
    const out = await hydrator.summaries(ME, [BOB, CAT, ANA]);
    expect(out.map((s) => s.id)).toEqual([BOB, ANA]);
    expect(out[0]?.relation).toBe('following');
    expect(profiles.findUsers).toHaveBeenCalledTimes(1);
    expect(follows.findEdgesWith).toHaveBeenCalledTimes(1);
  });
});

describe('ActivityService', () => {
  it('requestState comes from the LIVE follow: pending, accepted, declined (row gone)', async () => {
    const rows = [
      notification('n1', 'FOLLOW_REQUEST', ANA, at(3)),
      notification('n2', 'FOLLOW_REQUEST', BOB, at(2)),
      notification('n3', 'FOLLOW_REQUEST', CAT, at(1)),
    ];
    const { hydrator } = hydratorWith(
      [user(ANA, 'Ana', 'Pop'), user(BOB, 'Bob', 'I'), user(CAT, 'Cat', 'R')],
      [edge(ANA, ME, 'PENDING'), edge(BOB, ME, 'ACCEPTED')],
    );
    const service = new ActivityService(notificationRepo(rows), hydrator);
    const page = await service.list(ME, { limit: 20 });
    expect(page.items.map((i) => [i.id, i.requestState])).toEqual([
      ['n1', 'pending'],
      ['n2', 'accepted'],
      ['n3', 'declined'],
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('only FOLLOW_REQUEST items carry requestState; the actor is a summary', async () => {
    const rows = [
      notification('n1', 'NEW_FOLLOWER', ANA, at(2)),
      notification('n2', 'REQUEST_ACCEPTED', BOB, at(1)),
    ];
    const { hydrator } = hydratorWith(
      [user(ANA, 'Ana', 'Pop'), user(BOB, 'Bob', 'I')],
      [edge(ANA, ME, 'ACCEPTED')],
    );
    const page = await new ActivityService(notificationRepo(rows), hydrator).list(ME, {
      limit: 20,
    });
    expect(page.items[0]).not.toHaveProperty('requestState');
    expect(page.items[0]?.actor).toMatchObject({ id: ANA, followsYou: true, relation: 'none' });
    expect(Object.keys(page.items[1] ?? {}).sort()).toEqual(
      ['actor', 'createdAt', 'id', 'kind', 'readAt'].sort(),
    );
  });

  it('pages newest first with an opaque (createdAt, id) cursor; a tampered cursor restarts', async () => {
    const rows = [1, 2, 3, 4, 5].map((m) => notification(`n${m}`, 'NEW_FOLLOWER', ANA, at(m)));
    const repo = notificationRepo(rows);
    const { hydrator } = hydratorWith([user(ANA, 'Ana', 'Pop')], []);
    const service = new ActivityService(repo, hydrator);

    const first = await service.list(ME, { limit: 2 });
    expect(first.items.map((i) => i.id)).toEqual(['n5', 'n4']);
    expect(decodeCursor(first.nextCursor ?? '')).toEqual({ date: at(4), id: 'n4' });
    const second = await service.list(ME, { limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.items.map((i) => i.id)).toEqual(['n3', 'n2']);
    const last = await service.list(ME, { limit: 2, cursor: second.nextCursor ?? undefined });
    expect(last.items.map((i) => i.id)).toEqual(['n1']);
    expect(last.nextCursor).toBeNull();

    const tampered = await service.list(ME, { limit: 2, cursor: 'not-a-cursor!' });
    expect(tampered.items.map((i) => i.id)).toEqual(['n5', 'n4']);
    // The repository is asked for one extra row to know whether there's a next page.
    expect(repo.calls.list[0]?.[2]).toBe(3);
    expect(encodeCursor(at(4), 'n4')).toBe(first.nextCursor);
  });

  it('drops an item whose actor row is gone', async () => {
    const rows = [notification('n1', 'NEW_FOLLOWER', ANA, at(1))];
    const { hydrator } = hydratorWith([], []);
    const page = await new ActivityService(notificationRepo(rows), hydrator).list(ME, {
      limit: 20,
    });
    expect(page.items).toEqual([]);
  });

  it('markReadUpTo marks and returns what is still unread', async () => {
    const repo = notificationRepo([]);
    const service = new ActivityService(repo, hydratorWith([], []).hydrator);
    await expect(service.markReadUpTo(ME, T0)).resolves.toEqual({ unreadActivity: 2 });
    expect(repo.markReadUpTo).toHaveBeenCalledWith(ME, T0);
  });

  it('notify upserts (in the caller transaction), never to yourself; withdraw passes through', async () => {
    const repo = notificationRepo([]);
    const service = new ActivityService(repo, hydratorWith([], []).hydrator);
    const tx = {} as SocialDbClient;
    await service.notify(ANA, 'NEW_FOLLOWER', ME, tx);
    expect(repo.upsertSocial).toHaveBeenCalledWith(
      { userId: ANA, kind: 'NEW_FOLLOWER', actorId: ME },
      tx,
    );
    await service.notify(ME, 'NEW_FOLLOWER', ME);
    expect(repo.upsertSocial).toHaveBeenCalledTimes(1);
    await service.withdraw(ANA, 'FOLLOW_REQUEST', ME, tx);
    expect(repo.withdraw).toHaveBeenCalledWith(ANA, 'FOLLOW_REQUEST', ME, tx);
  });
});
