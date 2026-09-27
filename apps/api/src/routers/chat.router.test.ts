import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// UX-22 (T-22.2, AC4): the last user message is classified and the flag
// headers are set BEFORE the (mocked, real-AI-free) stream starts — an
// end-to-end Express test of the router, in the same style as
// uploads.router.test.ts, rather than a unit test of the classifier alone
// (that lives in packages/utils/src/health-topic.test.ts).

vi.mock('../lib/session-auth.js', () => ({
  resolveRequestAuth: vi.fn().mockResolvedValue({ user: { id: 'u1' }, sessionToken: 't1' }),
}));

vi.mock('../application/chat/chat.service.js', () => ({
  chatService: { chat: vi.fn() },
}));

const { chatRouter } = await import('./chat.router.js');
const { chatService } = await import('../application/chat/chat.service.js');

function textStream(text: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  vi.mocked(chatService.chat).mockReset().mockResolvedValue(textStream('A roux is flour and fat.'));
});

async function post(content: string) {
  return fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content }] }),
  });
}

describe('chatRouter — health/safety topic headers (T-22.2)', () => {
  it('sets X-Chat-Health-Topic for a medical question', async () => {
    const res = await post('Is this okay for someone with diabetes?');
    expect(res.headers.get('x-chat-health-topic')).toBe('1');
    expect(res.headers.get('x-chat-safety-topic')).toBeNull();
  });

  it('sets X-Chat-Safety-Topic for an allergen question', async () => {
    const res = await post('Is this recipe gluten-free?');
    expect(res.headers.get('x-chat-safety-topic')).toBe('1');
    expect(res.headers.get('x-chat-health-topic')).toBeNull();
  });

  it('sets neither header for an ordinary cooking question', async () => {
    const res = await post('What should I cook tonight?');
    expect(res.headers.get('x-chat-health-topic')).toBeNull();
    expect(res.headers.get('x-chat-safety-topic')).toBeNull();
  });

  it('classifies the LAST user message, not an earlier one', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Is this gluten-free?' },
          { role: 'assistant', content: 'Yes, it is.' },
          { role: 'user', content: 'Great, what should I cook tonight?' },
        ],
      }),
    });
    expect(res.headers.get('x-chat-safety-topic')).toBeNull();
  });
});
