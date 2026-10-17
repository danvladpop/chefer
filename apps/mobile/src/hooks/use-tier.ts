import { tierOf, type Tier } from '@chefer/utils';
import { trpc } from '../lib/trpc';

/** The user's tier (GLOSSARY), `undefined` while loading. Mirror of apps/web/src/hooks/useTier.ts. */
export function useTier(): Tier | undefined {
  const { data: user } = trpc.auth.me.useQuery(undefined, { staleTime: 30_000 });
  return user ? tierOf(user) : undefined;
}
