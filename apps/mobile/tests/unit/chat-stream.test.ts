import { onAiConsentRequired } from '@chefer/utils';
import {
  SESSION_EXPIRED_MESSAGE,
  setUnauthorizedHandler,
} from '../../src/features/auth/session-expired';
import { streamChat } from '../../src/lib/chat-stream';

// R-10: /api/chat answers 403 { error, reason: 'AI_CONSENT_REQUIRED' } when the
// user has no AI-data consent on record. The client reopens the consent sheet
// and still throws the server's sentence (old clients show it as the error).

const base = {
  apiBaseUrl: 'https://api.test',
  getToken: () => 'token',
  messages: [{ role: 'user' as const, content: 'hi' }],
};

const jsonResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  }) as unknown as Response;

describe('streamChat — AI consent rejection', () => {
  it('notifies the consent provider and throws the server message', async () => {
    const listener = jest.fn();
    const off = onAiConsentRequired(listener);
    const message = 'Allow AI features in Profile → AI & your data to use this.';
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(403, { error: message, reason: 'AI_CONSENT_REQUIRED' }));

    await expect(streamChat({ ...base, fetchImpl })).rejects.toThrow(message);
    expect(listener).toHaveBeenCalledWith('chat');
    off();
  });

  it('another failure leaves the consent sheet alone', async () => {
    const listener = jest.fn();
    const off = onAiConsentRequired(listener);
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(500, { error: 'The chef is down' }));
    await expect(streamChat({ ...base, fetchImpl })).rejects.toThrow('The chef is down');
    expect(listener).not.toHaveBeenCalled();
    off();
  });
});

// UX-ACC-10: a 401 from the chat stream ends the session like a tRPC 401 and
// reads as a session problem, not as the server's bare "Unauthorized".
describe('streamChat — expired session', () => {
  afterEach(() => setUnauthorizedHandler(null));

  it('reports the 401 to the shared handler and throws the session-expired sentence', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));
    await expect(streamChat({ ...base, fetchImpl })).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
