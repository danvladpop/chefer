import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, SocialDbClient, SocialProfile, SocialUserRow } from '@chefer/database';
import { FriendSummaryHydrator, type SocialTx } from './activity.service.js';
import { BlockService } from './block.service.js';

// Block (PRD §9.1, FR-13.1–13.3; plan §9 "Services": block side effects).
// One transaction: follows both ways, Activity both ways, dismissals both
// ways, then the Block row — all on the SAME transaction client.

const ME = 'cme000000000000000000001';
const BOB = 'cbob00000000000000000001';
const CAT = 'ccat00000000000000000001';
/** A Chefer account that never turned Following on (a user row, no SocialProfile). */
const OFF = 'coff00000000000000000001';
const T0 = new Date('2026-09-30T10:00:00.000Z');

function makeWorld() {
  const calls: { op: string; args: unknown[] }[] = [];
  const record =
    (op: string, result: number) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
      return Promise.resolve(result);
    };
  const blocks: Block[] = [];
  const blockRepo = {
    create: vi.fn((blockerId: string, blockedId: string, db?: SocialDbClient) => {
      calls.push({ op: 'block.create', args: [blockerId, blockedId, db] });
      const existing = blocks.find((b) => b.blockerId === blockerId && b.blockedId === blockedId);
      if (existing) return Promise.resolve(existing);
      const row = {
        blockerId,
        blockedId,
        createdAt: new Date(T0.getTime() + blocks.length * 1000),
      };
      blocks.push(row);
      return Promise.resolve(row);
    }),
    delete: vi.fn((blockerId: string, blockedId: string) => {
      const i = blocks.findIndex((b) => b.blockerId === blockerId && b.blockedId === blockedId);
      if (i >= 0) blocks.splice(i, 1);
      return Promise.resolve(i >= 0);
    }),
    listMade: vi.fn(
      (blockerId: string, cursor: { createdAt: Date; id: string } | null, take: number) =>
        Promise.resolve(
          blocks
            .filter((b) => b.blockerId === blockerId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .filter((b) => !cursor || b.createdAt < cursor.createdAt)
            .slice(0, take),
        ),
    ),
  };
  const follows = { deleteBothWays: vi.fn(record('follows.deleteBothWays', 2)) };
  const notifications = { withdrawBetween: vi.fn(record('notifications.withdrawBetween', 1)) };
  const dismissals = { deleteBetween: vi.fn(record('dismissals.deleteBetween', 0)) };
  const users: SocialUserRow[] = [BOB, CAT, OFF].map((id) => ({
    id,
    firstName: id.slice(1, 4),
    lastName: 'X',
    name: null,
    image: null,
  }));
  const activated = new Set([BOB, CAT]);
  const profiles = {
    findUsers: vi.fn((ids: string[]) => Promise.resolve(users.filter((u) => ids.includes(u.id)))),
    find: vi.fn((id: string) =>
      Promise.resolve(activated.has(id) ? ({ userId: id } as SocialProfile) : null),
    ),
  };
  const suggestions = { invalidate: vi.fn(), invalidateAll: vi.fn() };
  const hydrator = new FriendSummaryHydrator(profiles, {
    findEdgesWith: () => Promise.resolve([]),
  });
  const txs: SocialDbClient[] = [];
  const tx: SocialTx = (fn) => {
    const t = { n: txs.length } as unknown as SocialDbClient;
    txs.push(t);
    return fn(t);
  };
  const service = new BlockService(
    blockRepo,
    follows,
    notifications,
    dismissals,
    profiles,
    suggestions,
    hydrator,
    tx,
  );
  return { service, calls, blocks, blockRepo, suggestions, txs, follows };
}

let w: ReturnType<typeof makeWorld>;
beforeEach(() => {
  w = makeWorld();
});

describe('block', () => {
  it('runs every side effect on ONE transaction, the Block row last, and clears both caches', async () => {
    await expect(w.service.block(ME, BOB)).resolves.toEqual({ ok: true });
    expect(w.txs).toHaveLength(1);
    expect(w.calls.map((c) => c.op)).toEqual([
      'follows.deleteBothWays',
      'notifications.withdrawBetween',
      'dismissals.deleteBetween',
      'block.create',
    ]);
    for (const c of w.calls) {
      expect(c.args.slice(0, 2)).toEqual([ME, BOB]);
      expect(c.args[2]).toBe(w.txs[0]);
    }
    expect(w.suggestions.invalidate).toHaveBeenCalledWith(ME);
    expect(w.suggestions.invalidate).toHaveBeenCalledWith(BOB);
  });

  it('is idempotent: re-blocking keeps one row', async () => {
    await w.service.block(ME, BOB);
    await w.service.block(ME, BOB);
    expect(w.blocks).toHaveLength(1);
  });

  it('self → BAD_REQUEST; an unknown id is the same ok with nothing written (INV-3)', async () => {
    const err = await w.service.block(ME, ME).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('BAD_REQUEST');
    await expect(w.service.block(ME, 'cunknown0000000000000001')).resolves.toEqual({ ok: true });
    expect(w.calls).toEqual([]);
  });

  it('F3.1: a user who never turned Following on can’t be blocked — no row, no name in Blocked people', async () => {
    await expect(w.service.block(ME, OFF)).resolves.toEqual({ ok: true });
    expect(w.calls).toEqual([]);
    const list = await w.service.list(ME, { limit: 20 });
    expect(list.items).toEqual([]);
  });

  it('blockInTx runs inside the caller’s transaction (report-and-block)', async () => {
    const callerTx = { caller: true } as unknown as SocialDbClient;
    const row = await w.service.blockInTx(callerTx, ME, CAT);
    expect(row).toMatchObject({ blockerId: ME, blockedId: CAT });
    expect(w.txs).toHaveLength(0);
    expect(w.calls.every((c) => c.args[2] === callerTx)).toBe(true);
    expect(w.suggestions.invalidate).toHaveBeenCalledWith(CAT);
  });
});

describe('unblock', () => {
  it('removes only my block, restores nothing, and is idempotent', async () => {
    await w.service.block(ME, BOB);
    await expect(w.service.unblock(ME, BOB)).resolves.toEqual({ ok: true });
    expect(w.blocks).toEqual([]);
    expect(w.follows.deleteBothWays).toHaveBeenCalledTimes(1); // nothing re-created
    await expect(w.service.unblock(ME, BOB)).resolves.toEqual({ ok: true });
    await expect(w.service.unblock(ME, ME)).resolves.toEqual({ ok: true });
  });
});

describe('list (Blocked people)', () => {
  it('newest first, hydrated summaries, cursor keyed on the blocked id', async () => {
    await w.service.block(ME, BOB);
    await w.service.block(ME, CAT);
    const first = await w.service.list(ME, { limit: 1 });
    expect(first.items.map((s) => s.id)).toEqual([CAT]);
    expect(first.items[0]).toMatchObject({ relation: 'none', followsYou: false });
    expect(first.nextCursor).not.toBeNull();
    const second = await w.service.list(ME, { limit: 1, cursor: first.nextCursor ?? undefined });
    expect(second.items.map((s) => s.id)).toEqual([BOB]);
    expect(second.nextCursor).toBeNull();
  });
});
