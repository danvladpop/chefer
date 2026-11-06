'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { AlertTriangle, Check, CloudOff, CloudUpload } from 'lucide-react';
import { createTranslator } from '@chefer/i18n';
import { cn, isNetworkError } from '@chefer/utils';
import { outbox, useOutboxStatus } from '../workout/outbox';

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/**
 * One line of sync truth for Today and the workout: all synced, workouts
 * waiting to upload (with a retry), or entries that need attention (linking
 * to gym settings, where they can be copied, retried or discarded).
 */
/**
 * UX-GYM-25: why the last upload failed, in a few plain words (never the raw
 * server text). Empty when the last attempt did not fail.
 */
export function syncFailureHint(
  lastError: string | null,
  t: ReturnType<typeof createTranslator>['t'] = createTranslator('en').t,
): string {
  if (!lastError) return '';
  return ` · ${
    isNetworkError(new Error(lastError))
      ? t('gym.shared.sync.cantReach')
      : t('gym.shared.sync.serverProblem')
  }`;
}

export function SyncIndicator({ className }: { className?: string }) {
  const { t } = useT();
  const status = useOutboxStatus();
  const online = useOnline();

  if (status.parked.length > 0) {
    return (
      <Link
        href="/gym/settings#needs-attention"
        data-testid="gym-sync-indicator"
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-amber-700 hover:bg-amber-50',
          className,
        )}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('gym.shared.sync.needAttention', { count: status.parked.length })}
      </Link>
    );
  }

  if (status.pending > 0) {
    return (
      <button
        type="button"
        data-testid="gym-sync-indicator"
        onClick={() => void outbox.flush({ force: true })}
        disabled={status.isFlushing}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-600 hover:bg-gray-100',
          className,
        )}
      >
        {online ? (
          <CloudUpload className="h-4 w-4 shrink-0 text-[#944a00]" aria-hidden="true" />
        ) : (
          <CloudOff className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        )}
        {status.isFlushing
          ? t('gym.shared.sync.uploading')
          : `${t('gym.shared.sync.waiting', { count: status.pending })}${syncFailureHint(status.lastError, t)} · ${
              online ? t('gym.shared.sync.syncNow') : t('gym.shared.sync.offline')
            }`}
      </button>
    );
  }

  return (
    <span
      data-testid="gym-sync-indicator"
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 px-2 text-xs text-gray-500',
        className,
      )}
    >
      {online ? (
        <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
      ) : (
        <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      {online ? t('gym.shared.sync.allSynced') : t('gym.shared.sync.offlineLogging')}
    </span>
  );
}
