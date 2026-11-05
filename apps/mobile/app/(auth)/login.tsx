import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, Pressable, View, type TextInput } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router, useFocusEffect } from 'expo-router';
import {
  Button,
  EMAIL_FIELD_PROPS,
  Input,
  PasswordInput,
  Text,
  useScrollFieldIntoView,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import {
  clearAccountDeletedNotice,
  isAccountDeletedNoticeVisible,
  subscribeAccountDeletedNotice,
} from '../../src/features/auth/account-deleted-notice';
import { AuthField, AuthScreen } from '../../src/features/auth/auth-screen';
import { takeEmailHint } from '../../src/features/auth/email-hint';
import {
  EMPTY_PASSWORD_ENTRY,
  nextPasswordEntry,
  type PasswordEntry,
} from '../../src/features/auth/password-entry';
import { saveCredentials } from '../../src/features/auth/save-credentials';
import { loginSchema, type LoginFormValues } from '../../src/features/auth/schemas';
import {
  clearSessionExpired,
  isSessionExpired,
  subscribeSessionExpired,
} from '../../src/features/auth/session-expired';
import { SocialSignIn } from '../../src/features/auth/social/social-sign-in';
import { useSession } from '../../src/features/auth/use-session';
import { authValidationMessage } from '../../src/features/auth/validation-copy';
import { setToken } from '../../src/lib/auth-store';
import { useT } from '../../src/lib/i18n';
import { trpc } from '../../src/lib/trpc';

export default function LoginScreen() {
  return (
    <AuthScreen testID="login-scroll">
      <LoginForm />
    </AuthScreen>
  );
}

function LoginForm() {
  const { t } = useT();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  // UX-25 (T-25.1, AC2): "Welcome back" only once this device has actually
  // signed in before — reached here by deep link, back navigation from
  // Welcome, or any other path that skips the (auth)/index.tsx gate.
  const { hasSignedInBefore } = useSession();
  // UX-ACC-10: say why the user is here when a 401 ended their session.
  const sessionExpired = useSyncExternalStore(subscribeSessionExpired, isSessionExpired);
  // UX-ACC-11: one-time confirmation after the account was deleted.
  const accountDeleted = useSyncExternalStore(
    subscribeAccountDeletedNotice,
    isAccountDeletedNoticeVisible,
  );

  // UX-ACC-09: coming back to this screen (from "Go to sign in" after a reset,
  // or "Sign in" on an existing-account notice) must not show the previous
  // attempt's password — least of all in clear text.
  const [revealed, setRevealed] = useState(false);
  // F8: only a typed password is offered to the password manager after sign-in.
  const passwordEntry = useRef<PasswordEntry>(EMPTY_PASSWORD_ENTRY);

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = trpc.auth.login.useMutation({
    meta: { silent: true },
    // UX-ACC-08: a wrong password must not sit in the field for iOS to offer
    // "Save Password" with it.
    onError: () => {
      setValue('password', '');
      passwordEntry.current = EMPTY_PASSWORD_ENTRY;
      passwordRef.current?.focus();
    },
    onSuccess: async (data, credentials) => {
      if (data.session) {
        // Flips the root layout's auth gate straight into (food) (or Gym Today).
        await setToken(data.session.token);
        clearSessionExpired();
        clearAccountDeletedNotice();
        // F8: a typed password goes to the password manager (Android; iOS
        // prompts by itself when this screen unmounts).
        if (passwordEntry.current.kind === 'typed') {
          void saveCredentials(credentials.email, credentials.password);
        }
      }
    },
  });

  // UX-ACC-09: on every focus, drop the old password and server error and
  // prefill the email the user was just typing on another auth screen.
  useFocusEffect(
    useCallback(() => {
      setValue('password', '');
      passwordEntry.current = EMPTY_PASSWORD_ENTRY;
      setRevealed(false);
      const hint = takeEmailHint();
      if (hint && !getValues('email')) setValue('email', hint);
      login.reset();
      // UX-ACC-11: the deletion notice is shown once — gone when this screen is left.
      return () => clearAccountDeletedNotice();
      // `login.reset` is a stable function; only a focus should re-run this.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setValue, getValues]),
  );

  // UX-ACC-18: a second "go" from the keyboard while a request is in flight
  // must not fire it again.
  const onSubmit = handleSubmit((values) => {
    if (login.isPending) return;
    Keyboard.dismiss();
    login.mutate(values);
  });
  // UX-ACC-07: the stale server error ("Invalid email or password") goes as
  // soon as the user edits either field.
  const clearServerError = () => {
    if (login.error) login.reset();
  };

  return (
    <>
      {accountDeleted && (
        <View
          testID="login-account-deleted"
          accessibilityRole="alert"
          className="rounded-md bg-positive/10 px-3 py-2"
        >
          <Text className="text-sm text-positive">{t('auth.login.accountDeleted')}</Text>
        </View>
      )}
      {sessionExpired && (
        <View
          testID="login-session-expired"
          accessibilityRole="alert"
          className="rounded-md bg-attention/10 px-3 py-2"
        >
          <Text className="text-sm text-attention">{t('auth.login.sessionExpired')}</Text>
        </View>
      )}
      <Text variant="title" testID="login-title">
        {hasSignedInBefore ? t('auth.login.title') : t('auth.login.titleFirstTime')}
      </Text>
      <Text variant="muted">
        {hasSignedInBefore ? t('auth.login.subtitleReturning') : t('auth.login.subtitleFirstTime')}
      </Text>

      <AuthField
        label={t('auth.fields.emailShort')}
        error={authValidationMessage(t, errors.email?.message)}
      >
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={emailRef}
              testID="login-email"
              {...EMAIL_FIELD_PROPS}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              onFocus={() => scrollFieldIntoView(emailRef.current)}
              onBlur={onBlur}
              editable={!login.isPending}
              onChangeText={(text) => {
                clearServerError();
                onChange(text);
              }}
              value={value}
            />
          )}
        />
      </AuthField>

      <AuthField
        label={t('auth.fields.password')}
        error={authValidationMessage(t, errors.password?.message)}
      >
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              ref={passwordRef}
              testID="login-password"
              revealed={revealed}
              onRevealedChange={setRevealed}
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
              onFocus={() => scrollFieldIntoView(passwordRef.current)}
              onBlur={onBlur}
              editable={!login.isPending}
              onChangeText={(text) => {
                clearServerError();
                passwordEntry.current = nextPasswordEntry(passwordEntry.current, text);
                onChange(text);
              }}
              value={value}
            />
          )}
        />
      </AuthField>

      {/* F-M-AUTH-3-1: the reset flow, same entry point as the web form. */}
      <Pressable
        testID="login-forgot-password"
        accessibilityRole="link"
        onPress={() => router.push('/forgot-password')}
        className="min-h-11 justify-center self-end"
      >
        <Text variant="muted" className="font-semibold text-primary">
          {t('auth.login.forgot')}
        </Text>
      </Pressable>

      {login.error && (
        <Text variant="muted" className="text-destructive" testID="login-error">
          {userFacingErrorMessage(login.error)}
        </Text>
      )}

      <Button testID="login-submit" loading={login.isPending} onPress={() => void onSubmit()}>
        {t('auth.login.submit')}
      </Button>

      {/* WP-22: Continue with Apple / Google (hidden until configured). */}
      <SocialSignIn />

      {hasSignedInBefore ? (
        <View className="flex-row justify-center gap-1">
          <Text variant="muted">{t('auth.login.noAccountYet')}</Text>
          <Link href="/register" testID="login-to-register">
            <Text variant="muted" className="font-semibold text-primary">
              {t('auth.login.createOne')}
            </Text>
          </Link>
        </View>
      ) : (
        // UX-25 (T-25.1): a first-timer who reached Sign in without going
        // through Welcome gets the same full-width CTA Welcome would have
        // shown, not a small link easy to miss.
        <Button
          testID="login-to-register"
          variant="outline"
          onPress={() => router.push('/register')}
        >
          {t('auth.login.createCta')}
        </Button>
      )}
    </>
  );
}
