import { useState } from 'react';
import { ListRow, Sheet, showSnackbar, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { getTranslator, useT } from '../../../lib/i18n';
import { FeedbackCard } from '../../feedback/feedback-card';

// You → Help → "Send feedback" (10 Oct redesign). The form used to sit open on
// the You tab as a card; the board makes it a row like its Help neighbours.
// The row opens the SAME form (FeedbackCard: 2,000-character cap and counter,
// empty-Send guard, build/OS/route context, error line) in a Sheet — the
// pattern Gym settings already uses (GymFeedbackRow) — and the sheet closes
// with a thank-you snackbar once it is sent.
export function YouFeedbackRow() {
  const { t } = useT();
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  // Mounted on first open and kept, so the sheet still plays its exit motion (MO-02).
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <ListRow
        testID="you-feedback"
        title={t('settings.you.feedback')}
        icon={<Icon name="feedback" color={colors.brand} />}
        accessibilityHint={t('settings.you.feedbackHint')}
        onPress={() => {
          setMounted(true);
          setOpen(true);
        }}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('settings.you.feedback')}
        testID="you-feedback-sheet"
      >
        {mounted ? (
          <FeedbackCard
            bare
            onSent={() => {
              setOpen(false);
              showSnackbar({ message: getTranslator().t('settings.you.feedbackThanks') });
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}
