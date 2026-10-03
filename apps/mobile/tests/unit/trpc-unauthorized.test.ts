import { waitFor } from '@testing-library/react-native';
import { makeQueryClient } from '../../src/lib/trpc';

// UX-ACC-02: the 401 auto-sign-out used to only clear the token — the next
// account then saw the previous one's cache. The app (app/_layout.tsx) now injects
// the full signOut(); here we check the handler fires only for a real 401 while signed in.

let mockToken: string | null = 'token-a';
jest.mock('../../src/lib/auth-store', () => ({
  bindSessionQueryClient: jest.fn(),
  getToken: () => mockToken,
}));
const mockSignOut = jest.fn();

const unauthorized = Object.assign(new Error('UNAUTHORIZED'), {
  data: { code: 'UNAUTHORIZED', httpStatus: 401 },
});

beforeEach(() => {
  mockToken = 'token-a';
  mockSignOut.mockClear();
});

describe('makeQueryClient — 401 handling', () => {
  it('hands a request rejected as unauthenticated to the sign-out the app injected', async () => {
    const client = makeQueryClient({ onUnauthorized: mockSignOut });
    await client
      .getMutationCache()
      .build(client, { gcTime: Infinity, mutationFn: () => Promise.reject(unauthorized) })
      .execute(undefined)
      .catch(() => undefined);
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it('does the same for a failing query', async () => {
    const client = makeQueryClient({ onUnauthorized: mockSignOut });
    await client
      .fetchQuery({ queryKey: ['x'], queryFn: () => Promise.reject(unauthorized), retry: false })
      .catch(() => undefined);
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it('ignores a 401 when nobody is signed in', async () => {
    mockToken = null;
    const client = makeQueryClient({ onUnauthorized: mockSignOut });
    await client
      .getMutationCache()
      .build(client, { gcTime: Infinity, mutationFn: () => Promise.reject(unauthorized) })
      .execute(undefined)
      .catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
