import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import { SAFETY_COPY } from '@chefer/utils';

// UX-01 (a) — the "We'll keep out" read-back panel under the Allergies group:
// live (appears on the first selection, updates on every change), announced
// politely. `title` defaults to the allergy panel's copy; the diet and
// dislike groups pass their own one-line summary as a single-item `lines`.

export interface ReadBackPanelProps {
  title?: string;
  lines: string[];
  testID?: string;
}

export function ReadBackPanel({
  title = SAFETY_COPY.readBackTitle,
  lines,
  testID,
}: ReadBackPanelProps) {
  if (lines.length === 0) return null;
  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      className="gap-1.5 rounded-xl bg-accent/60 p-3"
    >
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="shield-outline" size={14} color="#944a00" accessible={false} />
        <Text className="text-xs font-semibold uppercase tracking-wide text-primary">{title}</Text>
      </View>
      {lines.map((line) => (
        <Text key={line} className="text-sm leading-relaxed text-gray-700">
          {line}
        </Text>
      ))}
    </View>
  );
}
