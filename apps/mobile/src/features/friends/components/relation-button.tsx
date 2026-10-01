import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, type View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { FRIENDS_COPY, type ProfileVisibility, type Relation } from '@chefer/types';
import {
  Button,
  DENSE_MAX_FONT_SCALE,
  duration,
  haptics,
  Text,
  timing,
  useReducedMotion,
  useSnackbar,
  type ButtonProps,
} from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { useIsOnline } from '../api/use-is-online';
import { useRelationActions } from '../api/use-relation-actions';
import { FRIENDS_CONFIRMS, FriendsConfirmSheet } from '../safety/confirm-copy';

// ─── RelationButton: the one follow control (UX §3.3, §13, §14) ───────────────
// The same states and words in search, lists, suggestions, Activity and
// profiles:
//   none (they don't follow me) → `Follow`        default    → follow
//   none (they follow me)       → `Follow back`   default    → follow
//   requested                   → `Requested`     outline    → confirm → unfollow
//   following                   → `Following`     secondary  → confirm → unfollow
//   self                        → `Edit sharing`  outline    → /friends/settings
// Fixed width per size (sm 112 pt, md 140 pt) so a label change never
// reflows the row; the label crossfades (MO-14, `duration.fast`).
// Optimistic (MO-08): the flip is instant with `haptics.selection`, and the
// cache of every list/profile showing this person flips with it
// (relation-cache.ts). The server's returned relation is the truth (Follow on
// a profile that just went private settles on `Requested`). On error: back to
// the old state, a ±4 pt shake, `haptics.error`, and the snackbar
// `Couldn’t update. Try again.` with `Retry`. Offline: disabled, hint
// `Needs a connection`.

export type FollowSource = 'search' | 'suggestion' | 'followers' | 'profile' | 'activity';

export type RelationButtonProps = {
  userId: string;
  relation: Relation;
  followsYou: boolean;
  /** Full display name (accessibility labels, announcements). */
  name: string;
  /** First name for the confirm titles. Defaults to the first word of `name`. */
  firstName?: string;
  size?: 'sm' | 'md';
  /** Where the button is (analytics `friend_follow.source`). */
  source: FollowSource;
  /**
   * The person's visibility, when the screen knows it (profile). Picks the
   * optimistic outcome of Follow (`Following` for public, else `Requested`)
   * and the unfollow confirm's body. Lists don't know it: the server settles it.
   */
  visibility?: ProfileVisibility;
  disabled?: boolean;
  /** After the server settles a change (the truth). */
  onRelationChange?: (relation: Relation) => void;
  testID?: string;
};

type ButtonVariant = NonNullable<ButtonProps['variant']>;

type RelationView = {
  label: string;
  variant: ButtonVariant;
  a11yLabel: string;
};

/** The label, variant and accessibility label of each state (UX §3.3). */
export function relationView(relation: Relation, followsYou: boolean, name: string): RelationView {
  const copy = FRIENDS_COPY.relation;
  switch (relation) {
    case 'self':
      return { label: copy.editSharing, variant: 'outline', a11yLabel: copy.a11y.self };
    case 'requested':
      return { label: copy.requested, variant: 'outline', a11yLabel: copy.a11y.requested(name) };
    case 'following':
      return { label: copy.following, variant: 'secondary', a11yLabel: copy.a11y.following(name) };
    case 'none':
    default:
      return followsYou
        ? { label: copy.followBack, variant: 'default', a11yLabel: copy.a11y.followBack(name) }
        : { label: copy.follow, variant: 'default', a11yLabel: copy.a11y.follow(name) };
  }
}

/** Width per size: a label change never reflows the row. */
export const RELATION_BUTTON_WIDTH = { sm: 112, md: 140 } as const;

const SHAKE_PT = 4;

function announce(message: string): void {
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // No accessibility service (tests, some Android builds).
  }
}

export function RelationButton({
  userId,
  relation,
  followsYou,
  name,
  firstName,
  size = 'sm',
  source,
  visibility,
  disabled = false,
  onRelationChange,
  testID = `friends-relation-${userId}`,
}: RelationButtonProps) {
  const actions = useRelationActions();
  const snackbar = useSnackbar();
  const online = useIsOnline();
  const reduced = useReducedMotion();

  // What's on screen. Follows the prop (the cache) except while a change is
  // in flight, when the optimistic state wins.
  const [shown, setShown] = useState<Relation>(relation);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!inFlight.current) setShown(relation);
  }, [relation]);

  const [confirm, setConfirm] = useState<'unfollow' | 'cancelRequest' | null>(null);
  const buttonRef = useRef<View>(null);

  // MO-08 rollback shake: ±4 pt over 3 × `instant` (300 ms).
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.get() }] }));
  const shake = () => {
    haptics.error();
    if (reduced) return;
    shakeX.set(
      withSequence(
        withTiming(-SHAKE_PT, timing(duration.instant)),
        withTiming(SHAKE_PT, timing(duration.instant)),
        withTiming(0, timing(duration.instant)),
      ),
    );
  };

  const first = firstName ?? name.split(/\s+/)[0] ?? name;
  const view = relationView(shown, followsYou, name);

  const run = async (kind: 'follow' | 'unfollow') => {
    if (inFlight.current) return;
    inFlight.current = true;
    const before = shown;
    const optimistic: Relation =
      kind === 'follow' ? (visibility === 'PUBLIC' ? 'following' : 'requested') : 'none';
    setShown(optimistic);
    haptics.selection();

    const result =
      kind === 'follow'
        ? await actions.follow(userId, optimistic === 'following' ? 'following' : 'requested')
        : await actions.unfollow(userId);
    inFlight.current = false;

    if (!result.ok) {
      setShown(before);
      shake();
      snackbar.show({
        message: FRIENDS_COPY.relation.error,
        actionLabel: FRIENDS_COPY.relation.errorAction,
        onAction: () => void run(kind),
      });
      return;
    }

    setShown(result.relation);
    onRelationChange?.(result.relation);
    if (kind === 'follow') {
      const outcome = result.relation === 'following' ? 'following' : 'requested';
      track('friend_follow', { source, outcome });
      announce(
        outcome === 'following'
          ? FRIENDS_COPY.announce.nowFollowing(name)
          : FRIENDS_COPY.announce.requestSent(name),
      );
    } else if (before === 'following') {
      track('friend_unfollowed', { wasMutual: followsYou });
    }
  };

  const onPress = () => {
    switch (shown) {
      case 'self':
        router.push('/friends/settings');
        return;
      case 'following':
        setConfirm('unfollow');
        return;
      case 'requested':
        setConfirm('cancelRequest');
        return;
      case 'none':
      default:
        void run('follow');
    }
  };

  // UX §13: after a sheet closes, VoiceOver focus returns to its trigger.
  const returnFocus = () => {
    const node = buttonRef.current ? findNodeHandle(buttonRef.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  };

  const offline = !online && shown !== 'self';
  const width = RELATION_BUTTON_WIDTH[size];

  return (
    <>
      <Animated.View ref={buttonRef} testID={`${testID}-frame`} style={[{ width }, shakeStyle]}>
        <Button
          testID={testID}
          size={size === 'md' ? 'default' : 'sm'}
          variant={view.variant}
          className="w-full px-2"
          disabled={disabled || offline}
          accessibilityLabel={view.a11yLabel}
          accessibilityHint={offline ? FRIENDS_COPY.offline.needsConnection : undefined}
          onPress={onPress}
        >
          <Animated.View
            key={view.label}
            entering={reduced ? undefined : FadeIn.duration(duration.fast)}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
              className={cn(
                'text-sm font-medium',
                view.variant === 'default' && 'text-primary-foreground',
                view.variant === 'secondary' && 'text-secondary-foreground',
              )}
            >
              {view.label}
            </Text>
          </Animated.View>
        </Button>
      </Animated.View>
      <FriendsConfirmSheet
        testID={`${testID}-confirm`}
        visible={confirm !== null}
        copy={
          confirm === 'cancelRequest'
            ? FRIENDS_CONFIRMS.cancelRequest()
            : FRIENDS_CONFIRMS.unfollow(first, visibility)
        }
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          // Optimistic: close at once and flip; a failure shakes + snackbars.
          void run('unfollow');
          return true;
        }}
        onExited={returnFocus}
      />
    </>
  );
}
