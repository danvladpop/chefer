import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Text } from '@chefer/ui-mobile';
import { cn, PREMIUM_PITCH_COPY } from '@chefer/utils';
import { openPremium } from '../premium/open-premium';

// Mirrors apps/web/src/features/chat/components/LockedChatPreview.tsx.
// Per-user AI is premium-only (owner decision 2026-09-25): free users see a
// clearly labelled example of what the chef does, how to upgrade, and the free
// (non-AI) tools that do the same jobs. No input, no network call.

const EXAMPLE: { role: 'user' | 'assistant'; text: string }[] = [
  { role: 'user', text: "Swap tomorrow's lunch for something lighter" },
  {
    role: 'assistant',
    text: 'Done — I swapped Chicken Caesar Salad for a Quinoa Veggie Bowl (−180 kcal, same protein). Your shopping list is updated.',
  },
  { role: 'user', text: 'I had a croissant for breakfast' },
  { role: 'assistant', text: 'Logged a croissant (~270 kcal) to today. You have 1,480 kcal left.' },
];

const FREE_TOOLS: { href: Href; label: string }[] = [
  { href: '/(food)/meal-plan', label: 'Replace a meal' },
  { href: '/tracker', label: 'Quick-add what you ate' },
  { href: '/(food)/shopping-list', label: 'Add to your shopping list' },
];

export function LockedChatPreview() {
  return (
    <View testID="chat-locked" className="gap-3">
      <Text className="text-caption font-semibold uppercase tracking-wide text-label-secondary">
        Example conversation
      </Text>
      <View className="gap-2 opacity-80" accessibilityLabel="Example conversation">
        {EXAMPLE.map((m, i) => (
          <View
            key={i}
            className={cn(
              'max-w-[85%] rounded-card px-3 py-2',
              m.role === 'user' ? 'self-end bg-brand' : 'self-start bg-surface-sunken',
            )}
          >
            <Text
              className={cn('text-callout', m.role === 'user' ? 'text-brand-on' : 'text-label')}
            >
              {m.text}
            </Text>
          </View>
        ))}
      </View>
      <View className="gap-1 rounded-card bg-brand-tint p-4">
        <Text className="text-headline font-semibold text-brand">
          The AI chef is part of Premium
        </Text>
        <Text className="text-subhead text-label-secondary">
          It can change your plan, log what you ate and import recipes for you.
        </Text>
        <Pressable
          testID="chat-locked-upgrade"
          accessibilityRole="button"
          onPress={() => openPremium('chat-locked')}
          className="min-h-11 justify-center"
        >
          <Text className="text-callout font-semibold text-brand">
            {PREMIUM_PITCH_COPY.seeWhatPremiumAdds}
          </Text>
        </Pressable>
      </View>
      <View>
        <Text className="text-caption text-label-secondary">Free tools that do the same jobs:</Text>
        {FREE_TOOLS.map((t) => (
          <Pressable
            key={t.label}
            accessibilityRole="link"
            onPress={() => router.push(t.href)}
            className="min-h-11 justify-center"
          >
            <Text className="text-callout font-semibold text-brand">{t.label} →</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
