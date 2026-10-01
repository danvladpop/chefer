import { useEffect, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { FRIENDS_COPY, type FriendsMeDto } from '@chefer/types';
import { FormField, Input } from '@chefer/ui-mobile';
import { track } from '../../../lib/analytics';
import { textRejectedOf } from '../api/friends-errors';
import { useUpdateSettings } from './use-update-settings';

// ─── How others will see you (FR-02.6, UX §4.1 copy) ───────────────────────────
// First and last name, both required (1–50 characters, trimmed). They save
// when the field is left (blur or Return) and the pair changed — there is no
// Save button, like the switches. The server runs the word filter: a rejected
// name keeps the typed text and shows `Please choose a different name. Some
// words aren’t allowed on Chefer profiles.`; any other failure shows the
// generic `Couldn’t save. Try again.`.

const MAX_NAME = 50;

export function NameSection({ me }: { me: FriendsMeDto }) {
  const { save } = useUpdateSettings();
  const [first, setFirst] = useState(me.firstName ?? '');
  const [last, setLast] = useState(me.lastName ?? '');
  const [error, setError] = useState<{ field: 'first' | 'last' | 'both'; message: string } | null>(
    null,
  );
  const lastRef = useRef<TextInput>(null);
  const saving = useRef(false);
  const focused = useRef(0);

  // Follow the server (a refetch, another device) unless the user is typing.
  useEffect(() => {
    if (focused.current > 0) return;
    setFirst(me.firstName ?? '');
    setLast(me.lastName ?? '');
  }, [me.firstName, me.lastName]);

  const commit = async () => {
    const firstName = first.trim();
    const lastName = last.trim();
    if (!firstName) {
      setError({ field: 'first', message: FRIENDS_COPY.intro.firstNameError });
      return;
    }
    if (!lastName) {
      setError({ field: 'last', message: FRIENDS_COPY.intro.lastNameError });
      return;
    }
    setError(null);
    if (firstName === (me.firstName ?? '') && lastName === (me.lastName ?? '')) return;
    if (saving.current) return;
    saving.current = true;
    const outcome = await save({ firstName, lastName });
    saving.current = false;
    if (outcome.ok) {
      setFirst(firstName);
      setLast(lastName);
      return;
    }
    if (textRejectedOf(outcome.error) === 'name') {
      track('friend_text_rejected', { field: 'name' });
      setError({ field: 'both', message: FRIENDS_COPY.intro.nameRejected });
    } else {
      setError({ field: 'both', message: FRIENDS_COPY.settings.saveError });
    }
  };

  const blur = () => {
    focused.current = Math.max(0, focused.current - 1);
    void commit();
  };

  const invalid = (field: 'first' | 'last') =>
    error !== null && (error.field === field || error.field === 'both');

  return (
    <View testID="friends-settings-name" className="gap-3">
      <FormField
        testID="friends-settings-first-name-field"
        label={FRIENDS_COPY.intro.firstName}
        {...(error?.field === 'first' ? { error: error.message } : {})}
      >
        <Input
          testID="friends-settings-first-name"
          accessibilityLabel={FRIENDS_COPY.intro.firstName}
          aria-invalid={invalid('first')}
          value={first}
          onChangeText={setFirst}
          maxLength={MAX_NAME}
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="next"
          onFocus={() => (focused.current += 1)}
          onBlur={blur}
          onSubmitEditing={() => lastRef.current?.focus()}
        />
      </FormField>
      <FormField
        testID="friends-settings-last-name-field"
        label={FRIENDS_COPY.intro.lastName}
        {...(error && error.field !== 'first' ? { error: error.message } : {})}
      >
        <Input
          ref={lastRef}
          testID="friends-settings-last-name"
          accessibilityLabel={FRIENDS_COPY.intro.lastName}
          aria-invalid={invalid('last')}
          value={last}
          onChangeText={setLast}
          maxLength={MAX_NAME}
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          returnKeyType="done"
          onFocus={() => (focused.current += 1)}
          onBlur={blur}
          onSubmitEditing={() => lastRef.current?.blur()}
        />
      </FormField>
    </View>
  );
}
