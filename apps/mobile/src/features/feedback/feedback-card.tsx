import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { Button, Card, Input, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { cn, FEEDBACK_MAX_LENGTH, feedbackCounter, userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { buildFeedbackContext, useFeedbackRoute } from './feedback-context';

// Beta feedback — mobile counterpart of web's FeedbackDialog (M2-10). The
// field is labelled and counts against the API's 2,000-character cap
// (F-PROF-2-2): it used to stop silently — or, here, fail on send.
// UX-PO-05: each submission carries the build, OS and current screen. `bare`
// drops the card chrome + heading so the form can live inside a Sheet (the
// Gym-mode entry); `onSent` lets that host close itself.
export function FeedbackCard({
  bare = false,
  initialMessage = '',
  onSent,
}: {
  bare?: boolean;
  initialMessage?: string;
  onSent?: () => void;
} = {}) {
  const [message, setMessage] = useState(initialMessage);
  const route = useFeedbackRoute();
  const submitMutation = trpc.feedback.submit.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setMessage('');
      onSent?.();
    },
  });
  const counter = feedbackCounter(message.length);
  // UX-ACC-25: on focus the field scrolls clear of the keyboard (no-op outside
  // a KeyboardAwareScrollView), keeping Send reachable right below it.
  const inputRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();

  return (
    <Card
      testID="feedback-card"
      className={cn('gap-2', bare && 'border-0 bg-transparent p-0 shadow-none')}
    >
      {bare ? null : <Text variant="heading">Feedback</Text>}
      <Text variant="muted" className="text-xs">
        Something broken, confusing, or missing? Tell us — it goes straight to the team.
      </Text>
      <Text nativeID="feedback-label" variant="label">
        Your feedback
      </Text>
      <Input
        testID="feedback-input"
        ref={inputRef}
        onFocus={() => scrollFieldIntoView(inputRef.current)}
        value={message}
        onChangeText={setMessage}
        maxLength={FEEDBACK_MAX_LENGTH}
        accessibilityLabel="Your feedback"
        accessibilityLabelledBy="feedback-label"
        accessibilityHint={counter.label}
        placeholder="What happened? What did you expect?"
        multiline
        className="min-h-20"
      />
      {/* Announced only near the cap, like web's aria-live="polite". */}
      <Text
        testID="feedback-counter"
        accessibilityLiveRegion={counter.tone === 'normal' ? 'none' : 'polite'}
        className={cn(
          'text-right text-xs tabular-nums',
          counter.tone === 'limit'
            ? 'text-red-600'
            : counter.tone === 'near'
              ? 'text-amber-700'
              : 'text-gray-600',
        )}
      >
        {counter.label}
      </Text>
      <Button
        testID="feedback-submit"
        variant="outline"
        // UX-ACC-25: an empty Send used to do nothing, silently.
        disabled={!message.trim() || submitMutation.isPending}
        loading={submitMutation.isPending}
        onPress={() => {
          if (message.trim()) {
            submitMutation.mutate({ message: message.trim(), ...buildFeedbackContext(route) });
          }
        }}
      >
        {submitMutation.isSuccess && !message ? 'Thank you! ✓' : 'Send feedback'}
      </Button>
      {submitMutation.isError && (
        <Text className="text-xs text-red-600">{userFacingErrorMessage(submitMutation.error)}</Text>
      )}
    </Card>
  );
}
