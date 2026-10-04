import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@chefer/api';
import { CURRENT_TERMS_VERSION } from '@chefer/types';
import { buildAuthHeaders, buildTrpcLinks } from '../../src/lib/trpc-links';

export const API_URL = process.env.CHEFER_API_URL ?? 'http://localhost:3001';

// Seeded dev account (CLAUDE.md). Read-only usage here — tests that mutate
// state must register their own throwaway user instead.
export const SEED_EMAIL = 'alice@chefer.dev';
export const SEED_PASSWORD = 'User@123!';

export interface ContractClient {
  client: ReturnType<typeof createTRPCClient<AppRouter>>;
  setToken: (token: string | null) => void;
  getToken: () => string | null;
}

export interface ContractClientOptions {
  /**
   * Send this `x-chefer-api-level` instead of the one the app ships (trainer
   * coaching tests: 6 = a coaching bundle, 4 = an installed 1.0.1 binary).
   * Omitted = exactly the app's own header.
   */
  apiLevel?: number;
}

/**
 * A vanilla tRPC client wired through the app's own link builder — identical
 * headers, transformer, and batching to what ships on the phone.
 */
export function makeContractClient(options: ContractClientOptions = {}): ContractClient {
  let token: string | null = null;
  const { apiLevel } = options;
  const client = createTRPCClient<AppRouter>({
    links:
      apiLevel === undefined
        ? buildTrpcLinks({
            url: `${API_URL}/trpc`,
            getToken: () => token,
          })
        : [
            httpBatchLink({
              transformer: superjson,
              url: `${API_URL}/trpc`,
              headers: () => ({
                ...buildAuthHeaders(() => token),
                'x-chefer-api-level': String(apiLevel),
              }),
            }),
          ],
  });
  return {
    client,
    setToken: (next) => {
      token = next;
    },
    getToken: () => token,
  };
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@contract.chefer.dev`;
}

/**
 * T-39.1 / T-26.5: `makeContractClient()` uses the real `buildTrpcLinks`, so
 * it sends `x-chefer-api-level` exactly like the shipped app (3, as of
 * T-42.3) — which means `auth.register` now requires explicit consent here
 * too (that gate is `>= 2`, so still satisfied), the same as the real
 * register screen sends. Spread this into every contract-test register call
 * (`client.auth.register.mutate({ email, password, ...CONTRACT_CONSENT })`).
 */
export const CONTRACT_CONSENT = {
  acceptedTerms: true,
  ageConfirmed: true,
  acceptedTermsVersion: CURRENT_TERMS_VERSION,
} as const;
