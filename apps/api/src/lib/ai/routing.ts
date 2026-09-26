// ─── Per-workload provider routing (research §5.4 step 1) ─────────────────────
// Every IAIService call belongs to one workload; each workload has an ordered
// provider chain ("gemini>groq" = Gemini first, Groq on a capacity/413 error).
// The defaults below ARE today's routing table — an unset AI_ROUTE_* env var
// changes nothing. Env-free and pure so it can be unit-tested and reused by
// the eval harness.

/**
 * Provider names a route may use. `groq` is the OpenAI-compatible secondary
 * (AI_SECONDARY_*; Groq by default — the name stays `groq` even if the base
 * URL points elsewhere). `mock` is accepted by the eval harness only.
 */
export const AI_PROVIDER_NAMES = ['gemini', 'groq'] as const;
export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];
export type EvalProviderName = AiProviderName | 'mock';

export const AI_WORKLOADS = [
  'mealPlan',
  'swap',
  'cheferize',
  'importText',
  'vision',
  'chat',
  'review',
  'prices',
  'shopping',
] as const;
export type AiWorkload = (typeof AI_WORKLOADS)[number];

/** Env var per workload (all optional). */
export const AI_ROUTE_ENV_KEYS = {
  mealPlan: 'AI_ROUTE_MEAL_PLAN',
  swap: 'AI_ROUTE_SWAP',
  cheferize: 'AI_ROUTE_CHEFERIZE',
  importText: 'AI_ROUTE_IMPORT_TEXT',
  vision: 'AI_ROUTE_VISION',
  chat: 'AI_ROUTE_CHAT',
  review: 'AI_ROUTE_REVIEW',
  prices: 'AI_ROUTE_PRICES',
  shopping: 'AI_ROUTE_SHOPPING',
} as const satisfies Record<AiWorkload, string>;

/**
 * Today's table (failover.ts before the refactor):
 * - primary-first (quality-sensitive): plan, swap, cheferize, text import, review;
 * - secondary-first (cheap, high-volume): chat, prices, shopping list;
 * - vision (meal photo, photo import): Gemini only.
 * Video extraction is not a workload here: it is Gemini-only by design (no
 * OpenAI-compatible provider takes video input).
 */
export const DEFAULT_AI_ROUTES: Readonly<Record<AiWorkload, readonly AiProviderName[]>> = {
  mealPlan: ['gemini', 'groq'],
  swap: ['gemini', 'groq'],
  cheferize: ['gemini', 'groq'],
  importText: ['gemini', 'groq'],
  vision: ['gemini'],
  chat: ['groq', 'gemini'],
  review: ['gemini', 'groq'],
  prices: ['groq', 'gemini'],
  shopping: ['groq', 'gemini'],
};

/** Workloads shadow mode may sample. Chat is excluded: its tools write data. */
export const SHADOWABLE_WORKLOADS: readonly AiWorkload[] = AI_WORKLOADS.filter((w) => w !== 'chat');

/**
 * Parses "gemini>groq" into ['gemini', 'groq']. Throws a readable error on an
 * unknown name, an empty step or a repeated provider.
 */
export function parseChain<N extends string>(value: string, allowed: readonly N[]): N[] {
  const steps = value.split('>').map((s) => s.trim().toLowerCase());
  if (steps.length === 0 || steps.some((s) => s === '')) {
    throw new Error(`"${value}" is not a provider chain (use e.g. "gemini>groq")`);
  }
  const chain: N[] = [];
  for (const step of steps) {
    if (!(allowed as readonly string[]).includes(step)) {
      throw new Error(`unknown AI provider "${step}" (allowed: ${allowed.join(', ')})`);
    }
    if ((chain as string[]).includes(step)) {
      throw new Error(`provider "${step}" appears twice in "${value}"`);
    }
    chain.push(step as N);
  }
  return chain;
}

/** `true` when the value parses as a chain (for Zod refinements). */
export function isValidChain(value: string, allowed: readonly string[]): boolean {
  try {
    parseChain(value, allowed);
    return true;
  } catch {
    return false;
  }
}

export function isAiWorkload(value: string): value is AiWorkload {
  return (AI_WORKLOADS as readonly string[]).includes(value);
}

/**
 * Parses AI_SHADOW_ROUTE: "mealPlan:groq" or several comma-separated,
 * "mealPlan:groq,swap:groq>gemini". Throws on unknown workloads (chat
 * included — see SHADOWABLE_WORKLOADS) or bad chains.
 */
export function parseShadowRoutes(value: string): Map<AiWorkload, AiProviderName[]> {
  const routes = new Map<AiWorkload, AiProviderName[]>();
  for (const part of value.split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    const sep = entry.indexOf(':');
    if (sep <= 0) throw new Error(`"${entry}" must be <workload>:<chain>`);
    const workload = entry.slice(0, sep).trim();
    if (!isAiWorkload(workload) || !SHADOWABLE_WORKLOADS.includes(workload)) {
      throw new Error(
        `"${workload}" cannot be shadowed (allowed: ${SHADOWABLE_WORKLOADS.join(', ')})`,
      );
    }
    routes.set(workload, parseChain(entry.slice(sep + 1), AI_PROVIDER_NAMES));
  }
  return routes;
}

export type AiRouteTable = Record<AiWorkload, AiProviderName[]>;

/**
 * The effective chain per workload:
 * 1. start from the override (AI_ROUTE_*) or the default;
 * 2. drop providers that are not configured (no key) — with no secondary key,
 *    "gemini>groq" becomes "gemini", exactly today's no-failover behaviour;
 * 3. if nothing is left, fall back to every configured provider in
 *    `available` order (AI_PROVIDER=openai: all workloads on the secondary,
 *    as before).
 * `warn` receives a line for every override that had to be adjusted.
 */
export function resolveRoutes(
  overrides: Partial<Record<AiWorkload, AiProviderName[]>>,
  available: readonly AiProviderName[],
  warn: (message: string) => void = () => undefined,
): AiRouteTable {
  if (available.length === 0) throw new Error('resolveRoutes: no AI provider is configured');
  const table = {} as AiRouteTable;
  for (const workload of AI_WORKLOADS) {
    const override = overrides[workload];
    const wanted = override ?? DEFAULT_AI_ROUTES[workload];
    let chain = wanted.filter((p) => available.includes(p));
    if (override && chain.length < override.length) {
      warn(
        `${AI_ROUTE_ENV_KEYS[workload]}=${override.join('>')}: ${override
          .filter((p) => !available.includes(p))
          .join(', ')} not configured — using ${chain.length ? chain.join('>') : 'the fallback'}`,
      );
    }
    if (chain.length === 0) chain = [...available];
    table[workload] = chain;
  }
  return table;
}

/** Human-readable routing table for the startup log. */
export function describeRoutes(table: AiRouteTable): string {
  return AI_WORKLOADS.map((w) => `${w}=${table[w].join('>')}`).join(' ');
}
