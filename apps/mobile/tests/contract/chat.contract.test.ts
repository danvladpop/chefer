import { describe, expect, it } from 'vitest';
import { streamChat } from '../../src/lib/chat-stream';
import { API_URL, makeContractClient, SEED_EMAIL, SEED_PASSWORD } from './client';

// Streams a REAL chat completion — the dev API runs real Gemini
// (AI_MOCK_ENABLED=false), so this costs an actual AI call. Gated behind
// CHEFER_CONTRACT_AI=1; run it after touching src/lib/chat-stream.ts:
//   CHEFER_CONTRACT_AI=1 pnpm test:contract

const aiEnabled = process.env.CHEFER_CONTRACT_AI === '1';

describe.skipIf(!aiEnabled)('chat streaming contract (M3-1)', () => {
  it('streams incremental chunks over Bearer auth', async () => {
    const { client, setToken, getToken } = makeContractClient();
    const user = await client.auth.login.mutate({ email: SEED_EMAIL, password: SEED_PASSWORD });
    if (!user.session) {
      throw new Error('mobile login response is missing the session credential');
    }
    setToken(user.session.token);

    const chunks: string[] = [];
    const result = await streamChat({
      fetchImpl: fetch,
      apiBaseUrl: API_URL,
      getToken,
      messages: [{ role: 'user', content: 'In one short sentence: what is a roux?' }],
      onChunk: (c) => chunks.push(c),
    });

    expect(result.fullText.length).toBeGreaterThan(0);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toBe(result.fullText);
  }, 60_000);

  it('rejects without a token', async () => {
    await expect(
      streamChat({
        fetchImpl: fetch,
        apiBaseUrl: API_URL,
        getToken: () => null,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/Unauthorized|401/);
  });
});
