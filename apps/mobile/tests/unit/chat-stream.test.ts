import { onAiConsentRequired } from '@chefer/utils';
import {
  SESSION_EXPIRED_MESSAGE,
  setUnauthorizedHandler,
} from '../../src/features/auth/session-expired';
import { ChatStreamError, streamChat } from '../../src/lib/chat-stream';

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

// UX-FOOD-21: the request opts in to the action trailer, and a failure carries
// its status so the screen can pick friendly copy.
describe('streamChat — action trailer opt-in and typed errors', () => {
  it('asks the server for the action trailer', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: null,
      text: () => Promise.resolve('hello'),
    });
    await streamChat({ ...base, fetchImpl });
    const calls = fetchImpl.mock.calls as [string, { headers: Record<string, string> }][];
    expect(calls[0]?.[1].headers['x-chefer-chat-actions']).toBe('1');
  });

  it('a proxy 502 with no JSON body is a ChatStreamError with the status and no server sentence', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('not json')),
      headers: new Headers(),
    });
    const err = await streamChat({ ...base, fetchImpl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatStreamError);
    expect(err).toMatchObject({ status: 502, serverMessage: null, message: 'Chat failed (502)' });
  });

  it('keeps the server sentence when it sent one', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(500, { error: 'The chef is down' }));
    const err = await streamChat({ ...base, fetchImpl }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 500, serverMessage: 'The chef is down' });
  });
});
