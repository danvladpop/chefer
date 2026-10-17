import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  FRIENDS_COPY,
  LEGAL_VERSIONS,
  type ActivateResultDto,
  type FriendsMeDto,
  type ProfileVisibility,
} from '@chefer/types';
import {
  Avatar,
  Button,
  colors,
  DONE_FIELD_PROPS,
  FormField,
  haptics,
  Input,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  Text,
  useScrollFieldIntoView,
} from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { openLegal } from '../../legal/open-legal';
import { textRejectedOf } from '../api/friends-errors';
import { useIsOnline } from '../api/use-is-online';
import { FriendsScreenHeader } from '../components/friends-screen-header';
import { FriendsConfirmSheet, type ConfirmCopy } from '../safety/confirm-copy';

// ─── Turn on Following (UX §4.1, PRD FR-02, E1) ───────────────────────────────
// `/friends` for someone who hasn't turned Following on. Nothing is stored
// until `Turn on Following`: the intro says who can find you and what
// followers see first. Private is preselected; Public goes through the Public
// confirm first (UX §11.2), chained from the confirm sheet's `onDone` (which
// fires after it is gone — iOS never presents while a sheet is dismissing).
// The name is the only text the word filter can reject here: the server's
// BAD_REQUEST + `data.textRejected: 'name'` shows `intro.nameRejected` under
// the fields. No email field, no email copy — people are found by name only.

/** What the Public confirm lists as shared on turn-on (plan, recipes, workouts are on by default). */
const PUBLIC_CONFIRM_SECTIONS = 'meals, recipes and workouts';

const PUBLIC_CONFIRM: ConfirmCopy = {
  title: FRIENDS_COPY.public.confirm.title,
  body: FRIENDS_COPY.public.confirm.body(PUBLIC_CONFIRM_SECTIONS),
  confirmLabel: FRIENDS_COPY.public.confirm.cta,
  cancelLabel: FRIENDS_COPY.common.cancel,
  destructive: false,
};

export type FriendsIntroProps = {
  me: FriendsMeDto;
  /** Turn-on succeeded (the cache already holds the new `friends.me`). */
  onActivated: (result: ActivateResultDto, visibility: ProfileVisibility) => void;
};

type NameErrors = { first?: string; last?: string };

function validateNames(first: string, last: string): NameErrors {
  const errors: NameErrors = {};
  if (first.trim().length < 1 || first.trim().length > 50) {
    errors.first = FRIENDS_COPY.intro.firstNameError;
  }
  if (last.trim().length < 1 || last.trim().length > 50) {
    errors.last = FRIENDS_COPY.intro.lastNameError;
  }
  return errors;
}

function VisibilityCard({
  testID,
  label,
  checked,
  onPress,
}: {
  testID: string;
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      testID={testID}
      pressScale="card"
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      className={cn(
        'min-h-14 flex-row items-center gap-3 rounded-xl border px-4 py-3',
        checked ? 'border-primary bg-primary/5' : 'border-border bg-card',
      )}
    >
      <Ionicons
        name={checked ? 'radio-button-on' : 'radio-button-off'}
        size={22}
        color={checked ? colors.primary : '#9ca3af'}
      />
      <Text className="min-w-0 flex-1">{label}</Text>
    </PressableScale>
  );
}

function IntroForm({ me, onActivated }: FriendsIntroProps) {
  const utils = trpc.useUtils();
  const activate = trpc.friends.activate.useMutation({ meta: { silent: true } });
  const online = useIsOnline();
  const scrollIntoView = useScrollFieldIntoView();
  const lastRef = useRef<TextInput>(null);

  const [firstName, setFirstName] = useState(me.firstName ?? '');
  const [lastName, setLastName] = useState(me.lastName ?? '');
  const [visibility, setVisibility] = useState<ProfileVisibility>('PRIVATE');
  const [attempted, setAttempted] = useState(false);
  const [nameRejected, setNameRejected] = useState(false);
  const [failed, setFailed] = useState(false);
  const [publicConfirm, setPublicConfirm] = useState(false);

  const errors = attempted ? validateNames(firstName, lastName) : {};
  const busy = activate.isPending;

  const submit = async (chosen: ProfileVisibility) => {
    setNameRejected(false);
    setFailed(false);
    try {
      const result = await activate.mutateAsync({
        visibility: chosen,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        documentVersion: LEGAL_VERSIONS.privacy,
      });
      // The home reads `friends.me`: write it now so the screen flips without
      // a flash of the intro, then reconcile (badge, counts) with the server.
      utils.friends.me.setData(undefined, result);
      void utils.friends.me.invalidate();
      track('friends_activated', { visibility: chosen === 'PUBLIC' ? 'public' : 'private' });
      onActivated(result, chosen);
    } catch (error) {
      haptics.error();
      if (textRejectedOf(error) === 'name') {
        track('friend_text_rejected', { field: 'name' });
        setNameRejected(true);
      } else {
        setFailed(true);
      }
    }
  };

  const turnOn = () => {
    if (busy) return;
    setAttempted(true);
    const problems = validateNames(firstName, lastName);
    if (problems.first || problems.last) {
      haptics.error();
      return;
    }
    if (visibility === 'PUBLIC') {
      setPublicConfirm(true);
      return;
    }
    void submit('PRIVATE');
  };

  const fullName = `${firstName} ${lastName}`.trim();
  const rejectedId = 'friends-intro-name-rejected';

  return (
    <KeyboardAwareScrollView
      testID="friends-intro-scroll"
      contentContainerClassName="gap-6 px-4 pb-6 pt-2"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      footer={
        <View className="gap-1 border-t border-border bg-background px-4 pb-2 pt-3">
          {failed ? (
            <Text
              testID="friends-intro-error"
              accessibilityRole="alert"
              className="pb-1 text-center text-sm text-destructive"
            >
              {FRIENDS_COPY.intro.error}
            </Text>
          ) : null}
          <Button
            testID="friends-intro-turn-on"
            size="lg"
            loading={busy}
            disabled={!online}
            accessibilityHint={online ? undefined : FRIENDS_COPY.offline.needsConnection}
            onPress={turnOn}
          >
            {FRIENDS_COPY.intro.cta}
          </Button>
          <Button
            testID="friends-intro-not-now"
            variant="ghost"
            disabled={busy}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          >
            {FRIENDS_COPY.intro.notNow}
          </Button>
        </View>
      }
    >
      <View className="gap-2">
        <Text accessibilityRole="header" variant="title" className="text-xl">
          {FRIENDS_COPY.intro.title}
        </Text>
        <Text variant="muted">{FRIENDS_COPY.intro.body}</Text>
      </View>

      <View className="gap-3">
        <Text accessibilityRole="header" variant="muted" className="text-xs uppercase">
          {FRIENDS_COPY.intro.nameHeading}
        </Text>
        <View className="flex-row items-start gap-3">
          <View className="pt-6">
            <Avatar name={fullName || 'Chefer user'} seed={fullName || 'me'} size="md" />
          </View>
          <FormField
            testID="friends-intro-first"
            label={FRIENDS_COPY.intro.firstName}
            required
            error={errors.first}
            className="min-w-0 flex-1"
          >
            <Input
              testID="friends-intro-first-input"
              value={firstName}
              onChangeText={(text) => {
                setFirstName(text);
                setNameRejected(false);
              }}
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              returnKeyType="next"
              maxLength={50}
              accessibilityLabel={FRIENDS_COPY.intro.firstName}
              accessibilityHint={
                errors.first ?? (nameRejected ? FRIENDS_COPY.intro.nameRejected : undefined)
              }
              onSubmitEditing={() => lastRef.current?.focus()}
              submitBehavior="submit"
            />
          </FormField>
          <FormField
            testID="friends-intro-last"
            label={FRIENDS_COPY.intro.lastName}
            required
            error={errors.last}
            className="min-w-0 flex-1"
          >
            <Input
              ref={lastRef}
              testID="friends-intro-last-input"
              value={lastName}
              onChangeText={(text) => {
                setLastName(text);
                setNameRejected(false);
              }}
              autoCapitalize="words"
              autoComplete="family-name"
              textContentType="familyName"
              {...DONE_FIELD_PROPS}
              maxLength={50}
              accessibilityLabel={FRIENDS_COPY.intro.lastName}
              accessibilityHint={
                errors.last ?? (nameRejected ? FRIENDS_COPY.intro.nameRejected : undefined)
              }
              onFocus={() => scrollIntoView(lastRef.current)}
            />
          </FormField>
        </View>
        {nameRejected ? (
          <Text
            testID={rejectedId}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="text-sm text-destructive"
          >
            {FRIENDS_COPY.intro.nameRejected}
          </Text>
        ) : null}
      </View>

      <View className="gap-2" accessibilityRole="radiogroup">
        <Text accessibilityRole="header" variant="muted" className="text-xs uppercase">
          {FRIENDS_COPY.intro.whoHeading}
        </Text>
        <VisibilityCard
          testID="friends-intro-visibility-private"
          label={FRIENDS_COPY.visibility.private}
          checked={visibility === 'PRIVATE'}
          onPress={() => setVisibility('PRIVATE')}
        />
        <VisibilityCard
          testID="friends-intro-visibility-public"
          label={FRIENDS_COPY.visibility.public}
          checked={visibility === 'PUBLIC'}
          onPress={() => setVisibility('PUBLIC')}
        />
      </View>

      <View className="gap-2">
        <Text accessibilityRole="header" variant="muted" className="text-xs uppercase">
          {FRIENDS_COPY.intro.whatHeading}
        </Text>
        {[
          FRIENDS_COPY.intro.what.plan,
          FRIENDS_COPY.intro.what.recipes,
          FRIENDS_COPY.intro.what.workouts,
        ].map((line) => (
          <View key={line} className="flex-row items-start gap-2">
            <Ionicons name="checkmark" size={18} color={colors.primary} />
            <Text className="min-w-0 flex-1">{line}</Text>
          </View>
        ))}
        <Text variant="muted">{FRIENDS_COPY.intro.what.change}</Text>
      </View>

      <View className="gap-2">
        <Text accessibilityRole="header" variant="muted" className="text-xs uppercase">
          {FRIENDS_COPY.intro.neverHeading}
        </Text>
        <Text variant="muted">{FRIENDS_COPY.intro.never}</Text>
        <Text variant="muted">{FRIENDS_COPY.intro.findable}</Text>
        <PressableScale
          testID="friends-intro-policy"
          accessibilityRole="link"
          accessibilityLabel={FRIENDS_COPY.intro.policy}
          onPress={() => openLegal('privacy')}
          className="min-h-11 flex-row items-center gap-1 self-start"
        >
          <Text className="text-sm font-medium text-primary">{FRIENDS_COPY.intro.policy}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </PressableScale>
      </View>

      <FriendsConfirmSheet
        testID="friends-intro-public-confirm"
        visible={publicConfirm}
        copy={PUBLIC_CONFIRM}
        onClose={() => setPublicConfirm(false)}
        onConfirm={() => true}
        // Chained: the activation starts only once the confirm is fully gone.
        onDone={() => void submit('PUBLIC')}
      />
    </KeyboardAwareScrollView>
  );
}

export function FriendsIntro(props: FriendsIntroProps) {
  return (
    <Screen testID="friends-intro" edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <FriendsScreenHeader title={FRIENDS_COPY.home.title} testID="friends-intro-header" />
      <IntroForm {...props} />
    </Screen>
  );
}
