import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// UX-FOOD-21: a 690-character reply used to render as a 20-line wall. Long
// chef replies fold to a few lines with "Show more"; the reply being written
// right now is never folded (you are reading it as it arrives).

/** Longer than this and a finished chef reply is folded. */
export const COLLAPSE_AFTER_CHARS = 320;
export const COLLAPSED_LINES = 6;

export function shouldCollapse(
  role: 'user' | 'assistant',
  content: string,
  live: boolean,
): boolean {
  return role === 'assistant' && !live && content.length > COLLAPSE_AFTER_CHARS;
}

export function MessageBubble({
  testID,
  role,
  content,
  live,
}: {
  testID: string;
  role: 'user' | 'assistant';
  content: string;
  /** The reply still streaming in. */
  live: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const foldable = shouldCollapse(role, content, live);
  const folded = foldable && !expanded;
  return (
    <View className={cn('rounded-2xl px-3 py-2', role === 'user' ? 'bg-primary' : 'bg-gray-100')}>
      <Text
        testID={`${testID}-text`}
        {...(folded && { numberOfLines: COLLAPSED_LINES })}
        className={cn('text-sm', role === 'user' ? 'text-primary-foreground' : 'text-gray-800')}
      >
        {content || '…'}
      </Text>
      {foldable && (
        <Pressable
          testID={`${testID}-toggle`}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show less of this reply' : 'Show the whole reply'}
          onPress={() => setExpanded((v) => !v)}
          className="min-h-11 justify-center"
        >
          <Text className="text-sm font-semibold text-primary">
            {expanded ? 'Show less' : 'Show more'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
