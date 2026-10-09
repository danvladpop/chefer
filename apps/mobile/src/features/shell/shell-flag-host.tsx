import { trpc } from '../../lib/trpc';
import { useSyncShellV2Flag } from './shell-store';

/**
 * Renders nothing; keeps the cached `mobileShellV2` flag in step with
 * `profile.flags`. Reads the raw answer (not `useFlags()`, which reads a
 * pending query as "every flag off") so a slow launch never flips the shell.
 */
export function ShellFlagHost({ signedIn }: { signedIn: boolean }) {
  const { data } = trpc.profile.flags.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
    enabled: signedIn,
  });
  useSyncShellV2Flag(data?.mobileShellV2);
  return null;
}
