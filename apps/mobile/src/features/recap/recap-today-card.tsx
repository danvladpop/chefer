import { router } from 'expo-router';
import { PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { localDateStr } from '@chefer/utils';
import { Icon } from '../../components/icon';
import { useFlags } from '../../hooks/use-flags';
import { useT } from '../../lib/i18n';
import { trpc } from '../../lib/trpc';

// Lane E2: Today's Monday door into "Your week in review". Monday only, and
// only when last week has something to show (a quiet week gets no card). With
// the `gamification` flag on, Kitchen progress's Sunday–Tuesday recap banner
// takes this slot instead (agreed with that lane), so this card hides.

export function RecapTodayCard({ isMonday }: { isMonday: boolean }) {
  const colors = useThemeColors();
  const { t } = useT();
  const { gamification } = useFlags();
  const show = isMonday && !gamification;
  const { data } = trpc.recap.week.useQuery(
    { localDate: localDateStr() },
    { enabled: show, staleTime: 10 * 60_000 },
  );
  if (!show || !data || data.empty) return null;
  return (
    // MO-01 press feedback via PressableScale.
    <PressableScale
      testID="today-recap"
      accessibilityRole="button"
      accessibilityLabel={t('today.engagement.recapScreen.todayCardLabel', {
        title: t('today.recap.todayCardTitle'),
        week: data.label,
      })}
      onPress={() => router.push('/recap?from=today')}
      className="min-h-14 flex-row items-center gap-3 rounded-card border border-separator bg-surface px-4 py-3"
    >
      <Icon name="calendar" color={colors.brand} size={22} />
      <Text className="min-w-0 flex-1">
        <Text className="text-callout font-semibold text-label">
          {t('today.recap.todayCardTitle')}
        </Text>
        {'\n'}
        <Text className="text-subhead text-label-secondary">{t('today.recap.todayCardBody')}</Text>
      </Text>
      <Icon name="chevronRight" color={colors.labelTertiary} size={18} />
    </PressableScale>
  );
}
