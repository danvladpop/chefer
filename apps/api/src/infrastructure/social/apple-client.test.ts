import { decodeJwt, decodeProtectedHeader } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { APPLE_REVOKE_URL, APPLE_TOKEN_URL, AppleClient, type FetchLike } from './apple-client.js';
import { createApplePrivateKeyPem, formBody } from './testing.js';

let privateKey: string;
beforeAll(async () => {
  privateKey = await createApplePrivateKeyPem();
});

const creds = () => ({ teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey });

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('AppleClient', () => {
  it('builds an ES256 client secret naming the team, key and client', async () => {
    const client = new AppleClient(creds);
    const secret = await client.clientSecret('com.popdan.chefer');
    expect(decodeProtectedHeader(secret)).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' });
    const claims = decodeJwt(secret);
    expect(claims).toMatchObject({
      iss: 'TEAM123456',
      sub: 'com.popdan.chefer',
      aud: 'https://appleid.apple.com',
    });
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBeLessThanOrEqual(600);
  });

  it('refuses to sign when Apple is not configured', async () => {
    await expect(new AppleClient(() => null).clientSecret('x')).rejects.toThrow(/not configured/);
  });

  it('exchanges the authorization code for a refresh token', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(async () =>
      jsonResponse({ refresh_token: 'r-123', access_token: 'a' }),
    );
    const client = new AppleClient(creds, fetchImpl);
    const token = await client.exchangeCode({
      code: 'c-1',
      clientId: 'dev.chefer.web',
      redirectUri: 'https://chefer.example/login',
    });
    expect(token).toBe('r-123');
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(APPLE_TOKEN_URL);
    const body = formBody(init);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('c-1');
    expect(body.get('client_id')).toBe('dev.chefer.web');
    expect(body.get('redirect_uri')).toBe('https://chefer.example/login');
    expect(decodeJwt(body.get('client_secret') ?? '').sub).toBe('dev.chefer.web');
  });

  it('omits redirect_uri for native codes and returns null when Apple rejects', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(async () =>
      jsonResponse({ error: 'invalid_grant' }, 400),
    );
    const client = new AppleClient(creds, fetchImpl);
    expect(await client.exchangeCode({ code: 'c', clientId: 'com.popdan.chefer' })).toBeNull();
    const body = formBody(fetchImpl.mock.calls[0]?.[1]);
    expect(body.has('redirect_uri')).toBe(false);
  });

  it('revokes a refresh token with the matching client id', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(
      async () => new Response('', { status: 200 }),
    );
    const client = new AppleClient(creds, fetchImpl);
    expect(await client.revoke({ refreshToken: 'r-123', clientId: 'com.popdan.chefer' })).toBe(
      true,
    );
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(APPLE_REVOKE_URL);
    const body = formBody(init);
    expect(body.get('token')).toBe('r-123');
    expect(body.get('token_type_hint')).toBe('refresh_token');
    expect(body.get('client_id')).toBe('com.popdan.chefer');
  });
});
