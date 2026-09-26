// ─── Rate-limit helpers for OpenAI-compatible providers (Groq) ───────────────
// Pure and env-free. Groq enforces per-minute token budgets (free tier: 8,000
// TPM for openai/gpt-oss-120b, https://console.groq.com/docs/rate-limits,
// checked 2026-09-26) and reports them on every response:
//   x-ratelimit-limit-tokens      the TPM budget
//   x-ratelimit-remaining-tokens  what is left right now
//   x-ratelimit-reset-tokens      time until the budget is full again ("8.79s")
// On a 429 it sends `retry-after` (seconds) and also writes "Please try again
// in 6.2s" into the error body. These helpers turn both into milliseconds and
// estimate how long to wait before a call of a given size fits.

/**
 * Parses Groq/OpenAI duration strings into ms: "8.79s", "250ms", "1m2.5s",
 * "2h3m4s". Returns undefined when nothing parses.
 */
export function parseDurationMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text) * 1000; // bare seconds
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = false;
  for (const m of text.matchAll(re)) {
    matched = true;
    const n = Number(m[1]);
    switch (m[2]) {
      case 'ms':
        total += n;
        break;
      case 's':
        total += n * 1000;
        break;
      case 'm':
        total += n * 60_000;
        break;
      case 'h':
        total += n * 3_600_000;
        break;
    }
  }
  return matched ? Math.round(total) : undefined;
}

/** Reads Retry-After (seconds or an HTTP date) into ms. */
export function parseRetryAfterHeader(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/** "…Please try again in 6.2s…" / "try again in 1m3.5s" in an error body → ms. */
export function parseTryAgainIn(text: string): number | undefined {
  const m = /try again in ((?:\d+(?:\.\d+)?(?:ms|h|m|s))+)/i.exec(text);
  return m ? parseDurationMs(m[1]) : undefined;
}

/** The wait a 429 asks for: the Retry-After header first, else the body's hint. */
export function retryAfterFrom(headers: Headers, body: string): number | undefined {
  return parseRetryAfterHeader(headers.get('retry-after')) ?? parseTryAgainIn(body);
}

interface TokenSnapshot {
  limit: number;
  remaining: number;
  /** When the snapshot was taken (ms epoch). */
  at: number;
}

/**
 * The last TPM state an endpoint reported. Groq refills the token budget
 * continuously (limit per 60 s), so the tokens available now are the last
 * `remaining` plus what has refilled since, capped at the limit.
 */
export class TokenRateState {
  private snapshot: TokenSnapshot | undefined;

  constructor(private readonly now: () => number = Date.now) {}

  /** Records the x-ratelimit-* headers of a response (success or 429). */
  record(headers: Headers): void {
    const limitHeader = headers.get('x-ratelimit-limit-tokens');
    const remainingHeader = headers.get('x-ratelimit-remaining-tokens');
    if (limitHeader === null || remainingHeader === null) return;
    const limit = Number(limitHeader);
    const remaining = Number(remainingHeader);
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(remaining)) return;
    this.snapshot = { limit, remaining: Math.max(0, remaining), at: this.now() };
  }

  /** The endpoint's TPM budget, if it has told us. */
  get limit(): number | undefined {
    return this.snapshot?.limit;
  }

  /**
   * How long to wait (ms) before a call needing `tokens` fits the budget.
   * 0 when the state is unknown, when it fits now, or when it can never fit
   * (tokens > limit — waiting would not help; the call 413s or 429s anyway).
   */
  waitMsFor(tokens: number): number {
    const s = this.snapshot;
    if (!s || tokens > s.limit) return 0;
    const perMs = s.limit / 60_000;
    const available = Math.min(s.limit, s.remaining + (this.now() - s.at) * perMs);
    if (available >= tokens) return 0;
    return Math.ceil((tokens - available) / perMs);
  }
}
