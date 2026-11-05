import { describe, expect, it, vi } from 'vitest';
import type { PushData } from '@chefer/types';
import {
  createExpoPushClient,
  ExpoPushError,
  FetchExpoPushClient,
  NoopExpoPushClient,
  type ExpoPushMessage,
} from './expo-push.client.js';

// The Expo push API client (trainer-mode.md §7.2): plain fetch, ≤ 100 messages
// per send, ≤ 1000 ids per receipt lookup, errors carry Expo's code only.

vi.mock('../../lib/env.js', () => ({ env: { EXPO_PUSH_ENABLED: false } }));

const data: PushData = { app: 'chefer-push', kind: 'SOCIAL_FOLLOW' };
const message = (to: string): ExpoPushMessage => ({
  to,
  title: 'New follower',
  body: 'Tom started following you',
  data,
  sound: 'default',
  priority: 'high',
  channelId: 'default',
});

function fetchReturning(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('createExpoPushClient', () => {
  it('is the no-op client unless enabled: nothing calls Expo', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const client = createExpoPushClient({ enabled: false });
    expect(client).toBeInstanceOf(NoopExpoPushClient);
    await expect(client.send([message('ExponentPushToken[a]')])).resolves.toEqual([
      { status: 'ok' },
    ]);
    await expect(client.getReceipts(['t1'])).resolves.toEqual({});
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(createExpoPushClient({ enabled: true })).toBeInstanceOf(FetchExpoPushClient);
  });
});

describe('FetchExpoPushClient', () => {
  it('POSTs the messages to /push/send and returns the tickets in order', async () => {
    const fetchImpl = fetchReturning(200, {
      data: [
        { status: 'ok', id: 't1' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
      ],
    });
    const client = new FetchExpoPushClient('secret', fetchImpl);
    const tickets = await client.send([
      message('ExponentPushToken[a]'),
      message('ExponentPushToken[b]'),
    ]);
    expect(tickets).toEqual([
      { status: 'ok', id: 't1' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret',
    });
    expect(JSON.parse(init.body as string)).toHaveLength(2);
  });

  it('sends no Authorization header without an access token', async () => {
    const fetchImpl = fetchReturning(200, { data: [{ status: 'ok', id: 't1' }] });
    await new FetchExpoPushClient(undefined, fetchImpl).send([message('ExponentPushToken[a]')]);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('refuses more than 100 messages or 1000 receipt ids', async () => {
    const fetchImpl = fetchReturning(200, {});
    const client = new FetchExpoPushClient(undefined, fetchImpl);
    const many = Array.from({ length: 101 }, (_, i) => message(`ExponentPushToken[${i}]`));
    await expect(client.send(many)).rejects.toMatchObject({ code: 'BATCH_TOO_LARGE' });
    const ids = Array.from({ length: 1001 }, (_, i) => `t${i}`);
    await expect(client.getReceipts(ids)).rejects.toMatchObject({ code: 'BATCH_TOO_LARGE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a request-level error or HTTP failure throws with the code only (never a token)', async () => {
    const tokenText = 'ExponentPushToken[secret-device]';
    const errors = new FetchExpoPushClient(
      undefined,
      fetchReturning(400, {
        errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', message: tokenText }],
      }),
    );
    const err = await errors.send([message(tokenText)]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExpoPushError);
    expect((err as ExpoPushError).code).toBe('PUSH_TOO_MANY_EXPERIENCE_IDS');
    expect((err as Error).message).not.toContain('secret-device');

    const down = new FetchExpoPushClient(undefined, fetchReturning(503, null));
    await expect(down.send([message(tokenText)])).rejects.toMatchObject({ code: 'HTTP_503' });

    const short = new FetchExpoPushClient(undefined, fetchReturning(200, { data: [] }));
    await expect(short.send([message(tokenText)])).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('getReceipts POSTs the ids and returns the receipts by id', async () => {
    const fetchImpl = fetchReturning(200, {
      data: {
        t1: { status: 'ok' },
        t2: { status: 'error', details: { error: 'DeviceNotRegistered' } },
      },
    });
    const receipts = await new FetchExpoPushClient(undefined, fetchImpl).getReceipts(['t1', 't2']);
    expect(receipts['t2']).toMatchObject({ status: 'error' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://exp.host/--/api/v2/push/getReceipts');
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['t1', 't2'] });
  });
});
