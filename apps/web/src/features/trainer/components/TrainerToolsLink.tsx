'use client';

import Link from 'next/link';
import { ChevronRight, UsersRound } from 'lucide-react';
import { COACHING_COPY } from '@chefer/types';
import { useTrainerStatus } from '../use-trainer-status';

/** Profile row → /trainer. Only for an account that may use (or already uses) trainer tools. */
export function TrainerToolsLink() {
  const { canBeTrainer, active, displayName } = useTrainerStatus();
  if (!canBeTrainer && !active) return null;
  return (
    <Link
      href="/trainer"
      className="flex min-h-11 items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:bg-neutral-50 sm:p-5"
      data-testid="profile-trainer-tools"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff3e8] text-[#944a00]">
        <UsersRound className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-gray-900">{COACHING_COPY.trainer.title}</span>
        <span className="block text-sm text-gray-600">
          {active
            ? `${COACHING_COPY.trainer.clients}${displayName ? ` · ${displayName}` : ''}`
            : COACHING_COPY.trainer.turnOnTitle}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
    </Link>
  );
}
