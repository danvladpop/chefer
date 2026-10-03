'use client';

import { useSyncExternalStore } from 'react';
import { Toast } from '@chefer/ui';

// The app-wide toast (WP-02, audit §6.3): a tiny module-level store — one
// message at a time, newest wins — plus one host mounted in the tRPC provider.
// The query client's default mutation-failure handler (lib/trpc.ts) lives
// outside React, so it needs an imperative `showAppToast`. Same shape as the
// phone's snackbar store and the gym's own toast (features/gym/shared).

export interface AppToast {
  id: number;
  message: string;
  type: 'success' | 'error';
  durationMs: number;
  /** Optional inline action ("Undo"). */
  action?: { label: string; onClick: () => void };
}

let current: AppToast | null = null;
let nextId = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function showAppToast(options: {
  message: string;
  type?: 'success' | 'error';
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}): void {
  current = {
    id: ++nextId,
    message: options.message,
    type: options.type ?? 'error',
    durationMs: options.durationMs ?? 6000,
    ...(options.action && { action: options.action }),
  };
  notify();
}

function dismiss(id: number): void {
  if (current?.id === id) {
    current = null;
    notify();
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => current;
const getServerSnapshot = () => null;

/** Test seam. */
export function resetAppToastForTests(): void {
  current = null;
  notify();
}

/** Mount once (TRPCProvider): renders the current toast, if any. */
export function AppToastHost() {
  const toast = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!toast) return null;
  return (
    <Toast
      key={toast.id}
      message={toast.message}
      type={toast.type}
      duration={toast.durationMs}
      onClose={() => dismiss(toast.id)}
      {...(toast.action && {
        action: {
          label: toast.action.label,
          onClick: () => {
            toast.action?.onClick();
            dismiss(toast.id);
          },
        },
      })}
    />
  );
}
