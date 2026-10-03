import { isAiConsentRequiredError } from './ai-consent';

// The default "a mutation failed" policy shared by the mobile and web query
// clients (WP-02 / audit §6.3): every failed mutation tells the user, unless the
// call site already shows its own error UI and says so with `meta.silent`.

/** The typed `meta` a mutation may carry (`Register['mutationMeta']` in both apps). */
export type MutationMetaShape = { silent?: boolean };

function isUnauthorizedError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const { data } = error as { data?: { code?: unknown; httpStatus?: unknown } | null };
  return data?.code === 'UNAUTHORIZED' || data?.httpStatus === 401;
}

/**
 * Whether the default handler should surface `error`. Not for: a mutation that
 * opted out (`meta.silent`), a 401 (the app is signing the user out), or an AI
 * consent refusal (the consent sheet reopens instead).
 */
export function shouldNotifyMutationError(
  error: unknown,
  meta: Record<string, unknown> | undefined,
): boolean {
  if (meta?.['silent'] === true) return false;
  if (isUnauthorizedError(error)) return false;
  if (isAiConsentRequiredError(error)) return false;
  return true;
}
