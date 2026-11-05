import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { TRAINER_MODE_LIMITS, type WorkoutTemplateSummaryDto } from '@chefer/types';
import {
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  SearchField,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  filterTemplates,
  templateWorkoutTypes,
  workoutTypeLabel,
  type TemplateTypeFilter,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { useTimedRefresh } from '../../gym/today/use-timed-refresh';
import { ShellChromeProvider, ShellTopBar } from '../../shell/shell-chrome';
import { dayLabel } from '../bookings/booking-model';
import { templateAssignedText, templateSummaryText } from './template-draft';

// ─── Workouts: the template library (trainer-mode.md §6.6, M2) ────────────────
// The trainer's templates, most recently edited first: name, workout type, exercises, minutes,
// "Assigned to 5 clients" and when it was last edited. A search field filters by name and chips by
// workout type (the types present). "New template" (the top bar) opens the editor on a new template,
// which is only created once it has a name. Tap a row → the editor.

const ALL = 'ALL';

export const NEW_TEMPLATE_HREF = '/trainer/templates/new';

function TemplateRow({ row }: { row: WorkoutTemplateSummaryDto }) {
  const colors = useThemeColors();
  const tr = useT();
  const detail = templateSummaryText(tr, row);
  const edited = tr.t('trainer.templates.library.edited', {
    date: dayLabel(tr, row.updatedAt, 'short'),
  });
  const status = `${templateAssignedText(tr, row.assignedCount)} · ${edited}`;
  return (
    // MO-01: a card-sized tap target scales on press.
    <PressableScale
      testID={`template-row-${row.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}. ${detail}. ${status}`}
      onPress={() => router.push(`/trainer/templates/${row.id}`)}
      className="min-h-14 gap-1 rounded-card border border-separator bg-surface px-4 py-3"
    >
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 text-headline font-semibold text-label" numberOfLines={2}>
          {row.name}
        </Text>
        <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
      </View>
      <Text className="min-w-0 text-subhead text-label-secondary">{detail}</Text>
      <Text testID={`template-row-${row.id}-status`} className="text-caption text-label-secondary">
        {status}
      </Text>
    </PressableScale>
  );
}

export function TemplateLibraryScreen() {
  const colors = useThemeColors();
  const { t } = useT();
  const list = trpc.trainer.templates.list.useQuery({});
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TemplateTypeFilter>(ALL);
  const { refetch } = list;
  const refresh = useCallback(() => refetch(), [refetch]);
  const { refreshing, onRefresh } = useTimedRefresh(refresh);

  const rows = useMemo(() => list.data ?? [], [list.data]);
  const types = useMemo(() => templateWorkoutTypes(rows), [rows]);
  // A filter on a type no template uses any more shows everything.
  const activeType = type !== ALL && types.includes(type) ? type : ALL;
  const shown = filterTemplates(rows, query, activeType);
  const atLimit = rows.length >= TRAINER_MODE_LIMITS.templatesPerTrainer;
  const openNew = () => router.push(NEW_TEMPLATE_HREF);

  const newButton = (
    <IconButton
      testID="templates-new"
      accessibilityLabel={t('trainer.templates.library.newTemplate')}
      variant="tinted"
      disabled={atLimit}
      icon={<Icon name="add" color={colors.brand} />}
      onPress={openNew}
    />
  );

  return (
    <ShellChromeProvider
      value={{ kind: 'tab-root', title: t('trainer.templates.library.title'), actions: newButton }}
    >
      <Screen className="bg-canvas px-0" testID="templates-library">
        <KeyboardAwareScrollView
          testID="templates-library-scroll"
          contentContainerClassName="gap-4 px-4 pb-8 pt-3"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <ShellTopBar className="mb-1" />

          {list.isPending ? (
            <View testID="templates-library-loading" className="items-center py-10">
              <ActivityIndicator />
            </View>
          ) : list.isError ? (
            <ErrorState testID="templates-library-error" onRetry={() => void list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              testID="templates-library-empty"
              icon={<Icon name="workouts" color={colors.labelTertiary} size={40} />}
              title={t('trainer.templates.library.emptyTitle')}
              description={t('trainer.templates.library.emptyBody')}
              action={{
                label: t('trainer.templates.library.newTemplate'),
                testID: 'templates-library-empty-new',
                onPress: openNew,
              }}
            />
          ) : (
            <View className="gap-3">
              <SearchField
                testID="templates-search"
                accessibilityLabel={t('trainer.templates.library.search')}
                placeholder={t('trainer.templates.library.search')}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              {types.length > 0 ? (
                <View
                  testID="templates-type-filter"
                  accessibilityRole="radiogroup"
                  className="flex-row flex-wrap gap-2"
                >
                  <Chip
                    testID="templates-type-all"
                    label={t('trainer.templates.library.filterAll')}
                    selected={activeType === ALL}
                    onPress={() => setType(ALL)}
                  />
                  {types.map((wt) => (
                    <Chip
                      key={wt}
                      testID={`templates-type-${wt}`}
                      label={workoutTypeLabel(wt)}
                      selected={activeType === wt}
                      onPress={() => setType(wt)}
                    />
                  ))}
                </View>
              ) : null}
              {atLimit ? (
                <Text testID="templates-limit" className="text-subhead text-label-secondary">
                  {t('trainer.templates.library.limit', {
                    max: TRAINER_MODE_LIMITS.templatesPerTrainer,
                  })}
                </Text>
              ) : null}
              {shown.length === 0 ? (
                <Text
                  testID="templates-search-empty"
                  className="py-6 text-center text-subhead text-label-secondary"
                >
                  {t('trainer.templates.library.searchEmpty', { query: query.trim() })}
                </Text>
              ) : (
                shown.map((row) => <TemplateRow key={row.id} row={row} />)
              )}
            </View>
          )}
        </KeyboardAwareScrollView>
      </Screen>
    </ShellChromeProvider>
  );
}
