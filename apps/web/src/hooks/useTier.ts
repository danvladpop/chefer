'use client';

import { trpc } from '@/lib/trpc';
import { tierOf, type Tier } from '@chefer/utils';

/** The user's tier (GLOSSARY), `undefined` while loading. Mirror of the mobile `useTier`. */
export function useTier(): Tier | undefined {
  const { data: user } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  return user ? tierOf(user) : undefined;
}
