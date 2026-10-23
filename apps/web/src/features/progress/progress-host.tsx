'use client';

import { useEffect, useRef, useState } from 'react';
import { capture } from '@/lib/analytics';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import type { LevelUp } from '@chefer/types';
import { inboxKey, planInbox } from './inbox-plan';
import { LevelUpModal } from './level-up-modal';
import { useProgressSummary } from './use-progress';

// ─── The progress host (lane C5, mounted once in the dashboard layout) ────────
// Reads `progress.inbox` (refetched by the query client after `tracker.*`,
// `shoppingList.toggleItems`, `progress.finishCook` and a gym sync), shows what
// the user's celebration level allows, then acks — so it never repeats and the
// OFF level never piles up. Renders only the level-up modal.

const TOAST_MS = 4500;

export function ProgressHost() {
  const { enabled, summary } = useProgressSummary();
  const inbox = trpc.progress.inbox.useQuery(undefined, {
    enabled: enabled && summary !== undefined,
    retry: false,
  });
  const utils = trpc.useUtils();
  const ack = trpc.progress.ack.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.progress.inbox.invalidate();
    },
  });
  const { mutate: sendAck } = ack;
  const [levelUp, setLevelUp] = useState<LevelUp | null>(null);
  const handled = useRef<string | null>(null);

  const data = inbox.data;
  const settings = summary?.settings;
  const quiet = summary?.quiet ?? false;
  useEffect(() => {
    if (!data || !settings) return;
    const key = inboxKey(data);
    if (key === null || handled.current === key) return;
    handled.current = key;

    const plan = planInbox(data, {
      celebrations: settings.celebrations,
      showXp: settings.showXp,
      quiet,
    });
    if (plan.toast) showAppToast({ message: plan.toast, type: 'success', durationMs: TOAST_MS });
    if (plan.levelUp) setLevelUp(plan.levelUp);
    if (data.levelUp) {
      capture('progress_level_up', {
        level: data.levelUp.to,
        rankChanged: data.levelUp.rankChanged,
      });
    }

    // Always ack, even at OFF: "Off still saves your XP and badges, just quietly".
    sendAck({
      upTo: data.cursor,
      unlockIds: data.unlocks.map((u) => u.id),
      ...(data.levelUp && { level: data.levelUp.to }),
    });
  }, [data, settings, quiet, sendAck]);

  if (!enabled) return null;
  return (
    <LevelUpModal
      levelUp={levelUp}
      onClose={() => setLevelUp(null)}
      showBiscuit={settings?.biscuit === true && !quiet}
    />
  );
}
