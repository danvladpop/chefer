import { useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FRIENDS_COPY, type FriendProfileDto, type FriendsMeDto } from '@chefer/types';
import { Avatar, Badge, Button, Sheet, Skeleton, Text } from '@chefer/ui-mobile';
import { RelationButton } from '../components/relation-button';
import { ReportSheet } from '../safety/report-sheet';
import { BlockConfirmSheet, RemoveFollowerConfirmSheet } from '../safety/safety-confirm-sheets';

// ─── ProfileHeader (UX §8.1, §8.3, §11.4) ─────────────────────────────────────
// Large avatar, name (the screen's one heading), `Follows you`, counts, the
// RelationButton (`md`, knows the visibility so a public Follow shows
// `Following` at once) and the overflow `…`:
//   Report and block {first} → ReportSheet (one tap reports AND blocks)
//   Block {first}            → the Block confirm
//   Remove follower          → only when they follow me
// The overflow is a Sheet; the chosen action's sheet opens from its
// `onExited` (iOS: never present while another sheet is dismissing). After a
// block or a report the profile is gone, so we back out of it.
// My own profile (preview, §8.3): no overflow, `Edit sharing`, the
// Private/Public badge, the preview banner and the forced-private line.

// TODO(F2.2 → copy owner): `Remove follower` (the overflow item, UX §8.1) has
// no FRIENDS_COPY key; the literal is the UX string. Move it to
// `FRIENDS_COPY.remove.menu` and use that here.
export const REMOVE_FOLLOWER_MENU_LABEL = 'Remove follower';

type MenuAction = 'report' | 'block' | 'remove';

export function ProfileHeader({
  profile,
  me,
  testID = 'friends-profile-header',
}: {
  profile: FriendProfileDto;
  me: FriendsMeDto | undefined;
  testID?: string;
}) {
  const { user, counts, isSelf, visibility } = profile;
  const [menuOpen, setMenuOpen] = useState(false);
  const pending = useRef<MenuAction | null>(null);
  const [action, setAction] = useState<MenuAction | null>(null);
  const overflowRef = useRef<View>(null);

  const returnFocus = () => {
    const node = overflowRef.current ? findNodeHandle(overflowRef.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  };
  const choose = (next: MenuAction) => {
    pending.current = next;
    setMenuOpen(false);
  };
  const person = { id: user.id, firstName: user.firstName, displayName: user.displayName };
  const leaveProfile = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/friends');
  };

  return (
    <View testID={testID} className="items-center gap-2 px-4 pb-4">
      {isSelf ? <PreviewBanners profile={profile} me={me} testID={testID} /> : null}
      <Avatar name={user.displayName} seed={user.id} imageUrl={user.imageUrl} size="lg" />
      <Text
        testID={`${testID}-name`}
        accessibilityRole="header"
        className="text-center text-2xl font-bold text-gray-900"
      >
        {user.displayName}
      </Text>
      {!isSelf && user.followsYou ? (
        <Badge testID={`${testID}-follows-you`} variant="secondary">
          {FRIENDS_COPY.profile.followsYou}
        </Badge>
      ) : null}
      <Text testID={`${testID}-counts`} variant="muted" className="text-center">
        {FRIENDS_COPY.profile.counts(counts.followers, counts.following)}
      </Text>
      <View className="flex-row items-center gap-2 pt-1">
        <RelationButton
          testID="friends-profile-relation"
          userId={user.id}
          relation={isSelf ? 'self' : user.relation}
          followsYou={user.followsYou}
          name={user.displayName}
          firstName={user.firstName}
          size="md"
          source="profile"
          visibility={visibility}
        />
        {!isSelf ? (
          <Pressable
            ref={overflowRef}
            testID="friends-profile-overflow"
            accessibilityRole="button"
            accessibilityLabel={FRIENDS_COPY.profile.moreOptions(user.displayName)}
            onPress={() => setMenuOpen(true)}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <Ionicons name="ellipsis-horizontal" size={22} color="#1f2937" />
          </Pressable>
        ) : null}
      </View>

      {!isSelf ? (
        <>
          <Sheet
            testID="friends-profile-menu"
            visible={menuOpen}
            title={user.displayName}
            onClose={() => {
              pending.current = null;
              setMenuOpen(false);
            }}
            onExited={() => {
              const next = pending.current;
              pending.current = null;
              if (next) setAction(next);
              else returnFocus();
            }}
          >
            <View className="gap-2">
              <Button
                testID="friends-profile-menu-report"
                variant="outline"
                className="min-h-12 justify-start"
                onPress={() => choose('report')}
              >
                {FRIENDS_COPY.report.profileAction(user.firstName)}
              </Button>
              <Button
                testID="friends-profile-menu-block"
                variant="outline"
                className="min-h-12 justify-start"
                onPress={() => choose('block')}
              >
                {`${FRIENDS_COPY.block.cta} ${user.firstName}`}
              </Button>
              {user.followsYou ? (
                <Button
                  testID="friends-profile-menu-remove"
                  variant="outline"
                  className="min-h-12 justify-start"
                  onPress={() => choose('remove')}
                >
                  {REMOVE_FOLLOWER_MENU_LABEL}
                </Button>
              ) : null}
              <Button
                testID="friends-profile-menu-cancel"
                variant="ghost"
                size="lg"
                onPress={() => {
                  pending.current = null;
                  setMenuOpen(false);
                }}
              >
                {FRIENDS_COPY.common.cancel}
              </Button>
            </View>
          </Sheet>
          <ReportSheet
            testID="friends-profile-report"
            visible={action === 'report'}
            person={person}
            onClose={() => setAction(null)}
            onReported={leaveProfile}
            onExited={returnFocus}
          />
          <BlockConfirmSheet
            testID="friends-profile-block"
            from="profile"
            visible={action === 'block'}
            person={person}
            onClose={() => setAction(null)}
            onDone={leaveProfile}
            onExited={returnFocus}
          />
          <RemoveFollowerConfirmSheet
            testID="friends-profile-remove"
            visible={action === 'remove'}
            person={person}
            onClose={() => setAction(null)}
            onExited={returnFocus}
          />
        </>
      ) : null}
    </View>
  );
}

function PreviewBanners({
  profile,
  me,
  testID,
}: {
  profile: FriendProfileDto;
  me: FriendsMeDto | undefined;
  testID: string;
}) {
  const forcedPrivate = me?.settings?.forcedPrivate === true;
  return (
    <View className="w-full items-center gap-2 pb-2">
      <Badge testID={`${testID}-preview`} variant="info">
        {FRIENDS_COPY.preview.banner}
      </Badge>
      {forcedPrivate ? (
        <View
          testID={`${testID}-forced-private`}
          className="w-full rounded-xl bg-amber-50 px-3 py-2"
        >
          <Text className="text-sm text-amber-900">{FRIENDS_COPY.preview.forcedPrivate}</Text>
        </View>
      ) : null}
      <Badge testID={`${testID}-visibility`} variant="outline">
        {profile.visibility === 'PUBLIC'
          ? FRIENDS_COPY.profile.badgePublic
          : FRIENDS_COPY.profile.badgePrivate}
      </Badge>
    </View>
  );
}

export function ProfileHeaderSkeleton({ testID = 'friends-profile-loading' }: { testID?: string }) {
  return (
    <View testID={testID} accessible accessibilityLabel="Loading" className="gap-4 px-4">
      <View className="items-center gap-2">
        <Skeleton className="h-[72px] w-[72px] rounded-full" />
        <Skeleton className="h-7 w-48 rounded-md" />
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="h-11 w-[140px] rounded-lg" />
      </View>
      <Skeleton className="h-10 w-36 self-center rounded-lg" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </View>
  );
}
