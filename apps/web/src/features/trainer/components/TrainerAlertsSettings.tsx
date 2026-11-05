'use client';

import { useEffect, useId, useState } from 'react';
import { showAppToast } from '@/lib/app-toast';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { QUIET_LIMITS, type TrainerAlertsConfigDto } from '@chefer/types';
import { Button, Switch } from '@chefer/ui';
import { cn } from '@chefer/utils';

// ─── Trainer settings › Client alerts (lane K4) ───────────────────────────────
// After how many days with nothing logged a client counts as quiet (default
// 3), and the optional daily email. Mirrors mobile trainer-alerts-card.tsx.

export function TrainerAlertsSettings() {
  const { t } = useT();
  const id = useId();
  const utils = trpc.useUtils();
  const config = trpc.trainer.alerts.config.useQuery(undefined, { retry: false });
  const [draft, setDraft] = useState<TrainerAlertsConfigDto | null>(null);
  useEffect(() => {
    if (config.data) setDraft(config.data);
  }, [config.data]);
  const save = trpc.trainer.alerts.saveConfig.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.trainer.alerts.config.invalidate();
      void utils.trainer.dashboard.summary.invalidate();
      void utils.trainer.clients.list.invalidate();
      void utils.trainer.badges.invalidate();
      showAppToast({ message: t('coaching.quiet.saved'), type: 'success' });
    },
    onError: () => showAppToast({ message: t('coaching.sharing.saveError') }),
  });
  if (!draft) return null;
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-testid="trainer-alerts"
      className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 id={`${id}-title`} className="font-semibold text-gray-900">
        {t('coaching.quiet.settingsTitle')}
      </h2>
      <p className="text-sm font-semibold text-gray-900">{t('coaching.quiet.quietLabel')}</p>
      <div className="flex flex-wrap gap-2">
        {QUIET_LIMITS.dayChoices.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={draft.quietAfterDays === n}
            onClick={() => setDraft({ ...draft, quietAfterDays: n })}
            className={cn(
              'min-h-11 rounded-full border px-4 text-sm font-medium',
              draft.quietAfterDays === n
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            {t('coaching.quiet.days', { count: n })}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-600">{t('coaching.quiet.quietHint')}</p>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p id={`${id}-digest`} className="text-sm font-semibold text-gray-900">
            {t('coaching.quiet.digest')}
          </p>
          <p id={`${id}-digest-hint`} className="text-xs text-gray-600">
            {t('coaching.quiet.digestHint')}
          </p>
        </div>
        <Switch
          aria-labelledby={`${id}-digest`}
          aria-describedby={`${id}-digest-hint`}
          checked={draft.digestEmail}
          onCheckedChange={(digestEmail) => setDraft({ ...draft, digestEmail })}
        />
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          loading={save.isPending}
          onClick={() => save.mutate(draft)}
        >
          {t('coaching.quiet.save')}
        </Button>
      </div>
    </section>
  );
}
