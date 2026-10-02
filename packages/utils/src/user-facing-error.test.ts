import { describe, expect, it } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  isNetworkError,
  NETWORK_ERROR_MESSAGE,
  SERVER_ERROR_MESSAGE,
  userFacingErrorMessage,
} from './user-facing-error';

class FakeTrpcError extends Error {
  override name = 'TRPCClientError';
  data: { code?: string; httpStatus?: number } | null;
  constructor(message: string, data: { code?: string; httpStatus?: number } | null = null) {
    super(message);
    this.data = data;
  }
}

describe('userFacingErrorMessage', () => {
  it('maps the iOS transport failure from the App Review to the friendly line', () => {
    const err = new FakeTrpcError(
      'fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)',
    );
    expect(userFacingErrorMessage(err)).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('treats a TRPCClientError without server data as a network failure', () => {
    expect(userFacingErrorMessage(new FakeTrpcError('Something odd'))).toBe(NETWORK_ERROR_MESSAGE);
  });

  it.each(['Network request failed', 'Failed to fetch', 'The request timed out.', 'Load failed'])(
    'maps plain transport error "%s"',
    (message) => {
      expect(userFacingErrorMessage(new TypeError(message))).toBe(NETWORK_ERROR_MESSAGE);
      expect(isNetworkError(new TypeError(message))).toBe(true);
    },
  );

  it('maps internal 5xx errors to a generic server message', () => {
    const err = new FakeTrpcError('Unique constraint failed on the fields: (`id`)', {
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
    });
    expect(userFacingErrorMessage(err)).toBe(SERVER_ERROR_MESSAGE);
  });

  it('keeps real validation and auth messages', () => {
    expect(
      userFacingErrorMessage(
        new FakeTrpcError('Invalid email or password', { code: 'UNAUTHORIZED', httpStatus: 401 }),
      ),
    ).toBe('Invalid email or password');
    expect(
      userFacingErrorMessage(
        new FakeTrpcError('Password must be at least 8 characters', {
          code: 'BAD_REQUEST',
          httpStatus: 400,
        }),
      ),
    ).toBe('Password must be at least 8 characters');
  });

  it('keeps deliberate SERVICE_UNAVAILABLE copy', () => {
    const msg = 'The assistant is busy right now. Try again in a minute.';
    expect(
      userFacingErrorMessage(
        new FakeTrpcError(msg, { code: 'SERVICE_UNAVAILABLE', httpStatus: 503 }),
      ),
    ).toBe(msg);
  });

  it('keeps a validation message that merely mentions a timeout word', () => {
    const err = new FakeTrpcError('Timeout must be positive', {
      code: 'BAD_REQUEST',
      httpStatus: 400,
    });
    expect(userFacingErrorMessage(err)).toBe('Timeout must be positive');
  });

  it('falls back for non-errors and empty messages', () => {
    expect(userFacingErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
    expect(userFacingErrorMessage(undefined, 'Nope')).toBe('Nope');
    expect(userFacingErrorMessage(new Error(''), 'Nope')).toBe('Nope');
  });
});
