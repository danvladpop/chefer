import { View } from 'react-native';
import { HOUSEHOLD_SHARING_COPY, type HouseholdNoticeDto } from '@chefer/types';
import { IconButton, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { useHouseholdSharing } from './use-household-sharing';

// ─── Household notices (ADR 0003) ─────────────────────────────────────────────
// "Maria joined your household", "Dan removed you…": written by the server on
// join / leave / removal / account deletion (there is no push). Shown as
// dismissible cards on the Household screen and summed up on the You row.

export function noticeText(notice: HouseholdNoticeDto): string {
  return HOUSEHOLD_SHARING_COPY.notice[notice.kind](notice.name);
}

/** The household notices to show, while sharing is on (empty otherwise). */
export function useHouseholdNotices(): HouseholdNoticeDto[] {
  const { enabled } = useHouseholdSharing();
  const { data } = trpc.household.notices.useQuery(undefined, {
    enabled,
    staleTime: 60_000,
  });
  return enabled ? (data ?? []) : [];
}

export function HouseholdNotices() {
  const notices = useHouseholdNotices();
  if (notices.length === 0) return null;
  return <NoticeCards notices={notices} />;
}

function NoticeCards({ notices }: { notices: HouseholdNoticeDto[] }) {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const dismiss = trpc.household.dismissNotice.useMutation({
    meta: { silent: true },
    onMutate: ({ id }) => {
      // Gone at once; a failed dismiss comes back with the next read.
      utils.household.notices.setData(undefined, (old) => old?.filter((n) => n.id !== id));
    },
    onSettled: () => void utils.household.notices.invalidate(),
  });

  return (
    <View testID="household-notices" className="gap-2">
      {notices.map((notice) => (
        <View
          key={notice.id}
          testID={`household-notice-${notice.id}`}
          accessibilityLiveRegion="polite"
          className="flex-row items-center gap-2 rounded-card bg-brand-tint py-2 pl-4 pr-1"
        >
          <Text className="min-w-0 flex-1 text-subhead text-label">{noticeText(notice)}</Text>
          <IconButton
            testID={`household-notice-${notice.id}-dismiss`}
            accessibilityLabel={HOUSEHOLD_SHARING_COPY.dismissNotice}
            icon={<Icon name="close" size={18} color={colors.labelSecondary} />}
            onPress={() => dismiss.mutate({ id: notice.id })}
          />
        </View>
      ))}
    </View>
  );
}
