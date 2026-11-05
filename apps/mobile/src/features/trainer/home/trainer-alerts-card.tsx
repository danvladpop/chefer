import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { QUIET_LIMITS, type TrainerAlertsConfigDto } from '@chefer/types';
import {
  Button,
  haptics,
  PressableScale,
  Text,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { CoachingCard } from '../components/coaching-card';

// ─── Trainer settings › Client alerts (lane K4) ───────────────────────────────
// After how many days with nothing logged a client counts as quiet (default 3), and the optional
// daily email. Mirrors web TrainerAlertsSettings.tsx.

export function TrainerAlertsCard() {
  const { t } = useT();
  const colors = useThemeColors();
  const snackbar = useSnackbar();
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
      snackbar.show({ message: t('coaching.quiet.saved') });
    },
  });
  if (!draft) return null;
  return (
    <CoachingCard testID="trainer-alerts" className="gap-3">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        {t('coaching.quiet.settingsTitle')}
      </Text>
      <Text className="text-subhead font-semibold text-label">
        {t('coaching.quiet.quietLabel')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {QUIET_LIMITS.dayChoices.map((n) => {
          const selected = draft.quietAfterDays === n;
          return (
            // MO-01: press feedback on each chip.
            <PressableScale
              key={n}
              testID={`trainer-alerts-days-${n}`}
              accessibilityRole="button"
              accessibilityLabel={t('coaching.quiet.days', { count: n })}
              accessibilityState={{ selected }}
              onPress={() => {
                haptics.selection();
                setDraft({ ...draft, quietAfterDays: n });
              }}
              className={cn(
                'min-h-11 items-center justify-center rounded-inner px-3',
                selected ? 'bg-brand' : 'bg-surface-sunken',
              )}
            >
              <Text
                className={cn(
                  'text-subhead font-semibold',
                  selected ? 'text-brand-on' : 'text-label',
                )}
              >
                {t('coaching.quiet.days', { count: n })}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      <Text className="text-footnote text-label-secondary">{t('coaching.quiet.quietHint')}</Text>
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-subhead font-semibold text-label">
            {t('coaching.quiet.digest')}
          </Text>
          <Text className="text-footnote text-label-secondary">
            {t('coaching.quiet.digestHint')}
          </Text>
        </View>
        <Switch
          testID="trainer-alerts-digest"
          accessibilityLabel={t('coaching.quiet.digest')}
          value={draft.digestEmail}
          onValueChange={(digestEmail) => setDraft({ ...draft, digestEmail })}
          trackColor={{ true: colors.brand, false: colors.separator }}
        />
      </View>
      {save.isError ? (
        <Text className="text-subhead text-danger">{t('coaching.sharing.saveError')}</Text>
      ) : null}
      <Button
        testID="trainer-alerts-save"
        variant="outline"
        loading={save.isPending}
        onPress={() => save.mutate(draft)}
      >
        {t('coaching.quiet.save')}
      </Button>
    </CoachingCard>
  );
}
