import type { PackagedProductData } from '@chefer/database';
import { env } from '../env.js';
import { normaliseOffProduct } from './normalise.js';

// ─── Open Food Facts v2 client (ADR 0002) ─────────────────────────────────────
// One read: GET /api/v2/product/{barcode}. OFF's terms ask every client to
// send a User-Agent that names it, and cap product reads at 100 a minute per
// IP — this client stays at 60 (one API process serves every user), refuses
// beyond that without calling OFF, and remembers misses for a day so a user
// re-scanning an unknown barcode doesn't spend the budget again.

const PRODUCT_FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'generic_name',
  'brands',
  'nutriments',
  'serving_quantity',
  'serving_quantity_unit',
  'allergens_tags',
  'traces_tags',
  'states_tags',
  'ingredients_text',
  'image_front_small_url',
].join(',');

const REQUESTS_PER_MINUTE = 60;
const TIMEOUT_MS = 8000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_CACHE_MAX = 5000;

export type OffLookup =
  | { found: true; product: PackagedProductData & { barcode: string } }
  | { found: false };

/** OFF couldn't answer (rate limit, timeout, 5xx). The caller falls back to its cache or a friendly error. */
export class OffUnavailableError extends Error {
  constructor(reason: string) {
    super(`Open Food Facts unavailable: ${reason}`);
    this.name = 'OffUnavailableError';
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class OpenFoodFactsClient {
  private readonly calls: number[] = [];
  private readonly misses = new Map<string, number>();

  constructor(
    private readonly options: {
      baseUrl: string;
      userAgent: string;
      fetchImpl?: FetchLike;
      now?: () => number;
    },
  ) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /** Sliding one-minute window; true when this call may go out. */
  private takeSlot(): boolean {
    const cutoff = this.now() - 60_000;
    while (this.calls.length > 0 && this.calls[0]! <= cutoff) this.calls.shift();
    if (this.calls.length >= REQUESTS_PER_MINUTE) return false;
    this.calls.push(this.now());
    return true;
  }

  private rememberMiss(barcode: string): void {
    if (this.misses.size >= MISS_CACHE_MAX) {
      const oldest = this.misses.keys().next().value;
      if (oldest !== undefined) this.misses.delete(oldest);
    }
    this.misses.set(barcode, this.now() + MISS_TTL_MS);
  }

  async lookup(barcode: string): Promise<OffLookup> {
    const missUntil = this.misses.get(barcode);
    if (missUntil !== undefined && missUntil > this.now()) return { found: false };
    if (!this.takeSlot()) throw new OffUnavailableError('local rate limit');

    const url = `${this.options.baseUrl.replace(/\/$/, '')}/api/v2/product/${encodeURIComponent(barcode)}?fields=${PRODUCT_FIELDS}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await (this.options.fetchImpl ?? fetch)(url, {
        headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      throw new OffUnavailableError(controller.signal.aborted ? 'timeout' : String(err));
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429 || res.status >= 500) {
      throw new OffUnavailableError(`HTTP ${res.status}`);
    }
    const body = (await res.json().catch(() => null)) as {
      status?: number;
      product?: unknown;
    } | null;
    // v2 answers an unknown barcode with 404 + { status: 0 }.
    if (res.status === 404 || body?.status !== 1 || !body.product) {
      if (res.ok || res.status === 404) {
        this.rememberMiss(barcode);
        return { found: false };
      }
      throw new OffUnavailableError(`HTTP ${res.status}`);
    }
    return { found: true, product: normaliseOffProduct(barcode, body.product) };
  }
}

export const openFoodFacts = new OpenFoodFactsClient({
  baseUrl: env.OFF_BASE_URL,
  userAgent: env.OFF_USER_AGENT,
});
