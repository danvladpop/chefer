'use client';

import { useState } from 'react';
import type { LevelUp } from '@chefer/types';
import { Biscuit, CountUp, pressControl, Sheet } from '@chefer/ui';
import { biscuitLine, cn, levelLabel, PROGRESS_COPY } from '@chefer/utils';

// ─── Level up (mockup 04, lane C5) ────────────────────────────────────────────
// A `Sheet` (scrim + panel enter/exit with usePresence, MO-02). There is no
// confetti primitive on web, so the celebration is a CSS pop: the number
// scales and fades in on the bouncy spring (MO-14; the global reduced-motion
// rule flattens it) while it counts up (MO-06). Biscuit's line only when he's on.

export function LevelUpModal({
  levelUp,
  onClose,
  showBiscuit,
}: {
  /** The level-up to show; `null` keeps the modal closed (and animating out). */
  levelUp: LevelUp | null;
  onClose: () => void;
  showBiscuit: boolean;
}) {
  // Keep the last level-up on screen while the sheet animates out.
  const [last, setLast] = useState<LevelUp | null>(levelUp);
  if (levelUp && levelUp !== last) setLast(levelUp);
  const shown = levelUp ?? last;
  return (
    <Sheet
      open={levelUp !== null}
      onClose={onClose}
      title={PROGRESS_COPY.levelUpTitle}
      hideHeader
      size="sm"
    >
      {shown && (
        <div
          data-testid="level-up-modal"
          className="flex flex-col items-center gap-3 px-6 pb-6 pt-4 text-center"
        >
          <div className="flex animate-in flex-col items-center gap-2 duration-slow ease-spring-bouncy zoom-in-75 fade-in-0">
            <p
              className="text-xs font-semibold uppercase tracking-widest text-[#944a00]"
              aria-hidden="true"
            >
              {PROGRESS_COPY.levelUpTitle}
            </p>
            <div
              aria-hidden="true"
              className="flex h-24 w-24 items-center justify-center rounded-full bg-[#fff3e8] ring-4 ring-[#944a00]/30"
            >
              <CountUp value={shown.to} className="text-5xl font-bold text-[#944a00]" />
            </div>
            <p className="text-lg font-bold text-gray-900">
              {levelLabel(shown.to)} · {shown.rank.title}
            </p>
          </div>
          {showBiscuit && (
            <div className="flex items-center gap-2 rounded-full bg-[#fff3e8] py-1 pl-1 pr-4">
              <Biscuit loop="allSet" size={48} label={null} />
              <p className="min-w-0 text-left text-sm text-gray-800">
                {biscuitLine('levelUp', String(shown.to))}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className={cn(
              'flex min-h-12 w-full items-center justify-center rounded-control bg-[#944a00] px-6 text-base font-semibold text-white hover:bg-[#7a3d00]',
              pressControl,
            )}
          >
            {PROGRESS_COPY.levelUpContinue}
          </button>
        </div>
      )}
    </Sheet>
  );
}
