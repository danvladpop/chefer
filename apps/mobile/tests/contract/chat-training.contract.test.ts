import { describe, expect, it } from 'vitest';
import { CHAT_ACTIONS_MARKER } from '@chefer/types';
import { splitChatActions } from '@chefer/utils';
import { streamChat } from '../../src/lib/chat-stream';
import { API_URL, makeContractClient, SEED_EMAIL, SEED_PASSWORD } from './client';

// Ask Chef helps with training (2026-10-10): the read-only `getMyTraining`
// tool. Needs the API on the MOCK AI provider (AI_MOCK_ENABLED=true), whose
// chat runs the real tool handlers — no real AI call. Read-only, so the seed
// account is fine. Run it with:
//   CHEFER_CONTRACT_AI_MOCK=1 pnpm test:contract -- chat-training

const enabled = process.env.CHEFER_CONTRACT_AI_MOCK === '1';

describe.skipIf(!enabled)('chat getMyTraining (Ask Chef helps with training)', () => {
  it('answers a training question from the real gym data and reports no action', async () => {
    const { client, setToken, getToken } = makeContractClient();
    const user = await client.auth.login.mutate({ email: SEED_EMAIL, password: SEED_PASSWORD });
    if (!user.session) throw new Error('mobile login response is missing the session credential');
    setToken(user.session.token);
    await client.user.grantAiDataConsent.mutate();

    const result = await streamChat({
      fetchImpl: fetch,
      apiBaseUrl: API_URL,
      getToken,
      messages: [{ role: 'user', content: 'What should I train today?' }],
    });
    const { text, actions } = splitChatActions(result.fullText);
    expect(text).toContain('TRAINING (real data from the Train tab');
    // Either state is real data: set up (goal + streak) or the Train pointer.
    expect(text).toMatch(/Set up: .*weekly goal|Training is NOT set up yet/);
    expect(text).toContain('Train → Routines → Edit');
    expect(text).not.toContain(CHAT_ACTIONS_MARKER);
    expect(actions).toEqual([]);
  }, 60_000);
});
