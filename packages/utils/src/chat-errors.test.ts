import { describe, expect, it } from 'vitest';
import {
  CHAT_NOT_SENT_MESSAGE,
  CHAT_SESSION_EXPIRED_MESSAGE,
  CHAT_SLOW_DOWN_MESSAGE,
  chatFailureMessage,
  CHEF_BUSY_MESSAGE,
  CHEF_UNAVAILABLE_MESSAGE,
} from './chat-errors';
import { NETWORK_ERROR_MESSAGE } from './user-facing-error';

describe('chatFailureMessage (UX-FOOD-21)', () => {
  it('never shows the raw "Chat failed (502)" or a bare Unauthorized', () => {
    expect(chatFailureMessage({ status: 502 })).toBe(CHEF_UNAVAILABLE_MESSAGE);
    expect(chatFailureMessage({ status: 401, serverMessage: 'Unauthorized' })).toBe(
      CHAT_SESSION_EXPIRED_MESSAGE,
    );
  });

  it('maps statuses to what to do next', () => {
    expect(chatFailureMessage({ status: 429 })).toBe(CHAT_SLOW_DOWN_MESSAGE);
    expect(chatFailureMessage({ status: 503 })).toBe(CHEF_BUSY_MESSAGE);
    expect(chatFailureMessage({ status: 500 })).toBe(CHEF_UNAVAILABLE_MESSAGE);
    expect(chatFailureMessage({ status: 400 })).toBe(CHAT_NOT_SENT_MESSAGE);
  });

  it('keeps the server’s own sentence when it sent one', () => {
    expect(chatFailureMessage({ status: 503, serverMessage: 'Over capacity, try later.' })).toBe(
      'Over capacity, try later.',
    );
  });

  it('a request that never got a response reads as offline, or a calm fallback', () => {
    expect(chatFailureMessage({ error: new TypeError('Network request failed') })).toBe(
      NETWORK_ERROR_MESSAGE,
    );
    expect(chatFailureMessage({ error: undefined })).toBe(CHEF_UNAVAILABLE_MESSAGE);
  });
});
