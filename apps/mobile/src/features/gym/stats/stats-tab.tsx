import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Card, Chip, Screen, Text } from '@chefer/ui-mobile';
import { GymBootstrapUnavailable, useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { ModeSwitch } from '../components/mode-switch';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { ConsistencyView } from './consistency-view';
import { HistoryView } from './history-view';
import { MonthlyRecapView } from './monthly-recap-view';
import { MuscleVolumeView } from './muscle-volume-view';
import { PrTimelineView } from './pr-timeline-view';
import { StrengthTrendView } from './strength-trend-view';

// Stats tab (gym_plan.md §1.3): 5 default views — strength trend, weekly sets
// per muscle, consistency, PR timeline, monthly recap — with everything else
// (research §6.2: at most 3–5 lifts and one volume chart by default) behind
// "More". A `History` segment (T-36.5) swaps the whole scroll for a
// week-grouped list of every completed session — Gym Today's `Recent`
// section's `All history` link opens straight into it via `?tab=history`.

const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/;

export function StatsTab() {
  const bootstrapQuery = useGymBootstrap();
  const bootstrap = bootstrapQuery.data;
  // UX-GYM-24: a failed load is an error with Retry, never "Loading…" forever.
  const { load, retry } = useGymBootstrapLoad(bootstrapQuery);
  const [moreOpen, setMoreOpen] = useState(false);
  const { tab, month } = useLocalSearchParams<{ tab?: string; month?: string }>();
  const [segment, setSegment] = useState<'overview' | 'history'>(
    tab === 'history' ? 'history' : 'overview',
  );
  // UX-GYM-13: Today's "See September" opens this tab with `?month=2026-09` —
  // show the Overview, scroll the recap into view and select that month.
  const recapMonth = month && MONTH_PARAM.test(month) ? month : undefined;
  const scrollRef = useRef<ScrollView>(null);
  const recapY = useRef<number | null>(null);
  const [recapLaidOut, setRecapLaidOut] = useState(false);
  useEffect(() => {
    if (recapMonth) setSegment('overview');
  }, [recapMonth]);
  useEffect(() => {
    if (recapMonth && recapLaidOut && recapY.current !== null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, recapY.current - 8), animated: true });
    }
  }, [recapMonth, recapLaidOut]);

  return (
    <Screen className="px-0" testID="gym-stats-screen">
      <View className="gap-3 px-4 pb-2 pt-2">
        <ModeSwitch mode="gym" />
        <Text testID="gym-stats-title" variant="title">
          Stats
        </Text>
        <View className="flex-row gap-2">
          <Chip
            testID="gym-stats-segment-overview"
            label="Overview"
            selected={segment === 'overview'}
            onPress={() => setSegment('overview')}
          />
          <Chip
            testID="gym-stats-segment-history"
            label="History"
            selected={segment === 'history'}
            onPress={() => setSegment('history')}
          />
        </View>
      </View>

      {!bootstrap || load !== 'data' ? (
        <GymBootstrapUnavailable
          load={load === 'data' ? 'loading' : load}
          onRetry={retry}
          testID="gym-stats"
          what="your stats"
        />
      ) : segment === 'history' ? (
        <ScrollView contentContainerClassName="gap-4 px-4 pb-8" testID="gym-stats-history-scroll">
          <HistoryView bootstrap={bootstrap} />
        </ScrollView>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerClassName="gap-4 px-4 pb-8"
          testID="gym-stats-scroll"
        >
          <StrengthTrendView bootstrap={bootstrap} />
          <MuscleVolumeView bootstrap={bootstrap} />
          <ConsistencyView bootstrap={bootstrap} />
          <PrTimelineView bootstrap={bootstrap} />
          <View
            testID="gym-stats-recap-anchor"
            onLayout={(e) => {
              recapY.current = e.nativeEvent.layout.y;
              setRecapLaidOut(true);
            }}
          >
            <MonthlyRecapView bootstrap={bootstrap} initialMonth={recapMonth} />
          </View>

          <Chip
            testID="gym-stats-more-toggle"
            label={moreOpen ? 'Hide more' : 'More'}
            selected={moreOpen}
            onPress={() => setMoreOpen((v) => !v)}
          />
          {moreOpen ? (
            <Card testID="gym-stats-more">
              <Text variant="muted">
                {/* T-BUG-42 (B-42, audit 21.17): this used to cite our own planning doc
                    ("research §6.1/§6.2") — internal spec language a user has no way
                    to look up. Say what it means instead. */}
                That&apos;s everything for now — the 5 views above are the ones that actually help
                you train better. More views land here as they&apos;re added.
              </Text>
            </Card>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
