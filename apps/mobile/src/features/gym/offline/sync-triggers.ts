import { AppState, type AppStateStatus } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { outbox as appOutbox, type Outbox } from './outbox';

// When the outbox flushes (gym_plan.md §5.2): on regaining connectivity, on
// app foreground, right after each enqueue (inside outbox.enqueue), and every
// 30 s while anything is pending. Event triggers bypass the backoff window —
// they are new information; the ticker respects it.

export const OUTBOX_TICK_MS = 30_000;

export function startOutboxTriggers(outbox: Outbox = appOutbox): () => void {
  const flushNow = () => {
    void outbox.flush({ force: true });
  };

  const unsubscribeOnline = onlineManager.subscribe((online) => {
    if (online) flushNow();
  });
  const appState = AppState.addEventListener('change', (status: AppStateStatus) => {
    if (status === 'active') flushNow();
  });
  const ticker = setInterval(() => {
    if (outbox.getState().entries.some((entry) => !entry.parkedReason)) {
      void outbox.flush();
    }
  }, OUTBOX_TICK_MS);

  flushNow();
  return () => {
    unsubscribeOnline();
    appState.remove();
    clearInterval(ticker);
  };
}
