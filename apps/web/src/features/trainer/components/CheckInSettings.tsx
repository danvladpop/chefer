'use client';

import { useEffect, useId, useState } from 'react';
import { weekdayLongT, weekdayNameT } from '@/features/coaching/lib/dates';
import { capture } from '@/lib/analytics';
import { showAppToast } from '@/lib/app-toast';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import {
  CHECK_IN_LIMITS,
  CHECK_IN_QUESTION_KEYS,
  type CheckInConfigDto,
  type CheckInQuestion,
} from '@chefer/types';
import { Button, Switch } from '@chefer/ui';
import { cn } from '@chefer/utils';

// ─── Trainer settings › Weekly check-in (lane K3) ─────────────────────────────
// One check-in for every client: on / off, the weekday it opens and up to 6
// questions. Mirrors mobile check-in-settings-card.tsx.

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function Chip({
  label,
  selected,
  onClick,
  a11y,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  a11y: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={a11y}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full border px-4 text-sm font-medium',
        selected
          ? 'border-gray-900 bg-gray-900 text-white'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
      )}
    >
      {label}
    </button>
  );
}

export function CheckInSettings() {
  const { t } = useT();
  const id = useId();
  const utils = trpc.useUtils();
  const config = trpc.trainer.checkIns.config.useQuery(undefined, { retry: false });
  const [draft, setDraft] = useState<CheckInConfigDto | null>(null);
  useEffect(() => {
    if (config.data) setDraft(config.data);
  }, [config.data]);
  const save = trpc.trainer.checkIns.saveConfig.useMutation({
    meta: { silent: true },
    onSuccess: (saved) => {
      capture('check_in_config_saved', {
        enabled: saved.enabled,
        questions: saved.questions.length,
      });
      void utils.trainer.checkIns.config.invalidate();
      showAppToast({ message: t('coaching.checkIn.trainer.saved'), type: 'success' });
    },
    onError: () => showAppToast({ message: t('coaching.sharing.saveError') }),
  });
  if (!draft) return null;
  const toggle = (q: CheckInQuestion) =>
    setDraft((d) => {
      if (!d) return d;
      const has = d.questions.includes(q);
      if (has && d.questions.length === 1) return d;
      if (!has && d.questions.length >= CHECK_IN_LIMITS.maxQuestions) return d;
      return { ...d, questions: has ? d.questions.filter((x) => x !== q) : [...d.questions, q] };
    });
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-testid="trainer-check-in-settings"
      className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 id={`${id}-title`} className="font-semibold text-gray-900">
        {t('coaching.checkIn.trainer.settingsTitle')}
      </h2>
      <p className="text-sm text-gray-600">{t('coaching.checkIn.trainer.settingsBody')}</p>
      <div className="flex items-center justify-between gap-3">
        <p id={`${id}-enable`} className="min-w-0 text-sm font-semibold text-gray-900">
          {t('coaching.checkIn.trainer.enable')}
        </p>
        <Switch
          aria-labelledby={`${id}-enable`}
          checked={draft.enabled}
          onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
        />
      </div>
      {draft.enabled && (
        <>
          <p className="text-xs font-semibold text-gray-600">
            {t('coaching.checkIn.trainer.dayLabel')}
          </p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <Chip
                key={day}
                label={weekdayNameT(day, t)}
                a11y={weekdayLongT(day, t)}
                selected={draft.day === day}
                onClick={() => setDraft({ ...draft, day })}
              />
            ))}
          </div>
          <p className="text-xs font-semibold text-gray-600">
            {t('coaching.checkIn.trainer.questionsLabel')}
          </p>
          <div className="flex flex-wrap gap-2">
            {CHECK_IN_QUESTION_KEYS.map((q) => (
              <Chip
                key={q}
                label={t(`coaching.checkIn.questions.${q}.label`)}
                a11y={t(`coaching.checkIn.questions.${q}.label`)}
                selected={draft.questions.includes(q)}
                onClick={() => toggle(q)}
              />
            ))}
          </div>
          <p className="text-xs text-gray-600">{t('coaching.checkIn.trainer.noteAlways')}</p>
        </>
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          loading={save.isPending}
          onClick={() =>
            save.mutate({ enabled: draft.enabled, day: draft.day, questions: draft.questions })
          }
        >
          {t('coaching.checkIn.trainer.save')}
        </Button>
      </div>
    </section>
  );
}
