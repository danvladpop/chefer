'use client';

import { useState } from 'react';
import { useAppMode } from '@/features/nav/mode-context';
import { CheckInSettings } from '@/features/trainer/components/CheckInSettings';
import { InviteSheet } from '@/features/trainer/components/InviteSheet';
import { TrainerAlertsSettings } from '@/features/trainer/components/TrainerAlertsSettings';
import { TrainerSettings } from '@/features/trainer/components/TrainerSettings';
import { useTrainerStatus } from '@/features/trainer/use-trainer-status';
import { useT } from '@/lib/i18n';
import { ChevronRight, QrCode } from 'lucide-react';
import { COACHING_LIMITS } from '@chefer/types';
import { pressCard } from '@chefer/ui';
import { cn } from '@chefer/utils';

// ─── Trainer settings: trainer You on web (trainer-mode.md §6.8, M1) ──────────
// The trainer profile (name, gym line), invites (link + QR), availability
// (read-only: it closes on its own at the client limit, PRD Q16b), Send
// feedback and Turn off trainer tools. Profile, Help and the rest stay where
// they are for everyone (the nav's Profile and the user menu).

export function TrainerYou() {
  const { t } = useT();
  const status = useTrainerStatus();
  const { switchMode } = useAppMode();
  const [inviting, setInviting] = useState(false);
  const max = COACHING_LIMITS.maxActiveClients;
  const accepting = status.activeClients === null || status.activeClients < max;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="font-serif text-2xl font-bold text-gray-900">
        {t('nav.items.trainerSettings')}
      </h1>
      <TrainerSettings
        title={t('trainer.you.profile')}
        displayName={status.displayName ?? ''}
        gymLine={status.gymLine}
        activeClients={status.activeClients}
        // Tools off ends trainer mode: back to Food Today (§5.1).
        onTurnedOff={() => switchMode('food')}
      >
        <div className="flex flex-col gap-3 border-t pt-3">
          <button
            type="button"
            onClick={() => setInviting(true)}
            className={cn(
              'flex min-h-11 w-full items-center gap-3 rounded-xl text-left',
              // MO-01 card press.
              pressCard,
            )}
            data-testid="trainer-settings-invites"
          >
            <QrCode className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900">
                {t('trainer.you.invites')}
              </span>
              <span className="block text-xs text-gray-500">{t('trainer.you.invitesHint')}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
          </button>
          <div className="flex flex-col gap-0.5" data-testid="trainer-settings-availability">
            <h3 className="text-sm font-medium text-gray-700">{t('trainer.you.availability')}</h3>
            <p className="text-sm font-medium text-gray-900">
              {accepting ? t('trainer.you.accepting') : t('trainer.you.notAccepting', { max })}
            </p>
            <p className="text-xs text-gray-500">{t('trainer.you.availabilityHint')}</p>
          </div>
        </div>
      </TrainerSettings>
      <CheckInSettings />
      <TrainerAlertsSettings />
      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
