import { useEffect } from 'react';
import { setShellMode, setTrainerModeAvailableCache } from './mode-store';
import { useLiveTrainerModeAvailability } from './use-trainer-mode';

/**
 * Renders nothing; mounted once in the root layout. Keeps the cached "trainer
 * mode available" answer in step with the live one for the next cold start,
 * and handles §5.1 "Losing trainer status" (tools turned off, removed from the
 * allowlist, flag off): the remembered mode falls back to personal. A screen
 * inside the (trainer) group redirects itself (app/(trainer)/_layout.tsx).
 */
export function TrainerModeHost({ signedIn }: { signedIn: boolean }) {
  return signedIn ? <TrainerModeSync /> : null;
}

function TrainerModeSync() {
  const live = useLiveTrainerModeAvailability();
  useEffect(() => {
    if (live === undefined) return;
    setTrainerModeAvailableCache(live);
    if (!live) setShellMode('personal');
  }, [live]);
  return null;
}
