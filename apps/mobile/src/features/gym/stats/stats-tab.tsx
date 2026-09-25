import { useState } from 'react';
import { View } from 'react-native';
import { Card, Chip, KeyboardAwareScrollView, Screen, Text } from '@chefer/ui-mobile';
import { ModeSwitch } from '../components/mode-switch';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { ConsistencyView } from './consistency-view';
import { MonthlyRecapView } from './monthly-recap-view';
import { MuscleVolumeView } from './muscle-volume-view';
import { PrTimelineView } from './pr-timeline-view';
import { StrengthTrendView } from './strength-trend-view';

// Stats tab (gym_plan.md §1.3): 5 default views — strength trend, weekly sets
// per muscle, consistency, PR timeline, monthly recap — with everything else
// (research §6.2: at most 3–5 lifts and one volume chart by default) behind
// "More".

export function StatsTab() {
  const { data: bootstrap, isLoading } = useGymBootstrap();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <Screen className="px-0" testID="gym-stats-screen">
      <View className="gap-3 px-4 pb-2 pt-2">
        <ModeSwitch />
        <Text testID="gym-stats-title" variant="title">
          Stats
        </Text>
      </View>

      {isLoading || !bootstrap ? (
        <Text variant="muted" className="px-4">
          Loading…
        </Text>
      ) : (
        // Keyboard-aware (dogfood #2): the monthly recap's "log your weight"
        // field sits at the very bottom of this scroll.
        <KeyboardAwareScrollView
          contentContainerClassName="gap-4 px-4 pb-8"
          testID="gym-stats-scroll"
        >
          <StrengthTrendView bootstrap={bootstrap} />
          <MuscleVolumeView bootstrap={bootstrap} />
          <ConsistencyView bootstrap={bootstrap} />
          <PrTimelineView bootstrap={bootstrap} />
          <MonthlyRecapView bootstrap={bootstrap} />

          <Chip
            testID="gym-stats-more-toggle"
            label={moreOpen ? 'Hide more' : 'More'}
            selected={moreOpen}
            onPress={() => setMoreOpen((v) => !v)}
          />
          {moreOpen ? (
            <Card testID="gym-stats-more">
              <Text variant="muted">
                That&apos;s everything for now — the 5 views above cover what research says actually
                helps (research §6.1/§6.2). More views land here as they&apos;re added.
              </Text>
            </Card>
          ) : null}
        </KeyboardAwareScrollView>
      )}
    </Screen>
  );
}
