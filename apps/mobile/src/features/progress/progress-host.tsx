import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { LevelUp, ProgressInbox } from '@chefer/types';
import { showSnackbar } from '@chefer/ui-mobile';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';
import { flushCookQueue } from './cook-queue';
import { useGentleReminder } from './gentle-reminder';
import { LevelUpModal } from './level-up-modal';
import { invalidateProgress } from './progress-signals';
import { planInbox } from './route-inbox';
import { useProgressSummary } from './use-progress';

// ProgressHost (build-plan.md Lane C §5): mounted once in the root layout,
// inside the tRPC and query providers. It does three things.
//  1. ALWAYS (signed in, gate or not): retries cook finishes that could not be
//     sent (cook-queue.ts) at launch and on every foreground — the cook is
//     recorded for everyone (D1).
//  2. When Kitchen progress is on: turns the inbox into what the user's
//     celebration level allows (route-inbox.ts) and acks it. The inbox is
//     refetched after the mutations in progress-signals.ts and the gym sync.
//  3. When it is on: keeps the gentle reminder scheduled (gentle-reminder.ts).
// With the gate off nothing is read and nothing is shown.

/** Gap between queued snackbars, so each one is readable (the bar shows one at a time). */
const SNACKBAR_GAP_MS = 3200;

function useCookQueueFlush(): void {
  const utils = trpc.useUtils();
  const client = useQueryClient();
  useEffect(() => {
    const run = () => {
      void flushCookQueue((input) => utils.client.progress.finishCook.mutate(input)).then((n) => {
        if (n > 0) invalidateProgress(client);
      });
    };
    run();
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') run();
    });
    return () => sub.remove();
  }, [utils, client]);
}

function ProgressHostInner(): React.ReactElement | null {
  useCookQueueFlush();
  const { enabled, summary } = useProgressSummary();
  const inbox = trpc.progress.inbox.useQuery(undefined, {
    enabled: enabled && summary !== undefined,
    staleTime: 0,
  });
  const ack = trpc.progress.ack.useMutation({ meta: { silent: true } });
  const [modal, setModal] = useState<LevelUp | null>(null);

  useGentleReminder(summary?.settings.reminder ?? null, enabled);

  // What this device has already handled, so a refetch before the ack lands (or a
  // failed ack) never shows the same thing twice.
  const handled = useRef({ receipts: new Set<string>(), unlocks: new Set<string>(), level: 0 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  const sendMessages = useCallback((messages: string[]) => {
    messages.forEach((message, i) => {
      if (i === 0) {
        showSnackbar({ message });
        return;
      }
      timers.current.push(setTimeout(() => showSnackbar({ message }), i * SNACKBAR_GAP_MS));
    });
  }, []);

  const data: ProgressInbox | undefined = inbox.data;
  const settings = summary?.settings;
  const quiet = summary?.quiet ?? false;
  useEffect(() => {
    if (!enabled || !data || !settings) return;
    const seen = handled.current;
    const fresh: ProgressInbox = {
      ...data,
      receipts: data.receipts.filter((r) => !seen.receipts.has(r.id)),
      unlocks: data.unlocks.filter((u) => !seen.unlocks.has(u.id)),
      levelUp: data.levelUp && data.levelUp.to > seen.level ? data.levelUp : null,
    };
    const plan = planInbox(fresh, {
      celebrations: settings.celebrations,
      showXp: settings.showXp,
      quiet,
    });
    if (plan.ack === null) return;
    for (const r of fresh.receipts) seen.receipts.add(r.id);
    for (const u of fresh.unlocks) seen.unlocks.add(u.id);
    if (fresh.levelUp) {
      seen.level = fresh.levelUp.to;
      track('progress_level_up', {
        level: fresh.levelUp.to,
        rankChanged: fresh.levelUp.rankChanged,
      });
    }
    sendMessages(plan.messages);
    if (plan.levelUpModal) setModal(plan.levelUpModal);
    ack.mutate(plan.ack);
    // `ack` and `sendMessages` are stable enough; the inbox and settings drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, data, settings?.celebrations, settings?.showXp, quiet]);

  return (
    <LevelUpModal
      levelUp={modal}
      nextRank={summary?.nextRank ?? null}
      biscuit={(settings?.biscuit ?? false) && !quiet}
      onClose={() => {
        if (modal) ack.mutate({ level: modal.to });
        setModal(null);
      }}
    />
  );
}

export function ProgressHost({ signedIn }: { signedIn: boolean }): React.ReactElement | null {
  return signedIn ? <ProgressHostInner /> : null;
}
