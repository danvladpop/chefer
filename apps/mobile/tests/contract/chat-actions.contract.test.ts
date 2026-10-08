import { describe, expect, it } from 'vitest';
import { CHAT_ACTIONS_MARKER } from '@chefer/types';
import { splitChatActions } from '@chefer/utils';
import { streamChat } from '../../src/lib/chat-stream';
import { API_URL, makeContractClient, SEED_EMAIL, SEED_PASSWORD } from './client';

// UX-FOOD-21: what the chef DID comes back after the text, for clients that
// ask (`x-chefer-chat-actions: 1`), and ONLY for them. Needs the API on the
// MOCK AI provider (AI_MOCK_ENABLED=true), whose chat runs the real tool
// handlers — so this costs no real AI call. Run it with:
//   CHEFER_CONTRACT_AI_MOCK=1 pnpm test:contract -- chat-actions

const enabled = process.env.CHEFER_CONTRACT_AI_MOCK === '1';

describe.skipIf(!enabled)('chat action trailer (UX-FOOD-21)', () => {
  it('reports the logged meal to an opted-in client, which can undo it; others get plain text', async () => {
    const { client, setToken, getToken } = makeContractClient();
    const user = await client.auth.login.mutate({ email: SEED_EMAIL, password: SEED_PASSWORD });
    if (!user.session) throw new Error('mobile login response is missing the session credential');
    setToken(user.session.token);
    await client.user.grantAiDataConsent.mutate();

    const result = await streamChat({
      fetchImpl: fetch,
      apiBaseUrl: API_URL,
      getToken,
      messages: [{ role: 'user', content: 'I just ate a contract test croissant' }],
    });
    const { text, actions } = splitChatActions(result.fullText);
    expect(text).toMatch(/Logged/);
    expect(text).not.toContain(CHAT_ACTIONS_MARKER);
    const logged = actions.find((a) => a.kind === 'logged');
    expect(logged).toMatchObject({ kind: 'logged', kcal: 450 });

    // Undo path the app uses: find the entry on that day, delete it by id.
    if (logged?.kind === 'logged') {
      const day = await client.tracker.getDay.query({ date: logged.date });
      const entry = (day.log?.loggedMeals ?? []).find(
        (m) => m.custom?.name === logged.name && Math.round(m.kcal) === logged.kcal,
      );
      expect(entry?.entryId).toBeTruthy();
      if (entry?.entryId) {
        await client.tracker.deleteEntries.mutate({ date: logged.date, entryIds: [entry.entryId] });
      }
    }

    // A client that does not opt in gets today's bare stream.
    const bare = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-chefer-client': 'mobile',
        authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'I just ate a contract test croissant' }],
      }),
    });
    const bareText = await bare.text();
    expect(bareText).not.toContain(CHAT_ACTIONS_MARKER);
    // clean up the second entry too
    const day2 = await client.tracker.getDay.query({
      date: new Date().toISOString().slice(0, 10),
    });
    const ids = (day2.log?.loggedMeals ?? []).flatMap((m) =>
      m.custom?.name.includes('contract test croissant') && m.entryId ? [m.entryId] : [],
    );
    if (ids.length > 0) {
      await client.tracker.deleteEntries.mutate({
        date: new Date().toISOString().slice(0, 10),
        entryIds: ids,
      });
    }
  }, 60_000);
});
