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
import { cn } from '@chefer/utils';
import { getApiBaseUrl } from '../src/lib/api-url';
import { getToken } from '../src/lib/auth-store';
import { streamChat, type ChatMessageInput } from '../src/lib/chat-stream';

// AI chef chat — mobile counterpart of web's chat widget (M2-9, over the
// M3-1 streaming plumbing). In-memory thread, same quota gate: when the API
// signals X-Chat-Quota-Exhausted the input swaps for the upgrade nudge.

interface ThreadMessage extends ChatMessageInput {
  id: number;
}

export default function ChatScreen() {
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const nextId = useRef(1);

  const send = async () => {
    const content = draft.trim();
    if (!content || streaming || quotaExhausted) {
      return;
    }
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
        fetchImpl: expoFetch as unknown as typeof fetch,
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
        <Text testID="chat-title" variant="title">
          AI Chef
        </Text>
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
          {thread.length === 0 && (
            <Card testID="chat-empty">
              <Text variant="heading">Ask the chef anything</Text>
              <Text variant="muted" className="mt-1 text-sm">
                Swap ideas, cooking questions, nutrition doubts — or ask to add something to your
                shopping list.
              </Text>
            </Card>
          )}
          {thread.map((m) => (
            <View
              key={m.id}
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
                {m.content || '…'}
              </Text>
            </View>
          ))}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <Text className="text-sm text-red-600">{error}</Text>
            </Card>
          )}
        </ScrollView>

        {quotaExhausted ? (
          <Card testID="chat-quota" className="m-4 border-primary/20 bg-accent">
            <Text className="text-sm font-semibold text-primary">
              You&apos;ve used today&apos;s chat messages
            </Text>
            <Text className="mt-1 text-xs text-primary/80">
              Premium raises every daily limit — upgrade from your Profile. Allowances reset at
              midnight.
            </Text>
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
              onPress={() => void send()}
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
