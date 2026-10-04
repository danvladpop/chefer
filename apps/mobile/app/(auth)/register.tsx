import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View, type TextInput } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { CURRENT_TERMS_VERSION } from '@chefer/types';
import { Button, Input, PasswordInput, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { detectRegion, userFacingErrorMessage } from '@chefer/utils';
import { AuthField, AuthScreen } from '../../src/features/auth/auth-screen';
import { ConsentCheckbox } from '../../src/features/auth/consent-checkbox';
import { AUTH_COPY } from '../../src/features/auth/copy';
import { setEmailHint } from '../../src/features/auth/email-hint';
import { isAccountExistsError } from '../../src/features/auth/errors';
import { NEW_PASSWORD_FIELD_PROPS } from '../../src/features/auth/password-fields';
import {
  clearPendingOnboarding,
  requestOnboarding,
} from '../../src/features/auth/pending-onboarding';
import {
  clearRegisterDraft,
  getRegisterDraft,
  setRegisterDraft,
} from '../../src/features/auth/register-draft';
import { registerSchema, type RegisterFormValues } from '../../src/features/auth/schemas';
import { SocialSignIn } from '../../src/features/auth/social/social-sign-in';
import { useConfirmPasswordError } from '../../src/features/auth/use-confirm-password';
import { track } from '../../src/lib/analytics';
import { setToken } from '../../src/lib/auth-store';
import { trpc } from '../../src/lib/trpc';

// UX-25 (T-25.1) / UX-26 (T-26.5) / UX-39 (T-39.1) / B-25 / B-31.

function withRegion(region: string | null): { region?: string } {
  return region ? { region } : {};
}

export default function RegisterScreen() {
  return (
    <AuthScreen testID="register-scroll">
      <RegisterForm />
    </AuthScreen>
  );
}

function RegisterForm() {
  const firstNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  // One toggle (on the password field) reveals both fields, as on web.
  const [revealed, setRevealed] = useState(false);

  const draft = getRegisterDraft();

  const {
    control,
    handleSubmit,
    watch,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      acceptedTerms: false,
      ageConfirmed: false,
      ...draft,
    },
  });

  // T-39.1: keep the in-app legal screen (a real route) from losing the
  // in-progress form — an ephemeral, in-memory cache, not SecureStore.
  useEffect(() => {
    const sub = watch((values) => setRegisterDraft(values));
    return () => sub.unsubscribe();
  }, [watch]);

  // Bug B-25 / UX-ACC-16: "Passwords do not match" is re-checked when EITHER
  // field changes and is never shown under two identical passwords.
  const confirmError = useConfirmPasswordError(watch, trigger, errors);

  const register = trpc.auth.register.useMutation({
    meta: { silent: true },
    onSuccess: async (data) => {
      track('signup_completed', {});
      clearRegisterDraft();
      if (data.session) {
        // Dogfood feedback #9: guide new accounts through onboarding instead
        // of landing straight on the dashboard. Sign-in (login.tsx) does NOT
        // do this — only a fresh registration goes through the wizard.
        // R-18b: raised BEFORE setToken (which flips the auth guard and mounts
        // Today); the Food tab layout redirects to /onboarding while it is up.
        // An imperative router.replace after the awaited token writes raced the
        // navigator on a fresh install and left the account on Today.
        requestOnboarding();
        try {
          await setToken(data.session.token);
        } catch (err) {
          clearPendingOnboarding();
          throw err;
        }
      }
    },
  });

  // UX-ACC-18: no second submit from the keyboard while one is in flight.
  const onSubmit = handleSubmit((values) => {
    if (register.isPending) return;
    register.mutate({
      email: values.email,
      password: values.password,
      ...(values.firstName ? { firstName: values.firstName } : {}),
      acceptedTerms: values.acceptedTerms,
      ageConfirmed: values.ageConfirmed,
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
      // Location defaults (P2-6): the device region seeds units + currency.
      // Intl only — Hermes ships it, no native dependency.
      ...withRegion(detectRegion()),
    });
  });
  // UX-ACC-07 / UX-ACC-15: the server error (including "already exists") goes
  // as soon as the user edits the email or password.
  const clearServerError = () => {
    if (register.error) register.reset();
  };
  const accountExists = isAccountExistsError(register.error);
  // UX-ACC-15: hand the address over so Sign in / Reset are one tap away.
  const goTo = (path: '/login' | '/forgot-password') => {
    setEmailHint(getValues('email'));
    if (path === '/login') router.dismissTo('/login');
    else router.push(path);
  };

  const openLegal = (doc: 'terms' | 'privacy') => router.push(`/legal/${doc}`);

  return (
    <>
      <Text variant="title" testID="register-title">
        Create your account
      </Text>
      <Text variant="muted">{AUTH_COPY.registerSubtitle}</Text>

      <AuthField label="First name (optional)">
        <Controller
          control={control}
          name="firstName"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={firstNameRef}
              testID="register-first-name"
              autoComplete="given-name"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => emailRef.current?.focus()}
              onFocus={() => scrollFieldIntoView(firstNameRef.current)}
              onBlur={onBlur}
              editable={!register.isPending}
              onChangeText={onChange}
              value={value ?? ''}
            />
          )}
        />
      </AuthField>

      <AuthField label="Email" error={errors.email?.message}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={emailRef}
              testID="register-email"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              onFocus={() => scrollFieldIntoView(emailRef.current)}
              onBlur={onBlur}
              editable={!register.isPending}
              onChangeText={(text) => {
                clearServerError();
                onChange(text);
              }}
              value={value}
            />
          )}
        />
      </AuthField>

      <AuthField label="Password" error={errors.password?.message}>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              ref={passwordRef}
              testID="register-password"
              revealed={revealed}
              onRevealedChange={setRevealed}
              {...NEW_PASSWORD_FIELD_PROPS}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmRef.current?.focus()}
              onFocus={() => scrollFieldIntoView(passwordRef.current)}
              onBlur={onBlur}
              editable={!register.isPending}
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
        label="Confirm password"
        error={confirmError}
        errorTestID="register-confirm-password-error"
      >
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              ref={confirmRef}
              testID="register-confirm-password"
              revealed={revealed}
              hideToggle
              {...NEW_PASSWORD_FIELD_PROPS}
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
              onFocus={() => scrollFieldIntoView(confirmRef.current)}
              onBlur={onBlur}
              editable={!register.isPending}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
      </AuthField>

      {/* T-39.1 / T-26.5: explicit, real checkboxes — the button stays
          enabled either way (03 §UX-26 AC), the inline error is what blocks
          a submit with either box unticked. */}
      <Controller
        control={control}
        name="acceptedTerms"
        render={({ field: { onChange, value } }) => (
          <ConsentCheckbox
            testID="register-accept-terms"
            checked={value}
            onChange={onChange}
            error={errors.acceptedTerms?.message}
            errorTestID="register-accept-terms-error"
          >
            {AUTH_COPY.registerTermsLabel}{' '}
            <Text
              accessibilityRole="link"
              className="text-sm text-primary underline"
              onPress={() => openLegal('terms')}
            >
              Terms
            </Text>
            {' and the '}
            <Text
              accessibilityRole="link"
              className="text-sm text-primary underline"
              onPress={() => openLegal('privacy')}
            >
              Privacy Policy
            </Text>
          </ConsentCheckbox>
        )}
      />

      <Controller
        control={control}
        name="ageConfirmed"
        render={({ field: { onChange, value } }) => (
          <ConsentCheckbox
            testID="register-age-confirm"
            checked={value}
            onChange={onChange}
            error={errors.ageConfirmed?.message}
            errorTestID="register-age-confirm-error"
          >
            {AUTH_COPY.registerAgeLabel}
          </ConsentCheckbox>
        )}
      />

      {register.error && (
        <View className="gap-1" testID="register-error-block">
          <Text variant="muted" className="text-destructive" testID="register-error">
            {userFacingErrorMessage(register.error)}
          </Text>
          {accountExists && (
            // UX-ACC-15: the dead end becomes two ways forward.
            <View className="flex-row flex-wrap gap-x-4">
              <Pressable
                testID="register-exists-sign-in"
                accessibilityRole="link"
                onPress={() => goTo('/login')}
                className="min-h-11 justify-center"
              >
                <Text variant="muted" className="font-semibold text-primary">
                  Sign in instead
                </Text>
              </Pressable>
              <Pressable
                testID="register-exists-reset"
                accessibilityRole="link"
                onPress={() => goTo('/forgot-password')}
                className="min-h-11 justify-center"
              >
                <Text variant="muted" className="font-semibold text-primary">
                  Reset your password
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <Button testID="register-submit" loading={register.isPending} onPress={() => void onSubmit()}>
        Create account
      </Button>

      {/* WP-22: Continue with Apple / Google — tapping one is the consent
          (its own line says so), so it skips the two checkboxes above. */}
      <SocialSignIn />

      <View className="flex-row justify-center gap-1">
        <Text variant="muted">Already have an account?</Text>
        <Link href="/login" testID="register-to-login">
          <Text variant="muted" className="font-semibold text-primary">
            Sign in
          </Text>
        </Link>
      </View>
    </>
  );
}
