import { describe, expect, it } from 'vitest';
import { makeContractClient, uniqueEmail } from './client';

// NOTE: auth.register/login are rate-limited to 10 per 15 min per IP — this
// suite spends 2 of those per run. Keep new auth calls out of other suites.

describe('mobile auth contract', () => {
  it('register → Bearer auth → logout lifecycle', async () => {
    const { client, setToken } = makeContractClient();
    const email = uniqueEmail('auth-lifecycle');

    // 1. Register with the mobile header → session token in the body
    const registered = await client.auth.register.mutate({
      email,
      password: 'Contract@123!',
      firstName: 'Contract',
    });
    expect(registered.email).toBe(email);
    const session = registered.session;
    if (!session) {
      throw new Error('mobile register response is missing the session credential');
    }
    expect(session.token).toBeTruthy();
    // superjson must hydrate the expiry as a real Date
    expect(session.expires).toBeInstanceOf(Date);
    expect(session.expires.getTime()).toBeGreaterThan(Date.now());

    // 2. Bearer token authenticates protected procedures
    setToken(session.token);
    const me = await client.auth.me.query();
    expect(me?.email).toBe(email);

    // 3. Logout via Bearer kills the session server-side
    await client.auth.logout.mutate();
    const meAfter = await client.auth.me.query();
    expect(meAfter).toBeNull();

    // 4. Protected procedures now reject the dead token
    await expect(client.preferences.hasProfile.query()).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    });
  });

  it('rejects protected procedures without any credential', async () => {
    const { client } = makeContractClient();
    await expect(client.preferences.get.query()).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    });
  });
});
