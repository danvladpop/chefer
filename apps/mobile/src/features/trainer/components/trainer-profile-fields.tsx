import { useRef } from 'react';
import { View, type TextInput } from 'react-native';
import { COACHING_COPY, COACHING_LIMITS } from '@chefer/types';
import { FormField, Input } from '@chefer/ui-mobile';

// The trainer's public line (PRD 2026-10 §4.1): the name clients see and the optional "Gym / city" under
// it, to tell apart six people called Ana in Find a trainer. Used by the turn-on card and the trainer's
// profile card on the Clients screen. Return on the name moves to the gym line; Return there submits.

export type TrainerProfileDraft = { displayName: string; gymLine: string };

/** The `trainer.activate` / `trainer.updateProfile` input: an empty gym line clears it. */
export function profileInput(draft: TrainerProfileDraft): {
  displayName: string;
  gymLine: string | null;
} {
  const gym = draft.gymLine.trim();
  return { displayName: draft.displayName.trim(), gymLine: gym === '' ? null : gym };
}

export function TrainerProfileFields({
  testID,
  value,
  onChange,
  onSubmit,
}: {
  testID: string;
  value: TrainerProfileDraft;
  onChange: (next: TrainerProfileDraft) => void;
  onSubmit: () => void;
}) {
  const gymRef = useRef<TextInput>(null);
  return (
    <View className="gap-3">
      <FormField label={COACHING_COPY.trainer.displayName} testID={`${testID}-name-field`}>
        <Input
          testID={`${testID}-name`}
          label={COACHING_COPY.trainer.displayName}
          value={value.displayName}
          maxLength={COACHING_LIMITS.displayNameMaxChars}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => gymRef.current?.focus()}
          onChangeText={(displayName) => onChange({ ...value, displayName })}
        />
      </FormField>
      <FormField
        label={COACHING_COPY.trainerProfile.gymLine}
        hint={COACHING_COPY.trainerProfile.gymLineHint}
        testID={`${testID}-gym-field`}
      >
        <Input
          ref={gymRef}
          testID={`${testID}-gym`}
          label={COACHING_COPY.trainerProfile.gymLine}
          value={value.gymLine}
          maxLength={COACHING_LIMITS.gymLineMaxChars}
          autoCapitalize="words"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          onChangeText={(gymLine) => onChange({ ...value, gymLine })}
        />
      </FormField>
    </View>
  );
}
