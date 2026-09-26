import { DEFAULT_AI_PROVIDER_DISCLOSURE, type AiProviderDisclosure } from '@chefer/types';
import { toAiProviderDisclosure } from '@chefer/utils';
import { serverClient } from './trpc-server';

/**
 * The live AI provider set (profile.aiProviders) for server-rendered legal
 * copy — the privacy page and support FAQ name exactly who receives data.
 * Falls back to the standard set if the API is unreachable.
 */
export async function fetchAiProviderDisclosure(): Promise<AiProviderDisclosure> {
  try {
    return toAiProviderDisclosure(await serverClient.profile.aiProviders.query());
  } catch (err) {
    console.error('[privacy] could not load the AI provider set, using the default', err);
    return DEFAULT_AI_PROVIDER_DISCLOSURE;
  }
}
