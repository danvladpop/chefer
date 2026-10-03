import { beforeAll, describe, expect, it } from 'vitest';
import { makeContractClient, SEED_EMAIL, SEED_PASSWORD, type ContractClient } from './client';

// ─── feedback.submit context fields (UX-PO-05) ────────────────────────────────
// `build` / `os` / `route` are additive + optional: a shipped 1.0.1 binary
// sends only `message` (+ `path`) and must keep working.

describe('feedback.submit (UX-PO-05)', () => {
  let c: ContractClient;

  beforeAll(async () => {
    c = makeContractClient();
    const session = (
      await c.client.auth.login.mutate({ email: SEED_EMAIL, password: SEED_PASSWORD })
    ).session;
    if (!session) throw new Error('mobile login response is missing the session credential');
    c.setToken(session.token);
  });

  it('accepts the legacy shape (message + path only)', async () => {
    await expect(
      c.client.feedback.submit.mutate({ message: 'contract: legacy client', path: 'mobile/more' }),
    ).resolves.toEqual({ ok: true });
  });

  it('accepts the new optional build, os and route fields', async () => {
    await expect(
      c.client.feedback.submit.mutate({
        message: 'contract: with context',
        build: 'Chefer 1.0.1 · production · update 3f2a9c1e',
        os: 'iOS 18.2',
        route: '/gym/workout',
      }),
    ).resolves.toEqual({ ok: true });
  });

  it('rejects an oversized context field', async () => {
    await expect(
      c.client.feedback.submit.mutate({ message: 'contract: too long', build: 'x'.repeat(161) }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
  });
});
