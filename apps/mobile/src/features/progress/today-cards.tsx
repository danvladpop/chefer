import { View } from 'react-native';
import { router } from 'expo-router';
import type { ProgressSummary } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { introBackdatedLine, PROGRESS_COPY } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { ActionButton } from '../shell/today/parts';
import { ProgressStrip } from './progress-strip';
import { useProgressSummary } from './use-progress';

// What Kitchen progress puts at the top of Today, in order: the one-time
// welcome (back-dated XP and badges), a recap waiting to be opened, the calm
// support card when the low-intake guard is on, and the strip. One wrapper so
// a user with none of it gets no empty gap. Gated by `useProgressSummary`.

function IntroCard({ intro }: { intro: NonNullable<ProgressSummary['intro']> }) {
  const utils = trpc.useUtils();
  const markSeen = trpc.progress.markSeen.useMutation({
    onSuccess: () => void utils.progress.summary.invalidate(),
  });
  return (
    <View
      testID="progress-intro"
      className="gap-2 rounded-card border border-separator bg-brand-tint p-4"
    >
      <Text accessibilityRole="header" className="text-title3 font-bold text-label">
        {PROGRESS_COPY.introTitle}
      </Text>
      <Text className="text-callout text-label-secondary">{PROGRESS_COPY.introBody}</Text>
      <Text testID="progress-intro-earned" className="text-callout font-semibold text-brand">
        {introBackdatedLine(intro.backdatedXp, intro.badges)}
      </Text>
      <ActionButton
        testID="progress-intro-cta"
        variant="filled"
        label={PROGRESS_COPY.introCta}
        disabled={markSeen.isPending}
        onPress={() => markSeen.mutate({ intro: true })}
      />
    </View>
  );
}

function RecapBanner({ weekStart }: { weekStart: string }) {
  return (
    <View
      testID="progress-recap-banner"
      className="flex-row items-center gap-3 rounded-card border border-separator bg-surface p-4"
    >
      <Text accessibilityElementsHidden className="text-title2">
        🍳
      </Text>
      <Text className="min-w-0 flex-1 text-headline font-semibold text-label">
        {PROGRESS_COPY.recapBanner}
      </Text>
      <ActionButton
        testID="progress-recap-open"
        label={PROGRESS_COPY.recapBannerCta}
        accessibilityLabel={`${PROGRESS_COPY.recapBanner}. ${PROGRESS_COPY.recapBannerCta}`}
        onPress={() =>
          router.push({ pathname: '/kitchen-recap/[week]', params: { week: weekStart } })
        }
      />
    </View>
  );
}

function QuietCard() {
  return (
    <View
      testID="progress-quiet"
      className="gap-1 rounded-card border border-separator bg-surface p-4"
    >
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        {PROGRESS_COPY.quietSupportTitle}
      </Text>
      <Text className="text-callout text-label-secondary">{PROGRESS_COPY.quietSupportBody}</Text>
    </View>
  );
}

export function ProgressTodayTop() {
  const { summary } = useProgressSummary();
  if (!summary) return null;
  const intro = summary.settings.showXp ? summary.intro : null;
  const showStrip = summary.settings.showFlameOnToday;
  if (!intro && !summary.recap && !summary.quiet && !showStrip) return null;
  return (
    <View testID="progress-today-top" className="gap-4">
      {intro ? <IntroCard intro={intro} /> : null}
      {summary.recap ? <RecapBanner weekStart={summary.recap.weekStart} /> : null}
      {summary.quiet ? <QuietCard /> : null}
      {showStrip ? <ProgressStrip summary={summary} /> : null}
    </View>
  );
}
