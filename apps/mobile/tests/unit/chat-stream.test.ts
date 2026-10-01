import { onAiConsentRequired } from '@chefer/utils';
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
