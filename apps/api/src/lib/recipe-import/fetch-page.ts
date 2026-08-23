import { TRPCError } from '@trpc/server';
import { assertSafeRemoteUrl } from './ssrf-guard.js';

// ─── Guarded page fetcher (F5 recipe import) ─────────────────────────────────
// Wraps global fetch with the SSRF guard, a hard byte cap enforced WHILE
// streaming (a Content-Length header can lie), a total timeout, and manual
// redirect handling so every hop is re-validated against the guard.

const MAX_HTML_BYTES = 1024 * 1024; // 1 MB
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'CheferBot/1.0 (recipe import; +https://chefer.app)';

const importError = (message: string): TRPCError => new TRPCError({ code: 'BAD_REQUEST', message });

/** Reads a response body up to `maxBytes`, throwing when the cap is hit. */
async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  // Node's fetch types the body stream loosely — pin the chunk type.
  const reader = response.body?.getReader() as ReadableStreamDefaultReader<Uint8Array> | undefined;
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw importError('That page is too large to import (over 1 MB).');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

export interface FetchedPage {
  html: string;
  /** URL after redirects — og:image and relative links resolve against this. */
  finalUrl: string;
}

/**
 * Fetches an HTML page for recipe extraction. Every URL (including each
 * redirect hop) passes the SSRF guard; the body is capped at 1 MB while
 * streaming; the whole operation shares one 10 s deadline.
 */
export async function fetchRecipePage(rawUrl: string): Promise<FetchedPage> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertSafeRemoteUrl(current);

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'accept-language': 'en',
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw importError('That page took too long to respond (10 s limit).');
      }
      throw importError('That page could not be fetched.');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location || hop === MAX_REDIRECTS) {
        throw importError('That page redirected too many times.');
      }
      current = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw importError(`That page could not be fetched (HTTP ${response.status}).`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      await response.body?.cancel().catch(() => undefined);
      throw importError('That link is not a web page — paste the recipe text instead.');
    }

    const html = await readBodyCapped(response, MAX_HTML_BYTES);
    return { html, finalUrl: url.toString() };
  }

  throw importError('That page redirected too many times.');
}

/**
 * HEAD-checks that a page's og:image actually serves an image (guarded like
 * any other outbound fetch). Any failure means "no usable image" — the caller
 * falls back to the Pollinations pipeline.
 */
export async function headCheckImage(rawUrl: string): Promise<boolean> {
  try {
    const signal = AbortSignal.timeout(5_000);
    let current = rawUrl;
    for (let hop = 0; hop < 2; hop++) {
      const url = await assertSafeRemoteUrl(current);
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        signal,
        headers: { 'user-agent': USER_AGENT },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return false;
        current = new URL(location, url).toString();
        continue;
      }
      return response.ok && (response.headers.get('content-type') ?? '').startsWith('image/');
    }
    return false;
  } catch {
    return false;
  }
}
