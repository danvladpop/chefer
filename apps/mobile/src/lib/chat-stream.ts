// Platform-free streaming client for POST /api/chat (M3-1). The app passes
// expo/fetch (RN's classic fetch cannot stream response bodies); the contract
// tests pass Node's global fetch. Both stream the same wire format: plain
// text chunks, with X-Chat-Quota-Exhausted: 1 signalling the quota gate.

import { AI_CONSENT_REQUIRED_REASON, CHAT_ACTIONS_HEADER } from '@chefer/types';
import { notifyAiConsentRequired } from '@chefer/utils';
import { reportUnauthorized, SESSION_EXPIRED_MESSAGE } from '../features/auth/session-expired';

export interface ChatMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * A chat request the server refused or failed. `status` lets the screen pick
 * friendly copy; `serverMessage` is set only when the server sent its own
 * sentence (a JSON `error`), never for the "Chat failed (502)" fallback.
 */
export class ChatStreamError extends Error {
  readonly status: number;
  readonly serverMessage: string | null;
  constructor(status: number, serverMessage: string | null) {
    super(serverMessage ?? `Chat failed (${status})`);
    this.name = 'ChatStreamError';
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

export interface StreamChatOptions {
  fetchImpl: typeof fetch;
  apiBaseUrl: string;
  getToken: () => string | null;
  messages: ChatMessageInput[];
  /** Called with each decoded text chunk as it arrives. */
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface StreamChatResult {
  fullText: string;
  /** True when the reply was the quota-exhausted message (upgrade moment). */
  quotaExhausted: boolean;
  /** UX-22 (T-22.2, AC4): the last user message read as a medical question. */
  healthTopic: boolean;
  /** UX-22 (T-22.2, AC4): the last user message read as an allergen/safety question. */
  safetyTopic: boolean;
}

export async function streamChat({
  fetchImpl,
  apiBaseUrl,
  getToken,
  messages,
  onChunk,
  signal,
}: StreamChatOptions): Promise<StreamChatResult> {
  const token = getToken();
  const res = await fetchImpl(`${apiBaseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-chefer-client': 'mobile',
      // UX-FOOD-21: ask for what the chef's tools did, appended after the text
      // (split off with `splitChatActions`). Older servers ignore the header.
      [CHAT_ACTIONS_HEADER]: '1',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
    ...(signal ? { signal } : {}),
  });

  if (res.status === 401) {
    // UX-ACC-10: same as a tRPC 401 — end the session and explain, instead of
    // surfacing the server's bare "Unauthorized".
    reportUnauthorized();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  if (!res.ok) {
    let serverMessage: string | null = null;
    try {
      const data = (await res.json()) as { error?: string; reason?: string };
      if (data.error) {
        serverMessage = data.error;
      }
      // R-10: the server has no AI consent on record — reopen the sheet.
      if (res.status === 403 && data.reason === AI_CONSENT_REQUIRED_REASON) {
        notifyAiConsentRequired('chat');
      }
    } catch {
      // Non-JSON error body — keep the status message.
    }
    throw new ChatStreamError(res.status, serverMessage);
  }

  const quotaExhausted = res.headers.get('x-chat-quota-exhausted') === '1';
  const healthTopic = res.headers.get('x-chat-health-topic') === '1';
  const safetyTopic = res.headers.get('x-chat-safety-topic') === '1';

  const body = res.body;
  if (!body) {
    // No streaming support in this runtime — fall back to buffered text.
    const text = await res.text();
    onChunk?.(text);
    return { fullText: text, quotaExhausted, healthTopic, safetyTopic };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      fullText += chunk;
      onChunk?.(chunk);
    }
  }
  return { fullText, quotaExhausted, healthTopic, safetyTopic };
}
