import { describe, expect, it } from 'vitest';
import { AI_CONSENT_REQUIRED_REASON } from '@chefer/types';
import { shouldNotifyMutationError } from './mutation-errors';

describe('shouldNotifyMutationError', () => {
  const failure = { data: { code: 'BAD_REQUEST', httpStatus: 400 } };

  it('notifies by default', () => {
    expect(shouldNotifyMutationError(failure, undefined)).toBe(true);
    expect(shouldNotifyMutationError(failure, {})).toBe(true);
    expect(shouldNotifyMutationError(failure, { silent: false })).toBe(true);
  });

  it('stays quiet for meta.silent', () => {
    expect(shouldNotifyMutationError(failure, { silent: true })).toBe(false);
  });

  it('stays quiet for a 401 (the app signs the user out)', () => {
    expect(shouldNotifyMutationError({ data: { code: 'UNAUTHORIZED', httpStatus: 401 } }, {})).toBe(
      false,
    );
  });

  it('stays quiet when the AI consent sheet takes over', () => {
    expect(
      shouldNotifyMutationError(
        { data: { code: 'FORBIDDEN', reason: AI_CONSENT_REQUIRED_REASON } },
        {},
      ),
    ).toBe(false);
  });

  it('notifies for a network failure', () => {
    expect(shouldNotifyMutationError(new TypeError('Network request failed'), {})).toBe(true);
  });
});
