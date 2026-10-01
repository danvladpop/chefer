import { trpc } from '@/lib/trpc';
import type { AiProviderDisclosure } from '@chefer/types';
import { toAiProviderDisclosure } from '@chefer/utils';

/**
 * Which AI providers receive user data right now (profile.aiProviders), for
 * the consent sheet and the profile toggle. Until the server answers — and
 * when it fails, or on a server that predates the procedure — the default is
 * the set production runs (Groq, backed up by Cloudflare Workers AI), never
 * the legacy Gemini one (R-10). A failed request is retried (the query
 * client's default: up to 3 times, not on a 4xx), and again on the next mount.
 */
export function useAiProviderDisclosure(): AiProviderDisclosure {
  const { data } = trpc.profile.aiProviders.useQuery(undefined, {
    staleTime: Infinity,
  });
  return toAiProviderDisclosure(data);
}
