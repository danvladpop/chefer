import { createTRPCClient } from '@trpc/client';
import type { AppRouter } from '@chefer/api';
import { buildTrpcLinks } from '../../src/lib/trpc-links';

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

/**
 * A vanilla tRPC client wired through the app's own link builder — identical
 * headers, transformer, and batching to what ships on the phone.
 */
export function makeContractClient(): ContractClient {
  let token: string | null = null;
  const client = createTRPCClient<AppRouter>({
    links: buildTrpcLinks({
      url: `${API_URL}/trpc`,
      getToken: () => token,
    }),
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
