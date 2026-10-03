import { ACCOUNT_EXISTS_MESSAGE, RESET_LINK_INVALID_MESSAGE } from '@chefer/types';

function errorParts(error: unknown): { code: string | undefined; message: string | undefined } {
  if (typeof error !== 'object' || error === null) return { code: undefined, message: undefined };
  const record = error as { message?: unknown; data?: { code?: unknown } | null };
  return {
    code: typeof record.data?.code === 'string' ? record.data.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
  };
}

/** UX-ACC-15: register's CONFLICT — the address already has an account. */
export function isAccountExistsError(error: unknown): boolean {
  const { code, message } = errorParts(error);
  return code === 'CONFLICT' || message === ACCOUNT_EXISTS_MESSAGE;
}

/** UX-ACC-09: the reset token is unknown, used or expired. */
export function isResetLinkInvalidError(error: unknown): boolean {
  return errorParts(error).message === RESET_LINK_INVALID_MESSAGE;
}
