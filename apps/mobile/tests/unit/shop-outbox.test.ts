import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  shopOutbox,
  shopSendFailure,
  withPendingToggles,
  type ShopOutboxEntry,
} from '../../src/features/shopping-list/shop-outbox';
import { trpcError } from './friends-core-harness';

// ADR 0002 "Offline check-offs reconcile by last write per item": the Shop ticks' durable outbox.
// Enqueued ticks are on disk at once, sent in order, dropped once accepted or refused for good, and
// kept (in order) when the network or the server is down.

const PLAN = 'plan-1';

function entry(keys: string[], checked: boolean, at: string, planId = PLAN): ShopOutboxEntry {
  return { planId, keys, checked, at };
}

function networkError(): Error {
  return new TypeError('Network request failed');
}

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  shopOutbox.reload();
});
afterAll(() => setKvBackendForTests(undefined));

describe('shop outbox: enqueue and persist', () => {
  it('writes each tick to the KV store under KV_KEYS.shopOutbox', () => {
    shopOutbox.enqueue(entry(['milk'], true, '2026-10-23T10:00:00.000Z'));
    shopOutbox.enqueue(entry(['eggs'], true, '2026-10-23T10:00:01.000Z'));
    expect(kv.getJSON(KV_KEYS.shopOutbox)).toEqual([
      entry(['milk'], true, '2026-10-23T10:00:00.000Z'),
      entry(['eggs'], true, '2026-10-23T10:00:01.000Z'),
    ]);
  });

  it('survives a restart (a fresh read of the store)', () => {
    shopOutbox.enqueue(entry(['milk'], true, '2026-10-23T10:00:00.000Z'));
    shopOutbox.reload();
    expect(shopOutbox.entries()).toEqual([entry(['milk'], true, '2026-10-23T10:00:00.000Z')]);
    expect([...shopOutbox.pendingKeys(PLAN)]).toEqual(['milk']);
    expect(shopOutbox.pendingKeys('other-plan').size).toBe(0);
  });

  it('a newer tick of the same key supersedes the waiting one (one entry per key)', () => {
    shopOutbox.enqueue(entry(['milk', 'eggs'], true, '2026-10-23T10:00:00.000Z'));
    shopOutbox.enqueue(entry(['milk'], false, '2026-10-23T10:05:00.000Z'));
    expect(shopOutbox.entries()).toEqual([
      entry(['eggs'], true, '2026-10-23T10:00:00.000Z'),
      entry(['milk'], false, '2026-10-23T10:05:00.000Z'),
    ]);
  });

  it('ignores corrupt stored entries', () => {
    kv.setJSON(KV_KEYS.shopOutbox, [{ nope: true }, entry(['milk'], true, 'x')]);
    shopOutbox.reload();
    expect(shopOutbox.entries()).toEqual([entry(['milk'], true, 'x')]);
  });

  it('notifies subscribers on every change', () => {
    const listener = jest.fn();
    const unsubscribe = shopOutbox.subscribe(listener);
    shopOutbox.enqueue(entry(['milk'], true, 'a'));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    shopOutbox.enqueue(entry(['eggs'], true, 'b'));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('shop outbox: flush', () => {
  it('sends in order, with the original device time, and empties the store once accepted', async () => {
    shopOutbox.enqueue(entry(['milk'], true, '2026-10-23T10:00:00.000Z'));
    shopOutbox.enqueue(entry(['eggs'], true, '2026-10-23T10:01:00.000Z'));
    shopOutbox.enqueue(entry(['bread'], false, '2026-10-23T10:02:00.000Z'));
    const sent: ShopOutboxEntry[] = [];
    const result = await shopOutbox.flush((e) => {
      sent.push(e);
      return Promise.resolve({ checkedKeys: [] });
    });
    expect(sent.map((e) => [e.keys[0], e.at])).toEqual([
      ['milk', '2026-10-23T10:00:00.000Z'],
      ['eggs', '2026-10-23T10:01:00.000Z'],
      ['bread', '2026-10-23T10:02:00.000Z'],
    ]);
    expect(result).toEqual({ sent: 3, dropped: [], blocked: false });
    expect(shopOutbox.entries()).toEqual([]);
    expect(kv.getString(KV_KEYS.shopOutbox)).toBeNull();
  });

  it('offline: keeps the failed entry and everything after it, in order, for the next flush', async () => {
    shopOutbox.enqueue(entry(['milk'], true, 'a'));
    shopOutbox.enqueue(entry(['eggs'], true, 'b'));
    shopOutbox.enqueue(entry(['bread'], true, 'c'));
    let calls = 0;
    const first = await shopOutbox.flush(() => {
      calls += 1;
      return calls === 1 ? Promise.resolve({}) : Promise.reject(networkError());
    });
    expect(first).toEqual({ sent: 1, dropped: [], blocked: true });
    expect(shopOutbox.entries().map((e) => e.keys[0])).toEqual(['eggs', 'bread']);
    expect(calls).toBe(2);

    // Back online: the rest goes, in order.
    const sent: string[] = [];
    const second = await shopOutbox.flush((e) => {
      sent.push(e.keys[0] ?? '');
      return Promise.resolve({});
    });
    expect(sent).toEqual(['eggs', 'bread']);
    expect(second.sent).toBe(2);
    expect(shopOutbox.entries()).toEqual([]);
  });

  it('a 5xx keeps the entry too (the server may be back in a minute)', async () => {
    shopOutbox.enqueue(entry(['milk'], true, 'a'));
    const result = await shopOutbox.flush(() =>
      Promise.reject(trpcError('INTERNAL_SERVER_ERROR', 500)),
    );
    expect(result.blocked).toBe(true);
    expect(shopOutbox.entries()).toHaveLength(1);
  });

  it('a 4xx (the plan is gone) drops that entry and carries on with the next', async () => {
    shopOutbox.enqueue(entry(['milk'], true, 'a', 'gone-plan'));
    shopOutbox.enqueue(entry(['eggs'], true, 'b'));
    const sent: string[] = [];
    const result = await shopOutbox.flush((e) => {
      if (e.planId === 'gone-plan') return Promise.reject(trpcError('NOT_FOUND', 404));
      sent.push(e.keys[0] ?? '');
      return Promise.resolve({});
    });
    expect(sent).toEqual(['eggs']);
    expect(result.dropped).toEqual([entry(['milk'], true, 'a', 'gone-plan')]);
    expect(result.sent).toBe(1);
    expect(shopOutbox.entries()).toEqual([]);
  });

  it('a tick made while a flush is sending is sent by the same flush', async () => {
    shopOutbox.enqueue(entry(['milk'], true, 'a'));
    const sent: string[] = [];
    await shopOutbox.flush((e) => {
      sent.push(e.keys[0] ?? '');
      if (e.keys[0] === 'milk') shopOutbox.enqueue(entry(['eggs'], true, 'b'));
      return Promise.resolve({});
    });
    expect(sent).toEqual(['milk', 'eggs']);
    expect(shopOutbox.entries()).toEqual([]);
  });

  it('a second flush while one runs joins it (no double send)', async () => {
    shopOutbox.enqueue(entry(['milk'], true, 'a'));
    const send = jest.fn(() => Promise.resolve({}));
    await Promise.all([shopOutbox.flush(send), shopOutbox.flush(send)]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never edits the entry in flight: an untick of the same key waits behind it', async () => {
    shopOutbox.enqueue(entry(['milk'], true, 'a'));
    const sent: ShopOutboxEntry[] = [];
    await shopOutbox.flush((e) => {
      sent.push(e);
      if (sent.length === 1) shopOutbox.enqueue(entry(['milk'], false, 'b'));
      return Promise.resolve({});
    });
    expect(sent).toEqual([entry(['milk'], true, 'a'), entry(['milk'], false, 'b')]);
  });
});

describe('shopSendFailure', () => {
  it('retries the network, the server, a rate limit; drops other 4xx', () => {
    expect(shopSendFailure(networkError())).toBe('retry');
    expect(shopSendFailure(trpcError('INTERNAL_SERVER_ERROR', 500))).toBe('retry');
    expect(shopSendFailure(trpcError('TOO_MANY_REQUESTS', 429))).toBe('retry');
    expect(shopSendFailure(trpcError('NOT_FOUND', 404))).toBe('drop');
    expect(shopSendFailure(trpcError('BAD_REQUEST', 400))).toBe('drop');
    expect(shopSendFailure(trpcError('FORBIDDEN', 403))).toBe('drop');
  });
});

describe('withPendingToggles', () => {
  it("applies the plan's waiting ticks in order on top of the server's keys", () => {
    const entries = [
      entry(['milk'], true, 'a'),
      entry(['eggs'], false, 'b'),
      entry(['bread'], true, 'c', 'other-plan'),
    ];
    expect(withPendingToggles(['eggs', 'rice'], entries, PLAN).sort()).toEqual(['milk', 'rice']);
  });

  it('returns the same array when nothing waits for that plan', () => {
    const keys = ['eggs'];
    expect(withPendingToggles(keys, [], PLAN)).toBe(keys);
  });
});
