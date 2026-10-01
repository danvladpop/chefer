import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View, type TextInput } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { CURRENT_TERMS_VERSION } from '@chefer/types';
import { Button, Input, PasswordInput, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { detectRegion, userFacingErrorMessage } from '@chefer/utils';
import { AuthField, AuthScreen } from '../../src/features/auth/auth-screen';
import { ConsentCheckbox } from '../../src/features/auth/consent-checkbox';
import { AUTH_COPY } from '../../src/features/auth/copy';
import {
  clearRegisterDraft,
  getRegisterDraft,
  setRegisterDraft,
} from '../../src/features/auth/register-draft';
import { registerSchema, type RegisterFormValues } from '../../src/features/auth/schemas';
import { setToken } from '../../src/lib/auth-store';
import { trpc } from '../../src/lib/trpc';

// UX-25 (T-25.1) / UX-26 (T-26.5) / UX-39 (T-39.1) / B-25 / B-31.

// NOT "new-password" on the password fields: iOS's Automatic Strong Password
// overlay covers the field and swallows programmatic input (breaks E2E, and
// made real typing flaky in the simulator too). autoComplete "off" alone
// doesn't stop the heuristic on secure fields — textContentType "oneTimeCode"
// is the established opt-out.
const NO_STRONG_PASSWORD_OVERLAY = {
  autoComplete: 'off',
  textContentType: 'oneTimeCode',
} as const;

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

  // Bug B-25: `withPasswordConfirmation`'s cross-field refine attaches its
  // "Passwords do not match" error to `confirmPassword` — react-hook-form
  // only re-validates a field when THAT field changes, so editing `password`
  // after a mismatch left a stale error even once the two matched again.
  // Re-run confirmPassword's own validation whenever password changes and
  // confirmPassword already has something to compare against.
  const password = watch('password');
  useEffect(() => {
    if (getValues('confirmPassword')) {
      void trigger('confirmPassword');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  const register = trpc.auth.register.useMutation({
    onSuccess: async (data) => {
      clearRegisterDraft();
      if (data.session) {
        await setToken(data.session.token);
        // Dogfood feedback #9: guide new accounts through onboarding instead
        // of landing straight on the dashboard. Sign-in (login.tsx) does NOT
        // do this — only a fresh registration goes through the wizard.
        router.replace('/onboarding');
      }
    },
  });

  const onSubmit = handleSubmit((values) =>
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
    }),
  );

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
              onChangeText={onChange}
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
              {...NO_STRONG_PASSWORD_OVERLAY}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmRef.current?.focus()}
              onFocus={() => scrollFieldIntoView(passwordRef.current)}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
      </AuthField>

      <AuthField
        label="Confirm password"
        error={errors.confirmPassword?.message}
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
              {...NO_STRONG_PASSWORD_OVERLAY}
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
              onFocus={() => scrollFieldIntoView(confirmRef.current)}
              onBlur={onBlur}
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
        <Text variant="muted" className="text-destructive" testID="register-error">
          {userFacingErrorMessage(register.error)}
        </Text>
      )}

      <Button testID="register-submit" loading={register.isPending} onPress={() => void onSubmit()}>
        Create account
      </Button>

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
