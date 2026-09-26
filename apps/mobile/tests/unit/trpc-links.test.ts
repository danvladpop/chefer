import { createTRPCUntypedClient, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from '@chefer/api';
import {
  buildAuthHeaders,
  buildTrpcLinks,
  isExpectedFailure,
  REDACTED,
  redactSecrets,
} from '../../src/lib/trpc-links';

describe('buildAuthHeaders', () => {
  it('always identifies as the mobile client', () => {
    const headers = buildAuthHeaders(() => null);
    expect(headers['x-chefer-client']).toBe('mobile');
    expect(headers.authorization).toBeUndefined();
  });

  it('adds the Bearer header when a token is present', () => {
    const headers = buildAuthHeaders(() => 'tok-123');
    expect(headers.authorization).toBe('Bearer tok-123');
    expect(headers['x-chefer-client']).toBe('mobile');
  });
});

describe('isExpectedFailure (dogfood #7 — no LogBox toast for offline)', () => {
  it('treats network and auth failures as expected', () => {
    expect(
      isExpectedFailure([
        '<< query',
        { result: new Error('fetch failed: Could not connect to the server.') },
      ]),
    ).toBe(true);
    expect(isExpectedFailure([new Error('Network request failed')])).toBe(true);
    expect(isExpectedFailure([{ result: new Error('UNAUTHORIZED') }])).toBe(true);
  });
  it('keeps real server errors loud', () => {
    expect(isExpectedFailure([{ result: new Error('INTERNAL_SERVER_ERROR: boom') }])).toBe(false);
    expect(isExpectedFailure(['<< mutation', { result: 'nope' }])).toBe(false);
  });
});

describe('redactSecrets (F-M-AUTH-2-2 — no plaintext passwords in dev logs)', () => {
  it('masks every secret key at any depth, case-insensitively', () => {
    const input = {
      email: 'alice@chefer.dev',
      password: 'User@123!',
      nested: {
        currentPassword: 'old',
        NewPassword: 'new',
        confirmPassword: 'new',
        list: [{ token: 'raw-reset-token', keep: 1 }],
      },
    };
    expect(redactSecrets(input)).toEqual({
      email: 'alice@chefer.dev',
      password: REDACTED,
      nested: {
        currentPassword: REDACTED,
        NewPassword: REDACTED,
        confirmPassword: REDACTED,
        list: [{ token: REDACTED, keep: 1 }],
      },
    });
  });

  it('never mutates what the app actually sends', () => {
    const input = { password: 'User@123!' };
    redactSecrets(input);
    expect(input.password).toBe('User@123!');
  });

  it('leaves Errors, Dates, primitives and cycles intact', () => {
    const error = new Error('Network request failed');
    const date = new Date(0);
    const cyclic: Record<string, unknown> = { token: 't' };
    cyclic.self = cyclic;

    expect(redactSecrets(error)).toBe(error);
    expect(redactSecrets('%c >> mutation')).toBe('%c >> mutation');
    const out = redactSecrets({ result: error, at: date, cyclic }) as Record<string, unknown>;
    expect(out.result).toBe(error);
    expect(out.at).toBe(date);
    const outCyclic = out.cyclic as Record<string, unknown>;
    expect(outCyclic.token).toBe(REDACTED);
    expect(outCyclic.self).toBe(outCyclic);
  });
});

describe('buildTrpcLinks logger (F-M-AUTH-2-2)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** The app's logger link, terminated by a fake server instead of httpBatchLink. */
  function clientWithFakeServer(data: unknown) {
    const logger = buildTrpcLinks({
      url: 'http://localhost:3001/trpc',
      getToken: () => null,
      enableLogger: true,
    })[0];
    if (!logger) throw new Error('buildTrpcLinks() returned no logger link');
    const fakeServer: TRPCLink<AppRouter> = () => () =>
      observable((observer) => {
        observer.next({ result: { type: 'data', data } });
        observer.complete();
      });
    return createTRPCUntypedClient<AppRouter>({ links: [logger, fakeServer] });
  }

  it('logs neither the password going up nor the session token coming down', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const client = clientWithFakeServer({ session: { token: 'session-token-123' } });

    await client.mutation('auth.login', { email: 'alice@chefer.dev', password: 'User@123!' });

    expect(log).toHaveBeenCalledTimes(2); // >> up, << down
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('User@123!');
    expect(logged).not.toContain('session-token-123');
    expect(logged).toContain('alice@chefer.dev');
    expect(logged).toContain(REDACTED);
  });

  it('redacts reset-password inputs too', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const client = clientWithFakeServer({ success: true });

    await client.mutation('auth.resetPassword', { token: 'raw-reset', password: 'NewPass123!' });

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('raw-reset');
    expect(logged).not.toContain('NewPass123!');
  });
});
