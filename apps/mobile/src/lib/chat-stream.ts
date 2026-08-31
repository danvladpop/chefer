// Platform-free streaming client for POST /api/chat (M3-1). The app passes
// expo/fetch (RN's classic fetch cannot stream response bodies); the contract
// tests pass Node's global fetch. Both stream the same wire format: plain
// text chunks, with X-Chat-Quota-Exhausted: 1 signalling the quota gate.

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
      const data = (await res.json()) as { error?: string };
      if (data.error) {
        message = data.error;
      }
    } catch {
      // Non-JSON error body — keep the status message.
    }
    throw new Error(message);
  }

  const quotaExhausted = res.headers.get('x-chat-quota-exhausted') === '1';

  const body = res.body;
  if (!body) {
    // No streaming support in this runtime — fall back to buffered text.
    const text = await res.text();
    onChunk?.(text);
    return { fullText: text, quotaExhausted };
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
  return { fullText, quotaExhausted };
}
