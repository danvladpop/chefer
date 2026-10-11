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

// R-10: the server-side AI consent check — real gate, enforcement on, and a
// consent cache that each test sets.
const consent = vi.hoisted(() => ({ at: null as Date | null }));
vi.mock('../lib/env.js', () => ({ env: { AI_CONSENT_ENFORCE: 'on' } }));
vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return { ...mod, userRepository: { findAiDataConsentAt: async () => consent.at } };
});

vi.mock('../application/chat/chat.service.js', () => ({
  chatService: { chat: vi.fn() },
}));

const { chatBodyParser, chatRouter, toChatMessages } = await import('./chat.router.js');
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
  // Mounted exactly like index.ts: the chat's own 64 KB parser BEFORE the
  // global 10 MB one, so the small limit is the one that applies.
  app.use('/api/chat', chatBodyParser);
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/chat', chatRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  consent.at = new Date();
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

describe('chatRouter — AI-data consent (R-10)', () => {
  it('answers 403 { error, reason } + X-AI-Consent-Required and never calls the chef without consent', async () => {
    consent.at = null;
    const res = await post('What should I cook tonight?');
    expect(res.status).toBe(403);
    expect(res.headers.get('x-ai-consent-required')).toBe('1');
    expect(await res.json()).toEqual({
      error: 'Allow AI features in Profile → AI & your data to use this.',
      reason: 'AI_CONSENT_REQUIRED',
    });
    expect(chatService.chat).not.toHaveBeenCalled();
  });

  it('streams normally once consent is on record', async () => {
    const res = await post('What should I cook tonight?');
    expect(res.status).toBe(200);
    expect(chatService.chat).toHaveBeenCalledTimes(1);
  });
});

describe('chatRouter — action trailer opt-in (UX-FOOD-21)', () => {
  it('asks the service for actions only when the client sends x-chefer-chat-actions: 1', async () => {
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] });
    const headers = { 'content-type': 'application/json' };
    await fetch(`${baseUrl}/api/chat`, { method: 'POST', headers, body });
    await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { ...headers, 'x-chefer-chat-actions': '1' },
      body,
    });
    const calls = vi.mocked(chatService.chat).mock.calls;
    expect(calls[0]?.[2]).toEqual({ withActions: false });
    expect(calls[1]?.[2]).toEqual({ withActions: true });
  });
});

describe('chatRouter — Phase 1 guardrails (message length, history, body size)', () => {
  it('rejects a message over 2,000 characters with 400 and a friendly sentence, never calling the chef', async () => {
    const res = await post('a'.repeat(2001));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'That message is too long. Keep it under 2,000 characters.',
    });
    expect(chatService.chat).not.toHaveBeenCalled();
  });

  it('accepts a message of exactly 2,000 characters', async () => {
    const res = await post('a'.repeat(2000));
    expect(res.status).toBe(200);
    expect(chatService.chat).toHaveBeenCalledTimes(1);
  });

  it('hands the model only the newest 12 messages', async () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }));
    messages.push({ role: 'user', content: 'last' });
    await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    const sent = vi.mocked(chatService.chat).mock.calls[0]?.[1] ?? [];
    expect(sent).toHaveLength(12);
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'last' });
    expect(sent[0]).toEqual({ role: 'assistant', content: 'm19' });
  });

  it('answers a body over 64 KB with 413 { error: string } — the global 10 MB parser never applies', async () => {
    const res = await post('a'.repeat(70 * 1024));
    expect(res.status).toBe(413);
    const data = (await res.json()) as { error?: unknown };
    expect(data.error).toBe(
      'This conversation is too long to send. Start a new chat and ask again.',
    );
    expect(chatService.chat).not.toHaveBeenCalled();
  });
});

describe('toChatMessages', () => {
  it('cuts earlier messages to 4,000 characters but leaves the last one whole', () => {
    const out = toChatMessages([
      { role: 'assistant', content: 'x'.repeat(5000) },
      { role: 'user', content: 'y'.repeat(2500) },
    ]);
    expect(out[0]?.content).toHaveLength(4000);
    expect(out[1]?.content).toHaveLength(2500);
  });

  it('drops empty messages and reads parts-based messages', () => {
    const out = toChatMessages([
      { role: 'user', content: '   ' },
      { role: 'user', parts: [{ type: 'text', text: 'hi' }, { type: 'step-start' }] },
    ]);
    expect(out).toEqual([{ role: 'user', content: 'hi' }]);
  });
});
