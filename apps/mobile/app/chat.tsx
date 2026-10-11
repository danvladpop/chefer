import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { fetch as expoFetch } from 'expo/fetch';
import { CHAT_LIMITS, PLAN_FEATURES } from '@chefer/types';
import {
  IconButton,
  keyboardDismissMode,
  PressableScale,
  Screen,
  Text,
  useKeyboardInset,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  dailyAllowanceResetTime,
  localDateStr,
  splitChatActions,
  WELLNESS_COPY,
} from '@chefer/utils';
import { Icon } from '../src/components/icon';
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

/** The redesign's card (BoardCard's look, kept local: no shell imports in this route). */
const CARD = 'gap-3 rounded-card border border-separator bg-surface p-4';

export default function ChatScreen() {
  const colors = useThemeColors();
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
  const isPremium = useIsPremium();
  const locked = isPremium === false;
  // Phase 1 guardrails: one message is at most 2,000 characters (the server
  // refuses longer); the count shows near the end.
  const nearLimit = draft.length >= CHAT_LIMITS.counterFromChars;
  const atLimit = draft.length >= CHAT_LIMITS.maxMessageChars;
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
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      {/* The page's top bar in the shell's look (ShellTopBar: brand chevron
          Back + title1, 10 Oct redesign). Drawn here so the title keeps the
          `chat-title` testID the Maestro flow waits on, with the disclaimer
          subtitle under it and "New chat" on the right. */}
      <View className="flex-row items-start gap-1 px-4 pb-2 pt-1">
        <IconButton
          accessibilityLabel="Back"
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={() => router.back()}
          className="-ml-2"
        />
        <View className="min-h-11 min-w-0 flex-1 justify-center">
          <Text
            testID="chat-title"
            accessibilityRole="header"
            numberOfLines={1}
            className="text-title1 font-bold text-label"
          >
            AI Chef
          </Text>
          {/* UX-22 (T-22.2, AC2/AC5): always visible, at 1.8× text without
              truncation — no `numberOfLines`, wraps under the title. */}
          <Text testID="chat-header-subtitle" className="text-caption text-label-secondary">
            {WELLNESS_COPY.chatHeaderSubtitle}
          </Text>
        </View>
        {!locked && thread.length > 0 && !streaming && (
          <PressableScale
            testID="chat-new"
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
            onPress={newChat}
            className="min-h-11 justify-center px-2"
          >
            <Text className="text-callout font-semibold text-brand">New chat</Text>
          </PressableScale>
        )}
      </View>

      <View
        testID="chat-keyboard-inset"
        className="flex-1"
        style={{ paddingBottom: keyboardInset }}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={keyboardDismissMode()}
          contentContainerClassName="gap-3 px-4 py-2"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {locked && <LockedChatPreview />}
          {!locked && thread.length === 0 && (
            <View testID="chat-empty" className={CARD}>
              <View className="gap-1">
                <Text accessibilityRole="header" className="text-title3 font-bold text-label">
                  Ask the chef anything
                </Text>
                <Text className="text-subhead text-label-secondary">
                  Swap ideas, cooking questions, nutrition doubts — or ask to add something to your
                  shopping list.
                </Text>
              </View>
              <View className="gap-2">
                {CHAT_STARTER_PROMPTS.map((prompt, i) => (
                  <PressableScale
                    key={prompt}
                    testID={`chat-starter-${i}`}
                    accessibilityRole="button"
                    disabled={quotaExhausted}
                    onPress={() => send(prompt)}
                    className="min-h-11 justify-center rounded-control bg-surface-sunken px-3 py-2"
                  >
                    <Text className="text-callout text-label">{prompt}</Text>
                  </PressableScale>
                ))}
              </View>
              {/* UX-22 (T-22.2, AC2): the chef-not-a-doctor line on the empty thread. */}
              <Text testID="chat-empty-disclaimer" className="text-caption text-label-tertiary">
                {WELLNESS_COPY.chatEmptyStateDisclaimer}
              </Text>
            </View>
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
                  className="mt-1 text-caption text-label-secondary"
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
                  <Text className="text-caption font-semibold text-danger">
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
                  className="mt-1 text-caption text-label-secondary"
                >
                  {m.healthTopic
                    ? WELLNESS_COPY.chatHealthTopicFooter
                    : WELLNESS_COPY.chatSafetyTopicFooter}
                </Text>
              )}
            </View>
          ))}
          {error && (
            <View testID="chat-error" className={cn(CARD, 'border-danger')}>
              <Text className="text-callout text-danger">{error}</Text>
            </View>
          )}
        </ScrollView>

        {locked ? null : quotaExhausted && isPremium === true ? (
          // Phase 1 guardrails: premium chat is 100 a day — no upsell for
          // someone who already has Premium, just when it comes back.
          <View testID="chat-premium-quota" className="m-4 gap-1 rounded-card bg-brand-tint p-4">
            <Text className="text-headline font-semibold text-brand">
              You&apos;ve used today&apos;s {String(PLAN_FEATURES.chatMessagesPerDay.premium)} chat
              messages
            </Text>
            <Text className="text-subhead text-label-secondary">
              They reset at {dailyAllowanceResetTime()} your time.
            </Text>
          </View>
        ) : quotaExhausted ? (
          <View testID="chat-quota" className="m-4 gap-1 rounded-card bg-brand-tint p-4">
            <Text className="text-headline font-semibold text-brand">
              You&apos;ve used today&apos;s chat messages
            </Text>
            <Text className="text-subhead text-label-secondary">
              Premium raises the daily limit. Allowances reset at {dailyAllowanceResetTime()} your
              time.
            </Text>
            <Pressable
              testID="chat-quota-upgrade"
              accessibilityRole="button"
              onPress={() => openPremium('chat-quota')}
              className="min-h-11 justify-center"
            >
              <Text className="text-callout font-semibold text-brand">See what Premium adds</Text>
            </Pressable>
          </View>
        ) : (
          <View className="gap-1 border-t border-separator bg-surface px-4 py-3">
            {nearLimit && (
              <Text
                testID="chat-char-counter"
                accessibilityLiveRegion="polite"
                className={cn(
                  'text-right text-caption',
                  atLimit ? 'text-danger' : 'text-label-secondary',
                )}
              >
                {atLimit
                  ? `${CHAT_LIMITS.maxMessageChars.toLocaleString('en-US')} characters is the most one message can hold.`
                  : `${draft.length.toLocaleString('en-US')} / ${CHAT_LIMITS.maxMessageChars.toLocaleString('en-US')}`}
              </Text>
            )}
            <View className="flex-row items-end gap-2">
              <TextInput
                testID="chat-input"
                accessibilityLabel="Message the chef"
                accessibilityHint={
                  nearLimit
                    ? `${draft.length} of ${CHAT_LIMITS.maxMessageChars} characters`
                    : undefined
                }
                value={draft}
                maxLength={CHAT_LIMITS.maxMessageChars}
                onChangeText={setDraft}
                placeholder="Message the chef…"
                placeholderTextColor={colors.labelTertiary}
                multiline
                className="max-h-28 min-h-11 flex-1 rounded-control border border-separator bg-surface-sunken px-4 py-3 text-body text-label"
              />
              {streaming ? (
                <IconButton
                  testID="chat-stop"
                  accessibilityLabel="Stop"
                  variant="filled"
                  icon={<Ionicons name="stop" size={18} color={colors.onBrand} />}
                  onPress={stop}
                />
              ) : (
                <IconButton
                  testID="chat-send"
                  accessibilityLabel="Send"
                  variant="filled"
                  disabled={!draft.trim()}
                  icon={<Icon name="arrowUp" size={20} color={colors.onBrand} />}
                  onPress={() => send()}
                />
              )}
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}
