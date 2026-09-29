import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@chefer/ui-mobile';
import { cn, conditionNoticeText, unrecognisedNoticeText } from '@chefer/utils';

// UX-01 "Something else" outcomes (§Flow (a)) + UX-22 T-22.1: two flavours of
// "we can't check this automatically" —
//  - `unrecognised`: a free-text term the matcher has no mapping for at all.
//    Kept as a literal-match note (never silently dropped) or removed.
//  - `condition`: a health condition (T-22.1) — recognised by name, but
//    nothing is ever saved from it (only coeliac has a safe automatic
//    reading, mapped to the gluten-free-coeliac diet before this notice
//    would show at all). Never medical advice; it only points at Chefer's
//    own goal setting. Built by L-SAFE (this file); the copy comes from the
//    shared `@chefer/utils` safety-copy module rather than `wellness-copy.ts`
//    to avoid a cross-lane edit — see the L-SAFE final report for the
//    wellness-copy.ts coordination note.

export interface UncheckedNoticeProps {
  term: string;
  variant?: 'unrecognised' | 'condition';
  /** `unrecognised` only. */
  onKeepNote?: () => void;
  onRemove?: () => void;
  /** `condition` only. */
  onChooseGoal?: () => void;
  onDismiss?: () => void;
  testID?: string;
}

export function UncheckedNotice({
  term,
  variant = 'unrecognised',
  onKeepNote,
  onRemove,
  onChooseGoal,
  onDismiss,
  testID,
}: UncheckedNoticeProps) {
  const text = variant === 'condition' ? conditionNoticeText(term) : unrecognisedNoticeText(term);

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      className={cn('gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3')}
    >
      <View className="flex-row items-start gap-2">
        <Ionicons
          name="help-circle-outline"
          size={16}
          color="#92400e"
          accessible={false}
          style={{ marginTop: 1 }}
        />
        <Text className="min-w-0 flex-1 text-sm text-amber-900">{text}</Text>
      </View>
      <View className="flex-row gap-2">
        {variant === 'condition' ? (
          <>
            {onChooseGoal ? (
              <Button
                testID={testID ? `${testID}-choose-goal` : undefined}
                variant="outline"
                size="sm"
                className="flex-1"
                onPress={onChooseGoal}
              >
                Choose a goal
              </Button>
            ) : null}
            <Button
              testID={testID ? `${testID}-ok` : undefined}
              variant="ghost"
              size="sm"
              className="flex-1"
              onPress={onDismiss}
            >
              OK
            </Button>
          </>
        ) : (
          <>
            <Button
              testID={testID ? `${testID}-keep-note` : undefined}
              variant="outline"
              size="sm"
              className="flex-1"
              onPress={onKeepNote}
            >
              Keep as a note
            </Button>
            <Button
              testID={testID ? `${testID}-remove` : undefined}
              variant="ghost"
              size="sm"
              className="flex-1"
              onPress={onRemove}
            >
              Remove
            </Button>
          </>
        )}
      </View>
    </View>
  );
}
