import { useRef, useState } from 'react';
import { Keyboard, Pressable, View, type TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  authEmailSchema,
  CURRENT_TERMS_VERSION,
  newPasswordSchema,
  passwordConfirmationSchema,
} from '@chefer/types';
import {
  EMAIL_FIELD_PROPS,
  Input,
  PasswordInput,
  PressableScale,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  ONBOARDING_V4_COPY as COPY,
  detectRegion,
  userFacingErrorMessage,
} from '@chefer/utils';
import { track } from '../../lib/analytics';
import { setToken } from '../../lib/auth-store';
import { getTranslator } from '../../lib/i18n';
import { trpc } from '../../lib/trpc';
import { setEmailHint } from '../auth/email-hint';
import { isAccountExistsError } from '../auth/errors';
import { NEW_PASSWORD_FIELD_PROPS } from '../auth/password-fields';
import { clearPendingOnboarding, requestOnboarding } from '../auth/pending-onboarding';
import { saveCredentials } from '../auth/save-credentials';
import {
  SocialConsentLine,
  SocialSignIn,
  useHasSocialProviders,
} from '../auth/social/social-sign-in';
import { openLegal } from '../legal/open-legal';
import { BiscuitStage, V4Ghost, V4Heading, V4Primary, V4Screen, V4TopBar } from './v4-ui';

// Onboarding V4 — "Save your plan" (boards OnbV4Account + OnbV4AccountEmail).
// Apple / Google first (their own consent line, as today), then email:
// email + password + confirm (F9: one Show toggle reveals both; both are
// `newPassword` so iOS's strong password fills both) and ONE box for terms + age
// that sends both `acceptedTerms` and `ageConfirmed` (legal sign-off pending,
// see the PR). Session hand-off is the register screen's, unchanged.

function fieldError(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}): string | null {
  return result.success ? null : (result.error?.issues[0]?.message ?? null);
}

export function AccountV4() {
  const c = useThemeColors();
  const hasSocial = useHasSocialProviders();
  const [emailMode, setEmailMode] = useState(!hasSocial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const confirmRef = useRef<TextInput>(null);
  const [revealed, setRevealed] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const register = trpc.auth.register.useMutation({
    meta: { silent: true },
    onSuccess: async (data, account) => {
      track('signup_completed', {});
      if (data.session) {
        // Same order as the register screen (R-18b): flag onboarding, then the token.
        requestOnboarding();
        try {
          await setToken(data.session.token);
        } catch (err) {
          clearPendingOnboarding();
          throw err;
        }
        // F8: offer the new account's credential (Android; see save-credentials.ts).
        void saveCredentials(account.email, account.password);
      }
    },
  });

  const emailError = fieldError(authEmailSchema.safeParse(email));
  const passwordError = fieldError(newPasswordSchema.safeParse(password));
  // Derived from the live values, so a stale mismatch can't outlive a fix (UX-ACC-16).
  const confirmError = fieldError(
    passwordConfirmationSchema.safeParse({ password, confirmPassword }),
  );
  const agreeError = agreed ? null : COPY.accountAgreeRequired;

  function submit() {
    setShowErrors(true);
    if (emailError || passwordError || confirmError || agreeError || register.isPending) return;
    Keyboard.dismiss();
    const region = detectRegion();
    register.mutate({
      email,
      password,
      acceptedTerms: true,
      ageConfirmed: true,
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
      ...(region ? { region } : {}),
      // ADR 0002: the confirmation email goes out in the app's language.
      deviceLocale: getTranslator().locale,
    });
  }

  const accountExists = isAccountExistsError(register.error);
  const back = () => (emailMode && hasSocial ? setEmailMode(false) : router.back());

  const agree = (
    <Pressable
      onPress={() => setAgreed((a) => !a)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: agreed }}
      testID="register-v4-agree"
      className="min-h-11 flex-row items-center gap-2.5"
    >
      <View
        className={cn(
          'h-[22px] w-[22px] items-center justify-center rounded-[6px]',
          agreed ? 'bg-brand' : 'border-2 border-separator bg-surface',
        )}
      >
        {agreed ? <Ionicons name="checkmark" size={15} color={c.onBrand} /> : null}
      </View>
      <Text className="min-w-0 flex-1 text-subhead text-label-secondary">
        I’m 16+ and agree to the{' '}
        <Text
          accessibilityRole="link"
          className="text-subhead text-brand underline"
          onPress={() => openLegal('terms')}
        >
          Terms
        </Text>{' '}
        and{' '}
        <Text
          accessibilityRole="link"
          className="text-subhead text-brand underline"
          onPress={() => openLegal('privacy')}
        >
          Privacy Policy
        </Text>
      </Text>
    </Pressable>
  );

  if (!emailMode) {
    return (
      <V4Screen top={<V4TopBar onBack={back} />} testID="register-v4">
        <BiscuitStage loop="curious" size={180} />
        <V4Heading title={COPY.accountTitle} lede={COPY.accountLede} />
        <SocialSignIn showDivider={false} />
        <PressableScale
          onPress={() => setEmailMode(true)}
          accessibilityRole="button"
          accessibilityLabel={COPY.accountEmail}
          testID="register-v4-email"
          className="min-h-[50px] flex-row items-center justify-center gap-2.5 rounded-control border border-separator bg-surface px-4"
        >
          <Ionicons name="mail-outline" size={20} color={c.brand} />
          <Text className="text-headline font-semibold text-label">{COPY.accountEmail}</Text>
        </PressableScale>
        <SocialConsentLine />
      </V4Screen>
    );
  }

  return (
    <V4Screen
      top={<V4TopBar onBack={back} />}
      testID="register-v4-email-form"
      footer={
        <V4Primary
          label={COPY.accountCreate}
          onPress={submit}
          loading={register.isPending}
          testID="register-submit"
        />
      }
    >
      <V4Heading title={COPY.accountEmailTitle} align="left" />
      <View className="gap-1.5">
        <Text className="text-subhead font-semibold text-label-secondary">Email</Text>
        <Input
          testID="register-email"
          {...EMAIL_FIELD_PROPS}
          accessibilityLabel="Email"
          value={email}
          onChangeText={(t) => {
            if (register.error) register.reset();
            setEmail(t);
          }}
          editable={!register.isPending}
          className="min-h-[50px] rounded-control border-separator"
        />
        {showErrors && emailError ? (
          <Text className="text-caption text-destructive">{emailError}</Text>
        ) : null}
      </View>
      <View className="gap-1.5">
        <Text className="text-subhead font-semibold text-label-secondary">Password</Text>
        <PasswordInput
          testID="register-password"
          {...NEW_PASSWORD_FIELD_PROPS}
          accessibilityLabel="Password"
          revealed={revealed}
          onRevealedChange={setRevealed}
          value={password}
          onChangeText={(t) => {
            if (register.error) register.reset();
            setPassword(t);
          }}
          editable={!register.isPending}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        {showErrors && passwordError ? (
          <Text className="text-caption text-destructive">{passwordError}</Text>
        ) : null}
      </View>
      <View className="gap-1.5">
        <Text className="text-subhead font-semibold text-label-secondary">Confirm password</Text>
        <PasswordInput
          ref={confirmRef}
          testID="register-confirm-password"
          {...NEW_PASSWORD_FIELD_PROPS}
          accessibilityLabel="Confirm password"
          revealed={revealed}
          hideToggle
          value={confirmPassword}
          onChangeText={(t) => {
            if (register.error) register.reset();
            setConfirmPassword(t);
          }}
          editable={!register.isPending}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {showErrors && confirmError ? (
          <Text className="text-caption text-destructive" testID="register-confirm-password-error">
            {confirmError}
          </Text>
        ) : null}
      </View>
      {agree}
      {showErrors && agreeError ? (
        <Text className="-mt-3 text-caption text-destructive">{agreeError}</Text>
      ) : null}
      {register.error ? (
        <View className="gap-1" testID="register-error-block">
          <Text className="text-subhead text-destructive" testID="register-error">
            {userFacingErrorMessage(register.error)}
          </Text>
          {accountExists ? (
            <V4Ghost
              label={COPY.accountSignInInstead}
              onPress={() => {
                setEmailHint(email);
                router.dismissTo('/login');
              }}
            />
          ) : null}
        </View>
      ) : null}
      <View className="flex-row justify-center gap-1">
        <Text className="text-subhead text-label-secondary">{COPY.accountHaveAccount}</Text>
        <Text
          accessibilityRole="link"
          className="text-subhead font-semibold text-brand"
          onPress={() => router.push('/login')}
        >
          Sign in
        </Text>
      </View>
    </V4Screen>
  );
}
