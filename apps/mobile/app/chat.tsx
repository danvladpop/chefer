import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { fetch as expoFetch } from 'expo/fetch';
import { Card, Screen, Text, useKeyboardInset } from '@chefer/ui-mobile';
import {
  cn,
  dailyAllowanceResetTime,
  localDateStr,
  splitChatActions,
  WELLNESS_COPY,
} from '@chefer/utils';
import { useAiConsent } from '../src/features/ai-consent/ai-consent-provider';
import { ChatActionChips } from '../src/features/chat/chat-action-chips';
import { chatErrorMessage, isAbortError } from '../src/features/chat/chat-errors';
import { CHAT_STARTER_PROMPTS } from '../src/features/chat/chat-starters';
import { LockedChatPreview } from '../src/features/chat/locked-chat-preview';
import { MessageBubble } from '../src/features/chat/message-bubble';
import {
  clearThread,
  loadThread,
  saveThread,
  type ThreadMessage,
} from '../src/features/chat/thread-store';
import { openPremium } from '../src/features/premium/open-premium';
import { useIsPremium } from '../src/hooks/use-is-premium';
import { getApiBaseUrl } from '../src/lib/api-url';
import { getToken } from '../src/lib/auth-store';
import { streamChat } from '../src/lib/chat-stream';

// AI chef chat — mobile counterpart of web's chat widget (M2-9, over the
// M3-1 streaming plumbing). Same quota gate: when the API signals
// X-Chat-Quota-Exhausted the input swaps for the upgrade nudge.
// UX-FOOD-21: the last thread is kept for the rest of the day, replies show
// what the chef did as View / Undo chips, failures read as sentences with a
// retry, Stop ends a reply (and leaving the screen ends it too), long replies
// fold, and an empty thread offers starter prompts.

export default function ChatScreen() {
  // UX-FOOD-21: today's thread, restored from the device (empty on a new day).
  const [thread, setThread] = useState<ThreadMessage[]>(() => loadThread(localDateStr()));
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const nextId = useRef(thread.reduce((max, m) => Math.max(max, m.id), 0) + 1);
  // The request in flight: Stop and leaving the screen both abort it.
  const abortRef = useRef<AbortController | null>(null);
  const stoppedByUser = useRef(false);
  const threadRef = useRef(thread);
  threadRef.current = thread;
  // Free tier: chat is premium-only — locked preview, no input.
  const locked = useIsPremium() === false;
  // AI data consent (App Store 5.1.2(i)): the first message asks before
  // anything is sent; "Not now" keeps the draft and sends nothing.
  const requestAiConsent = useAiConsent();
  // UX-FOOD-07: under Android's edge-to-edge the window doesn't resize for the
  // keyboard (KeyboardAvoidingView "height" did nothing), so the composer
  // column takes the keyboard's height as its own bottom padding. One
  // mechanism on both platforms; the hook already subtracts the safe-area
  // bottom that `Screen` pads.
  const { inset: keyboardInset } = useKeyboardInset();

  // Remember the thread whenever it settles (never mid-stream: a half reply is
  // not worth keeping).
  useEffect(() => {
    if (!streaming) saveThread(localDateStr(), thread);
  }, [thread, streaming]);

  // Leaving the screen ends the request (it used to run on in the background)
  // and keeps what had arrived.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      saveThread(localDateStr(), threadRef.current);
    },
    [],
  );

  const send = (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || streaming || quotaExhausted) {
      return;
    }
    requestAiConsent('chat', () => void sendNow(content));
  };

  const retry = (message: ThreadMessage) => {
    if (streaming || quotaExhausted) return;
    requestAiConsent('chat', () => void sendNow(message.content, message.id));
  };

  const stop = () => {
    stoppedByUser.current = true;
    abortRef.current?.abort();
  };

  const newChat = () => {
    clearThread();
    setThread([]);
    setError(null);
  };

  const sendNow = async (content: string, retryOfId?: number) => {
    setError(null);
    if (retryOfId === undefined) setDraft('');

    // A retry replaces the message that failed; earlier failures never go to the chef.
    const base = thread.filter((m) => m.id !== retryOfId && !m.failed);
    const userMsg: ThreadMessage = { id: nextId.current++, role: 'user', content };
    const assistantId = nextId.current++;
    const history = [...base, userMsg];
    setThread([...history, { id: assistantId, role: 'assistant', content: '' }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    stoppedByUser.current = false;
    let raw = '';
    const patchAssistant = (patch: Partial<ThreadMessage>) =>
      setThread((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));

    try {
      const result = await streamChat({
        // expo/fetch streams response bodies; RN's classic fetch does not.
        fetchImpl: expoFetch,
        apiBaseUrl: getApiBaseUrl(),
        getToken,
        signal: controller.signal,
        messages: history.map(({ role, content: c }) => ({ role, content: c })),
        onChunk: (chunk) => {
          raw += chunk;
          // The action trailer is not prose: only the text before it is shown.
          patchAssistant({ content: splitChatActions(raw).text });
          scrollRef.current?.scrollToEnd({ animated: true });
        },
      });
      if (result.quotaExhausted) {
        setQuotaExhausted(true);
      }
      const { text, actions } = splitChatActions(result.fullText);
      patchAssistant({
        content: text,
        ...(actions.length > 0 && { actions }),
        ...(result.healthTopic && { healthTopic: true }),
        ...(result.safetyTopic && { safetyTopic: true }),
      });
    } catch (err) {
      const partial = splitChatActions(raw).text;
      if (isAbortError(err) || controller.signal.aborted) {
        // Stop (or leaving): keep what arrived, no error.
        setThread((prev) =>
          prev.flatMap((m) => {
            if (m.id !== assistantId) return [m];
            return partial.trim() === '' ? [] : [{ ...m, content: partial, stopped: true }];
          }),
        );
      } else {
        setError(chatErrorMessage(err));
        setThread((prev) =>
          prev.flatMap((m) => {
            if (m.id === assistantId) {
              // Half a reply is kept (and says so); an empty bubble is dropped.
              return partial.trim() === '' ? [] : [{ ...m, content: partial, stopped: true }];
            }
            // Nothing came back for this question: offer "Tap to retry" on it.
            return m.id === userMsg.id && partial.trim() === '' ? [{ ...m, failed: true }] : [m];
          }),
        );
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
    }
  };

  const markUndone = (messageId: number, index: number) =>
    setThread((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, undone: [...new Set([...(m.undone ?? []), index])] } : m,
      ),
    );

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
        <View className="min-w-0 flex-1">
          <Text testID="chat-title" variant="title">
            AI Chef
          </Text>
          {/* UX-22 (T-22.2, AC2/AC5): always visible, at 1.8× text without
              truncation — no `numberOfLines`, wraps under the title. */}
          <Text testID="chat-header-subtitle" variant="muted" className="text-xs">
            {WELLNESS_COPY.chatHeaderSubtitle}
          </Text>
        </View>
        {!locked && thread.length > 0 && !streaming && (
          <Pressable
            testID="chat-new"
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
            onPress={newChat}
            className="min-h-11 justify-center px-2"
          >
            <Text className="text-sm font-semibold text-primary">New chat</Text>
          </Pressable>
        )}
      </View>

      <View
        testID="chat-keyboard-inset"
        className="flex-1"
        style={{ paddingBottom: keyboardInset }}
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
              <View className="mt-3 gap-2">
                {CHAT_STARTER_PROMPTS.map((prompt, i) => (
                  <Pressable
                    key={prompt}
                    testID={`chat-starter-${i}`}
                    accessibilityRole="button"
                    disabled={quotaExhausted}
                    onPress={() => send(prompt)}
                    className="min-h-11 justify-center rounded-xl border border-border px-3 py-2"
                  >
                    <Text className="text-sm text-gray-700">{prompt}</Text>
                  </Pressable>
                ))}
              </View>
              {/* UX-22 (T-22.2, AC2): the chef-not-a-doctor line on the empty thread. */}
              <Text testID="chat-empty-disclaimer" variant="muted" className="mt-3 text-xs">
                {WELLNESS_COPY.chatEmptyStateDisclaimer}
              </Text>
            </Card>
          )}
          {thread.map((m, i) => (
            <View
              key={m.id}
              className={cn('max-w-[85%]', m.role === 'user' ? 'self-end' : 'self-start')}
            >
              <MessageBubble
                testID={`chat-message-${m.id}`}
                role={m.role}
                content={m.content}
                live={streaming && i === thread.length - 1 && m.role === 'assistant'}
              />
              {m.stopped && (
                <Text
                  testID={`chat-message-${m.id}-stopped`}
                  variant="muted"
                  className="mt-1 text-xs"
                >
                  Reply stopped.
                </Text>
              )}
              {m.failed && (
                <Pressable
                  testID={`chat-message-${m.id}-retry`}
                  accessibilityRole="button"
                  accessibilityLabel="Retry sending this message"
                  disabled={streaming}
                  onPress={() => retry(m)}
                  className="min-h-11 justify-center self-end"
                >
                  <Text className="text-xs font-semibold text-red-600">
                    Couldn&apos;t send. Tap to retry
                  </Text>
                </Pressable>
              )}
              {m.actions && m.actions.length > 0 && (
                <ChatActionChips
                  messageId={m.id}
                  actions={m.actions}
                  undone={m.undone ?? []}
                  onUndone={(index) => markUndone(m.id, index)}
                />
              )}
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
            <Card testID="chat-error" className="border-red-200 bg-red-50">
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
              Premium raises the daily limit. Allowances reset at {dailyAllowanceResetTime()} your
              time.
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
              accessibilityLabel="Message the chef"
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the chef…"
              placeholderTextColor="#9ca3af"
              multiline
              className="max-h-28 min-h-11 flex-1 rounded-2xl border border-input bg-background px-4 py-3 text-base text-foreground"
            />
            {streaming ? (
              <Pressable
                testID="chat-stop"
                accessibilityRole="button"
                accessibilityLabel="Stop"
                onPress={stop}
                className="h-11 w-11 items-center justify-center rounded-full bg-primary"
              >
                <Ionicons name="stop" size={18} color="white" />
              </Pressable>
            ) : (
              <Pressable
                testID="chat-send"
                accessibilityRole="button"
                accessibilityLabel="Send"
                disabled={!draft.trim()}
                onPress={() => send()}
                className={cn(
                  'h-11 w-11 items-center justify-center rounded-full bg-primary',
                  !draft.trim() && 'opacity-40',
                )}
              >
                <Ionicons name="arrow-up" size={20} color="white" />
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}
