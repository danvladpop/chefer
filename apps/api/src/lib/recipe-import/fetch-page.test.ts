import { describe, expect, it, vi } from 'vitest';
import { fetchRecipePage, headCheckImage } from './fetch-page.js';

// The pre-fetch check (`assertSafeRemoteUrl`, dns/promises) and the socket's
// own resolution (`guardedLookup`, callback dns) are mocked separately so a
// test can answer them differently — exactly what a DNS-rebinding host does.
const { lookupMock, lookupCallbackMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  lookupCallbackMock: vi.fn(),
}));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));
vi.mock('node:dns', () => ({ lookup: lookupCallbackMock }));

/** First resolution public (passes the guard), second private (the rebind). */
function rebindTo(privateIp: string): void {
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  lookupCallbackMock.mockImplementation(
    (
      _host: string,
      _opts: unknown,
      cb: (err: null, a: { address: string; family: number }[]) => void,
    ) => cb(null, [{ address: privateIp, family: 4 }]),
  );
}

describe('DNS rebinding between the guard and the connection', () => {
  it('fetchRecipePage refuses to connect when the second resolution is private', async () => {
    rebindTo('127.0.0.1');
    await expect(fetchRecipePage('http://rebind.example.com/recipe')).rejects.toThrow(
      /cannot be imported/i,
    );
    expect(lookupMock).toHaveBeenCalledWith('rebind.example.com', expect.anything());
    expect(lookupCallbackMock).toHaveBeenCalledWith(
      'rebind.example.com',
      expect.anything(),
      expect.any(Function),
    );
  });

  it('headCheckImage treats a rebound og:image host as unusable', async () => {
    rebindTo('169.254.169.254');
    await expect(headCheckImage('https://rebind.example.com/og.jpg')).resolves.toBe(false);
    expect(lookupCallbackMock).toHaveBeenCalled();
  });
});
