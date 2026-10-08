import { describe, expect, it } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  humaniseFieldPath,
  isNetworkError,
  NETWORK_ERROR_MESSAGE,
  parseIssuesFromMessage,
  SERVER_ERROR_MESSAGE,
  userFacingErrorMessage,
  VALIDATION_ERROR_MESSAGE,
} from './user-facing-error';

// Real `ZodError#message` payloads (zod 3: JSON.stringify(issues, null, 2)) —
// what a tRPC BAD_REQUEST carries when an input schema rejects.
const ZOD_TOO_BIG_WEIGHT =
  '[\n  {\n    "code": "too_big",\n    "maximum": 1000,\n    "type": "number",\n    "inclusive": true,\n    "exact": false,\n    "message": "Number must be less than or equal to 1000",\n    "path": [\n      "weightKg"\n    ]\n  }\n]';
const ZOD_NESTED_REPS =
  '[\n  {\n    "code": "too_big",\n    "maximum": 500,\n    "type": "number",\n    "inclusive": true,\n    "exact": false,\n    "message": "Number must be less than or equal to 500",\n    "path": [\n      "items",\n      0,\n      "reps"\n    ]\n  }\n]';
const ZOD_INVALID_URL =
  '[\n  {\n    "validation": "url",\n    "code": "invalid_string",\n    "message": "Invalid url",\n    "path": []\n  }\n]';
const ZOD_REQUIRED =
  '[\n  {\n    "code": "invalid_type",\n    "expected": "number",\n    "received": "undefined",\n    "path": [\n      "weightKg"\n    ],\n    "message": "Required"\n  },\n  {\n    "code": "invalid_type",\n    "expected": "string",\n    "received": "undefined",\n    "path": [\n      "name"\n    ],\n    "message": "Required"\n  }\n]';

const badRequest = (message: string) =>
  new FakeTrpcError(message, { code: 'BAD_REQUEST', httpStatus: 400 });

class FakeTrpcError extends Error {
  override name = 'TRPCClientError';
  data: { code?: string; httpStatus?: number } | null;
  constructor(message: string, data: { code?: string; httpStatus?: number } | null = null) {
    super(message);
    this.data = data;
  }
}

describe('userFacingErrorMessage: Zod issue JSON (UX-X-06)', () => {
  it('names the field from the first issue and drops the unit suffix', () => {
    expect(userFacingErrorMessage(badRequest(ZOD_TOO_BIG_WEIGHT))).toBe(
      'Check the value you entered for weight.',
    );
  });

  it('uses the last string segment of a nested path', () => {
    expect(userFacingErrorMessage(badRequest(ZOD_NESTED_REPS))).toBe(
      'Check the value you entered for reps.',
    );
  });

  it('omits the field when the issue has no path (a bad URL)', () => {
    expect(userFacingErrorMessage(badRequest(ZOD_INVALID_URL))).toBe(VALIDATION_ERROR_MESSAGE);
  });

  it('never leaks JSON, whatever the issue shape', () => {
    for (const payload of [ZOD_TOO_BIG_WEIGHT, ZOD_NESTED_REPS, ZOD_INVALID_URL, ZOD_REQUIRED]) {
      const text = userFacingErrorMessage(badRequest(payload));
      expect(text).not.toMatch(/[[\]{}"]|code|too_big/);
    }
  });

  it('treats truncated / non-parsing issue JSON as technical too', () => {
    expect(userFacingErrorMessage(badRequest('[{"code":"too_big","maximum":10'))).toBe(
      VALIDATION_ERROR_MESSAGE,
    );
  });

  it('lets a caller supply its own sentence for the issues', () => {
    const text = userFacingErrorMessage(badRequest(ZOD_TOO_BIG_WEIGHT), undefined, {
      describeIssues: (issues) => `custom:${String(issues.length)}`,
    });
    expect(text).toBe('custom:1');
  });

  it('leaves prose that merely starts with a bracket-free word alone', () => {
    expect(userFacingErrorMessage(badRequest('Name is already taken'))).toBe(
      'Name is already taken',
    );
    expect(parseIssuesFromMessage('Name is already taken')).toBeNull();
  });

  it('still maps a network failure first', () => {
    expect(userFacingErrorMessage(new TypeError('Network request failed'))).toBe(
      NETWORK_ERROR_MESSAGE,
    );
  });
});

describe('humaniseFieldPath', () => {
  it.each([
    [['weightKg'], 'weight'],
    [['servingSizeG'], 'serving size g'],
    [['restSeconds'], 'rest seconds'],
    [['recipeId'], 'recipe'],
    [['items', 0, 'reps'], 'reps'],
    [[], null],
    [[0], null],
    ['nope', null],
  ])('%j → %s', (path, expected) => {
    expect(humaniseFieldPath(path)).toBe(expected);
  });
});

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
