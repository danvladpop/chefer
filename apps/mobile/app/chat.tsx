import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { fetch as expoFetch } from 'expo/fetch';
import { Card, Screen, Text } from '@chefer/ui-mobile';
import { cn, WELLNESS_COPY } from '@chefer/utils';
import { useAiConsent } from '../src/features/ai-consent/ai-consent-provider';
import { LockedChatPreview } from '../src/features/chat/locked-chat-preview';
import { openPremium } from '../src/features/premium/open-premium';
import { useIsPremium } from '../src/hooks/use-is-premium';
import { getApiBaseUrl } from '../src/lib/api-url';
import { getToken } from '../src/lib/auth-store';
import { streamChat, type ChatMessageInput } from '../src/lib/chat-stream';

// AI chef chat — mobile counterpart of web's chat widget (M2-9, over the
// M3-1 streaming plumbing). In-memory thread, same quota gate: when the API
// signals X-Chat-Quota-Exhausted the input swaps for the upgrade nudge.

interface ThreadMessage extends ChatMessageInput {
  id: number;
  /** UX-22 (T-22.2, AC4) — set once the reply finishes streaming. */
  healthTopic?: boolean;
  safetyTopic?: boolean;
}

export default function ChatScreen() {
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const nextId = useRef(1);
  // Free tier: chat is premium-only — locked preview, no input.
  const locked = useIsPremium() === false;
  // AI data consent (App Store 5.1.2(i)): the first message asks before
  // anything is sent; "Not now" keeps the draft and sends nothing.
  const requestAiConsent = useAiConsent();

  const send = () => {
    const content = draft.trim();
    if (!content || streaming || quotaExhausted) {
      return;
    }
    requestAiConsent('chat', () => void sendNow(content));
  };

  const sendNow = async (content: string) => {
    setError(null);
    setDraft('');

    const userMsg: ThreadMessage = { id: nextId.current++, role: 'user', content };
    const assistantId = nextId.current++;
    const history = [...thread, userMsg];
    setThread([...history, { id: assistantId, role: 'assistant', content: '' }]);
    setStreaming(true);

    try {
      const result = await streamChat({
        // expo/fetch streams response bodies; RN's classic fetch does not.
        fetchImpl: expoFetch,
        apiBaseUrl: getApiBaseUrl(),
        getToken,
        messages: history.map(({ role, content: c }) => ({ role, content: c })),
        onChunk: (chunk) => {
          setThread((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
          );
          scrollRef.current?.scrollToEnd({ animated: true });
        },
      });
      if (result.quotaExhausted) {
        setQuotaExhausted(true);
      }
      if (result.healthTopic || result.safetyTopic) {
        setThread((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, healthTopic: result.healthTopic, safetyTopic: result.safetyTopic }
              : m,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The chef is unavailable right now.');
      // Drop the empty assistant bubble on failure
      setThread((prev) => prev.filter((m) => m.id !== assistantId || m.content !== ''));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <View>
          <Text testID="chat-title" variant="title">
            AI Chef
          </Text>
          {/* UX-22 (T-22.2, AC2/AC5): always visible, at 1.8× text without
              truncation — no `numberOfLines`, wraps under the title. */}
          <Text testID="chat-header-subtitle" variant="muted" className="text-xs">
            {WELLNESS_COPY.chatHeaderSubtitle}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          ref={scrollRef}
          contentContainerClassName="gap-3 px-4 py-2"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {locked && <LockedChatPreview />}
          {!locked && thread.length === 0 && (
            <Card testID="chat-empty">
              <Text variant="heading">Ask the chef anything</Text>
              <Text variant="muted" className="mt-1 text-sm">
                Swap ideas, cooking questions, nutrition doubts — or ask to add something to your
                shopping list.
              </Text>
              {/* UX-22 (T-22.2, AC2): the chef-not-a-doctor line on the empty thread. */}
              <Text testID="chat-empty-disclaimer" variant="muted" className="mt-2 text-xs">
                {WELLNESS_COPY.chatEmptyStateDisclaimer}
              </Text>
            </Card>
          )}
          {thread.map((m) => (
            <View
              key={m.id}
              className={cn('max-w-[85%]', m.role === 'user' ? 'self-end' : 'self-start')}
            >
              <View
                className={cn(
                  'rounded-2xl px-3 py-2',
                  m.role === 'user' ? 'bg-primary' : 'bg-gray-100',
                )}
              >
                <Text
                  className={cn(
                    'text-sm',
                    m.role === 'user' ? 'text-primary-foreground' : 'text-gray-800',
                  )}
                >
                  {m.content || '…'}
                </Text>
              </View>
              {/* UX-22 (T-22.2, AC4): the belt-and-braces footer under a
                  flagged reply — the guardrail lives in the prompt (T-00.14);
                  this is the visible reminder, not the control. */}
              {((m.healthTopic ?? false) || (m.safetyTopic ?? false)) && (
                <Text
                  testID={m.healthTopic ? 'chat-health-topic-footer' : 'chat-safety-topic-footer'}
                  variant="muted"
                  className="mt-1 text-xs"
                >
                  {m.healthTopic
                    ? WELLNESS_COPY.chatHealthTopicFooter
                    : WELLNESS_COPY.chatSafetyTopicFooter}
                </Text>
              )}
            </View>
          ))}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <Text className="text-sm text-red-600">{error}</Text>
            </Card>
          )}
        </ScrollView>

        {locked ? null : quotaExhausted ? (
          <Card testID="chat-quota" className="m-4 border-primary/20 bg-accent">
            <Text className="text-sm font-semibold text-primary">
              You&apos;ve used today&apos;s chat messages
            </Text>
            <Text className="mt-1 text-xs text-primary/80">
              Premium raises the daily limit. Allowances reset at midnight UTC.
            </Text>
            <Pressable
              testID="chat-quota-upgrade"
              accessibilityRole="button"
              onPress={() => openPremium('chat-quota')}
              className="min-h-11 justify-center"
            >
              <Text className="text-xs font-semibold text-primary">See what Premium adds</Text>
            </Pressable>
          </Card>
        ) : (
          <View className="flex-row items-end gap-2 border-t border-border px-4 py-3">
            <TextInput
              testID="chat-input"
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the chef…"
              placeholderTextColor="#9ca3af"
              multiline
              className="max-h-28 min-h-11 flex-1 rounded-2xl border border-input bg-background px-4 py-3 text-base text-foreground"
            />
            <Pressable
              testID="chat-send"
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={streaming || !draft.trim()}
              onPress={send}
              className={cn(
                'h-11 w-11 items-center justify-center rounded-full bg-primary',
                (streaming || !draft.trim()) && 'opacity-40',
              )}
            >
              {streaming ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="arrow-up" size={20} color="white" />
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
