import { useEffect, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Translator } from '@chefer/i18n';
import {
  Button,
  ErrorState,
  IconButton,
  Screen,
  Sheet,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  addDaysLocal,
  lastCompletedWeekStart,
  localDateStr,
  userFacingErrorMessage,
} from '@chefer/utils';
import { Icon } from '../../components/icon';
import { track } from '../../lib/analytics';
import { useT } from '../../lib/i18n';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { useShareCard } from '../share/share-card';

// Lane E2 (market review 2026-10): "Your week in review" — factual counts for
// one Monday–Sunday week (`recap.week`): meals cooked from the plan, new
// recipes, protein days, workouts, PRs and the training streak. Reached from
// Today on Monday and from the Monday email (web). Only what happened is
// shown; a quiet week says so kindly. The share card lets the user pick what
// goes on it (protein days are opt-in).

const CARD = 'gap-2 rounded-card border border-separator bg-surface p-4';

type Recap = RouterOutputs['recap']['week'];

/** The food lines: only non-zero facts (as recapFoodLines in @chefer/utils). */
function recapFoodLinesT(food: Recap['food'], t: Translator['t']): string[] {
  const lines: string[] = [];
  if (food.cookedFromPlan > 0) {
    lines.push(t('today.recap.food.cookedFromPlan', { count: food.cookedFromPlan }));
  }
  if (food.newRecipesTried > 0) {
    lines.push(t('today.recap.food.newRecipesTried', { count: food.newRecipesTried }));
  }
  if (food.proteinDays && food.proteinDays.hit > 0) {
    lines.push(
      t('today.recap.food.proteinDays', {
        count: food.proteinDays.logged,
        hit: food.proteinDays.hit,
      }),
    );
  }
  return lines;
}

/** The training lines: only non-zero facts (as recapGymLines in @chefer/utils). */
function recapGymLinesT(gym: NonNullable<Recap['gym']>, t: Translator['t']): string[] {
  const lines: string[] = [];
  if (gym.sessions > 0) lines.push(t('today.recap.gym.sessions', { count: gym.sessions }));
  if (gym.prCount > 0) lines.push(t('today.recap.gym.prCount', { count: gym.prCount }));
  if (gym.streakWeeks > 0) {
    lines.push(t('today.recap.gym.streakWeeks', { count: gym.streakWeeks }));
  }
  return lines;
}

function Lines({ lines, testID }: { lines: string[]; testID: string }) {
  return (
    <View testID={testID} className="gap-1.5">
      {lines.map((line) => (
        <Text key={line} className="text-body text-label">
          {line}
        </Text>
      ))}
    </View>
  );
}

function PickRow(props: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  testID: string;
}) {
  const colors = useThemeColors();
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-3">
      <Text className="min-w-0 flex-1 text-body text-label">{props.label}</Text>
      <Switch
        testID={props.testID}
        accessibilityLabel={props.label}
        value={props.value}
        onValueChange={props.onChange}
        trackColor={{ true: colors.brand, false: colors.separator }}
      />
    </View>
  );
}

export function WeeklyRecapScreen() {
  const colors = useThemeColors();
  const { t } = useT();
  const params = useLocalSearchParams<{ week?: string; from?: string }>();
  const [weekStart, setWeekStart] = useState<string | undefined>(params.week);
  const query = trpc.recap.week.useQuery({ weekStart, localDate: localDateStr() });
  const recap = query.data;
  const { share, sharing } = useShareCard();
  const [picking, setPicking] = useState(false);
  const [include, setInclude] = useState({ cooking: true, protein: false, training: true });

  const from = params.from === 'today' ? 'today' : params.from === 'link' ? 'link' : 'menu';
  const loaded = recap !== undefined;
  const empty = recap?.empty ?? false;
  useEffect(() => {
    if (loaded) track('weekly_recap_viewed', { from, empty });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opened screen
  }, [loaded]);

  // The newest week offered is the last COMPLETED one.
  const newest = lastCompletedWeekStart(localDateStr());

  const foodLines = recap ? recapFoodLinesT(recap.food, t) : [];
  const gymLines = recap?.gym ? recapGymLinesT(recap.gym, t) : [];

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      <View className="mx-4 mt-3 min-h-11 flex-row items-center gap-1">
        <IconButton
          testID="recap-back"
          accessibilityLabel={t('common.actions.back')}
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="-ml-2"
        />
        <Text
          testID="recap-title"
          accessibilityRole="header"
          numberOfLines={1}
          className="min-w-0 flex-1 text-title1 font-bold text-label"
        >
          {t('today.recap.title')}
        </Text>
      </View>

      <ScrollView
        testID="recap-scroll"
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pb-8 pt-3"
      >
        {query.isError ? (
          <ErrorState
            testID="recap-error"
            description={userFacingErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : null}

        {recap ? (
          <>
            <View className="min-h-11 flex-row items-center justify-between">
              <IconButton
                testID="recap-previous"
                accessibilityLabel={t('today.recap.previousWeek')}
                icon={<Icon name="chevronBack" color={colors.brand} size={22} />}
                onPress={() => setWeekStart(addDaysLocal(recap.weekStart, -7))}
              />
              <Text testID="recap-week" className="text-headline font-semibold text-label">
                {recap.label}
              </Text>
              <IconButton
                testID="recap-next"
                accessibilityLabel={t('today.recap.nextWeek')}
                icon={<Icon name="chevronRight" color={colors.brand} size={22} />}
                disabled={recap.weekStart >= newest}
                onPress={() => setWeekStart(addDaysLocal(recap.weekStart, 7))}
              />
            </View>

            {empty ? (
              <View testID="recap-quiet" className={CARD}>
                <Text className="text-headline font-semibold text-label">
                  {t('today.recap.quietTitle')}
                </Text>
                <Text className="text-subhead text-label-secondary">
                  {t('today.recap.quietBody')}
                </Text>
              </View>
            ) : (
              <>
                <View testID="recap-food" className={CARD}>
                  <Text
                    accessibilityRole="header"
                    className="text-headline font-semibold text-label"
                  >
                    {t('today.recap.foodHeading')}
                  </Text>
                  {foodLines.length > 0 ? (
                    <Lines lines={foodLines} testID="recap-food-lines" />
                  ) : (
                    <Text className="text-subhead text-label-secondary">
                      {t('today.recap.foodQuiet')}
                    </Text>
                  )}
                  {recap.food.newRecipes.length > 0 ? (
                    <View className="mt-1 gap-1">
                      <Text className="text-subhead font-semibold text-label-secondary">
                        {t('today.recap.newRecipesHeading')}
                      </Text>
                      {recap.food.newRecipes.map((r) => (
                        <Text key={r.id} numberOfLines={1} className="text-body text-label">
                          {r.name}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>

                {recap.gym && gymLines.length > 0 ? (
                  <View testID="recap-gym" className={CARD}>
                    <Text
                      accessibilityRole="header"
                      className="text-headline font-semibold text-label"
                    >
                      {t('today.recap.gymHeading')}
                    </Text>
                    <Lines lines={gymLines} testID="recap-gym-lines" />
                    {recap.gym.prs.map((pr) => (
                      <Text key={pr.exerciseName} className="text-subhead text-label-secondary">
                        {t('today.engagement.recapScreen.pr', {
                          exercise: pr.exerciseName,
                          value: pr.label,
                        })}
                      </Text>
                    ))}
                  </View>
                ) : null}

                <Button testID="recap-share" variant="outline" onPress={() => setPicking(true)}>
                  {t('today.recap.share')}
                </Button>
              </>
            )}
          </>
        ) : null}
      </ScrollView>

      <Sheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={t('today.recap.shareSheetTitle')}
        testID="recap-share-sheet"
      >
        <View className="gap-2 pb-2">
          <PickRow
            testID="recap-pick-cooking"
            label={t('today.recap.shareCooking')}
            value={include.cooking}
            onChange={(cooking) => setInclude((i) => ({ ...i, cooking }))}
          />
          {recap?.food.proteinDays ? (
            <PickRow
              testID="recap-pick-protein"
              label={t('today.recap.shareProtein')}
              value={include.protein}
              onChange={(protein) => setInclude((i) => ({ ...i, protein }))}
            />
          ) : null}
          {recap?.gym ? (
            <PickRow
              testID="recap-pick-training"
              label={t('today.recap.shareTraining')}
              value={include.training}
              onChange={(training) => setInclude((i) => ({ ...i, training }))}
            />
          ) : null}
          <Text className="text-footnote text-label-secondary">{t('today.recap.shareNote')}</Text>
          <Button
            testID="recap-share-go"
            loading={sharing === 'recap'}
            disabled={!recap}
            onPress={() => {
              if (!recap) return;
              setPicking(false);
              void share(
                { kind: 'recap', weekStart: recap.weekStart, localDate: localDateStr(), include },
                t('today.recap.shareMessage', { label: recap.label }),
              );
            }}
          >
            {t('today.recap.share')}
          </Button>
        </View>
      </Sheet>
    </Screen>
  );
}
