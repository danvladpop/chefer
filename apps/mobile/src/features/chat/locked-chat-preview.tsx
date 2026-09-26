import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Card, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

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
      <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Example conversation
      </Text>
      <View className="gap-2 opacity-80" accessibilityLabel="Example conversation">
        {EXAMPLE.map((m, i) => (
          <View
            key={i}
            className={cn(
              'max-w-[85%] rounded-2xl px-3 py-2',
              m.role === 'user' ? 'self-end bg-primary' : 'self-start bg-gray-100',
            )}
          >
            <Text
              className={cn(
                'text-sm',
                m.role === 'user' ? 'text-primary-foreground' : 'text-gray-800',
              )}
            >
              {m.text}
            </Text>
          </View>
        ))}
      </View>
      <Card className="border-primary/20 bg-accent">
        <Text className="text-sm font-semibold text-primary">The AI chef is part of Premium</Text>
        <Text className="mt-1 text-sm text-primary/80">
          It can change your plan, log what you ate and import recipes for you.
        </Text>
        <Pressable
          testID="chat-locked-upgrade"
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/profile', params: { source: 'chat-locked' } })}
          className="mt-2 min-h-11 justify-center"
        >
          <Text className="text-sm font-semibold text-primary">Upgrade from your Profile →</Text>
        </Pressable>
      </Card>
      <View>
        <Text variant="muted" className="text-xs">
          Free tools that do the same jobs:
        </Text>
        {FREE_TOOLS.map((t) => (
          <Pressable
            key={t.label}
            accessibilityRole="link"
            onPress={() => router.push(t.href)}
            className="min-h-11 justify-center"
          >
            <Text className="text-sm font-medium text-primary">{t.label} →</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
