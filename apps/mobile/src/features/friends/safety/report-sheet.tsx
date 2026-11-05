import { useRef, useState } from 'react';
import { View } from 'react-native';
import { REPORT_REASONS, type ReportReason } from '@chefer/types';
import { Button, haptics, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import { track } from '../../../lib/analytics';
import { useT } from '../../../lib/i18n';
import { useReport } from './use-report';

// ─── Following: ReportSheet (UX §11.4, PRD §9, §16.12) ────────────────────────
// ONE tap on a reason submits — no note, no second confirm, and never a text
// input (reports are automatic; there's no human queue to read a note). The
// report ALSO blocks, server-side. While it sends, every reason is disabled
// and the tapped one spins. On error the sheet stays open with
// `Couldn’t send. Try again.` and nothing is blocked. On success the sheet
// closes, and only once it's gone (iOS: nothing may present or pop while a
// Modal dismisses) the snackbar shows (with `haptics.success`) and
// `onReported` runs — the caller navigates back to the previous non-profile
// screen.

export type ReportSheetPerson = {
  id: string;
  /** Full display name (accessibility hint). */
  displayName: string;
  /** First name (title, body, snackbar). */
  firstName: string;
};

export type ReportSheetProps = {
  visible: boolean;
  person: ReportSheetPerson;
  /** Reporting a recipe (recipe detail `…` → `Report recipe`). Omit to report the person. */
  recipeId?: string;
  onClose: () => void;
  /** After a successful report, once the sheet has fully exited. */
  onReported?: () => void;
  /** After every exit (e.g. return VoiceOver focus to the trigger). */
  onExited?: () => void;
  testID?: string;
};

const ANALYTICS_REASON: Record<
  ReportReason,
  'inappropriate' | 'spam' | 'harassment' | 'unsafe' | 'other'
> = {
  INAPPROPRIATE: 'inappropriate',
  SPAM: 'spam',
  HARASSMENT: 'harassment',
  UNSAFE: 'unsafe',
  OTHER: 'other',
};

export function ReportSheet({
  visible,
  person,
  recipeId,
  onClose,
  onReported,
  onExited,
  testID = 'friends-report-sheet',
}: ReportSheetProps) {
  const { t } = useT();
  const { report } = useReport();
  const snackbar = useSnackbar();
  const [sending, setSending] = useState<ReportReason | null>(null);
  const [failed, setFailed] = useState(false);
  const reported = useRef(false);

  const submit = async (reason: ReportReason) => {
    if (sending) return;
    setFailed(false);
    setSending(reason);
    const result = await report({
      userId: person.id,
      reason,
      ...(recipeId ? { recipeId } : {}),
    });
    setSending(null);
    if (!result.ok) {
      setFailed(true);
      haptics.error();
      return;
    }
    track('friend_reported', {
      target: recipeId ? 'recipe' : 'profile',
      reason: ANALYTICS_REASON[reason],
    });
    reported.current = true;
    onClose();
  };

  const close = () => {
    if (sending) return;
    setFailed(false);
    onClose();
  };

  const exited = () => {
    const done = reported.current;
    reported.current = false;
    setFailed(false);
    if (done) {
      // tone 'success' fires haptics.success and announces the message.
      snackbar.show({
        message: t('friends.report.done', { first: person.firstName }),
        tone: 'success',
      });
      onReported?.();
    }
    onExited?.();
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      onExited={exited}
      title={
        recipeId
          ? t('friends.report.titleRecipe')
          : t('friends.report.titleUser', { first: person.firstName })
      }
      testID={testID}
    >
      <Text testID={`${testID}-body`} variant="muted">
        {t('friends.report.body', { first: person.firstName })}
      </Text>
      <View className="gap-2" accessibilityRole="list">
        {REPORT_REASONS.map((reason) => (
          <Button
            key={reason}
            testID={`${testID}-reason-${reason}`}
            variant="outline"
            className="min-h-12 justify-start"
            loading={sending === reason}
            disabled={sending !== null}
            accessibilityLabel={t(`friends.report.reasons.${reason}`)}
            accessibilityHint={t('friends.report.reasonHint', { name: person.displayName })}
            onPress={() => void submit(reason)}
          >
            {t(`friends.report.reasons.${reason}`)}
          </Button>
        ))}
      </View>
      {failed ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-sm text-destructive"
        >
          {t('friends.report.error')}
        </Text>
      ) : null}
      <Button
        testID={`${testID}-cancel`}
        variant="ghost"
        size="lg"
        disabled={sending !== null}
        onPress={close}
      >
        {t('friends.common.cancel')}
      </Button>
    </Sheet>
  );
}
