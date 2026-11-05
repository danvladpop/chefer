import { useCallback, useState } from 'react';
import { ActivityIndicator, Keyboard, RefreshControl, View } from 'react-native';
import type { MessageKey } from '@chefer/i18n';
import { COACHING_LIMITS, TRAINER_MODE_LIMITS } from '@chefer/types';
import {
  EmptyState,
  ErrorState,
  IconButton,
  KeyboardAwareScrollView,
  Screen,
  SearchField,
  SegmentedControl,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { filterClients, sortClients, type ClientSort } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { useTimedRefresh } from '../../gym/today/use-timed-refresh';
import { ShellChromeProvider, ShellTopBar } from '../../shell/shell-chrome';
import { ClientRow } from '../../trainer/components/client-row';
import { RequestsSection } from '../../trainer/home/requests-section';
import { InviteSheet } from '../../trainer/invite/invite-screen';
import { useTrainerBadges } from '../use-trainer-mode';

// ─── Clients (docs/prd-2026-10/trainer-mode.md §6.4) ──────────────────────────
// Trainer tools' home as a tab root: Requests at the top (Accept / Decline),
// the capacity line ("23 of 50 clients"), then the client cards — searchable
// from 8 clients, sortable by name, last workout or next booking (M3).
// "Invite a client" sits in the top bar and opens the invite flow as a sheet.
// Turning tools off and the profile moved to trainer You (§6.8).

/** M3 (§6.4): "Next booking" joins the sorts (soonest first, none last). */

const SORT_OPTIONS = [
  { value: 'name', labelKey: 'trainer.clients.sortName', testID: 'trainer-clients-sort-name' },
  {
    value: 'lastWorkout',
    labelKey: 'trainer.clients.sortLastWorkout',
    testID: 'trainer-clients-sort-last-workout',
  },
  {
    value: 'nextBooking',
    labelKey: 'trainer.bookings.today.nextBooking',
    testID: 'trainer-clients-sort-next-booking',
  },
] as const satisfies readonly { value: ClientSort; labelKey: MessageKey; testID: string }[];

export function ClientsScreen() {
  const colors = useThemeColors();
  const { t } = useT();
  const sortOptions = SORT_OPTIONS.map(({ labelKey, ...option }) => ({
    ...option,
    label: t(labelKey),
  }));
  const [inviteOpen, setInviteOpen] = useState(false);
  const utils = trpc.useUtils();
  const clients = trpc.trainer.clients.list.useQuery({ today: localDate() });
  const badges = useTrainerBadges();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ClientSort>('name');

  const { refetch: refetchClients } = clients;
  const { refetch: refetchBadges } = badges;
  const refetchAll = useCallback(
    () =>
      Promise.all([
        refetchClients(),
        refetchBadges(),
        utils.trainer.requests.list.invalidate(),
        utils.coaching.notices.invalidate(),
      ]),
    [refetchClients, refetchBadges, utils],
  );
  const { refreshing, onRefresh } = useTimedRefresh(refetchAll);

  const rows = clients.data ?? [];
  const searchable = rows.length >= TRAINER_MODE_LIMITS.clientSearchFrom;
  // The query only filters while the field is shown (a client who leaves can hide it mid-search).
  const filtered = searchable ? filterClients(rows, query) : rows;
  const shown = sortClients(filtered, sort);

  const invite = (
    <IconButton
      testID="trainer-clients-invite"
      accessibilityLabel={t('trainer.today.inviteClient')}
      variant="tinted"
      icon={<Icon name="invite" color={colors.brand} />}
      onPress={() => setInviteOpen(true)}
    />
  );

  return (
    <ShellChromeProvider
      value={{ kind: 'tab-root', title: t('trainer.clients.title'), actions: invite }}
    >
      <Screen className="bg-canvas px-0" testID="trainer-clients">
        <KeyboardAwareScrollView
          testID="trainer-clients-scroll"
          contentContainerClassName="gap-4 px-4 pb-8 pt-3"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <ShellTopBar className="mb-1" />

          {/* PRD 2026-10 §4.1: coaching requests from Find a trainer (nothing while none wait). */}
          <RequestsSection />

          {clients.isPending ? (
            <View testID="trainer-clients-loading" className="items-center py-10">
              <ActivityIndicator />
            </View>
          ) : clients.isError ? (
            <ErrorState testID="trainer-clients-error" onRetry={() => void clients.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              testID="trainer-clients-empty"
              icon={<Icon name="clients" color={colors.labelTertiary} size={40} />}
              title={t('coaching.trainer.clientsEmpty')}
              description={t('coaching.trainer.turnOnBody')}
              action={{
                label: t('trainer.today.inviteClient'),
                testID: 'trainer-clients-empty-invite',
                onPress: () => setInviteOpen(true),
              }}
            />
          ) : (
            <View className="gap-3">
              <Text testID="trainer-clients-capacity" className="text-subhead text-label-secondary">
                {t('trainer.clients.capacity', {
                  n: rows.length,
                  count: COACHING_LIMITS.maxActiveClients,
                })}
              </Text>
              {searchable ? (
                <SearchField
                  testID="trainer-clients-search"
                  accessibilityLabel={t('trainer.clients.search')}
                  placeholder={t('trainer.clients.search')}
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              ) : null}
              {rows.length > 1 ? (
                <SegmentedControl
                  testID="trainer-clients-sort"
                  accessibilityLabel={t('trainer.clients.sortLabel')}
                  size="xs"
                  options={sortOptions}
                  value={sort}
                  onChange={setSort}
                />
              ) : null}
              {shown.length === 0 ? (
                <Text
                  testID="trainer-clients-search-empty"
                  className="py-6 text-center text-subhead text-label-secondary"
                >
                  {t('trainer.clients.searchEmpty', { query: query.trim() })}
                </Text>
              ) : (
                shown.map((row) => <ClientRow key={row.clientId} row={row} />)
              )}
            </View>
          )}
        </KeyboardAwareScrollView>
        <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} />
      </Screen>
    </ShellChromeProvider>
  );
}
