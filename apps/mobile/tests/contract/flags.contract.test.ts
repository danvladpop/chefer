import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { describe, expect, it } from 'vitest';
import type { AppRouter } from '@chefer/api';
import { API_URL, makeContractClient } from './client';

// ─── Feature flags + client API level contract (T-00.8) ───────────────────────
// Every flag defaults OFF (FEATURE_FLAGS is unset in every dev/CI env), and a
// request that omits x-chefer-api-level entirely — an "old client" — must
// behave exactly like one that sends it. HEALTH_CONSENT_ENFORCE stays "off"
// in wave 0, so nothing rejects the level-0 request yet; this test still
// pins the compatibility contract now, before enforcement exists to break it.

describe('profile.flags (T-00.8)', () => {
  it('every flag is off by default', async () => {
    const { client } = makeContractClient();
    const flags = await client.profile.flags.query();
    for (const value of Object.values(flags)) {
      expect(value).not.toBe(true);
    }
  });

  it('is a public query — no session needed', async () => {
    const { client } = makeContractClient(); // setToken never called
    await expect(client.profile.flags.query()).resolves.toBeTruthy();
  });
});

describe('requests without x-chefer-api-level (old client compat, §2.8)', () => {
  it('a level-0 client (no header at all) still succeeds on a public query', async () => {
    // Deliberately NOT buildTrpcLinks — a bare client sends no
    // x-chefer-api-level, x-chefer-client or x-trpc-source header, simulating
    // the oldest possible installed binary.
    const bareClient = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `${API_URL}/trpc`, transformer: superjson })],
    });
    await expect(bareClient.profile.flags.query()).resolves.toBeTruthy();
    await expect(bareClient.profile.aiProviders.query()).resolves.toBeTruthy();
  });

  it('a level-0 client can still log in and read its own profile (auth untouched by §2.8)', async () => {
    const bareClient = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `${API_URL}/trpc`, transformer: superjson })],
    });
    const result = await bareClient.auth.login.mutate({
      email: 'alice@chefer.dev',
      password: 'User@123!',
    });
    // No x-chefer-client: mobile header was sent, so no session credential
    // in the body (web-style cookie auth) — the login itself must still
    // succeed rather than being rejected for the missing capability header.
    expect(result.email).toBe('alice@chefer.dev');
  });
});
