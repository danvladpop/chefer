import { useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { COACHING_COPY, type TrainerSummaryDto } from '@chefer/types';
import {
  Badge,
  ErrorState,
  PressableScale,
  Screen,
  SEARCH_LIST_PROPS,
  SearchField,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { TRAINER_SCREEN_CLASS, TrainerHeader } from '../../trainer/components/trainer-header';
import { COACHING_EDGES, CoachingGate } from './coaching-gate';

// ─── Find a trainer (PRD 2026-10 §4.1) ────────────────────────────────────────
// Trainers only, by NAME only (never email): a labelled search, at least 2 letters, debounced →
// `coaching.findTrainers`. A row: name, the "Trainer" badge, the gym line, "Not taking new clients" at
// the limit. Tap → the trainer's card, where "Ask to coach me" lives. Needs no Following.

export const FIND_MIN_CHARS = 2;

function TrainerRow({ trainer }: { trainer: TrainerSummaryDto }) {
  const colors = useThemeColors();
  const copy = COACHING_COPY.find;
  const label = [
    trainer.name,
    copy.badge,
    trainer.gymLine,
    trainer.acceptingClients ? null : copy.notTaking,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    // MO-01: a card-sized tap target scales on press.
    <PressableScale
      testID={`coaching-find-trainer-${trainer.trainerId}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push(`/coaching/trainers/${trainer.trainerId}`)}
      className="min-h-14 flex-row items-center gap-3 rounded-card border border-separator bg-surface px-4 py-3"
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="min-w-0 shrink text-headline font-semibold text-label" numberOfLines={1}>
            {trainer.name}
          </Text>
          <Badge variant="secondary">{copy.badge}</Badge>
        </View>
        {trainer.gymLine ? (
          <Text className="text-subhead text-label-secondary" numberOfLines={1}>
            {trainer.gymLine}
          </Text>
        ) : null}
        {trainer.acceptingClients ? null : (
          <Text
            testID={`coaching-find-trainer-${trainer.trainerId}-not-taking`}
            className="text-subhead text-label-secondary"
          >
            {copy.notTaking}
          </Text>
        )}
      </View>
      <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
    </PressableScale>
  );
}

function FindTrainerBody() {
  const copy = COACHING_COPY.find;
  const [query, setQuery] = useState('');
  const q = query.trim();
  const searching = q.length >= FIND_MIN_CHARS;
  const results = trpc.coaching.findTrainers.useQuery(
    { query: q },
    { enabled: searching, retry: false, staleTime: 30_000 },
  );

  let status: ReactNode = null;
  if (q.length > 0 && !searching) {
    status = (
      <Text testID="coaching-find-too-short" className="text-subhead text-label-secondary">
        {copy.tooShort}
      </Text>
    );
  } else if (searching && results.isPending) {
    status = (
      <View testID="coaching-find-loading" className="items-center py-6">
        <ActivityIndicator />
      </View>
    );
  } else if (searching && results.isError) {
    status = <ErrorState testID="coaching-find-error" onRetry={() => void results.refetch()} />;
  } else if (searching && results.data?.items.length === 0) {
    status = (
      <Text testID="coaching-find-empty" className="text-subhead text-label-secondary">
        {copy.empty}
      </Text>
    );
  }

  return (
    <Screen edges={COACHING_EDGES} className={TRAINER_SCREEN_CLASS} testID="coaching-find">
      <TrainerHeader testID="coaching-find-header" title={copy.title} />
      <View className="px-4 pb-2">
        <SearchField
          testID="coaching-find-search"
          accessibilityLabel={copy.searchLabel}
          placeholder={copy.searchPlaceholder}
          autoCapitalize="words"
          onDebouncedChange={setQuery}
        />
      </View>
      <FlatList
        testID="coaching-find-results"
        data={searching ? (results.data?.items ?? []) : []}
        keyExtractor={(t) => t.trainerId}
        renderItem={({ item }) => <TrainerRow trainer={item} />}
        contentContainerClassName="gap-2 px-4 pb-8 pt-2"
        ListHeaderComponent={status ? <View className="pb-2">{status}</View> : null}
        {...SEARCH_LIST_PROPS}
      />
    </Screen>
  );
}

export function FindTrainerScreen() {
  return (
    <CoachingGate testID="coaching-find" title={COACHING_COPY.find.title}>
      <FindTrainerBody />
    </CoachingGate>
  );
}
