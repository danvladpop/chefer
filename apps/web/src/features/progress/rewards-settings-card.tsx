'use client';

import { useId } from 'react';
import { trpc } from '@/lib/trpc';
import type { CelebrationLevel, ProgressSettingsPatch, ProgressSummary } from '@chefer/types';
import { pressControl, Switch } from '@chefer/ui';
import { cn, localDateStr, PROGRESS_COPY } from '@chefer/utils';
import { WeeklyGoalSelect } from './flame-sheet';
import { PauseFlameCard } from './pause-flame-card';
import { useProgressSummary } from './use-progress';

// ─── Rewards & motivation (mockup 12, lane C11) ───────────────────────────────
// A card on /preferences: celebrations (Full party / Subtle / Off), the XP,
// Biscuit and flame-on-Today switches, the weekly goal and pause/resume. No
// reminder row on web (no web push). Changes apply at once (optimistic, rolled
// back if the save fails); renders nothing while the gate is off.

const LEVELS: { value: CelebrationLevel; label: string }[] = [
  { value: 'FULL', label: PROGRESS_COPY.celebrationsFull },
  { value: 'SUBTLE', label: PROGRESS_COPY.celebrationsSubtle },
  { value: 'OFF', label: PROGRESS_COPY.celebrationsOff },
];

function ToggleRow({
  title,
  body,
  checked,
  onChange,
}: {
  title: string;
  body: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p id={id} className="text-sm font-semibold text-gray-900">
          {title}
        </p>
        <p className="text-xs text-gray-600">{body}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-labelledby={id} />
    </div>
  );
}

function mergeSettings(old: ProgressSummary, patch: ProgressSettingsPatch): ProgressSummary {
  const current = old.settings;
  return {
    ...old,
    settings: {
      celebrations: patch.celebrations ?? current.celebrations,
      showXp: patch.showXp ?? current.showXp,
      showFlameOnToday: patch.showFlameOnToday ?? current.showFlameOnToday,
      biscuit: patch.biscuit ?? current.biscuit,
      reminder: {
        enabled: patch.reminder?.enabled ?? current.reminder.enabled,
        time: patch.reminder?.time ?? current.reminder.time,
      },
    },
  };
}

export function RewardsSettingsCard() {
  const { enabled, summary } = useProgressSummary();
  const utils = trpc.useUtils();
  const input = { localDate: localDateStr() };
  const update = trpc.progress.updateSettings.useMutation({
    onMutate: async (patch) => {
      await utils.progress.summary.cancel(input);
      const previous = utils.progress.summary.getData(input);
      if (previous) utils.progress.summary.setData(input, mergeSettings(previous, patch));
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) utils.progress.summary.setData(input, context.previous);
    },
    onSettled: () => {
      void utils.progress.summary.invalidate();
    },
  });
  if (!enabled || !summary) return null;
  const { settings, flame } = summary;
  const save = (patch: ProgressSettingsPatch) => update.mutate(patch);

  return (
    <section
      aria-labelledby="rewards-settings-title"
      data-testid="rewards-settings"
      className="mt-8 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 id="rewards-settings-title" className="text-lg font-semibold text-gray-900">
        {PROGRESS_COPY.settingsTitle}
      </h2>

      <div className="mt-4">
        <p id="celebrations-label" className="text-sm font-semibold text-gray-900">
          {PROGRESS_COPY.celebrationsTitle}
        </p>
        <div
          role="radiogroup"
          aria-labelledby="celebrations-label"
          className="mt-2 grid grid-cols-3 gap-1 rounded-control bg-gray-100 p-1"
        >
          {LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              role="radio"
              aria-checked={settings.celebrations === level.value}
              onClick={() => save({ celebrations: level.value })}
              className={cn(
                'min-h-11 min-w-0 rounded-inner px-2 text-sm font-semibold',
                pressControl,
                settings.celebrations === level.value
                  ? 'bg-white text-gray-900 shadow-e1'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              {level.label}
            </button>
          ))}
        </div>
        {settings.celebrations === 'OFF' && (
          <p className="mt-2 text-xs text-gray-600">{PROGRESS_COPY.celebrationsOffNote}</p>
        )}
      </div>

      <div className="mt-3 divide-y">
        <ToggleRow
          title={PROGRESS_COPY.showXpTitle}
          body={PROGRESS_COPY.showXpBody}
          checked={settings.showXp}
          onChange={(showXp) => save({ showXp })}
        />
        <ToggleRow
          title={PROGRESS_COPY.biscuitTitle}
          body={PROGRESS_COPY.biscuitBody}
          checked={settings.biscuit}
          onChange={(biscuit) => save({ biscuit })}
        />
        <ToggleRow
          title={PROGRESS_COPY.flameOnTodayTitle}
          body={PROGRESS_COPY.flameOnTodayBody}
          checked={settings.showFlameOnToday}
          onChange={(showFlameOnToday) => save({ showFlameOnToday })}
        />
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <WeeklyGoalSelect
          goal={flame.goal}
          label={PROGRESS_COPY.goalTitle}
          hint={PROGRESS_COPY.goalBody}
        />
        <PauseFlameCard pausedUntil={flame.pausedUntil} />
      </div>
    </section>
  );
}
