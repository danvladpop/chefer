'use client';

import { useSyncExternalStore } from 'react';
import { Toast } from '@chefer/ui';

// A tiny module-level toast for the gym (UX-44, T-44.5): the delete Undo must
// outlive the page that started it (deleting from a workout's page navigates
// away at once), so the host lives in the gym layout, not in the page. Same
// idea as the phone's snackbar store — one message at a time, newest wins.

export interface GymToast {
  id: number;
  message: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  durationMs: number;
  type: 'success' | 'error';
}

let current: GymToast | null = null;
let nextId = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function showGymToast(options: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
  type?: 'success' | 'error';
}): void {
  current = {
    id: ++nextId,
    message: options.message,
    actionLabel: options.actionLabel,
    onAction: options.onAction,
    durationMs: options.durationMs ?? (options.actionLabel ? 8000 : 4000),
    type: options.type ?? 'success',
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
export function resetGymToastForTests(): void {
  current = null;
  notify();
}

/** Mount once (the gym layout): renders the current toast, if any. */
export function GymToastHost() {
  const toast = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!toast) return null;
  return (
    <Toast
      key={toast.id}
      message={toast.message}
      type={toast.type}
      duration={toast.durationMs}
      onClose={() => dismiss(toast.id)}
      {...(toast.actionLabel
        ? {
            action: {
              label: toast.actionLabel,
              onClick: () => {
                toast.onAction?.();
                dismiss(toast.id);
              },
            },
          }
        : {})}
    />
  );
}
