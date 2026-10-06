import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import {
  Button,
  ErrorState,
  KeyboardAwareScrollView,
  Screen,
  Text,
  useKeyboardDoneBar,
} from '@chefer/ui-mobile';
import { FEEDBACK_MAX_LENGTH } from '@chefer/utils';
import {
  buildFeedbackContext,
  errorReportDraft,
  useFeedbackRoute,
} from '../features/feedback/feedback-context';
import { submitFeedbackStandalone } from '../features/feedback/standalone-submit';

type ReportStatus = 'idle' | 'sending' | 'sent' | 'failed';

/**
 * "Report this" (UX-PO-05): the crash screen was a dead end for a tester. The
 * message is pre-filled with the error; the build, OS and screen are attached
 * on send. The boundary replaces the root layout, so it sits outside the tRPC
 * providers — it submits through a standalone client.
 */
function ReportThis({ error }: { error: Error }) {
  const route = useFeedbackRoute();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(() => errorReportDraft(error));
  const [status, setStatus] = useState<ReportStatus>('idle');
  const done = useKeyboardDoneBar();

  if (status === 'sent') {
    return (
      <Text testID="root-error-report-sent" className="mt-4 text-center text-sm text-gray-700">
        Thank you. We got your report.
      </Text>
    );
  }
  if (!open) {
    return (
      <Button
        testID="root-error-report"
        variant="outline"
        className="mt-3"
        onPress={() => setOpen(true)}
      >
        Report this
      </Button>
    );
  }

  const send = async () => {
    setStatus('sending');
    try {
      await submitFeedbackStandalone(message, buildFeedbackContext(route));
      setStatus('sent');
    } catch (err) {
      console.error('[chefer] error report failed', err);
      setStatus('failed');
    }
  };

  return (
    <View className="mt-4 gap-2">
      <Text nativeID="root-error-report-label" variant="label">
        Add what you were doing
      </Text>
      <TextInput
        testID="root-error-report-input"
        value={message}
        onChangeText={setMessage}
        maxLength={FEEDBACK_MAX_LENGTH}
        accessibilityLabel="Add what you were doing"
        accessibilityLabelledBy="root-error-report-label"
        multiline
        inputAccessoryViewID={done.inputAccessoryViewID}
        className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground"
      />
      {done.bar}
      {status === 'failed' ? (
        <Text testID="root-error-report-failed" className="text-sm text-red-600">
          Couldn&apos;t send that. Check your connection and sign-in, then try again.
        </Text>
      ) : null}
      <Button
        testID="root-error-report-send"
        disabled={!message.trim()}
        loading={status === 'sending'}
        onPress={() => void send()}
      >
        Send report
      </Button>
    </View>
  );
}

/**
 * Exported as `ErrorBoundary` from app/_layout.tsx, so expo-router wraps every
 * route in it. Without it a render error anywhere took down the whole app in
 * release builds: expo-updates' error recovery rethrows an unhandled JS error
 * as a native crash (found while capturing App Store screenshots — a client
 * newer than its API crashed on the dashboard). The web equivalent is
 * apps/web/src/app/error.tsx.
 */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // The only trace of the error until mobile Sentry lands (M1-6).
  console.error('[chefer] render error', error);
  return (
    <Screen className="flex-1 bg-white px-6">
      {/* Scrolls, so the report field and Send stay clear of the keyboard. */}
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex-grow justify-center"
      >
        <ErrorState
          testID="root-error"
          title="Something went wrong"
          description="This screen hit an unexpected error. Nothing you saved has been lost."
          onRetry={() => void retry()}
        />
        <ReportThis error={error} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
