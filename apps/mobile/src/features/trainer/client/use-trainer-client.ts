import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { firstNameOf } from '../format';

/**
 * The client's display name for headers and labels ("Note for Maria"), read from the clients list the
 * home screen already loaded (same query key, so normally a cache hit). Falls back to "Client".
 * `keepItSimple`: the row says the client trains in "Keep it simple" (PRD 2026-10 §4.3).
 */
export function useTrainerClientName(clientId: string): {
  name: string;
  firstName: string;
  keepItSimple: boolean;
} {
  const list = trpc.trainer.clients.list.useQuery({ today: localDate() });
  const row = list.data?.find((c) => c.clientId === clientId);
  const name = row?.name ?? 'Client';
  return { name, firstName: firstNameOf(name), keepItSimple: row?.keepItSimple === true };
}

/** True for the API's uniform "This client isn't available" (NOT_FOUND): removed, left, or never yours. */
export function isClientUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const code = (error as { data?: { code?: string } }).data?.code;
  return code === 'NOT_FOUND';
}
