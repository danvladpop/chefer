// Platform-free streaming client for POST /api/chat (M3-1). The app passes
// expo/fetch (RN's classic fetch cannot stream response bodies); the contract
// tests pass Node's global fetch. Both stream the same wire format: plain
// text chunks, with X-Chat-Quota-Exhausted: 1 signalling the quota gate.

import { AI_CONSENT_REQUIRED_REASON } from '@chefer/types';
import { notifyAiConsentRequired } from '@chefer/utils';

export interface ChatMessageInput {
  role: 'user' | 'assistant';
  content: string;
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
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
    ...(signal ? { signal } : {}),
  });

  if (!res.ok) {
    let message = `Chat failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string; reason?: string };
      if (data.error) {
        message = data.error;
      }
      // R-10: the server has no AI consent on record — reopen the sheet.
      if (res.status === 403 && data.reason === AI_CONSENT_REQUIRED_REASON) {
        notifyAiConsentRequired('chat');
      }
    } catch {
      // Non-JSON error body — keep the status message.
    }
    throw new Error(message);
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
